/**
 * App Client
 * 
 * Communicates with the main Vercel app to fetch org configuration
 * and sync order state.
 */

import { createLogger } from '../utils/logger.js';
import { ServerConfig } from '../config.js';
import type { OrgConfig, MenuItem } from './session-manager.js';

const log = createLogger('app-client');

export class AppClient {
  private config: ServerConfig;
  private cache = new Map<string, { data: OrgConfig; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  
  constructor(config: ServerConfig) {
    this.config = config;
  }
  
  /**
   * Fetch org configuration from the main app
   */
  async getOrgConfig(orgId: string): Promise<OrgConfig | null> {
    // Check cache first
    const cached = this.cache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) {
      log.debug('Using cached org config', { orgId });
      return cached.data;
    }
    
    try {
      const url = `${this.config.appUrl}/api/realtime/org-config?orgId=${encodeURIComponent(orgId)}`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.config.internalApiKey) {
        headers['X-Internal-API-Key'] = this.config.internalApiKey;
      }
      
      log.info('Fetching org config', { orgId, url });
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        log.error('Failed to fetch org config', { 
          orgId, 
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }
      
      const data = await response.json() as OrgConfigResponse;
      
      const orgConfig: OrgConfig = {
        orgId: data.orgId,
        orgName: data.orgName,
        systemPrompt: data.systemPrompt || '',
        menu: data.menu || [],
        timezone: data.timezone || 'Australia/Perth',
      };
      
      // Cache the result
      this.cache.set(orgId, {
        data: orgConfig,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      
      log.info('Org config loaded', { 
        orgId, 
        orgName: orgConfig.orgName,
        menuItems: orgConfig.menu.length,
      });
      
      return orgConfig;
      
    } catch (error) {
      log.error('Error fetching org config', { orgId, error });
      return null;
    }
  }
  
  /**
   * Submit a confirmed order to the main app
   */
  async submitOrder(orderData: SubmitOrderRequest): Promise<SubmitOrderResponse> {
    try {
      const url = `${this.config.appUrl}/api/realtime/submit-order`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.config.internalApiKey) {
        headers['X-Internal-API-Key'] = this.config.internalApiKey;
      }
      
      log.info('Submitting order', { 
        orgId: orderData.orgId,
        customerName: orderData.customerName,
        itemCount: orderData.items.length,
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.error('Failed to submit order', { status: response.status, error });
        return {
          success: false,
          message: 'Failed to submit order',
        };
      }
      
      const result = await response.json() as SubmitOrderResponse;
      
      log.info('Order submitted', { 
        orderId: result.orderId,
        success: result.success,
      });
      
      return result;
      
    } catch (error) {
      log.error('Error submitting order', { error });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Clear cached config for an org
   */
  clearCache(orgId?: string): void {
    if (orgId) {
      this.cache.delete(orgId);
    } else {
      this.cache.clear();
    }
  }
}

// ============================================================================
// API Types
// ============================================================================

interface OrgConfigResponse {
  orgId: string;
  orgName: string;
  systemPrompt?: string;
  menu: MenuItem[];
  timezone?: string;
}

export interface SubmitOrderRequest {
  orgId: string;
  callSid: string;
  customerName: string;
  customerPhone: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }[];
  specialInstructions?: string;
  pickupTime?: string;
  total: number;
}

export interface SubmitOrderResponse {
  success: boolean;
  orderId?: string;
  message?: string;
  paymentUrl?: string;
}

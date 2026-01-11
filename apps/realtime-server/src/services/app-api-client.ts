/**
 * App API Client
 * 
 * Communicates with the main Next.js app for order submission
 * and other integrations.
 */

import { createLogger } from '../utils/logger.js';
import { loadConfig } from '../config.js';

const log = createLogger('app-api-client');

// ============================================================================
// Types
// ============================================================================

export interface OrderSubmission {
  orgId: string;
  sessionId: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  pickupTime?: string;
  specialInstructions?: string;
  totalAmount: number;
  channel: 'voice';
}

export interface OrderSubmissionResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

// ============================================================================
// API Client
// ============================================================================

class AppApiClient {
  private config = loadConfig();

  /**
   * Submit an order to the main app
   */
  async submitOrder(order: OrderSubmission): Promise<OrderSubmissionResult> {
    const endpoint = `${this.config.appUrl}/api/realtime/submit-order`;

    try {
      log.info('Submitting order to main app', {
        orgId: order.orgId,
        sessionId: order.sessionId,
        itemCount: order.items.length,
        total: order.totalAmount,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.config.internalApiKey,
        },
        body: JSON.stringify(order),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error('Order submission failed', {
          status: response.status,
          error: data.error,
        });
        return {
          success: false,
          error: (data.error as string) || `HTTP ${response.status}`,
        };
      }

      log.info('Order submitted successfully', {
        orderId: data.orderId,
        orgId: order.orgId,
      });

      return {
        success: true,
        orderId: data.orderId as string,
      };
    } catch (error) {
      log.error('Order submission error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orgId: order.orgId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Health check for the main app
   */
  async checkHealth(): Promise<boolean> {
    const endpoint = `${this.config.appUrl}/api/health`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'X-Internal-API-Key': this.config.internalApiKey,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const appApiClient = new AppApiClient();

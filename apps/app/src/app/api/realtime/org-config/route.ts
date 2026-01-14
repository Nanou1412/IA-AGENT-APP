/**
 * API endpoint to provide org configuration to the Realtime Voice Server
 * 
 * GET /api/realtime/org-config?orgId=xxx
 * 
 * Returns the org's menu, system prompt, and settings needed for voice AI.
 * 
 * SECURITY (F-003): In production, requires valid INTERNAL_API_KEY header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Internal API key for server-to-server communication
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Validate internal API key - SECURITY HARDENED
 * In production: ALWAYS require valid key
 * In development: Allow if no key configured
 */
function validateInternalApiKey(req: NextRequest): { valid: boolean; error?: string } {
  const providedKey = req.headers.get('x-internal-api-key');
  
  if (IS_PRODUCTION) {
    // Production: MUST have key configured (enforced at boot via env-validation)
    // and provided key MUST match
    if (!providedKey) {
      return { valid: false, error: 'Missing x-internal-api-key header' };
    }
    if (providedKey !== INTERNAL_API_KEY) {
      return { valid: false, error: 'Invalid API key' };
    }
    return { valid: true };
  }
  
  // Development: Allow if no key configured
  if (!INTERNAL_API_KEY) {
    return { valid: true };
  }
  
  // Development with key configured: require valid key
  if (!providedKey || providedKey !== INTERNAL_API_KEY) {
    return { valid: false, error: 'Invalid API key' };
  }
  
  return { valid: true };
}

export async function GET(req: NextRequest) {
  try {
    // Validate API key (SECURITY: F-003)
    const authResult = validateInternalApiKey(req);
    if (!authResult.valid) {
      console.warn('[realtime/org-config] Auth failed:', authResult.error);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get orgId from query
    const orgId = req.nextUrl.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing orgId parameter' },
        { status: 400 }
      );
    }
    
    // Fetch organization with settings
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      include: {
        settings: true,
      },
    });
    
    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }
    
    // Fetch assigned template
    const assignment = await prisma.agentAssignment.findFirst({
      where: { 
        orgId,
        status: 'active',
      },
      include: {
        template: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    const template = assignment?.template;
    
    // Fetch menu items from OrgSettings
    const settings = org.settings;
    let menu: MenuItem[] = [];
    
    if (settings?.menuConfig) {
      try {
        const menuConfig = settings.menuConfig as MenuConfig;
        menu = parseMenuFromConfig(menuConfig);
      } catch (e) {
        console.error('[realtime/org-config] Failed to parse menu:', e);
      }
    }
    
    // Build system prompt
    let systemPrompt = '';
    if (template?.systemPrompt) {
      systemPrompt = template.systemPrompt;
    }
    
    // Get timezone from org or default
    const timezone = org.timezone || process.env.DEFAULT_TIMEZONE || 'Australia/Perth';
    
    // Build response
    const response: OrgConfigResponse = {
      orgId: org.id,
      orgName: org.name,
      systemPrompt,
      menu,
      timezone,
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[realtime/org-config] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Types
// ============================================================================

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
}

interface MenuConfig {
  categories?: {
    name: string;
    items?: {
      id?: string;
      name: string;
      price: number;
      description?: string;
    }[];
  }[];
  items?: {
    id?: string;
    name: string;
    price: number;
    description?: string;
    category?: string;
  }[];
}

interface OrgConfigResponse {
  orgId: string;
  orgName: string;
  systemPrompt: string;
  menu: MenuItem[];
  timezone: string;
}

/**
 * Parse menu items from the org's menu configuration
 */
function parseMenuFromConfig(config: MenuConfig): MenuItem[] {
  const items: MenuItem[] = [];
  let idCounter = 1;
  
  // Parse items from categories
  if (config.categories) {
    for (const category of config.categories) {
      if (category.items) {
        for (const item of category.items) {
          items.push({
            id: item.id || `item-${idCounter++}`,
            name: item.name,
            price: item.price,
            description: item.description,
            category: category.name,
          });
        }
      }
    }
  }
  
  // Parse standalone items
  if (config.items) {
    for (const item of config.items) {
      items.push({
        id: item.id || `item-${idCounter++}`,
        name: item.name,
        price: item.price,
        description: item.description,
        category: item.category,
      });
    }
  }
  
  return items;
}

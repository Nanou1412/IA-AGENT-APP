/**
 * API endpoint to provide org configuration to the Realtime Voice Server
 * 
 * GET /api/realtime/org-config?orgId=xxx
 * 
 * Returns the org's menu, system prompt, and settings needed for voice AI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Internal API key for server-to-server communication
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * Validate internal API key if configured
 */
function validateInternalApiKey(req: NextRequest): boolean {
  if (!INTERNAL_API_KEY) {
    // No key configured, allow access (for development)
    return true;
  }
  
  const providedKey = req.headers.get('X-Internal-API-Key');
  return providedKey === INTERNAL_API_KEY;
}

export async function GET(req: NextRequest) {
  try {
    // Validate API key
    if (!validateInternalApiKey(req)) {
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
    
    // Fetch organization with settings and template
    const org = await prisma.organization.findUnique({
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
    const templateAssignment = await prisma.orgTemplateAssignment.findFirst({
      where: { orgId },
      include: {
        template: true,
      },
    });
    
    const template = templateAssignment?.template;
    
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
    
    // Get timezone from settings or default
    const timezone = settings?.timezone || process.env.DEFAULT_TIMEZONE || 'Australia/Perth';
    
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

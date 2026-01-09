/**
 * Cached Configuration Loaders
 * 
 * Provides cached access to org settings, voice config, and templates.
 * Reduces database queries from ~15 per request to ~1-2 on cache hit.
 */

import { prisma } from '@/lib/prisma';
import {
  cacheGetOrSet,
  orgSettingsKey,
  orgVoiceConfigKey,
  orgTemplateKey,
  orgMenuKey,
  CACHE_TTL,
} from '@/lib/cache';

// ============================================================================
// Types
// ============================================================================

export interface CachedOrgSettings {
  id: string;
  orgId: string;
  sandboxStatus: string;
  billingStatus: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  callQueueEnabled: boolean;
  callWelcomeText: string | null;
  callQueueWaitText: string | null;
  callDenyText: string | null;
  callHandoffNumber: string | null;
  recordCalls: boolean;
  messagingLocale: string;
  handoffPhone: string | null;
  handoffEmail: string | null;
  handoffSmsTo: string | null;
  handoffReplyText: string | null;
  faqText: string | null;
  aiModelOverride: string | null;
  takeawayConfig: unknown;
  takeawayPaymentConfig: unknown;
  menuConfig: unknown;
  bookingConfig: unknown;
  // Kill switch fields
  aiDisabled: boolean;
  smsDisabled: boolean;
  voiceDisabled: boolean;
  bookingDisabled: boolean;
  takeawayDisabled: boolean;
  paymentDisabled: boolean;
}

export interface CachedOrgContext {
  org: {
    id: string;
    name: string;
    industry: string;
    timezone: string;
    industryConfigId: string | null;
  };
  settings: CachedOrgSettings;
  industryConfig: {
    id: string;
    slug: string;
    rulesJson: unknown;
    modules: unknown;
  } | null;
}

export interface CachedTemplate {
  id: string;
  slug: string;
  version: string;
  title: string;
  systemPrompt: string;
  intentsAllowed: unknown;
  modulesDefault: unknown;
  definition: unknown;
}

// ============================================================================
// Cached Loaders
// ============================================================================

/**
 * Get org settings with caching
 */
export async function getCachedOrgSettings(orgId: string): Promise<CachedOrgSettings | null> {
  return cacheGetOrSet(
    orgSettingsKey(orgId),
    async () => {
      const settings = await prisma.orgSettings.findUnique({
        where: { orgId },
        select: {
          id: true,
          orgId: true,
          sandboxStatus: true,
          billingStatus: true,
          voiceEnabled: true,
          smsEnabled: true,
          whatsappEnabled: true,
          callQueueEnabled: true,
          callWelcomeText: true,
          callQueueWaitText: true,
          callDenyText: true,
          callHandoffNumber: true,
          recordCalls: true,
          messagingLocale: true,
          handoffPhone: true,
          handoffEmail: true,
          handoffSmsTo: true,
          handoffReplyText: true,
          faqText: true,
          aiModelOverride: true,
          takeawayConfig: true,
          takeawayPaymentConfig: true,
          menuConfig: true,
          bookingConfig: true,
          aiDisabled: true,
          smsDisabled: true,
          voiceDisabled: true,
          bookingDisabled: true,
          takeawayDisabled: true,
          paymentDisabled: true,
        },
      });

      if (!settings) return null;

      return {
        ...settings,
        sandboxStatus: settings.sandboxStatus as string,
        billingStatus: settings.billingStatus as string,
      };
    },
    CACHE_TTL.ORG_SETTINGS
  );
}

/**
 * Get full org context with caching (org + settings + industry)
 */
export async function getCachedOrgContext(orgId: string): Promise<CachedOrgContext | null> {
  const cacheKey = `org:${orgId}:context`;
  
  return cacheGetOrSet(
    cacheKey,
    async () => {
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          industry: true,
          timezone: true,
          industryConfigId: true,
          settings: {
            select: {
              id: true,
              orgId: true,
              sandboxStatus: true,
              billingStatus: true,
              voiceEnabled: true,
              smsEnabled: true,
              whatsappEnabled: true,
              callQueueEnabled: true,
              callWelcomeText: true,
              callQueueWaitText: true,
              callDenyText: true,
              callHandoffNumber: true,
              recordCalls: true,
              messagingLocale: true,
              handoffPhone: true,
              handoffEmail: true,
              handoffSmsTo: true,
              handoffReplyText: true,
              faqText: true,
              aiModelOverride: true,
              takeawayConfig: true,
              takeawayPaymentConfig: true,
              menuConfig: true,
              bookingConfig: true,
              aiDisabled: true,
              smsDisabled: true,
              voiceDisabled: true,
              bookingDisabled: true,
              takeawayDisabled: true,
              paymentDisabled: true,
            },
          },
          industryConfig: {
            select: {
              id: true,
              slug: true,
              rulesJson: true,
              modules: true,
            },
          },
        },
      });

      if (!org || !org.settings) return null;

      return {
        org: {
          id: org.id,
          name: org.name,
          industry: org.industry,
          timezone: org.timezone,
          industryConfigId: org.industryConfigId,
        },
        settings: {
          ...org.settings,
          sandboxStatus: org.settings.sandboxStatus as string,
          billingStatus: org.settings.billingStatus as string,
        },
        industryConfig: org.industryConfig,
      };
    },
    CACHE_TTL.ORG_SETTINGS
  );
}

/**
 * Get org template with caching
 */
export async function getCachedTemplate(orgId: string): Promise<CachedTemplate | null> {
  return cacheGetOrSet(
    orgTemplateKey(orgId),
    async () => {
      const assignment = await prisma.agentAssignment.findFirst({
        where: {
          orgId,
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          template: {
            select: {
              id: true,
              slug: true,
              version: true,
              title: true,
              systemPrompt: true,
              intentsAllowed: true,
              modulesDefault: true,
              definition: true,
            },
          },
        },
      });

      return assignment?.template || null;
    },
    CACHE_TTL.TEMPLATE
  );
}

/**
 * Get menu config with caching (for takeaway)
 */
export async function getCachedMenuConfig(orgId: string): Promise<unknown> {
  return cacheGetOrSet(
    orgMenuKey(orgId),
    async () => {
      const settings = await prisma.orgSettings.findUnique({
        where: { orgId },
        select: { menuConfig: true },
      });
      
      return settings?.menuConfig || null;
    },
    CACHE_TTL.MENU_CONFIG
  );
}

/**
 * Get voice config with caching
 */
export async function getCachedVoiceConfig(orgId: string): Promise<{
  voiceEnabled: boolean;
  callQueueEnabled: boolean;
  callWelcomeText: string | null;
  callDenyText: string | null;
  callHandoffNumber: string | null;
} | null> {
  return cacheGetOrSet(
    orgVoiceConfigKey(orgId),
    async () => {
      const settings = await prisma.orgSettings.findUnique({
        where: { orgId },
        select: {
          voiceEnabled: true,
          callQueueEnabled: true,
          callWelcomeText: true,
          callDenyText: true,
          callHandoffNumber: true,
        },
      });

      return settings || null;
    },
    CACHE_TTL.VOICE_CONFIG
  );
}

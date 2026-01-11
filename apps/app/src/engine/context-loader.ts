/**
 * Engine Context Loader
 * 
 * Loads all configuration needed for engine execution:
 * - Organization settings
 * - Industry configuration
 * - Agent template
 * 
 * Uses caching for performance optimization.
 */

import { getCachedOrgContext, getCachedTemplate } from '@/lib/cached-config';

// ============================================================================
// Types
// ============================================================================

export interface EngineContext {
  org: {
    id: string;
    name: string;
    industry: string;
    timezone: string;
    industryConfig?: {
      id: string;
      slug: string;
      rulesJson: unknown;
      modules: unknown;
    } | null;
  };
  settings: {
    id: string;
    orgId: string;
    sandboxStatus: string;
    billingStatus: string;
    voiceEnabled: boolean;
    smsEnabled: boolean;
    whatsappEnabled: boolean;
    faqText?: string | null;
    handoffPhone?: string | null;
    handoffEmail?: string | null;
    handoffSmsTo?: string | null;
    handoffReplyText?: string | null;
    aiModelOverride?: string | null;
    bookingConfig?: unknown;
    takeawayConfig?: unknown;
    takeawayPaymentConfig?: unknown;
    menuConfig?: unknown;
  };
  template: {
    id: string;
    slug: string;
    version: string;
    systemPrompt: string;
    intentsAllowed: unknown;
    modulesDefault: unknown;
    definition: unknown;
  } | null;
}

// ============================================================================
// Context Loading
// ============================================================================

/**
 * Load engine context (org, settings, template)
 * Uses caching to reduce database queries
 */
export async function loadEngineContext(orgId: string): Promise<EngineContext | null> {
  try {
    // Use cached org context (reduces ~3 DB queries to 1 on cache hit)
    const cachedContext = await getCachedOrgContext(orgId);

    if (!cachedContext) {
      console.error(`[context-loader] Org or settings not found: ${orgId}`);
      return null;
    }

    // Get template (also cached)
    const template = await getCachedTemplate(orgId);

    return {
      org: {
        id: cachedContext.org.id,
        name: cachedContext.org.name,
        industry: cachedContext.org.industry,
        timezone: cachedContext.org.timezone || 'Australia/Sydney',
        industryConfig: cachedContext.industryConfig ? {
          id: cachedContext.industryConfig.id,
          slug: cachedContext.industryConfig.slug,
          rulesJson: cachedContext.industryConfig.rulesJson,
          modules: cachedContext.industryConfig.modules,
        } : null,
      },
      settings: {
        id: cachedContext.settings.id,
        orgId: cachedContext.settings.orgId,
        sandboxStatus: cachedContext.settings.sandboxStatus,
        billingStatus: cachedContext.settings.billingStatus,
        voiceEnabled: cachedContext.settings.voiceEnabled,
        smsEnabled: cachedContext.settings.smsEnabled,
        whatsappEnabled: cachedContext.settings.whatsappEnabled,
        faqText: cachedContext.settings.faqText,
        handoffPhone: cachedContext.settings.handoffPhone,
        handoffEmail: cachedContext.settings.handoffEmail,
        handoffSmsTo: cachedContext.settings.handoffSmsTo,
        handoffReplyText: cachedContext.settings.handoffReplyText,
        aiModelOverride: cachedContext.settings.aiModelOverride,
        bookingConfig: cachedContext.settings.bookingConfig,
        takeawayConfig: cachedContext.settings.takeawayConfig,
        takeawayPaymentConfig: cachedContext.settings.takeawayPaymentConfig,
        menuConfig: cachedContext.settings.menuConfig,
      },
      template: template ? {
        id: template.id,
        slug: template.slug,
        version: template.version,
        systemPrompt: template.systemPrompt,
        intentsAllowed: template.intentsAllowed,
        modulesDefault: template.modulesDefault,
        definition: template.definition,
      } : null,
    };
  } catch (error) {
    console.error('[context-loader] Error loading context:', error);
    return null;
  }
}

/**
 * Check if engine is properly configured for an org
 */
export async function isEngineConfigured(orgId: string): Promise<boolean> {
  const context = await loadEngineContext(orgId);
  return context !== null;
}

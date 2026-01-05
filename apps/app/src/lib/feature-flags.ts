/**
 * Feature Flags
 * 
 * Global feature flags for production safety.
 * Phase 8: Production Readiness
 * 
 * Flags can be:
 * - Environment-based (quick disable via env var)
 * - DB-based (per-org kill switches)
 * 
 * Use cases:
 * - Emergency disable of AI engine
 * - Turn off payments during incident
 * - Disable SMS/Voice for cost control
 */

import { prisma } from '@/lib/prisma';
import { increment, METRIC_NAMES } from '@/lib/metrics';

// ============================================================================
// Types
// ============================================================================

export enum FeatureFlag {
  // Core features
  AI_ENGINE = 'AI_ENGINE',
  SMS_MESSAGING = 'SMS_MESSAGING',
  VOICE_CALLS = 'VOICE_CALLS',
  
  // Business features
  BOOKING = 'BOOKING',
  TAKEAWAY = 'TAKEAWAY',
  PAYMENT = 'PAYMENT',
  
  // Integrations
  STRIPE_PAYMENTS = 'STRIPE_PAYMENTS',
  TWILIO_INTEGRATION = 'TWILIO_INTEGRATION',
  GOOGLE_CALENDAR = 'GOOGLE_CALENDAR',
}

export interface FeatureFlagStatus {
  flag: FeatureFlag;
  enabled: boolean;
  reason?: string;
  source: 'env' | 'db' | 'default';
}

// ============================================================================
// Environment-based Flags (Global)
// ============================================================================

// Map env vars to feature flags
const ENV_FLAG_MAP: Record<FeatureFlag, string> = {
  [FeatureFlag.AI_ENGINE]: 'FEATURE_AI_ENGINE_ENABLED',
  [FeatureFlag.SMS_MESSAGING]: 'FEATURE_SMS_ENABLED',
  [FeatureFlag.VOICE_CALLS]: 'FEATURE_VOICE_ENABLED',
  [FeatureFlag.BOOKING]: 'FEATURE_BOOKING_ENABLED',
  [FeatureFlag.TAKEAWAY]: 'FEATURE_TAKEAWAY_ENABLED',
  [FeatureFlag.PAYMENT]: 'FEATURE_PAYMENT_ENABLED',
  [FeatureFlag.STRIPE_PAYMENTS]: 'FEATURE_STRIPE_ENABLED',
  [FeatureFlag.TWILIO_INTEGRATION]: 'FEATURE_TWILIO_ENABLED',
  [FeatureFlag.GOOGLE_CALENDAR]: 'FEATURE_GOOGLE_CALENDAR_ENABLED',
};

// Default values (all enabled by default)
const DEFAULT_FLAG_VALUES: Record<FeatureFlag, boolean> = {
  [FeatureFlag.AI_ENGINE]: true,
  [FeatureFlag.SMS_MESSAGING]: true,
  [FeatureFlag.VOICE_CALLS]: true,
  [FeatureFlag.BOOKING]: true,
  [FeatureFlag.TAKEAWAY]: true,
  [FeatureFlag.PAYMENT]: true,
  [FeatureFlag.STRIPE_PAYMENTS]: true,
  [FeatureFlag.TWILIO_INTEGRATION]: true,
  [FeatureFlag.GOOGLE_CALENDAR]: true,
};

/**
 * Check global feature flag (env-based)
 */
export function isGlobalFeatureEnabled(flag: FeatureFlag): boolean {
  const envVar = ENV_FLAG_MAP[flag];
  const envValue = process.env[envVar];
  
  if (envValue === undefined) {
    return DEFAULT_FLAG_VALUES[flag];
  }
  
  return envValue.toLowerCase() !== 'false' && envValue !== '0';
}

/**
 * Get status of all global feature flags
 */
export function getGlobalFeatureFlags(): FeatureFlagStatus[] {
  return Object.values(FeatureFlag).map(flag => ({
    flag,
    enabled: isGlobalFeatureEnabled(flag),
    source: process.env[ENV_FLAG_MAP[flag]] !== undefined ? 'env' : 'default',
  }));
}

// ============================================================================
// DB-based Kill Switches (Per-Org)
// ============================================================================

// Map feature flags to OrgSettings fields
const KILL_SWITCH_FIELD_MAP: Partial<Record<FeatureFlag, keyof OrgKillSwitches>> = {
  [FeatureFlag.AI_ENGINE]: 'aiDisabled',
  [FeatureFlag.SMS_MESSAGING]: 'smsDisabled',
  [FeatureFlag.VOICE_CALLS]: 'voiceDisabled',
  [FeatureFlag.BOOKING]: 'bookingDisabled',
  [FeatureFlag.TAKEAWAY]: 'takeawayDisabled',
  [FeatureFlag.PAYMENT]: 'paymentDisabled',
};

interface OrgKillSwitches {
  aiDisabled: boolean;
  smsDisabled: boolean;
  voiceDisabled: boolean;
  bookingDisabled: boolean;
  takeawayDisabled: boolean;
  paymentDisabled: boolean;
}

// Cache for org settings (TTL: 30s)
const orgSettingsCache = new Map<string, { data: OrgKillSwitches; expiry: number }>();
const CACHE_TTL_MS = 30000;

/**
 * Get kill switch settings for an org
 */
async function getOrgKillSwitches(orgId: string): Promise<OrgKillSwitches> {
  // Check cache
  const cached = orgSettingsCache.get(orgId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  
  // Query DB
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: {
      aiDisabled: true,
      smsDisabled: true,
      voiceDisabled: true,
      bookingDisabled: true,
      takeawayDisabled: true,
      paymentDisabled: true,
    },
  });
  
  const switches: OrgKillSwitches = {
    aiDisabled: settings?.aiDisabled ?? false,
    smsDisabled: settings?.smsDisabled ?? false,
    voiceDisabled: settings?.voiceDisabled ?? false,
    bookingDisabled: settings?.bookingDisabled ?? false,
    takeawayDisabled: settings?.takeawayDisabled ?? false,
    paymentDisabled: settings?.paymentDisabled ?? false,
  };
  
  // Update cache
  orgSettingsCache.set(orgId, {
    data: switches,
    expiry: Date.now() + CACHE_TTL_MS,
  });
  
  return switches;
}

/**
 * Check if a feature is enabled for a specific org
 * Combines global flags + org-specific kill switches
 */
export async function isFeatureEnabled(
  flag: FeatureFlag,
  orgId?: string
): Promise<FeatureFlagStatus> {
  // First check global flag
  if (!isGlobalFeatureEnabled(flag)) {
    return {
      flag,
      enabled: false,
      reason: 'Disabled globally via environment variable',
      source: 'env',
    };
  }
  
  // If no orgId or no DB field for this flag, return global status
  const killSwitchField = KILL_SWITCH_FIELD_MAP[flag];
  if (!orgId || !killSwitchField) {
    return {
      flag,
      enabled: true,
      source: 'default',
    };
  }
  
  // Check org-specific kill switch
  const switches = await getOrgKillSwitches(orgId);
  const isDisabled = switches[killSwitchField];
  
  if (isDisabled) {
    increment(METRIC_NAMES.FEATURE_DISABLED, { flag, orgId });
    
    return {
      flag,
      enabled: false,
      reason: 'Disabled via org kill switch',
      source: 'db',
    };
  }
  
  return {
    flag,
    enabled: true,
    source: 'default',
  };
}

/**
 * Quick check if feature is enabled (returns boolean only)
 */
export async function checkFeature(flag: FeatureFlag, orgId?: string): Promise<boolean> {
  const status = await isFeatureEnabled(flag, orgId);
  return status.enabled;
}

// ============================================================================
// Kill Switch Management
// ============================================================================

/**
 * Activate a kill switch for an org
 */
export async function activateKillSwitch(
  orgId: string,
  flag: FeatureFlag,
  activatedBy: string
): Promise<boolean> {
  const killSwitchField = KILL_SWITCH_FIELD_MAP[flag];
  if (!killSwitchField) {
    console.warn(`No kill switch field for flag: ${flag}`);
    return false;
  }
  
  // Update DB
  await prisma.orgSettings.update({
    where: { orgId },
    data: { [killSwitchField]: true },
  });
  
  // Invalidate cache
  orgSettingsCache.delete(orgId);
  
  // Log
  increment(METRIC_NAMES.KILL_SWITCH_ACTIVATED, { orgId, flag });
  
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: activatedBy,
      action: 'kill_switch.activated',
      details: { flag, field: killSwitchField },
    },
  });
  
  return true;
}

/**
 * Deactivate a kill switch for an org
 */
export async function deactivateKillSwitch(
  orgId: string,
  flag: FeatureFlag,
  deactivatedBy: string
): Promise<boolean> {
  const killSwitchField = KILL_SWITCH_FIELD_MAP[flag];
  if (!killSwitchField) {
    console.warn(`No kill switch field for flag: ${flag}`);
    return false;
  }
  
  // Update DB
  await prisma.orgSettings.update({
    where: { orgId },
    data: { [killSwitchField]: false },
  });
  
  // Invalidate cache
  orgSettingsCache.delete(orgId);
  
  // Log
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: deactivatedBy,
      action: 'kill_switch.deactivated',
      details: { flag, field: killSwitchField },
    },
  });
  
  return true;
}

/**
 * Get all kill switch statuses for an org
 */
export async function getOrgKillSwitchStatuses(orgId: string): Promise<{
  flag: FeatureFlag;
  field: string;
  disabled: boolean;
}[]> {
  const switches = await getOrgKillSwitches(orgId);
  
  return Object.entries(KILL_SWITCH_FIELD_MAP)
    .filter((entry): entry is [FeatureFlag, keyof OrgKillSwitches] => entry[1] !== undefined)
    .map(([flag, field]) => ({
      flag,
      field,
      disabled: switches[field],
    }));
}

/**
 * Clear cache for an org (useful after settings update)
 */
export function clearOrgSettingsCache(orgId: string): void {
  orgSettingsCache.delete(orgId);
}

/**
 * Clear all cache (useful for testing)
 */
export function clearAllOrgSettingsCache(): void {
  orgSettingsCache.clear();
}

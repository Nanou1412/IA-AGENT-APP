/**
 * Feature Gating - Centralized module access control
 * 
 * Determines what features/modules a user or organization can access
 * based on their sandbox status, billing, admin config, industry config, etc.
 * 
 * Phase 8: Added kill switch support
 */

import type { Org, OrgSettings, OrgOnboardingStep, IndustryConfig } from "@prisma/client";
import { SandboxStatus, OnboardingStepStatus, BillingStatus } from "@prisma/client";
import { 
  SANDBOX_REVIEW_THRESHOLD, 
  SENSITIVE_MODULES 
} from "./sandbox-constants";

// ============================================================================
// Types
// ============================================================================

/**
 * Reasons why a feature might be blocked
 */
export type BlockedByReason = 
  | 'sandbox'      // Sandbox not approved
  | 'billing'      // Billing/subscription issue
  | 'admin'        // Admin-disabled feature
  | 'config'       // Configuration missing (org level)
  | 'industry'     // Industry-level restriction (modules allowlist)
  | 'kill_switch'  // Kill switch activated (Phase 8)
  | 'unknown';     // Unknown reason

/**
 * Standardized output for all feature gating checks
 */
export interface FeatureGateResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Category of blocker (if blocked) */
  blockedBy?: BlockedByReason;
  /** What actions/conditions would unblock this (if blocked) */
  requires?: string[];
}

/**
 * Full org context needed for feature gating decisions
 */
export interface OrgContext {
  org: Org & { industryConfig?: IndustryConfig | null };
  settings: OrgSettings | null;
  onboardingSteps?: OrgOnboardingStep[];
}

/**
 * Extended org context with explicit industry config for canUseModule
 */
export interface OrgContextWithIndustry extends OrgContext {
  industryConfig?: IndustryConfig | null;
}

/**
 * Industry modules configuration structure
 */
export interface IndustryModulesConfig {
  sms?: boolean;
  whatsapp?: boolean;
  voice?: boolean;
  payment?: boolean;
  [key: string]: boolean | undefined;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Check if a module is considered sensitive (requires sandbox approval)
 */
export function isSensitiveModule(module: string): boolean {
  return SENSITIVE_MODULES.includes(module as typeof SENSITIVE_MODULES[number]);
}

/**
 * Parse and validate industry modules configuration
 */
function parseIndustryModules(modulesJson: unknown): IndustryModulesConfig {
  if (!modulesJson || typeof modulesJson !== 'object') {
    // Default: all modules allowed except voice
    return { sms: true, whatsapp: true, voice: false, payment: true };
  }
  return modulesJson as IndustryModulesConfig;
}

/**
 * Check if a module is allowed by industry configuration
 */
export function isModuleAllowedByIndustry(
  industryConfig: { modules?: unknown } | null | undefined,
  module: string
): boolean {
  if (!industryConfig?.modules) {
    // No industry config or no modules field = allow all
    return true;
  }

  const modules = parseIndustryModules(industryConfig.modules);
  const moduleValue = modules[module];

  // If module not specified in config, default to true (allowed)
  return moduleValue !== false;
}

/**
 * Calculate the percentage of completed onboarding steps
 */
export function calculateOnboardingProgress(steps: OrgOnboardingStep[]): number {
  if (steps.length === 0) return 0;
  
  const completed = steps.filter(
    s => s.status === OnboardingStepStatus.done
  ).length;
  
  return completed / steps.length;
}

/**
 * Check if an org has completed enough onboarding to request review
 */
export function hasMetReviewThreshold(steps: OrgOnboardingStep[]): boolean {
  const progress = calculateOnboardingProgress(steps);
  return progress >= SANDBOX_REVIEW_THRESHOLD;
}

// ============================================================================
// Core Feature Gating
// ============================================================================

/**
 * Check if a module/feature is accessible for an organization
 * 
 * Decision hierarchy for SENSITIVE modules:
 * 1. Non-sensitive modules → always allowed
 * 2. Industry config blocks module → blocked (industry restriction)
 * 3. Sandbox not approved → blocked (sandbox required)
 * 4. Sandbox approved BUT billing not active → blocked (billing required)
 * 5. Sandbox approved AND billing active → allowed
 * 6. Sandbox revoked → blocked (admin action required)
 */
export function canUseModule(
  module: string,
  context: OrgContextWithIndustry
): FeatureGateResult {
  const { org, settings, industryConfig } = context;
  
  // Non-sensitive modules are always accessible
  if (!isSensitiveModule(module)) {
    return {
      allowed: true,
      reason: "Module accessible sans restrictions"
    };
  }
  
  // Check if module is allowed by industry config
  if (!isModuleAllowedByIndustry(industryConfig, module)) {
    return {
      allowed: false,
      reason: `This module is not available for your industry (${industryConfig?.title || 'unknown'}). Contact support for more information.`,
      blockedBy: 'industry',
      requires: ['contact_support', 'industry_upgrade']
    };
  }
  
  // Check sandbox status for sensitive modules
  const sandboxStatus = settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  const billingStatus = settings?.billingStatus ?? BillingStatus.inactive;
  
  // First check sandbox status
  switch (sandboxStatus) {
    case SandboxStatus.approved:
      // Sandbox approved - now check billing
      break; // Continue to billing check below
      
    case SandboxStatus.revoked:
      return {
        allowed: false,
        reason: "Accès révoqué par l'administrateur. Contactez le support pour rétablir l'accès.",
        blockedBy: 'admin',
        requires: ['contact_support', 'admin_reinstatement']
      };
      
    case SandboxStatus.sandbox_required:
      return {
        allowed: false,
        reason: "Vous devez d'abord démarrer le cycle sandbox pour accéder à ce module.",
        blockedBy: 'sandbox',
        requires: ['start_sandbox']
      };
      
    case SandboxStatus.sandbox_in_progress:
      return {
        allowed: false,
        reason: "Complétez les étapes d'onboarding et demandez une review pour débloquer ce module.",
        blockedBy: 'sandbox',
        requires: ['complete_onboarding', 'request_review']
      };
      
    case SandboxStatus.ready_for_review:
      return {
        allowed: false,
        reason: "Votre demande est en cours de review. Patientez quelques jours ouvrés.",
        blockedBy: 'sandbox',
        requires: ['wait_for_approval']
      };
      
    default:
      // Unknown status - fail safe by blocking
      return {
        allowed: false,
        reason: "Statut sandbox inconnu. Contactez le support.",
        blockedBy: 'unknown',
        requires: ['contact_support']
      };
  }
  
  // Sandbox is approved - now check billing status
  switch (billingStatus) {
    case BillingStatus.active:
      // All checks passed - module is accessible
      return {
        allowed: true,
        reason: "Sandbox approuvé et abonnement actif. Module accessible."
      };
      
    case BillingStatus.inactive:
      return {
        allowed: false,
        reason: "Vous devez activer votre abonnement pour utiliser ce module en production.",
        blockedBy: 'billing',
        requires: ['activate_subscription']
      };
      
    case BillingStatus.incomplete:
      return {
        allowed: false,
        reason: "Votre paiement est en cours de traitement. Veuillez patienter ou compléter le checkout.",
        blockedBy: 'billing',
        requires: ['complete_checkout']
      };
      
    case BillingStatus.past_due:
      return {
        allowed: false,
        reason: "Votre paiement a échoué. Mettez à jour vos informations de paiement pour continuer.",
        blockedBy: 'billing',
        requires: ['update_payment_method']
      };
      
    case BillingStatus.canceled:
      return {
        allowed: false,
        reason: "Votre abonnement a été annulé. Réactivez-le pour utiliser ce module.",
        blockedBy: 'billing',
        requires: ['reactivate_subscription']
      };
      
    default:
      return {
        allowed: false,
        reason: "Statut de facturation inconnu. Contactez le support.",
        blockedBy: 'unknown',
        requires: ['contact_support']
      };
  }
}

/**
 * Check if an organization can request a sandbox review
 * 
 * Requirements:
 * 1. Sandbox must be in progress
 * 2. Must have completed at least SANDBOX_REVIEW_THRESHOLD (80%) of onboarding steps
 */
export function canRequestReview(context: OrgContext): FeatureGateResult {
  const { settings, onboardingSteps = [] } = context;
  const sandboxStatus = settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  
  // Must be in sandbox_in_progress state
  if (sandboxStatus !== SandboxStatus.sandbox_in_progress) {
    // Build appropriate message based on current status
    switch (sandboxStatus) {
      case SandboxStatus.sandbox_required:
        return {
          allowed: false,
          reason: "Vous devez d'abord démarrer le sandbox.",
          blockedBy: 'sandbox',
          requires: ['start_sandbox']
        };
        
      case SandboxStatus.ready_for_review:
        return {
          allowed: false,
          reason: "Une demande de review est déjà en cours.",
          blockedBy: 'sandbox'
        };
        
      case SandboxStatus.approved:
        return {
          allowed: false,
          reason: "Votre sandbox est déjà approuvé.",
          blockedBy: 'sandbox'
        };
        
      case SandboxStatus.revoked:
        return {
          allowed: false,
          reason: "Votre accès a été révoqué. Contactez le support.",
          blockedBy: 'admin',
          requires: ['contact_support']
        };
        
      default:
        return {
          allowed: false,
          reason: "Statut sandbox invalide pour demander une review.",
          blockedBy: 'unknown'
        };
    }
  }
  
  // Check onboarding progress
  const progress = calculateOnboardingProgress(onboardingSteps);
  const thresholdPercent = Math.round(SANDBOX_REVIEW_THRESHOLD * 100);
  const progressPercent = Math.round(progress * 100);
  
  if (progress < SANDBOX_REVIEW_THRESHOLD) {
    const stepsNeeded = Math.ceil(
      onboardingSteps.length * SANDBOX_REVIEW_THRESHOLD - 
      onboardingSteps.filter(s => s.status === OnboardingStepStatus.done).length
    );
    
    return {
      allowed: false,
      reason: `Vous devez compléter au moins ${thresholdPercent}% des étapes d'onboarding. ` +
              `Progression actuelle: ${progressPercent}%. ` +
              `Il vous reste ${stepsNeeded} étape(s) à terminer.`,
      blockedBy: 'sandbox',
      requires: ['complete_onboarding_steps']
    };
  }
  
  return {
    allowed: true,
    reason: `Vous avez complété ${progressPercent}% des étapes. Vous pouvez demander une review.`
  };
}

/**
 * Check if an organization can start the sandbox process
 */
export function canStartSandbox(context: OrgContext): FeatureGateResult {
  const { settings } = context;
  const sandboxStatus = settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  
  if (sandboxStatus !== SandboxStatus.sandbox_required) {
    switch (sandboxStatus) {
      case SandboxStatus.sandbox_in_progress:
        return {
          allowed: false,
          reason: "Le sandbox est déjà en cours.",
          blockedBy: 'sandbox'
        };
        
      case SandboxStatus.ready_for_review:
        return {
          allowed: false,
          reason: "Le sandbox est en attente de review.",
          blockedBy: 'sandbox'
        };
        
      case SandboxStatus.approved:
        return {
          allowed: false,
          reason: "Le sandbox est déjà approuvé.",
          blockedBy: 'sandbox'
        };
        
      case SandboxStatus.revoked:
        return {
          allowed: false,
          reason: "L'accès a été révoqué. Contactez le support pour réactiver.",
          blockedBy: 'admin',
          requires: ['contact_support']
        };
        
      default:
        return {
          allowed: false,
          reason: "Statut sandbox invalide.",
          blockedBy: 'unknown'
        };
    }
  }
  
  return {
    allowed: true,
    reason: "Vous pouvez démarrer le cycle sandbox."
  };
}

/**
 * Get a summary of what modules are accessible for an org
 */
export function getModuleAccessSummary(
  context: OrgContext
): Record<string, FeatureGateResult> {
  const result: Record<string, FeatureGateResult> = {};
  
  // Check all sensitive modules
  for (const module of SENSITIVE_MODULES) {
    result[module] = canUseModule(module, context);
  }
  
  return result;
}

/**
 * Quick check if any sensitive module is accessible
 * Requires both sandbox approved AND billing active
 */
export function hasSensitiveModuleAccess(context: OrgContext): boolean {
  const sandboxStatus = context.settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  const billingStatus = context.settings?.billingStatus ?? BillingStatus.inactive;
  
  return sandboxStatus === SandboxStatus.approved && billingStatus === BillingStatus.active;
}

// ============================================================================
// Booking-Specific Gating
// ============================================================================

/**
 * Booking config for sandbox test mode check
 */
interface BookingSandboxConfig {
  sandboxTestMode?: boolean;
  sandboxCalendarId?: string;
}

/**
 * Check if booking module is accessible, with sandbox test mode support
 * 
 * This extends the standard canUseModule with special handling:
 * - If sandboxTestMode is true in bookingConfig, allows booking even in sandbox
 * - In sandbox test mode, uses sandboxCalendarId if provided
 * 
 * @param context - Org context for feature gating
 * @param bookingSandboxConfig - Booking sandbox configuration from OrgSettings
 */
export function canUseBookingModule(
  context: OrgContextWithIndustry,
  bookingSandboxConfig?: BookingSandboxConfig
): FeatureGateResult & { isSandboxTestMode?: boolean; sandboxCalendarId?: string } {
  const { settings } = context;
  const sandboxStatus = settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  
  // Check if sandbox test mode is enabled
  const sandboxTestMode = bookingSandboxConfig?.sandboxTestMode === true;
  
  // If in sandbox and sandboxTestMode is enabled, allow with flag
  if (sandboxTestMode && sandboxStatus === SandboxStatus.sandbox_in_progress) {
    return {
      allowed: true,
      reason: "Booking module accessible en mode test sandbox.",
      isSandboxTestMode: true,
      sandboxCalendarId: bookingSandboxConfig?.sandboxCalendarId,
    };
  }
  
  // Otherwise, fall back to standard module gating
  const standardResult = canUseModule('booking', context);
  
  return {
    ...standardResult,
    isSandboxTestMode: false,
  };
}

// ============================================================================
// Kill Switch Support (Phase 8)
// ============================================================================

/**
 * Map of module names to OrgSettings kill switch fields
 */
const KILL_SWITCH_MAP: Record<string, keyof Pick<OrgSettings, 
  'aiDisabled' | 'smsDisabled' | 'voiceDisabled' | 
  'bookingDisabled' | 'takeawayDisabled' | 'paymentDisabled'
>> = {
  'sms': 'smsDisabled',
  'whatsapp': 'smsDisabled', // WhatsApp uses SMS kill switch
  'voice': 'voiceDisabled',
  'booking': 'bookingDisabled',
  'takeaway': 'takeawayDisabled',
  'payment': 'paymentDisabled',
  // AI engine is checked separately via global feature flag
};

/**
 * Check if a module is disabled via kill switch
 * Used for quick sync checks when settings are already loaded
 */
export function isModuleKillSwitched(
  module: string,
  settings: OrgSettings | null
): boolean {
  if (!settings) return false;
  
  const killSwitchField = KILL_SWITCH_MAP[module];
  if (!killSwitchField) return false;
  
  return (settings[killSwitchField] as boolean) === true;
}

/**
 * Extended canUseModule that includes kill switch check
 * Use this when settings are already loaded in context
 */
export function canUseModuleWithKillSwitch(
  module: string,
  context: OrgContextWithIndustry
): FeatureGateResult {
  const { settings } = context;
  
  // Check kill switch first (fastest path to block)
  if (isModuleKillSwitched(module, settings)) {
    return {
      allowed: false,
      reason: "Ce module a été temporairement désactivé. Contactez le support si vous pensez que c'est une erreur.",
      blockedBy: 'kill_switch',
      requires: ['contact_support', 'wait_for_reactivation'],
    };
  }
  
  // Delegate to standard canUseModule
  return canUseModule(module, context);
}

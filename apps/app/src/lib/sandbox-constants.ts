/**
 * Sandbox Constants
 * Centralized configuration for sandbox and onboarding behavior
 * 
 * DO NOT duplicate these values in other files - import from here.
 */

import type { SandboxStatus, OnboardingStepStatus, SensitiveModulesStatus } from '@prisma/client';

// ============================================
// THRESHOLDS
// ============================================

/**
 * Minimum completion ratio required to request production review
 * Value: 0.8 = 80% of steps must be completed
 */
export const SANDBOX_REVIEW_THRESHOLD = 0.8;

/**
 * Get threshold as percentage (for display)
 */
export const SANDBOX_REVIEW_THRESHOLD_PERCENT = Math.ceil(SANDBOX_REVIEW_THRESHOLD * 100);

// ============================================
// SANDBOX STATUS DEFINITIONS
// ============================================

/**
 * All valid sandbox status values (mirrors Prisma enum)
 */
export const SANDBOX_STATUSES: SandboxStatus[] = [
  'sandbox_required',
  'sandbox_in_progress',
  'ready_for_review',
  'approved',
  'revoked',
] as const;

/**
 * Type guard to check if a string is a valid SandboxStatus
 */
export function isValidSandboxStatus(status: string): status is SandboxStatus {
  return SANDBOX_STATUSES.includes(status as SandboxStatus);
}

/**
 * Sandbox status display configuration
 */
export const SANDBOX_STATUS_CONFIG: Record<SandboxStatus, {
  label: string;
  color: string;
  icon: string;
  description: string;
}> = {
  sandbox_required: {
    label: 'Sandbox Required',
    color: 'bg-yellow-100 text-yellow-800',
    icon: '⚠️',
    description: 'Start your sandbox to begin testing',
  },
  sandbox_in_progress: {
    label: 'Sandbox In Progress',
    color: 'bg-blue-100 text-blue-800',
    icon: '🧪',
    description: 'Complete the onboarding steps to request production access',
  },
  ready_for_review: {
    label: 'Pending Review',
    color: 'bg-purple-100 text-purple-800',
    icon: '⏳',
    description: 'Your application is being reviewed by our team',
  },
  approved: {
    label: 'Production Active',
    color: 'bg-green-100 text-green-800',
    icon: '✅',
    description: 'Your AI agent is live and serving customers',
  },
  revoked: {
    label: 'Access Revoked',
    color: 'bg-red-100 text-red-800',
    icon: '🚫',
    description: 'Production access has been revoked. Contact support.',
  },
};

/**
 * Get status config with fallback for unknown status
 */
export function getSandboxStatusConfig(status: string) {
  if (isValidSandboxStatus(status)) {
    return SANDBOX_STATUS_CONFIG[status];
  }
  console.error(`[sandbox-constants] Unknown sandbox status: ${status}`);
  return {
    label: 'Unknown Status',
    color: 'bg-gray-100 text-gray-800',
    icon: '❓',
    description: 'Unknown status - please contact support',
  };
}

// ============================================
// ONBOARDING STEP STATUS DEFINITIONS
// ============================================

/**
 * All valid onboarding step status values (mirrors Prisma enum)
 */
export const ONBOARDING_STEP_STATUSES: OnboardingStepStatus[] = [
  'todo',
  'in_progress',
  'done',
  'blocked',
] as const;

/**
 * Type guard to check if a string is a valid OnboardingStepStatus
 */
export function isValidOnboardingStepStatus(status: string): status is OnboardingStepStatus {
  return ONBOARDING_STEP_STATUSES.includes(status as OnboardingStepStatus);
}

/**
 * Onboarding step status display configuration
 */
export const ONBOARDING_STEP_STATUS_CONFIG: Record<OnboardingStepStatus, {
  label: string;
  color: string;
  icon: string;
}> = {
  todo: {
    label: 'To Do',
    color: 'bg-gray-100 text-gray-800',
    icon: '⬜',
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800',
    icon: '🔄',
  },
  done: {
    label: 'Done',
    color: 'bg-green-100 text-green-800',
    icon: '✅',
  },
  blocked: {
    label: 'Blocked',
    color: 'bg-red-100 text-red-800',
    icon: '🚫',
  },
};

// ============================================
// SENSITIVE MODULES STATUS DEFINITIONS
// ============================================

/**
 * All valid sensitive modules status values (mirrors Prisma enum)
 */
export const SENSITIVE_MODULES_STATUSES: SensitiveModulesStatus[] = [
  'disabled',
  'pending_review',
  'enabled',
] as const;

/**
 * Sensitive modules status display configuration
 */
export const SENSITIVE_MODULES_STATUS_CONFIG: Record<SensitiveModulesStatus, {
  label: string;
  color: string;
}> = {
  disabled: {
    label: 'Disabled',
    color: 'bg-gray-100 text-gray-800',
  },
  pending_review: {
    label: 'Pending Review',
    color: 'bg-yellow-100 text-yellow-800',
  },
  enabled: {
    label: 'Enabled',
    color: 'bg-green-100 text-green-800',
  },
};

// ============================================
// STEP LABELS (generic, not industry-specific)
// ============================================

/**
 * Human-readable labels for onboarding step keys
 */
export const ONBOARDING_STEP_LABELS: Record<string, string> = {
  sandbox_intro_seen: 'Welcome Complete',
  business_profile: 'Business Profile',
  handoff_contact: 'Handoff Contact',
  test_conversation: 'Test Conversation',
  review_request: 'Request Review',
};

/**
 * Get step label with fallback
 */
export function getStepLabel(stepKey: string): string {
  return ONBOARDING_STEP_LABELS[stepKey] || stepKey;
}

// ============================================
// DEFAULT FALLBACK STEPS
// ============================================

/**
 * Fallback onboarding steps if IndustryConfig has none defined
 */
export const DEFAULT_ONBOARDING_STEPS = [
  'sandbox_intro_seen',
  'business_profile',
  'handoff_contact',
  'review_request',
] as const;

// ============================================
// SENSITIVE MODULES LIST
// ============================================

/**
 * List of modules that require sandbox approval before use
 * These modules have access to sensitive channels (voice, SMS, etc.)
 */
export const SENSITIVE_MODULES = [
  'voice',
  'sms',
  'whatsapp',
  'payment',
  'booking', // Phase 7.1 - Calendar booking (requires Google integration)
  'takeaway', // Phase 7.2 - Takeaway orders (sends SMS/WhatsApp notifications)
] as const;

export type SensitiveModule = typeof SENSITIVE_MODULES[number];

/**
 * Check if a module name is in the sensitive modules list
 */
export function isSensitiveModule(module: string): module is SensitiveModule {
  return SENSITIVE_MODULES.includes(module as SensitiveModule);
}

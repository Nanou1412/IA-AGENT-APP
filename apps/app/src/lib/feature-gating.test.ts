/**
 * Feature Gating - Unit Tests
 * 
 * Tests for canUseModule billing integration + industry gating
 */

import { describe, it, expect } from 'vitest';
import { canUseModule, isSensitiveModule, isModuleAllowedByIndustry } from '@/lib/feature-gating';
import { SandboxStatus, BillingStatus, SensitiveModulesStatus } from '@prisma/client';
import type { OrgContextWithIndustry } from '@/lib/feature-gating';

// Helper to create test context
function createContext(overrides: {
  sandboxStatus?: SandboxStatus;
  billingStatus?: BillingStatus;
  industryConfig?: { id: string; title: string; modules?: Record<string, boolean> } | null;
} = {}): OrgContextWithIndustry {
  return {
    org: {
      id: 'org_test',
      name: 'Test Org',
      industry: 'real_estate',
      timezone: 'Europe/Paris',
      industryConfigId: overrides.industryConfig?.id || null,
      stripeAccountId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    settings: {
      id: 'settings_test',
      orgId: 'org_test',
      sandboxStatus: overrides.sandboxStatus ?? SandboxStatus.sandbox_required,
      billingStatus: overrides.billingStatus ?? BillingStatus.inactive,
      sensitiveModulesStatus: SensitiveModulesStatus.disabled,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      setupFeePaidAt: null,
      currentPeriodEnd: null,
      smsEnabled: false,
      whatsappEnabled: false,
      // New hardening fields
      messagingLocale: 'en-AU',
      defaultInboundReplyText: null,
      deniedReplyText: null,
      handoffReplyText: null,
      handoffPhone: null,
      handoffEmail: null,
      handoffSmsTo: null,
      // Voice fields (Phase 5)
      voiceEnabled: false,
      callQueueEnabled: true,
      callWelcomeText: null,
      callQueueWaitText: null,
      callDenyText: null,
      callHandoffNumber: null,
      recordCalls: false,
      // Engine fields (Phase 6)
      faqText: null,
      aiModelOverride: null,
      // Booking fields (Phase 7.1)
      bookingConfig: null,
      // Takeaway fields (Phase 7.2)
      takeawayConfig: null,
      // Payment fields (Phase 7.3)
      takeawayPaymentConfig: null,
      // Menu config
      menuConfig: null,
      // Phase 8: Production Readiness
      monthlyAiBudgetUsd: 50,
      monthlyTwilioBudgetUsd: 30,
      hardBudgetLimit: true,
      maxEngineRunsPerMinute: 60,
      maxMessagesPerMinute: 30,
      aiDisabled: false,
      smsDisabled: false,
      voiceDisabled: false,
      bookingDisabled: false,
      takeawayDisabled: false,
      paymentDisabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    industryConfig: overrides.industryConfig ? {
      id: overrides.industryConfig.id,
      title: overrides.industryConfig.title,
      slug: overrides.industryConfig.title.toLowerCase().replace(' ', '_'),
      rulesJson: {},
      defaultTemplateSlug: null,
      defaultTemplateVersion: null,
      onboardingSteps: [],
      modules: overrides.industryConfig.modules || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } : null,
  };
}

describe('isSensitiveModule', () => {
  it('identifies sensitive modules', () => {
    expect(isSensitiveModule('voice')).toBe(true);
    expect(isSensitiveModule('sms')).toBe(true);
    expect(isSensitiveModule('whatsapp')).toBe(true);
    expect(isSensitiveModule('payment')).toBe(true);
  });

  it('identifies non-sensitive modules', () => {
    expect(isSensitiveModule('dashboard')).toBe(false);
    expect(isSensitiveModule('settings')).toBe(false);
    expect(isSensitiveModule('profile')).toBe(false);
  });
});

describe('canUseModule - Feature Gating with Billing', () => {
  describe('Non-sensitive modules', () => {
    it('allows access to non-sensitive modules regardless of status', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.sandbox_required,
        billingStatus: BillingStatus.inactive,
      });

      const result = canUseModule('dashboard', context);
      
      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });
  });

  describe('Sandbox blocking (before billing check)', () => {
    it('blocks sensitive modules when sandbox_required', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.sandbox_required,
        billingStatus: BillingStatus.inactive,
      });

      const result = canUseModule('voice', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('sandbox');
    });

    it('blocks sensitive modules when sandbox_in_progress', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.sandbox_in_progress,
        billingStatus: BillingStatus.inactive,
      });

      const result = canUseModule('sms', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('sandbox');
    });

    it('blocks sensitive modules when ready_for_review', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.ready_for_review,
        billingStatus: BillingStatus.inactive,
      });

      const result = canUseModule('whatsapp', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('sandbox');
    });

    it('blocks sensitive modules when sandbox revoked', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.revoked,
        billingStatus: BillingStatus.active,
      });

      const result = canUseModule('voice', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('admin');
    });
  });

  describe('Billing blocking (after sandbox approved)', () => {
    it('blocks when sandbox approved but billing inactive', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.inactive,
      });

      const result = canUseModule('voice', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('billing');
    });

    it('blocks when sandbox approved but billing incomplete', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.incomplete,
      });

      const result = canUseModule('sms', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('billing');
    });

    it('blocks when sandbox approved but billing past_due', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.past_due,
      });

      const result = canUseModule('whatsapp', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('billing');
    });

    it('blocks when sandbox approved but billing canceled', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.canceled,
      });

      const result = canUseModule('voice', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('billing');
    });
  });

  describe('Full access (sandbox approved + billing active)', () => {
    it('allows access when both sandbox approved and billing active', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.active,
      });

      const result = canUseModule('voice', context);
      
      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    it('allows access to all sensitive modules with full status', () => {
      const context = createContext({
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.active,
      });

      expect(canUseModule('voice', context).allowed).toBe(true);
      expect(canUseModule('sms', context).allowed).toBe(true);
      expect(canUseModule('whatsapp', context).allowed).toBe(true);
      expect(canUseModule('payment', context).allowed).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles null settings gracefully', () => {
      const context: OrgContextWithIndustry = {
        org: {
          id: 'org_test',
          name: 'Test Org',
          industry: 'real_estate',
          timezone: 'Europe/Paris',
          industryConfigId: null,
          stripeAccountId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        settings: null,
        industryConfig: null,
      };

      const result = canUseModule('voice', context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('sandbox');
    });
  });
});

// ============================================================================
// Industry Gating Tests
// ============================================================================

describe('isModuleAllowedByIndustry', () => {
  it('allows module when no industry config', () => {
    const result = isModuleAllowedByIndustry(null, 'sms');
    expect(result).toBe(true);
  });

  it('allows module when industry config has no modules defined', () => {
    const config = {
      id: 'ind_1',
      title: "Real Estate",
      slug: 'real_estate',
      rulesJson: {},
      defaultTemplateSlug: null,
      defaultTemplateVersion: null,
      onboardingSteps: [],
      modules: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = isModuleAllowedByIndustry(config, 'sms');
    expect(result).toBe(true);
  });

  it('allows module when explicitly set to true', () => {
    const config = {
      id: 'ind_1',
      title: "Real Estate",
      slug: 'real_estate',
      rulesJson: {},
      defaultTemplateSlug: null,
      defaultTemplateVersion: null,
      onboardingSteps: [],
      modules: { sms: true, whatsapp: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = isModuleAllowedByIndustry(config, 'sms');
    expect(result).toBe(true);
  });

  it('blocks module when explicitly set to false', () => {
    const config = {
      id: 'ind_1',
      title: "Healthcare",
      slug: 'healthcare',
      rulesJson: {},
      defaultTemplateSlug: null,
      defaultTemplateVersion: null,
      onboardingSteps: [],
      modules: { sms: true, whatsapp: false, voice: false },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = isModuleAllowedByIndustry(config, 'whatsapp');
    expect(result).toBe(false);
  });

  it('allows module when not specified in modules (permissive default)', () => {
    const config = {
      id: 'ind_1',
      title: "Finance",
      slug: 'finance',
      rulesJson: {},
      defaultTemplateSlug: null,
      defaultTemplateVersion: null,
      onboardingSteps: [],
      modules: { payment: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = isModuleAllowedByIndustry(config, 'sms');
    expect(result).toBe(true);
  });
});

describe('canUseModule - Industry Gating', () => {
  it('blocks module when industry config forbids it', () => {
    const context = createContext({
      sandboxStatus: SandboxStatus.approved,
      billingStatus: BillingStatus.active,
      industryConfig: {
        id: 'ind_1',
        title: "Healthcare",
        modules: { sms: true, whatsapp: false },
      },
    });

    const result = canUseModule('whatsapp', context);
    
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('industry');
  });

  it('allows module when industry config permits it', () => {
    const context = createContext({
      sandboxStatus: SandboxStatus.approved,
      billingStatus: BillingStatus.active,
      industryConfig: {
        id: 'ind_1',
        title: "Real Estate",
        modules: { sms: true, whatsapp: true, voice: true },
      },
    });

    const result = canUseModule('sms', context);
    
    expect(result.allowed).toBe(true);
  });

  it('industry check comes before sandbox check for denied modules', () => {
    // Industry blocks whatsapp
    const context = createContext({
      sandboxStatus: SandboxStatus.sandbox_required,
      billingStatus: BillingStatus.inactive,
      industryConfig: {
        id: 'ind_1',
        title: "Healthcare",
        modules: { sms: true, whatsapp: false },
      },
    });

    const result = canUseModule('whatsapp', context);
    
    // Industry check comes first
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('industry');
  });

  it('sandbox check applies when industry permits module', () => {
    const context = createContext({
      sandboxStatus: SandboxStatus.sandbox_required,
      billingStatus: BillingStatus.inactive,
      industryConfig: {
        id: 'ind_1',
        title: "Real Estate",
        modules: { sms: true, whatsapp: true },
      },
    });

    const result = canUseModule('sms', context);
    
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('sandbox');
  });
});

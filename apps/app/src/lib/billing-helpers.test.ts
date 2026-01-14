/**
 * Billing Helpers - Unit Tests
 * 
 * Tests for:
 * - mapStripeStatusToBillingStatus
 * - extractPeriodEnd
 * - resolveOrgFromStripeEvent (with mocks)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// Mock Prisma before importing billing-helpers
vi.mock('@/lib/prisma', () => ({
  prisma: {
    orgSettings: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    stripeEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  mapStripeStatusToBillingStatus,
  extractPeriodEnd,
  resolveOrgFromStripeEvent,
  extractSubscriptionIdFromInvoice,
} from '@/lib/billing-helpers';
import { BillingStatus } from '@prisma/client';

// ============================================================================
// mapStripeStatusToBillingStatus Tests
// ============================================================================

describe('mapStripeStatusToBillingStatus', () => {
  it('maps "active" to BillingStatus.active', () => {
    expect(mapStripeStatusToBillingStatus('active')).toBe(BillingStatus.active);
  });

  it('maps "trialing" to BillingStatus.active', () => {
    expect(mapStripeStatusToBillingStatus('trialing')).toBe(BillingStatus.active);
  });

  it('maps "past_due" to BillingStatus.past_due', () => {
    expect(mapStripeStatusToBillingStatus('past_due')).toBe(BillingStatus.past_due);
  });

  it('maps "unpaid" to BillingStatus.past_due', () => {
    expect(mapStripeStatusToBillingStatus('unpaid')).toBe(BillingStatus.past_due);
  });

  it('maps "canceled" to BillingStatus.canceled', () => {
    expect(mapStripeStatusToBillingStatus('canceled')).toBe(BillingStatus.canceled);
  });

  it('maps "incomplete_expired" to BillingStatus.canceled', () => {
    expect(mapStripeStatusToBillingStatus('incomplete_expired')).toBe(BillingStatus.canceled);
  });

  it('maps "incomplete" to BillingStatus.incomplete', () => {
    expect(mapStripeStatusToBillingStatus('incomplete')).toBe(BillingStatus.incomplete);
  });

  it('maps "paused" to BillingStatus.past_due with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapStripeStatusToBillingStatus('paused')).toBe(BillingStatus.past_due);
    expect(warnSpy).toHaveBeenCalledWith('[billing] Subscription paused, treating as past_due');
    warnSpy.mockRestore();
  });

  it('maps unknown status to BillingStatus.inactive with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapStripeStatusToBillingStatus('unknown_status')).toBe(BillingStatus.inactive);
    expect(warnSpy).toHaveBeenCalledWith(
      '[billing] Unknown Stripe subscription status: unknown_status, defaulting to inactive'
    );
    warnSpy.mockRestore();
  });

  it('maps empty string to BillingStatus.inactive', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapStripeStatusToBillingStatus('')).toBe(BillingStatus.inactive);
    warnSpy.mockRestore();
  });
});

// ============================================================================
// extractPeriodEnd Tests
// ============================================================================

describe('extractPeriodEnd', () => {
  it('extracts period_end from subscription items (new API)', () => {
    const unixTimestamp = 1735689600; // 2025-01-01T00:00:00Z
    const subscription = {
      id: 'sub_123',
      items: {
        data: [
          {
            current_period_end: unixTimestamp,
          },
        ],
      },
    } as unknown as Stripe.Subscription;

    const result = extractPeriodEnd(subscription);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(unixTimestamp * 1000);
  });

  it('extracts period_end from direct property (legacy API)', () => {
    const unixTimestamp = 1735689600;
    const subscription = {
      id: 'sub_123',
      current_period_end: unixTimestamp,
      items: { data: [] }, // Empty items
    } as unknown as Stripe.Subscription;

    const result = extractPeriodEnd(subscription);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(unixTimestamp * 1000);
  });

  it('returns null when no period_end available', () => {
    const subscription = {
      id: 'sub_123',
      items: { data: [] },
    } as unknown as Stripe.Subscription;

    const result = extractPeriodEnd(subscription);
    expect(result).toBeNull();
  });

  it('prefers items.data[0].current_period_end over direct property', () => {
    const itemTimestamp = 1735689600;
    const directTimestamp = 1735776000;
    const subscription = {
      id: 'sub_123',
      current_period_end: directTimestamp,
      items: {
        data: [
          {
            current_period_end: itemTimestamp,
          },
        ],
      },
    } as unknown as Stripe.Subscription;

    const result = extractPeriodEnd(subscription);
    expect(result?.getTime()).toBe(itemTimestamp * 1000);
  });
});

// ============================================================================
// extractSubscriptionIdFromInvoice Tests
// ============================================================================

describe('extractSubscriptionIdFromInvoice', () => {
  it('extracts subscription from parent.subscription_details (new API)', () => {
    const invoice = {
      id: 'in_123',
      parent: {
        subscription_details: {
          subscription: 'sub_newapi123',
        },
      },
    } as unknown as Stripe.Invoice;

    const result = extractSubscriptionIdFromInvoice(invoice);
    expect(result).toBe('sub_newapi123');
  });

  it('extracts subscription from direct property (legacy)', () => {
    const invoice = {
      id: 'in_123',
      subscription: 'sub_legacy456',
    } as unknown as Stripe.Invoice;

    const result = extractSubscriptionIdFromInvoice(invoice);
    expect(result).toBe('sub_legacy456');
  });

  it('returns null when no subscription found', () => {
    const invoice = {
      id: 'in_123',
    } as unknown as Stripe.Invoice;

    const result = extractSubscriptionIdFromInvoice(invoice);
    expect(result).toBeNull();
  });
});

// ============================================================================
// resolveOrgFromStripeEvent Tests
// ============================================================================

describe('resolveOrgFromStripeEvent', () => {
  const mockOrgSettings = {
    id: 'settings_123',
    orgId: 'org_test123',
    stripeCustomerId: 'cus_test456',
  } as NonNullable<Awaited<ReturnType<typeof prisma.orgSettings.findUnique>>>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves org from metadata.orgId (strategy 1)', async () => {
    vi.mocked(prisma.orgSettings.findUnique).mockResolvedValueOnce(mockOrgSettings);

    const event = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          metadata: {
            orgId: 'org_test123',
          },
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveOrgFromStripeEvent(event);
    
    expect(result).not.toBeNull();
    expect(result?.orgId).toBe('org_test123');
    expect(prisma.orgSettings.findUnique).toHaveBeenCalledWith({
      where: { orgId: 'org_test123' },
    });
  });

  it('resolves org from customer ID (strategy 2 - fallback)', async () => {
    // First call (metadata lookup) returns null
    vi.mocked(prisma.orgSettings.findUnique).mockResolvedValueOnce(null);
    // Second call (customer lookup) returns org
    vi.mocked(prisma.orgSettings.findFirst).mockResolvedValueOnce(mockOrgSettings);

    const event = {
      id: 'evt_123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_test456',
          // No metadata.orgId
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveOrgFromStripeEvent(event);
    
    expect(result).not.toBeNull();
    expect(result?.orgId).toBe('org_test123');
    expect(prisma.orgSettings.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_test456' },
    });
  });

  it('returns null when org cannot be resolved', async () => {
    vi.mocked(prisma.orgSettings.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.orgSettings.findFirst).mockResolvedValue(null);

    const event = {
      id: 'evt_unknown',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          // No metadata, no customer
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveOrgFromStripeEvent(event);
    
    expect(result).toBeNull();
  });

  it('resolves org from customer object with id field', async () => {
    vi.mocked(prisma.orgSettings.findFirst).mockResolvedValueOnce(mockOrgSettings);

    const event = {
      id: 'evt_123',
      type: 'subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: {
            id: 'cus_test456',
            email: 'test@example.com',
          },
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveOrgFromStripeEvent(event);
    
    expect(result).not.toBeNull();
    expect(result?.stripeCustomerId).toBe('cus_test456');
  });
});

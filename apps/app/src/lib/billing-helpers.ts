/**
 * Billing Helpers
 * 
 * Centralized helper functions for Stripe billing operations.
 * Used by webhook handlers and billing actions.
 */

import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { BillingStatus, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface ResolvedOrg {
  orgId: string;
  orgSettingsId: string;
  stripeCustomerId: string | null;
}

export interface EventIdempotencyResult {
  alreadyProcessed: boolean;
  stripeEventRecord?: {
    id: string;
    orgId: string | null;
  };
}

// ============================================================================
// Org Resolution
// ============================================================================

/**
 * Resolve org from a Stripe event using multiple fallback strategies
 * 
 * Strategy:
 * 1. Try metadata.orgId (most reliable, set during checkout)
 * 2. Fallback to lookup by stripeCustomerId
 * 3. Fallback to subscription customer lookup
 * 
 * Returns null if org cannot be resolved
 */
export async function resolveOrgFromStripeEvent(
  event: Stripe.Event
): Promise<ResolvedOrg | null> {
  const eventData = event.data.object as unknown as Record<string, unknown>;
  
  // Strategy 1: Try metadata.orgId from event object
  const metadata = eventData.metadata as Stripe.Metadata | undefined;
  if (metadata?.orgId) {
    const settings = await prisma.orgSettings.findUnique({
      where: { orgId: metadata.orgId },
    });
    if (settings) {
      return {
        orgId: settings.orgId,
        orgSettingsId: settings.id,
        stripeCustomerId: settings.stripeCustomerId,
      };
    }
  }
  
  // Strategy 2: Try customer ID from event object
  const customerId = extractCustomerId(eventData);
  if (customerId) {
    const settings = await prisma.orgSettings.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (settings) {
      return {
        orgId: settings.orgId,
        orgSettingsId: settings.id,
        stripeCustomerId: settings.stripeCustomerId,
      };
    }
  }
  
  // Strategy 3: Try subscription metadata (for subscription events)
  const subscriptionMetadata = extractSubscriptionMetadata(eventData);
  if (subscriptionMetadata?.orgId) {
    const settings = await prisma.orgSettings.findUnique({
      where: { orgId: subscriptionMetadata.orgId },
    });
    if (settings) {
      return {
        orgId: settings.orgId,
        orgSettingsId: settings.id,
        stripeCustomerId: settings.stripeCustomerId,
      };
    }
  }
  
  // Strategy 4: Try parent subscription details (for invoice events)
  const parentSubscriptionMetadata = extractParentSubscriptionMetadata(eventData);
  if (parentSubscriptionMetadata?.orgId) {
    const settings = await prisma.orgSettings.findUnique({
      where: { orgId: parentSubscriptionMetadata.orgId },
    });
    if (settings) {
      return {
        orgId: settings.orgId,
        orgSettingsId: settings.id,
        stripeCustomerId: settings.stripeCustomerId,
      };
    }
  }
  
  return null;
}

/**
 * Extract customer ID from event data (handles multiple object types)
 */
function extractCustomerId(data: Record<string, unknown>): string | null {
  const customer = data.customer;
  if (typeof customer === 'string') return customer;
  if (customer && typeof customer === 'object' && 'id' in customer) {
    return (customer as { id: string }).id;
  }
  return null;
}

/**
 * Extract subscription metadata (for subscription events)
 */
function extractSubscriptionMetadata(
  data: Record<string, unknown>
): Stripe.Metadata | null {
  // For subscription objects
  if (data.metadata && typeof data.metadata === 'object') {
    return data.metadata as Stripe.Metadata;
  }
  return null;
}

/**
 * Extract parent subscription metadata (for invoice events in new Stripe API)
 */
function extractParentSubscriptionMetadata(
  data: Record<string, unknown>
): Stripe.Metadata | null {
  const parent = data.parent as Record<string, unknown> | undefined;
  if (parent?.subscription_details) {
    const subDetails = parent.subscription_details as Record<string, unknown>;
    if (subDetails.metadata && typeof subDetails.metadata === 'object') {
      return subDetails.metadata as Stripe.Metadata;
    }
  }
  return null;
}

// ============================================================================
// Idempotency
// ============================================================================

/**
 * Check if a Stripe event has already been processed
 * If not, create a record to prevent duplicate processing
 * 
 * Uses unique constraint on stripeEventId for atomic check-and-create
 */
export async function checkAndRecordEvent(
  event: Stripe.Event,
  resolvedOrgId: string | null
): Promise<EventIdempotencyResult> {
  try {
    // Try to create the event record (will fail if already exists)
    const record = await prisma.stripeEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        orgId: resolvedOrgId,
        processed: false,
        raw: event as unknown as Prisma.InputJsonValue,
      },
    });
    
    return {
      alreadyProcessed: false,
      stripeEventRecord: {
        id: record.id,
        orgId: record.orgId,
      },
    };
  } catch (error) {
    // Check if it's a unique constraint violation
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // Event already exists - check if processed
      const existing = await prisma.stripeEvent.findUnique({
        where: { stripeEventId: event.id },
      });
      
      return {
        alreadyProcessed: existing?.processed ?? true,
        stripeEventRecord: existing
          ? { id: existing.id, orgId: existing.orgId }
          : undefined,
      };
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Mark a Stripe event as successfully processed
 */
export async function markEventProcessed(stripeEventId: string): Promise<void> {
  await prisma.stripeEvent.update({
    where: { stripeEventId },
    data: {
      processed: true,
      processedAt: new Date(),
    },
  });
}

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Map Stripe subscription status to our BillingStatus enum
 * 
 * Strict mapping with logging for unknown statuses
 */
export function mapStripeStatusToBillingStatus(
  stripeStatus: string
): BillingStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return BillingStatus.active;
      
    case 'past_due':
    case 'unpaid':
      return BillingStatus.past_due;
      
    case 'canceled':
    case 'incomplete_expired':
      return BillingStatus.canceled;
      
    case 'incomplete':
      return BillingStatus.incomplete;
      
    case 'paused':
      // Treat paused as past_due (needs attention)
      console.warn(`[billing] Subscription paused, treating as past_due`);
      return BillingStatus.past_due;
      
    default:
      console.warn(`[billing] Unknown Stripe subscription status: ${stripeStatus}, defaulting to inactive`);
      return BillingStatus.inactive;
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Create an audit log entry for billing events
 * 
 * Centralizes audit log creation with consistent format
 */
export async function logBillingAudit(
  action: string,
  details: {
    stripeEventId?: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    invoiceId?: string;
    sessionId?: string;
    newStatus?: BillingStatus | string;
    previousStatus?: BillingStatus | string;
    periodEnd?: number | Date | string | null;
    amountPaid?: number | null;
    amountDue?: number | null;
    currency?: string | null;
    error?: string;
    [key: string]: unknown;
  },
  options?: {
    orgId?: string | null;
    actorUserId?: string;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: options?.orgId ?? null,
        actorUserId: options?.actorUserId ?? 'system',
        action,
        details: details as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('[billing] Failed to create audit log:', error, { action, details });
  }
}

// ============================================================================
// Period End Extraction
// ============================================================================

/**
 * Extract current_period_end from a Stripe subscription
 * Handles both old and new API structures
 */
export function extractPeriodEnd(subscription: Stripe.Subscription): Date | null {
  // New API: period is on subscription items
  if (subscription.items?.data?.[0]?.current_period_end) {
    return new Date(subscription.items.data[0].current_period_end * 1000);
  }
  
  // Fallback: try direct property (older API versions)
  const subAny = subscription as unknown as Record<string, unknown>;
  if (typeof subAny.current_period_end === 'number') {
    return new Date((subAny.current_period_end as number) * 1000);
  }
  
  return null;
}

/**
 * Extract subscription ID from invoice (handles new API structure)
 */
export function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // New API: subscription is in parent.subscription_details
  const parent = invoice.parent as unknown as Record<string, unknown> | undefined;
  if (parent?.subscription_details) {
    const subDetails = parent.subscription_details as Record<string, unknown>;
    if (typeof subDetails.subscription === 'string') {
      return subDetails.subscription;
    }
  }
  
  // Fallback: try direct property
  const invoiceAny = invoice as unknown as Record<string, unknown>;
  if (typeof invoiceAny.subscription === 'string') {
    return invoiceAny.subscription;
  }
  
  return null;
}

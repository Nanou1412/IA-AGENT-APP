/**
 * Stripe Webhook Handler (Production-Grade)
 * 
 * Handles all Stripe webhook events for billing state management.
 * This is the SOURCE OF TRUTH for billing status updates.
 * 
 * Features:
 * - Idempotent: Uses StripeEvent table to prevent duplicate processing
 * - Robust org resolution: Multiple fallback strategies
 * - Strict status mapping: Centralized BillingStatus mapping
 * - Comprehensive audit logging
 * - Proper error handling with correct HTTP responses
 * - Phase 8: Correlation ID, alerting integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { BillingStatus } from '@prisma/client';
import {
  resolveOrgFromStripeEvent,
  checkAndRecordEvent,
  markEventProcessed,
  mapStripeStatusToBillingStatus,
  logBillingAudit,
  extractPeriodEnd,
  extractSubscriptionIdFromInvoice,
} from '@/lib/billing-helpers';
import { withRequestContext, generateCorrelationId, logWithContext, getCorrelationId } from '@/lib/correlation';
import { increment, METRIC_NAMES } from '@/lib/metrics';
import { alertStripePaymentFailure, alertSubscriptionCanceled } from '@/lib/alerts';
import { sendOrderConfirmationSms } from '@/lib/sms';
import { getShortOrderId, formatPickupTime } from '@/lib/takeaway/order-manager';
import { notifyBusinessOfOrder } from '@/engine/modules/takeaway-notifications';
import { parseTakeawayConfig } from '@/lib/takeaway/takeaway-config';
import { canUseModuleWithKillSwitch } from '@/lib/feature-gating';

// Disable body parsing - we need raw body for signature verification
export const dynamic = 'force-dynamic';

// ============================================================================
// Webhook Handler
// ============================================================================

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  
  return withRequestContext({ correlationId, startTime: Date.now() }, async () => {
    let event: Stripe.Event | null = null;
    
    try {
      // Get raw body for signature verification
      const body = await req.text();
      const headersList = await headers();
      const signature = headersList.get('stripe-signature');
      
      // Validate signature header
      if (!signature) {
        logWithContext('error', 'Missing stripe-signature header');
        return NextResponse.json(
          { error: 'Missing stripe-signature header', correlationId },
          { status: 400 }
        );
      }
      
      // Validate webhook secret is configured
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }
    
    // Verify webhook signature
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[stripe-webhook] Signature verification failed:', message);
      return NextResponse.json(
        { error: `Webhook signature verification failed` },
        { status: 400 }
      );
    }
    
    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);
    
    // Resolve org from event
    const resolvedOrg = await resolveOrgFromStripeEvent(event);
    const orgId = resolvedOrg?.orgId ?? null;
    
    // Check idempotency - has this event been processed before?
    const idempotencyResult = await checkAndRecordEvent(event, orgId);
    
    if (idempotencyResult.alreadyProcessed) {
      console.log(`[stripe-webhook] Event ${event.id} already processed, skipping`);
      return NextResponse.json({ received: true, skipped: true });
    }
    
    // Handle unmapped events (org not found)
    if (!resolvedOrg) {
      console.warn(`[stripe-webhook] Could not resolve org for event: ${event.type}`, {
        eventId: event.id,
        eventType: event.type,
      });
      
      // Log unmapped event for investigation
      await logBillingAudit('billing.unmapped_event', {
        stripeEventId: event.id,
        eventType: event.type,
        error: 'Could not resolve org from event',
      });
      
      // Mark as processed to avoid retry loops
      await markEventProcessed(event.id);
      
      // Return 200 to prevent Stripe retry (we logged it, nothing more we can do)
      return NextResponse.json({ received: true, unmapped: true });
    }
    
    // Process the event based on type
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          // Route based on domain metadata
          if (session.metadata?.domain === 'order') {
            // Order payment - orgId from metadata
            const orderOrgId = session.metadata?.orgId;
            if (orderOrgId) {
              await handleOrderCheckoutCompleted(session, orderOrgId, event.id);
            } else {
              console.error('[stripe-webhook] Order checkout missing orgId in metadata');
            }
          } else {
            // Default: subscription billing checkout
            await handleCheckoutCompleted(session, resolvedOrg.orgId, event.id);
          }
          break;
        }

        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          // Only handle order checkouts
          if (session.metadata?.domain === 'order') {
            const orderOrgId = session.metadata?.orgId;
            if (orderOrgId) {
              await handleOrderCheckoutExpired(session, orderOrgId, event.id);
            } else {
              console.error('[stripe-webhook] Expired checkout missing orgId in metadata');
            }
          }
          break;
        }
          
        case 'invoice.paid':
          await handleInvoicePaid(
            event.data.object as Stripe.Invoice,
            resolvedOrg.orgId,
            event.id
          );
          break;
          
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
            resolvedOrg.orgId,
            event.id
          );
          break;
          
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
            resolvedOrg.orgId,
            event.id
          );
          break;
          
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
            resolvedOrg.orgId,
            event.id
          );
          break;
          
        default:
          // Unhandled event type - log but don't fail
          console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
      }
      
      // Mark event as successfully processed
      await markEventProcessed(event.id);
      
    } catch (handlerError) {
      console.error(`[stripe-webhook] Error handling ${event.type}:`, handlerError);
      
      // Log the error
      await logBillingAudit('billing.webhook_error', {
        stripeEventId: event.id,
        eventType: event.type,
        error: handlerError instanceof Error ? handlerError.message : 'Unknown error',
      }, { orgId });
      
      // Don't mark as processed - allow retry
      // But return 200 to avoid immediate retry flood
      // Stripe will retry with exponential backoff
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('[stripe-webhook] Unexpected error:', error);
    
    // Log critical error
    await logBillingAudit('billing.webhook_critical_error', {
      stripeEventId: event?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // Return 500 for unexpected errors
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
  }); // End withRequestContext
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle checkout.session.completed
 * 
 * Called when customer completes the checkout flow.
 * - Updates subscription ID
 * - Sets billing status to active (only if payment_status is 'paid')
 * - Sets setupFeePaidAt only if payment confirmed
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  console.log(`[stripe-webhook] Processing checkout.session.completed for org: ${orgId}`);
  
  // Get current settings for previous status
  const currentSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });
  const previousStatus = currentSettings?.billingStatus ?? BillingStatus.inactive;
  
  // Get subscription details
  const subscriptionId = typeof session.subscription === 'string' 
    ? session.subscription 
    : null;
    
  let periodEnd: Date | null = null;
  
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      periodEnd = extractPeriodEnd(subscription);
    } catch (err) {
      console.warn(`[stripe-webhook] Could not retrieve subscription ${subscriptionId}:`, err);
    }
  }
  
  // Determine if payment is confirmed
  // payment_status can be: 'paid', 'unpaid', or 'no_payment_required'
  const paymentConfirmed = session.payment_status === 'paid';
  
  // Prepare update data
  const updateData: {
    stripeSubscriptionId?: string;
    billingStatus?: BillingStatus;
    setupFeePaidAt?: Date;
    currentPeriodEnd?: Date;
  } = {};
  
  if (subscriptionId) {
    updateData.stripeSubscriptionId = subscriptionId;
  }
  
  if (paymentConfirmed) {
    updateData.billingStatus = BillingStatus.active;
    
    // Only set setupFeePaidAt if not already set
    if (!currentSettings?.setupFeePaidAt) {
      updateData.setupFeePaidAt = new Date();
    }
  }
  
  if (periodEnd) {
    updateData.currentPeriodEnd = periodEnd;
  }
  
  // Update org settings
  if (Object.keys(updateData).length > 0) {
    await prisma.orgSettings.update({
      where: { orgId },
      data: updateData,
    });
  }
  
  // Audit log
  await logBillingAudit('billing.checkout_completed', {
    stripeEventId,
    sessionId: session.id,
    subscriptionId,
    customerId: typeof session.customer === 'string' ? session.customer : null,
    paymentStatus: session.payment_status,
    previousStatus,
    newStatus: paymentConfirmed ? BillingStatus.active : previousStatus,
    amountTotal: session.amount_total,
    currency: session.currency,
  }, { orgId, actorUserId: session.metadata?.userId });
}

/**
 * Handle invoice.paid
 * 
 * Called when an invoice is successfully paid.
 * - Ensures billing status is active
 * - Sets setupFeePaidAt if not already set (first invoice)
 * - Updates currentPeriodEnd
 */
async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  console.log(`[stripe-webhook] Processing invoice.paid for org: ${orgId}`);
  
  // Get current settings
  const currentSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });
  const previousStatus = currentSettings?.billingStatus ?? BillingStatus.inactive;
  
  // Get subscription to update period end
  const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
  let periodEnd: Date | null = null;
  
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      periodEnd = extractPeriodEnd(subscription);
    } catch (err) {
      console.warn(`[stripe-webhook] Could not retrieve subscription ${subscriptionId}:`, err);
    }
  }
  
  // Prepare update data
  const updateData: {
    billingStatus: BillingStatus;
    currentPeriodEnd?: Date;
    setupFeePaidAt?: Date;
  } = {
    billingStatus: BillingStatus.active,
  };
  
  if (periodEnd) {
    updateData.currentPeriodEnd = periodEnd;
  }
  
  // Set setupFeePaidAt on first invoice if not already set
  if (!currentSettings?.setupFeePaidAt) {
    updateData.setupFeePaidAt = new Date();
  }
  
  // Update org settings
  await prisma.orgSettings.update({
    where: { orgId },
    data: updateData,
  });
  
  // Audit log
  await logBillingAudit('billing.invoice_paid', {
    stripeEventId,
    invoiceId: invoice.id,
    subscriptionId,
    previousStatus,
    newStatus: BillingStatus.active,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    periodEnd: periodEnd?.toISOString(),
  }, { orgId });
}

/**
 * Handle invoice.payment_failed
 * 
 * Called when a payment fails.
 * - Sets billing status to past_due
 * - NEVER sets setupFeePaidAt
 * - Phase 8: Sends alert for payment failure
 */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  logWithContext('info', 'Processing invoice.payment_failed', { orgId, invoiceId: invoice.id });
  
  // Get current settings
  const currentSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });
  const previousStatus = currentSettings?.billingStatus ?? BillingStatus.inactive;
  
  const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
  
  // Update billing status to past_due
  await prisma.orgSettings.update({
    where: { orgId },
    data: {
      billingStatus: BillingStatus.past_due,
    },
  });
  
  // Phase 8: Metric for payment failure
  increment(METRIC_NAMES.STRIPE_ORDER_PAYMENTS_FAILED, { orgId });
  
  // Phase 8: Send alert for payment failure (BLOQUANT 6)
  await alertStripePaymentFailure(
    orgId,
    invoice.id,
    `Invoice payment failed after ${invoice.attempt_count} attempts`
  );
  
  // Audit log
  await logBillingAudit('billing.invoice_failed', {
    stripeEventId,
    invoiceId: invoice.id,
    subscriptionId,
    previousStatus,
    newStatus: BillingStatus.past_due,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count,
    correlationId: getCorrelationId(),
  }, { orgId });
}

/**
 * Handle customer.subscription.updated
 * 
 * Called when subscription status changes.
 * - Syncs billing status with Stripe subscription status
 * - Updates currentPeriodEnd
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  console.log(`[stripe-webhook] Processing subscription.updated for org: ${orgId}, status: ${subscription.status}`);
  
  // Get current settings
  const currentSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });
  const previousStatus = currentSettings?.billingStatus ?? BillingStatus.inactive;
  
  // Map Stripe status to our BillingStatus
  const billingStatus = mapStripeStatusToBillingStatus(subscription.status);
  
  // Extract period end
  const periodEnd = extractPeriodEnd(subscription);
  
  // Update billing status
  await prisma.orgSettings.update({
    where: { orgId },
    data: {
      billingStatus,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEnd ?? undefined,
    },
  });
  
  // Audit log
  await logBillingAudit('billing.subscription_updated', {
    stripeEventId,
    subscriptionId: subscription.id,
    stripeStatus: subscription.status,
    previousStatus,
    newStatus: billingStatus,
    periodEnd: periodEnd?.toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }, { orgId });
}

/**
 * Handle customer.subscription.deleted
 * 
 * Called when subscription is canceled/deleted.
 * - Sets billing status to canceled
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  logWithContext('info', 'Processing subscription.deleted', { orgId, subscriptionId: subscription.id });
  
  // Get current settings
  const currentSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });
  const previousStatus = currentSettings?.billingStatus ?? BillingStatus.inactive;
  
  // Update billing status to canceled
  await prisma.orgSettings.update({
    where: { orgId },
    data: {
      billingStatus: BillingStatus.canceled,
    },
  });
  
  // Phase 8: Alert for subscription cancellation (BLOQUANT 6)
  await alertSubscriptionCanceled(
    orgId,
    subscription.id,
    subscription.cancellation_details?.reason ?? undefined
  );
  
  // Audit log
  await logBillingAudit('billing.subscription_canceled', {
    stripeEventId,
    subscriptionId: subscription.id,
    previousStatus,
    newStatus: BillingStatus.canceled,
    canceledAt: subscription.canceled_at,
    endedAt: subscription.ended_at,
    correlationId: getCorrelationId(),
  }, { orgId });
}

// ============================================================================
// ORDER PAYMENT HANDLERS
// ============================================================================

/**
 * Handle checkout.session.completed for ORDER payments (domain='order')
 * 
 * Called when customer successfully completes order payment.
 * - Marks OrderPaymentLink as completed
 * - Updates Order payment status to paid
 * - Confirms the order
 * - Logs payment event
 * - TODO: Send notifications (business + customer)
 */
async function handleOrderCheckoutCompleted(
  checkoutSession: Stripe.Checkout.Session,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  const orderId = checkoutSession.metadata?.orderId;
  if (!orderId) {
    console.error('[stripe-webhook] Order checkout completed but missing orderId in metadata');
    return;
  }
  
  console.log(`[stripe-webhook] Processing order checkout completed for order: ${orderId}`);
  
  // Find the payment link by checkout session ID
  const paymentLink = await prisma.orderPaymentLink.findUnique({
    where: { stripeCheckoutSessionId: checkoutSession.id },
    include: { order: true },
  });
  
  if (!paymentLink) {
    console.error(`[stripe-webhook] No payment link found for checkout session: ${checkoutSession.id}`);
    return;
  }
  
  // Verify order belongs to org
  if (paymentLink.order.orgId !== orgId) {
    console.error(`[stripe-webhook] Order ${orderId} does not belong to org ${orgId}`);
    return;
  }
  
  // Already processed?
  if (paymentLink.status === 'completed') {
    console.log(`[stripe-webhook] Payment link already completed for order: ${orderId}`);
    return;
  }
  
  const now = new Date();
  
  // Update payment link and order in transaction
  await prisma.$transaction(async (tx) => {
    // Update payment link status
    await tx.orderPaymentLink.update({
      where: { id: paymentLink.id },
      data: {
        status: 'completed',
        stripePaymentIntentId: checkoutSession.payment_intent as string | null,
      },
    });
    
    // Update order payment status and confirm order
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'paid',
        paymentPaidAt: now,
        status: 'confirmed', // Order is now confirmed after payment
      },
    });
    
    // Log payment event
    await tx.orderEventLog.create({
      data: {
        orderId,
        type: 'payment_paid',
        details: {
          stripeEventId,
          checkoutSessionId: checkoutSession.id,
          paymentIntentId: typeof checkoutSession.payment_intent === 'string' 
            ? checkoutSession.payment_intent 
            : checkoutSession.payment_intent?.id ?? null,
          amountTotal: checkoutSession.amount_total,
          currency: checkoutSession.currency,
          customerEmail: checkoutSession.customer_email,
          paidAt: now.toISOString(),
        },
      },
    });
    
    // Log order confirmation event
    await tx.orderEventLog.create({
      data: {
        orderId,
        type: 'confirmed',
        details: {
          reason: 'payment_completed',
          previousStatus: paymentLink.order.status,
        },
      },
    });
  });
  
  console.log(`[stripe-webhook] Order ${orderId} payment completed and order confirmed`);
  
  // Send customer confirmation SMS
  const order = paymentLink.order;
  const shortId = getShortOrderId(orderId);
  const pickupTimeStr = order.pickupTime ? formatPickupTime(order.pickupTime, order.pickupMode) : undefined;
  
  try {
    const smsResult = await sendOrderConfirmationSms({
      orgId,
      customerPhone: order.customerPhone,
      orderId,
      shortOrderId: shortId,
      pickupTime: pickupTimeStr,
      customerName: order.customerName || undefined,
    });
    
    if (smsResult.success) {
      console.log(`[stripe-webhook] Order confirmation SMS sent for order ${orderId}`);
    } else {
      console.warn(`[stripe-webhook] Failed to send order confirmation SMS for order ${orderId}:`, smsResult.error);
    }
  } catch (smsError) {
    console.error(`[stripe-webhook] Error sending order confirmation SMS:`, smsError);
    // Don't fail the webhook - SMS is non-critical
  }
  
  // Send business notification (order confirmed after payment)
  try {
    const orgSettings = await prisma.orgSettings.findUnique({
      where: { orgId },
      select: { takeawayConfig: true },
    });
    
    const takeawayConfig = parseTakeawayConfig(orgSettings?.takeawayConfig);
    
    // Create a simple canUseModule function for the notification
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      include: { settings: true, industryConfig: true },
    });
    
    if (org) {
      const canUseModule = (module: string) => canUseModuleWithKillSwitch(module, { org, settings: org.settings });
      
      const notifyResult = await notifyBusinessOfOrder(orgId, orderId, takeawayConfig, canUseModule);
      
      if (notifyResult.success) {
        console.log(`[stripe-webhook] Business notification sent for order ${orderId} via ${notifyResult.method}`);
      } else if (notifyResult.error) {
        console.warn(`[stripe-webhook] Failed to send business notification for order ${orderId}:`, notifyResult.error);
      }
    }
  } catch (notifyError) {
    console.error(`[stripe-webhook] Error sending business notification:`, notifyError);
    // Don't fail the webhook - notification is non-critical
  }
}

/**
 * Handle checkout.session.expired for ORDER payments (domain='order')
 * 
 * Called when customer's checkout session expires without payment.
 * - Marks OrderPaymentLink as expired
 * - Updates Order payment status to expired
 * - Logs expiration event
 * - TODO: Trigger retry logic if allowed
 */
async function handleOrderCheckoutExpired(
  checkoutSession: Stripe.Checkout.Session,
  orgId: string,
  stripeEventId: string
): Promise<void> {
  const orderId = checkoutSession.metadata?.orderId;
  
  if (!orderId) {
    console.error('[stripe-webhook] Order checkout expired but missing orderId in metadata');
    return;
  }
  
  console.log(`[stripe-webhook] Processing order checkout expired for order: ${orderId}`);
  
  // Find the payment link
  const paymentLink = await prisma.orderPaymentLink.findUnique({
    where: { stripeCheckoutSessionId: checkoutSession.id },
    include: { order: true },
  });
  
  if (!paymentLink) {
    console.error(`[stripe-webhook] No payment link found for expired checkout session: ${checkoutSession.id}`);
    return;
  }
  
  // Verify order belongs to org
  if (paymentLink.order.orgId !== orgId) {
    console.error(`[stripe-webhook] Order ${orderId} does not belong to org ${orgId}`);
    return;
  }
  
  // Already processed?
  if (paymentLink.status === 'expired' || paymentLink.status === 'completed') {
    console.log(`[stripe-webhook] Payment link already ${paymentLink.status} for order: ${orderId}`);
    return;
  }
  
  // Update in transaction
  await prisma.$transaction(async (tx) => {
    // Mark payment link as expired
    await tx.orderPaymentLink.update({
      where: { id: paymentLink.id },
      data: {
        status: 'expired',
      },
    });
    
    // Only update order if it's still pending payment (not already paid via another link)
    if (paymentLink.order.paymentStatus === 'pending') {
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'expired',
        },
      });
    }
    
    // Log expiration event
    await tx.orderEventLog.create({
      data: {
        orderId,
        type: 'payment_expired',
        details: {
          stripeEventId,
          checkoutSessionId: checkoutSession.id,
          expiredAt: new Date().toISOString(),
          orderPaymentAttemptCount: paymentLink.order.paymentAttemptCount,
        },
      },
    });
  });
  
  console.log(`[stripe-webhook] Order ${orderId} payment link expired`);
  
  // TODO: Check retry policy and potentially send retry link automatically
  // Or wait for customer reply to trigger retry in engine
}

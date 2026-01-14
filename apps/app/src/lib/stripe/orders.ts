/**
 * Stripe Order Payments
 * 
 * Handles Stripe Checkout Session creation for takeaway order payments.
 * Phase 7.3: Pay by SMS link
 * 
 * This is SEPARATE from subscription billing - uses one-time payments.
 */

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { OrderPaymentStatus, OrderPaymentLinkStatus, OrderEventType } from '@prisma/client';
import { logOrderEvent } from '@/lib/takeaway/order-manager';
import { calculatePaymentDueAt, type TakeawayPaymentConfig } from '@/lib/takeaway/takeaway-payment-config';

// ============================================================================
// Environment Configuration
// ============================================================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
const STRIPE_ORDER_PAYMENTS_ENABLED = process.env.STRIPE_ORDER_PAYMENTS_ENABLED !== 'false';
const DEFAULT_SUCCESS_URL = process.env.STRIPE_ORDER_SUCCESS_URL || '/app/orders/{ORDER_ID}?paid=1';
const DEFAULT_CANCEL_URL = process.env.STRIPE_ORDER_CANCEL_URL || '/app/orders/{ORDER_ID}?canceled=1';
const DEFAULT_PRODUCT_NAME = process.env.STRIPE_ORDER_PRODUCT_NAME_DEFAULT || 'Takeaway order';
const DEFAULT_CURRENCY = process.env.STRIPE_ORDER_CURRENCY || 'AUD';

// ============================================================================
// Types
// ============================================================================

export interface CreateOrderCheckoutParams {
  orderId: string;
  orgId: string;
  amountCents: number;
  currency?: string;
  customerPhone: string;
  customerEmail?: string;
  sessionId?: string;
  channel: string;
  productName?: string;
  orderSummary?: string;
  config: TakeawayPaymentConfig;
}

export interface OrderCheckoutResult {
  success: boolean;
  checkoutSessionId?: string;
  paymentUrl?: string;
  expiresAt?: Date;
  error?: string;
}

// ============================================================================
// Checkout Session Creation
// ============================================================================

/**
 * Create a Stripe Checkout Session for order payment
 * 
 * - Creates one-time payment session
 * - Attaches metadata for webhook processing (domain="order")
 * - Stores session in OrderPaymentLink table
 * - Updates Order with payment due date
 */
export async function createOrderCheckoutSession(
  params: CreateOrderCheckoutParams
): Promise<OrderCheckoutResult> {
  const {
    orderId,
    orgId,
    amountCents,
    currency = DEFAULT_CURRENCY,
    customerPhone,
    customerEmail,
    sessionId,
    channel,
    productName = DEFAULT_PRODUCT_NAME,
    orderSummary,
    config,
  } = params;

  // Check if order payments are enabled
  if (!STRIPE_ORDER_PAYMENTS_ENABLED) {
    return {
      success: false,
      error: 'Order payments are disabled',
    };
  }

  // Validate amount
  if (amountCents <= 0) {
    return {
      success: false,
      error: 'Invalid payment amount',
    };
  }

  try {
    // Check for existing active payment link
    const existingActiveLink = await prisma.orderPaymentLink.findFirst({
      where: {
        orderId,
        status: OrderPaymentLinkStatus.active,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingActiveLink) {
      // Return existing active link (idempotent)
      return {
        success: true,
        checkoutSessionId: existingActiveLink.stripeCheckoutSessionId,
        paymentUrl: existingActiveLink.url,
        expiresAt: existingActiveLink.expiresAt,
      };
    }

    // Get current order for attempt count
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentAttemptCount: true },
    });

    if (!order) {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    const attemptCount = order.paymentAttemptCount + 1;
    const isRetry = attemptCount > 1;

    // Build success and cancel URLs
    const successUrl = `${APP_URL}${DEFAULT_SUCCESS_URL.replace('{ORDER_ID}', orderId)}`;
    const cancelUrl = `${APP_URL}${DEFAULT_CANCEL_URL.replace('{ORDER_ID}', orderId)}`;

    // Calculate expiration
    const expiresAt = calculatePaymentDueAt(config);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: productName,
              description: orderSummary || undefined,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      // Customer info
      customer_email: customerEmail || undefined,
      // Metadata for webhook processing
      metadata: {
        domain: 'order', // IMPORTANT: distinguishes from subscription billing
        orderId,
        orgId,
        channel,
        sessionId: sessionId || '',
        customerPhone,
        attemptNumber: String(attemptCount),
      },
      // URLs
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Expiration
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      // Phone number collection (optional - already have it)
      phone_number_collection: {
        enabled: false,
      },
    });

    // Store payment link
    await prisma.orderPaymentLink.create({
      data: {
        orderId,
        stripeCheckoutSessionId: session.id,
        url: session.url!,
        status: OrderPaymentLinkStatus.active,
        expiresAt,
      },
    });

    // Update order with payment info
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentDueAt: expiresAt,
        paymentAttemptCount: attemptCount,
        paymentStatus: OrderPaymentStatus.pending,
      },
    });

    // Log event
    const eventType = isRetry 
      ? OrderEventType.payment_retry_link_created 
      : OrderEventType.payment_link_created;
    
    await logOrderEvent(orderId, eventType, {
      checkoutSessionId: session.id,
      amount: amountCents,
      currency,
      attemptNumber: attemptCount,
      expiresAt: expiresAt.toISOString(),
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: isRetry ? 'takeaway.payment_retry_link_created' : 'takeaway.payment_link_created',
        details: {
          orderId,
          checkoutSessionId: session.id,
          amountCents,
          currency,
          attemptNumber: attemptCount,
        },
      },
    });

    return {
      success: true,
      checkoutSessionId: session.id,
      paymentUrl: session.url!,
      expiresAt,
    };
  } catch (error) {
    console.error('[stripe-orders] Failed to create checkout session:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update order with error
    await prisma.order.update({
      where: { id: orderId },
      data: {
        lastPaymentError: errorMessage,
      },
    });

    await logOrderEvent(orderId, OrderEventType.error, {
      error: errorMessage,
      context: 'createOrderCheckoutSession',
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Payment Link Management
// ============================================================================

/**
 * Expire a payment link
 */
export async function expirePaymentLink(
  orderId: string,
  reason: string = 'timeout'
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Mark all active links as expired
    await tx.orderPaymentLink.updateMany({
      where: {
        orderId,
        status: OrderPaymentLinkStatus.active,
      },
      data: {
        status: OrderPaymentLinkStatus.expired,
      },
    });

    // Update order status
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: OrderPaymentStatus.expired,
      },
    });
  });

  await logOrderEvent(orderId, OrderEventType.payment_expired, {
    reason,
  });
}

/**
 * Mark payment as completed
 * Called by webhook handler
 */
export async function markPaymentCompleted(
  orderId: string,
  stripeCheckoutSessionId: string,
  stripePaymentIntentId: string | null
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Update payment link
    await tx.orderPaymentLink.update({
      where: { stripeCheckoutSessionId },
      data: {
        status: OrderPaymentLinkStatus.completed,
        stripePaymentIntentId,
      },
    });

    // Mark other active links as expired (shouldn't exist, but safety)
    await tx.orderPaymentLink.updateMany({
      where: {
        orderId,
        status: OrderPaymentLinkStatus.active,
        stripeCheckoutSessionId: { not: stripeCheckoutSessionId },
      },
      data: {
        status: OrderPaymentLinkStatus.expired,
      },
    });

    // Update order
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: OrderPaymentStatus.paid,
        paymentPaidAt: now,
        status: 'confirmed',
        confirmedAt: now,
      },
    });
  });

  await logOrderEvent(orderId, OrderEventType.payment_paid, {
    checkoutSessionId: stripeCheckoutSessionId,
    paymentIntentId: stripePaymentIntentId,
    paidAt: now.toISOString(),
  });
}

/**
 * Mark payment as failed
 */
export async function markPaymentFailed(
  orderId: string,
  errorMessage: string
): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: OrderPaymentStatus.failed,
      lastPaymentError: errorMessage,
    },
  });

  await logOrderEvent(orderId, OrderEventType.payment_failed, {
    error: errorMessage,
  });
}

/**
 * Cancel payment
 */
export async function cancelPayment(
  orderId: string,
  reason: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Cancel all active links
    await tx.orderPaymentLink.updateMany({
      where: {
        orderId,
        status: OrderPaymentLinkStatus.active,
      },
      data: {
        status: OrderPaymentLinkStatus.canceled,
      },
    });

    // Update order
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: OrderPaymentStatus.canceled,
      },
    });
  });

  await logOrderEvent(orderId, OrderEventType.payment_canceled, {
    reason,
  });
}

/**
 * Get active payment link for an order
 */
export async function getActivePaymentLink(orderId: string) {
  return prisma.orderPaymentLink.findFirst({
    where: {
      orderId,
      status: OrderPaymentLinkStatus.active,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Check if order has any payment links
 */
export async function hasPaymentLinks(orderId: string): Promise<boolean> {
  const count = await prisma.orderPaymentLink.count({
    where: { orderId },
  });
  return count > 0;
}

/**
 * Takeaway Order Module for Engine
 * 
 * Handles takeaway order intents through a state machine approach.
 * This module is config-driven and industry-agnostic.
 * 
 * Flow:
 * 1. Collect order items (draft state in session metadata)
 * 2. Validate required fields (name, phone, pickup time)
 * 3. Present summary and ask for explicit confirmation
 * 4. On YES => create confirmed Order, notify business
 * 5. Post-confirmation modifications => handoff
 * 
 * Intents handled:
 * - order.add: Add items to order
 * - order.confirm: Customer confirms order
 * - order.cancel: Customer cancels order
 * - order.modify: Customer wants to modify (post-confirm => handoff)
 * - order.status: Customer asks about order status
 */

import type { ModuleContext, ModuleResult } from '../module-runner';
import { prisma } from '@/lib/prisma';
import { OrderStatus, OrderPaymentStatus } from '@prisma/client';
import {
  parseTakeawayConfig,
  isConfirmationYes,
  isConfirmationNo,
  renderTemplate,
  validatePickupTime,
  type TakeawayConfig,
} from '@/lib/takeaway/takeaway-config';
import {
  parseTakeawayPaymentConfig,
  isPaymentRequired,
  canRetryPayment,
  renderPaymentMessage,
  type TakeawayPaymentConfig,
} from '@/lib/takeaway/takeaway-payment-config';
import {
  createOrderDraft,
  updateOrderDraft,
  confirmOrder,
  cancelOrder,
  requestOrderConfirmation,
  getPendingOrderForSession,
  logOrderEvent,
  buildOrderSummary,
  formatPickupTime,
  getShortOrderId,
  setOrderPendingPayment,
  type OrderDraft,
  type OrderItemDraft,
} from '@/lib/takeaway/order-manager';
import { OrderEventType } from '@prisma/client';
import { notifyBusinessOfOrder } from './takeaway-notifications';
import { createOrderCheckoutSession } from '@/lib/stripe/orders';
import { sendPaymentLinkSms } from '@/lib/sms';

// ============================================================================
// Types
// ============================================================================

export interface TakeawayModuleContext extends ModuleContext {
  intent?: string;
  parsedOrder?: ParsedOrderRequest;
}

export interface ParsedOrderRequest {
  action: 'add' | 'confirm' | 'cancel' | 'modify' | 'status' | 'clarify';
  items?: OrderItemDraft[];
  pickupTime?: Date;
  pickupMode?: 'asap' | 'time';
  customerName?: string;
  notes?: string;
}

// Session metadata keys for order state
interface OrderSessionState {
  orderId?: string;
  orderStatus?: string;
  draftItems?: OrderItemDraft[];
  pickupTime?: string;
  pickupMode?: 'asap' | 'time';
  customerName?: string;
  orderNotes?: string;
  clarificationCount?: number;
  awaitingConfirmation?: boolean;
  orderConfirmed?: boolean;
  lastConfirmationSentAt?: string;
  // Phase 7.3: Payment state
  awaitingPayment?: boolean;
  awaitingPaymentRetry?: boolean;
  paymentLinkSentAt?: string;
}

// ============================================================================
// Response Templates (config-driven via TakeawayConfig.templates)
// ============================================================================

const DEFAULT_RESPONSES = {
  moduleBlocked: "I'm unable to process orders at this time. Please call us directly to place your order.",
  notEnabled: "Online ordering is not currently available. Please call us to place your order.",
  notConnected: "Our ordering system is currently unavailable. Please call us directly.",
  
  // Order collection
  askItems: "What would you like to order?",
  askMoreItems: "Would you like to add anything else to your order?",
  askPickupTime: "When would you like to pick up your order? You can say 'ASAP' or give us a specific time.",
  askName: "May I have your name for the order?",
  
  // Errors
  tooManyItems: (max: number) => 
    `Sorry, we can only process orders with up to ${max} items at a time.`,
  pickupTooSoon: (minutes: number) => 
    `We need at least ${minutes} minutes notice for pickup. Would you like to pick up later?`,
  itemsUnclear: "I didn't quite catch that. Could you please repeat your order?",
  maxClarifications: "I'm having trouble understanding your order. Let me connect you with someone who can help.",
  
  // Confirmation
  orderConfirmed: (orderId: string) => 
    `Great! Your order #${orderId} has been confirmed. We'll have it ready for you!`,
  orderCanceled: "Your order has been canceled. Let us know if you'd like to start a new order.",
  orderExpired: "Your order has expired. Please start a new order when you're ready.",
  
  // Post-confirmation
  modifyAfterConfirm: "To modify your confirmed order, please call us directly and we'll be happy to help.",
  cancelAfterConfirm: "To cancel your confirmed order, please call us directly.",
};

// ============================================================================
// Module Handler
// ============================================================================

/**
 * Main takeaway order module handler
 */
export async function takeawayOrderModule(context: TakeawayModuleContext): Promise<ModuleResult> {
  const { orgId, sessionId, channel, intent, sessionMetadata, canUseModule, userText } = context;

  // Check if takeaway module is allowed
  const gating = canUseModule('takeaway');
  if (!gating.allowed) {
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: gating.reason,
      blockedBy: gating.blockedBy,
    };
  }

  // Get takeaway config from org settings
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { takeawayConfig: true, handoffPhone: true },
  });

  const takeawayConfig = parseTakeawayConfig(orgSettings?.takeawayConfig);
  
  if (!takeawayConfig.enabled) {
    return {
      responseText: DEFAULT_RESPONSES.notEnabled,
      handoffTriggered: true,
      handoffReason: 'Takeaway not enabled for org',
    };
  }

  // Get current order state from session
  const orderState = getOrderState(sessionMetadata);

  // Check for pending order in database
  let existingOrder = orderState.orderId 
    ? await prisma.order.findUnique({ 
        where: { id: orderState.orderId },
        include: { items: true },
      })
    : await getPendingOrderForSession(sessionId);

  // Determine action from intent and user message
  const action = determineAction(intent, userText, orderState, takeawayConfig, existingOrder?.status);

  try {
    switch (action) {
      case 'confirm':
        return await handleConfirmation(
          orgId, sessionId, channel, context, takeawayConfig, orderState, existingOrder
        );

      case 'cancel':
        return await handleCancellation(
          orgId, sessionId, context, takeawayConfig, orderState, existingOrder
        );

      case 'modify':
        return await handleModification(
          orgId, sessionId, context, takeawayConfig, orderState, existingOrder
        );

      case 'add':
        return await handleAddItems(
          orgId, sessionId, channel, context, takeawayConfig, orderState, existingOrder
        );

      case 'status':
        return await handleStatusCheck(orderState, existingOrder);

      case 'retry_payment':
        return await handlePaymentRetry(
          orgId, sessionId, channel, existingOrder
        );

      default:
        // Start new order or continue draft
        return await handleAddItems(
          orgId, sessionId, channel, context, takeawayConfig, orderState, existingOrder
        );
    }
  } catch (error) {
    console.error('[takeaway-order] Error:', error);
    if (existingOrder) {
      await logOrderEvent(existingOrder.id, OrderEventType.error, { error: String(error) });
    }
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: 'Order processing error',
    };
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleAddItems(
  orgId: string,
  sessionId: string,
  channel: string,
  context: TakeawayModuleContext,
  config: TakeawayConfig,
  orderState: OrderSessionState,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> & { items?: { name: string; quantity: number; options: unknown; notes: string | null }[] } | null
): Promise<ModuleResult> {
  const { parsedOrder, sessionMetadata } = context;

  // Get customer phone from session or context
  const customerPhone = sessionMetadata.customerPhone as string || context.userText;

  // If we don't have items from LLM parsing, we need to ask
  if (!parsedOrder?.items || parsedOrder.items.length === 0) {
    // Check if we've asked too many times
    const clarificationCount = orderState.clarificationCount || 0;
    
    if (clarificationCount >= config.maxClarificationQuestions) {
      return {
        responseText: DEFAULT_RESPONSES.maxClarifications,
        handoffTriggered: true,
        handoffReason: 'Max clarification questions exceeded',
      };
    }

    return {
      responseText: existingOrder ? DEFAULT_RESPONSES.askMoreItems : DEFAULT_RESPONSES.askItems,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        orderAction: 'add',
        clarificationCount: clarificationCount + 1,
      },
    };
  }

  // Merge new items with existing
  const currentItems = existingOrder?.items?.map(i => ({
    name: i.name,
    quantity: i.quantity,
    options: i.options as Record<string, unknown> | undefined,
    notes: i.notes || undefined,
  })) || orderState.draftItems || [];

  const newItems = [...currentItems, ...parsedOrder.items];

  // Check max items limit
  const totalQuantity = newItems.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > config.maxItems) {
    return {
      responseText: DEFAULT_RESPONSES.tooManyItems(config.maxItems),
      handoffTriggered: false,
    };
  }

  // Build draft
  const draft: OrderDraft = {
    customerName: parsedOrder.customerName || orderState.customerName,
    customerPhone,
    pickupTime: parsedOrder.pickupTime || (orderState.pickupTime ? new Date(orderState.pickupTime) : undefined),
    pickupMode: parsedOrder.pickupMode || orderState.pickupMode || config.defaultPickupMode,
    notes: parsedOrder.notes || orderState.orderNotes,
    items: newItems,
  };

  // Check what's missing
  const missing: string[] = [];
  
  if (config.requireName && !draft.customerName) {
    missing.push('name');
  }
  
  if (config.defaultPickupMode === 'time' && !draft.pickupTime) {
    missing.push('pickup time');
  }

  // Validate pickup time if provided
  if (draft.pickupTime) {
    const pickupValidation = validatePickupTime(draft.pickupTime, config.minNoticeMinutes);
    if (!pickupValidation.valid) {
      return {
        responseText: DEFAULT_RESPONSES.pickupTooSoon(config.minNoticeMinutes),
        handoffTriggered: false,
        sessionMetadataUpdates: {
          draftItems: newItems,
          pickupMode: draft.pickupMode,
        },
      };
    }
  }

  // If missing required info, ask for it
  if (missing.length > 0) {
    const askFor = missing[0];
    let prompt: string;
    
    switch (askFor) {
      case 'name':
        prompt = DEFAULT_RESPONSES.askName;
        break;
      case 'pickup time':
        prompt = DEFAULT_RESPONSES.askPickupTime;
        break;
      default:
        prompt = `Please provide your ${askFor}.`;
    }

    return {
      responseText: prompt,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        draftItems: newItems,
        pickupMode: draft.pickupMode,
        orderNotes: draft.notes,
        awaiting: askFor,
      },
    };
  }

  // Create or update order
  let result;
  if (existingOrder && existingOrder.status === OrderStatus.draft) {
    result = await updateOrderDraft(existingOrder.id, draft);
  } else {
    result = await createOrderDraft(orgId, channel, draft, sessionId);
  }

  if (!result.success || !result.order) {
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: result.error || 'Failed to create order',
    };
  }

  // Request confirmation
  await requestOrderConfirmation(result.orderId!);

  // Build summary for confirmation
  const summary = buildOrderSummary(newItems, draft.notes);
  const pickupTimeStr = formatPickupTime(draft.pickupTime || null, draft.pickupMode || null);

  const confirmationMessage = renderTemplate(config.templates.customerNeedConfirmationText, {
    orderSummary: summary,
    pickupTime: pickupTimeStr,
    orderId: getShortOrderId(result.orderId!),
  });

  return {
    responseText: confirmationMessage,
    handoffTriggered: false,
    sessionMetadataUpdates: {
      orderId: result.orderId,
      orderStatus: 'pending_confirmation',
      awaitingConfirmation: true,
      lastConfirmationSentAt: new Date().toISOString(),
      draftItems: undefined, // Clear draft, it's in DB now
      clarificationCount: 0,
    },
  };
}

async function handleConfirmation(
  orgId: string,
  sessionId: string,
  channel: string,
  context: TakeawayModuleContext,
  config: TakeawayConfig,
  orderState: OrderSessionState,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> | null
): Promise<ModuleResult> {
  if (!existingOrder || !orderState.orderId) {
    return {
      responseText: "I don't see an order to confirm. Would you like to place a new order?",
      handoffTriggered: false,
    };
  }

  // Check if already confirmed (idempotent)
  if (existingOrder.status === OrderStatus.confirmed) {
    const shortId = getShortOrderId(existingOrder.id);
    return {
      responseText: DEFAULT_RESPONSES.orderConfirmed(shortId),
      handoffTriggered: false,
      sessionMetadataUpdates: {
        orderConfirmed: true,
        awaitingConfirmation: false,
      },
    };
  }

  // Check if order can be confirmed
  if (existingOrder.status !== OrderStatus.pending_confirmation && existingOrder.status !== OrderStatus.draft) {
    return {
      responseText: DEFAULT_RESPONSES.orderExpired,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        orderId: undefined,
        orderStatus: undefined,
        awaitingConfirmation: false,
      },
    };
  }

  // Get payment config
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { takeawayPaymentConfig: true },
  });
  const paymentConfig = parseTakeawayPaymentConfig(orgSettings?.takeawayPaymentConfig);

  // Check if payment is required
  const requiresPayment = isPaymentRequired(paymentConfig, existingOrder.paymentRequired);

  // If payment required, transition to pending_payment and create checkout session
  if (requiresPayment) {
    return await handlePaymentRequired(
      orgId, sessionId, channel, existingOrder, config, paymentConfig
    );
  }

  // No payment required - confirm directly
  return await confirmOrderDirectly(orgId, sessionId, channel, existingOrder, config, context);
}

/**
 * Handle order confirmation when payment is required
 * Creates Stripe Checkout session and sends payment link
 */
async function handlePaymentRequired(
  orgId: string,
  sessionId: string,
  channel: string,
  existingOrder: NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>>,
  config: TakeawayConfig,
  paymentConfig: TakeawayPaymentConfig
): Promise<ModuleResult> {
  const orderId = existingOrder.id;
  const shortId = getShortOrderId(orderId);

  // Get order total - for manual_total_required mode, it should be set
  const amountCents = existingOrder.paymentAmountCents;
  
  if (!amountCents || amountCents <= 0) {
    // For manual mode, we need the total to be set already
    // This should have been set during order creation or needs to be asked
    console.error(`[takeaway-order] Order ${orderId} requires payment but has no amount`);
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: 'Order requires payment but no amount set',
    };
  }

  // Transition to pending_payment status
  await setOrderPendingPayment(orderId, amountCents, paymentConfig.currency);

  // Create Stripe Checkout session
  const checkoutResult = await createOrderCheckoutSession({
    orderId,
    orgId,
    amountCents,
    currency: paymentConfig.currency,
    customerPhone: existingOrder.customerPhone,
    customerEmail: existingOrder.customerEmail || undefined,
    sessionId,
    channel,
    productName: paymentConfig.productName,
    orderSummary: `Order #${shortId}`,
    config: paymentConfig,
  });

  if (!checkoutResult.success || !checkoutResult.paymentUrl) {
    console.error(`[takeaway-order] Failed to create checkout session for order ${orderId}:`, checkoutResult.error);
    
    // Fallback to handoff
    return {
      responseText: "I'm having trouble setting up payment. Let me connect you with someone who can help.",
      handoffTriggered: true,
      handoffReason: `Payment setup failed: ${checkoutResult.error}`,
    };
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: 'system',
      action: 'takeaway.payment_link_sent',
      details: {
        orderId,
        channel,
        amountCents,
        currency: paymentConfig.currency,
        expiresAt: checkoutResult.expiresAt?.toISOString(),
      },
    },
  });

  // Send payment link via SMS (in addition to conversation response)
  // This ensures customer receives the link even if they close the chat
  const smsResult = await sendPaymentLinkSms({
    orgId,
    customerPhone: existingOrder.customerPhone,
    orderId,
    shortOrderId: shortId,
    paymentUrl: checkoutResult.paymentUrl,
    expiresMinutes: paymentConfig.expiresMinutes,
  });

  if (smsResult.success) {
    await logOrderEvent(orderId, OrderEventType.payment_link_created, {
      smsSent: true,
      messageSid: smsResult.messageSid,
    });
  } else {
    // Log failure but don't block - customer still gets link in conversation
    console.warn(`[takeaway-order] Failed to send payment SMS for order ${orderId}:`, smsResult.error);
    await logOrderEvent(orderId, OrderEventType.payment_link_created, {
      smsSent: false,
      smsError: smsResult.error,
      blockedBy: smsResult.blockedBy,
    });
  }

  // Build payment message
  const paymentMessage = renderPaymentMessage(paymentConfig.messages.pending, {
    orderId: shortId,
    paymentUrl: checkoutResult.paymentUrl,
    expiresMinutes: paymentConfig.expiresMinutes,
  });

  return {
    responseText: paymentMessage,
    handoffTriggered: false,
    sessionMetadataUpdates: {
      orderStatus: 'pending_payment',
      awaitingConfirmation: false,
      awaitingPayment: true,
      paymentLinkSentAt: new Date().toISOString(),
    },
  };
}

/**
 * Confirm order directly (no payment required)
 */
async function confirmOrderDirectly(
  orgId: string,
  sessionId: string,
  channel: string,
  existingOrder: NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>>,
  config: TakeawayConfig,
  context: TakeawayModuleContext
): Promise<ModuleResult> {
  // Confirm the order
  const result = await confirmOrder(existingOrder.id);

  if (!result.success) {
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: result.error,
    };
  }

  // Mark payment as not required
  await prisma.order.update({
    where: { id: existingOrder.id },
    data: { 
      paymentStatus: OrderPaymentStatus.not_required,
      paymentRequired: false,
    },
  });

  // Notify business
  const notificationResult = await notifyBusinessOfOrder(orgId, existingOrder.id, config, context.canUseModule);

  if (!notificationResult.success) {
    // Log but don't fail - order is still confirmed
    console.error('[takeaway-order] Business notification failed:', notificationResult.error);
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: 'system',
      action: 'takeaway.confirmed',
      details: {
        orderId: existingOrder.id,
        channel,
        customerPhone: existingOrder.customerPhone,
        totalItems: existingOrder.totalItems,
        paymentRequired: false,
      },
    },
  });

  const shortId = getShortOrderId(existingOrder.id);
  const pickupTimeStr = formatPickupTime(existingOrder.pickupTime, existingOrder.pickupMode);

  const confirmationMessage = renderTemplate(config.templates.customerConfirmationText, {
    orderId: shortId,
    pickupTime: pickupTimeStr,
  });

  return {
    responseText: confirmationMessage,
    handoffTriggered: false,
    sessionMetadataUpdates: {
      orderStatus: 'confirmed',
      orderConfirmed: true,
      awaitingConfirmation: false,
    },
  };
}

async function handleCancellation(
  orgId: string,
  sessionId: string,
  context: TakeawayModuleContext,
  config: TakeawayConfig,
  orderState: OrderSessionState,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> | null
): Promise<ModuleResult> {
  // If order is already confirmed, require handoff
  if (existingOrder?.status === OrderStatus.confirmed) {
    await logOrderEvent(existingOrder.id, OrderEventType.handoff_triggered, {
      reason: 'cancel_after_confirm',
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: 'takeaway.handoff_triggered',
        details: {
          orderId: existingOrder.id,
          reason: 'Customer requested cancel after confirmation',
        },
      },
    });

    return {
      responseText: DEFAULT_RESPONSES.cancelAfterConfirm,
      handoffTriggered: true,
      handoffReason: 'Cancel after confirmation requires handoff',
    };
  }

  // Cancel draft/pending order
  if (existingOrder) {
    await cancelOrder(existingOrder.id, 'Customer requested cancellation');
  }

  return {
    responseText: renderTemplate(config.templates.customerCanceledText, {}),
    handoffTriggered: false,
    sessionMetadataUpdates: {
      orderId: undefined,
      orderStatus: undefined,
      draftItems: undefined,
      awaitingConfirmation: false,
    },
  };
}

async function handleModification(
  orgId: string,
  sessionId: string,
  context: TakeawayModuleContext,
  config: TakeawayConfig,
  orderState: OrderSessionState,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> | null
): Promise<ModuleResult> {
  // Post-confirmation modification requires handoff
  if (existingOrder?.status === OrderStatus.confirmed) {
    await logOrderEvent(existingOrder.id, OrderEventType.handoff_triggered, {
      reason: 'modify_after_confirm',
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: 'takeaway.handoff_triggered',
        details: {
          orderId: existingOrder.id,
          reason: 'Customer requested modification after confirmation',
        },
      },
    });

    return {
      responseText: DEFAULT_RESPONSES.modifyAfterConfirm,
      handoffTriggered: true,
      handoffReason: 'Modification after confirmation requires handoff',
    };
  }

  // For draft/pending, treat as adding more items
  return handleAddItems(
    orgId, sessionId, context.channel, context, config, orderState, existingOrder
  );
}

async function handleStatusCheck(
  orderState: OrderSessionState,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> | null
): Promise<ModuleResult> {
  if (!existingOrder) {
    return {
      responseText: "I don't see any current orders. Would you like to place a new order?",
      handoffTriggered: false,
    };
  }

  const shortId = getShortOrderId(existingOrder.id);
  const status = existingOrder.status;

  let statusMessage: string;
  switch (status) {
    case OrderStatus.draft:
      statusMessage = `Your order #${shortId} is in progress. Would you like to add anything else?`;
      break;
    case OrderStatus.pending_confirmation:
      statusMessage = `Your order #${shortId} is waiting for your confirmation. Reply YES to confirm.`;
      break;
    case OrderStatus.confirmed:
      const pickupTimeStr = formatPickupTime(existingOrder.pickupTime, existingOrder.pickupMode);
      statusMessage = `Your order #${shortId} is confirmed. Pickup: ${pickupTimeStr}`;
      break;
    case OrderStatus.expired:
      statusMessage = DEFAULT_RESPONSES.orderExpired;
      break;
    case OrderStatus.canceled:
      statusMessage = "Your order was canceled. Would you like to place a new order?";
      break;
    default:
      statusMessage = `Your order #${shortId} status: ${status}`;
  }

  return {
    responseText: statusMessage,
    handoffTriggered: false,
  };
}

/**
 * Handle payment retry request
 * Called when customer replies YES after payment link expired
 */
async function handlePaymentRetry(
  orgId: string,
  sessionId: string,
  channel: string,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> | null
): Promise<ModuleResult> {
  if (!existingOrder) {
    return {
      responseText: "I don't see an order to retry payment for. Would you like to place a new order?",
      handoffTriggered: false,
    };
  }

  const orderId = existingOrder.id;
  const shortId = getShortOrderId(orderId);

  // Get payment config
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { takeawayPaymentConfig: true },
  });
  const paymentConfig = parseTakeawayPaymentConfig(orgSettings?.takeawayPaymentConfig);

  // Check if retry is allowed
  const currentAttemptCount = existingOrder.paymentAttemptCount;
  
  if (!canRetryPayment(paymentConfig, currentAttemptCount)) {
    // Max retries exceeded - handoff
    await logOrderEvent(orderId, OrderEventType.handoff_triggered, {
      reason: 'max_payment_retries_exceeded',
      attemptCount: currentAttemptCount,
    });

    return {
      responseText: renderPaymentMessage(paymentConfig.messages.maxRetriesExceeded, {
        orderId: shortId,
      }),
      handoffTriggered: true,
      handoffReason: 'Max payment retries exceeded',
      sessionMetadataUpdates: {
        awaitingPaymentRetry: false,
      },
    };
  }

  // Get order total
  const amountCents = existingOrder.paymentAmountCents;
  
  if (!amountCents || amountCents <= 0) {
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: 'Order has no payment amount for retry',
    };
  }

  // Create new checkout session (retry)
  // Note: createOrderCheckoutSession internally tracks attemptCount
  const checkoutResult = await createOrderCheckoutSession({
    orderId,
    orgId,
    amountCents,
    currency: paymentConfig.currency,
    customerPhone: existingOrder.customerPhone,
    customerEmail: existingOrder.customerEmail || undefined,
    sessionId,
    channel,
    productName: paymentConfig.productName,
    orderSummary: `Order #${shortId} (retry)`,
    config: paymentConfig,
  });

  if (!checkoutResult.success || !checkoutResult.paymentUrl) {
    return {
      responseText: "I'm having trouble setting up payment. Let me connect you with someone who can help.",
      handoffTriggered: true,
      handoffReason: `Payment retry setup failed: ${checkoutResult.error}`,
    };
  }

  // Build retry message
  const retryMessage = renderPaymentMessage(paymentConfig.messages.retryLinkSent, {
    orderId: shortId,
    paymentUrl: checkoutResult.paymentUrl,
    expiresMinutes: paymentConfig.expiresMinutes,
  });

  return {
    responseText: retryMessage,
    handoffTriggered: false,
    sessionMetadataUpdates: {
      orderStatus: 'pending_payment',
      awaitingPayment: true,
      awaitingPaymentRetry: false,
      paymentLinkSentAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getOrderState(sessionMetadata: Record<string, unknown>): OrderSessionState {
  return {
    orderId: sessionMetadata.orderId as string | undefined,
    orderStatus: sessionMetadata.orderStatus as string | undefined,
    draftItems: sessionMetadata.draftItems as OrderItemDraft[] | undefined,
    pickupTime: sessionMetadata.pickupTime as string | undefined,
    pickupMode: sessionMetadata.pickupMode as 'asap' | 'time' | undefined,
    customerName: sessionMetadata.customerName as string | undefined,
    orderNotes: sessionMetadata.orderNotes as string | undefined,
    clarificationCount: sessionMetadata.clarificationCount as number | undefined,
    awaitingConfirmation: sessionMetadata.awaitingConfirmation as boolean | undefined,
    orderConfirmed: sessionMetadata.orderConfirmed as boolean | undefined,
    lastConfirmationSentAt: sessionMetadata.lastConfirmationSentAt as string | undefined,
    // Phase 7.3: Payment state
    awaitingPayment: sessionMetadata.awaitingPayment as boolean | undefined,
    awaitingPaymentRetry: sessionMetadata.awaitingPaymentRetry as boolean | undefined,
    paymentLinkSentAt: sessionMetadata.paymentLinkSentAt as string | undefined,
  };
}

function determineAction(
  intent: string | undefined,
  userText: string,
  orderState: OrderSessionState,
  config: TakeawayConfig,
  currentStatus?: OrderStatus
): 'add' | 'confirm' | 'cancel' | 'modify' | 'status' | 'retry_payment' | undefined {
  // Check for explicit YES/NO if awaiting confirmation
  if (orderState.awaitingConfirmation) {
    if (isConfirmationYes(userText, config.confirmation)) {
      return 'confirm';
    }
    if (isConfirmationNo(userText, config.confirmation)) {
      return 'cancel';
    }
  }

  // Check for YES if awaiting payment retry (payment expired)
  if (orderState.awaitingPaymentRetry) {
    if (isConfirmationYes(userText, config.confirmation)) {
      return 'retry_payment';
    }
    if (isConfirmationNo(userText, config.confirmation)) {
      return 'cancel';
    }
  }

  // Check intent
  if (intent?.includes('order.confirm') || intent?.includes('confirm')) {
    return 'confirm';
  }
  if (intent?.includes('order.cancel') || intent?.includes('cancel')) {
    return 'cancel';
  }
  if (intent?.includes('order.modify') || intent?.includes('modify') || intent?.includes('change')) {
    return 'modify';
  }
  if (intent?.includes('order.status') || intent?.includes('status')) {
    return 'status';
  }
  if (intent?.includes('order.add') || intent?.includes('order')) {
    return 'add';
  }

  // Default based on current state
  if (currentStatus === OrderStatus.confirmed) {
    return 'status';
  }

  return 'add';
}

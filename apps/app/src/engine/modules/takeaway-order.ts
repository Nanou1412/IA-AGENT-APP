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
  parseMenuConfig,
  findMenuItem,
  calculateItemPrice,
  formatPrice,
  type MenuConfig,
} from '@/lib/takeaway/menu-config';
import {
  createOrderDraft,
  updateOrderDraft,
  confirmOrder,
  cancelOrder,
  requestOrderConfirmation,
  getPendingOrderForSession,
  logOrderEvent,
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
  itemNotOnMenu: (itemName: string, suggestion?: string) =>
    suggestion 
      ? `I couldn't find "${itemName}" on our menu. Did you mean "${suggestion}"?`
      : `I couldn't find "${itemName}" on our menu. Would you like me to tell you what we have available?`,
  
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
// Menu Validation Helpers
// ============================================================================

interface ValidatedItem extends OrderItemDraft {
  menuItemId?: string;
  unitPriceCents?: number;
}

interface MenuValidationResult {
  valid: boolean;
  validItems: ValidatedItem[];
  invalidItems: string[];
  totalCents: number;
}

/**
 * Validate order items against the menu
 * Returns enriched items with prices if menu is enabled
 */
function validateItemsAgainstMenu(
  items: OrderItemDraft[],
  menuConfig: MenuConfig
): MenuValidationResult {
  const validItems: ValidatedItem[] = [];
  const invalidItems: string[] = [];
  let totalCents = 0;

  for (const item of items) {
    if (!menuConfig.enabled) {
      // No menu - accept all items without validation
      validItems.push(item);
      continue;
    }

    const menuItem = findMenuItem(menuConfig, item.name);

    if (menuItem) {
      // Item found in menu - enrich with price
      const unitPriceCents = calculateItemPrice(
        menuItem,
        item.options as Record<string, string | string[]> | undefined
      );
      
      validItems.push({
        ...item,
        name: menuItem.name, // Use canonical name from menu
        menuItemId: menuItem.id,
        unitPriceCents,
      });
      
      totalCents += unitPriceCents * item.quantity;
    } else if (menuConfig.allowOffMenuItems) {
      // Item not found but off-menu items allowed
      validItems.push(item);
    } else {
      // Item not found and off-menu not allowed
      invalidItems.push(item.name);
    }
  }

  return {
    valid: invalidItems.length === 0,
    validItems,
    invalidItems,
    totalCents,
  };
}

// ============================================================================
// Order Item Extraction from User Text
// ============================================================================

interface ExtractedOrderItem {
  name: string;
  quantity: number;
  notes?: string;
}

/**
 * Extract order items from user text using menu-based matching
 * Uses fuzzy matching against menu items and common quantity patterns
 */
function extractItemsFromText(
  userText: string,
  menuConfig: MenuConfig
): ExtractedOrderItem[] {
  const items: ExtractedOrderItem[] = [];
  const text = userText.toLowerCase();
  
  // Common quantity patterns
  const quantityPatterns = [
    { pattern: /(?:two|2)\s+/, quantity: 2 },
    { pattern: /(?:three|3)\s+/, quantity: 3 },
    { pattern: /(?:four|4)\s+/, quantity: 4 },
    { pattern: /(?:five|5)\s+/, quantity: 5 },
    { pattern: /(?:a|one|1)\s+/, quantity: 1 },
  ];
  
  // For each menu item, check if it's mentioned in the text
  for (const menuItem of menuConfig.items) {
    if (!menuItem.available) continue;
    
    const nameLower = menuItem.name.toLowerCase();
    const allTerms = [
      nameLower,
      ...(menuItem.keywords || []).map(k => k.toLowerCase()),
    ];
    
    for (const term of allTerms) {
      if (text.includes(term)) {
        // Try to find quantity before the term
        let quantity = 1;
        const termIndex = text.indexOf(term);
        const textBefore = text.substring(Math.max(0, termIndex - 20), termIndex);
        
        for (const qp of quantityPatterns) {
          if (qp.pattern.test(textBefore)) {
            quantity = qp.quantity;
            break;
          }
        }
        
        // Check if we already added this item (avoid duplicates from keyword matches)
        const alreadyAdded = items.some(i => 
          i.name.toLowerCase() === nameLower || 
          findMenuItem(menuConfig, i.name)?.id === menuItem.id
        );
        
        if (!alreadyAdded) {
          items.push({
            name: menuItem.name, // Use canonical name
            quantity,
          });
        }
        break; // Found a match for this menu item
      }
    }
  }
  
  return items;
}

/**
 * Build order summary with prices if available
 */
function buildOrderSummaryWithPrices(
  items: ValidatedItem[],
  notes: string | undefined,
  currency: string = 'AUD'
): string {
  const lines = items.map((item) => {
    let line = `${item.quantity}x ${item.name}`;
    
    if (item.unitPriceCents) {
      const itemTotal = item.unitPriceCents * item.quantity;
      line += ` - ${formatPrice(itemTotal, currency)}`;
    }
    
    if (item.options && Object.keys(item.options).length > 0) {
      const optionsList = Object.entries(item.options)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join(', ');
      line += ` (${optionsList})`;
    }
    
    if (item.notes) {
      line += ` [${item.notes}]`;
    }
    
    return line;
  });

  // Add total if we have prices
  const hasAnyPrices = items.some((i) => i.unitPriceCents !== undefined);
  if (hasAnyPrices) {
    const total = items.reduce(
      (sum, item) => sum + (item.unitPriceCents || 0) * item.quantity,
      0
    );
    lines.push('');
    lines.push(`Total: ${formatPrice(total, currency)}`);
  }

  if (notes) {
    lines.push('');
    lines.push(`Notes: ${notes}`);
  }

  return lines.join('\n');
}

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
    select: { takeawayConfig: true, menuConfig: true, handoffPhone: true },
  });

  const takeawayConfig = parseTakeawayConfig(orgSettings?.takeawayConfig);
  const menuConfig = parseMenuConfig(orgSettings?.menuConfig);
  
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
  const existingOrder = orderState.orderId 
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
          orgId, sessionId, context, takeawayConfig, menuConfig, orderState, existingOrder
        );

      case 'add':
        return await handleAddItems(
          orgId, sessionId, channel, context, takeawayConfig, menuConfig, orderState, existingOrder
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
          orgId, sessionId, channel, context, takeawayConfig, menuConfig, orderState, existingOrder
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
  menuConfig: MenuConfig,
  orderState: OrderSessionState,
  existingOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> & { items?: { name: string; quantity: number; options: unknown; notes: string | null }[] } | null
): Promise<ModuleResult> {
  const { parsedOrder, sessionMetadata, userText } = context;

  // Get customer phone from session or context
  const customerPhone = sessionMetadata.customerPhone as string || userText;

  // Try to extract items from user text if not provided in parsedOrder
  let orderItems = parsedOrder?.items || [];
  
  if (orderItems.length === 0 && menuConfig.enabled) {
    // Try to extract items from user text using menu-based matching
    const extractedItems = extractItemsFromText(userText, menuConfig);
    if (extractedItems.length > 0) {
      orderItems = extractedItems;
      console.log('[takeaway-order] Extracted items from text:', extractedItems);
    }
  }

  // If we're waiting for specific info (name, pickup time), try to extract it from user text
  const awaiting = sessionMetadata.awaiting as string | undefined;
  let capturedName = parsedOrder?.customerName || orderState.customerName;
  
  if (awaiting === 'name' && !capturedName) {
    // Try to extract name from user text (simple heuristics)
    const namePatterns = [
      /my name is (\w+(?:\s+\w+)?)/i,
      /i am (\w+(?:\s+\w+)?)/i,
      /i'm (\w+(?:\s+\w+)?)/i,
      /it's (\w+(?:\s+\w+)?)/i,
      /this is (\w+(?:\s+\w+)?)/i,
      /call me (\w+(?:\s+\w+)?)/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = userText.match(pattern);
      if (match) {
        capturedName = match[1].trim();
        console.log('[takeaway-order] Extracted name from text:', capturedName);
        break;
      }
    }
    
    // If still no match, assume the whole input is the name (if short enough)
    if (!capturedName && userText.length < 50 && userText.split(/\s+/).length <= 4) {
      capturedName = userText.trim();
      console.log('[takeaway-order] Using user text as name:', capturedName);
    }
  }

  // Check if we have items from draft or existing order
  const hasDraftItems = orderState.draftItems && orderState.draftItems.length > 0;
  const hasExistingItems = existingOrder?.items && existingOrder.items.length > 0;
  
  // If we don't have new items but have draft/existing items, use those
  if (orderItems.length === 0 && (hasDraftItems || hasExistingItems)) {
    console.log('[takeaway-order] Using existing draft items');
    // Don't ask for items again - we already have them
  } else if (orderItems.length === 0) {
    // No items at all - ask for them
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

  // Validate items against menu (if menu is enabled)
  const menuValidation = validateItemsAgainstMenu(orderItems, menuConfig);
  
  // If some items are not on menu and off-menu items not allowed
  if (!menuValidation.valid && menuValidation.invalidItems.length > 0) {
    const firstInvalid = menuValidation.invalidItems[0];
    return {
      responseText: menuConfig.itemNotFoundMessage || DEFAULT_RESPONSES.itemNotOnMenu(firstInvalid),
      handoffTriggered: false,
      sessionMetadataUpdates: {
        clarificationCount: (orderState.clarificationCount || 0) + 1,
      },
    };
  }

  // Use validated items (with prices if available)
  const validatedNewItems = menuValidation.validItems;

  // Merge new items with existing
  const currentItems = existingOrder?.items?.map(i => ({
    name: i.name,
    quantity: i.quantity,
    options: i.options as Record<string, unknown> | undefined,
    notes: i.notes || undefined,
  })) || orderState.draftItems || [];

  const newItems = [...currentItems, ...validatedNewItems];

  // Check max items limit
  const totalQuantity = newItems.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > config.maxItems) {
    return {
      responseText: DEFAULT_RESPONSES.tooManyItems(config.maxItems),
      handoffTriggered: false,
    };
  }

  // Calculate total from validated items (menu prices)
  // Re-calculate to include existing items too
  const allItemsValidation = validateItemsAgainstMenu(newItems, menuConfig);
  const totalAmountCents = allItemsValidation.totalCents;

  // Build draft - use captured name if available
  const draft: OrderDraft = {
    customerName: capturedName || parsedOrder?.customerName || orderState.customerName,
    customerPhone,
    pickupTime: parsedOrder?.pickupTime || (orderState.pickupTime ? new Date(orderState.pickupTime) : undefined),
    pickupMode: parsedOrder?.pickupMode || orderState.pickupMode || config.defaultPickupMode,
    notes: parsedOrder?.notes || orderState.orderNotes,
    items: newItems,
    totalAmountCents: totalAmountCents > 0 ? totalAmountCents : undefined,
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

  // Build summary for confirmation (with prices if available)
  const summaryItems = allItemsValidation.validItems;
  const summary = buildOrderSummaryWithPrices(summaryItems, draft.notes, menuConfig.currency);
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

  let paymentUrl: string;
  let expiresAt: Date | undefined;

  // TEST MODE: Generate fake payment link without calling Stripe
  if (paymentConfig.testMode) {
    console.log(`[takeaway-order] TEST MODE: Generating fake payment link for order ${orderId}`);
    const baseUrl = process.env.APP_URL || 'https://your-app.vercel.app';
    paymentUrl = `${baseUrl}/test-payment?order=${shortId}&amount=${amountCents}`;
    expiresAt = new Date(Date.now() + paymentConfig.expiresMinutes * 60 * 1000);
    
    // Auto-confirm order in test mode after a delay (simulating payment)
    // For now, just set to pending - user can manually trigger confirmation
  } else {
    // PRODUCTION: Create real Stripe Checkout session
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

    paymentUrl = checkoutResult.paymentUrl;
    expiresAt = checkoutResult.expiresAt;
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
        testMode: paymentConfig.testMode,
        expiresAt: expiresAt?.toISOString(),
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
    paymentUrl: paymentUrl,
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
    paymentUrl: paymentUrl,
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
  menuConfig: MenuConfig,
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
    orgId, sessionId, context.channel, context, config, menuConfig, orderState, existingOrder
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

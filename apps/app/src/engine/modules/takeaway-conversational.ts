/**
 * Conversational Takeaway Order Module
 * 
 * Uses LLM with function calls for natural conversation while maintaining strict rules.
 * The AI can ONLY:
 * - Add items that exist in the menu
 * - Remove items from the current order
 * - Confirm or cancel orders
 * - Answer questions about the menu
 * 
 * The AI CANNOT:
 * - Accept items not on the menu
 * - Make up prices
 * - Skip payment if required
 */

import type { ModuleContext, ModuleResult } from '../module-runner';
import { prisma } from '@/lib/prisma';
import { OrderStatus, OrderPaymentStatus } from '@prisma/client';
import { getOpenAIProvider, createOpenAIProvider, ENGINE_CONFIG } from '../llm';
import type { LLMMessage, LLMFunctionDef } from '@repo/core';
import {
  parseTakeawayConfig,
  type TakeawayConfig,
} from '@/lib/takeaway/takeaway-config';
import {
  parseTakeawayPaymentConfig,
  isPaymentRequired,
  type TakeawayPaymentConfig,
} from '@/lib/takeaway/takeaway-payment-config';
import {
  parseMenuConfig,
  findMenuItem,
  formatPrice,
  type MenuConfig,
  type MenuItem,
} from '@/lib/takeaway/menu-config';
import {
  createOrderDraft,
  confirmOrder,
  cancelOrder,
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
import { sendPaymentLinkSms } from '@/lib/sms/customer-notifications';

// ============================================================================
// Types
// ============================================================================

interface OrderState {
  items: OrderItemDraft[];
  customerName?: string;
  pickupMode: 'asap' | 'time';
  pickupTime?: Date;
  notes?: string;
  orderId?: string;
  status?: string;
  awaitingConfirmation?: boolean;
}

interface FunctionCallResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ============================================================================
// Function Definitions for OpenAI
// ============================================================================

function getOrderFunctions(menuConfig: MenuConfig): LLMFunctionDef[] {
  // Build menu items list for the enum
  const menuItemNames = menuConfig.items
    .filter(item => item.available)
    .map(item => item.name);

  return [
    {
      name: 'add_to_order',
      description: 'Add an item to the customer order. ONLY use items from the menu. If the customer asks for something not on the menu, politely decline and suggest similar items.',
      parameters: {
        type: 'object' as const,
        properties: {
          item_name: {
            type: 'string',
            description: 'The exact name of the menu item to add',
            enum: menuItemNames,
          },
          quantity: {
            type: 'integer',
            description: 'Number of this item to add',
            minimum: 1,
            maximum: 10,
          },
          notes: {
            type: 'string',
            description: 'Special instructions for this item (optional)',
          },
        },
        required: ['item_name', 'quantity'],
      },
    },
    {
      name: 'remove_from_order',
      description: 'Remove an item from the current order',
      parameters: {
        type: 'object' as const,
        properties: {
          item_name: {
            type: 'string',
            description: 'The name of the item to remove',
          },
        },
        required: ['item_name'],
      },
    },
    {
      name: 'get_order_summary',
      description: 'Get the current order summary with all items and total price',
      parameters: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'set_customer_name',
      description: 'Set the customer name for the order',
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Customer name',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'confirm_order',
      description: 'Confirm the order and proceed to payment. Only call this when the customer explicitly confirms.',
      parameters: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'cancel_order',
      description: 'Cancel the current order',
      parameters: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'get_menu',
      description: 'Get information about available menu items. Use this to answer questions about what is available.',
      parameters: {
        type: 'object' as const,
        properties: {
          category: {
            type: 'string',
            description: 'Optional category to filter (e.g., "mains", "drinks", "desserts")',
          },
        },
      },
    },
  ];
}

// ============================================================================
// Function Handlers
// ============================================================================

function handleAddToOrder(
  args: { item_name: string; quantity: number; notes?: string },
  orderState: OrderState,
  menuConfig: MenuConfig
): FunctionCallResult {
  const menuItem = findMenuItem(menuConfig, args.item_name);
  
  if (!menuItem) {
    return {
      success: false,
      message: `"${args.item_name}" is not available on our menu.`,
    };
  }

  if (!menuItem.available) {
    return {
      success: false,
      message: `Sorry, "${menuItem.name}" is currently unavailable.`,
    };
  }

  // Add to order state
  const existingIndex = orderState.items.findIndex(
    i => i.name.toLowerCase() === menuItem.name.toLowerCase()
  );

  if (existingIndex >= 0) {
    orderState.items[existingIndex].quantity += args.quantity;
    if (args.notes) {
      orderState.items[existingIndex].notes = args.notes;
    }
  } else {
    orderState.items.push({
      name: menuItem.name,
      quantity: args.quantity,
      notes: args.notes,
    });
  }

  const itemTotal = (menuItem.priceCents * args.quantity) / 100;
  
  return {
    success: true,
    message: `Added ${args.quantity}x ${menuItem.name} (${formatPrice(menuItem.priceCents * args.quantity, menuConfig.currency)}) to your order.`,
    data: { item: menuItem, quantity: args.quantity },
  };
}

function handleRemoveFromOrder(
  args: { item_name: string },
  orderState: OrderState
): FunctionCallResult {
  const index = orderState.items.findIndex(
    i => i.name.toLowerCase().includes(args.item_name.toLowerCase())
  );

  if (index < 0) {
    return {
      success: false,
      message: `"${args.item_name}" is not in your current order.`,
    };
  }

  const removed = orderState.items.splice(index, 1)[0];
  
  return {
    success: true,
    message: `Removed ${removed.name} from your order.`,
  };
}

function handleGetOrderSummary(
  orderState: OrderState,
  menuConfig: MenuConfig
): FunctionCallResult {
  if (orderState.items.length === 0) {
    return {
      success: true,
      message: 'Your order is currently empty.',
    };
  }

  let total = 0;
  const lines: string[] = [];

  for (const item of orderState.items) {
    const menuItem = findMenuItem(menuConfig, item.name);
    const price = menuItem?.priceCents || 0;
    const lineTotal = price * item.quantity;
    total += lineTotal;
    
    lines.push(`${item.quantity}x ${item.name} - ${formatPrice(lineTotal, menuConfig.currency)}`);
  }

  lines.push('');
  lines.push(`Total: ${formatPrice(total, menuConfig.currency)}`);

  return {
    success: true,
    message: lines.join('\n'),
    data: { total, items: orderState.items },
  };
}

function handleSetCustomerName(
  args: { name: string },
  orderState: OrderState
): FunctionCallResult {
  orderState.customerName = args.name;
  
  return {
    success: true,
    message: `Got it, ${args.name}!`,
  };
}

function handleGetMenu(
  args: { category?: string },
  menuConfig: MenuConfig
): FunctionCallResult {
  let items = menuConfig.items.filter(i => i.available);
  
  if (args.category) {
    items = items.filter(i => 
      i.categoryId?.toLowerCase() === args.category?.toLowerCase()
    );
  }

  if (items.length === 0) {
    return {
      success: true,
      message: args.category 
        ? `No items found in the "${args.category}" category.`
        : 'No items are currently available.',
    };
  }

  const lines = items.map(i => 
    `• ${i.name} - ${formatPrice(i.priceCents, menuConfig.currency)}${i.description ? ` (${i.description})` : ''}`
  );

  return {
    success: true,
    message: lines.join('\n'),
    data: { items },
  };
}

// ============================================================================
// Build System Prompt
// ============================================================================

function buildConversationalPrompt(
  menuConfig: MenuConfig,
  takeawayConfig: TakeawayConfig,
  orderState: OrderState
): string {
  // Build menu text
  const menuText = menuConfig.items
    .filter(i => i.available)
    .map(i => `- ${i.name}: ${formatPrice(i.priceCents, menuConfig.currency)}${i.description ? ` - ${i.description}` : ''}`)
    .join('\n');

  // Current order state
  const currentOrderText = orderState.items.length > 0
    ? orderState.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
    : 'Empty';

  return `You are a friendly restaurant assistant taking phone orders. Be conversational and helpful, like talking to a real person.

## STRICT RULES - YOU MUST FOLLOW THESE:
1. You can ONLY add items that are on the menu below. If someone asks for something not on the menu, politely say it's not available and suggest alternatives.
2. Never make up prices - use the menu prices exactly.
3. Never accept items like "water", "bread", etc. unless they are explicitly on the menu.
4. When the order seems complete, summarize it and ask for confirmation.
5. Always ask for the customer's name before confirming.
6. Be brief in voice - this is a phone call, not a chat.

## OUR MENU:
${menuText}

## CURRENT ORDER:
${currentOrderText}
${orderState.customerName ? `Customer: ${orderState.customerName}` : 'Customer name: Not provided yet'}

## HOW TO RESPOND:
- Keep responses SHORT for voice (1-2 sentences max)
- Be warm and friendly
- If they order something not on the menu, say "I'm sorry, we don't have that. Would you like to try our [suggest similar item]?"
- Use the functions to add items, never just say "I've added it" without calling the function
- After adding items, ask if they want anything else
- When they're done, summarize and ask to confirm

Remember: This is a PHONE conversation. Be natural but concise.`;
}

// ============================================================================
// Process Function Calls
// ============================================================================

async function processFunctionCall(
  functionName: string,
  functionArgs: Record<string, unknown>,
  orderState: OrderState,
  menuConfig: MenuConfig,
  context: {
    orgId: string;
    sessionId: string;
    channel: string;
    customerPhone: string;
  }
): Promise<FunctionCallResult> {
  switch (functionName) {
    case 'add_to_order':
      return handleAddToOrder(
        functionArgs as { item_name: string; quantity: number; notes?: string },
        orderState,
        menuConfig
      );

    case 'remove_from_order':
      return handleRemoveFromOrder(
        functionArgs as { item_name: string },
        orderState
      );

    case 'get_order_summary':
      return handleGetOrderSummary(orderState, menuConfig);

    case 'set_customer_name':
      return handleSetCustomerName(
        functionArgs as { name: string },
        orderState
      );

    case 'get_menu':
      return handleGetMenu(
        functionArgs as { category?: string },
        menuConfig
      );

    case 'confirm_order':
      // This will be handled specially in the main flow
      return { success: true, message: 'ORDER_CONFIRM_REQUESTED' };

    case 'cancel_order':
      return { success: true, message: 'ORDER_CANCEL_REQUESTED' };

    default:
      return { success: false, message: `Unknown function: ${functionName}` };
  }
}

// ============================================================================
// Main Module Handler
// ============================================================================

export async function takeawayConversationalModule(
  context: ModuleContext
): Promise<ModuleResult> {
  const { orgId, sessionId, channel, userText, conversationHistory, sessionMetadata, canUseModule } = context;

  // Check if takeaway module is allowed
  const gating = canUseModule('takeaway');
  if (!gating.allowed) {
    return {
      responseText: "I'm unable to process orders at this time. Please call us directly.",
      handoffTriggered: true,
      handoffReason: gating.reason,
      blockedBy: gating.blockedBy,
    };
  }

  // Get configs
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { 
      takeawayConfig: true, 
      menuConfig: true, 
      takeawayPaymentConfig: true,
      handoffPhone: true,
    },
  });

  const takeawayConfig = parseTakeawayConfig(orgSettings?.takeawayConfig);
  const menuConfig = parseMenuConfig(orgSettings?.menuConfig);
  const paymentConfig = parseTakeawayPaymentConfig(orgSettings?.takeawayPaymentConfig);

  if (!takeawayConfig.enabled || !menuConfig.enabled) {
    return {
      responseText: "Online ordering is not currently available. Please call us directly.",
      handoffTriggered: true,
      handoffReason: 'Takeaway or menu not enabled',
    };
  }

  // Get or initialize order state from session
  const orderState: OrderState = {
    items: (sessionMetadata.orderItems as OrderItemDraft[]) || [],
    customerName: sessionMetadata.customerName as string | undefined,
    pickupMode: (sessionMetadata.pickupMode as 'asap' | 'time') || 'asap',
    pickupTime: sessionMetadata.pickupTime ? new Date(sessionMetadata.pickupTime as string) : undefined,
    notes: sessionMetadata.orderNotes as string | undefined,
    orderId: sessionMetadata.orderId as string | undefined,
    status: sessionMetadata.orderStatus as string | undefined,
    awaitingConfirmation: sessionMetadata.awaitingConfirmation as boolean | undefined,
  };

  // Get customer phone from session
  const customerPhone = sessionMetadata.customerPhone as string || '';

  // Get LLM provider - use faster model for voice to stay under Twilio timeout
  // Voice has 15s timeout, gpt-4o can take 10-15s, gpt-4o-mini is 2-4s
  const provider = channel === 'voice' 
    ? createOpenAIProvider({ defaultModel: ENGINE_CONFIG.lowCostModel })
    : getOpenAIProvider();

  // Build messages for conversation
  const systemPrompt = buildConversationalPrompt(menuConfig, takeawayConfig, orderState);
  
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10), // Last 10 messages for context
    { role: 'user', content: userText },
  ];

  // Get function definitions
  const functions = getOrderFunctions(menuConfig);

  try {
    // Call LLM with function calling
    const response = await provider.chatCompletionWithFunctions(
      messages,
      functions,
      { temperature: 0.7 }
    );

    let responseText = response.content || '';
    let orderConfirmed = false;
    let orderCancelled = false;

    // Process any function calls
    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionResults: string[] = [];

      for (const fc of response.functionCalls) {
        const result = await processFunctionCall(
          fc.name,
          fc.arguments,
          orderState,
          menuConfig,
          { orgId, sessionId, channel, customerPhone }
        );

        if (result.message === 'ORDER_CONFIRM_REQUESTED') {
          orderConfirmed = true;
        } else if (result.message === 'ORDER_CANCEL_REQUESTED') {
          orderCancelled = true;
        } else {
          functionResults.push(result.message);
        }
      }

      // If we have function results but no response text, use the results
      if (!responseText && functionResults.length > 0) {
        responseText = functionResults.join(' ');
      }
    }

    // Handle order confirmation
    if (orderConfirmed && orderState.items.length > 0) {
      // Calculate total
      let totalCents = 0;
      for (const item of orderState.items) {
        const menuItem = findMenuItem(menuConfig, item.name);
        if (menuItem) {
          totalCents += menuItem.priceCents * item.quantity;
        }
      }

      // Create or update order
      const draft: OrderDraft = {
        customerName: orderState.customerName,
        customerPhone,
        pickupMode: orderState.pickupMode,
        pickupTime: orderState.pickupTime,
        notes: orderState.notes,
        items: orderState.items,
        totalAmountCents: totalCents,
      };

      const orderResult = await createOrderDraft(orgId, channel, draft, sessionId);

      if (orderResult.success && orderResult.orderId) {
        const shortId = getShortOrderId(orderResult.orderId);
        
        // Check if payment is required using the config
        const requiresPayment = isPaymentRequired(paymentConfig, true);
        
        if (requiresPayment) {
          // Set order pending payment
          await setOrderPendingPayment(orderResult.orderId, totalCents, paymentConfig.currency);

          // Generate payment link
          let paymentUrl: string | undefined;
          
          if (paymentConfig.testMode) {
            // Test mode - fake payment link
            const baseUrl = process.env.APP_URL || 'https://your-app.vercel.app';
            paymentUrl = `${baseUrl}/test-payment?order=${shortId}&amount=${totalCents}`;
          } else {
            // Production - Stripe checkout
            const checkoutResult = await createOrderCheckoutSession({
              orderId: orderResult.orderId,
              orgId,
              amountCents: totalCents,
              currency: paymentConfig.currency,
              customerPhone,
              sessionId,
              channel,
              config: paymentConfig,
            });

            if (checkoutResult.success && checkoutResult.paymentUrl) {
              paymentUrl = checkoutResult.paymentUrl;
            }
          }

          if (paymentUrl) {
            // Try to send payment SMS
            try {
              await sendPaymentLinkSms({
                orgId,
                customerPhone,
                orderId: orderResult.orderId,
                shortOrderId: shortId,
                paymentUrl,
                expiresMinutes: paymentConfig.expiresMinutes,
              });
            } catch (err) {
              console.log(`[takeaway-conversational] SMS send failed: ${err}`);
            }
          }

          responseText = `Perfect! Your order total is ${formatPrice(totalCents, paymentConfig.currency)}. I'm sending you a payment link by SMS. Your order will be confirmed once payment is complete.`;

          return {
            responseText,
            handoffTriggered: false,
            sessionMetadataUpdates: {
              orderItems: orderState.items,
              customerName: orderState.customerName,
              orderId: orderResult.orderId,
              orderStatus: 'pending_payment',
              awaitingPayment: true,
            },
          };
        } else {
          // No payment required - confirm directly
          await confirmOrder(orderResult.orderId);
          
          // Notify business with proper signature
          await notifyBusinessOfOrder(orgId, orderResult.orderId, takeawayConfig, context.canUseModule);

          responseText = `Great! Your order #${shortId} is confirmed! We'll have it ready for pickup ASAP. Thank you!`;

          return {
            responseText,
            handoffTriggered: false,
            sessionMetadataUpdates: {
              orderItems: [],
              customerName: undefined,
              orderId: orderResult.orderId,
              orderStatus: 'confirmed',
              orderConfirmed: true,
            },
          };
        }
      }
    }

    // Handle order cancellation
    if (orderCancelled) {
      // Clear order state
      return {
        responseText: "No problem, I've cancelled your order. Let me know if you'd like to start a new one!",
        handoffTriggered: false,
        sessionMetadataUpdates: {
          orderItems: [],
          customerName: undefined,
          orderId: undefined,
          orderStatus: undefined,
          awaitingConfirmation: false,
        },
      };
    }

    // Return normal response with updated state
    return {
      responseText: responseText || "I'm here to help you order. What would you like?",
      handoffTriggered: false,
      sessionMetadataUpdates: {
        orderItems: orderState.items,
        customerName: orderState.customerName,
        pickupMode: orderState.pickupMode,
        orderNotes: orderState.notes,
      },
    };

  } catch (error) {
    console.error('[takeaway-conversational] Error:', error);
    return {
      responseText: "I'm having trouble right now. Let me connect you with someone who can help.",
      handoffTriggered: true,
      handoffReason: `Conversational order error: ${error}`,
    };
  }
}

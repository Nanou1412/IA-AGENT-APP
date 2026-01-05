/**
 * Order Manager
 * 
 * Handles Order CRUD operations with idempotency and audit logging.
 * This is the data layer for the takeaway module.
 */

import { prisma } from '@/lib/prisma';
import { OrderStatus, OrderEventType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { sanitize } from '@/lib/sanitize';

// ============================================================================
// Types
// ============================================================================

export interface OrderItemDraft {
  name: string;
  quantity: number;
  options?: Record<string, unknown>;
  notes?: string;
}

export interface OrderDraft {
  customerName?: string;
  customerPhone: string;
  pickupTime?: Date;
  pickupMode?: 'asap' | 'time';
  notes?: string;
  items: OrderItemDraft[];
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  order?: Awaited<ReturnType<typeof prisma.order.findUnique>>;
  isDuplicate?: boolean;
  error?: string;
}

// ============================================================================
// Idempotency
// ============================================================================

/**
 * Generate a stable idempotency key for order deduplication
 * 
 * Key components:
 * - orgId: Organization identifier
 * - sessionId: Conversation session
 * - customerPhone: Customer phone number
 * - summaryHash: Hash of items summary
 * - pickupTime: ISO timestamp or 'asap'
 */
export function generateOrderIdempotencyKey(params: {
  orgId: string;
  sessionId?: string;
  customerPhone: string;
  summaryText: string;
  pickupTime?: Date;
}): string {
  const components = [
    params.orgId,
    params.sessionId || 'no-session',
    normalizePhone(params.customerPhone),
    createHash('sha256').update(params.summaryText).digest('hex').slice(0, 16),
    params.pickupTime?.toISOString().slice(0, 16) || 'asap',
  ];
  
  const payload = components.join(':');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// ============================================================================
// Order CRUD
// ============================================================================

/**
 * Create a new order draft
 */
export async function createOrderDraft(
  orgId: string,
  channel: string,
  draft: OrderDraft,
  sessionId?: string
): Promise<CreateOrderResult> {
  const summaryText = buildOrderSummary(draft.items, draft.notes);
  const idempotencyKey = generateOrderIdempotencyKey({
    orgId,
    sessionId,
    customerPhone: draft.customerPhone,
    summaryText,
    pickupTime: draft.pickupTime,
  });

  // Check for existing order with same idempotency key
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: { items: true },
  });

  if (existing) {
    return {
      success: true,
      orderId: existing.id,
      order: existing,
      isDuplicate: true,
    };
  }

  try {
    const order = await prisma.order.create({
      data: {
        orgId,
        sessionId,
        channel,
        status: OrderStatus.draft,
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        pickupTime: draft.pickupTime,
        pickupMode: draft.pickupMode || 'asap',
        notes: draft.notes,
        totalItems: draft.items.reduce((sum, item) => sum + item.quantity, 0),
        summaryText,
        idempotencyKey,
        items: {
          create: draft.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            options: item.options as Prisma.InputJsonValue || undefined,
            notes: item.notes,
          })),
        },
      },
      include: { items: true },
    });

    // Log event
    await logOrderEvent(order.id, OrderEventType.draft_created, {
      channel,
      itemCount: draft.items.length,
      totalItems: order.totalItems,
    });

    return {
      success: true,
      orderId: order.id,
      order,
      isDuplicate: false,
    };
  } catch (error) {
    console.error('[order-manager] createOrderDraft error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order',
    };
  }
}

/**
 * Update an existing order draft
 */
export async function updateOrderDraft(
  orderId: string,
  updates: Partial<OrderDraft>
): Promise<CreateOrderResult> {
  try {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!existing) {
      return { success: false, error: 'Order not found' };
    }

    if (existing.status !== OrderStatus.draft) {
      return { success: false, error: 'Can only update draft orders' };
    }

    // Build new summary if items changed
    let summaryText = existing.summaryText;
    let totalItems = existing.totalItems;

    if (updates.items) {
      summaryText = buildOrderSummary(updates.items, updates.notes || existing.notes || undefined);
      totalItems = updates.items.reduce((sum, item) => sum + item.quantity, 0);

      // Delete old items and create new ones
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.orderItem.createMany({
        data: updates.items.map(item => ({
          orderId,
          name: item.name,
          quantity: item.quantity,
          options: item.options as Prisma.InputJsonValue || undefined,
          notes: item.notes,
        })),
      });
    }

    // Regenerate idempotency key
    const newIdempotencyKey = generateOrderIdempotencyKey({
      orgId: existing.orgId,
      sessionId: existing.sessionId || undefined,
      customerPhone: updates.customerPhone || existing.customerPhone,
      summaryText,
      pickupTime: updates.pickupTime || existing.pickupTime || undefined,
    });

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        customerName: updates.customerName ?? existing.customerName,
        customerPhone: updates.customerPhone ?? existing.customerPhone,
        pickupTime: updates.pickupTime ?? existing.pickupTime,
        pickupMode: updates.pickupMode ?? existing.pickupMode,
        notes: updates.notes ?? existing.notes,
        summaryText,
        totalItems,
        idempotencyKey: newIdempotencyKey,
      },
      include: { items: true },
    });

    await logOrderEvent(orderId, OrderEventType.draft_updated, {
      changes: Object.keys(updates),
    });

    return { success: true, orderId: order.id, order };
  } catch (error) {
    console.error('[order-manager] updateOrderDraft error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update order',
    };
  }
}

/**
 * Request confirmation for an order (transition to pending_confirmation)
 */
export async function requestOrderConfirmation(orderId: string): Promise<CreateOrderResult> {
  try {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.pending_confirmation },
      include: { items: true },
    });

    await logOrderEvent(orderId, OrderEventType.confirmation_requested, {});

    return { success: true, orderId: order.id, order };
  } catch (error) {
    console.error('[order-manager] requestOrderConfirmation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to request confirmation',
    };
  }
}

/**
 * Confirm an order (transition to confirmed)
 * Returns existing if already confirmed (idempotent)
 */
export async function confirmOrder(orderId: string): Promise<CreateOrderResult> {
  try {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!existing) {
      return { success: false, error: 'Order not found' };
    }

    // Already confirmed - idempotent
    if (existing.status === OrderStatus.confirmed) {
      return { success: true, orderId: existing.id, order: existing, isDuplicate: true };
    }

    // Can only confirm from pending_confirmation or draft
    if (existing.status !== OrderStatus.pending_confirmation && existing.status !== OrderStatus.draft) {
      return { success: false, error: `Cannot confirm order in status: ${existing.status}` };
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.confirmed,
        confirmedAt: new Date(),
      },
      include: { items: true },
    });

    await logOrderEvent(orderId, OrderEventType.confirmed, {
      confirmedAt: order.confirmedAt?.toISOString(),
    });

    return { success: true, orderId: order.id, order };
  } catch (error) {
    console.error('[order-manager] confirmOrder error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm order',
    };
  }
}

/**
 * Set order to pending_payment status (Phase 7.3)
 * Called when payment is required before confirmation
 */
export async function setOrderPendingPayment(
  orderId: string,
  amountCents: number,
  currency: string = 'AUD'
): Promise<CreateOrderResult> {
  try {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!existing) {
      return { success: false, error: 'Order not found' };
    }

    // Already in pending_payment - idempotent
    if (existing.status === OrderStatus.pending_payment) {
      return { success: true, orderId: existing.id, order: existing, isDuplicate: true };
    }

    // Can only transition from pending_confirmation
    if (existing.status !== OrderStatus.pending_confirmation && existing.status !== OrderStatus.draft) {
      return { success: false, error: `Cannot set pending_payment from status: ${existing.status}` };
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.pending_payment,
        paymentRequired: true,
        paymentAmountCents: amountCents,
        paymentCurrency: currency,
        paymentStatus: 'pending',
      },
      include: { items: true },
    });

    await logOrderEvent(orderId, OrderEventType.pending_payment, {
      amountCents,
      currency,
    });

    return { success: true, orderId: order.id, order };
  } catch (error) {
    console.error('[order-manager] setOrderPendingPayment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set pending payment',
    };
  }
}

/**
 * Expire an order (draft timeout or confirmation timeout)
 */
export async function expireOrder(orderId: string, reason: string): Promise<CreateOrderResult> {
  try {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.expired,
        expiredAt: new Date(),
      },
      include: { items: true },
    });

    await logOrderEvent(orderId, OrderEventType.expired, { reason });

    return { success: true, orderId: order.id, order };
  } catch (error) {
    console.error('[order-manager] expireOrder error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to expire order',
    };
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(orderId: string, reason: string): Promise<CreateOrderResult> {
  try {
    const existing = await prisma.order.findUnique({ where: { id: orderId } });

    if (!existing) {
      return { success: false, error: 'Order not found' };
    }

    if (existing.status === OrderStatus.confirmed) {
      return { success: false, error: 'Cannot cancel confirmed order - requires handoff' };
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.canceled },
      include: { items: true },
    });

    await logOrderEvent(orderId, OrderEventType.canceled, { reason });

    return { success: true, orderId: order.id, order };
  } catch (error) {
    console.error('[order-manager] cancelOrder error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order',
    };
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get order by ID with items
 */
export async function getOrderById(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, eventLogs: true },
  });
}

/**
 * Get order by idempotency key
 */
export async function getOrderByIdempotencyKey(idempotencyKey: string) {
  return prisma.order.findUnique({
    where: { idempotencyKey },
    include: { items: true },
  });
}

/**
 * Get orders for an org
 */
export async function getOrdersForOrg(
  orgId: string,
  options: {
    limit?: number;
    status?: OrderStatus[];
    cursor?: string;
  } = {}
) {
  const { limit = 50, status, cursor } = options;

  return prisma.order.findMany({
    where: {
      orgId,
      ...(status && { status: { in: status } }),
    },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
  });
}

/**
 * Get pending order for a session (for continuing conversation)
 */
export async function getPendingOrderForSession(sessionId: string) {
  return prisma.order.findFirst({
    where: {
      sessionId,
      status: { in: [OrderStatus.draft, OrderStatus.pending_confirmation] },
    },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// Event Logging
// ============================================================================

/**
 * Log an order event
 */
export async function logOrderEvent(
  orderId: string,
  type: OrderEventType,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.orderEventLog.create({
      data: {
        orderId,
        type,
        details: sanitize(details) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error('[order-manager] logOrderEvent error:', error);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a human-readable order summary
 */
export function buildOrderSummary(items: OrderItemDraft[], notes?: string): string {
  if (items.length === 0) {
    return 'No items';
  }

  const lines = items.map(item => {
    let line = `${item.quantity}x ${item.name}`;
    
    if (item.options && Object.keys(item.options).length > 0) {
      const optionsStr = Object.entries(item.options)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            return value.join(', ');
          }
          return `${key}: ${value}`;
        })
        .join(', ');
      line += ` (${optionsStr})`;
    }
    
    if (item.notes) {
      line += ` - ${item.notes}`;
    }
    
    return line;
  });

  let summary = lines.join('\n');
  
  if (notes) {
    summary += `\n\nNotes: ${notes}`;
  }

  return summary;
}

/**
 * Format pickup time for display
 */
export function formatPickupTime(pickupTime: Date | null, pickupMode: string | null): string {
  if (!pickupTime || pickupMode === 'asap') {
    return 'ASAP';
  }

  return pickupTime.toLocaleString('en-AU', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Generate a short order ID for display (first 8 chars)
 */
export function getShortOrderId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

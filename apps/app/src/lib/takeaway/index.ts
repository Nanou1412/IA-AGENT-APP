/**
 * Takeaway Order Module
 * 
 * Exports all takeaway-related functionality including:
 * - Configuration types and parsing
 * - Order management utilities
 */

export {
  // Config parsing
  parseTakeawayConfig,
  renderTemplate,
  isConfirmationYes,
  isConfirmationNo,
  validatePickupTime,
  // Default configs
  DEFAULT_TAKEAWAY_CONFIG,
  DEFAULT_CONFIRMATION_CONFIG,
  DEFAULT_NOTIFICATIONS_CONFIG,
  DEFAULT_DRAFT_CONFIG,
  DEFAULT_TEMPLATES_CONFIG,
  // Types
  type TakeawayConfig,
  type ConfirmationConfig,
  type NotificationsConfig,
  type DraftConfig,
  type TemplatesConfig,
} from './takeaway-config';

export {
  // Order management
  createOrderDraft,
  updateOrderDraft,
  confirmOrder,
  expireOrder,
  cancelOrder,
  getOrderById,
  getOrderByIdempotencyKey,
  generateOrderIdempotencyKey,
  logOrderEvent,
  buildOrderSummary,
  setOrderPendingPayment,
  // Types
  type OrderDraft,
  type OrderItemDraft,
  type CreateOrderResult,
} from './order-manager';

// Phase 7.3: Payment configuration
export {
  // Config parsing
  parseTakeawayPaymentConfig,
  renderPaymentMessage,
  isPaymentRequired,
  canRetryPayment,
  calculatePaymentDueAt,
  isPaymentExpired,
  formatPaymentAmount,
  parseAmountToCents,
  // Default configs
  DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
  DEFAULT_PAYMENT_MESSAGES_CONFIG,
  DEFAULT_PAYMENT_RETRY_CONFIG,
  // Types
  type TakeawayPaymentConfig,
  type PaymentMessagesConfig,
  type PaymentRetryConfig,
} from './takeaway-payment-config';

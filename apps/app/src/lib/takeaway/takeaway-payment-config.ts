/**
 * Takeaway Payment Configuration Types and Validation
 * 
 * Defines the structure of takeaway payment config in OrgSettings.
 * Used by the takeaway_order engine module for Stripe Checkout.
 * 
 * Phase 7.3: Pay by SMS link
 */

// ============================================================================
// Types
// ============================================================================

export interface PaymentRetryConfig {
  /** Maximum number of retry attempts for payment link */
  maxRetries: number;
}

export interface PaymentMessagesConfig {
  /** Message shown when order is pending payment */
  pending: string;
  /** Message shown after successful payment */
  paid: string;
  /** Message shown when payment link expires */
  expired: string;
  /** Message shown when payment fails */
  failed: string;
  /** Message shown when retry link is sent */
  retryLinkSent: string;
  /** Message shown when max retries exceeded */
  maxRetriesExceeded: string;
}

export interface TakeawayPaymentConfig {
  /** Whether payment is enabled for this org */
  enabled: boolean;
  /** Test mode - sends fake payment links without Stripe */
  testMode: boolean;
  /** Whether payment is required by default for orders */
  requiredByDefault: boolean;
  /** Minutes until payment link expires */
  expiresMinutes: number;
  /** Allow per-order disable of payment requirement */
  allowDisable: boolean;
  /** Retry configuration */
  retry: PaymentRetryConfig;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Product name shown in Stripe Checkout */
  productName: string;
  /** Pricing mode: "manual_total_required" means agent asks for total */
  pricingMode: 'manual_total_required' | 'items_with_prices';
  /** Customer-facing messages */
  messages: PaymentMessagesConfig;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_PAYMENT_MESSAGES_CONFIG: PaymentMessagesConfig = {
  pending: 
    "Your order will only be confirmed once payment is completed. " +
    "Please use the link below to pay securely:\n\n{paymentUrl}\n\n" +
    "This link expires in {expiresMinutes} minutes.",
  paid: 
    "Payment received! Your order #{orderId} is now confirmed. " +
    "We'll have it ready for you. Thank you!",
  expired: 
    "Your payment link has expired. Reply YES to request a new payment link.",
  failed: 
    "There was an issue with your payment. Please try again using the link below:\n\n{paymentUrl}",
  retryLinkSent:
    "Here's a new payment link:\n\n{paymentUrl}\n\n" +
    "This link expires in {expiresMinutes} minutes.",
  maxRetriesExceeded:
    "We're having trouble processing your payment. " +
    "Please call us directly and we'll be happy to help complete your order.",
};

export const DEFAULT_PAYMENT_RETRY_CONFIG: PaymentRetryConfig = {
  maxRetries: 1,
};

export const DEFAULT_TAKEAWAY_PAYMENT_CONFIG: TakeawayPaymentConfig = {
  enabled: true,
  testMode: false,
  requiredByDefault: true,
  expiresMinutes: 10,
  allowDisable: true,
  retry: DEFAULT_PAYMENT_RETRY_CONFIG,
  currency: process.env.STRIPE_ORDER_CURRENCY || 'AUD',
  productName: process.env.STRIPE_ORDER_PRODUCT_NAME_DEFAULT || 'Takeaway order',
  pricingMode: 'manual_total_required',
  messages: DEFAULT_PAYMENT_MESSAGES_CONFIG,
};

// ============================================================================
// Parsing / Validation
// ============================================================================

/**
 * Parse and validate takeaway payment config from JSON
 * Returns default config if invalid
 */
export function parseTakeawayPaymentConfig(configJson: unknown): TakeawayPaymentConfig {
  if (!configJson || typeof configJson !== 'object') {
    return DEFAULT_TAKEAWAY_PAYMENT_CONFIG;
  }

  const config = configJson as Record<string, unknown>;

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
    testMode: typeof config.testMode === 'boolean' ? config.testMode : false,
    requiredByDefault: typeof config.requiredByDefault === 'boolean' 
      ? config.requiredByDefault 
      : true,
    expiresMinutes: parsePositiveInt(config.expiresMinutes, 10),
    allowDisable: typeof config.allowDisable === 'boolean' ? config.allowDisable : true,
    retry: parseRetryConfig(config.retry),
    currency: typeof config.currency === 'string' && config.currency.length === 3
      ? config.currency.toUpperCase()
      : DEFAULT_TAKEAWAY_PAYMENT_CONFIG.currency,
    productName: typeof config.productName === 'string' && config.productName.trim()
      ? config.productName.trim()
      : DEFAULT_TAKEAWAY_PAYMENT_CONFIG.productName,
    pricingMode: parsePricingMode(config.pricingMode),
    messages: parseMessagesConfig(config.messages),
  };
}

function parsePositiveInt(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && value > 0 && Number.isInteger(value)) {
    return value;
  }
  return defaultValue;
}

function parsePricingMode(value: unknown): 'manual_total_required' | 'items_with_prices' {
  if (value === 'items_with_prices') return 'items_with_prices';
  return 'manual_total_required';
}

function parseRetryConfig(config: unknown): PaymentRetryConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_PAYMENT_RETRY_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    maxRetries: parsePositiveInt(c.maxRetries, 1),
  };
}

function parseMessagesConfig(config: unknown): PaymentMessagesConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_PAYMENT_MESSAGES_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    pending: typeof c.pending === 'string' 
      ? c.pending 
      : DEFAULT_PAYMENT_MESSAGES_CONFIG.pending,
    paid: typeof c.paid === 'string' 
      ? c.paid 
      : DEFAULT_PAYMENT_MESSAGES_CONFIG.paid,
    expired: typeof c.expired === 'string' 
      ? c.expired 
      : DEFAULT_PAYMENT_MESSAGES_CONFIG.expired,
    failed: typeof c.failed === 'string' 
      ? c.failed 
      : DEFAULT_PAYMENT_MESSAGES_CONFIG.failed,
    retryLinkSent: typeof c.retryLinkSent === 'string'
      ? c.retryLinkSent
      : DEFAULT_PAYMENT_MESSAGES_CONFIG.retryLinkSent,
    maxRetriesExceeded: typeof c.maxRetriesExceeded === 'string'
      ? c.maxRetriesExceeded
      : DEFAULT_PAYMENT_MESSAGES_CONFIG.maxRetriesExceeded,
  };
}

// ============================================================================
// Template Rendering
// ============================================================================

/**
 * Replace placeholders in a payment message template
 */
export function renderPaymentMessage(
  template: string,
  variables: {
    orderId?: string;
    paymentUrl?: string;
    expiresMinutes?: number;
    amount?: string;
    currency?: string;
  }
): string {
  let result = template;
  
  if (variables.orderId) {
    result = result.replaceAll('{orderId}', variables.orderId);
  }
  if (variables.paymentUrl) {
    result = result.replaceAll('{paymentUrl}', variables.paymentUrl);
  }
  if (variables.expiresMinutes !== undefined) {
    result = result.replaceAll('{expiresMinutes}', String(variables.expiresMinutes));
  }
  if (variables.amount) {
    result = result.replaceAll('{amount}', variables.amount);
  }
  if (variables.currency) {
    result = result.replaceAll('{currency}', variables.currency);
  }
  
  return result.trim();
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if payment is required for an order based on config and org settings
 */
export function isPaymentRequired(
  config: TakeawayPaymentConfig,
  orderPaymentRequired?: boolean
): boolean {
  // If payment is disabled for org, never require
  if (!config.enabled) {
    return false;
  }
  
  // If order-level override is set and allowed, use it
  if (config.allowDisable && orderPaymentRequired === false) {
    return false;
  }
  
  // Use default
  return config.requiredByDefault;
}

/**
 * Check if a payment can be retried
 */
export function canRetryPayment(
  config: TakeawayPaymentConfig,
  currentAttemptCount: number
): boolean {
  // First attempt is attempt 0, so max retries of 1 means 2 total attempts (0, 1)
  return currentAttemptCount <= config.retry.maxRetries;
}

/**
 * Calculate payment expiration time
 */
export function calculatePaymentDueAt(
  config: TakeawayPaymentConfig,
  fromDate: Date = new Date()
): Date {
  return new Date(fromDate.getTime() + config.expiresMinutes * 60 * 1000);
}

/**
 * Check if a payment has expired
 */
export function isPaymentExpired(dueAt: Date | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  return now > dueAt;
}

/**
 * Format amount for display (cents to dollars)
 */
export function formatPaymentAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Parse amount string to cents
 * Handles: "$45", "45.50", "45", "$45.00 AUD"
 */
export function parseAmountToCents(amountStr: string): number | null {
  // Remove currency symbols and text
  const cleaned = amountStr
    .replace(/[A-Z]{3}/gi, '') // Remove currency codes
    .replace(/[$€£¥]/g, '')    // Remove currency symbols
    .replace(/,/g, '')         // Remove thousand separators
    .trim();
  
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed) || parsed < 0) {
    return null;
  }
  
  // Convert to cents
  return Math.round(parsed * 100);
}

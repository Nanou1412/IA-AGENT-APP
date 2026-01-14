/**
 * Tests for takeaway payment configuration
 * Phase 7.3: Pay by SMS link
 */

import { describe, it, expect } from 'vitest';
import {
  parseTakeawayPaymentConfig,
  DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
  renderPaymentMessage,
  isPaymentRequired,
  canRetryPayment,
  calculatePaymentDueAt,
  isPaymentExpired,
  formatPaymentAmount,
  parseAmountToCents,
  type TakeawayPaymentConfig,
} from '../takeaway-payment-config';

describe('parseTakeawayPaymentConfig', () => {
  it('should return default config for null input', () => {
    const config = parseTakeawayPaymentConfig(null);
    expect(config).toEqual(DEFAULT_TAKEAWAY_PAYMENT_CONFIG);
  });

  it('should return default config for undefined input', () => {
    const config = parseTakeawayPaymentConfig(undefined);
    expect(config).toEqual(DEFAULT_TAKEAWAY_PAYMENT_CONFIG);
  });

  it('should return default config for non-object input', () => {
    expect(parseTakeawayPaymentConfig('string')).toEqual(DEFAULT_TAKEAWAY_PAYMENT_CONFIG);
    expect(parseTakeawayPaymentConfig(123)).toEqual(DEFAULT_TAKEAWAY_PAYMENT_CONFIG);
    expect(parseTakeawayPaymentConfig(true)).toEqual(DEFAULT_TAKEAWAY_PAYMENT_CONFIG);
  });

  it('should parse valid config with all fields', () => {
    const input = {
      enabled: false,
      requiredByDefault: false,
      expiresMinutes: 15,
      allowDisable: false,
      retry: { maxRetries: 2 },
      currency: 'USD',
      productName: 'Custom Order',
      pricingMode: 'items_with_prices',
      messages: {
        pending: 'Custom pending message {paymentUrl}',
        paid: 'Custom paid message',
        expired: 'Custom expired',
        failed: 'Custom failed',
        retryLinkSent: 'Custom retry',
        maxRetriesExceeded: 'Custom max retries',
      },
    };

    const config = parseTakeawayPaymentConfig(input);
    expect(config.enabled).toBe(false);
    expect(config.requiredByDefault).toBe(false);
    expect(config.expiresMinutes).toBe(15);
    expect(config.allowDisable).toBe(false);
    expect(config.retry.maxRetries).toBe(2);
    expect(config.currency).toBe('USD');
    expect(config.productName).toBe('Custom Order');
    expect(config.pricingMode).toBe('items_with_prices');
    expect(config.messages.pending).toBe('Custom pending message {paymentUrl}');
  });

  it('should use default for invalid expiresMinutes', () => {
    const config = parseTakeawayPaymentConfig({ expiresMinutes: -5 });
    expect(config.expiresMinutes).toBe(10);
  });

  it('should uppercase currency code', () => {
    const config = parseTakeawayPaymentConfig({ currency: 'gbp' });
    expect(config.currency).toBe('GBP');
  });

  it('should reject invalid currency codes', () => {
    const config = parseTakeawayPaymentConfig({ currency: 'INVALID' });
    expect(config.currency).toBe(DEFAULT_TAKEAWAY_PAYMENT_CONFIG.currency);
  });

  it('should default to manual_total_required pricing mode', () => {
    const config = parseTakeawayPaymentConfig({ pricingMode: 'invalid' });
    expect(config.pricingMode).toBe('manual_total_required');
  });
});

describe('renderPaymentMessage', () => {
  it('should replace orderId placeholder', () => {
    const result = renderPaymentMessage('Order #{orderId}', { orderId: 'ABC123' });
    expect(result).toBe('Order #ABC123');
  });

  it('should replace paymentUrl placeholder', () => {
    const result = renderPaymentMessage('Pay here: {paymentUrl}', {
      paymentUrl: 'https://checkout.stripe.com/xyz',
    });
    expect(result).toBe('Pay here: https://checkout.stripe.com/xyz');
  });

  it('should replace expiresMinutes placeholder', () => {
    const result = renderPaymentMessage('Expires in {expiresMinutes} minutes', {
      expiresMinutes: 10,
    });
    expect(result).toBe('Expires in 10 minutes');
  });

  it('should replace multiple placeholders', () => {
    const template = 'Order {orderId}: Pay at {paymentUrl} (expires in {expiresMinutes} min)';
    const result = renderPaymentMessage(template, {
      orderId: 'XYZ',
      paymentUrl: 'https://pay.test',
      expiresMinutes: 5,
    });
    expect(result).toBe('Order XYZ: Pay at https://pay.test (expires in 5 min)');
  });

  it('should trim result', () => {
    const result = renderPaymentMessage('  test  ', {});
    expect(result).toBe('test');
  });
});

describe('isPaymentRequired', () => {
  it('should return false if payment disabled for org', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      enabled: false,
    };
    expect(isPaymentRequired(config)).toBe(false);
  });

  it('should return default when enabled and no override', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      enabled: true,
      requiredByDefault: true,
    };
    expect(isPaymentRequired(config)).toBe(true);
  });

  it('should respect order-level override when allowed', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      enabled: true,
      requiredByDefault: true,
      allowDisable: true,
    };
    expect(isPaymentRequired(config, false)).toBe(false);
  });

  it('should ignore order-level override when not allowed', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      enabled: true,
      requiredByDefault: true,
      allowDisable: false,
    };
    expect(isPaymentRequired(config, false)).toBe(true);
  });
});

describe('canRetryPayment', () => {
  it('should allow retry when under max', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      retry: { maxRetries: 1 },
    };
    expect(canRetryPayment(config, 0)).toBe(true);
    expect(canRetryPayment(config, 1)).toBe(true);
  });

  it('should deny retry when at max', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      retry: { maxRetries: 1 },
    };
    expect(canRetryPayment(config, 2)).toBe(false);
  });
});

describe('calculatePaymentDueAt', () => {
  it('should add expiresMinutes to from date', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      expiresMinutes: 10,
    };
    const from = new Date('2026-01-05T10:00:00Z');
    const dueAt = calculatePaymentDueAt(config, from);
    expect(dueAt).toEqual(new Date('2026-01-05T10:10:00Z'));
  });

  it('should use current time if no from date', () => {
    const config: TakeawayPaymentConfig = {
      ...DEFAULT_TAKEAWAY_PAYMENT_CONFIG,
      expiresMinutes: 5,
    };
    const before = new Date();
    const dueAt = calculatePaymentDueAt(config);
    const after = new Date();
    
    expect(dueAt.getTime()).toBeGreaterThanOrEqual(before.getTime() + 5 * 60 * 1000);
    expect(dueAt.getTime()).toBeLessThanOrEqual(after.getTime() + 5 * 60 * 1000);
  });
});

describe('isPaymentExpired', () => {
  it('should return false if no dueAt', () => {
    expect(isPaymentExpired(null)).toBe(false);
  });

  it('should return true if past dueAt', () => {
    const pastDue = new Date(Date.now() - 1000);
    expect(isPaymentExpired(pastDue)).toBe(true);
  });

  it('should return false if before dueAt', () => {
    const futureDue = new Date(Date.now() + 60000);
    expect(isPaymentExpired(futureDue)).toBe(false);
  });
});

describe('formatPaymentAmount', () => {
  it('should format cents as AUD', () => {
    const result = formatPaymentAmount(4500, 'AUD');
    expect(result).toContain('45');
    expect(result).toContain('$');
  });

  it('should format with decimals', () => {
    const result = formatPaymentAmount(1299, 'AUD');
    expect(result).toContain('12.99');
  });

  it('should handle different currencies', () => {
    const usd = formatPaymentAmount(1000, 'USD');
    // Format depends on locale - just check the amount is present
    expect(usd).toMatch(/10/);
    
    const eur = formatPaymentAmount(1000, 'EUR');
    expect(eur).toMatch(/10/);
  });
});

describe('parseAmountToCents', () => {
  it('should parse simple dollar amount', () => {
    expect(parseAmountToCents('45')).toBe(4500);
  });

  it('should parse amount with decimals', () => {
    expect(parseAmountToCents('12.99')).toBe(1299);
  });

  it('should parse with dollar sign', () => {
    expect(parseAmountToCents('$45')).toBe(4500);
    expect(parseAmountToCents('$45.50')).toBe(4550);
  });

  it('should parse with currency code', () => {
    expect(parseAmountToCents('45.00 AUD')).toBe(4500);
    expect(parseAmountToCents('$100 USD')).toBe(10000);
  });

  it('should handle thousand separators', () => {
    expect(parseAmountToCents('1,000')).toBe(100000);
    expect(parseAmountToCents('$1,234.56')).toBe(123456);
  });

  it('should return null for invalid input', () => {
    expect(parseAmountToCents('')).toBe(null);
    expect(parseAmountToCents('abc')).toBe(null);
    expect(parseAmountToCents('-50')).toBe(null);
  });

  it('should round to nearest cent', () => {
    expect(parseAmountToCents('45.555')).toBe(4556); // Rounds up
    expect(parseAmountToCents('45.554')).toBe(4555); // Rounds down
  });
});

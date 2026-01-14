/**
 * Tests for takeaway configuration parsing and validation
 */

import { describe, expect, it } from 'vitest';
import {
  parseTakeawayConfig,
  isConfirmationYes,
  isConfirmationNo,
  validatePickupTime,
  renderTemplate,
  DEFAULT_TAKEAWAY_CONFIG,
  type ConfirmationConfig,
} from '../takeaway-config';
import { buildOrderSummary, type OrderItemDraft } from '../order-manager';

describe('parseTakeawayConfig', () => {
  it('returns defaults when input is null', () => {
    const config = parseTakeawayConfig(null);
    expect(config).toEqual(DEFAULT_TAKEAWAY_CONFIG);
  });

  it('returns defaults when input is undefined', () => {
    const config = parseTakeawayConfig(undefined);
    expect(config).toEqual(DEFAULT_TAKEAWAY_CONFIG);
  });

  it('returns defaults when input is empty object', () => {
    const config = parseTakeawayConfig({});
    expect(config.enabled).toBe(false);
    expect(config.defaultPickupMode).toBe('asap');
  });

  it('merges partial config with defaults', () => {
    const partial = { enabled: true, minNoticeMinutes: 30 };
    const config = parseTakeawayConfig(partial);
    
    expect(config.enabled).toBe(true);
    expect(config.minNoticeMinutes).toBe(30);
    expect(config.maxItems).toBe(DEFAULT_TAKEAWAY_CONFIG.maxItems);
    expect(config.confirmation.expiresMinutes).toBe(DEFAULT_TAKEAWAY_CONFIG.confirmation.expiresMinutes);
  });

  it('merges nested confirmation config', () => {
    const partial = {
      enabled: true,
      confirmation: { expiresMinutes: 15 },
    };
    const config = parseTakeawayConfig(partial);
    
    expect(config.confirmation.expiresMinutes).toBe(15);
    expect(config.confirmation.method).toBe('explicit_yes');
    expect(config.confirmation.yesWords).toEqual(DEFAULT_TAKEAWAY_CONFIG.confirmation.yesWords);
  });

  it('merges nested notifications config', () => {
    const partial = {
      notifications: { notifyBySms: false, notifyTo: '+61400000000' },
    };
    const config = parseTakeawayConfig(partial);
    
    expect(config.notifications.notifyBySms).toBe(false);
    expect(config.notifications.notifyTo).toBe('+61400000000');
    expect(config.notifications.notifyByWhatsApp).toBe(DEFAULT_TAKEAWAY_CONFIG.notifications.notifyByWhatsApp);
  });

  it('merges nested templates config', () => {
    const partial = {
      templates: { customerConfirmationText: 'Custom: {orderId}' },
    };
    const config = parseTakeawayConfig(partial);
    
    expect(config.templates.customerConfirmationText).toBe('Custom: {orderId}');
  });

  it('merges nested draft config', () => {
    const partial = {
      draft: { expireMinutes: 60 },
    };
    const config = parseTakeawayConfig(partial);
    
    expect(config.draft.expireMinutes).toBe(60);
  });

  it('preserves custom yesWords and noWords arrays', () => {
    const partial = {
      confirmation: {
        yesWords: ['OUI', 'OK'],
        noWords: ['NON', 'ANNULER'],
      },
    };
    const config = parseTakeawayConfig(partial);
    
    expect(config.confirmation.yesWords).toEqual(['OUI', 'OK']);
    expect(config.confirmation.noWords).toEqual(['NON', 'ANNULER']);
  });
});

describe('isConfirmationYes', () => {
  const confirmationConfig: ConfirmationConfig = {
    method: 'explicit_yes',
    yesWords: ['YES', 'Y', 'CONFIRM', 'OK'],
    noWords: ['NO', 'N', 'CANCEL', 'STOP'],
    expiresMinutes: 10,
  };

  it('recognizes YES variants', () => {
    expect(isConfirmationYes('yes', confirmationConfig)).toBe(true);
    expect(isConfirmationYes('YES', confirmationConfig)).toBe(true);
    expect(isConfirmationYes('Yes', confirmationConfig)).toBe(true);
    expect(isConfirmationYes('  yes  ', confirmationConfig)).toBe(true);
  });

  it('recognizes Y', () => {
    expect(isConfirmationYes('y', confirmationConfig)).toBe(true);
    expect(isConfirmationYes('Y', confirmationConfig)).toBe(true);
  });

  it('recognizes CONFIRM', () => {
    expect(isConfirmationYes('confirm', confirmationConfig)).toBe(true);
    expect(isConfirmationYes('CONFIRM', confirmationConfig)).toBe(true);
  });

  it('recognizes OK', () => {
    expect(isConfirmationYes('ok', confirmationConfig)).toBe(true);
    expect(isConfirmationYes('OK', confirmationConfig)).toBe(true);
  });

  it('rejects non-yes words', () => {
    expect(isConfirmationYes('no', confirmationConfig)).toBe(false);
    expect(isConfirmationYes('maybe', confirmationConfig)).toBe(false);
    expect(isConfirmationYes('', confirmationConfig)).toBe(false);
  });
});

describe('isConfirmationNo', () => {
  const confirmationConfig: ConfirmationConfig = {
    method: 'explicit_yes',
    yesWords: ['YES', 'Y', 'CONFIRM', 'OK'],
    noWords: ['NO', 'N', 'CANCEL', 'STOP'],
    expiresMinutes: 10,
  };

  it('recognizes NO variants', () => {
    expect(isConfirmationNo('no', confirmationConfig)).toBe(true);
    expect(isConfirmationNo('NO', confirmationConfig)).toBe(true);
    expect(isConfirmationNo('No', confirmationConfig)).toBe(true);
    expect(isConfirmationNo('  no  ', confirmationConfig)).toBe(true);
  });

  it('recognizes N', () => {
    expect(isConfirmationNo('n', confirmationConfig)).toBe(true);
    expect(isConfirmationNo('N', confirmationConfig)).toBe(true);
  });

  it('recognizes CANCEL', () => {
    expect(isConfirmationNo('cancel', confirmationConfig)).toBe(true);
    expect(isConfirmationNo('CANCEL', confirmationConfig)).toBe(true);
  });

  it('recognizes STOP', () => {
    expect(isConfirmationNo('stop', confirmationConfig)).toBe(true);
    expect(isConfirmationNo('STOP', confirmationConfig)).toBe(true);
  });

  it('rejects non-no words', () => {
    expect(isConfirmationNo('yes', confirmationConfig)).toBe(false);
    expect(isConfirmationNo('maybe', confirmationConfig)).toBe(false);
    expect(isConfirmationNo('', confirmationConfig)).toBe(false);
  });
});

describe('validatePickupTime', () => {
  it('validates ASAP (null) as always valid', () => {
    const result = validatePickupTime(null, 30);
    expect(result.valid).toBe(true);
  });

  it('rejects pickup time too soon', () => {
    const now = new Date();
    const tooSoon = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now
    
    const result = validatePickupTime(tooSoon, 30, now);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('30 minutes');
  });

  it('accepts valid pickup time', () => {
    const now = new Date();
    const validTime = new Date(now.getTime() + 45 * 60 * 1000); // 45 minutes from now
    
    const result = validatePickupTime(validTime, 30, now);
    
    expect(result.valid).toBe(true);
  });
});

describe('renderTemplate', () => {
  it('replaces simple placeholders', () => {
    const template = 'Order #{orderId} is ready!';
    const result = renderTemplate(template, { orderId: 'ABC123' });
    
    expect(result).toBe('Order #ABC123 is ready!');
  });

  it('replaces multiple placeholders', () => {
    const template = 'Customer: {customerName} ({customerPhone})';
    const result = renderTemplate(template, { 
      customerName: 'John', 
      customerPhone: '+61400111222' 
    });
    
    expect(result).toBe('Customer: John (+61400111222)');
  });

  it('handles undefined values', () => {
    const template = 'Notes: {notes}';
    const result = renderTemplate(template, { notes: undefined });
    
    expect(result).toBe('Notes:');
  });
});

describe('buildOrderSummary', () => {
  it('builds summary with single item', () => {
    const items: OrderItemDraft[] = [
      { name: 'Pizza Margherita', quantity: 2 },
    ];
    const summary = buildOrderSummary(items);
    
    expect(summary).toContain('2x Pizza Margherita');
  });

  it('builds summary with multiple items', () => {
    const items: OrderItemDraft[] = [
      { name: 'Pizza Margherita', quantity: 2 },
      { name: 'Garlic Bread', quantity: 1 },
    ];
    const summary = buildOrderSummary(items);
    
    expect(summary).toContain('2x Pizza Margherita');
    expect(summary).toContain('1x Garlic Bread');
  });

  it('includes special notes when present', () => {
    const items: OrderItemDraft[] = [
      { name: 'Pizza', quantity: 1 },
    ];
    const summary = buildOrderSummary(items, 'Extra cheese please');
    
    expect(summary).toContain('Extra cheese please');
  });

  it('includes item options when present', () => {
    const items: OrderItemDraft[] = [
      { 
        name: 'Pizza', 
        quantity: 1, 
        options: { size: 'large', toppings: ['mushroom', 'olives'] } 
      },
    ];
    const summary = buildOrderSummary(items);
    
    expect(summary).toContain('size: large');
    expect(summary).toContain('mushroom, olives');
  });

  it('returns "No items" for empty array', () => {
    const summary = buildOrderSummary([]);
    expect(summary).toBe('No items');
  });

  it('includes item notes when present', () => {
    const items: OrderItemDraft[] = [
      { name: 'Pizza', quantity: 1, notes: 'Well done' },
    ];
    const summary = buildOrderSummary(items);
    
    expect(summary).toContain('Well done');
  });
});

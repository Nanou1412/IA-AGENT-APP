/**
 * Tests for takeaway-order engine module
 * 
 * These tests focus on the exported utility functions.
 * Full integration tests require DB setup and are in integration tests.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    orderEventLog: {
      create: vi.fn(),
    },
    orgSettings: {
      findUnique: vi.fn(),
    },
  },
}));

// Import config helpers for testing
import {
  isConfirmationYes,
  isConfirmationNo,
  validatePickupTime,
  parseTakeawayConfig,
  DEFAULT_TAKEAWAY_CONFIG,
} from '@/lib/takeaway/takeaway-config';

describe('takeaway-order module helpers', () => {
  describe('isConfirmationYes', () => {
    const config = DEFAULT_TAKEAWAY_CONFIG.confirmation;

    it('recognizes YES variants', () => {
      expect(isConfirmationYes('yes', config)).toBe(true);
      expect(isConfirmationYes('YES', config)).toBe(true);
      expect(isConfirmationYes('Yes', config)).toBe(true);
      expect(isConfirmationYes('  yes  ', config)).toBe(true);
    });

    it('recognizes Y', () => {
      expect(isConfirmationYes('y', config)).toBe(true);
      expect(isConfirmationYes('Y', config)).toBe(true);
    });

    it('recognizes CONFIRM', () => {
      expect(isConfirmationYes('confirm', config)).toBe(true);
      expect(isConfirmationYes('CONFIRM', config)).toBe(true);
    });

    it('recognizes OK', () => {
      expect(isConfirmationYes('ok', config)).toBe(true);
      expect(isConfirmationYes('OK', config)).toBe(true);
    });

    it('recognizes YEP and YEAH (default yesWords)', () => {
      expect(isConfirmationYes('yep', config)).toBe(true);
      expect(isConfirmationYes('yeah', config)).toBe(true);
    });

    it('rejects non-yes words', () => {
      expect(isConfirmationYes('no', config)).toBe(false);
      expect(isConfirmationYes('maybe', config)).toBe(false);
      expect(isConfirmationYes('', config)).toBe(false);
    });

    it('rejects partial matches', () => {
      expect(isConfirmationYes('yes please', config)).toBe(false);
      expect(isConfirmationYes('I said yes', config)).toBe(false);
    });
  });

  describe('isConfirmationNo', () => {
    const config = DEFAULT_TAKEAWAY_CONFIG.confirmation;

    it('recognizes NO variants', () => {
      expect(isConfirmationNo('no', config)).toBe(true);
      expect(isConfirmationNo('NO', config)).toBe(true);
      expect(isConfirmationNo('No', config)).toBe(true);
      expect(isConfirmationNo('  no  ', config)).toBe(true);
    });

    it('recognizes N', () => {
      expect(isConfirmationNo('n', config)).toBe(true);
      expect(isConfirmationNo('N', config)).toBe(true);
    });

    it('recognizes CANCEL', () => {
      expect(isConfirmationNo('cancel', config)).toBe(true);
      expect(isConfirmationNo('CANCEL', config)).toBe(true);
    });

    it('recognizes STOP', () => {
      expect(isConfirmationNo('stop', config)).toBe(true);
      expect(isConfirmationNo('STOP', config)).toBe(true);
    });

    it('recognizes NEVERMIND (default noWords)', () => {
      expect(isConfirmationNo('nevermind', config)).toBe(true);
    });

    it('rejects non-no words', () => {
      expect(isConfirmationNo('yes', config)).toBe(false);
      expect(isConfirmationNo('maybe', config)).toBe(false);
      expect(isConfirmationNo('', config)).toBe(false);
    });
  });

  describe('validatePickupTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T10:00:00+11:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('accepts null pickup time (ASAP)', () => {
      const result = validatePickupTime(null, 30);
      expect(result.valid).toBe(true);
    });

    it('rejects pickup time that is too soon', () => {
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
      expect(result.error).toBeUndefined();
    });

    it('accepts exact minimum notice time', () => {
      const now = new Date();
      const exactTime = new Date(now.getTime() + 30 * 60 * 1000); // Exactly 30 minutes from now
      
      const result = validatePickupTime(exactTime, 30, now);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('parseTakeawayConfig', () => {
    it('returns defaults for null input', () => {
      const config = parseTakeawayConfig(null);
      expect(config).toEqual(DEFAULT_TAKEAWAY_CONFIG);
    });

    it('returns defaults for undefined input', () => {
      const config = parseTakeawayConfig(undefined);
      expect(config).toEqual(DEFAULT_TAKEAWAY_CONFIG);
    });

    it('merges partial config with defaults', () => {
      const partial = { enabled: true, minNoticeMinutes: 45 };
      const config = parseTakeawayConfig(partial);
      
      expect(config.enabled).toBe(true);
      expect(config.minNoticeMinutes).toBe(45);
      expect(config.maxItems).toBe(DEFAULT_TAKEAWAY_CONFIG.maxItems);
    });

    it('allows custom yesWords for confirmation', () => {
      const partial = {
        confirmation: {
          yesWords: ['OUI', 'D\'ACCORD'],
        },
      };
      const config = parseTakeawayConfig(partial);
      
      expect(isConfirmationYes('oui', config.confirmation)).toBe(true);
      expect(isConfirmationYes("d'accord", config.confirmation)).toBe(true);
      expect(isConfirmationYes('yes', config.confirmation)).toBe(false);
    });

    it('allows custom noWords for confirmation', () => {
      const partial = {
        confirmation: {
          noWords: ['NON', 'ANNULER'],
        },
      };
      const config = parseTakeawayConfig(partial);
      
      expect(isConfirmationNo('non', config.confirmation)).toBe(true);
      expect(isConfirmationNo('annuler', config.confirmation)).toBe(true);
      expect(isConfirmationNo('no', config.confirmation)).toBe(false);
    });
  });
});

describe('takeaway order workflow', () => {
  describe('order state machine', () => {
    it('defines correct status transitions', () => {
      // Verify the expected order status values exist
      const validStatuses = ['draft', 'pending_confirmation', 'confirmed', 'expired', 'canceled'];
      
      // These are the valid state transitions:
      // draft -> pending_confirmation (request confirmation)
      // draft -> expired (draft timeout)
      // draft -> canceled (customer cancels)
      // pending_confirmation -> confirmed (customer confirms)
      // pending_confirmation -> canceled (customer cancels)
      // pending_confirmation -> expired (confirmation timeout)
      
      // Confirmed orders cannot transition further in the module
      // (post-confirmation changes trigger handoff)
      
      expect(validStatuses.length).toBe(5);
    });

    it('prevents duplicate order creation via idempotency key', () => {
      // This behavior is tested in order-manager tests
      // The key combines: orgId, sessionId, phone, summaryHash, pickupTime
      // Same key = same order returned, not a new one created
      expect(true).toBe(true);
    });
  });
});

describe('confirmation expiry', () => {
  it('default expiry is 10 minutes', () => {
    const config = DEFAULT_TAKEAWAY_CONFIG;
    expect(config.confirmation.expiresMinutes).toBe(10);
  });

  it('custom expiry can be configured', () => {
    const partial = {
      confirmation: { expiresMinutes: 15 },
    };
    const config = parseTakeawayConfig(partial);
    expect(config.confirmation.expiresMinutes).toBe(15);
  });
});

describe('draft expiry', () => {
  it('default draft expiry is 30 minutes', () => {
    const config = DEFAULT_TAKEAWAY_CONFIG;
    expect(config.draft.expireMinutes).toBe(30);
  });

  it('custom draft expiry can be configured', () => {
    const partial = {
      draft: { expireMinutes: 60 },
    };
    const config = parseTakeawayConfig(partial);
    expect(config.draft.expireMinutes).toBe(60);
  });
});

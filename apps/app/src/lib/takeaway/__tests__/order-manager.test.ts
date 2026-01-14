/**
 * Tests for order-manager CRUD operations
 */

import { describe, expect, it, vi } from 'vitest';
import { generateOrderIdempotencyKey, buildOrderSummary, formatPickupTime, getShortOrderId } from '../order-manager';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    orderItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    orderEventLog: {
      create: vi.fn(),
    },
  },
}));

describe('generateOrderIdempotencyKey', () => {
  it('generates consistent key for same params', () => {
    const params = {
      orgId: 'org_123',
      sessionId: 'sess_456',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    };
    
    const key1 = generateOrderIdempotencyKey(params);
    const key2 = generateOrderIdempotencyKey(params);
    
    expect(key1).toBe(key2);
  });

  it('generates different keys for different orgs', () => {
    const params1 = {
      orgId: 'org_123',
      sessionId: 'sess_456',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    };
    const params2 = {
      orgId: 'org_789',
      sessionId: 'sess_456',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    };
    
    const key1 = generateOrderIdempotencyKey(params1);
    const key2 = generateOrderIdempotencyKey(params2);
    
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different sessions', () => {
    const params1 = {
      orgId: 'org_123',
      sessionId: 'sess_111',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    };
    const params2 = {
      orgId: 'org_123',
      sessionId: 'sess_222',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    };
    
    const key1 = generateOrderIdempotencyKey(params1);
    const key2 = generateOrderIdempotencyKey(params2);
    
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different items', () => {
    const params1 = {
      orgId: 'org_123',
      sessionId: 'sess_456',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    };
    const params2 = {
      orgId: 'org_123',
      sessionId: 'sess_456',
      customerPhone: '+61400111222',
      summaryText: '2x Burger',
    };
    
    const key1 = generateOrderIdempotencyKey(params1);
    const key2 = generateOrderIdempotencyKey(params2);
    
    expect(key1).not.toBe(key2);
  });

  it('returns a string key of consistent length', () => {
    const key = generateOrderIdempotencyKey({
      orgId: 'org_123',
      sessionId: 'sess_456',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    });
    
    expect(typeof key).toBe('string');
    expect(key.length).toBe(32); // SHA256 truncated to 32 chars
  });

  it('handles missing sessionId', () => {
    const key = generateOrderIdempotencyKey({
      orgId: 'org_123',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
    });
    
    expect(typeof key).toBe('string');
    expect(key.length).toBe(32);
  });

  it('handles pickup time in key generation', () => {
    const pickupTime = new Date('2025-01-15T18:30:00Z');
    const params1 = {
      orgId: 'org_123',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
      pickupTime,
    };
    const params2 = {
      orgId: 'org_123',
      customerPhone: '+61400111222',
      summaryText: '1x Pizza',
      // No pickupTime
    };
    
    const key1 = generateOrderIdempotencyKey(params1);
    const key2 = generateOrderIdempotencyKey(params2);
    
    expect(key1).not.toBe(key2);
  });
});

describe('buildOrderSummary', () => {
  it('builds summary for single item', () => {
    const items = [{ name: 'Pizza', quantity: 1 }];
    const summary = buildOrderSummary(items);
    
    expect(summary).toBe('1x Pizza');
  });

  it('builds summary for multiple items', () => {
    const items = [
      { name: 'Pizza', quantity: 2 },
      { name: 'Garlic Bread', quantity: 1 },
    ];
    const summary = buildOrderSummary(items);
    
    expect(summary).toContain('2x Pizza');
    expect(summary).toContain('1x Garlic Bread');
  });

  it('includes notes', () => {
    const items = [{ name: 'Pizza', quantity: 1 }];
    const summary = buildOrderSummary(items, 'Extra cheese');
    
    expect(summary).toContain('Notes: Extra cheese');
  });

  it('returns "No items" for empty array', () => {
    const summary = buildOrderSummary([]);
    expect(summary).toBe('No items');
  });
});

describe('formatPickupTime', () => {
  it('returns ASAP for null pickup time', () => {
    expect(formatPickupTime(null, 'asap')).toBe('ASAP');
  });

  it('returns ASAP for asap mode', () => {
    const pickupTime = new Date();
    expect(formatPickupTime(pickupTime, 'asap')).toBe('ASAP');
  });

  it('formats time for scheduled pickup', () => {
    const pickupTime = new Date('2025-01-15T18:30:00');
    const result = formatPickupTime(pickupTime, 'time');
    
    expect(result).not.toBe('ASAP');
    // Should contain day and time
    expect(result).toMatch(/Wed|6:30|PM/i);
  });
});

describe('getShortOrderId', () => {
  it('returns first 8 chars uppercased', () => {
    const orderId = 'abc123defghijklmnop';
    const short = getShortOrderId(orderId);
    
    expect(short).toBe('ABC123DE');
    expect(short.length).toBe(8);
  });

  it('handles short IDs', () => {
    const orderId = 'abc';
    const short = getShortOrderId(orderId);
    
    expect(short).toBe('ABC');
  });
});

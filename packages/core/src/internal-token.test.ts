/**
 * Tests for Internal Token module
 * 
 * @module @repo/core/internal-token.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signInternalToken,
  verifyInternalToken,
  extractTokenFromRequest,
  extractTokenFromQuery,
  extractTokenFromUrl,
} from './internal-token';

const TEST_SECRET = 'test-secret-key-32-chars-minimum!';
const TEST_ORG_ID = 'org_test123';

describe('Internal Token', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('signInternalToken', () => {
    it('should create a valid token', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      
      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(2);
    });

    it('should throw if secret is missing', () => {
      expect(() => signInternalToken('', TEST_ORG_ID)).toThrow('Secret key is required');
    });

    it('should throw if orgId is missing', () => {
      expect(() => signInternalToken(TEST_SECRET, '')).toThrow('orgId is required');
    });

    it('should include endpointId when provided', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID, { endpointId: 'voice' });
      const result = verifyInternalToken(token, TEST_SECRET);
      
      expect(result.ok).toBe(true);
      expect(result.payload?.endpointId).toBe('voice');
    });

    it('should use custom TTL', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID, { ttlSeconds: 300 });
      const result = verifyInternalToken(token, TEST_SECRET);
      
      expect(result.ok).toBe(true);
      const now = Math.floor(Date.now() / 1000);
      expect(result.payload?.exp).toBe(now + 300);
    });
  });

  describe('verifyInternalToken', () => {
    it('should verify a valid token', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      const result = verifyInternalToken(token, TEST_SECRET);
      
      expect(result.ok).toBe(true);
      expect(result.payload?.orgId).toBe(TEST_ORG_ID);
    });

    it('should reject empty token', () => {
      const result = verifyInternalToken('', TEST_SECRET);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Token is empty');
    });

    it('should reject if secret not configured', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      const result = verifyInternalToken(token, '');
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Secret key not configured');
    });

    it('should reject invalid format', () => {
      const result = verifyInternalToken('invalid-token', TEST_SECRET);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject tampered signature', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      const [payload] = token.split('.');
      const tamperedToken = `${payload}.0000000000000000000000000000000000000000000000000000000000000000`;
      
      const result = verifyInternalToken(tamperedToken, TEST_SECRET);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject wrong secret', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      const result = verifyInternalToken(token, 'wrong-secret');
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject expired token', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID, { ttlSeconds: 60 });
      
      // Advance time by 2 minutes
      vi.advanceTimersByTime(120 * 1000);
      
      const result = verifyInternalToken(token, TEST_SECRET);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should reject token from future (beyond clock skew)', () => {
      // Set time to future, create token, then set time back to "now"
      const futureTime = new Date('2026-01-15T12:05:00Z'); // 5 min in future
      vi.setSystemTime(futureTime);
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      
      // Set time back to "present" - token will appear to be from the future
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
      
      const result = verifyInternalToken(token, TEST_SECRET);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Token issued in the future');
    });

    it('should accept token within clock skew tolerance', () => {
      // Set time slightly in future (within 60s tolerance), create token
      const slightlyFuture = new Date('2026-01-15T12:00:30Z'); // 30 sec in future
      vi.setSystemTime(slightlyFuture);
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      
      // Set time back to "present"
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
      
      const result = verifyInternalToken(token, TEST_SECRET);
      
      expect(result.ok).toBe(true);
    });
  });

  describe('extractTokenFromRequest', () => {
    it('should extract from Authorization Bearer header', () => {
      const headers = new Map([['authorization', 'Bearer my-token']]);
      const mockHeaders = { get: (key: string) => headers.get(key) || null };
      
      const token = extractTokenFromRequest(mockHeaders);
      expect(token).toBe('my-token');
    });

    it('should extract from x-internal-token header', () => {
      const headers = new Map([['x-internal-token', 'my-token']]);
      const mockHeaders = { get: (key: string) => headers.get(key) || null };
      
      const token = extractTokenFromRequest(mockHeaders);
      expect(token).toBe('my-token');
    });

    it('should extract from URL query param', () => {
      const mockHeaders = { get: () => null };
      const url = new URL('https://example.com/api?token=my-token');
      
      const token = extractTokenFromRequest(mockHeaders, url);
      expect(token).toBe('my-token');
    });

    it('should return null if no token found', () => {
      const mockHeaders = { get: () => null };
      
      const token = extractTokenFromRequest(mockHeaders);
      expect(token).toBeNull();
    });

    it('should prefer Bearer header over other sources', () => {
      const headers = new Map([
        ['authorization', 'Bearer bearer-token'],
        ['x-internal-token', 'header-token'],
      ]);
      const mockHeaders = { get: (key: string) => headers.get(key) || null };
      const url = new URL('https://example.com/api?token=query-token');
      
      const token = extractTokenFromRequest(mockHeaders, url);
      expect(token).toBe('bearer-token');
    });
  });

  describe('extractTokenFromQuery', () => {
    it('should extract token from query object', () => {
      const token = extractTokenFromQuery({ token: 'my-token', other: 'value' });
      expect(token).toBe('my-token');
    });

    it('should return null if token missing', () => {
      const token = extractTokenFromQuery({ other: 'value' });
      expect(token).toBeNull();
    });

    it('should return null if token is not a string', () => {
      const token = extractTokenFromQuery({ token: 123 });
      expect(token).toBeNull();
    });
  });

  describe('extractTokenFromUrl', () => {
    it('should extract token from URL', () => {
      const url = new URL('https://example.com/api?token=my-token');
      const token = extractTokenFromUrl(url);
      expect(token).toBe('my-token');
    });

    it('should return null if no token param', () => {
      const url = new URL('https://example.com/api');
      const token = extractTokenFromUrl(url);
      expect(token).toBeNull();
    });
  });
});

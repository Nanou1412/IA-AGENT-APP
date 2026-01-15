/**
 * Tests for Realtime Server TwiML Endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signInternalToken } from '@repo/core';

const TEST_SECRET = 'test-secret-key-for-testing-purposes';
const TEST_ORG_ID = 'org_test123';

describe('TwiML Endpoint Security', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Token Generation', () => {
    it('should generate valid token for TwiML endpoint', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID, { ttlSeconds: 120 });
      
      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(2);
      
      // Verify the payload contains orgId
      const [payloadB64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      
      expect(payload.orgId).toBe(TEST_ORG_ID);
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('should include endpoint scope when specified', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID, {
        ttlSeconds: 60,
        endpointId: 'twiml-start',
      });
      
      const [payloadB64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      
      expect(payload.endpointId).toBe('twiml-start');
    });
  });

  describe('Token in URL', () => {
    it('should encode token safely in URL', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      const encoded = encodeURIComponent(token);
      const decoded = decodeURIComponent(encoded);
      
      expect(decoded).toBe(token);
    });

    it('should build valid stream URL with token', () => {
      const token = signInternalToken(TEST_SECRET, TEST_ORG_ID);
      const callSid = 'CA1234567890';
      const from = '+1234567890';
      
      const streamUrl = `wss://example.com/ws/twilio?token=${encodeURIComponent(token)}&callSid=${encodeURIComponent(callSid)}&from=${encodeURIComponent(from)}`;
      
      const url = new URL(streamUrl);
      expect(url.searchParams.get('token')).toBe(token);
      expect(url.searchParams.get('callSid')).toBe(callSid);
      expect(url.searchParams.get('from')).toBe(from);
    });
  });
});

/**
 * Rate Limiter Tests
 * 
 * These tests run against the in-memory implementation (no Redis in test env)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  clearAllRateLimits,
} from './rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      const result = await checkRateLimit('org-1', 10);
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBe(9);
    });

    it('should track multiple requests', async () => {
      for (let i = 0; i < 5; i++) {
        await checkRateLimit('org-2', 10);
      }
      
      const status = getRateLimitStatus('org-2', 10);
      expect(status.remainingRequests).toBe(5);
    });

    it('should block when limit exceeded', async () => {
      const limit = 5;
      
      // Use up all requests
      for (let i = 0; i < limit; i++) {
        const result = await checkRateLimit('org-3', limit);
        expect(result.allowed).toBe(true);
      }
      
      // Next request should be blocked
      const blocked = await checkRateLimit('org-3', limit);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remainingRequests).toBe(0);
      expect(blocked.reason).toContain('Rate limit exceeded');
    });

    it('should track different orgs separately', async () => {
      // Exhaust org-4
      for (let i = 0; i < 3; i++) {
        await checkRateLimit('org-4', 3);
      }
      
      // org-5 should still be allowed
      const result = await checkRateLimit('org-5', 3);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return full limit for new org', () => {
      const status = getRateLimitStatus('new-org', 100);
      expect(status.allowed).toBe(true);
      expect(status.remainingRequests).toBe(100);
    });

    it('should not count as a request', () => {
      // Check status multiple times
      getRateLimitStatus('org-6', 10);
      getRateLimitStatus('org-6', 10);
      getRateLimitStatus('org-6', 10);
      
      // Should still have full limit
      const status = getRateLimitStatus('org-6', 10);
      expect(status.remainingRequests).toBe(10);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset limit for specific org', async () => {
      // Use some requests
      for (let i = 0; i < 5; i++) {
        await checkRateLimit('org-7', 10);
      }
      
      expect(getRateLimitStatus('org-7', 10).remainingRequests).toBe(5);
      
      // Reset
      resetRateLimit('org-7');
      
      expect(getRateLimitStatus('org-7', 10).remainingRequests).toBe(10);
    });

    it('should not affect other orgs', async () => {
      await checkRateLimit('org-8', 10);
      await checkRateLimit('org-9', 10);
      
      resetRateLimit('org-8');
      
      expect(getRateLimitStatus('org-8', 10).remainingRequests).toBe(10);
      expect(getRateLimitStatus('org-9', 10).remainingRequests).toBe(9);
    });
  });

  describe('clearAllRateLimits', () => {
    it('should clear all tracked orgs', async () => {
      await checkRateLimit('org-10', 10);
      await checkRateLimit('org-11', 10);
      await checkRateLimit('org-12', 10);
      
      clearAllRateLimits();
      
      expect(getRateLimitStatus('org-10', 10).remainingRequests).toBe(10);
      expect(getRateLimitStatus('org-11', 10).remainingRequests).toBe(10);
      expect(getRateLimitStatus('org-12', 10).remainingRequests).toBe(10);
    });
  });
});

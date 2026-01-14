/**
 * Twilio Library - Unit Tests
 * 
 * Tests for getPublicRequestUrl and signature validation helpers
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getPublicRequestUrl } from '@/lib/twilio';

// Helper to create mock NextRequest
function createMockRequest(options: {
  pathname: string;
  search?: string;
  headers?: Record<string, string>;
}): NextRequest {
  const url = `http://localhost:3001${options.pathname}${options.search || ''}`;
  const headers = new Headers(options.headers || {});
  
  return new NextRequest(url, {
    headers,
  });
}

describe('getPublicRequestUrl', () => {
  describe('Local development (no proxy headers)', () => {
    it('returns production fallback URL when no proxy headers or host', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/sms',
      });

      const result = getPublicRequestUrl(req);
      
      // Falls back to production URL when no headers present
      expect(result).toBe('https://ia-agent-app-app.vercel.app/api/twilio/sms');
    });

    it('includes query string in URL', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/status',
        search: '?test=1',
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://ia-agent-app-app.vercel.app/api/twilio/status?test=1');
    });
  });

  describe('Behind Vercel/Cloudflare proxy', () => {
    it('uses x-forwarded-host when present', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/sms',
        headers: {
          'x-forwarded-host': 'myapp.vercel.app',
          'x-forwarded-proto': 'https',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://myapp.vercel.app/api/twilio/sms');
    });

    it('uses x-forwarded-proto for protocol', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/whatsapp',
        headers: {
          'x-forwarded-host': 'myapp.example.com',
          'x-forwarded-proto': 'https',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://myapp.example.com/api/twilio/whatsapp');
    });

    it('falls back to host header when no x-forwarded-host', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/sms',
        headers: {
          'host': 'custom-host.example.com',
          'x-forwarded-proto': 'https',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://custom-host.example.com/api/twilio/sms');
    });

    it('handles complex real-world Vercel deployment', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/sms',
        headers: {
          'x-forwarded-host': 'ia-agent-app-git-main-acme.vercel.app',
          'x-forwarded-proto': 'https',
          'x-vercel-id': 'sfo1::iad1::12345',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://ia-agent-app-git-main-acme.vercel.app/api/twilio/sms');
    });

    it('handles custom domain with path', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/status',
        headers: {
          'x-forwarded-host': 'app.mycompany.com.au',
          'x-forwarded-proto': 'https',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://app.mycompany.com.au/api/twilio/status');
    });
  });

  describe('Edge cases', () => {
    it('defaults to https when x-forwarded-proto is missing', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/sms',
        headers: {
          'x-forwarded-host': 'myapp.example.com',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://myapp.example.com/api/twilio/sms');
    });

    it('preserves complex query strings', () => {
      const req = createMockRequest({
        pathname: '/api/twilio/sms',
        search: '?AccountSid=AC123&foo=bar&baz=qux',
        headers: {
          'x-forwarded-host': 'myapp.example.com',
          'x-forwarded-proto': 'https',
        },
      });

      const result = getPublicRequestUrl(req);
      
      expect(result).toBe('https://myapp.example.com/api/twilio/sms?AccountSid=AC123&foo=bar&baz=qux');
    });
  });
});

describe('Default EN messages', () => {
  it('exports default messages in English', async () => {
    const {
      DEFAULT_DENIED_TEXT,
      DEFAULT_UNMAPPED_TEXT,
      DEFAULT_INBOUND_REPLY_TEXT,
      DEFAULT_HANDOFF_TEXT,
    } = await import('@/lib/twilio');

    // Verify messages are in English (not French)
    expect(DEFAULT_DENIED_TEXT).not.toContain('Merci');
    expect(DEFAULT_DENIED_TEXT).not.toContain('équipe');
    expect(DEFAULT_DENIED_TEXT).toContain('Thanks');
    
    expect(DEFAULT_UNMAPPED_TEXT).not.toContain('numéro');
    expect(DEFAULT_UNMAPPED_TEXT).toContain('number');
    
    expect(DEFAULT_INBOUND_REPLY_TEXT).toContain('Thanks');
    expect(DEFAULT_HANDOFF_TEXT).toContain('Thanks');
  });
});

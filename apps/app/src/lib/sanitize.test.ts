/**
 * Sanitize Utilities Tests
 * 
 * Tests for sensitive data sanitization functions.
 * CRITICAL: These tests ensure tokens are NEVER logged or stored.
 */

import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeForLog, containsSensitiveData, assertSanitized } from './sanitize';

describe('sanitize', () => {
  describe('sensitive key removal', () => {
    it('should redact access_token', () => {
      const input = { access_token: 'ya29.sensitive-token', user: 'test' };
      const result = sanitize(input);
      
      expect(result.access_token).toBe('[REDACTED]');
      expect(result.user).toBe('test');
    });

    it('should redact accessToken (camelCase)', () => {
      const input = { accessToken: 'ya29.sensitive-token', id: 123 };
      const result = sanitize(input);
      
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.id).toBe(123);
    });

    it('should redact refresh_token', () => {
      const input = { refresh_token: '1//abc', data: 'test' };
      const result = sanitize(input);
      
      expect(result.refresh_token).toBe('[REDACTED]');
    });

    it('should redact refreshToken (camelCase)', () => {
      const input = { refreshToken: '1//abc' };
      const result = sanitize(input);
      
      expect(result.refreshToken).toBe('[REDACTED]');
    });

    it('should redact authorization header', () => {
      const input = { authorization: 'Bearer token123', path: '/api' };
      const result = sanitize(input);
      
      expect(result.authorization).toBe('[REDACTED]');
    });

    it('should redact Authorization (capitalized)', () => {
      const input = { Authorization: 'Bearer abc' };
      const result = sanitize(input);
      
      expect(result.Authorization).toBe('[REDACTED]');
    });

    it('should redact api_key', () => {
      const input = { api_key: 'sk-xxxx', name: 'test' };
      const result = sanitize(input);
      
      expect(result.api_key).toBe('[REDACTED]');
    });

    it('should redact secret and password', () => {
      const input = { secret: 'mysecret', password: 'mypassword', username: 'user' };
      const result = sanitize(input);
      
      expect(result.secret).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('user');
    });

    it('should redact client_secret', () => {
      const input = { client_secret: 'GOCSPX-xxx' };
      const result = sanitize(input);
      
      expect(result.client_secret).toBe('[REDACTED]');
    });

    it('should redact id_token and idToken', () => {
      const input = { id_token: 'eyJ...', idToken: 'eyJ...' };
      const result = sanitize(input);
      
      expect(result.id_token).toBe('[REDACTED]');
      expect(result.idToken).toBe('[REDACTED]');
    });
  });

  describe('nested objects', () => {
    it('should sanitize nested objects', () => {
      const input = {
        user: { name: 'John' },
        auth: { accessToken: 'token123', provider: 'google' },
      };
      const result = sanitize(input);
      
      expect(result.user.name).toBe('John');
      expect(result.auth.accessToken).toBe('[REDACTED]');
      expect(result.auth.provider).toBe('google');
    });

    it('should sanitize deeply nested tokens', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              access_token: 'deep-token',
              safe: true,
            },
          },
        },
      };
      const result = sanitize(input);
      
      expect(result.level1.level2.level3.access_token).toBe('[REDACTED]');
      expect(result.level1.level2.level3.safe).toBe(true);
    });

    it('should respect max depth to prevent infinite loops', () => {
      // Create a deeply nested object
      let obj: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      
      // Should not throw
      const result = sanitize(obj);
      expect(result).toBeDefined();
    });
  });

  describe('arrays', () => {
    it('should sanitize arrays of objects', () => {
      const input = [
        { id: 1, token: 'abc' },
        { id: 2, token: 'def' },
      ];
      const result = sanitize(input);
      
      expect(result[0].id).toBe(1);
      expect(result[0].token).toBe('[REDACTED]');
      expect(result[1].id).toBe(2);
      expect(result[1].token).toBe('[REDACTED]');
    });

    it('should sanitize arrays with sensitive string values', () => {
      const input = ['normal', 'ya29.sensitive-token', 'also-normal'];
      const result = sanitize(input);
      
      expect(result[0]).toBe('normal');
      expect(result[1]).toBe('[REDACTED]');
      expect(result[2]).toBe('also-normal');
    });
  });

  describe('sensitive value patterns', () => {
    it('should redact Google access tokens (ya29.)', () => {
      const input = { data: 'ya29.a0AfH6SMB...' };
      const result = sanitize(input);
      
      expect(result.data).toBe('[REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const input = { token: jwt };
      const result = sanitize(input);
      
      expect(result.token).toBe('[REDACTED]');
    });

    it('should redact Stripe secret keys', () => {
      const input = { key: 'sk_test_abc123' };
      const result = sanitize(input);
      
      expect(result.key).toBe('[REDACTED]');
    });

    it('should redact Bearer tokens', () => {
      const input = { auth: 'Bearer eyJ...' };
      const result = sanitize(input);
      
      expect(result.auth).toBe('[REDACTED]');
    });

    it('should not redact normal strings', () => {
      const input = { message: 'Hello world', email: 'test@example.com' };
      const result = sanitize(input);
      
      expect(result.message).toBe('Hello world');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('edge cases', () => {
    it('should handle null', () => {
      expect(sanitize(null)).toBe(null);
    });

    it('should handle undefined', () => {
      expect(sanitize(undefined)).toBe(undefined);
    });

    it('should handle primitives', () => {
      expect(sanitize(123)).toBe(123);
      expect(sanitize('hello')).toBe('hello');
      expect(sanitize(true)).toBe(true);
    });

    it('should handle empty objects', () => {
      expect(sanitize({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(sanitize([])).toEqual([]);
    });
  });
});

describe('sanitizeForLog', () => {
  it('should sanitize and truncate long strings', () => {
    const longString = 'a'.repeat(1000);
    const input = { data: longString, accessToken: 'token' };
    const result = sanitizeForLog(input, 100);
    
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.data.length).toBeLessThan(150); // 100 + truncation marker
    expect(result.data).toContain('...[truncated]');
  });

  it('should not truncate short strings', () => {
    const input = { data: 'short', name: 'test' };
    const result = sanitizeForLog(input);
    
    expect(result.data).toBe('short');
    expect(result.name).toBe('test');
  });
});

describe('containsSensitiveData', () => {
  it('should detect sensitive keys', () => {
    expect(containsSensitiveData({ access_token: 'token' })).toBe(true);
    expect(containsSensitiveData({ accessToken: 'token' })).toBe(true);
    expect(containsSensitiveData({ password: 'pass' })).toBe(true);
  });

  it('should detect sensitive values', () => {
    expect(containsSensitiveData({ data: 'ya29.token' })).toBe(true);
    expect(containsSensitiveData({ auth: 'Bearer xyz' })).toBe(true);
  });

  it('should return false for safe data', () => {
    expect(containsSensitiveData({ name: 'John', age: 30 })).toBe(false);
    expect(containsSensitiveData({ email: 'test@example.com' })).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(containsSensitiveData(null)).toBe(false);
    expect(containsSensitiveData(undefined)).toBe(false);
  });

  it('should detect sensitive data in nested objects', () => {
    expect(containsSensitiveData({ 
      user: { 
        auth: { accessToken: 'token' } 
      } 
    })).toBe(true);
  });

  it('should detect sensitive data in arrays', () => {
    expect(containsSensitiveData([
      { id: 1 },
      { access_token: 'token' }
    ])).toBe(true);
  });

  it('should not flag already redacted values', () => {
    expect(containsSensitiveData({ 
      accessToken: '[REDACTED]',
      password: '[REDACTED]'
    })).toBe(false);
  });
});

describe('assertSanitized', () => {
  it('should not throw for sanitized data', () => {
    const sanitized = sanitize({ accessToken: 'token', name: 'John' });
    expect(() => assertSanitized(sanitized)).not.toThrow();
  });

  it('should throw for unsanitized data', () => {
    const unsanitized = { accessToken: 'token', name: 'John' };
    expect(() => assertSanitized(unsanitized)).toThrow('Sensitive data found');
  });

  it('should include context in error message', () => {
    const unsanitized = { password: 'secret' };
    expect(() => assertSanitized(unsanitized, 'user credentials')).toThrow('user credentials');
  });
});

describe('real-world scenarios', () => {
  it('should sanitize Google OAuth response', () => {
    const oauthResponse = {
      access_token: 'ya29.a0ARrdaM...',
      expires_in: 3599,
      refresh_token: '1//0gxxx...',
      scope: 'https://www.googleapis.com/auth/calendar',
      token_type: 'Bearer',
      id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    };

    const result = sanitize(oauthResponse);

    expect(result.access_token).toBe('[REDACTED]');
    expect(result.refresh_token).toBe('[REDACTED]');
    expect(result.id_token).toBe('[REDACTED]');
    expect(result.expires_in).toBe(3599);
    expect(result.scope).toBe('https://www.googleapis.com/auth/calendar');
    expect(result.token_type).toBe('Bearer');
  });

  it('should sanitize API request headers', () => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ya29.token',
      'X-Request-ID': 'abc123',
    };

    const result = sanitize(headers);

    expect(result['Content-Type']).toBe('application/json');
    expect(result['Authorization']).toBe('[REDACTED]');
    expect(result['X-Request-ID']).toBe('abc123');
  });

  it('should sanitize booking log input', () => {
    const bookingInput = {
      name: 'John Doe',
      phone: '+61412345678',
      partySize: 4,
      dateTime: '2024-01-15T19:00:00Z',
      // This should never be here, but test anyway
      internalToken: 'ya29.internal',
    };

    const result = sanitize(bookingInput);

    expect(result.name).toBe('John Doe');
    expect(result.phone).toBe('+61412345678');
    expect(result.partySize).toBe(4);
    expect(result.dateTime).toBe('2024-01-15T19:00:00Z');
    expect(result.internalToken).toBe('[REDACTED]');
  });
});

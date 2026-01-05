/**
 * Crypto Module Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  encrypt,
  decrypt,
  encryptToken,
  decryptToken,
  generateSignedOAuthState,
  validateSignedOAuthState,
  isEncryptionConfigured,
} from './crypto';

// Mock environment
const VALID_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'); // 32 bytes

describe('crypto', () => {
  const originalEnv = process.env.TOKENS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKENS_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.TOKENS_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.TOKENS_ENCRYPTION_KEY;
    }
  });

  describe('isEncryptionConfigured', () => {
    it('should return true when key is configured', () => {
      expect(isEncryptionConfigured()).toBe(true);
    });

    it('should return false when key is missing', () => {
      delete process.env.TOKENS_ENCRYPTION_KEY;
      expect(isEncryptionConfigured()).toBe(false);
    });

    it('should return false when key is wrong length', () => {
      process.env.TOKENS_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
      expect(isEncryptionConfigured()).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string roundtrip', () => {
      const plaintext = 'my-super-secret-token-12345';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'same-token';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Token with émojis 🔐 and ñ characters';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long tokens', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw on empty plaintext', () => {
      expect(() => encrypt('')).toThrow('Cannot encrypt empty string');
    });

    it('should throw on empty ciphertext', () => {
      expect(() => decrypt('')).toThrow('Cannot decrypt empty string');
    });

    it('should throw on invalid ciphertext', () => {
      expect(() => decrypt('invalid-base64!!')).toThrow();
    });

    it('should throw on truncated ciphertext', () => {
      const encrypted = encrypt('test');
      const truncated = encrypted.substring(0, 20);
      
      expect(() => decrypt(truncated)).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encrypt('test');
      // Flip a character
      const tampered = encrypted.substring(0, 20) + 'X' + encrypted.substring(21);
      
      expect(() => decrypt(tampered)).toThrow('Decryption failed');
    });

    it('should throw when key is missing', () => {
      delete process.env.TOKENS_ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('TOKENS_ENCRYPTION_KEY environment variable is required');
    });

    it('should throw when key is wrong length', () => {
      process.env.TOKENS_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
      expect(() => encrypt('test')).toThrow('must be 32 bytes');
    });
  });

  describe('encryptToken/decryptToken', () => {
    it('should return null for null input', () => {
      expect(encryptToken(null)).toBeNull();
      expect(decryptToken(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(encryptToken(undefined)).toBeNull();
      expect(decryptToken(undefined)).toBeNull();
    });

    it('should encrypt and decrypt tokens', () => {
      const token = 'ya29.access-token-value';
      const encrypted = encryptToken(token);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(token);
      
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });
  });

  describe('generateSignedOAuthState/validateSignedOAuthState', () => {
    it('should generate and validate a signed state', () => {
      const orgId = 'org_12345';
      const state = generateSignedOAuthState(orgId);
      
      expect(state).toContain('.');
      
      const validated = validateSignedOAuthState(state);
      expect(validated).not.toBeNull();
      expect(validated?.orgId).toBe(orgId);
      expect(validated?.nonce).toBeDefined();
    });

    it('should reject tampered state', () => {
      const state = generateSignedOAuthState('org_123');
      const tampered = 'tampered' + state;
      
      expect(validateSignedOAuthState(tampered)).toBeNull();
    });

    it('should reject state with invalid signature', () => {
      const state = generateSignedOAuthState('org_123');
      const [payload] = state.split('.');
      const invalidState = `${payload}.invalidsignature`;
      
      expect(validateSignedOAuthState(invalidState)).toBeNull();
    });

    it('should reject expired state', () => {
      const orgId = 'org_123';
      const state = generateSignedOAuthState(orgId);
      
      // Mock Date.now to be in the future (11 minutes)
      const originalNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(originalNow() + 11 * 60 * 1000);
      
      expect(validateSignedOAuthState(state)).toBeNull();
      
      vi.restoreAllMocks();
    });

    it('should return null for invalid format', () => {
      expect(validateSignedOAuthState('')).toBeNull();
      expect(validateSignedOAuthState('no-dot')).toBeNull();
      expect(validateSignedOAuthState('..')).toBeNull();
    });

    it('should produce unique nonces', () => {
      const state1 = generateSignedOAuthState('org_123');
      const state2 = generateSignedOAuthState('org_123');
      
      const validated1 = validateSignedOAuthState(state1);
      const validated2 = validateSignedOAuthState(state2);
      
      expect(validated1?.nonce).not.toBe(validated2?.nonce);
    });
  });
});

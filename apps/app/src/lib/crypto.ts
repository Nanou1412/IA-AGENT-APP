/**
 * Token Encryption - AES-256-GCM encryption for OAuth tokens
 * 
 * This module provides secure encryption/decryption for sensitive tokens
 * stored in the database (e.g., OAuth refresh tokens).
 * 
 * IMPORTANT: Never log decrypted tokens!
 */

import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING = 'base64' as const;

// ============================================================================
// Encryption Key Management
// ============================================================================

/**
 * Get the encryption key from environment
 * Key must be 32 bytes (256 bits) encoded in base64
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.TOKENS_ENCRYPTION_KEY;
  
  if (!keyEnv) {
    throw new Error('TOKENS_ENCRYPTION_KEY environment variable is required');
  }
  
  const key = Buffer.from(keyEnv, 'base64');
  
  if (key.length !== 32) {
    throw new Error(
      `TOKENS_ENCRYPTION_KEY must be 32 bytes (256 bits) base64-encoded. Got ${key.length} bytes.`
    );
  }
  
  return key;
}

/**
 * Check if encryption is configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Encryption / Decryption
// ============================================================================

/**
 * Encrypt a plaintext string using AES-256-GCM
 * 
 * Output format: base64(iv + ciphertext + authTag)
 * 
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in base64 format
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
  }
  
  const key = getEncryptionKey();
  
  // Generate random IV for each encryption
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  // Get auth tag
  const authTag = cipher.getAuthTag();
  
  // Combine: iv + ciphertext + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  
  return combined.toString(ENCODING);
}

/**
 * Decrypt a ciphertext string encrypted with AES-256-GCM
 * 
 * @param ciphertext - The encrypted string in base64 format
 * @returns Decrypted plaintext string
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty string');
  }
  
  const key = getEncryptionKey();
  
  // Decode from base64
  const combined = Buffer.from(ciphertext, ENCODING);
  
  // Validate minimum length: iv + authTag
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new Error('Invalid ciphertext: too short');
  }
  
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  // Set auth tag for verification
  decipher.setAuthTag(authTag);
  
  // Decrypt
  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    // Don't expose specific crypto errors
    throw new Error('Decryption failed: invalid ciphertext or key');
  }
}

// ============================================================================
// Token-Specific Helpers
// ============================================================================

/**
 * Encrypt an OAuth token for storage
 * Returns null if token is null/undefined
 */
export function encryptToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }
  return encrypt(token);
}

/**
 * Decrypt an OAuth token from storage
 * Returns null if encrypted token is null/undefined
 */
export function decryptToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken) {
    return null;
  }
  return decrypt(encryptedToken);
}

// ============================================================================
// Secure State/Nonce Generation
// ============================================================================

/**
 * Generate a cryptographically secure random state for OAuth
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a signed state containing orgId for OAuth callback validation
 * Format: base64(JSON({ orgId, nonce, exp })) + '.' + signature
 */
export function generateSignedOAuthState(orgId: string): string {
  const key = getEncryptionKey();
  
  const payload = {
    orgId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
  };
  
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64');
  
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(payloadStr);
  const signature = hmac.digest('base64url');
  
  return `${payloadStr}.${signature}`;
}

/**
 * Validate and parse a signed OAuth state
 * Returns null if invalid/expired
 */
export function validateSignedOAuthState(state: string): { orgId: string; nonce: string } | null {
  try {
    const key = getEncryptionKey();
    
    const [payloadStr, signature] = state.split('.');
    if (!payloadStr || !signature) {
      return null;
    }
    
    // Verify signature
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest('base64url');
    
    // Constant-time comparison
    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      return null;
    }
    
    // Parse payload
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf8'));
    
    // Check expiry
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }
    
    if (!payload.orgId || !payload.nonce) {
      return null;
    }
    
    return {
      orgId: payload.orgId,
      nonce: payload.nonce,
    };
  } catch {
    return null;
  }
}

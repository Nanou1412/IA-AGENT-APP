/**
 * Internal Token Signing/Verification
 * 
 * Standalone implementation for secure server-to-server communication.
 * Uses HMAC SHA256 with timestamp for expiration.
 * 
 * @module internal-token
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface InternalTokenPayload {
  orgId: string;
  timestamp: number;
  endpointId?: string;
}

export interface TokenVerificationResult {
  valid: boolean;
  orgId?: string;
  error?: string;
  payload?: InternalTokenPayload;
}

export interface SignTokenOptions {
  ttlSeconds?: number;
  endpointId?: string;
}

// ============================================================================
// Core Functions
// ============================================================================

const DEFAULT_TTL_SECONDS = 60;

/**
 * Sign an internal token for secure server-to-server communication
 */
export function signInternalToken(
  secretKey: string,
  orgId: string,
  options?: SignTokenOptions
): string {
  const timestamp = Date.now();
  const payload: InternalTokenPayload = {
    orgId,
    timestamp,
    ...(options?.endpointId && { endpointId: options.endpointId }),
  };
  
  const payloadString = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadString).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadBase64)
    .digest('base64url');
  
  return `${payloadBase64}.${signature}`;
}

/**
 * Verify an internal token
 */
export function verifyInternalToken(
  token: string,
  secretKey: string,
  options?: { ttlSeconds?: number }
): TokenVerificationResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid token format' };
    }
    
    const [payloadBase64, providedSignature] = parts;
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payloadBase64)
      .digest('base64url');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature)
    )) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Parse payload
    const payloadString = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload: InternalTokenPayload = JSON.parse(payloadString);
    
    // Check expiration
    const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const age = Date.now() - payload.timestamp;
    if (age > ttl * 1000) {
      return { valid: false, error: 'Token expired' };
    }
    
    if (age < 0) {
      return { valid: false, error: 'Token from future' };
    }
    
    return {
      valid: true,
      orgId: payload.orgId,
      payload,
    };
  } catch {
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Extract token from query string, body, or headers
 */
export function extractTokenFromRequest(req: {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: { get?: (name: string) => string | null } | Record<string, string>;
}): string | null {
  // Try query
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  
  // Try body
  if (req.body?.token && typeof req.body.token === 'string') {
    return req.body.token;
  }
  
  // Try header
  if (req.headers) {
    if (typeof req.headers.get === 'function') {
      return req.headers.get('x-internal-token');
    }
    if ('x-internal-token' in req.headers) {
      return req.headers['x-internal-token'] as string;
    }
  }
  
  return null;
}

/**
 * Extract token from URL query parameters
 */
export function extractTokenFromQuery(params: Record<string, unknown>): string | null {
  if (params.token && typeof params.token === 'string') {
    return params.token;
  }
  return null;
}

/**
 * Extract token from URL string
 */
export function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token');
  } catch {
    return null;
  }
}

// ============================================================================
// App-specific helpers (use environment variable)
// ============================================================================

/**
 * Get the internal API key from environment
 * @throws Error if INTERNAL_API_KEY not set
 */
function getSecretKey(): string {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) {
    throw new Error('INTERNAL_API_KEY not configured');
  }
  return key;
}

/**
 * Sign token using environment's INTERNAL_API_KEY
 * Convenience wrapper for app-specific usage.
 */
export function signTokenWithEnvKey(
  orgId: string,
  options?: { ttlSeconds?: number; endpointId?: string }
): string {
  return signInternalToken(getSecretKey(), orgId, options);
}

/**
 * Verify token using environment's INTERNAL_API_KEY
 * Convenience wrapper for app-specific usage.
 */
export function verifyTokenWithEnvKey(token: string) {
  return verifyInternalToken(token, getSecretKey());
}

/**
 * Internal Token Signing/Verification
 * 
 * SECURITY (F-005/F-006): Signed HMAC tokens for server-to-server communication
 * Used to prevent unauthorized access to internal endpoints (realtime-server, etc.)
 * 
 * Token format: base64url(payload).hexSignature
 * Payload: { orgId, endpointId?, iat, exp }
 * 
 * @module @repo/core/internal-token
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface InternalTokenPayload {
  /** Organization ID */
  orgId: string;
  /** Optional endpoint identifier for scoped tokens */
  endpointId?: string;
  /** Issued at (Unix timestamp in seconds) */
  iat: number;
  /** Expiration (Unix timestamp in seconds) */
  exp: number;
}

export interface TokenVerificationResult {
  /** Whether the token is valid */
  ok: boolean;
  /** Decoded payload if valid */
  payload?: InternalTokenPayload;
  /** Error message if invalid */
  error?: string;
}

export interface SignTokenOptions {
  /** Token TTL in seconds (default: 60) */
  ttlSeconds?: number;
  /** Optional endpoint ID to scope the token */
  endpointId?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TTL_SECONDS = 60;
const ALGORITHM = 'sha256';
const MAX_CLOCK_SKEW_SECONDS = 60;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Sign payload with HMAC SHA256
 * @internal
 */
function signPayload(payloadB64: string, secret: string): string {
  return crypto
    .createHmac(ALGORITHM, secret)
    .update(payloadB64)
    .digest('hex');
}

/**
 * Create a signed internal token
 * 
 * @param secretKey - HMAC secret key (INTERNAL_API_KEY)
 * @param orgId - Organization ID to include in token
 * @param options - Optional signing options
 * @returns Signed token string
 * 
 * @example
 * ```typescript
 * const token = signInternalToken(process.env.INTERNAL_API_KEY!, 'org_123');
 * // Use token in request to realtime-server
 * ```
 */
export function signInternalToken(
  secretKey: string,
  orgId: string,
  options: SignTokenOptions = {}
): string {
  if (!secretKey) {
    throw new Error('Secret key is required');
  }
  if (!orgId) {
    throw new Error('orgId is required');
  }

  const { ttlSeconds = DEFAULT_TTL_SECONDS, endpointId } = options;
  
  const now = Math.floor(Date.now() / 1000);
  const payload: InternalTokenPayload = {
    orgId,
    iat: now,
    exp: now + ttlSeconds,
  };
  
  if (endpointId) {
    payload.endpointId = endpointId;
  }
  
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadB64, secretKey);
  
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a signed internal token
 * 
 * @param token - Token string to verify
 * @param secretKey - HMAC secret key (must match signing key)
 * @returns Verification result with payload if valid
 * 
 * @example
 * ```typescript
 * const result = verifyInternalToken(token, process.env.INTERNAL_API_KEY!);
 * if (result.ok) {
 *   console.log('Org:', result.payload.orgId);
 * } else {
 *   console.error('Invalid token:', result.error);
 * }
 * ```
 */
export function verifyInternalToken(
  token: string,
  secretKey: string
): TokenVerificationResult {
  // Validate inputs
  if (!token) {
    return { ok: false, error: 'Token is empty' };
  }
  if (!secretKey) {
    return { ok: false, error: 'Secret key not configured' };
  }
  
  // Parse token format
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'Invalid token format' };
  }
  
  const [payloadB64, providedSignature] = parts;
  
  // Verify signature using timing-safe comparison
  const expectedSignature = signPayload(payloadB64, secretKey);
  try {
    const sigBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (sigBuffer.length !== expectedBuffer.length) {
      return { ok: false, error: 'Invalid signature' };
    }
    
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { ok: false, error: 'Invalid signature' };
    }
  } catch {
    return { ok: false, error: 'Signature verification failed' };
  }
  
  // Parse payload
  let payload: InternalTokenPayload;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, error: 'Invalid payload encoding' };
  }
  
  // Validate required fields
  if (!payload.orgId || typeof payload.orgId !== 'string') {
    return { ok: false, error: 'Missing or invalid orgId' };
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    return { ok: false, error: 'Missing required timestamp fields' };
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp) {
    return { ok: false, error: 'Token expired' };
  }
  
  // Check issued time (not too far in the future - clock skew tolerance)
  if (payload.iat > now + MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: 'Token issued in the future' };
  }
  
  return { ok: true, payload };
}

// ============================================================================
// Extraction Helpers
// ============================================================================

/**
 * Extract token from various request sources
 * Checks: Authorization Bearer header, x-internal-token header, query param
 * 
 * @param headers - Request headers (fetch Headers or object with get method)
 * @param url - Optional URL for query param extraction
 * @returns Token string or null if not found
 */
export function extractTokenFromRequest(
  headers: { get: (key: string) => string | null },
  url?: URL | null
): string | null {
  // Try Authorization: Bearer header
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Try x-internal-token header
  const tokenHeader = headers.get('x-internal-token');
  if (tokenHeader) {
    return tokenHeader;
  }
  
  // Try query param
  if (url) {
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) {
      return tokenParam;
    }
  }
  
  return null;
}

/**
 * Extract token from query string object (for Express-style APIs)
 */
export function extractTokenFromQuery(query: Record<string, unknown>): string | null {
  const token = query.token;
  if (typeof token === 'string' && token.length > 0) {
    return token;
  }
  return null;
}

/**
 * Extract token from URL search params
 */
export function extractTokenFromUrl(url: URL): string | null {
  return url.searchParams.get('token');
}

/**
 * Internal Token Signing/Verification
 * 
 * SECURITY (F-005/F-006): Signed HMAC tokens for server-to-server communication
 * Used to prevent unauthorized access to realtime-server endpoints.
 * 
 * Token format: base64(payload).signature
 * Payload: { orgId, endpointId?, iat, exp }
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface InternalTokenPayload {
  orgId: string;
  endpointId?: string;
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp)
}

export interface TokenVerificationResult {
  ok: boolean;
  payload?: InternalTokenPayload;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TTL_SECONDS = 60;
const ALGORITHM = 'sha256';

// ============================================================================
// Token Functions
// ============================================================================

/**
 * Get the internal API key from environment
 * In production, this MUST be set (enforced by env-validation.ts)
 */
function getSecretKey(): string {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) {
    throw new Error('INTERNAL_API_KEY not configured');
  }
  return key;
}

/**
 * Sign payload with HMAC SHA256
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
 * @param orgId - Organization ID to include in token
 * @param endpointId - Optional endpoint identifier
 * @param ttlSeconds - Token TTL (default 60 seconds)
 * @returns Signed token string
 */
export function signInternalToken(
  orgId: string,
  endpointId?: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const secret = getSecretKey();
  
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
  const signature = signPayload(payloadB64, secret);
  
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a signed internal token
 * 
 * @param token - Token string to verify
 * @returns Verification result with payload if valid
 */
export function verifyInternalToken(token: string): TokenVerificationResult {
  if (!token) {
    return { ok: false, error: 'Token is empty' };
  }
  
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'Invalid token format' };
  }
  
  const [payloadB64, providedSignature] = parts;
  
  let secret: string;
  try {
    secret = getSecretKey();
  } catch {
    return { ok: false, error: 'Server configuration error' };
  }
  
  // Verify signature
  const expectedSignature = signPayload(payloadB64, secret);
  if (!crypto.timingSafeEqual(
    Buffer.from(providedSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )) {
    return { ok: false, error: 'Invalid signature' };
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
  if (!payload.orgId || !payload.iat || !payload.exp) {
    return { ok: false, error: 'Missing required fields' };
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp) {
    return { ok: false, error: 'Token expired' };
  }
  
  // Check issued time (not in future)
  if (payload.iat > now + 60) { // Allow 60s clock skew
    return { ok: false, error: 'Token issued in the future' };
  }
  
  return { ok: true, payload };
}

/**
 * Extract token from request (header or query param)
 * Looks for: Authorization: Bearer <token>, x-internal-token header, or ?token= query
 */
export function extractTokenFromRequest(
  headers: Headers | { get: (key: string) => string | null },
  url?: URL
): string | null {
  // Try Authorization header first
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

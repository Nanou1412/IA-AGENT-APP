/**
 * Internal Token Verification for Realtime Server
 * 
 * SECURITY (F-005/F-006): Verifies HMAC tokens from the main app
 * to prevent unauthorized access to voice AI endpoints.
 * 
 * Token format: base64(payload).signature
 * Payload: { orgId, endpointId?, iat, exp }
 * 
 * NOTE: This is a standalone copy (not imported from @repo/core)
 * because @repo/core is not compiled for production runtime.
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface InternalTokenPayload {
  orgId: string;
  endpointId?: string;
  iat: number;
  exp: number;
}

export interface TokenVerificationResult {
  ok: boolean;
  payload?: InternalTokenPayload;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'sha256';
const MAX_CLOCK_SKEW_SECONDS = 60;

// ============================================================================
// Token Functions
// ============================================================================

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
 * Verify a signed internal token
 */
export function verifyInternalToken(token: string, secretKey: string): TokenVerificationResult {
  if (!token) {
    return { ok: false, error: 'Token is empty' };
  }
  
  if (!secretKey) {
    return { ok: false, error: 'Server secret key not configured' };
  }
  
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'Invalid token format' };
  }
  
  const [payloadB64, providedSignature] = parts;
  
  // Verify signature
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
  if (!payload.orgId || !payload.iat || !payload.exp) {
    return { ok: false, error: 'Missing required fields in token' };
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp) {
    return { ok: false, error: 'Token expired' };
  }
  
  // Check issued time (not in future, with clock skew tolerance)
  if (payload.iat > now + MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: 'Token issued in the future' };
  }
  
  return { ok: true, payload };
}

/**
 * Extract token from query string
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

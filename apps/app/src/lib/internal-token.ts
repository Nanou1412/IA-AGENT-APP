/**
 * Internal Token Signing/Verification
 * 
 * Re-exports from @repo/core for backwards compatibility.
 * New code should import directly from '@repo/core'.
 * 
 * @module internal-token
 * @see @repo/core/internal-token
 */

// Re-export everything from the shared package
export {
  signInternalToken,
  verifyInternalToken,
  extractTokenFromRequest,
  extractTokenFromQuery,
  extractTokenFromUrl,
} from '@repo/core';

export type {
  InternalTokenPayload,
  TokenVerificationResult,
  SignTokenOptions,
} from '@repo/core';

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
  const { signInternalToken } = require('@repo/core');
  return signInternalToken(getSecretKey(), orgId, options);
}

/**
 * Verify token using environment's INTERNAL_API_KEY
 * Convenience wrapper for app-specific usage.
 */
export function verifyTokenWithEnvKey(token: string) {
  const { verifyInternalToken } = require('@repo/core');
  return verifyInternalToken(token, getSecretKey());
}

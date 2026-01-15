/**
 * Internal Token Verification for Realtime Server
 * 
 * Re-exports from @repo/core for backwards compatibility.
 * The realtime-server uses the same token format as the main app.
 * 
 * @module internal-token
 * @see @repo/core/internal-token
 */

// Re-export verification functions from shared package
export {
  verifyInternalToken,
  extractTokenFromQuery,
  extractTokenFromUrl,
} from '@repo/core';

export type {
  InternalTokenPayload,
  TokenVerificationResult,
} from '@repo/core';

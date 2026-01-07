/**
 * Stripe Connect OAuth helpers
 * - State signing/verification (anti-CSRF)
 * - Config validation
 */

import { createHmac, timingSafeEqual } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Validate required Stripe Connect env vars
 * @throws Error if any required var is missing
 */
export function validateStripeConnectConfig(): {
  clientId: string;
  redirectUri: string;
  secretKey: string;
} {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!clientId) {
    throw new Error('STRIPE_CONNECT_CLIENT_ID is not configured');
  }
  if (!redirectUri) {
    throw new Error('STRIPE_CONNECT_REDIRECT_URI is not configured');
  }
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return { clientId, redirectUri, secretKey };
}

/**
 * Sign state with HMAC for OAuth security
 * Format: orgId:timestamp:nonce:signature
 */
export function signState(orgId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.STRIPE_CONNECT_STATE_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET or STRIPE_CONNECT_STATE_SECRET required for state signing');
  }

  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(2, 15);
  const payload = `${orgId}:${timestamp}:${nonce}`;
  
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  return `${payload}:${signature}`;
}

/**
 * Verify and extract orgId from signed state
 * @throws Error if state is invalid or expired
 */
export function verifyState(state: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.STRIPE_CONNECT_STATE_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET or STRIPE_CONNECT_STATE_SECRET required for state verification');
  }

  const parts = state.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid state format');
  }

  const [orgId, timestamp, nonce, signature] = parts;

  // Check TTL
  const stateAge = Date.now() - parseInt(timestamp, 10);
  if (stateAge > STATE_TTL_MS) {
    throw new Error('State expired (>10 minutes)');
  }

  // Verify signature
  const payload = `${orgId}:${timestamp}:${nonce}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new Error('Invalid state signature');
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid state signature');
  }

  return orgId;
}

/**
 * Exchange OAuth code for Stripe account ID
 */
export async function exchangeCodeForAccount(code: string): Promise<string> {
  const { clientId, secretKey } = validateStripeConnectConfig();

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
  });

  const response = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${secretKey}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Stripe OAuth token exchange failed: ${response.status} ${JSON.stringify(error)}`
    );
  }

  const data = await response.json();
  
  if (!data.stripe_user_id) {
    throw new Error('No stripe_user_id in OAuth response');
  }

  return data.stripe_user_id;
}

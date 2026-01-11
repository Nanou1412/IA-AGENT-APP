/**
 * Stripe Client Configuration
 * 
 * Centralized Stripe SDK initialization for server-side usage.
 * 
 * PRODUCTION HARDENING:
 * - Validates Stripe key format at initialization
 * - Throws immediately in production if key is invalid/placeholder
 * - Currency is AUD (Australian market only)
 */

import Stripe from 'stripe';

// ============================================================================
// Stripe Key Validation
// ============================================================================

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

/**
 * Validate Stripe secret key format
 */
function validateStripeKey(key: string | undefined): boolean {
  if (!key) return false;
  // Valid Stripe secret keys start with sk_live_ or sk_test_
  return key.startsWith('sk_live_') || key.startsWith('sk_test_');
}

/**
 * Get validated Stripe secret key
 * In production: throws if key is missing or invalid
 * In development: returns placeholder for build time only
 */
function getStripeSecretKey(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const isBuildPhase = !!process.env.NEXT_PHASE;
  
  // During build phase, allow placeholder
  if (isBuildPhase) {
    return stripeSecretKey || 'sk_test_build_placeholder';
  }
  
  // In production runtime, validate strictly
  if (isProd) {
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is required in production');
    }
    if (!validateStripeKey(stripeSecretKey)) {
      throw new Error('STRIPE_SECRET_KEY has invalid format. Must start with sk_live_ or sk_test_');
    }
    // Warn if using test key in production
    if (stripeSecretKey.startsWith('sk_test_')) {
      console.warn('[stripe] WARNING: Using TEST key in production environment');
    }
  }
  
  // Development: allow any key or placeholder
  return stripeSecretKey || 'sk_test_placeholder';
}

/**
 * Stripe client instance for server-side API calls
 * 
 * Usage:
 *   import { stripe } from '@/lib/stripe';
 *   const customer = await stripe.customers.create({ email: 'test@example.com' });
 */
export const stripe = new Stripe(getStripeSecretKey(), {
  apiVersion: '2025-12-15.clover',
  typescript: true,
  appInfo: {
    name: 'ia-agent-app',
    version: '1.0.0',
  },
});

// ============================================================================
// Pricing Configuration (Australian Market)
// ============================================================================

/**
 * Default currency for all Stripe operations
 * AUSTRALIA ONLY - All prices in AUD
 */
export const STRIPE_CURRENCY = 'aud' as const;

/**
 * Price ID for the one-time setup fee (390 AUD)
 */
export const STRIPE_SETUP_FEE_PRICE_ID = process.env.STRIPE_SETUP_FEE_PRICE_ID || '';

/**
 * Price ID for the weekly recurring subscription (69.90 AUD)
 */
export const STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID = process.env.STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID || '';

/**
 * Webhook secret for verifying Stripe webhook signatures
 */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * App URL for success/cancel redirects
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// ============================================================================
// Billing Status Mapping
// ============================================================================

import { BillingStatus } from '@prisma/client';

/**
 * Map Stripe subscription status to our BillingStatus enum
 */
export function mapStripeStatusToBillingStatus(
  stripeStatus: Stripe.Subscription.Status
): BillingStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return BillingStatus.active;
    case 'past_due':
      return BillingStatus.past_due;
    case 'canceled':
    case 'unpaid':
      return BillingStatus.canceled;
    case 'incomplete':
    case 'incomplete_expired':
      return BillingStatus.incomplete;
    case 'paused':
      return BillingStatus.past_due; // Treat paused as past_due
    default:
      console.warn(`[stripe] Unknown subscription status: ${stripeStatus}`);
      return BillingStatus.inactive;
  }
}

/**
 * Validate that required Stripe config is present
 */
export function validateStripeConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!process.env.STRIPE_SETUP_FEE_PRICE_ID) missing.push('STRIPE_SETUP_FEE_PRICE_ID');
  if (!process.env.STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID) missing.push('STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID');
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

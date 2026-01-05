/**
 * Stripe Client Configuration
 * 
 * Centralized Stripe SDK initialization for server-side usage.
 */

import Stripe from 'stripe';

// Validate required environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Note: Don't throw during build time - Next.js runs this during page collection
// The actual runtime check happens in the API routes
if (!stripeSecretKey && process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
  console.warn('Warning: STRIPE_SECRET_KEY is not set in production');
}

/**
 * Stripe client instance for server-side API calls
 * 
 * Usage:
 *   import { stripe } from '@/lib/stripe';
 *   const customer = await stripe.customers.create({ email: 'test@example.com' });
 */
export const stripe = new Stripe(stripeSecretKey || 'sk_test_placeholder', {
  apiVersion: '2025-12-15.clover',
  typescript: true,
  appInfo: {
    name: 'ia-agent-app',
    version: '1.0.0',
  },
});

// ============================================================================
// Stripe Price IDs
// ============================================================================

/**
 * Price ID for the one-time setup fee
 */
export const STRIPE_SETUP_FEE_PRICE_ID = process.env.STRIPE_SETUP_FEE_PRICE_ID || '';

/**
 * Price ID for the weekly recurring subscription
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

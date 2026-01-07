/**
 * Stripe Connect OAuth - Start flow
 * GET /api/stripe/connect?orgId=xxx
 * Redirects to Stripe OAuth authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateStripeConnectConfig, signState } from '@/lib/stripe-connect';

export async function GET(request: NextRequest) {
  try {
    // Extract orgId from query params or session
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing orgId parameter' },
        { status: 400 }
      );
    }

    // Validate config
    const { clientId, redirectUri } = validateStripeConnectConfig();

    // Generate secure state
    const state = signState(orgId);

    // Build Stripe OAuth URL
    const stripeAuthUrl = new URL('https://connect.stripe.com/oauth/authorize');
    stripeAuthUrl.searchParams.set('response_type', 'code');
    stripeAuthUrl.searchParams.set('client_id', clientId);
    stripeAuthUrl.searchParams.set('scope', 'read_write');
    stripeAuthUrl.searchParams.set('redirect_uri', redirectUri);
    stripeAuthUrl.searchParams.set('state', state);

    return NextResponse.redirect(stripeAuthUrl.toString());
  } catch (error) {
    console.error('[Stripe Connect] Start flow error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to initiate Stripe Connect flow' },
      { status: 500 }
    );
  }
}

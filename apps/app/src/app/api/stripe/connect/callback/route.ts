/**
 * Stripe Connect OAuth - Callback
 * GET /api/stripe/connect/callback?code=xxx&state=xxx
 * Exchanges code for account ID and updates org
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyState, exchangeCodeForAccount } from '@/lib/stripe-connect';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors from Stripe
    if (error) {
      console.error('[Stripe Connect] OAuth error:', error, errorDescription);
      const redirectUrl = new URL('/app/settings/billing', request.url);
      redirectUrl.searchParams.set('stripeError', errorDescription || error);
      return NextResponse.redirect(redirectUrl);
    }

    // Validate required params
    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state parameter' },
        { status: 400 }
      );
    }

    // Verify state and extract orgId
    let orgId: string;
    try {
      orgId = verifyState(state);
    } catch (err) {
      console.error('[Stripe Connect] State verification failed:', err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: 'Invalid or expired state' },
        { status: 400 }
      );
    }

    // Exchange code for Stripe account ID
    let stripeAccountId: string;
    try {
      stripeAccountId = await exchangeCodeForAccount(code);
    } catch (err) {
      console.error('[Stripe Connect] Token exchange failed:', err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: 'Failed to connect Stripe account' },
        { status: 500 }
      );
    }

    // Update org with Stripe account ID
    try {
      await prisma.org.update({
        where: { id: orgId },
        data: { stripeAccountId },
      });
    } catch (err) {
      console.error('[Stripe Connect] DB update failed:', err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: 'Failed to save Stripe connection' },
        { status: 500 }
      );
    }

    // Success - redirect to billing page
    const redirectUrl = new URL('/app/settings/billing', request.url);
    redirectUrl.searchParams.set('stripeConnected', '1');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Stripe Connect] Callback error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

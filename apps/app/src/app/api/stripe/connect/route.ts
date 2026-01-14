/**
 * Stripe Connect OAuth - Start flow
 * GET /api/stripe/connect?orgId=xxx
 * Redirects to Stripe OAuth authorization
 * 
 * SECURITY (F-002): Requires authenticated session + owner/manager role
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateStripeConnectConfig, signState } from '@/lib/stripe-connect';

const ALLOWED_ROLES = ['owner', 'manager'] as const;

export async function GET(request: NextRequest) {
  try {
    // SECURITY (F-002): Require authenticated session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required. Please log in.' },
        { status: 401 }
      );
    }

    // Extract orgId from query params
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing orgId parameter' },
        { status: 400 }
      );
    }

    // SECURITY (F-002): Verify user has owner/manager role in this org
    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId: session.user.id,
          orgId: orgId,
        },
      },
    });

    if (!membership) {
      console.warn('[Stripe Connect] User not member of org:', { userId: session.user.id, orgId });
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 403 }
      );
    }

    if (!ALLOWED_ROLES.includes(membership.role as typeof ALLOWED_ROLES[number])) {
      console.warn('[Stripe Connect] Insufficient role:', { userId: session.user.id, orgId, role: membership.role });
      return NextResponse.json(
        { error: 'Only owners and managers can connect Stripe accounts' },
        { status: 403 }
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

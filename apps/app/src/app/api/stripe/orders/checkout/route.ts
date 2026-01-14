/**
 * Stripe Checkout Session - Takeaway Orders
 * POST /api/stripe/orders/checkout
 * 
 * Creates a Checkout Session on the connected restaurant account
 * with 1% + $0.30 AUD platform fee
 * 
 * SECURITY (F-007): 
 * - Requires orderId (no client-side price calculation)
 * - Uses server-side order.paymentAmountCents as source of truth
 * - Validates success_url/cancel_url origin matches NEXT_PUBLIC_APP_URL
 * - In production, requires https URLs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

interface CheckoutRequest {
  orderId: string;
  success_url: string;
  cancel_url: string;
  // DEPRECATED: items[] is ignored for security - use orderId
  items?: unknown;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Calculate platform fee: 1% + $0.30 AUD
 * Cap: fee cannot exceed subtotal
 */
function calculatePlatformFee(subtotalCents: number): number {
  const percentageFee = Math.round(subtotalCents * 0.01);
  const flatFee = 30; // $0.30 AUD in cents
  const totalFee = percentageFee + flatFee;
  
  // Cap at subtotal
  return Math.min(totalFee, subtotalCents);
}

/**
 * Validate URL origin matches app URL
 */
function validateUrlOrigin(url: string, appUrl: string): { valid: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url);
    const appOrigin = new URL(appUrl).origin;
    
    if (parsedUrl.origin !== appOrigin) {
      return { valid: false, error: `URL origin must match ${appOrigin}` };
    }
    
    // In production, require https
    if (IS_PRODUCTION && parsedUrl.protocol !== 'https:') {
      return { valid: false, error: 'HTTPS required in production' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get user's org
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        memberships: {
          include: { org: true },
          take: 1,
        },
      },
    });

    if (!user?.memberships?.[0]?.org) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 400 }
      );
    }

    const org = user.memberships[0].org;

    // 3. Check Stripe Connect
    if (!org.stripeAccountId) {
      return NextResponse.json(
        { error: 'Stripe not connected. Please connect your Stripe account first.' },
        { status: 400 }
      );
    }

    // 4. Parse request body
    const body: CheckoutRequest = await request.json();
    const { orderId, success_url, cancel_url, items } = body;

    // SECURITY (F-007): Log deprecation warning if items provided
    if (items) {
      console.warn('[Stripe Checkout] DEPRECATED: items[] parameter ignored. Use orderId for server-side pricing.');
    }

    // SECURITY (F-007): Require orderId
    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required. Client-side pricing via items[] is no longer supported.' },
        { status: 400 }
      );
    }

    if (!success_url || !cancel_url) {
      return NextResponse.json(
        { error: 'success_url and cancel_url are required' },
        { status: 400 }
      );
    }

    // SECURITY (F-007): Validate URL origins
    const successUrlValidation = validateUrlOrigin(success_url, APP_URL);
    if (!successUrlValidation.valid) {
      return NextResponse.json(
        { error: `Invalid success_url: ${successUrlValidation.error}` },
        { status: 400 }
      );
    }

    const cancelUrlValidation = validateUrlOrigin(cancel_url, APP_URL);
    if (!cancelUrlValidation.valid) {
      return NextResponse.json(
        { error: `Invalid cancel_url: ${cancelUrlValidation.error}` },
        { status: 400 }
      );
    }

    // 5. Load order from database (SECURITY: server-side pricing)
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        orgId: org.id, // Ensure order belongs to this org
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // 6. Use server-side amount (SECURITY: F-007)
    const subtotalCents = order.paymentAmountCents;

    if (!subtotalCents || subtotalCents <= 0) {
      return NextResponse.json(
        { error: 'Order has no valid payment amount' },
        { status: 400 }
      );
    }

    // 7. Calculate platform fee (1% + $0.30 AUD)
    const platformFeeCents = calculatePlatformFee(subtotalCents);

    // 8. Create Checkout Session on connected account
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        currency: 'aud',
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: order.summaryText || 'Takeaway Order',
              },
              unit_amount: subtotalCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFeeCents,
        },
        success_url,
        cancel_url,
        metadata: {
          orgId: org.id,
          orderId: order.id,
        },
      },
      {
        stripeAccount: org.stripeAccountId,
      }
    );

    // 9. Return session URL
    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      subtotalCents,
      platformFeeCents,
    });
  } catch (error) {
    console.error('[Stripe Checkout] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

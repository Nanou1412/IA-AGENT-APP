/**
 * Stripe Checkout Session - Takeaway Orders
 * POST /api/stripe/orders/checkout
 * 
 * Creates a Checkout Session on the connected restaurant account
 * with 1% + $0.30 AUD platform fee
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

interface CheckoutItem {
  name: string;
  quantity: number;
  unit_amount_cents: number;
}

interface CheckoutRequest {
  items: CheckoutItem[];
  orderId?: string;
  success_url: string;
  cancel_url: string;
}

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
    const { items, orderId, success_url, cancel_url } = body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!success_url || !cancel_url) {
      return NextResponse.json(
        { error: 'success_url and cancel_url are required' },
        { status: 400 }
      );
    }

    // 5. Calculate subtotal
    const subtotalCents = items.reduce((sum, item) => {
      return sum + (item.unit_amount_cents * item.quantity);
    }, 0);

    if (subtotalCents <= 0) {
      return NextResponse.json(
        { error: 'Subtotal must be greater than 0' },
        { status: 400 }
      );
    }

    // 6. Calculate platform fee (1% + $0.30 AUD)
    const platformFeeCents = calculatePlatformFee(subtotalCents);

    // 7. Create Checkout Session on connected account
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        currency: 'aud',
        line_items: items.map((item) => ({
          price_data: {
            currency: 'aud',
            product_data: {
              name: item.name,
            },
            unit_amount: item.unit_amount_cents,
          },
          quantity: item.quantity,
        })),
        payment_intent_data: {
          application_fee_amount: platformFeeCents,
        },
        success_url,
        cancel_url,
        metadata: {
          orgId: org.id,
          orderId: orderId || '',
        },
      },
      {
        stripeAccount: org.stripeAccountId,
      }
    );

    // 8. Return session URL
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

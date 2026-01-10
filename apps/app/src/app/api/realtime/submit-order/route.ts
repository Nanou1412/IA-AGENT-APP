/**
 * API endpoint to receive confirmed orders from the Realtime Voice Server
 * 
 * POST /api/realtime/submit-order
 * 
 * Creates a new order in the database and optionally triggers payment flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

// Internal API key for server-to-server communication
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * Validate internal API key if configured
 */
function validateInternalApiKey(req: NextRequest): boolean {
  if (!INTERNAL_API_KEY) {
    return true;
  }
  
  const providedKey = req.headers.get('X-Internal-API-Key');
  return providedKey === INTERNAL_API_KEY;
}

export async function POST(req: NextRequest) {
  try {
    // Validate API key
    if (!validateInternalApiKey(req)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body = await req.json() as SubmitOrderRequest;
    
    // Validate required fields
    if (!body.orgId || !body.customerName || !body.items?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, customerName, items' },
        { status: 400 }
      );
    }
    
    // Verify organization exists
    const org = await prisma.org.findUnique({
      where: { id: body.orgId },
      include: { settings: true },
    });
    
    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }
    
    // Calculate total
    const total = body.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    
    // Generate order ID and idempotency key
    const orderId = randomUUID();
    const idempotencyKey = `realtime-${body.callSid || orderId}`;
    
    // Build order summary text
    const summaryText = body.items
      .map(item => `${item.quantity}x ${item.name}`)
      .join(', ');
    
    // Create order in database
    const order = await prisma.order.create({
      data: {
        id: orderId,
        orgId: body.orgId,
        channel: 'voice',
        status: 'pending_confirmation',
        customerName: body.customerName,
        customerPhone: body.customerPhone || '',
        pickupTime: body.pickupTime ? new Date(body.pickupTime) : null,
        notes: body.specialInstructions,
        totalItems: body.items.reduce((sum, item) => sum + item.quantity, 0),
        summaryText,
        idempotencyKey,
        paymentRequired: org.settings?.requirePaymentBeforeOrder ?? false,
        paymentStatus: 'pending',
        paymentAmountCents: Math.round(total * 100),
        items: {
          create: body.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unitPriceCents: Math.round(item.price * 100),
            notes: item.notes,
          })),
        },
      },
    });
    
    console.log('[realtime/submit-order] Order created:', {
      orderId: order.id,
      orgId: body.orgId,
      customerName: body.customerName,
      total,
      itemCount: body.items.length,
    });
    
    // Check if payment is required
    const requirePayment = org.settings?.requirePaymentBeforeOrder ?? false;
    
    if (requirePayment && process.env.STRIPE_ORDER_PAYMENTS_ENABLED === 'true') {
      // TODO: Generate Stripe payment link
      // For now, just return order as pending
      return NextResponse.json({
        success: true,
        orderId: order.id,
        message: 'Order created, payment required',
        status: 'pending_payment',
        // paymentUrl: stripePaymentUrl,
      });
    }
    
    // If no payment required, mark as confirmed
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'confirmed' },
    });
    
    // TODO: Send confirmation SMS to customer
    // TODO: Send notification to restaurant
    
    return NextResponse.json({
      success: true,
      orderId: order.id,
      message: 'Order confirmed',
      status: 'confirmed',
      total,
    });
    
  } catch (error) {
    console.error('[realtime/submit-order] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Types
// ============================================================================

interface SubmitOrderRequest {
  orgId: string;
  callSid?: string;
  customerName: string;
  customerPhone?: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }[];
  specialInstructions?: string;
  pickupTime?: string;
  total: number;
}

'use server';

/**
 * Billing Server Actions
 * 
 * Handle Stripe checkout session creation and billing-related operations.
 */

import { prisma } from '@/lib/prisma';
import { requireUserWithOrg } from '@/lib/session';
import { 
  stripe, 
  STRIPE_SETUP_FEE_PRICE_ID, 
  STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID,
  APP_URL 
} from '@/lib/stripe';
import { logBillingAudit } from '@/lib/billing-helpers';
import { MembershipRole, BillingStatus } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface BillingCheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

export interface BillingInfo {
  billingStatus: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  setupFeePaidAt: Date | null;
  currentPeriodEnd: Date | null;
  canManageBilling: boolean;
}

// ============================================================================
// Get Billing Info
// ============================================================================

/**
 * Get billing information for the current org
 */
export async function getBillingInfo(): Promise<BillingInfo | { error: string }> {
  try {
    const { org } = await requireUserWithOrg();
    
    const settings = await prisma.orgSettings.findUnique({
      where: { orgId: org.id },
    });
    
    if (!settings) {
      return { error: 'Organisation settings not found' };
    }
    
    // Check if user is owner
    const membership = await prisma.membership.findFirst({
      where: {
        orgId: org.id,
        userId: (await requireUserWithOrg()).user.id,
      },
    });
    
    const canManageBilling = membership?.role === MembershipRole.owner;
    
    return {
      billingStatus: settings.billingStatus,
      stripeCustomerId: settings.stripeCustomerId,
      stripeSubscriptionId: settings.stripeSubscriptionId,
      setupFeePaidAt: settings.setupFeePaidAt,
      currentPeriodEnd: settings.currentPeriodEnd,
      canManageBilling,
    };
  } catch (error) {
    console.error('[billing] Error getting billing info:', error);
    return { error: 'Failed to get billing information' };
  }
}

// ============================================================================
// Create Checkout Session
// ============================================================================

/**
 * Create a Stripe Checkout session for setup fee + weekly subscription
 * 
 * Only org owners can create checkout sessions.
 */
export async function createBillingCheckoutSession(): Promise<BillingCheckoutResult> {
  try {
    const { user, org } = await requireUserWithOrg();
    
    // Verify user is owner
    const membership = await prisma.membership.findFirst({
      where: {
        orgId: org.id,
        userId: user.id,
        role: MembershipRole.owner,
      },
    });
    
    if (!membership) {
      return { 
        success: false, 
        error: 'Seul le propriétaire de l\'organisation peut gérer la facturation.' 
      };
    }
    
    // Validate Stripe price IDs are configured
    if (!STRIPE_SETUP_FEE_PRICE_ID || !STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID) {
      console.error('[billing] Missing Stripe price IDs');
      return { 
        success: false, 
        error: 'Configuration Stripe incomplète. Contactez le support.' 
      };
    }
    
    // Get or create org settings
    let settings = await prisma.orgSettings.findUnique({
      where: { orgId: org.id },
    });
    
    if (!settings) {
      settings = await prisma.orgSettings.create({
        data: { orgId: org.id },
      });
    }
    
    // Get or create Stripe customer
    let stripeCustomerId = settings.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: {
          orgId: org.id,
          userId: user.id,
        },
      });
      
      stripeCustomerId = customer.id;
      
      // Save customer ID
      await prisma.orgSettings.update({
        where: { orgId: org.id },
        data: { stripeCustomerId },
      });
    }
    
    // Create Checkout Session with setup fee + subscription
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [
        // One-time setup fee
        {
          price: STRIPE_SETUP_FEE_PRICE_ID,
          quantity: 1,
        },
        // Weekly recurring subscription
        {
          price: STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${APP_URL}/app/billing?success=1`,
      cancel_url: `${APP_URL}/app/billing?canceled=1`,
      metadata: {
        orgId: org.id,
        userId: user.id,
      },
      subscription_data: {
        metadata: {
          orgId: org.id,
        },
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address collection
      billing_address_collection: 'auto',
      // Tax ID collection (optional)
      tax_id_collection: { enabled: true },
    });
    
    if (!session.url) {
      return { 
        success: false, 
        error: 'Impossible de créer la session de paiement.' 
      };
    }
    
    // Update billing status to incomplete (checkout started)
    await prisma.orgSettings.update({
      where: { orgId: org.id },
      data: { billingStatus: BillingStatus.incomplete },
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: user.id,
        action: 'billing.checkout_started',
        details: {
          sessionId: session.id,
          customerId: stripeCustomerId,
        },
      },
    });
    
    return {
      success: true,
      checkoutUrl: session.url,
    };
  } catch (error) {
    console.error('[billing] Error creating checkout session:', error);
    return { 
      success: false, 
      error: 'Erreur lors de la création de la session de paiement.' 
    };
  }
}

// ============================================================================
// Create Portal Session (for managing subscription)
// ============================================================================

/**
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function createBillingPortalSession(): Promise<{ url?: string; error?: string }> {
  try {
    const { user, org } = await requireUserWithOrg();
    
    // Verify user is owner
    const membership = await prisma.membership.findFirst({
      where: {
        orgId: org.id,
        userId: user.id,
        role: MembershipRole.owner,
      },
    });
    
    if (!membership) {
      return { error: 'Seul le propriétaire peut accéder au portail de facturation.' };
    }
    
    const settings = await prisma.orgSettings.findUnique({
      where: { orgId: org.id },
    });
    
    if (!settings?.stripeCustomerId) {
      return { error: 'Aucun compte de facturation trouvé.' };
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: settings.stripeCustomerId,
      return_url: `${APP_URL}/app/billing`,
    });

    // Audit log for portal access
    await logBillingAudit('billing.portal_opened', {
      customerId: settings.stripeCustomerId,
    }, {
      orgId: org.id,
      actorUserId: user.id,
    });
    
    return { url: session.url };
  } catch (error) {
    console.error('[billing] Error creating portal session:', error);
    return { error: 'Erreur lors de l\'accès au portail de facturation.' };
  }
}

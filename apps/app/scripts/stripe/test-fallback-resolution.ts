#!/usr/bin/env tsx
/**
 * Test Org Resolution Fallback (without metadata)
 * 
 * Verifies that org can be resolved via stripeCustomerId when
 * metadata.orgId is not present in the event.
 * 
 * Usage:
 *   pnpm tsx scripts/stripe/test-fallback-resolution.ts
 */

import { PrismaClient, BillingStatus, SandboxStatus } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

// Mock event WITHOUT metadata.orgId but WITH customer
function createEventWithoutMetadata(customerId: string): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'evt_fallback_test_' + Date.now(),
    api_version: '2025-12-15.clover',
    created: now,
    livemode: false,
    type: 'invoice.paid',
    object: 'event',
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: 'in_test_fallback',
        object: 'invoice',
        customer: customerId,
        // NO metadata.orgId !
        amount_paid: 4900,
        currency: 'usd',
        status: 'paid',
        parent: {
          subscription_details: {
            subscription: 'sub_fallback_test',
            // NO metadata in subscription_details either
          },
        },
      } as unknown as Stripe.Invoice,
    },
  } as Stripe.Event;
}

async function main() {
  console.log('🧪 Testing Org Resolution Fallback (without metadata)...\n');

  // Setup: Create test org with stripeCustomerId
  const testCustomerId = 'cus_fallback_test_' + Date.now();

  let testOrg = await prisma.org.findFirst({
    where: { name: 'Test Org - Fallback Resolution' },
  });

  if (!testOrg) {
    testOrg = await prisma.org.create({
      data: {
        name: 'Test Org - Fallback Resolution',
        industry: 'real_estate',
        timezone: 'Europe/Paris',
      },
    });
  }

  await prisma.orgSettings.upsert({
    where: { orgId: testOrg.id },
    create: {
      orgId: testOrg.id,
      sandboxStatus: SandboxStatus.approved,
      billingStatus: BillingStatus.inactive,
      stripeCustomerId: testCustomerId,
    },
    update: {
      stripeCustomerId: testCustomerId,
      billingStatus: BillingStatus.inactive,
    },
  });

  console.log(`✅ Test org configured:`);
  console.log(`   Org ID: ${testOrg.id}`);
  console.log(`   Stripe Customer ID: ${testCustomerId}`);
  console.log(`   (This customer ID is linked to the org in DB)`);

  // Import resolver
  const { resolveOrgFromStripeEvent } = await import('../../src/lib/billing-helpers');

  // Create event WITHOUT metadata
  const mockEvent = createEventWithoutMetadata(testCustomerId);

  console.log('\n' + '='.repeat(60));
  console.log('TEST: Resolving org from event WITHOUT metadata.orgId');
  console.log('='.repeat(60));
  console.log(`Event type: ${mockEvent.type}`);
  console.log(`Event has metadata.orgId: NO`);
  console.log(`Event has customer: ${(mockEvent.data.object as any).customer}`);

  const resolvedOrg = await resolveOrgFromStripeEvent(mockEvent);

  console.log('\n' + '='.repeat(60));
  console.log('RESULT');
  console.log('='.repeat(60));

  if (resolvedOrg) {
    console.log(`✅ ORG RESOLVED SUCCESSFULLY (via stripeCustomerId fallback)`);
    console.log(`   Resolved Org ID: ${resolvedOrg.orgId}`);
    console.log(`   Expected Org ID: ${testOrg.id}`);
    console.log(`   Match: ${resolvedOrg.orgId === testOrg.id ? '✅ YES' : '❌ NO'}`);
  } else {
    console.log(`❌ FAILED: Could not resolve org`);
    console.log(`   Expected to find org ${testOrg.id} via customer ${testCustomerId}`);
  }

  // Verify the billing update would work
  console.log('\n' + '='.repeat(60));
  console.log('SIMULATING BILLING UPDATE');
  console.log('='.repeat(60));

  if (resolvedOrg) {
    // Simulate what the webhook would do
    await prisma.orgSettings.update({
      where: { orgId: resolvedOrg.orgId },
      data: { billingStatus: BillingStatus.active },
    });

    const updatedSettings = await prisma.orgSettings.findUnique({
      where: { orgId: resolvedOrg.orgId },
    });

    console.log(`✅ Billing status updated: ${updatedSettings?.billingStatus}`);
    
    // Reset for future tests
    await prisma.orgSettings.update({
      where: { orgId: resolvedOrg.orgId },
      data: { billingStatus: BillingStatus.inactive },
    });
    console.log(`🔄 Reset billing status to inactive for future tests`);
  }

  console.log('\n✅ FALLBACK RESOLUTION TEST COMPLETE');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

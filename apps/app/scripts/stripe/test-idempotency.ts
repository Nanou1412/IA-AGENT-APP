#!/usr/bin/env tsx
/**
 * Test Webhook Idempotency
 * 
 * Simulates sending the same Stripe event twice to verify idempotency.
 * The second call should be a no-op.
 * 
 * Usage:
 *   pnpm tsx scripts/stripe/test-idempotency.ts
 */

import { PrismaClient, BillingStatus, SandboxStatus } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

// Mock event for testing
function createMockEvent(eventId: string, customerId: string): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: eventId,
    api_version: '2025-12-15.clover',
    created: now,
    livemode: false,
    type: 'customer.subscription.updated',
    object: 'event',
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: 'sub_test_idempotency',
        object: 'subscription',
        customer: customerId,
        status: 'active',
        metadata: {},
        items: {
          object: 'list',
          data: [
            {
              id: 'si_test',
              current_period_end: now + 604800, // +7 days
            },
          ],
          has_more: false,
          url: '',
        },
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription,
    },
  } as Stripe.Event;
}

async function main() {
  console.log('🧪 Testing Webhook Idempotency...\n');

  // Setup: Ensure test org exists with stripeCustomerId
  const testCustomerId = 'cus_test_idempotency_' + Date.now();
  const eventId = 'evt_test_idempotency_' + Date.now();

  // Create test org if not exists
  let testOrg = await prisma.org.findFirst({
    where: { name: 'Test Org - Idempotency' },
  });

  if (!testOrg) {
    testOrg = await prisma.org.create({
      data: {
        name: 'Test Org - Idempotency',
        industry: 'real_estate',
        timezone: 'Europe/Paris',
      },
    });
    await prisma.orgSettings.create({
      data: {
        orgId: testOrg.id,
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.inactive,
        stripeCustomerId: testCustomerId,
      },
    });
    console.log(`✅ Created test org: ${testOrg.id}`);
    console.log(`   Stripe Customer ID: ${testCustomerId}`);
  } else {
    // Update customer ID
    await prisma.orgSettings.update({
      where: { orgId: testOrg.id },
      data: { stripeCustomerId: testCustomerId },
    });
    console.log(`📦 Using existing test org: ${testOrg.id}`);
  }

  // Clean up any previous test events
  await prisma.stripeEvent.deleteMany({
    where: { stripeEventId: { startsWith: 'evt_test_idempotency_' } },
  });
  console.log('\n🗑️  Cleaned up previous test events');

  // Import the helpers we need to test
  const { 
    resolveOrgFromStripeEvent, 
    checkAndRecordEvent,
    markEventProcessed,
    mapStripeStatusToBillingStatus,
  } = await import('../../src/lib/billing-helpers');

  const mockEvent = createMockEvent(eventId, testCustomerId);

  console.log('\n' + '='.repeat(60));
  console.log('ATTEMPT 1: First event processing');
  console.log('='.repeat(60));

  // First attempt - should process
  const org1 = await resolveOrgFromStripeEvent(mockEvent);
  console.log(`Resolved org: ${org1?.orgId ?? 'null'}`);

  const result1 = await checkAndRecordEvent(mockEvent, org1?.orgId ?? null);
  console.log(`Already processed: ${result1.alreadyProcessed}`);
  console.log(`Event record ID: ${result1.stripeEventRecord?.id}`);

  if (!result1.alreadyProcessed && org1) {
    // Simulate processing: update billing status
    const newStatus = mapStripeStatusToBillingStatus('active');
    await prisma.orgSettings.update({
      where: { orgId: org1.orgId },
      data: { billingStatus: newStatus },
    });
    await markEventProcessed(mockEvent.id);
    console.log(`✅ Event processed, billing status updated to: ${newStatus}`);
  }

  // Check StripeEvent count
  const eventCount1 = await prisma.stripeEvent.count({
    where: { stripeEventId: eventId },
  });
  console.log(`StripeEvent records after attempt 1: ${eventCount1}`);

  // Check AuditLog count (for this event)
  const auditBefore = await prisma.auditLog.count({
    where: { orgId: testOrg.id },
  });

  console.log('\n' + '='.repeat(60));
  console.log('ATTEMPT 2: Replaying same event (should be no-op)');
  console.log('='.repeat(60));

  // Second attempt - should be skipped
  const org2 = await resolveOrgFromStripeEvent(mockEvent);
  console.log(`Resolved org: ${org2?.orgId ?? 'null'}`);

  const result2 = await checkAndRecordEvent(mockEvent, org2?.orgId ?? null);
  console.log(`Already processed: ${result2.alreadyProcessed}`);

  if (result2.alreadyProcessed) {
    console.log(`✅ Event correctly identified as already processed - SKIPPED`);
  } else {
    console.log(`❌ ERROR: Event was NOT identified as already processed!`);
  }

  // Verify StripeEvent count (should still be 1)
  const eventCount2 = await prisma.stripeEvent.count({
    where: { stripeEventId: eventId },
  });
  console.log(`StripeEvent records after attempt 2: ${eventCount2}`);

  // Verify AuditLog wasn't duplicated
  const auditAfter = await prisma.auditLog.count({
    where: { orgId: testOrg.id },
  });

  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));
  
  const passed = result2.alreadyProcessed && eventCount2 === 1;
  
  if (passed) {
    console.log('✅ IDEMPOTENCY TEST PASSED');
    console.log('   - Same event correctly identified as duplicate');
    console.log('   - Only 1 StripeEvent record created');
    console.log(`   - AuditLogs: before=${auditBefore}, after=${auditAfter}`);
  } else {
    console.log('❌ IDEMPOTENCY TEST FAILED');
    console.log(`   - Expected alreadyProcessed=true, got: ${result2.alreadyProcessed}`);
    console.log(`   - Expected eventCount=1, got: ${eventCount2}`);
  }

  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await prisma.stripeEvent.deleteMany({
    where: { stripeEventId: eventId },
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

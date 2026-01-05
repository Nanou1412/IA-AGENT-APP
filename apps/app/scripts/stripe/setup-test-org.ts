#!/usr/bin/env tsx
/**
 * Setup Test Org for Stripe Billing Testing
 * 
 * Creates a test org with sandbox approved, ready for billing tests.
 * 
 * Usage:
 *   pnpm tsx scripts/stripe/setup-test-org.ts
 *   pnpm tsx scripts/stripe/setup-test-org.ts --customer cus_xxx  # Link existing customer
 */

import { PrismaClient, SandboxStatus, BillingStatus, MembershipRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const customerIdArg = args.find(a => a.startsWith('--customer='));
  const customerId = customerIdArg?.split('=')[1];

  console.log('🔧 Setting up test org for Stripe billing tests...\n');

  // Check if test org already exists
  let testOrg = await prisma.org.findFirst({
    where: { name: 'Test Org - Stripe Billing' },
  });

  if (testOrg) {
    console.log(`📦 Test org already exists: ${testOrg.id}`);
  } else {
    // Create test org
    testOrg = await prisma.org.create({
      data: {
        name: 'Test Org - Stripe Billing',
        industry: 'real_estate',
        timezone: 'Europe/Paris',
      },
    });
    console.log(`✅ Created test org: ${testOrg.id}`);
  }

  // Ensure OrgSettings exists and is properly configured
  let settings = await prisma.orgSettings.findUnique({
    where: { orgId: testOrg.id },
  });

  if (settings) {
    // Update to sandbox approved
    settings = await prisma.orgSettings.update({
      where: { orgId: testOrg.id },
      data: {
        sandboxStatus: SandboxStatus.approved,
        stripeCustomerId: customerId ?? settings.stripeCustomerId,
      },
    });
    console.log(`✅ Updated OrgSettings: sandboxStatus=approved`);
  } else {
    settings = await prisma.orgSettings.create({
      data: {
        orgId: testOrg.id,
        sandboxStatus: SandboxStatus.approved,
        billingStatus: BillingStatus.inactive,
        stripeCustomerId: customerId ?? null,
      },
    });
    console.log(`✅ Created OrgSettings with sandboxStatus=approved`);
  }

  // Check if test user exists
  let testUser = await prisma.user.findFirst({
    where: { email: 'test-billing@example.com' },
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: 'test-billing@example.com',
        name: 'Test Billing User',
      },
    });
    console.log(`✅ Created test user: ${testUser.id}`);
  } else {
    console.log(`📦 Test user already exists: ${testUser.id}`);
  }

  // Ensure membership exists
  let membership = await prisma.membership.findFirst({
    where: {
      orgId: testOrg.id,
      userId: testUser.id,
    },
  });

  if (!membership) {
    membership = await prisma.membership.create({
      data: {
        orgId: testOrg.id,
        userId: testUser.id,
        role: MembershipRole.owner,
      },
    });
    console.log(`✅ Created membership (owner role)`);
  } else {
    console.log(`📦 Membership already exists`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST ORG SUMMARY');
  console.log('='.repeat(60));
  console.log(`Org ID:            ${testOrg.id}`);
  console.log(`Org Name:          ${testOrg.name}`);
  console.log(`User ID:           ${testUser.id}`);
  console.log(`User Email:        ${testUser.email}`);
  console.log(`Sandbox Status:    ${settings.sandboxStatus}`);
  console.log(`Billing Status:    ${settings.billingStatus}`);
  console.log(`Stripe Customer:   ${settings.stripeCustomerId ?? '(none)'}`);
  console.log(`Stripe Sub:        ${settings.stripeSubscriptionId ?? '(none)'}`);
  console.log('='.repeat(60));
  
  console.log('\n📝 NEXT STEPS:');
  console.log('1. Start dev server: pnpm dev');
  console.log('2. Start Stripe CLI: stripe listen --forward-to http://localhost:3001/api/stripe/webhook');
  console.log('3. Navigate to http://localhost:3001/app/billing');
  console.log('4. Complete checkout flow');
  console.log('5. Check /admin/debug/stripe for state');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

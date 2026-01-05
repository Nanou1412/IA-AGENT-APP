#!/usr/bin/env tsx
/**
 * Debug Billing State
 * 
 * CLI script to inspect billing state for an org.
 * 
 * Usage:
 *   pnpm tsx scripts/stripe/debug-billing.ts
 *   pnpm tsx scripts/stripe/debug-billing.ts --org <orgId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const orgIdArg = args.find(a => a.startsWith('--org='));
  const specificOrgId = orgIdArg?.split('=')[1];

  console.log('🔍 DEBUG BILLING STATE\n');
  console.log('='.repeat(70));

  // Get org settings
  const query = specificOrgId 
    ? { orgId: specificOrgId }
    : {};

  const allSettings = await prisma.orgSettings.findMany({
    where: query,
    include: { org: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  if (allSettings.length === 0) {
    console.log('No org settings found.');
    return;
  }

  console.log('📦 ORG SETTINGS (last 10 updated)');
  console.log('='.repeat(70));

  for (const settings of allSettings) {
    console.log(`\n▶ ${settings.org.name} (${settings.orgId})`);
    console.log(`  Sandbox Status:      ${settings.sandboxStatus}`);
    console.log(`  Billing Status:      ${settings.billingStatus}`);
    console.log(`  Stripe Customer:     ${settings.stripeCustomerId ?? '(none)'}`);
    console.log(`  Stripe Subscription: ${settings.stripeSubscriptionId ?? '(none)'}`);
    console.log(`  Setup Fee Paid At:   ${settings.setupFeePaidAt?.toISOString() ?? '(never)'}`);
    console.log(`  Current Period End:  ${settings.currentPeriodEnd?.toISOString() ?? '(none)'}`);
    console.log(`  Updated At:          ${settings.updatedAt.toISOString()}`);
  }

  // Get latest StripeEvents
  console.log('\n' + '='.repeat(70));
  console.log('📨 RECENT STRIPE EVENTS (last 20)');
  console.log('='.repeat(70));

  const recentEvents = await prisma.stripeEvent.findMany({
    where: specificOrgId ? { orgId: specificOrgId } : {},
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (recentEvents.length === 0) {
    console.log('No Stripe events found.');
  } else {
    for (const event of recentEvents) {
      const status = event.processed ? '✅' : '⏳';
      console.log(`${status} ${event.type.padEnd(35)} ${event.stripeEventId.slice(0, 25)}... org=${event.orgId?.slice(0, 10) ?? 'null'}`);
    }
  }

  // Get billing-related audit logs
  console.log('\n' + '='.repeat(70));
  console.log('📝 BILLING AUDIT LOGS (last 20)');
  console.log('='.repeat(70));

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: 'billing.' },
      ...(specificOrgId ? { orgId: specificOrgId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (auditLogs.length === 0) {
    console.log('No billing audit logs found.');
  } else {
    for (const log of auditLogs) {
      const details = log.details as Record<string, unknown>;
      const eventId = details?.stripeEventId ? ` (${String(details.stripeEventId).slice(0, 20)}...)` : '';
      console.log(`${log.createdAt.toISOString().slice(0, 19)} ${log.action.padEnd(30)} org=${log.orgId?.slice(0, 10) ?? 'system'}${eventId}`);
    }
  }

  console.log('\n' + '='.repeat(70));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

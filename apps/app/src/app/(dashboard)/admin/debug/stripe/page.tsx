/**
 * Admin Debug - Stripe Billing State
 * 
 * Internal debug page for inspecting billing state.
 * Shows OrgSettings, StripeEvents, and AuditLogs.
 * 
 * Protected by admin check (owner only or dev mode)
 */

import { prisma } from '@/lib/prisma';
import { requireUserWithOrg } from '@/lib/session';
import { MembershipRole } from '@prisma/client';
import { redirect } from 'next/navigation';

// Debug page data
async function getDebugData(orgId?: string) {
  // Get org settings (all or specific)
  const orgSettings = await prisma.orgSettings.findMany({
    where: orgId ? { orgId } : {},
    include: { org: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  // Get recent Stripe events
  const stripeEvents = await prisma.stripeEvent.findMany({
    where: orgId ? { orgId } : {},
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  // Get billing audit logs
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: 'billing.' },
      ...(orgId ? { orgId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  return { orgSettings, stripeEvents, auditLogs };
}

export default async function StripeDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  // Auth check - owner only
  const { user, org } = await requireUserWithOrg();
  const params = await searchParams;
  
  const membership = await prisma.membership.findFirst({
    where: { orgId: org.id, userId: user.id },
  });

  // Only allow in development or for owners
  const isDev = process.env.NODE_ENV === 'development';
  const isOwner = membership?.role === MembershipRole.owner;

  if (!isDev && !isOwner) {
    redirect('/app');
  }

  const filterOrgId = params.org;
  const { orgSettings, stripeEvents, auditLogs } = await getDebugData(filterOrgId);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🔧 Stripe Debug</h1>
        <div className="text-sm text-gray-500">
          {isDev && <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">DEV MODE</span>}
        </div>
      </div>

      {/* Filter */}
      <div className="bg-gray-100 rounded-lg p-4">
        <form method="GET" className="flex items-center gap-4">
          <label className="text-sm font-medium">Filter by Org ID:</label>
          <input
            type="text"
            name="org"
            defaultValue={filterOrgId}
            placeholder="org_..."
            className="border rounded px-3 py-1 text-sm w-64"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700">
            Filter
          </button>
          {filterOrgId && (
            <a href="/admin/debug/stripe" className="text-blue-600 text-sm hover:underline">
              Clear
            </a>
          )}
        </form>
      </div>

      {/* Org Settings */}
      <section>
        <h2 className="text-xl font-semibold mb-4">📦 Org Settings ({orgSettings.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Org</th>
                <th className="px-4 py-2 text-left">Sandbox</th>
                <th className="px-4 py-2 text-left">Billing</th>
                <th className="px-4 py-2 text-left">Stripe Customer</th>
                <th className="px-4 py-2 text-left">Subscription</th>
                <th className="px-4 py-2 text-left">Setup Fee Paid</th>
                <th className="px-4 py-2 text-left">Period End</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgSettings.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{s.org.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{s.orgId.slice(0, 15)}...</div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.sandboxStatus} type="sandbox" />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.billingStatus} type="billing" />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {s.stripeCustomerId?.slice(0, 20) ?? '-'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {s.stripeSubscriptionId?.slice(0, 20) ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {s.setupFeePaidAt?.toISOString().slice(0, 10) ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {s.currentPeriodEnd?.toISOString().slice(0, 10) ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stripe Events */}
      <section>
        <h2 className="text-xl font-semibold mb-4">📨 Stripe Events ({stripeEvents.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Event ID</th>
                <th className="px-4 py-2 text-left">Org ID</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Processed At</th>
                <th className="px-4 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stripeEvents.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    {e.processed ? (
                      <span className="text-green-600">✅</span>
                    ) : (
                      <span className="text-yellow-600">⏳</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{e.type}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.stripeEventId.slice(0, 25)}...</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.orgId?.slice(0, 15) ?? '-'}</td>
                  <td className="px-4 py-2 text-xs">{e.createdAt.toISOString().slice(0, 19)}</td>
                  <td className="px-4 py-2 text-xs">{e.processedAt?.toISOString().slice(0, 19) ?? '-'}</td>
                  <td className="px-4 py-2 text-xs text-red-600">{''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit Logs */}
      <section>
        <h2 className="text-xl font-semibold mb-4">📝 Billing Audit Logs ({auditLogs.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Timestamp</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Org ID</th>
                <th className="px-4 py-2 text-left">Actor</th>
                <th className="px-4 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {auditLogs.map((log) => {
                const details = log.details as Record<string, unknown>;
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {log.createdAt.toISOString().slice(0, 19)}
                    </td>
                    <td className="px-4 py-2">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{log.orgId?.slice(0, 15) ?? '-'}</td>
                    <td className="px-4 py-2 text-xs">{log.actorUserId?.slice(0, 15) ?? 'system'}</td>
                    <td className="px-4 py-2 text-xs max-w-md truncate">
                      {JSON.stringify(details).slice(0, 80)}...
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// Helper components
function StatusBadge({ status, type }: { status: string; type: 'sandbox' | 'billing' }) {
  const colors: Record<string, string> = {
    // Sandbox
    sandbox_required: 'bg-gray-100 text-gray-800',
    sandbox_in_progress: 'bg-blue-100 text-blue-800',
    ready_for_review: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    revoked: 'bg-red-100 text-red-800',
    // Billing
    inactive: 'bg-gray-100 text-gray-800',
    incomplete: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    past_due: 'bg-red-100 text-red-800',
    canceled: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    'billing.checkout_started': 'bg-blue-100 text-blue-800',
    'billing.checkout_completed': 'bg-green-100 text-green-800',
    'billing.invoice_paid': 'bg-green-100 text-green-800',
    'billing.invoice_failed': 'bg-red-100 text-red-800',
    'billing.subscription_updated': 'bg-blue-100 text-blue-800',
    'billing.subscription_canceled': 'bg-gray-100 text-gray-800',
    'billing.portal_opened': 'bg-purple-100 text-purple-800',
    'billing.unmapped_event': 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[action] ?? 'bg-gray-100'}`}>
      {action.replace('billing.', '')}
    </span>
  );
}

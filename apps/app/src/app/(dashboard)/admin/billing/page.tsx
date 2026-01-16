/**
 * Admin Billing Page
 * 
 * Overview of all organization billing status, subscriptions, and MRR.
 * Shows: subscription status, setup fee, past_due, next invoice, MRR
 */

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { StatCard } from "@/components/ui/admin-card";
import { TableContainer, StatusBadge, FilterBar, FilterSelect } from "@/components/ui/admin-table";

export const metadata = {
  title: "Billing - Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const pageSize = 50;
  const statusFilter = params.status || undefined;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (statusFilter) {
    where.billingStatus = statusFilter;
  }

  // Get orgs with billing info
  const [orgSettings, totalCount] = await Promise.all([
    prisma.orgSettings.findMany({
      where,
      include: {
        org: { select: { id: true, name: true, industry: true, stripeAccountId: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.orgSettings.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Billing stats
  const billingStats = await prisma.orgSettings.groupBy({
    by: ["billingStatus"],
    _count: { id: true },
  });
  const statsMap = Object.fromEntries(billingStats.map((s) => [s.billingStatus, s._count.id]));

  // Calculate MRR - sum of active subscriptions
  // In a real system, you'd get this from Stripe. Here we estimate from active orgs.
  const activeOrgs = statsMap.active || 0;
  const estimatedMRR = activeOrgs * 99; // Assume $99/mo average

  // Get recent setup fees (orgs with setupFeePaidAt in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSetupFees = await prisma.orgSettings.count({
    where: {
      setupFeePaidAt: { gte: thirtyDaysAgo },
    },
  });

  // Get past_due count
  const pastDueCount = statsMap.past_due || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-900">💳 Billing</h1>
          <p className="text-slate-500 mt-1">
            {totalCount} organizations with billing information
          </p>
        </div>
        <Link 
          href="/admin" 
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Active Subscriptions"
          value={statsMap.active || 0}
          icon="✅"
          variant="success"
        />
        <StatCard
          title="Estimated MRR"
          value={`$${estimatedMRR.toLocaleString()}`}
          subtitle="~$99/org average"
          icon="💰"
          variant="success"
        />
        <StatCard
          title="Setup Fees (30d)"
          value={recentSetupFees}
          icon="🎫"
          variant="info"
        />
        <StatCard
          title="Past Due"
          value={pastDueCount}
          icon="⚠️"
          variant={pastDueCount > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Inactive"
          value={statsMap.inactive || 0}
          icon="💤"
        />
      </div>

      {/* Filters */}
      <FilterBar resetHref="/admin/billing">
        <FilterSelect
          label="Billing Status"
          name="status"
          defaultValue={statusFilter}
          options={[
            { label: "Active", value: "active" },
            { label: "Past Due", value: "past_due" },
            { label: "Incomplete", value: "incomplete" },
            { label: "Canceled", value: "canceled" },
            { label: "Inactive", value: "inactive" },
          ]}
        />
      </FilterBar>

      {/* Billing Table */}
      <TableContainer
        title="Organization Billing"
        subtitle={`Page ${page} of ${Math.max(totalPages, 1)}`}
      >
        <table className="w-full">
          <thead className="bg-brand-light border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Organization</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Industry</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Setup Fee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Period End</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Stripe Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Connect</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orgSettings.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-slate-400 text-lg">📭</p>
                  <p className="text-slate-500 mt-2">No organizations found</p>
                </td>
              </tr>
            ) : (
              orgSettings.map((settings) => (
                <tr key={settings.id} className="hover:bg-brand-light/50 transition-colors">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/admin/orgs/${settings.orgId}`} className="text-primary-600 hover:underline font-medium">
                      {settings.org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {settings.org.industry}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={settings.billingStatus} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {settings.setupFeePaidAt ? (
                      <span className="inline-flex items-center gap-1 text-success-600 text-xs">
                        <span>✓</span>
                        {new Date(settings.setupFeePaidAt).toLocaleDateString("en-AU")}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {settings.currentPeriodEnd ? (
                      <span className={new Date(settings.currentPeriodEnd) < new Date() ? "text-red-600 font-medium" : "text-slate-500"}>
                        {new Date(settings.currentPeriodEnd).toLocaleDateString("en-AU")}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {settings.stripeCustomerId ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${settings.stripeCustomerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline font-mono text-xs"
                      >
                        {settings.stripeCustomerId.slice(0, 15)}...
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {settings.org.stripeAccountId ? (
                      <a
                        href={`https://dashboard.stripe.com/connect/accounts/${settings.org.stripeAccountId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline font-mono text-xs"
                      >
                        {settings.org.stripeAccountId.slice(0, 12)}...
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/usage/org/${settings.orgId}`}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Usage
                      </Link>
                      <Link
                        href={`/admin/billing/${settings.orgId}`}
                        className="px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        Details →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/billing?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/billing?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">🔗 Stripe Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://dashboard.stripe.com/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg text-sm hover:bg-purple-700 transition-colors shadow-sm"
          >
            <span>📊</span> Subscriptions
          </a>
          <a
            href="https://dashboard.stripe.com/invoices"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg text-sm hover:bg-purple-700 transition-colors shadow-sm"
          >
            <span>🧾</span> Invoices
          </a>
          <a
            href="https://dashboard.stripe.com/connect/accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg text-sm hover:bg-purple-700 transition-colors shadow-sm"
          >
            <span>🔌</span> Connect Accounts
          </a>
          <a
            href="https://dashboard.stripe.com/test/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 font-medium rounded-lg text-sm border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <span>🔔</span> Webhook Events
          </a>
        </div>
      </div>
    </div>
  );
}

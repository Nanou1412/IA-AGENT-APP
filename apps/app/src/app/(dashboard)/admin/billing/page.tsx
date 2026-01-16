/**
 * Admin Billing Page
 * 
 * Overview of all organization billing status, subscriptions, and MRR.
 * Shows: subscription status, setup fee, past_due, next invoice, MRR
 */

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = {
  title: "Billing - Admin",
};

export const dynamic = "force-dynamic";

function getBillingStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800";
    case "past_due":
      return "bg-red-100 text-red-800";
    case "incomplete":
      return "bg-yellow-100 text-yellow-800";
    case "canceled":
      return "bg-gray-100 text-gray-800";
    case "inactive":
    default:
      return "bg-gray-100 text-gray-500";
  }
}

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
          <h1 className="text-2xl font-bold">💳 Billing Admin</h1>
          <p className="text-gray-500">
            {totalCount} organizations • Page {page}/{Math.max(totalPages, 1)}
          </p>
        </div>
        <Link href="/admin" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
          ← Retour Admin
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Active Subscriptions</p>
          <p className="text-2xl font-bold text-green-600">{statsMap.active || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Estimated MRR</p>
          <p className="text-2xl font-bold text-green-600">${estimatedMRR.toLocaleString()}</p>
          <p className="text-xs text-gray-400">~$99/org average</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Setup Fees (30d)</p>
          <p className="text-2xl font-bold text-blue-600">{recentSetupFees}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-red-200">
          <p className="text-sm text-gray-500">Past Due</p>
          <p className="text-2xl font-bold text-red-600">{pastDueCount}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Inactive</p>
          <p className="text-2xl font-bold text-gray-500">{statsMap.inactive || 0}</p>
        </div>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-4 bg-white p-4 rounded-lg border">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Billing Status</label>
          <select name="status" defaultValue={statusFilter} className="border rounded px-3 py-1 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="past_due">Past Due</option>
            <option value="incomplete">Incomplete</option>
            <option value="canceled">Canceled</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            Filter
          </button>
          <Link href="/admin/billing" className="px-4 py-1 border rounded text-sm hover:bg-gray-50">
            Reset
          </Link>
        </div>
      </form>

      {/* Billing Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Organization</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Industry</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Billing Status</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Setup Fee</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Current Period End</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Stripe Customer</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Connect Account</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orgSettings.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No organizations found
                </td>
              </tr>
            ) : (
              orgSettings.map((settings) => (
                <tr key={settings.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/admin/organizations/${settings.orgId}`} className="text-blue-600 hover:underline font-medium">
                      {settings.org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {settings.org.industry}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${getBillingStatusColor(settings.billingStatus)}`}>
                      {settings.billingStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {settings.setupFeePaidAt ? (
                      <span className="text-green-600 text-xs">
                        ✓ {new Date(settings.setupFeePaidAt).toLocaleDateString("fr-FR")}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {settings.currentPeriodEnd ? (
                      <span className={new Date(settings.currentPeriodEnd) < new Date() ? "text-red-600" : ""}>
                        {new Date(settings.currentPeriodEnd).toLocaleDateString("fr-FR")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {settings.stripeCustomerId ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${settings.stripeCustomerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-mono text-xs"
                      >
                        {settings.stripeCustomerId.slice(0, 15)}...
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {settings.org.stripeAccountId ? (
                      <a
                        href={`https://dashboard.stripe.com/connect/accounts/${settings.org.stripeAccountId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-mono text-xs"
                      >
                        {settings.org.stripeAccountId.slice(0, 12)}...
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Link
                        href={`/admin/usage/org/${settings.orgId}`}
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                      >
                        Usage
                      </Link>
                      <Link
                        href={`/admin/billing/${settings.orgId}`}
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                      >
                        Details
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/billing?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            >
              ← Previous
            </Link>
          )}
          <span className="px-3 py-1 text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/billing?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            >
              Next →
            </Link>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white p-4 rounded-lg border">
        <h2 className="font-semibold mb-3">🔗 Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://dashboard.stripe.com/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
          >
            Stripe Subscriptions →
          </a>
          <a
            href="https://dashboard.stripe.com/invoices"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
          >
            Stripe Invoices →
          </a>
          <a
            href="https://dashboard.stripe.com/connect/accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
          >
            Connect Accounts →
          </a>
          <a
            href="https://dashboard.stripe.com/test/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
          >
            Webhook Events →
          </a>
        </div>
      </div>
    </div>
  );
}

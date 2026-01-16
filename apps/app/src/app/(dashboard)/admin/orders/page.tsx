/**
 * Admin Orders Page - Multi-Organization Orders View
 * 
 * Shows all orders across all organizations with filtering capabilities.
 * Columns: org, customer phone, amount, status, createdAt, paymentIntentId
 */

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { StatCard } from "@/components/ui/admin-card";
import { TableContainer, StatusBadge, FilterBar, FilterSelect, FilterInput } from "@/components/ui/admin-table";

export const metadata = {
  title: "Orders - Admin",
};

export const dynamic = "force-dynamic";

function formatMoney(cents: number | null, currency: string = "AUD"): string {
  if (!cents) return "$0.00";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    paymentStatus?: string;
    orgId?: string;
    search?: string;
  }>;
}) {
  await requireAdmin();
  
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const pageSize = 50;
  const status = params.status || undefined;
  const paymentStatus = params.paymentStatus || undefined;
  const orgId = params.orgId || undefined;
  const search = params.search || undefined;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (orgId) where.orgId = orgId;
  if (search) {
    where.OR = [
      { customerPhone: { contains: search } },
      { customerName: { contains: search } },
      { stripePaymentIntentId: { contains: search } },
    ];
  }

  // Get orders with pagination
  const [orders, totalCount, orgs] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        Org: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
    prisma.org.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Stats
  const stats = await prisma.order.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const paymentStats = await prisma.order.groupBy({
    by: ["paymentStatus"],
    _count: { id: true },
    _sum: { paymentAmountCents: true },
  });

  const statsMap = Object.fromEntries(stats.map((s) => [s.status, s._count.id]));
  const paymentStatsMap = Object.fromEntries(
    paymentStats.map((s) => [s.paymentStatus, { count: s._count.id, total: s._sum.paymentAmountCents || 0 }])
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-900">🛒 Orders</h1>
          <p className="text-slate-500 mt-1">
            {totalCount.toLocaleString()} orders across all organisations
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
          title="Total Orders"
          value={totalCount}
          icon="📦"
        />
        <StatCard
          title="Confirmed"
          value={statsMap.confirmed || 0}
          icon="✅"
          variant="success"
        />
        <StatCard
          title="Pending"
          value={(statsMap.pending_confirmation || 0) + (statsMap.pending_payment || 0)}
          icon="⏳"
          variant="warning"
        />
        <StatCard
          title="Total Paid"
          value={formatMoney(paymentStatsMap.paid?.total || 0)}
          subtitle={`${(paymentStatsMap.paid?.count || 0).toLocaleString()} orders`}
          icon="💰"
          variant="success"
        />
        <StatCard
          title="Pending Payment"
          value={formatMoney(paymentStatsMap.pending?.total || 0)}
          subtitle={`${(paymentStatsMap.pending?.count || 0).toLocaleString()} orders`}
          icon="💳"
          variant="warning"
        />
      </div>

      {/* Filters */}
      <FilterBar resetHref="/admin/orders">
        <FilterInput
          label="Search"
          name="search"
          placeholder="Phone, name, payment ID..."
          defaultValue={search}
        />
        <FilterSelect
          label="Organization"
          name="orgId"
          defaultValue={orgId}
          options={orgs.map((o) => ({ label: o.name, value: o.id }))}
          placeholder="All Organizations"
        />
        <FilterSelect
          label="Order Status"
          name="status"
          defaultValue={status}
          options={[
            { label: "Pending Confirmation", value: "pending_confirmation" },
            { label: "Pending Payment", value: "pending_payment" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Cancelled", value: "canceled" },
            { label: "Expired", value: "expired" },
          ]}
        />
        <FilterSelect
          label="Payment Status"
          name="paymentStatus"
          defaultValue={paymentStatus}
          options={[
            { label: "Pending", value: "pending" },
            { label: "Paid", value: "paid" },
            { label: "Expired", value: "expired" },
            { label: "Cancelled", value: "canceled" },
            { label: "Not Required", value: "not_required" },
          ]}
        />
      </FilterBar>

      {/* Orders Table */}
      <TableContainer
        title="All Orders"
        subtitle={`Page ${page} of ${totalPages}`}
      >
        <table className="w-full">
          <thead className="bg-brand-light border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Org</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Payment</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Payment Intent</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-slate-400 text-lg">📭</p>
                  <p className="text-slate-500 mt-2">No orders found</p>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-brand-light/50 transition-colors">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/admin/orgs/${order.orgId}`} className="text-primary-600 hover:underline font-medium">
                      {order.Org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-primary-900">{order.customerName || "—"}</div>
                    <div className="text-slate-500 text-xs">{order.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-primary-900">
                    {formatMoney(order.paymentAmountCents || order.amountTotalCents, order.paymentCurrency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={order.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    <div>{new Date(order.createdAt).toLocaleDateString("en-AU")}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(order.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-xs">
                    {order.stripePaymentIntentId ? (
                      <a
                        href={`https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        {order.stripePaymentIntentId.slice(0, 15)}...
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      View →
                    </Link>
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
              href={`/admin/orders?page=${page - 1}${status ? `&status=${status}` : ""}${paymentStatus ? `&paymentStatus=${paymentStatus}` : ""}${orgId ? `&orgId=${orgId}` : ""}${search ? `&search=${search}` : ""}`}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/orders?page=${page + 1}${status ? `&status=${status}` : ""}${paymentStatus ? `&paymentStatus=${paymentStatus}` : ""}${orgId ? `&orgId=${orgId}` : ""}${search ? `&search=${search}` : ""}`}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

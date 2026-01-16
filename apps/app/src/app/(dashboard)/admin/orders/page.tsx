/**
 * Admin Orders Page - Multi-Organization Orders View
 * 
 * Shows all orders across all organizations with filtering capabilities.
 * Columns: org, customer phone, amount, status, createdAt, paymentIntentId
 */

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

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

function getStatusColor(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-800";
    case "pending_confirmation":
    case "pending_payment":
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "canceled":
    case "expired":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getPaymentStatusColor(status: string): string {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "failed":
    case "expired":
    case "canceled":
      return "bg-red-100 text-red-800";
    case "not_required":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
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
          <h1 className="text-2xl font-bold">🛒 Orders (Multi-Org)</h1>
          <p className="text-gray-500">
            {totalCount.toLocaleString()} orders total • Page {page}/{totalPages}
          </p>
        </div>
        <Link href="/admin" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
          ← Retour Admin
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold">{totalCount.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Confirmed</p>
          <p className="text-2xl font-bold text-green-600">{(statsMap.confirmed || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{(statsMap.pending || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total Paid</p>
          <p className="text-2xl font-bold text-green-600">
            {formatMoney(paymentStatsMap.paid?.total || 0)}
          </p>
          <p className="text-xs text-gray-400">{(paymentStatsMap.paid?.count || 0).toLocaleString()} orders</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Pending Payment</p>
          <p className="text-2xl font-bold text-orange-600">
            {formatMoney(paymentStatsMap.pending?.total || 0)}
          </p>
          <p className="text-xs text-gray-400">{(paymentStatsMap.pending?.count || 0).toLocaleString()} orders</p>
        </div>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-4 bg-white p-4 rounded-lg border">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Phone, name, payment ID..."
            className="border rounded px-3 py-1 text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Organization</label>
          <select name="orgId" defaultValue={orgId} className="border rounded px-3 py-1 text-sm">
            <option value="">All Orgs</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Order Status</label>
          <select name="status" defaultValue={status} className="border rounded px-3 py-1 text-sm">
            <option value="">All</option>
            <option value="pending_confirmation">Pending Confirmation</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="confirmed">Confirmed</option>
            <option value="canceled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Payment</label>
          <select name="paymentStatus" defaultValue={paymentStatus} className="border rounded px-3 py-1 text-sm">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="expired">Expired</option>
            <option value="canceled">Cancelled</option>
            <option value="not_required">Not Required</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            Filter
          </button>
          <Link href="/admin/orders" className="px-4 py-1 border rounded text-sm hover:bg-gray-50">
            Reset
          </Link>
        </div>
      </form>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Org</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Customer</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Payment</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Payment Intent</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/admin/organizations/${order.orgId}`} className="text-blue-600 hover:underline">
                      {order.Org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{order.customerName || "—"}</div>
                    <div className="text-gray-500 text-xs">{order.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {formatMoney(order.paymentAmountCents || order.amountTotalCents, order.paymentCurrency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${getPaymentStatusColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                    <div className="text-xs">
                      {new Date(order.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-xs">
                    {order.stripePaymentIntentId ? (
                      <a
                        href={`https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {order.stripePaymentIntentId.slice(0, 15)}...
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                    >
                      View
                    </Link>
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
              href={`/admin/orders?page=${page - 1}${status ? `&status=${status}` : ""}${paymentStatus ? `&paymentStatus=${paymentStatus}` : ""}${orgId ? `&orgId=${orgId}` : ""}${search ? `&search=${search}` : ""}`}
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
              href={`/admin/orders?page=${page + 1}${status ? `&status=${status}` : ""}${paymentStatus ? `&paymentStatus=${paymentStatus}` : ""}${orgId ? `&orgId=${orgId}` : ""}${search ? `&search=${search}` : ""}`}
              className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

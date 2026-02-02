/**
 * Orders Dashboard Page
 * 
 * Displays takeaway orders for the organization.
 * Shows order status, items, and customer info.
 */

import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { OrderStatus } from '@prisma/client';
import Link from 'next/link';
import { OrdersFilter } from '@/components/orders-filter';

// Status badge styling
const STATUS_STYLES: Record<OrderStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  pending_confirmation: { label: 'Pending', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  pending_payment: { label: 'Awaiting Payment', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-green-700', bgColor: 'bg-green-100' },
  expired: { label: 'Expired', color: 'text-red-700', bgColor: 'bg-red-100' },
  canceled: { label: 'Canceled', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatPickupTime(pickupTime: Date | null, pickupMode: string | null): string {
  if (!pickupTime || pickupMode === 'asap') {
    return 'ASAP';
  }
  return formatDate(pickupTime);
}

function getShortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export default async function OrdersPage() {
  const { org } = await requireUserWithOrg();

  // Get recent orders
  const orders = await prisma.order.findMany({
    where: { orgId: org.id },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Count by status
  const statusCounts = {
    confirmed: orders.filter(o => o.status === OrderStatus.confirmed).length,
    pending: orders.filter(o => o.status === OrderStatus.pending_confirmation).length,
    draft: orders.filter(o => o.status === OrderStatus.draft).length,
    total: orders.length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-gray-600">Manage takeaway orders from customers</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Last updated: just now</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📋</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">Total Orders</div>
          <div className="text-2xl font-bold">{statusCounts.total}</div>
        </div>
        <div className="bg-white p-5 rounded-xl border hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">✅</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">Confirmed</div>
          <div className="text-2xl font-bold text-green-600">{statusCounts.confirmed}</div>
        </div>
        <div className="bg-white p-5 rounded-xl border hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">⏳</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
        </div>
        <div className="bg-white p-5 rounded-xl border hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📝</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">Draft</div>
          <div className="text-2xl font-bold text-gray-600">{statusCounts.draft}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <OrdersFilter />

      {/* Orders List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Orders placed via SMS or WhatsApp will appear here. Once customers start ordering, you&apos;ll see all their orders in this dashboard.
            </p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-2">Order ID</div>
              <div className="col-span-3">Customer</div>
              <div className="col-span-2">Pickup</div>
              <div className="col-span-2">Items</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1"></div>
            </div>
            <div className="divide-y">
              {orders.map(order => {
                const statusStyle = STATUS_STYLES[order.status];
                const shortId = getShortId(order.id);
                const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
                
                return (
                  <Link
                    key={order.id}
                    href={`/app/orders/${order.id}`}
                    className="block hover:bg-gray-50 transition-colors"
                  >
                    {/* Mobile View */}
                    <div className="md:hidden p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-mono font-semibold text-blue-600">#{shortId}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyle.bgColor} ${statusStyle.color}`}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <div className="text-sm text-gray-900 font-medium mb-1">
                        {order.customerName || order.customerPhone}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{itemCount} items</span>
                        <span>•</span>
                        <span>{formatPickupTime(order.pickupTime, order.pickupMode)}</span>
                      </div>
                    </div>
                    
                    {/* Desktop View */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 items-center">
                      <div className="col-span-2">
                        <span className="font-mono font-semibold text-blue-600">#{shortId}</span>
                        <div className="text-xs text-gray-400 mt-0.5">{formatDate(order.createdAt)}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900">{order.customerName || 'Guest'}</div>
                        <div className="text-sm text-gray-500">{order.customerPhone}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-gray-700">{formatPickupTime(order.pickupTime, order.pickupMode)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-gray-700">{itemCount} items</span>
                        <div className="text-xs text-gray-400 truncate">
                          {order.items.slice(0, 2).map(i => i.name).join(', ')}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusStyle.bgColor} ${statusStyle.color}`}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <div className="col-span-1 text-right">
                        <svg className="w-5 h-5 text-gray-400 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            
            {/* Pagination */}
            {orders.length >= 50 && (
              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
                <span className="text-sm text-gray-500">Showing {orders.length} orders</span>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white disabled:opacity-50" disabled>
                    Previous
                  </button>
                  <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white">
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

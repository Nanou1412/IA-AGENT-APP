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

// Status badge styling
const STATUS_STYLES: Record<OrderStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  pending_confirmation: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  pending_payment: { label: 'Awaiting Payment', color: 'bg-blue-100 text-blue-800' },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-600' },
  canceled: { label: 'Canceled', color: 'bg-gray-100 text-gray-600' },
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
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Total Orders</div>
          <div className="text-2xl font-bold">{statusCounts.total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Confirmed</div>
          <div className="text-2xl font-bold text-green-600">{statusCounts.confirmed}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Draft</div>
          <div className="text-2xl font-bold text-gray-600">{statusCounts.draft}</div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No orders yet.</p>
            <p className="text-sm mt-2">Orders placed via SMS or WhatsApp will appear here.</p>
          </div>
        ) : (
          <div className="divide-y">
            {orders.map(order => {
              const statusStyle = STATUS_STYLES[order.status];
              const shortId = getShortId(order.id);
              const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
              
              return (
                <Link
                  key={order.id}
                  href={`/app/orders/${order.id}`}
                  className="block p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono font-semibold">#{shortId}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.color}`}>
                          {statusStyle.label}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatDate(order.createdAt)}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-2">
                        {order.customerName && (
                          <span className="font-medium">{order.customerName}</span>
                        )}
                        {order.customerName && ' • '}
                        <span>{order.customerPhone}</span>
                        {' • '}
                        <span>Pickup: {formatPickupTime(order.pickupTime, order.pickupMode)}</span>
                      </div>

                      <div className="text-sm">
                        <span className="text-gray-500">{itemCount} items:</span>{' '}
                        <span className="text-gray-700">
                          {order.items.slice(0, 3).map(i => `${i.quantity}x ${i.name}`).join(', ')}
                          {order.items.length > 3 && ` +${order.items.length - 3} more`}
                        </span>
                      </div>
                    </div>

                    <div className="text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Order Detail Page
 * 
 * Displays full details of a single order including
 * items, timeline, and event logs.
 */

import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { OrderStatus, OrderEventType } from '@prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';

// Status badge styling
const STATUS_STYLES: Record<OrderStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-gray-800', bgColor: 'bg-gray-100' },
  pending_confirmation: { label: 'Pending Confirmation', color: 'text-yellow-800', bgColor: 'bg-yellow-100' },
  pending_payment: { label: 'Awaiting Payment', color: 'text-blue-800', bgColor: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-green-800', bgColor: 'bg-green-100' },
  expired: { label: 'Expired', color: 'text-red-600', bgColor: 'bg-red-100' },
  canceled: { label: 'Canceled', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

// Event type labels
const EVENT_LABELS: Record<OrderEventType, string> = {
  draft_created: '📝 Order draft created',
  draft_updated: '✏️ Draft updated',
  confirmation_requested: '❓ Confirmation requested',
  confirmed: '✅ Order confirmed',
  expired: '⏰ Order expired',
  canceled: '❌ Order canceled',
  handoff_triggered: '🔄 Handoff triggered',
  notification_sent: '📱 Business notified',
  notification_failed: '⚠️ Notification failed',
  error: '🚨 Error occurred',
  // Phase 7.3: Payment events
  pending_payment: '💳 Awaiting payment',
  payment_link_created: '🔗 Payment link sent',
  payment_paid: '✅ Payment received',
  payment_failed: '⚠️ Payment failed',
  payment_expired: '⏰ Payment link expired',
  payment_retry_link_created: '🔄 Retry link sent',
  payment_canceled: '❌ Payment canceled',
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
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
  return formatDateTime(pickupTime);
}

function getShortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

interface PageProps {
  params: { orderId: string };
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { org } = await requireUserWithOrg();

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      items: true,
      eventLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!order || order.orgId !== org.id) {
    notFound();
  }

  const statusStyle = STATUS_STYLES[order.status];
  const shortId = getShortId(order.id);
  const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/app/orders"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Orders
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">#{shortId}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bgColor} ${statusStyle.color}`}>
              {statusStyle.label}
            </span>
          </div>
          <p className="text-gray-500 mt-1">
            Created {formatDateTime(order.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Order Items ({totalItems})</h2>
            <div className="divide-y">
              {order.items.map(item => (
                <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex justify-between">
                    <div>
                      <span className="font-medium">{item.quantity}x {item.name}</span>
                      {item.options && typeof item.options === 'object' && Object.keys(item.options as object).length > 0 && (
                        <div className="text-sm text-gray-500 mt-1">
                          {Object.entries(item.options as Record<string, unknown>).map(([key, value]) => (
                            <span key={key} className="mr-2">
                              {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-sm text-gray-500 mt-1 italic">
                          Note: {item.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Notes */}
          {order.notes && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-2">Special Instructions</h2>
              <p className="text-gray-700">{order.notes}</p>
            </div>
          )}

          {/* Event Timeline */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Order Timeline</h2>
            <div className="space-y-3">
              {order.eventLogs.map(event => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <span className="text-gray-400 whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </span>
                  <span className="text-gray-700">
                    {EVENT_LABELS[event.type] || event.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Customer</h2>
            <div className="space-y-3">
              {order.customerName && (
                <div>
                  <div className="text-sm text-gray-500">Name</div>
                  <div className="font-medium">{order.customerName}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-gray-500">Phone</div>
                <div className="font-medium">{order.customerPhone}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Channel</div>
                <div className="font-medium capitalize">{order.channel}</div>
              </div>
            </div>
          </div>

          {/* Pickup Info */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Pickup Details</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Pickup Time</div>
                <div className="font-medium">
                  {formatPickupTime(order.pickupTime, order.pickupMode)}
                </div>
              </div>
              {order.confirmedAt && (
                <div>
                  <div className="text-sm text-gray-500">Confirmed At</div>
                  <div className="font-medium">{formatDateTime(order.confirmedAt)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Technical Info */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Technical Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-gray-500">Order ID</div>
                <div className="font-mono text-xs break-all">{order.id}</div>
              </div>
              {order.sessionId && (
                <div>
                  <div className="text-gray-500">Session ID</div>
                  <div className="font-mono text-xs break-all">{order.sessionId}</div>
                </div>
              )}
              <div>
                <div className="text-gray-500">Idempotency Key</div>
                <div className="font-mono text-xs break-all">{order.idempotencyKey}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

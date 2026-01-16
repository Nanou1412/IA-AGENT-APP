/**
 * Admin Order Detail Page
 * 
 * View detailed information about a specific order including items,
 * payment links, and event logs.
 */

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function formatMoney(cents: number | null, currency: string = "AUD"): string {
  if (!cents) return "$0.00";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      Org: { select: { id: true, name: true } },
      items: true,
      paymentLinks: {
        orderBy: { createdAt: "desc" },
      },
      eventLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/orders" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
            ← Orders
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Order {order.id.slice(0, 8)}...</h1>
            <p className="text-gray-500 text-sm">
              {order.Org.name} • {order.customerPhone}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded text-sm ${
            order.status === "confirmed" ? "bg-green-100 text-green-800" :
            order.status === "pending_confirmation" || order.status === "pending_payment" || order.status === "draft" ? "bg-yellow-100 text-yellow-800" :
            "bg-gray-100 text-gray-800"
          }`}>
            {order.status}
          </span>
          <span className={`px-3 py-1 rounded text-sm ${
            order.paymentStatus === "paid" ? "bg-green-100 text-green-800" :
            order.paymentStatus === "pending" ? "bg-yellow-100 text-yellow-800" :
            order.paymentStatus === "failed" ? "bg-red-100 text-red-800" :
            "bg-gray-100 text-gray-800"
          }`}>
            {order.paymentStatus}
          </span>
        </div>
      </div>

      {/* Order Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column - Order Details */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h2 className="font-semibold mb-3">📋 Order Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Order ID</dt>
                <dd className="font-mono text-xs">{order.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Channel</dt>
                <dd>{order.channel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Customer Name</dt>
                <dd>{order.customerName || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Customer Phone</dt>
                <dd>{order.customerPhone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Customer Email</dt>
                <dd>{order.customerEmail || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Pickup Mode</dt>
                <dd>{order.pickupMode || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Pickup Time</dt>
                <dd>{order.pickupTime ? new Date(order.pickupTime).toLocaleString("fr-FR") : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Notes</dt>
                <dd className="max-w-xs truncate">{order.notes || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd>{new Date(order.createdAt).toLocaleString("fr-FR")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Confirmed</dt>
                <dd>{order.confirmedAt ? new Date(order.confirmedAt).toLocaleString("fr-FR") : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h2 className="font-semibold mb-3">💳 Payment Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Amount</dt>
                <dd className="font-bold">{formatMoney(order.paymentAmountCents || order.amountTotalCents, order.paymentCurrency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Payment Required</dt>
                <dd>{order.paymentRequired ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Payment Status</dt>
                <dd>{order.paymentStatus}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Paid At</dt>
                <dd>{order.paidAt ? new Date(order.paidAt).toLocaleString("fr-FR") : (order.paymentPaidAt ? new Date(order.paymentPaidAt).toLocaleString("fr-FR") : "—")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Attempt Count</dt>
                <dd>{order.paymentAttemptCount}</dd>
              </div>
              {order.lastPaymentError && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Last Error</dt>
                  <dd className="text-red-600 text-xs max-w-xs truncate">{order.lastPaymentError}</dd>
                </div>
              )}
              {order.stripePaymentIntentId && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Payment Intent</dt>
                  <dd>
                    <a
                      href={`https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {order.stripePaymentIntentId}
                    </a>
                  </dd>
                </div>
              )}
              {order.stripeCheckoutSessionId && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Checkout Session</dt>
                  <dd className="font-mono text-xs">{order.stripeCheckoutSessionId.slice(0, 20)}...</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Right Column - Items & Summary */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h2 className="font-semibold mb-3">📝 Summary</h2>
            <p className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
              {order.summaryText}
            </p>
          </div>

          {order.items.length > 0 && (
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <h2 className="font-semibold mb-3">🛍️ Items ({order.totalItems})</h2>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm border-b pb-2">
                    <div>
                      <span className="font-medium">{item.quantity}x</span> {item.name}
                      {item.options && (
                        <span className="text-gray-500 text-xs ml-2">
                          {typeof item.options === "string" ? item.options : JSON.stringify(item.options)}
                        </span>
                      )}
                      {item.notes && (
                        <span className="text-gray-400 text-xs ml-2">({item.notes})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.paymentLinks.length > 0 && (
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <h2 className="font-semibold mb-3">🔗 Payment Links</h2>
              <div className="space-y-2">
                {order.paymentLinks.map((link) => (
                  <div key={link.id} className="border-b pb-2 text-sm">
                    <div className="flex justify-between">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        link.status === "active" ? "bg-green-100 text-green-800" :
                        link.status === "expired" ? "bg-gray-100 text-gray-800" :
                        "bg-blue-100 text-blue-800"
                      }`}>
                        {link.status}
                      </span>
                      <span className="text-gray-500 text-xs">
                        Expires: {new Date(link.expiresAt).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs break-all"
                    >
                      {link.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event Logs */}
      {order.eventLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">📜 Event Log</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium">Time</th>
                <th className="px-4 py-2 text-left text-sm font-medium">Event</th>
                <th className="px-4 py-2 text-left text-sm font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.eventLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {new Date(log.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium">
                    {log.type}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600 max-w-md truncate">
                    {typeof log.details === "object" ? JSON.stringify(log.details) : String(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Session Link */}
      {order.sessionId && (
        <div className="text-center">
          <Link
            href={`/admin/conversations/${order.sessionId}`}
            className="text-blue-600 hover:underline text-sm"
          >
            View Conversation Session →
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Admin Billing Detail Page
 * 
 * Detailed billing information for a specific organization.
 * Admin actions: update billing status, sync with Stripe, etc.
 */

import { requireAdmin, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function AdminBillingDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  await requireAdmin();
  const { orgId } = await params;

  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    include: {
      org: { select: { id: true, name: true, industry: true, stripeAccountId: true } },
      monthlyCosts: {
        orderBy: { month: "desc" },
        take: 6,
      },
    },
  });

  if (!settings) {
    notFound();
  }

  // Calculate total costs
  const totalCosts = settings.monthlyCosts.reduce(
    (acc, cost) => ({
      ai: acc.ai + cost.aiCostUsd,
      twilio: acc.twilio + cost.twilioCostUsd,
      stripe: acc.stripe + cost.stripeFeesUsd,
      total: acc.total + cost.totalCostUsd,
    }),
    { ai: 0, twilio: 0, stripe: 0, total: 0 }
  );

  // Admin action to update billing status
  async function updateBillingStatus(formData: FormData) {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";

    const newStatus = formData.get("billingStatus") as string;
    await prisma.orgSettings.update({
      where: { orgId },
      data: { billingStatus: newStatus as "inactive" | "incomplete" | "active" | "past_due" | "canceled" },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorId,
        action: "admin.billing.update_status",
        details: { newStatus },
      },
    });
    revalidatePath(`/admin/billing/${orgId}`);
  }

  async function markSetupFeePaid() {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";

    await prisma.orgSettings.update({
      where: { orgId },
      data: { setupFeePaidAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorId,
        action: "admin.billing.mark_setup_paid",
        details: {},
      },
    });
    revalidatePath(`/admin/billing/${orgId}`);
  }

  async function extendPeriod(formData: FormData) {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";

    const currentSettings = await prisma.orgSettings.findUnique({
      where: { orgId },
      select: { currentPeriodEnd: true },
    });

    const daysToAdd = parseInt(formData.get("days") as string) || 30;
    const currentEnd = currentSettings?.currentPeriodEnd || new Date();
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + daysToAdd);

    await prisma.orgSettings.update({
      where: { orgId },
      data: { currentPeriodEnd: newEnd },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorId,
        action: "admin.billing.extend_period",
        details: { daysAdded: daysToAdd, newEndDate: newEnd.toISOString() },
      },
    });
    revalidatePath(`/admin/billing/${orgId}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/billing" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
            ← Billing
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{settings.org.name}</h1>
            <p className="text-gray-500 text-sm">
              {settings.org.industry} • Billing Details
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded text-sm ${
          settings.billingStatus === "active" ? "bg-green-100 text-green-800" :
          settings.billingStatus === "past_due" ? "bg-red-100 text-red-800" :
          settings.billingStatus === "incomplete" ? "bg-yellow-100 text-yellow-800" :
          "bg-gray-100 text-gray-800"
        }`}>
          {settings.billingStatus}
        </span>
      </div>

      {/* Billing Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h2 className="font-semibold mb-3">💳 Subscription Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Billing Status</dt>
                <dd className="font-medium">{settings.billingStatus}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Setup Fee</dt>
                <dd>
                  {settings.setupFeePaidAt ? (
                    <span className="text-green-600">
                      ✓ Paid {new Date(settings.setupFeePaidAt).toLocaleDateString("fr-FR")}
                    </span>
                  ) : (
                    <span className="text-orange-600">Not paid</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Current Period End</dt>
                <dd className={settings.currentPeriodEnd && new Date(settings.currentPeriodEnd) < new Date() ? "text-red-600" : ""}>
                  {settings.currentPeriodEnd ? new Date(settings.currentPeriodEnd).toLocaleDateString("fr-FR") : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Stripe Customer</dt>
                <dd>
                  {settings.stripeCustomerId ? (
                    <a
                      href={`https://dashboard.stripe.com/customers/${settings.stripeCustomerId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {settings.stripeCustomerId}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Stripe Subscription</dt>
                <dd>
                  {settings.stripeSubscriptionId ? (
                    <a
                      href={`https://dashboard.stripe.com/subscriptions/${settings.stripeSubscriptionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {settings.stripeSubscriptionId}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Connect Account</dt>
                <dd>
                  {settings.org.stripeAccountId ? (
                    <a
                      href={`https://dashboard.stripe.com/connect/accounts/${settings.org.stripeAccountId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {settings.org.stripeAccountId}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h2 className="font-semibold mb-3">📊 Cost Summary (Last 6 months)</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">AI Costs</dt>
                <dd className="font-medium">${totalCosts.ai.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Twilio Costs</dt>
                <dd className="font-medium">${totalCosts.twilio.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Stripe Fees</dt>
                <dd className="font-medium">${totalCosts.stripe.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <dt className="text-gray-700 font-medium">Total</dt>
                <dd className="font-bold">${totalCosts.total.toFixed(2)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Right Column - Actions */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h2 className="font-semibold mb-3">🔧 Admin Actions</h2>
            
            {/* Update Billing Status */}
            <div className="border-b pb-4 mb-4">
              <h3 className="text-sm font-medium mb-2">Update Billing Status</h3>
              <form action={updateBillingStatus} className="flex gap-2">
                <select name="billingStatus" defaultValue={settings.billingStatus} className="border rounded px-3 py-1 text-sm flex-1">
                  <option value="inactive">Inactive</option>
                  <option value="incomplete">Incomplete</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                </select>
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  Update
                </button>
              </form>
            </div>

            {/* Mark Setup Fee Paid */}
            {!settings.setupFeePaidAt && (
              <div className="border-b pb-4 mb-4">
                <h3 className="text-sm font-medium mb-2">Setup Fee</h3>
                <form action={markSetupFeePaid}>
                  <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                    Mark Setup Fee as Paid
                  </button>
                </form>
              </div>
            )}

            {/* Extend Period */}
            <div className="border-b pb-4 mb-4">
              <h3 className="text-sm font-medium mb-2">Extend Period</h3>
              <form action={extendPeriod} className="flex gap-2">
                <input type="number" name="days" defaultValue={30} min={1} max={365} className="border rounded px-3 py-1 text-sm w-20" />
                <span className="text-sm text-gray-500 self-center">days</span>
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  Extend
                </button>
              </form>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-sm font-medium mb-2">Quick Links</h3>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/usage/org/${orgId}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                >
                  View Usage
                </Link>
                <Link
                  href={`/admin/organizations/${orgId}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                >
                  View Org
                </Link>
                <Link
                  href={`/admin/orders?orgId=${orgId}`}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                >
                  View Orders
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Costs Table */}
      {settings.monthlyCosts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">📅 Monthly Cost Breakdown</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium">Month</th>
                <th className="px-4 py-2 text-right text-sm font-medium">AI</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Twilio</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Stripe</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Total</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Tokens</th>
                <th className="px-4 py-2 text-right text-sm font-medium">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {settings.monthlyCosts.map((cost) => (
                <tr key={cost.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-medium">{cost.month}</td>
                  <td className="px-4 py-2 text-sm text-right">${cost.aiCostUsd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm text-right">${cost.twilioCostUsd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm text-right">${cost.stripeFeesUsd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm text-right font-medium">${cost.totalCostUsd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-500">
                    {(cost.aiTokensInput + cost.aiTokensOutput).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-500">{cost.smsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

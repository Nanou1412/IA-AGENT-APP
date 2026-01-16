/**
 * Org Usage Detail Page
 * 
 * Detailed usage breakdown for a specific organization.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const metadata = {
  title: "Org Usage - Admin",
};

interface Props {
  params: Promise<{ orgId: string }>;
}

async function resetQuotas(formData: FormData) {
  "use server";

  const orgId = formData.get("orgId") as string;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  await prisma.monthlyOrgCost.updateMany({
    where: { orgId, month: currentMonth },
    data: {
      aiCostUsd: 0,
      twilioCostUsd: 0,
      stripeFeesUsd: 0,
      totalCostUsd: 0,
      aiTokensInput: 0,
      aiTokensOutput: 0,
      smsCount: 0,
      voiceMinutes: 0,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system",
      action: "usage.reset_quotas",
      details: { month: currentMonth },
    },
  });

  revalidatePath(`/admin/usage/${orgId}`);
}

async function updateBudget(formData: FormData) {
  "use server";

  const orgId = formData.get("orgId") as string;
  const aiBudget = parseFloat(formData.get("aiBudget") as string) || null;
  const twilioBudget = parseFloat(formData.get("twilioBudget") as string) || null;

  await prisma.orgSettings.update({
    where: { orgId },
    data: {
      monthlyAiBudgetUsd: aiBudget,
      monthlyTwilioBudgetUsd: twilioBudget,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system",
      action: "usage.budget_updated",
      details: { aiBudget, twilioBudget },
    },
  });

  revalidatePath(`/admin/usage/${orgId}`);
}

async function toggleAi(formData: FormData) {
  "use server";

  const orgId = formData.get("orgId") as string;
  const currentValue = formData.get("currentValue") === "true";

  await prisma.orgSettings.update({
    where: { orgId },
    data: { aiDisabled: !currentValue },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system",
      action: currentValue ? "usage.ai_enabled" : "usage.ai_disabled",
    },
  });

  revalidatePath(`/admin/usage/${orgId}`);
}

export default async function OrgUsageDetailPage({ params }: Props) {
  await requireAdmin();
  const { orgId } = await params;

  const org = await prisma.org.findUnique({
    where: { id: orgId },
    include: {
      settings: true,
    },
  });

  if (!org) {
    notFound();
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Get monthly costs
  const monthlyCost = await prisma.monthlyOrgCost.findUnique({
    where: {
      orgId_month: { orgId, month: currentMonth },
    },
  });

  // Get expensive sessions (top 20)
  const expensiveSessions = await prisma.conversationSession.findMany({
    where: { orgId },
    include: {
      engineRuns: {
        orderBy: { createdAt: "desc" },
        select: { costUsd: true, inputTokens: true, outputTokens: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Calculate session costs
  const sessionCosts = expensiveSessions
    .map((s) => ({
      id: s.id,
      channel: s.channel,
      contactKey: s.contactKey,
      status: s.status,
      createdAt: s.createdAt,
      totalCost: s.engineRuns.reduce((sum, r) => sum + (r.costUsd || 0), 0),
      totalTokens: s.engineRuns.reduce(
        (sum, r) => sum + (r.inputTokens || 0) + (r.outputTokens || 0),
        0
      ),
      runCount: s.engineRuns.length,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 20);

  // Get historical data
  const historicalCosts = await prisma.monthlyOrgCost.findMany({
    where: { orgId },
    orderBy: { month: "desc" },
    take: 6,
  });

  // Budget calculations
  const aiBudget = org.settings?.monthlyAiBudgetUsd;
  const twilioBudget = org.settings?.monthlyTwilioBudgetUsd;
  const aiSpent = monthlyCost?.aiCostUsd || 0;
  const twilioSpent = monthlyCost?.twilioCostUsd || 0;
  const aiPercent = aiBudget ? (aiSpent / aiBudget) * 100 : 0;
  const twilioPercent = twilioBudget ? (twilioSpent / twilioBudget) * 100 : 0;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <p className="text-gray-500">Usage details for {currentMonth}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/orgs/${orgId}`}
            className="text-gray-600 hover:text-gray-800 px-3 py-2"
          >
            View Org
          </Link>
          <Link
            href="/admin/usage"
            className="text-blue-600 hover:text-blue-800 px-3 py-2"
          >
            ← Back to Usage
          </Link>
        </div>
      </div>

      {/* Current Month Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">AI Cost</p>
          <p className="text-2xl font-bold text-purple-600">
            ${aiSpent.toFixed(2)}
          </p>
          {aiBudget && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Budget: ${aiBudget}</span>
                <span className={aiPercent >= 100 ? "text-red-600 font-bold" : ""}>
                  {aiPercent.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded mt-1">
                <div
                  className={`h-full rounded ${
                    aiPercent >= 100
                      ? "bg-red-500"
                      : aiPercent >= 80
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(aiPercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Twilio Cost</p>
          <p className="text-2xl font-bold text-green-600">
            ${twilioSpent.toFixed(2)}
          </p>
          {twilioBudget && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Budget: ${twilioBudget}</span>
                <span className={twilioPercent >= 100 ? "text-red-600 font-bold" : ""}>
                  {twilioPercent.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded mt-1">
                <div
                  className={`h-full rounded ${
                    twilioPercent >= 100
                      ? "bg-red-500"
                      : twilioPercent >= 80
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(twilioPercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Tokens</p>
          <p className="text-2xl font-bold">
            {(
              ((monthlyCost?.aiTokensInput || 0) + (monthlyCost?.aiTokensOutput || 0)) /
              1000
            ).toFixed(1)}
            K
          </p>
          <p className="text-xs text-gray-500 mt-1">
            In: {((monthlyCost?.aiTokensInput || 0) / 1000).toFixed(1)}K | Out:{" "}
            {((monthlyCost?.aiTokensOutput || 0) / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Cost</p>
          <p className="text-2xl font-bold">
            ${(monthlyCost?.totalCostUsd || 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            SMS: {monthlyCost?.smsCount || 0} | Voice: {(monthlyCost?.voiceMinutes || 0).toFixed(1)}m
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Actions */}
        <div className="space-y-6">
          {/* Budget Settings */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium mb-4">Budget Settings</h3>
            <form action={updateBudget} className="space-y-4">
              <input type="hidden" name="orgId" value={orgId} />
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  AI Budget (USD/month)
                </label>
                <input
                  type="number"
                  name="aiBudget"
                  step="0.01"
                  defaultValue={aiBudget || ""}
                  placeholder="e.g., 50.00"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Twilio Budget (USD/month)
                </label>
                <input
                  type="number"
                  name="twilioBudget"
                  step="0.01"
                  defaultValue={twilioBudget || ""}
                  placeholder="e.g., 20.00"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Update Budget
              </button>
            </form>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <form action={resetQuotas}>
                <input type="hidden" name="orgId" value={orgId} />
                <button
                  type="submit"
                  className="w-full bg-yellow-500 text-white py-2 rounded hover:bg-yellow-600"
                  onClick={(e) => {
                    if (!confirm("Reset all usage counters for this month?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  🔄 Reset Quotas
                </button>
              </form>

              <form action={toggleAi}>
                <input type="hidden" name="orgId" value={orgId} />
                <input
                  type="hidden"
                  name="currentValue"
                  value={String(org.settings?.aiDisabled || false)}
                />
                <button
                  type="submit"
                  className={`w-full py-2 rounded ${
                    org.settings?.aiDisabled
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {org.settings?.aiDisabled ? "✅ Enable AI" : "🚫 Block AI"}
                </button>
              </form>
            </div>
          </div>

          {/* Historical */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">History</h3>
            <div className="space-y-2">
              {historicalCosts.map((cost) => (
                <div
                  key={cost.month}
                  className="flex justify-between text-sm border-b pb-2"
                >
                  <span className={cost.month === currentMonth ? "font-bold" : ""}>
                    {cost.month}
                  </span>
                  <span className="font-mono">${cost.totalCostUsd.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expensive Sessions */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h3 className="font-medium">Top 20 Most Expensive Sessions</h3>
          </div>
          {sessionCosts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No sessions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Session</th>
                    <th className="text-left p-3">Channel</th>
                    <th className="text-left p-3">Contact</th>
                    <th className="text-right p-3">Cost</th>
                    <th className="text-right p-3">Tokens</th>
                    <th className="text-right p-3">Runs</th>
                    <th className="text-left p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessionCosts.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <Link
                          href={`/admin/conversations/${session.id}`}
                          className="text-blue-600 hover:underline font-mono text-xs"
                        >
                          {session.id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="p-3 text-gray-600">{session.channel}</td>
                      <td className="p-3 font-mono text-xs">{session.contactKey}</td>
                      <td className="p-3 text-right font-mono font-bold">
                        ${session.totalCost.toFixed(4)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-600">
                        {(session.totalTokens / 1000).toFixed(1)}K
                      </td>
                      <td className="p-3 text-right text-gray-600">{session.runCount}</td>
                      <td className="p-3 text-gray-500 text-xs">
                        {formatDate(session.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

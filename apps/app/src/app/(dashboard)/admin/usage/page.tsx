/**
 * Admin Usage Page
 * 
 * Consolidated view of costs, budgets, and usage across organizations.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export const metadata = {
  title: "Usage & Costs - Admin",
};

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const now = new Date();
  const currentMonth = params.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Get all monthly costs for the selected month
  const monthlyCosts = await prisma.monthlyOrgCost.findMany({
    where: { month: currentMonth },
    include: {
      orgSettings: {
        include: {
          org: { select: { id: true, name: true, industry: true } },
        },
      },
    },
    orderBy: { totalCostUsd: "desc" },
  });

  // Calculate totals
  const totalAiCost = monthlyCosts.reduce((sum, c) => sum + c.aiCostUsd, 0);
  const totalTwilioCost = monthlyCosts.reduce((sum, c) => sum + c.twilioCostUsd, 0);
  const totalStripeFees = monthlyCosts.reduce((sum, c) => sum + c.stripeFeesUsd, 0);
  const totalCost = monthlyCosts.reduce((sum, c) => sum + c.totalCostUsd, 0);
  const totalTokens = monthlyCosts.reduce((sum, c) => sum + c.aiTokensInput + c.aiTokensOutput, 0);
  const totalSms = monthlyCosts.reduce((sum, c) => sum + c.smsCount, 0);
  const totalVoiceMinutes = monthlyCosts.reduce((sum, c) => sum + c.voiceMinutes, 0);

  // Get orgs with budget settings
  const orgsWithBudgets = await prisma.orgSettings.findMany({
    where: {
      OR: [
        { monthlyAiBudgetUsd: { not: null } },
        { monthlyTwilioBudgetUsd: { not: null } },
      ],
    },
    include: {
      org: { select: { id: true, name: true } },
      monthlyCosts: {
        where: { month: currentMonth },
      },
    },
  });

  // Calculate budget status
  const budgetAlerts = orgsWithBudgets
    .map((os) => {
      const cost = os.monthlyCosts[0];
      if (!cost) return null;

      const aiPercent = os.monthlyAiBudgetUsd
        ? (cost.aiCostUsd / os.monthlyAiBudgetUsd) * 100
        : 0;
      const twilioPercent = os.monthlyTwilioBudgetUsd
        ? (cost.twilioCostUsd / os.monthlyTwilioBudgetUsd) * 100
        : 0;

      const maxPercent = Math.max(aiPercent, twilioPercent);

      if (maxPercent >= 80) {
        return {
          orgId: os.orgId,
          orgName: os.org?.name || "Unknown",
          aiPercent,
          twilioPercent,
          maxPercent,
          status: maxPercent >= 100 ? "over" : "warning",
        };
      }
      return null;
    })
    .filter(Boolean);

  // Get last 24h stats
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [runs24h, tokens24h] = await Promise.all([
    prisma.engineRun.count({ where: { createdAt: { gte: last24h } } }),
    prisma.engineRun.aggregate({
      where: { createdAt: { gte: last24h } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    }),
  ]);

  const cost24h = tokens24h._sum.costUsd || 0;
  const tokensTotal24h = (tokens24h._sum.inputTokens || 0) + (tokens24h._sum.outputTokens || 0);

  // Available months
  const availableMonths = await prisma.monthlyOrgCost.findMany({
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
    take: 12,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📊 Usage & Costs</h1>
          <p className="text-gray-500">Monitor costs, budgets, and resource consumption</p>
        </div>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Back
        </Link>
      </div>

      {/* Month Selector */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <form className="flex items-center gap-4">
          <label className="text-sm font-medium">Period:</label>
          <select
            name="month"
            defaultValue={currentMonth}
            className="border rounded px-3 py-2"
            onChange={(e) => {
              const form = e.target.form;
              if (form) form.submit();
            }}
          >
            {availableMonths.map((m) => (
              <option key={m.month} value={m.month}>
                {m.month}
              </option>
            ))}
            {!availableMonths.find((m) => m.month === currentMonth) && (
              <option value={currentMonth}>{currentMonth}</option>
            )}
          </select>
        </form>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Total Cost (MTD)</p>
          <p className="text-2xl font-bold">${totalCost.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Cost 24h</p>
          <p className="text-2xl font-bold text-blue-600">${cost24h.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">AI Cost</p>
          <p className="text-2xl font-bold text-purple-600">${totalAiCost.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Twilio Cost</p>
          <p className="text-2xl font-bold text-green-600">${totalTwilioCost.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Tokens (MTD)</p>
          <p className="text-2xl font-bold">{(totalTokens / 1000).toFixed(1)}K</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">SMS Count</p>
          <p className="text-2xl font-bold">{totalSms}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Voice Minutes</p>
          <p className="text-2xl font-bold">{totalVoiceMinutes.toFixed(1)}</p>
        </div>
      </div>

      {/* Budget Alerts */}
      {budgetAlerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <h3 className="font-medium text-red-800 mb-2">⚠️ Budget Alerts</h3>
          <div className="space-y-2">
            {budgetAlerts.map((alert) => alert && (
              <div key={alert.orgId} className="flex items-center justify-between">
                <Link
                  href={`/admin/usage/${alert.orgId}`}
                  className="text-red-700 hover:underline"
                >
                  {alert.orgName}
                </Link>
                <div className="flex gap-4 text-sm">
                  {alert.aiPercent > 0 && (
                    <span className={alert.aiPercent >= 100 ? "text-red-600 font-bold" : "text-yellow-600"}>
                      AI: {alert.aiPercent.toFixed(0)}%
                    </span>
                  )}
                  {alert.twilioPercent > 0 && (
                    <span className={alert.twilioPercent >= 100 ? "text-red-600 font-bold" : "text-yellow-600"}>
                      Twilio: {alert.twilioPercent.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Orgs Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Organization Usage</h2>
          <span className="text-sm text-gray-500">{monthlyCosts.length} orgs</span>
        </div>
        {monthlyCosts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No usage data for {currentMonth}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Organization</th>
                  <th className="text-right p-3">AI Cost</th>
                  <th className="text-right p-3">Twilio</th>
                  <th className="text-right p-3">Stripe Fees</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-right p-3">Tokens</th>
                  <th className="text-right p-3">SMS</th>
                  <th className="text-right p-3">Voice Min</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthlyCosts.map((cost) => (
                  <tr key={cost.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link
                        href={`/admin/orgs/${cost.orgSettings?.org?.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {cost.orgSettings?.org?.name || "Unknown"}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {cost.orgSettings?.org?.industry}
                      </p>
                    </td>
                    <td className="p-3 text-right font-mono">
                      ${cost.aiCostUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      ${cost.twilioCostUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-500">
                      ${cost.stripeFeesUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      ${cost.totalCostUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">
                      {((cost.aiTokensInput + cost.aiTokensOutput) / 1000).toFixed(1)}K
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">
                      {cost.smsCount}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">
                      {cost.voiceMinutes.toFixed(1)}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/usage/${cost.orgId}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="p-3">Total</td>
                  <td className="p-3 text-right font-mono">${totalAiCost.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">${totalTwilioCost.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">${totalStripeFees.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">${totalCost.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{(totalTokens / 1000).toFixed(1)}K</td>
                  <td className="p-3 text-right font-mono">{totalSms}</td>
                  <td className="p-3 text-right font-mono">{totalVoiceMinutes.toFixed(1)}</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

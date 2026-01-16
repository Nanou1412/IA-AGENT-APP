/**
 * Admin Usage Page
 * 
 * Consolidated view of costs, budgets, and usage across organizations.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { StatCard } from "@/components/ui/admin-card";
import { TableContainer } from "@/components/ui/admin-table";

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
  const [_runs24h, tokens24h] = await Promise.all([
    prisma.engineRun.count({ where: { createdAt: { gte: last24h } } }),
    prisma.engineRun.aggregate({
      where: { createdAt: { gte: last24h } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    }),
  ]);
  void _runs24h; // Available for future use

  const cost24h = tokens24h._sum.costUsd || 0;
  // tokensTotal24h available: (tokens24h._sum.inputTokens || 0) + (tokens24h._sum.outputTokens || 0)

  // Available months
  const availableMonths = await prisma.monthlyOrgCost.findMany({
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
    take: 12,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📊 Usage & Costs</h1>
          <p className="text-gray-500 mt-1">Monitor costs, budgets, and resource consumption</p>
        </div>
        <Link 
          href="/admin" 
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Month Selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <form className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Period:</label>
          <select
            name="month"
            defaultValue={currentMonth}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          title="Total Cost (MTD)"
          value={`$${totalCost.toFixed(2)}`}
          icon="💵"
        />
        <StatCard
          title="Cost 24h"
          value={`$${cost24h.toFixed(2)}`}
          icon="⏰"
          variant="info"
        />
        <StatCard
          title="AI Cost"
          value={`$${totalAiCost.toFixed(2)}`}
          icon="🤖"
          variant="purple"
        />
        <StatCard
          title="Twilio Cost"
          value={`$${totalTwilioCost.toFixed(2)}`}
          icon="📞"
          variant="success"
        />
        <StatCard
          title="Tokens (MTD)"
          value={`${(totalTokens / 1000).toFixed(1)}K`}
          icon="🔤"
        />
        <StatCard
          title="SMS Count"
          value={totalSms}
          icon="💬"
        />
        <StatCard
          title="Voice Minutes"
          value={totalVoiceMinutes.toFixed(1)}
          icon="🎙️"
        />
      </div>

      {/* Budget Alerts */}
      {budgetAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
            <span>⚠️</span> Budget Alerts
          </h3>
          <div className="space-y-2">
            {budgetAlerts.map((alert) => alert && (
              <div key={alert.orgId} className="flex items-center justify-between bg-white/60 rounded-lg px-4 py-2">
                <Link
                  href={`/admin/usage/org/${alert.orgId}`}
                  className="text-red-700 hover:underline font-medium"
                >
                  {alert.orgName}
                </Link>
                <div className="flex gap-4 text-sm">
                  {alert.aiPercent > 0 && (
                    <span className={`px-2 py-1 rounded ${alert.aiPercent >= 100 ? "bg-red-100 text-red-700 font-bold" : "bg-amber-100 text-amber-700"}`}>
                      AI: {alert.aiPercent.toFixed(0)}%
                    </span>
                  )}
                  {alert.twilioPercent > 0 && (
                    <span className={`px-2 py-1 rounded ${alert.twilioPercent >= 100 ? "bg-red-100 text-red-700 font-bold" : "bg-amber-100 text-amber-700"}`}>
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
      <TableContainer
        title="Organization Usage"
        subtitle={`${monthlyCosts.length} organizations with usage data`}
      >
        {monthlyCosts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-lg">📭</p>
            <p className="text-gray-500 mt-2">No usage data for {currentMonth}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Organization</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">AI Cost</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Twilio</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Stripe Fees</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Tokens</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">SMS</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Voice</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyCosts.map((cost) => (
                  <tr key={cost.id} className="hover:bg-gray-50 transition-colors">
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
                    <td className="p-3 text-right font-mono text-purple-600">
                      ${cost.aiCostUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-600">
                      ${cost.twilioCostUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-500">
                      ${cost.stripeFeesUsd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-gray-900">
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
                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/usage/org/${cost.orgId}`}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr className="font-bold">
                  <td className="p-3 text-gray-900">Total</td>
                  <td className="p-3 text-right font-mono text-purple-600">${totalAiCost.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono text-emerald-600">${totalTwilioCost.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono text-gray-500">${totalStripeFees.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono text-gray-900">${totalCost.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{(totalTokens / 1000).toFixed(1)}K</td>
                  <td className="p-3 text-right font-mono">{totalSms}</td>
                  <td className="p-3 text-right font-mono">{totalVoiceMinutes.toFixed(1)}</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </TableContainer>
    </div>
  );
}

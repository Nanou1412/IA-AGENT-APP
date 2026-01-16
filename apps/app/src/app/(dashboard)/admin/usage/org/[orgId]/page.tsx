import { requireAdmin, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default async function OrgUsageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  await requireAdmin();
  // Session available for future audit logging if needed
  await getSession();

  const { orgId } = await params;
  const resolvedSearchParams = await searchParams;
  const period = resolvedSearchParams.period || "30d";

  // Get organization with settings
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    include: {
      settings: true,
      industryConfig: { select: { slug: true, title: true } },
    },
  });

  if (!org) {
    notFound();
  }

  // Calculate date range for month filter
  const now = new Date();
  const monthsBack = period === "7d" ? 1 : period === "30d" ? 1 : 3;
  const months: string[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Get monthly costs for this org
  const monthlyCosts = await prisma.monthlyOrgCost.findMany({
    where: {
      orgId,
      month: { in: months },
    },
    orderBy: { month: "desc" },
  });

  // Calculate totals
  const totals = monthlyCosts.reduce(
    (acc, cost) => ({
      aiCost: acc.aiCost + (cost.aiCostUsd || 0),
      twilioCost: acc.twilioCost + (cost.twilioCostUsd || 0),
      stripeFees: acc.stripeFees + (cost.stripeFeesUsd || 0),
      totalCost: acc.totalCost + (cost.totalCostUsd || 0),
      tokens: acc.tokens + (cost.aiTokensInput || 0) + (cost.aiTokensOutput || 0),
      sms: acc.sms + (cost.smsCount || 0),
      voice: acc.voice + (cost.voiceMinutes || 0),
    }),
    { aiCost: 0, twilioCost: 0, stripeFees: 0, totalCost: 0, tokens: 0, sms: 0, voice: 0 }
  );

  // Get top 20 engine runs (most expensive)
  const expensiveRuns = await prisma.engineRun.findMany({
    where: {
      orgId,
      createdAt: { gte: new Date(Date.now() - (period === "7d" ? 7 : period === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000) },
    },
    include: {
      session: {
        select: { id: true, contactKey: true, channel: true },
      },
    },
    orderBy: { costUsd: "desc" },
    take: 20,
  });

  // Get budget info from settings
  const aiBudget = org.settings?.monthlyAiBudgetUsd ?? 50;
  const twilioBudget = org.settings?.monthlyTwilioBudgetUsd ?? 30;
  const aiUsagePercent = aiBudget > 0 ? (totals.aiCost / aiBudget) * 100 : 0;
  const twilioUsagePercent = twilioBudget > 0 ? (totals.twilioCost / twilioBudget) * 100 : 0;

  // Actions
  async function resetQuota() {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await prisma.monthlyOrgCost.updateMany({
      where: {
        orgId,
        month: currentMonth,
      },
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
        actorUserId: actorId,
        action: "admin.usage.reset_quota",
        details: { resetBy: "admin", month: currentMonth },
      },
    });
    revalidatePath(`/admin/usage/org/${orgId}`);
  }

  async function blockAI() {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";
    
    await prisma.orgSettings.update({
      where: { orgId },
      data: { aiDisabled: true },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorId,
        action: "admin.usage.block_ai",
        details: { blockedBy: "admin" },
      },
    });
    revalidatePath(`/admin/usage/org/${orgId}`);
  }

  async function unblockAI() {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";
    
    await prisma.orgSettings.update({
      where: { orgId },
      data: { aiDisabled: false },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorId,
        action: "admin.usage.unblock_ai",
        details: { unblockedBy: "admin" },
      },
    });
    revalidatePath(`/admin/usage/org/${orgId}`);
  }

  async function updateBudget(formData: FormData) {
    "use server";
    await requireAdmin();
    const sess = await getSession();
    const actorId = sess?.user?.id || "system";
    
    const newAiBudget = Number(formData.get("aiBudget")) || 50;
    const newTwilioBudget = Number(formData.get("twilioBudget")) || 30;
    await prisma.orgSettings.update({
      where: { orgId },
      data: { monthlyAiBudgetUsd: newAiBudget, monthlyTwilioBudgetUsd: newTwilioBudget },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: actorId,
        action: "admin.usage.update_budget",
        details: { aiBudget: newAiBudget, twilioBudget: newTwilioBudget },
      },
    });
    revalidatePath(`/admin/usage/org/${orgId}`);
  }

  const isAiBlocked = org.settings?.aiDisabled === true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/usage" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
            ← Retour
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <p className="text-gray-500 text-sm">
              {org.industryConfig?.slug || org.industry} • Billing: {org.settings?.billingStatus || "inactive"}
              {isAiBlocked && <span className="ml-2 text-red-600 font-medium">⚠️ AI Bloqué</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/organizations/${orgId}`} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
            Voir Organisation
          </Link>
          <Link href={`/admin/audit?orgId=${orgId}`} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
            Audit Logs
          </Link>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex gap-2">
        {["7d", "30d", "90d"].map((p) => (
          <Link 
            key={p} 
            href={`/admin/usage/org/${orgId}?period=${p}`}
            className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-blue-600 text-white' : 'border hover:bg-gray-50'}`}
          >
            {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
          </Link>
        ))}
      </div>

      {/* Cost Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Coût AI</p>
          <p className="text-2xl font-bold text-blue-600">{formatMoney(totals.aiCost)}</p>
          <p className="text-xs text-gray-400">Budget: {formatMoney(aiBudget)}</p>
          <div className="w-full bg-gray-200 rounded h-2 mt-1">
            <div 
              className={`h-2 rounded ${aiUsagePercent >= 100 ? 'bg-red-500' : aiUsagePercent >= 80 ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(aiUsagePercent, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Coût Twilio</p>
          <p className="text-2xl font-bold text-purple-600">{formatMoney(totals.twilioCost)}</p>
          <p className="text-xs text-gray-400">Budget: {formatMoney(twilioBudget)}</p>
          <div className="w-full bg-gray-200 rounded h-2 mt-1">
            <div 
              className={`h-2 rounded ${twilioUsagePercent >= 100 ? 'bg-red-500' : twilioUsagePercent >= 80 ? 'bg-yellow-500' : 'bg-purple-500'}`}
              style={{ width: `${Math.min(twilioUsagePercent, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Stripe Fees</p>
          <p className="text-2xl font-bold text-orange-600">{formatMoney(totals.stripeFees)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total Tokens</p>
          <p className="text-2xl font-bold text-gray-700">{totals.tokens.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Coût Total</p>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(totals.totalCost)}</p>
          <p className="text-xs text-gray-400">{totals.sms} SMS • {totals.voice.toFixed(1)} min voice</p>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="font-semibold mb-4">🔧 Actions Admin</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Reset Quota */}
          <div className="border rounded p-4">
            <h3 className="font-medium mb-2">Reset Quota</h3>
            <p className="text-sm text-gray-500 mb-3">Remet à zéro les coûts du mois en cours.</p>
            <form action={resetQuota}>
              <button type="submit" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">Reset Quota Mois</button>
            </form>
          </div>

          {/* Block/Unblock AI */}
          <div className="border rounded p-4">
            <h3 className="font-medium mb-2">Blocage AI</h3>
            <p className="text-sm text-gray-500 mb-3">
              {isAiBlocked ? "L'AI est actuellement bloqué pour cette org." : "L'AI est actif."}
            </p>
            {isAiBlocked ? (
              <form action={unblockAI}>
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Débloquer AI</button>
              </form>
            ) : (
              <form action={blockAI}>
                <button type="submit" className="px-3 py-1 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50">
                  Bloquer AI
                </button>
              </form>
            )}
          </div>

          {/* Update Budget */}
          <div className="border rounded p-4">
            <h3 className="font-medium mb-2">Modifier Budget</h3>
            <form action={updateBudget} className="space-y-2">
              <div className="flex gap-2">
                <div>
                  <label className="text-xs text-gray-500">AI ($)</label>
                  <input
                    type="number"
                    name="aiBudget"
                    defaultValue={aiBudget}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Twilio ($)</label>
                  <input
                    type="number"
                    name="twilioBudget"
                    defaultValue={twilioBudget}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <button type="submit" className="px-3 py-1 border rounded text-sm hover:bg-gray-50">Mettre à jour</button>
            </form>
          </div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">📅 Historique Mensuel</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Mois</th>
              <th className="px-4 py-3 text-right text-sm font-medium">AI</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Twilio</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Stripe</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Tokens</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Total Coût</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {monthlyCosts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Aucune donnée de coût
                </td>
              </tr>
            ) : (
              monthlyCosts.map((cost) => (
                <tr key={cost.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">
                    {cost.month}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {formatMoney(cost.aiCostUsd || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {formatMoney(cost.twilioCostUsd || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {formatMoney(cost.stripeFeesUsd || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {((cost.aiTokensInput || 0) + (cost.aiTokensOutput || 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {formatMoney(cost.totalCostUsd || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Top 20 Expensive Engine Runs */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">🔥 Top 20 Engine Runs (par coût)</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Run ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Model</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Tokens</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Coût</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Session</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Créé</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {expensiveRuns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Aucun engine run
                </td>
              </tr>
            ) : (
              expensiveRuns.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-xs">
                    {run.id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {run.modelUsed}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {((run.inputTokens || 0) + (run.outputTokens || 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">
                    {formatMoney(run.costUsd || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {run.session?.contactKey || run.sessionId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(run.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/conversations/${run.sessionId}`} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Admin Debug Dashboard
 * 
 * System overview and diagnostic tools for administrators.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export const metadata = {
  title: "Debug - Admin",
};

export default async function DebugPage() {
  await requireAdmin();

  // Get system stats
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Available for future use

  const [
    totalOrgs,
    totalUsers,
    totalSessions,
    activeSessions,
    totalEngineRuns,
    recentEngineRuns,
    blockedRuns,
    errorRuns,
    totalMessages,
    recentMessages,
    totalCalls,
    recentCalls,
    totalOrders,
    recentOrders,
    // stripeEvents - not used yet
    ,
    // recentStripeEvents - not used yet
    ,
    auditLogs,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.org.count(),
    prisma.user.count(),
    prisma.conversationSession.count(),
    prisma.conversationSession.count({ where: { status: "active" } }),
    prisma.engineRun.count(),
    prisma.engineRun.count({ where: { createdAt: { gte: last24h } } }),
    prisma.engineRun.count({ where: { status: "blocked" } }),
    prisma.engineRun.count({ where: { status: "error" } }),
    prisma.messageLog.count(),
    prisma.messageLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.callLog.count(),
    prisma.callLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: last24h } } }),
    prisma.stripeEvent.count(),
    prisma.stripeEvent.count({ where: { createdAt: { gte: last24h } } }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
  ]);

  // Get recent errors
  const recentErrors = await prisma.engineRun.findMany({
    where: { status: { in: ["error", "blocked"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      blockedBy: true,
      errorMessage: true,
      modelUsed: true,
      createdAt: true,
      session: {
        select: { orgId: true },
      },
    },
  });

  // Get cost summary
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlyCosts = await prisma.monthlyOrgCost.findMany({
    where: { month: currentMonth },
  });

  const totalAiCost = monthlyCosts.reduce((sum, c) => sum + c.aiCostUsd, 0);
  const totalTwilioCost = monthlyCosts.reduce((sum, c) => sum + c.twilioCostUsd, 0);
  const totalTokens = monthlyCosts.reduce(
    (sum, c) => sum + c.aiTokensInput + c.aiTokensOutput,
    0
  );

  // Environment check
  const envVars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    UPSTASH_REDIS_URL: !!process.env.UPSTASH_REDIS_URL,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
  };

  const missingVars = Object.entries(envVars)
    .filter(([, v]) => !v)
    .map(([k]) => k);

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
          <h1 className="text-2xl font-bold">🔧 Debug Dashboard</h1>
          <p className="text-gray-500">System diagnostics and health monitoring</p>
        </div>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Back to Admin
        </Link>
      </div>

      {/* Environment Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="font-semibold mb-3">Environment Status</h2>
        {missingVars.length > 0 ? (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
            <p className="text-red-700 font-medium">⚠️ Missing environment variables:</p>
            <p className="text-red-600 text-sm">{missingVars.join(", ")}</p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
            <p className="text-green-700">✅ All required environment variables are set</p>
          </div>
        )}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {Object.entries(envVars).map(([key, isSet]) => (
            <div
              key={key}
              className={`px-2 py-1 rounded text-xs ${
                isSet ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {key.replace(/_/g, " ").slice(0, 15)}
              {isSet ? " ✓" : " ✗"}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Organizations</p>
          <p className="text-2xl font-bold">{totalOrgs}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Users</p>
          <p className="text-2xl font-bold">{totalUsers}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Sessions</p>
          <p className="text-2xl font-bold">{totalSessions}</p>
          <p className="text-xs text-green-600">{activeSessions} active</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Engine Runs (24h)</p>
          <p className="text-2xl font-bold">{recentEngineRuns}</p>
          <p className="text-xs text-gray-500">{totalEngineRuns} total</p>
        </div>
      </div>

      {/* Activity Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Messages (24h)</p>
          <p className="text-2xl font-bold">{recentMessages}</p>
          <p className="text-xs text-gray-500">{totalMessages} total</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Calls (24h)</p>
          <p className="text-2xl font-bold">{recentCalls}</p>
          <p className="text-xs text-gray-500">{totalCalls} total</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Orders (24h)</p>
          <p className="text-2xl font-bold">{recentOrders}</p>
          <p className="text-xs text-gray-500">{totalOrders} total</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Audit Logs (24h)</p>
          <p className="text-2xl font-bold">{recentAuditLogs}</p>
          <p className="text-xs text-gray-500">{auditLogs} total</p>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="font-semibold mb-3">Cost Summary ({currentMonth})</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">AI Cost</p>
            <p className="text-xl font-bold text-blue-600">${totalAiCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Twilio Cost</p>
            <p className="text-xl font-bold text-green-600">${totalTwilioCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Cost</p>
            <p className="text-xl font-bold">${(totalAiCost + totalTwilioCost).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tokens Used</p>
            <p className="text-xl font-bold">{totalTokens.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Error Summary */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="font-semibold mb-3">
          Error Summary
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({blockedRuns} blocked, {errorRuns} errors)
          </span>
        </h2>
        {recentErrors.length === 0 ? (
          <p className="text-green-600">✅ No recent errors</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Reason</th>
                  <th className="text-left p-2">Model</th>
                  <th className="text-left p-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentErrors.map((error) => (
                  <tr key={error.id} className="hover:bg-gray-50">
                    <td className="p-2">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          error.status === "blocked"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {error.status}
                      </span>
                    </td>
                    <td className="p-2 max-w-xs truncate">
                      {error.blockedBy || error.errorMessage || "-"}
                    </td>
                    <td className="p-2 font-mono text-xs">{error.modelUsed}</td>
                    <td className="p-2 text-gray-500 text-xs">
                      {formatDate(error.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Debug Tools Links */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold mb-3">Debug Tools</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/admin/debug/stripe"
            className="p-3 border rounded hover:bg-gray-50 text-center"
          >
            <span className="text-2xl">💳</span>
            <p className="text-sm font-medium mt-1">Stripe Debug</p>
          </Link>
          <Link
            href="/admin/audit"
            className="p-3 border rounded hover:bg-gray-50 text-center"
          >
            <span className="text-2xl">📋</span>
            <p className="text-sm font-medium mt-1">Audit Logs</p>
          </Link>
          <Link
            href="/admin/conversations"
            className="p-3 border rounded hover:bg-gray-50 text-center"
          >
            <span className="text-2xl">💬</span>
            <p className="text-sm font-medium mt-1">Conversations</p>
          </Link>
          <Link
            href="/admin/kill-switches"
            className="p-3 border rounded hover:bg-gray-50 text-center"
          >
            <span className="text-2xl">🚨</span>
            <p className="text-sm font-medium mt-1">Kill Switches</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

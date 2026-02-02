/**
 * Client Analytics Page
 * 
 * Shows usage metrics, costs, and trends for the organization.
 */

import type { Metadata } from 'next';
import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Analytics | IA Agent App',
  description: 'View your usage analytics and metrics.',
};

export const dynamic = 'force-dynamic';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export default async function AnalyticsPage() {
  const { org } = await requireUserWithOrg();
  const settings = org.settings;

  // Date ranges
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Fetch all analytics data
  const [
    // Conversations
    conversationsToday,
    conversationsLast7d,
    conversationsLast30d,
    // Messages
    messagesToday,
    messagesLast7d,
    messagesLast30d,
    // Calls
    callsLast7d,
    callsLast30d,
    // Orders
    ordersLast7d,
    ordersLast30d,
    confirmedOrdersLast30d,
    // Engine runs
    engineRunsLast7d,
    successfulRunsLast7d,
    // Costs
    monthlyCost,
    // Channel breakdown
    messagesByChannel,
  ] = await Promise.all([
    // Conversations
    prisma.conversationSession.count({
      where: { orgId: org.id, createdAt: { gte: todayStart } },
    }),
    prisma.conversationSession.count({
      where: { orgId: org.id, createdAt: { gte: last7Days } },
    }),
    prisma.conversationSession.count({
      where: { orgId: org.id, createdAt: { gte: last30Days } },
    }),
    // Messages
    prisma.messageLog.count({
      where: { orgId: org.id, createdAt: { gte: todayStart } },
    }),
    prisma.messageLog.count({
      where: { orgId: org.id, createdAt: { gte: last7Days } },
    }),
    prisma.messageLog.count({
      where: { orgId: org.id, createdAt: { gte: last30Days } },
    }),
    // Calls
    prisma.callLog.count({
      where: { orgId: org.id, createdAt: { gte: last7Days } },
    }),
    prisma.callLog.count({
      where: { orgId: org.id, createdAt: { gte: last30Days } },
    }),
    // Orders
    prisma.order.count({
      where: { orgId: org.id, createdAt: { gte: last7Days } },
    }),
    prisma.order.count({
      where: { orgId: org.id, createdAt: { gte: last30Days } },
    }),
    prisma.order.count({
      where: { orgId: org.id, status: 'confirmed', createdAt: { gte: last30Days } },
    }),
    // Engine runs
    prisma.engineRun.count({
      where: { orgId: org.id, createdAt: { gte: last7Days } },
    }),
    prisma.engineRun.count({
      where: { orgId: org.id, status: 'success', createdAt: { gte: last7Days } },
    }),
    // Costs
    prisma.monthlyOrgCost.findUnique({
      where: { orgId_month: { orgId: org.id, month: currentMonth } },
    }),
    // Channel breakdown
    prisma.messageLog.groupBy({
      by: ['channel'],
      where: { orgId: org.id, createdAt: { gte: last30Days } },
      _count: true,
    }),
  ]);

  // Calculate metrics
  const successRate = engineRunsLast7d > 0 
    ? Math.round((successfulRunsLast7d / engineRunsLast7d) * 100) 
    : 0;
  
  const orderConversionRate = conversationsLast30d > 0 
    ? Math.round((confirmedOrdersLast30d / conversationsLast30d) * 100) 
    : 0;

  const channelBreakdown = messagesByChannel.reduce((acc, item) => {
    acc[item.channel] = item._count;
    return acc;
  }, {} as Record<string, number>);

  // Budget info
  const aiBudget = settings?.monthlyAiBudgetUsd ?? 50;
  const twilioBudget = settings?.monthlyTwilioBudgetUsd ?? 30;
  const aiUsed = monthlyCost?.aiCostUsd ?? 0;
  const twilioUsed = monthlyCost?.twilioCostUsd ?? 0;
  const aiPercentUsed = Math.min(100, Math.round((aiUsed / aiBudget) * 100));
  const twilioPercentUsed = Math.min(100, Math.round((twilioUsed / twilioBudget) * 100));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-600">Monitor your AI agent performance and usage</p>
      </div>

      {/* Overview Stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Conversations Today</div>
            <div className="text-3xl font-bold text-blue-600">{conversationsToday}</div>
            <div className="text-xs text-gray-400 mt-1">Last 7 days: {conversationsLast7d}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Messages Today</div>
            <div className="text-3xl font-bold text-green-600">{messagesToday}</div>
            <div className="text-xs text-gray-400 mt-1">Last 7 days: {messagesLast7d}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Success Rate</div>
            <div className="text-3xl font-bold text-purple-600">{successRate}%</div>
            <div className="text-xs text-gray-400 mt-1">Last 7 days</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Order Conversion</div>
            <div className="text-3xl font-bold text-orange-600">{orderConversionRate}%</div>
            <div className="text-xs text-gray-400 mt-1">Last 30 days</div>
          </div>
        </div>
      </section>

      {/* Volume Metrics */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Volume (Last 30 Days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Conversations</div>
            <div className="text-2xl font-bold">{formatNumber(conversationsLast30d)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Messages</div>
            <div className="text-2xl font-bold">{formatNumber(messagesLast30d)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Voice Calls</div>
            <div className="text-2xl font-bold">{formatNumber(callsLast30d)}</div>
            <div className="text-xs text-gray-400 mt-1">Last 7 days: {formatNumber(callsLast7d)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Orders</div>
            <div className="text-2xl font-bold">{formatNumber(ordersLast30d)}</div>
            <div className="text-xs text-gray-400 mt-1">Last 7 days: {formatNumber(ordersLast7d)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500">Confirmed Orders</div>
            <div className="text-2xl font-bold text-green-600">{formatNumber(confirmedOrdersLast30d)}</div>
          </div>
        </div>
      </section>

      {/* Channel Breakdown */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Messages by Channel (30 Days)</h2>
        <div className="bg-white rounded-lg border p-6">
          <div className="grid grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-2">💬</div>
              <div className="text-2xl font-bold text-blue-600">{channelBreakdown.sms || 0}</div>
              <div className="text-sm text-gray-500">SMS</div>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-2">📱</div>
              <div className="text-2xl font-bold text-green-600">{channelBreakdown.whatsapp || 0}</div>
              <div className="text-sm text-gray-500">WhatsApp</div>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-2">📞</div>
              <div className="text-2xl font-bold text-orange-600">{callsLast30d}</div>
              <div className="text-sm text-gray-500">Voice</div>
            </div>
          </div>
        </div>
      </section>

      {/* Budget & Costs */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Budget Usage (Current Month)</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {/* AI Budget */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="font-medium">AI/LLM Costs</div>
                <div className="text-sm text-gray-500">Processing conversations</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{formatCurrency(aiUsed)}</div>
                <div className="text-sm text-gray-500">of {formatCurrency(aiBudget)}</div>
              </div>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  aiPercentUsed > 90 ? 'bg-red-500' : aiPercentUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${aiPercentUsed}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">{aiPercentUsed}% used</div>
          </div>

          {/* Twilio Budget */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="font-medium">Twilio Costs</div>
                <div className="text-sm text-gray-500">SMS, WhatsApp, Voice</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{formatCurrency(twilioUsed)}</div>
                <div className="text-sm text-gray-500">of {formatCurrency(twilioBudget)}</div>
              </div>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  twilioPercentUsed > 90 ? 'bg-red-500' : twilioPercentUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${twilioPercentUsed}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">{twilioPercentUsed}% used</div>
          </div>
        </div>

        {/* Total Cost */}
        {monthlyCost && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 p-6 mt-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium text-blue-900">Total Cost This Month</div>
                <div className="text-sm text-blue-700">
                  AI: {formatCurrency(monthlyCost.aiCostUsd)} + Twilio: {formatCurrency(monthlyCost.twilioCostUsd)}
                </div>
              </div>
              <div className="text-3xl font-bold text-blue-900">
                {formatCurrency(monthlyCost.totalCostUsd)}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Token Usage */}
      {monthlyCost && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Token Usage (Current Month)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Input Tokens</div>
              <div className="text-xl font-bold">{formatNumber(monthlyCost.aiTokensInput)}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Output Tokens</div>
              <div className="text-xl font-bold">{formatNumber(monthlyCost.aiTokensOutput)}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-500">SMS Sent</div>
              <div className="text-xl font-bold">{formatNumber(monthlyCost.smsCount)}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Voice Minutes</div>
              <div className="text-xl font-bold">{monthlyCost.voiceMinutes.toFixed(1)}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

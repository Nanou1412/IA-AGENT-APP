/**
 * Admin Analytics Dashboard
 * 
 * Visualizations for:
 * - Volume 7/30 days (sessions, messages, calls)
 * - Cost per day trend
 * - Funnel: sessions → orders → paid
 */

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { StatCard } from "@/components/ui/admin-card";

export const metadata = {
  title: "Analytics - Admin",
};

export const dynamic = "force-dynamic";

interface DayData {
  date: string;
  sessions: number;
  messages: number;
  calls: number;
  orders: number;
  paidOrders: number;
  aiCost: number;
  twilioCost: number;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdmin();
  
  const params = await searchParams;
  const range = params.range === "7d" ? 7 : 30;
  
  // Calculate date range
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - range);
  startDate.setHours(0, 0, 0, 0);

  // Get daily data
  const days: DayData[] = [];
  for (let i = 0; i < range; i++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(startDate.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const [sessions, messages, calls, orders, paidOrders, engineRuns] = await Promise.all([
      prisma.conversationSession.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.messageLog.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.callLog.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.order.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.order.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, paymentStatus: "paid" },
      }),
      prisma.engineRun.aggregate({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
        _sum: { costUsd: true },
      }),
    ]);

    days.push({
      date: dayStart.toISOString().slice(0, 10),
      sessions,
      messages,
      calls,
      orders,
      paidOrders,
      aiCost: engineRuns._sum.costUsd || 0,
      twilioCost: 0, // Would need to calculate from MessageLog/CallLog
    });
  }

  // Calculate totals and averages
  const totals = days.reduce(
    (acc, day) => ({
      sessions: acc.sessions + day.sessions,
      messages: acc.messages + day.messages,
      calls: acc.calls + day.calls,
      orders: acc.orders + day.orders,
      paidOrders: acc.paidOrders + day.paidOrders,
      aiCost: acc.aiCost + day.aiCost,
    }),
    { sessions: 0, messages: 0, calls: 0, orders: 0, paidOrders: 0, aiCost: 0 }
  );

  const avgPerDay = {
    sessions: (totals.sessions / range).toFixed(1),
    messages: (totals.messages / range).toFixed(1),
    orders: (totals.orders / range).toFixed(1),
    aiCost: (totals.aiCost / range).toFixed(2),
  };

  // Funnel metrics
  const sessionToOrderRate = totals.sessions > 0 ? ((totals.orders / totals.sessions) * 100).toFixed(1) : "0";
  const orderToPaidRate = totals.orders > 0 ? ((totals.paidOrders / totals.orders) * 100).toFixed(1) : "0";
  const sessionToPaidRate = totals.sessions > 0 ? ((totals.paidOrders / totals.sessions) * 100).toFixed(1) : "0";

  // Find max values for chart scaling
  const maxSessions = Math.max(...days.map((d) => d.sessions), 1);
  const maxMessages = Math.max(...days.map((d) => d.messages), 1);
  const maxOrders = Math.max(...days.map((d) => d.orders), 1);
  const maxCost = Math.max(...days.map((d) => d.aiCost), 0.01);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📈 Analytics Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Last {range} days • {days[0]?.date} to {days[days.length - 1]?.date}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white rounded-lg border border-gray-200 p-1 flex">
            <Link
              href="/admin/analytics?range=7d"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                range === 7 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              7 days
            </Link>
            <Link
              href="/admin/analytics?range=30d"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                range === 30 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              30 days
            </Link>
          </div>
          <Link 
            href="/admin" 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Total Sessions"
          value={totals.sessions}
          subtitle={`~${avgPerDay.sessions}/day`}
          icon="💬"
        />
        <StatCard
          title="Total Messages"
          value={totals.messages}
          subtitle={`~${avgPerDay.messages}/day`}
          icon="📨"
        />
        <StatCard
          title="Total Orders"
          value={totals.orders}
          subtitle={`~${avgPerDay.orders}/day`}
          icon="🛒"
        />
        <StatCard
          title="Paid Orders"
          value={totals.paidOrders}
          subtitle={`${orderToPaidRate}% conversion`}
          icon="💰"
          variant="success"
        />
        <StatCard
          title="AI Cost"
          value={`$${totals.aiCost.toFixed(2)}`}
          subtitle={`~$${avgPerDay.aiCost}/day`}
          icon="🤖"
          variant="info"
        />
      </div>

      {/* Funnel */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-6">🔽 Conversion Funnel</h2>
        <div className="flex items-center justify-center gap-6">
          <div className="text-center">
            <div className="bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-800 rounded-xl px-8 py-5 min-w-[140px] border border-blue-200">
              <p className="text-3xl font-bold">{totals.sessions.toLocaleString()}</p>
              <p className="text-sm font-medium mt-1">Sessions</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl text-gray-300">→</div>
            <div className="text-sm font-medium text-blue-600 mt-1">{sessionToOrderRate}%</div>
          </div>
          <div className="text-center">
            <div className="bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-800 rounded-xl px-8 py-5 min-w-[140px] border border-amber-200">
              <p className="text-3xl font-bold">{totals.orders.toLocaleString()}</p>
              <p className="text-sm font-medium mt-1">Orders</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl text-gray-300">→</div>
            <div className="text-sm font-medium text-amber-600 mt-1">{orderToPaidRate}%</div>
          </div>
          <div className="text-center">
            <div className="bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-800 rounded-xl px-8 py-5 min-w-[140px] border border-emerald-200">
              <p className="text-3xl font-bold">{totals.paidOrders.toLocaleString()}</p>
              <p className="text-sm font-medium mt-1">Paid</p>
            </div>
          </div>
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          Overall conversion: <span className="font-semibold text-gray-700">{sessionToPaidRate}%</span> sessions → paid orders
        </p>
      </div>

      {/* Sessions Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-4">📊 Daily Sessions</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t hover:from-blue-600 hover:to-blue-500 transition-all cursor-pointer group relative"
              style={{ height: `${(day.sessions / maxSessions) * 100}%`, minHeight: day.sessions > 0 ? "4px" : "0" }}
              title={`${day.date}: ${day.sessions} sessions`}
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 shadow-lg">
                {day.date.slice(5)}: {day.sessions}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2 font-medium">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Messages Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-4">💬 Daily Messages</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-gradient-to-t from-purple-500 to-purple-400 rounded-t hover:from-purple-600 hover:to-purple-500 transition-all cursor-pointer group relative"
              style={{ height: `${(day.messages / maxMessages) * 100}%`, minHeight: day.messages > 0 ? "4px" : "0" }}
              title={`${day.date}: ${day.messages} messages`}
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 shadow-lg">
                {day.date.slice(5)}: {day.messages}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2 font-medium">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Orders Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-4">🛒 Daily Orders</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div key={day.date} className="flex-1 relative group">
              {/* All orders */}
              <div
                className="bg-gradient-to-t from-amber-400 to-amber-300 rounded-t absolute bottom-0 left-0 right-0 hover:from-amber-500 hover:to-amber-400 transition-all"
                style={{ height: `${(day.orders / maxOrders) * 100}%`, minHeight: day.orders > 0 ? "4px" : "0" }}
              />
              {/* Paid orders overlay */}
              <div
                className="bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t absolute bottom-0 left-0 right-0"
                style={{ height: `${(day.paidOrders / maxOrders) * 100}%`, minHeight: day.paidOrders > 0 ? "4px" : "0" }}
              />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 shadow-lg">
                {day.date.slice(5)}: {day.paidOrders}/{day.orders}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2 font-medium">
          <span>{days[0]?.date.slice(5)}</span>
          <span className="flex gap-4">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400 rounded"></span> Orders</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded"></span> Paid</span>
          </span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* AI Cost Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-4">💰 Daily AI Cost</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-gradient-to-t from-orange-500 to-orange-400 rounded-t hover:from-orange-600 hover:to-orange-500 transition-all cursor-pointer group relative"
              style={{ height: `${(day.aiCost / maxCost) * 100}%`, minHeight: day.aiCost > 0 ? "4px" : "0" }}
              title={`${day.date}: $${day.aiCost.toFixed(2)}`}
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 shadow-lg">
                {day.date.slice(5)}: ${day.aiCost.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2 font-medium">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">📋 Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Sessions</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Messages</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Calls</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Orders</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">AI Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {days.slice().reverse().map((day) => (
                <tr key={day.date} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{day.date}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{day.sessions}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{day.messages}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{day.calls}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{day.orders}</td>
                  <td className="px-4 py-3 text-sm text-right text-emerald-600 font-medium">{day.paidOrders}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">${day.aiCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold">
                <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                <td className="px-4 py-3 text-sm text-right">{totals.sessions}</td>
                <td className="px-4 py-3 text-sm text-right">{totals.messages}</td>
                <td className="px-4 py-3 text-sm text-right">{totals.calls}</td>
                <td className="px-4 py-3 text-sm text-right">{totals.orders}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600">{totals.paidOrders}</td>
                <td className="px-4 py-3 text-sm text-right font-mono">${totals.aiCost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

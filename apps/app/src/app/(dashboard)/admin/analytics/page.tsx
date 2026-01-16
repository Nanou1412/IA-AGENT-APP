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
          <h1 className="text-2xl font-bold">📈 Analytics Dashboard</h1>
          <p className="text-gray-500">
            Last {range} days • {days[0]?.date} to {days[days.length - 1]?.date}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/analytics?range=7d"
            className={`px-3 py-1 rounded text-sm ${range === 7 ? "bg-blue-600 text-white" : "border hover:bg-gray-50"}`}
          >
            7 jours
          </Link>
          <Link
            href="/admin/analytics?range=30d"
            className={`px-3 py-1 rounded text-sm ${range === 30 ? "bg-blue-600 text-white" : "border hover:bg-gray-50"}`}
          >
            30 jours
          </Link>
          <Link href="/admin" className="px-3 py-1 border rounded text-sm hover:bg-gray-50 ml-4">
            ← Admin
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total Sessions</p>
          <p className="text-2xl font-bold">{totals.sessions.toLocaleString()}</p>
          <p className="text-xs text-gray-400">~{avgPerDay.sessions}/day</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total Messages</p>
          <p className="text-2xl font-bold">{totals.messages.toLocaleString()}</p>
          <p className="text-xs text-gray-400">~{avgPerDay.messages}/day</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold">{totals.orders.toLocaleString()}</p>
          <p className="text-xs text-gray-400">~{avgPerDay.orders}/day</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Paid Orders</p>
          <p className="text-2xl font-bold text-green-600">{totals.paidOrders.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{orderToPaidRate}% conversion</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">AI Cost</p>
          <p className="text-2xl font-bold text-blue-600">${totals.aiCost.toFixed(2)}</p>
          <p className="text-xs text-gray-400">~${avgPerDay.aiCost}/day</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="font-semibold mb-4">🔽 Conversion Funnel</h2>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="bg-blue-100 text-blue-800 rounded-lg px-6 py-4 min-w-[120px]">
              <p className="text-2xl font-bold">{totals.sessions.toLocaleString()}</p>
              <p className="text-xs">Sessions</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">→</div>
            <div className="text-xs text-gray-500">{sessionToOrderRate}%</div>
          </div>
          <div className="text-center">
            <div className="bg-yellow-100 text-yellow-800 rounded-lg px-6 py-4 min-w-[120px]">
              <p className="text-2xl font-bold">{totals.orders.toLocaleString()}</p>
              <p className="text-xs">Orders</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">→</div>
            <div className="text-xs text-gray-500">{orderToPaidRate}%</div>
          </div>
          <div className="text-center">
            <div className="bg-green-100 text-green-800 rounded-lg px-6 py-4 min-w-[120px]">
              <p className="text-2xl font-bold">{totals.paidOrders.toLocaleString()}</p>
              <p className="text-xs">Paid</p>
            </div>
          </div>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          Overall conversion: <span className="font-medium">{sessionToPaidRate}%</span> sessions → paid orders
        </p>
      </div>

      {/* Sessions Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="font-semibold mb-4">📊 Daily Sessions</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer group relative"
              style={{ height: `${(day.sessions / maxSessions) * 100}%`, minHeight: day.sessions > 0 ? "4px" : "0" }}
              title={`${day.date}: ${day.sessions} sessions`}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                {day.date.slice(5)}: {day.sessions}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Messages Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="font-semibold mb-4">💬 Daily Messages</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-purple-500 rounded-t hover:bg-purple-600 transition-colors cursor-pointer group relative"
              style={{ height: `${(day.messages / maxMessages) * 100}%`, minHeight: day.messages > 0 ? "4px" : "0" }}
              title={`${day.date}: ${day.messages} messages`}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                {day.date.slice(5)}: {day.messages}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Orders Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="font-semibold mb-4">🛒 Daily Orders</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div key={day.date} className="flex-1 relative group">
              {/* All orders */}
              <div
                className="bg-yellow-400 rounded-t absolute bottom-0 left-0 right-0 hover:bg-yellow-500 transition-colors"
                style={{ height: `${(day.orders / maxOrders) * 100}%`, minHeight: day.orders > 0 ? "4px" : "0" }}
              />
              {/* Paid orders overlay */}
              <div
                className="bg-green-500 rounded-t absolute bottom-0 left-0 right-0"
                style={{ height: `${(day.paidOrders / maxOrders) * 100}%`, minHeight: day.paidOrders > 0 ? "4px" : "0" }}
              />
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                {day.date.slice(5)}: {day.paidOrders}/{day.orders}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{days[0]?.date.slice(5)}</span>
          <span className="flex gap-4">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded"></span> Orders</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> Paid</span>
          </span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* AI Cost Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="font-semibold mb-4">💰 Daily AI Cost</h2>
        <div className="flex items-end gap-1 h-40">
          {days.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-orange-500 rounded-t hover:bg-orange-600 transition-colors cursor-pointer group relative"
              style={{ height: `${(day.aiCost / maxCost) * 100}%`, minHeight: day.aiCost > 0 ? "4px" : "0" }}
              title={`${day.date}: $${day.aiCost.toFixed(2)}`}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                {day.date.slice(5)}: ${day.aiCost.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">📋 Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium">Date</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Sessions</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Messages</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Calls</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Orders</th>
                <th className="px-4 py-2 text-right text-sm font-medium">Paid</th>
                <th className="px-4 py-2 text-right text-sm font-medium">AI Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {days.slice().reverse().map((day) => (
                <tr key={day.date} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-medium">{day.date}</td>
                  <td className="px-4 py-2 text-sm text-right">{day.sessions}</td>
                  <td className="px-4 py-2 text-sm text-right">{day.messages}</td>
                  <td className="px-4 py-2 text-sm text-right">{day.calls}</td>
                  <td className="px-4 py-2 text-sm text-right">{day.orders}</td>
                  <td className="px-4 py-2 text-sm text-right text-green-600">{day.paidOrders}</td>
                  <td className="px-4 py-2 text-sm text-right">${day.aiCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 font-medium">
              <tr>
                <td className="px-4 py-2 text-sm">Total</td>
                <td className="px-4 py-2 text-sm text-right">{totals.sessions}</td>
                <td className="px-4 py-2 text-sm text-right">{totals.messages}</td>
                <td className="px-4 py-2 text-sm text-right">{totals.calls}</td>
                <td className="px-4 py-2 text-sm text-right">{totals.orders}</td>
                <td className="px-4 py-2 text-sm text-right text-green-600">{totals.paidOrders}</td>
                <td className="px-4 py-2 text-sm text-right">${totals.aiCost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

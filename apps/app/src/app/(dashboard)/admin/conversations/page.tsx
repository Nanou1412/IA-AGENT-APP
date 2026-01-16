/**
 * Admin Conversations Page
 * 
 * Displays all conversation sessions across organizations.
 * Allows admins to view conversation history and engine runs.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export const metadata = {
  title: "Conversations - Admin",
};

export default async function ConversationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  // Parse pagination
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const pageSize = 30;

  // Build filter conditions
  const whereConditions: Record<string, unknown> = {};

  if (params.orgId) {
    whereConditions.orgId = params.orgId;
  }

  if (params.status && params.status !== "all") {
    whereConditions.status = params.status;
  }

  // Fetch sessions with pagination
  const [sessions, totalCount, orgs] = await Promise.all([
    prisma.conversationSession.findMany({
      where: whereConditions,
      orderBy: { lastActiveAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        turns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        engineRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.conversationSession.count({ where: whereConditions }),
    prisma.org.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Get stats
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [activeLast24h, activeLast7d, totalActive] = await Promise.all([
    prisma.conversationSession.count({
      where: { lastActiveAt: { gte: last24h }, status: "active" },
    }),
    prisma.conversationSession.count({
      where: { lastActiveAt: { gte: last7d }, status: "active" },
    }),
    prisma.conversationSession.count({
      where: { status: "active" },
    }),
  ]);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      completed: "bg-blue-100 text-blue-800",
      handoff: "bg-purple-100 text-purple-800",
      expired: "bg-gray-100 text-gray-600",
      blocked: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getChannelBadge = (channel: string) => {
    const colors: Record<string, string> = {
      sms: "bg-blue-50 text-blue-700",
      whatsapp: "bg-green-50 text-green-700",
      voice: "bg-orange-50 text-orange-700",
      web: "bg-purple-50 text-purple-700",
    };
    return colors[channel] || "bg-gray-50 text-gray-700";
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get org name mapping
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Conversations</h1>
          <p className="text-gray-500">All conversation sessions across organizations</p>
        </div>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Back to Admin
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Sessions</p>
          <p className="text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active Sessions</p>
          <p className="text-2xl font-bold text-green-600">{totalActive}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active Last 24h</p>
          <p className="text-2xl font-bold text-blue-600">{activeLast24h}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active Last 7d</p>
          <p className="text-2xl font-bold text-indigo-600">{activeLast7d}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <form className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Organization</label>
            <select
              name="orgId"
              className="border rounded px-3 py-2"
              defaultValue={params.orgId || ""}
            >
              <option value="">All Organizations</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <select
              name="status"
              className="border rounded px-3 py-2"
              defaultValue={params.status || "all"}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="handoff">Handoff</option>
              <option value="expired">Expired</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-lg shadow">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg">No conversations found</p>
            <p className="text-sm mt-2">
              {params.orgId || params.status ? "Try adjusting your filters" : "Conversations will appear here when users interact with agents"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Session</th>
                    <th className="text-left p-3">Organization</th>
                    <th className="text-left p-3">Channel</th>
                    <th className="text-left p-3">Contact</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Last Message</th>
                    <th className="text-left p-3">Last Active</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map((session) => {
                    const lastTurn = session.turns[0];
                    const _lastRun = session.engineRuns[0];
                    void _lastRun; // Available for future use
                    return (
                      <tr key={session.id} className="hover:bg-gray-50">
                        <td className="p-3">
                          <Link
                            href={`/admin/conversations/${session.id}`}
                            className="text-blue-600 hover:underline font-mono text-xs"
                          >
                            {session.id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="p-3">
                          <span className="font-medium">
                            {orgMap.get(session.orgId) || session.orgId.slice(0, 8)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${getChannelBadge(
                              session.channel
                            )}`}
                          >
                            {session.channel}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-mono text-xs">{session.contactKey}</span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(
                              session.status
                            )}`}
                          >
                            {session.status}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs">
                          {lastTurn ? (
                            <div>
                              <span className="text-xs text-gray-500">{lastTurn.role}:</span>
                              <p className="text-sm truncate" title={lastTurn.text}>
                                {lastTurn.text.slice(0, 50)}...
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">No messages</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500 text-xs">
                          {formatDate(session.lastActiveAt)}
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/admin/conversations/${session.id}`}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {(page - 1) * pageSize + 1} to{" "}
                  {Math.min(page * pageSize, totalCount)} of {totalCount} sessions
                </p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={`?${new URLSearchParams({
                        ...(params.orgId ? { orgId: params.orgId } : {}),
                        ...(params.status ? { status: params.status } : {}),
                        page: String(page - 1),
                      }).toString()}`}
                      className="px-3 py-1 border rounded hover:bg-gray-50"
                    >
                      Previous
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={`?${new URLSearchParams({
                        ...(params.orgId ? { orgId: params.orgId } : {}),
                        ...(params.status ? { status: params.status } : {}),
                        page: String(page + 1),
                      }).toString()}`}
                      className="px-3 py-1 border rounded hover:bg-gray-50"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

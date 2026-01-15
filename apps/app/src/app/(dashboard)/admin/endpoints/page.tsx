/**
 * Admin Endpoints Page
 * 
 * Manages Twilio phone number to organization routing.
 * Critical for multi-tenant SMS/WhatsApp/Voice handling.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export const metadata = {
  title: "Endpoints - Admin",
};

export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; status?: string; orgId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  // Build filter conditions
  const whereConditions: Record<string, unknown> = {};

  if (params.channel && params.channel !== "all") {
    whereConditions.channel = params.channel;
  }

  if (params.status === "active") {
    whereConditions.isActive = true;
  } else if (params.status === "inactive") {
    whereConditions.isActive = false;
  }

  if (params.orgId) {
    whereConditions.orgId = params.orgId;
  }

  // Fetch endpoints with org info
  const [endpoints, orgs, stats] = await Promise.all([
    prisma.channelEndpoint.findMany({
      where: whereConditions,
      orderBy: { createdAt: "desc" },
      include: {
        orgSettings: {
          include: {
            org: {
              select: { id: true, name: true },
            },
          },
        },
        _count: {
          select: {
            messageLogs: true,
            callLogs: true,
          },
        },
      },
    }),
    prisma.org.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Stats
    Promise.all([
      prisma.channelEndpoint.count(),
      prisma.channelEndpoint.count({ where: { isActive: true } }),
      prisma.channelEndpoint.count({ where: { channel: "sms" } }),
      prisma.channelEndpoint.count({ where: { channel: "whatsapp" } }),
      prisma.channelEndpoint.count({ where: { channel: "voice" } }),
    ]),
  ]);

  const [totalEndpoints, activeEndpoints, smsEndpoints, whatsappEndpoints, voiceEndpoints] = stats;

  // Get recent activity for each endpoint
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const getChannelBadge = (channel: string) => {
    const colors: Record<string, string> = {
      sms: "bg-blue-100 text-blue-800",
      whatsapp: "bg-green-100 text-green-800",
      voice: "bg-orange-100 text-orange-800",
    };
    return colors[channel] || "bg-gray-100 text-gray-800";
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📞 Endpoints</h1>
          <p className="text-gray-500">Twilio phone number to organization routing</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/endpoints/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            + Add Endpoint
          </Link>
          <Link href="/admin" className="text-blue-600 hover:text-blue-800 px-4 py-2">
            ← Back
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold">{totalEndpoints}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeEndpoints}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">SMS</p>
          <p className="text-2xl font-bold text-blue-600">{smsEndpoints}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">WhatsApp</p>
          <p className="text-2xl font-bold text-green-600">{whatsappEndpoints}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Voice</p>
          <p className="text-2xl font-bold text-orange-600">{voiceEndpoints}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <form className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Channel</label>
            <select
              name="channel"
              className="border rounded px-3 py-2"
              defaultValue={params.channel || "all"}
            >
              <option value="all">All Channels</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="voice">Voice</option>
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
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Organization</label>
            <select
              name="orgId"
              className="border rounded px-3 py-2"
              defaultValue={params.orgId || ""}
            >
              <option value="">All Orgs</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Endpoints Table */}
      <div className="bg-white rounded-lg shadow">
        {endpoints.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg">No endpoints found</p>
            <p className="text-sm mt-2">
              <Link href="/admin/endpoints/new" className="text-blue-600 hover:underline">
                Create your first endpoint
              </Link>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Phone Number</th>
                  <th className="text-left p-3">Channel</th>
                  <th className="text-left p-3">Organization</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Messages</th>
                  <th className="text-right p-3">Calls</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div>
                        <p className="font-mono font-medium">{endpoint.twilioPhoneNumber}</p>
                        {endpoint.friendlyName && (
                          <p className="text-xs text-gray-500">{endpoint.friendlyName}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getChannelBadge(
                          endpoint.channel
                        )}`}
                      >
                        {endpoint.channel}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/orgs/${endpoint.orgSettings?.org?.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {endpoint.orgSettings?.org?.name || "Unknown"}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          endpoint.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {endpoint.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {endpoint._count.messageLogs}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {endpoint._count.callLogs}
                    </td>
                    <td className="p-3 text-gray-500">{formatDate(endpoint.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/endpoints/${endpoint.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/messaging?endpointId=${endpoint.id}`}
                          className="text-gray-600 hover:text-gray-800 text-sm"
                        >
                          Logs
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unmapped Warning */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-xl">⚠️</span>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              <strong>Unmapped numbers:</strong> Incoming messages/calls to phone numbers not
              listed here will use fallback routing or be rejected. Check{" "}
              <Link href="/admin/messaging" className="underline">
                messaging logs
              </Link>{" "}
              for "unmapped endpoint" errors.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

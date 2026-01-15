/**
 * Endpoint Detail/Edit Page
 * 
 * View and edit an existing endpoint mapping.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const metadata = {
  title: "Edit Endpoint - Admin",
};

interface Props {
  params: Promise<{ id: string }>;
}

async function updateEndpoint(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const orgId = formData.get("orgId") as string;
  const channel = formData.get("channel") as string;
  const twilioPhoneNumber = formData.get("twilioPhoneNumber") as string;
  const friendlyName = formData.get("friendlyName") as string;
  const isActive = formData.get("isActive") === "true";

  if (!id || !orgId || !channel || !twilioPhoneNumber) {
    throw new Error("Missing required fields");
  }

  const normalizedPhone = twilioPhoneNumber.startsWith("+")
    ? twilioPhoneNumber
    : `+${twilioPhoneNumber}`;

  // Check for duplicates (excluding current endpoint)
  const existing = await prisma.channelEndpoint.findFirst({
    where: {
      channel: channel as "sms" | "whatsapp" | "voice",
      twilioPhoneNumber: normalizedPhone,
      NOT: { id },
    },
  });

  if (existing) {
    throw new Error(`Another endpoint already exists for ${channel} on ${normalizedPhone}`);
  }

  // Ensure org settings exist
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });

  if (!orgSettings) {
    await prisma.orgSettings.create({
      data: { orgId },
    });
  }

  // Update endpoint
  await prisma.channelEndpoint.update({
    where: { id },
    data: {
      orgId,
      channel: channel as "sms" | "whatsapp" | "voice",
      twilioPhoneNumber: normalizedPhone,
      friendlyName: friendlyName || null,
      isActive,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system",
      action: "endpoint.updated",
      details: { endpointId: id, channel, twilioPhoneNumber: normalizedPhone },
    },
  });

  revalidatePath("/admin/endpoints");
  redirect("/admin/endpoints");
}

async function deleteEndpoint(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;

  if (!id) {
    throw new Error("Missing endpoint ID");
  }

  const endpoint = await prisma.channelEndpoint.findUnique({
    where: { id },
  });

  if (!endpoint) {
    throw new Error("Endpoint not found");
  }

  await prisma.channelEndpoint.delete({
    where: { id },
  });

  await prisma.auditLog.create({
    data: {
      orgId: endpoint.orgId,
      actorUserId: "system",
      action: "endpoint.deleted",
      details: { 
        endpointId: id, 
        channel: endpoint.channel, 
        twilioPhoneNumber: endpoint.twilioPhoneNumber 
      },
    },
  });

  revalidatePath("/admin/endpoints");
  redirect("/admin/endpoints");
}

async function testWebhook(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const twilioPhoneNumber = formData.get("twilioPhoneNumber") as string;
  const channel = formData.get("channel") as string;

  // In a real implementation, this would send a test request to Twilio
  // For now, we just log the action
  await prisma.auditLog.create({
    data: {
      actorUserId: "system",
      action: "endpoint.test_webhook",
      details: { endpointId: id, channel, twilioPhoneNumber },
    },
  });

  revalidatePath(`/admin/endpoints/${id}`);
}

export default async function EndpointDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const [endpoint, orgs] = await Promise.all([
    prisma.channelEndpoint.findUnique({
      where: { id },
      include: {
        orgSettings: {
          include: {
            org: { select: { id: true, name: true, industry: true } },
          },
        },
        _count: {
          select: { messageLogs: true, callLogs: true },
        },
      },
    }),
    prisma.org.findMany({
      select: { id: true, name: true, industry: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!endpoint) {
    notFound();
  }

  // Get recent logs
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [messages24h, messages7d, calls24h, calls7d, recentErrors] = await Promise.all([
    prisma.messageLog.count({
      where: { endpointId: id, createdAt: { gte: last24h } },
    }),
    prisma.messageLog.count({
      where: { endpointId: id, createdAt: { gte: last7d } },
    }),
    prisma.callLog.count({
      where: { endpointId: id, createdAt: { gte: last24h } },
    }),
    prisma.callLog.count({
      where: { endpointId: id, createdAt: { gte: last7d } },
    }),
    prisma.messageLog.findMany({
      where: { 
        endpointId: id, 
        errorCode: { not: null },
        createdAt: { gte: last7d },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const getChannelBadge = (channel: string) => {
    const colors: Record<string, string> = {
      sms: "bg-blue-100 text-blue-800",
      whatsapp: "bg-green-100 text-green-800",
      voice: "bg-orange-100 text-orange-800",
    };
    return colors[channel] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Edit Endpoint</h1>
          <p className="text-gray-500 font-mono">{endpoint.twilioPhoneNumber}</p>
        </div>
        <Link href="/admin/endpoints" className="text-blue-600 hover:text-blue-800">
          ← Back
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Messages 24h</p>
          <p className="text-2xl font-bold">{messages24h}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Messages 7d</p>
          <p className="text-2xl font-bold">{messages7d}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Calls 24h</p>
          <p className="text-2xl font-bold">{calls24h}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Calls 7d</p>
          <p className="text-2xl font-bold">{calls7d}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Edit Form */}
        <div className="lg:col-span-2">
          <form action={updateEndpoint} className="bg-white rounded-lg shadow p-6 space-y-6">
            <input type="hidden" name="id" value={endpoint.id} />

            {/* Organization */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization *
              </label>
              <select
                name="orgId"
                required
                defaultValue={endpoint.orgId}
                className="w-full border rounded px-3 py-2"
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.industry})
                  </option>
                ))}
              </select>
            </div>

            {/* Channel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel *
              </label>
              <select
                name="channel"
                required
                defaultValue={endpoint.channel}
                className="w-full border rounded px-3 py-2"
              >
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="voice">Voice</option>
              </select>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Twilio Phone Number *
              </label>
              <input
                type="text"
                name="twilioPhoneNumber"
                required
                defaultValue={endpoint.twilioPhoneNumber}
                className="w-full border rounded px-3 py-2 font-mono"
              />
            </div>

            {/* Friendly Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Friendly Name
              </label>
              <input
                type="text"
                name="friendlyName"
                defaultValue={endpoint.friendlyName || ""}
                className="w-full border rounded px-3 py-2"
              />
            </div>

            {/* Active Status */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isActive"
                  value="true"
                  defaultChecked={endpoint.isActive}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            </div>

            {/* Submit */}
            <div className="flex gap-4 pt-4 border-t">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </form>

          {/* Test & Delete Actions */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h3 className="font-medium mb-4">Actions</h3>
            <div className="flex flex-wrap gap-4">
              <form action={testWebhook}>
                <input type="hidden" name="id" value={endpoint.id} />
                <input type="hidden" name="twilioPhoneNumber" value={endpoint.twilioPhoneNumber} />
                <input type="hidden" name="channel" value={endpoint.channel} />
                <button
                  type="submit"
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  🔗 Test Webhook
                </button>
              </form>

              <Link
                href={`/admin/messaging?endpointId=${endpoint.id}`}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                📋 View Logs
              </Link>

              <form action={deleteEndpoint}>
                <input type="hidden" name="id" value={endpoint.id} />
                <button
                  type="submit"
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                  onClick={(e) => {
                    if (!confirm("Are you sure you want to delete this endpoint?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  🗑️ Delete
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">Endpoint Info</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">ID</dt>
                <dd className="font-mono text-xs">{endpoint.id}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Channel</dt>
                <dd>
                  <span className={`px-2 py-1 text-xs rounded ${getChannelBadge(endpoint.channel)}`}>
                    {endpoint.channel}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      endpoint.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {endpoint.isActive ? "Active" : "Inactive"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd>{endpoint.createdAt.toLocaleDateString("en-AU")}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Updated</dt>
                <dd>{endpoint.updatedAt.toLocaleDateString("en-AU")}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Total Messages</dt>
                <dd>{endpoint._count.messageLogs}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Total Calls</dt>
                <dd>{endpoint._count.callLogs}</dd>
              </div>
            </dl>
          </div>

          {/* Recent Errors */}
          {recentErrors.length > 0 && (
            <div className="bg-red-50 rounded-lg shadow p-4">
              <h3 className="font-medium text-red-800 mb-3">Recent Errors</h3>
              <div className="space-y-2">
                {recentErrors.map((error) => (
                  <div key={error.id} className="text-sm">
                    <p className="text-red-700 font-mono">{error.errorCode}</p>
                    <p className="text-red-600 text-xs">{error.errorMessage}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

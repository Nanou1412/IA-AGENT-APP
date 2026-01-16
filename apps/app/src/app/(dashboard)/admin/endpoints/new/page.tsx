/**
 * Create Endpoint Page
 * 
 * Add a new Twilio phone number to organization mapping.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const metadata = {
  title: "New Endpoint - Admin",
};

async function createEndpoint(formData: FormData) {
  "use server";

  const orgId = formData.get("orgId") as string;
  const channel = formData.get("channel") as string;
  const twilioPhoneNumber = formData.get("twilioPhoneNumber") as string;
  const friendlyName = formData.get("friendlyName") as string;
  const isActive = formData.get("isActive") === "true";

  if (!orgId || !channel || !twilioPhoneNumber) {
    throw new Error("Missing required fields");
  }

  // Normalize phone number
  const normalizedPhone = twilioPhoneNumber.startsWith("+")
    ? twilioPhoneNumber
    : `+${twilioPhoneNumber}`;

  // Check if endpoint already exists
  const existing = await prisma.channelEndpoint.findFirst({
    where: {
      channel: channel as "sms" | "whatsapp" | "voice",
      twilioPhoneNumber: normalizedPhone,
    },
  });

  if (existing) {
    throw new Error(`Endpoint already exists for ${channel} on ${normalizedPhone}`);
  }

  // Ensure org settings exist
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });

  if (!orgSettings) {
    // Create default org settings
    await prisma.orgSettings.create({
      data: { orgId },
    });
  }

  // Create endpoint
  await prisma.channelEndpoint.create({
    data: {
      orgId,
      channel: channel as "sms" | "whatsapp" | "voice",
      twilioPhoneNumber: normalizedPhone,
      friendlyName: friendlyName || null,
      isActive,
    },
  });

  // Log action
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system", // Should come from session
      action: "endpoint.created",
      details: { channel, twilioPhoneNumber: normalizedPhone, friendlyName },
    },
  });

  revalidatePath("/admin/endpoints");
  redirect("/admin/endpoints");
}

export default async function NewEndpointPage() {
  await requireAdmin();

  const orgs = await prisma.org.findMany({
    select: { id: true, name: true, industry: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Add Endpoint</h1>
          <p className="text-gray-500">Map a Twilio phone number to an organization</p>
        </div>
        <Link href="/admin/endpoints" className="text-blue-600 hover:text-blue-800">
          ← Back
        </Link>
      </div>

      <form action={createEndpoint} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Organization */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization *
          </label>
          <select
            name="orgId"
            required
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an organization</option>
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
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select channel</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voice">Voice</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            The type of communication this endpoint will handle
          </p>
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
            placeholder="+61485000807"
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">
            E.164 format with country code (e.g., +61485000807)
          </p>
        </div>

        {/* Friendly Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Friendly Name
          </label>
          <input
            type="text"
            name="friendlyName"
            placeholder="Main Restaurant Line"
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Optional label for easy identification
          </p>
        </div>

        {/* Active Status */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked
              className="rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            Inactive endpoints will not receive messages or calls
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4 border-t">
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Create Endpoint
          </button>
          <Link
            href="/admin/endpoints"
            className="px-6 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Help */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">How Routing Works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• When Twilio receives a message/call to this number, we look up the org</li>
          <li>• The org&apos;s agent template and settings are used to handle the conversation</li>
          <li>• Multiple endpoints can point to the same org (e.g., SMS + Voice)</li>
          <li>• WhatsApp endpoints should use the WhatsApp-enabled number</li>
        </ul>
      </div>
    </div>
  );
}

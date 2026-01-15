/**
 * Admin Kill Switches Page
 * 
 * Emergency controls to disable features across the platform.
 * Based on KILL_SWITCHES.md documentation.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const metadata = {
  title: "Kill Switches - Admin",
};

// Define the global kill switches and their descriptions
const GLOBAL_SWITCHES = [
  {
    key: "ai_disabled",
    label: "AI Engine",
    description: "Disable all AI processing globally. Conversations will not receive AI responses.",
    severity: "critical",
  },
  {
    key: "sms_disabled",
    label: "SMS",
    description: "Disable all SMS sending/receiving. Inbound SMS will be logged but not processed.",
    severity: "high",
  },
  {
    key: "voice_disabled",
    label: "Voice",
    description: "Disable all voice calls. Inbound calls will hear a busy signal.",
    severity: "high",
  },
  {
    key: "booking_disabled",
    label: "Booking",
    description: "Disable booking module. Calendar integrations will pause.",
    severity: "medium",
  },
  {
    key: "takeaway_disabled",
    label: "Takeaway Orders",
    description: "Disable takeaway order creation. Existing orders can still be viewed.",
    severity: "medium",
  },
  {
    key: "payment_disabled",
    label: "Payments",
    description: "Disable payment processing. No new payment links will be created.",
    severity: "high",
  },
];

async function toggleSwitch(formData: FormData) {
  "use server";
  
  const orgId = formData.get("orgId") as string;
  const switchKey = formData.get("switchKey") as string;
  const currentValue = formData.get("currentValue") === "true";
  
  if (!orgId || !switchKey) {
    throw new Error("Missing required fields");
  }

  // Map switch key to field name
  const fieldMap: Record<string, string> = {
    ai_disabled: "aiDisabled",
    sms_disabled: "smsDisabled",
    voice_disabled: "voiceDisabled",
    booking_disabled: "bookingDisabled",
    takeaway_disabled: "takeawayDisabled",
    payment_disabled: "paymentDisabled",
  };

  const fieldName = fieldMap[switchKey];
  if (!fieldName) {
    throw new Error("Invalid switch key");
  }

  await prisma.orgSettings.update({
    where: { orgId },
    data: { [fieldName]: !currentValue },
  });

  // Log the action
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system", // Should be from session in real implementation
      action: `kill_switch.${switchKey}.${!currentValue ? "enabled" : "disabled"}`,
      details: { switchKey, previousValue: currentValue, newValue: !currentValue },
    },
  });

  revalidatePath("/admin/kill-switches");
}

async function toggleAllForOrg(formData: FormData) {
  "use server";
  
  const orgId = formData.get("orgId") as string;
  const enable = formData.get("action") === "enable";
  
  if (!orgId) {
    throw new Error("Missing org ID");
  }

  await prisma.orgSettings.update({
    where: { orgId },
    data: {
      aiDisabled: enable,
      smsDisabled: enable,
      voiceDisabled: enable,
      bookingDisabled: enable,
      takeawayDisabled: enable,
      paymentDisabled: enable,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: "system",
      action: enable ? "kill_switch.all.enabled" : "kill_switch.all.disabled",
      details: { allSwitches: enable },
    },
  });

  revalidatePath("/admin/kill-switches");
}

export default async function KillSwitchesPage() {
  await requireAdmin();

  // Get all orgs with their settings
  const orgs = await prisma.org.findMany({
    include: {
      settings: true,
    },
    orderBy: { name: "asc" },
  });

  // Count disabled features globally
  const stats = {
    aiDisabled: orgs.filter((o) => o.settings?.aiDisabled).length,
    smsDisabled: orgs.filter((o) => o.settings?.smsDisabled).length,
    voiceDisabled: orgs.filter((o) => o.settings?.voiceDisabled).length,
    bookingDisabled: orgs.filter((o) => o.settings?.bookingDisabled).length,
    takeawayDisabled: orgs.filter((o) => o.settings?.takeawayDisabled).length,
    paymentDisabled: orgs.filter((o) => o.settings?.paymentDisabled).length,
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "border-red-500";
      case "high":
        return "border-orange-500";
      case "medium":
        return "border-yellow-500";
      default:
        return "border-gray-300";
    }
  };

  const getSwitchValue = (settings: typeof orgs[0]["settings"], key: string): boolean => {
    if (!settings) return false;
    const fieldMap: Record<string, keyof typeof settings> = {
      ai_disabled: "aiDisabled",
      sms_disabled: "smsDisabled",
      voice_disabled: "voiceDisabled",
      booking_disabled: "bookingDisabled",
      takeaway_disabled: "takeawayDisabled",
      payment_disabled: "paymentDisabled",
    };
    return settings[fieldMap[key]] as boolean;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🚨 Kill Switches</h1>
          <p className="text-gray-500">Emergency controls to disable features per organization</p>
        </div>
        <Link href="/admin" className="text-blue-600 hover:text-blue-800">
          ← Back to Admin
        </Link>
      </div>

      {/* Warning Banner */}
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-2xl">⚠️</span>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">
              <strong>Warning:</strong> Kill switches immediately disable features for organizations.
              Use only in emergency situations. Changes are logged in the audit trail.
            </p>
          </div>
        </div>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        {GLOBAL_SWITCHES.map((sw) => (
          <div
            key={sw.key}
            className={`bg-white rounded-lg shadow p-4 border-l-4 ${getSeverityColor(sw.severity)}`}
          >
            <p className="text-sm text-gray-500">{sw.label} Disabled</p>
            <p className="text-2xl font-bold">
              {stats[sw.key as keyof typeof stats]} / {orgs.length}
            </p>
          </div>
        ))}
      </div>

      {/* Switch Legend */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="font-semibold mb-3">Switch Reference</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {GLOBAL_SWITCHES.map((sw) => (
            <div key={sw.key} className="flex items-start gap-2">
              <span
                className={`w-3 h-3 rounded-full mt-1 ${
                  sw.severity === "critical"
                    ? "bg-red-500"
                    : sw.severity === "high"
                    ? "bg-orange-500"
                    : "bg-yellow-500"
                }`}
              />
              <div>
                <p className="font-medium text-sm">{sw.label}</p>
                <p className="text-xs text-gray-500">{sw.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Organizations Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Organizations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Organization</th>
                {GLOBAL_SWITCHES.map((sw) => (
                  <th key={sw.key} className="text-center p-3" title={sw.description}>
                    {sw.label}
                  </th>
                ))}
                <th className="text-center p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgs.map((org) => {
                const hasAnyDisabled = GLOBAL_SWITCHES.some((sw) =>
                  getSwitchValue(org.settings, sw.key)
                );
                return (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link
                        href={`/admin/orgs/${org.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {org.name}
                      </Link>
                      <p className="text-xs text-gray-500">{org.industry}</p>
                    </td>
                    {GLOBAL_SWITCHES.map((sw) => {
                      const isDisabled = getSwitchValue(org.settings, sw.key);
                      return (
                        <td key={sw.key} className="text-center p-3">
                          <form action={toggleSwitch}>
                            <input type="hidden" name="orgId" value={org.id} />
                            <input type="hidden" name="switchKey" value={sw.key} />
                            <input
                              type="hidden"
                              name="currentValue"
                              value={String(isDisabled)}
                            />
                            <button
                              type="submit"
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                isDisabled
                                  ? "bg-red-100 text-red-800 hover:bg-red-200"
                                  : "bg-green-100 text-green-800 hover:bg-green-200"
                              }`}
                              title={isDisabled ? "Click to enable" : "Click to disable"}
                            >
                              {isDisabled ? "OFF" : "ON"}
                            </button>
                          </form>
                        </td>
                      );
                    })}
                    <td className="text-center p-3">
                      <form action={toggleAllForOrg} className="inline">
                        <input type="hidden" name="orgId" value={org.id} />
                        <input
                          type="hidden"
                          name="action"
                          value={hasAnyDisabled ? "disable" : "enable"}
                        />
                        <button
                          type="submit"
                          className={`px-2 py-1 rounded text-xs ${
                            hasAnyDisabled
                              ? "bg-green-600 text-white hover:bg-green-700"
                              : "bg-red-600 text-white hover:bg-red-700"
                          }`}
                        >
                          {hasAnyDisabled ? "Enable All" : "Kill All"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Kill Switch Activity */}
      <div className="bg-white rounded-lg shadow mt-6">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500">
            View full history in{" "}
            <Link href="/admin/audit" className="text-blue-600 hover:underline">
              Audit Logs
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

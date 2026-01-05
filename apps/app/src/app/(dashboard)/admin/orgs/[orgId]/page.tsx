import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { OrgActions } from '@/components/org-actions';

export const dynamic = 'force-dynamic';

const SANDBOX_STATUS_COLORS: Record<string, string> = {
  sandbox_required: 'bg-yellow-100 text-yellow-800',
  sandbox_in_progress: 'bg-blue-100 text-blue-800',
  ready_for_review: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-500 text-white',
  revoked: 'bg-red-100 text-red-800',
};

interface OrgDetailPageProps {
  params: { orgId: string };
}

export default async function OrgDetailPage({ params }: OrgDetailPageProps) {
  await requireAdmin();

  const org = await prisma.org.findUnique({
    where: { id: params.orgId },
    include: {
      settings: true,
      industryConfig: true,
      memberships: {
        include: {
          user: true,
        },
      },
      assignments: {
        include: {
          template: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!org) {
    notFound();
  }

  const settings = org.settings;
  const pendingAssignment = org.assignments.find((a: { status: string }) => a.status === 'pending');
  const sandboxStatus = settings?.sandboxStatus || 'sandbox_required';

  // Get onboarding steps
  const onboardingSteps = await prisma.orgOnboardingStep.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: 'asc' },
  });

  const totalSteps = onboardingSteps.length;
  const completedSteps = onboardingSteps.filter((s) => s.status === 'done').length;

  // Get audit logs
  const auditLogs = await prisma.auditLog.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/orgs" className="text-blue-600 hover:underline text-sm">
          ← Back to Organisations
        </Link>
        <h1 className="text-3xl font-bold mt-2">{org.name}</h1>
        <p className="text-gray-500">{org.id}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Organisation Details */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="font-semibold mb-4">Organisation Details</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Industry</dt>
              <dd className="font-medium capitalize">{org.industry}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Timezone</dt>
              <dd className="font-medium">{org.timezone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Industry Config</dt>
              <dd className="font-medium">{org.industryConfig?.title || 'None'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium">
                {new Date(org.createdAt).toLocaleDateString('en-AU')}
              </dd>
            </div>
          </dl>
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="font-semibold mb-4">Status</h3>
          <dl className="space-y-3">
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">Sandbox Status</dt>
              <dd>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    SANDBOX_STATUS_COLORS[sandboxStatus] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {sandboxStatus}
                </span>
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">Sensitive Modules</dt>
              <dd>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    settings?.sensitiveModulesStatus === 'enabled'
                      ? 'bg-green-100 text-green-800'
                      : settings?.sensitiveModulesStatus === 'pending_review'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {settings?.sensitiveModulesStatus || 'disabled'}
                </span>
              </dd>
            </div>
            {totalSteps > 0 && (
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Onboarding Progress</dt>
                <dd className="font-medium">{completedSteps}/{totalSteps} steps</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 pt-4 border-t">
            <OrgActions
              orgId={org.id}
              sandboxStatus={sandboxStatus}
              sensitiveStatus={settings?.sensitiveModulesStatus || 'disabled'}
              pendingAssignmentId={pendingAssignment?.id}
            />
          </div>
        </div>

        {/* Onboarding Steps */}
        {onboardingSteps.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-semibold mb-4">Onboarding Steps</h3>
            <ul className="space-y-2">
              {onboardingSteps.map((step) => (
                <li key={step.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="font-medium">{step.stepKey}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    step.status === 'done' ? 'bg-green-100 text-green-800' :
                    step.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                    step.status === 'blocked' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {step.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Members */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="font-semibold mb-4">Members ({org.memberships.length})</h3>
          <ul className="space-y-2">
            {org.memberships.map((m: { id: string; user: { name: string | null; email: string }; role: string }) => (
              <li key={m.id} className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{m.user.name || m.user.email}</div>
                  <div className="text-sm text-gray-500">{m.user.email}</div>
                </div>
                <span className="text-sm capitalize text-gray-600">{m.role}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Assignments */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="font-semibold mb-4">Template Assignments</h3>
          {org.assignments.length > 0 ? (
            <ul className="space-y-3">
              {org.assignments.map((a: { id: string; template: { title: string; slug: string }; templateVersion: string; status: string }) => (
                <li
                  key={a.id}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded"
                >
                  <div>
                    <div className="font-medium">{a.template.title}</div>
                    <div className="text-sm text-gray-500">
                      {a.template.slug}@{a.templateVersion}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      a.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : a.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No template assignments</p>
          )}
        </div>

        {/* Audit Logs */}
        {auditLogs.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6 md:col-span-2">
            <h3 className="font-semibold mb-4">Recent Audit Logs</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Action</th>
                    <th className="text-left py-2">Actor</th>
                    <th className="text-left py-2">Details</th>
                    <th className="text-left py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b">
                      <td className="py-2 font-medium">{log.action}</td>
                      <td className="py-2 text-gray-500">{log.actorUserId}</td>
                      <td className="py-2 text-gray-500 max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                      <td className="py-2 text-gray-500">
                        {new Date(log.createdAt).toLocaleString('en-AU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

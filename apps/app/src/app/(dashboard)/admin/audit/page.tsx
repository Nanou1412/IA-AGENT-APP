/**
 * Admin Audit Logs Page
 * 
 * View all system audit logs across organizations.
 */

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'production.approved': { label: 'Production Approved', color: 'bg-green-100 text-green-800' },
  'production.revoked': { label: 'Production Revoked', color: 'bg-red-100 text-red-800' },
  'sandbox.reopened': { label: 'Sandbox Reopened', color: 'bg-yellow-100 text-yellow-800' },
  'sensitive_modules.updated': { label: 'Sensitive Modules Updated', color: 'bg-purple-100 text-purple-800' },
  'assignment.activated': { label: 'Assignment Activated', color: 'bg-blue-100 text-blue-800' },
  'template.assigned': { label: 'Template Assigned', color: 'bg-indigo-100 text-indigo-800' },
  'template.created': { label: 'Template Created', color: 'bg-teal-100 text-teal-800' },
  'org.created': { label: 'Organization Created', color: 'bg-green-100 text-green-800' },
  'org.twilio_config_updated': { label: 'Twilio Config Updated', color: 'bg-orange-100 text-orange-800' },
  'org.profile.updated': { label: 'Profile Updated', color: 'bg-gray-100 text-gray-800' },
  'org.handoff.updated': { label: 'Handoff Updated', color: 'bg-gray-100 text-gray-800' },
  'org.messaging.updated': { label: 'Messaging Updated', color: 'bg-gray-100 text-gray-800' },
  'user.added_to_org': { label: 'User Added to Org', color: 'bg-blue-100 text-blue-800' },
};

async function getAuditLogs() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Get unique actor IDs and org IDs
  const actorIds = [...new Set(logs.map(l => l.actorUserId))];
  const orgIds = [...new Set(logs.filter(l => l.orgId).map(l => l.orgId as string))];

  // Fetch users and orgs
  const [users, orgs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, name: true },
    }),
    prisma.org.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    }),
  ]);

  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o]));

  return { logs, userMap, orgMap };
}

export default async function AuditLogsPage() {
  await requireAdmin();
  const { logs, userMap, orgMap } = await getAuditLogs();

  // Group logs by date
  const logsByDate = logs.reduce((acc, log) => {
    const date = log.createdAt.toLocaleDateString('en-AU');
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {} as Record<string, typeof logs>);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <Link href="/admin" className="text-blue-600 hover:underline text-sm">
          ← Back to Admin
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Audit Logs</h1>
        <p className="text-gray-600">System activity history (last 100 events)</p>
      </div>

      {/* Logs by Date */}
      {Object.entries(logsByDate).map(([date, dateLogs]) => (
        <div key={date} className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 mb-3 sticky top-0 bg-gray-50 py-2">
            {date}
          </h2>
          <div className="bg-white rounded-lg shadow-sm border divide-y">
            {dateLogs.map((log) => {
              const actionConfig = ACTION_LABELS[log.action] || {
                label: log.action,
                color: 'bg-gray-100 text-gray-800',
              };
              const actor = userMap[log.actorUserId];
              const org = log.orgId ? orgMap[log.orgId] : null;
              const details = log.details as Record<string, unknown>;

              return (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${actionConfig.color}`}
                      >
                        {actionConfig.label}
                      </span>
                      <div>
                        <div className="text-sm text-gray-900">
                          {actor ? (
                            <span className="font-medium">{actor.name || actor.email}</span>
                          ) : (
                            <span className="text-gray-400">Unknown user</span>
                          )}
                          {org && (
                            <>
                              {' '}on{' '}
                              <Link
                                href={`/admin/orgs/${org.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                {org.name}
                              </Link>
                            </>
                          )}
                        </div>
                        {details && Object.keys(details).length > 0 && (
                          <div className="mt-1 text-xs text-gray-500 font-mono">
                            {Object.entries(details)
                              .slice(0, 3)
                              .map(([key, value]) => (
                                <span key={key} className="mr-3">
                                  {key}: {String(value).slice(0, 30)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {log.createdAt.toLocaleTimeString('en-AU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {logs.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-500">
          No audit logs found.
        </div>
      )}
    </div>
  );
}

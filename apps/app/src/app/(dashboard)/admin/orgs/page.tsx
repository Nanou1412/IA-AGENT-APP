import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

const SANDBOX_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  sandbox_required: { label: 'Sandbox Required', color: 'bg-yellow-100 text-yellow-800' },
  sandbox_in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  ready_for_review: { label: 'Pending Review', color: 'bg-purple-100 text-purple-800' },
  approved: { label: 'Production', color: 'bg-green-500 text-white' },
  revoked: { label: 'Revoked', color: 'bg-red-100 text-red-800' },
};

const SENSITIVE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  disabled: { label: 'Disabled', color: 'bg-gray-100 text-gray-800' },
  pending_review: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  enabled: { label: 'Enabled', color: 'bg-green-100 text-green-800' },
};

export default async function AdminOrgsPage() {
  await requireAdmin();

  const orgs = await prisma.org.findMany({
    include: {
      settings: true,
      _count: {
        select: { memberships: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Organisations</h1>
          <p className="text-gray-600">Manage all organisations and their settings.</p>
        </div>
        <Link href="/admin/orgs/new">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            + Create Organisation
          </button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Organisation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Industry
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sandbox
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sensitive
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orgs.map((org) => {
              const sandboxStatus = org.settings?.sandboxStatus || 'sandbox_required';
              const sensitiveStatus = org.settings?.sensitiveModulesStatus || 'disabled';
              const sandboxLabel = SANDBOX_STATUS_LABELS[sandboxStatus];
              const sensitiveLabel = SENSITIVE_STATUS_LABELS[sensitiveStatus];

              return (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{org.name}</div>
                    <div className="text-sm text-gray-500">{org.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                      {org.industry}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${sandboxLabel?.color}`}>
                      {sandboxLabel?.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${sensitiveLabel?.color}`}>
                      {sensitiveLabel?.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {org._count.memberships}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(org.createdAt).toLocaleDateString('en-AU')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/orgs/${org.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {orgs.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No organisations found.
          </div>
        )}
      </div>

      <div className="mt-4">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← Back to Admin
        </Link>
      </div>
    </div>
  );
}

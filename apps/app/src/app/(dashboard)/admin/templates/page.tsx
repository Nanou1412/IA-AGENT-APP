import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  const templates = await prisma.agentTemplate.findMany({
    orderBy: [{ slug: 'asc' }, { version: 'desc' }],
  });

  // Group by slug for count
  const countBySlug = templates.reduce<Record<string, number>>((acc, t) => {
    acc[t.slug] = (acc[t.slug] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Agent Templates</h1>
          <p className="text-gray-600">Manage versioned agent templates for each industry.</p>
        </div>
        <Link
          href="/admin/templates/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          + Create Template
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {Object.entries(countBySlug).map(([slug, count]) => (
          <div key={slug} className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-lg font-semibold capitalize">{slug}</div>
            <div className="text-sm text-gray-500">{count} version{count > 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>

      {/* Templates Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Version
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Modules
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {templates.map((template) => (
              <tr key={template.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {template.slug}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  v{template.version}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {template.title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {(template.modulesDefault as string[]).length} modules
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(template.updatedAt).toLocaleDateString('en-AU')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {templates.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No templates found. Run <code className="bg-gray-100 px-2 py-1 rounded">pnpm db:seed</code> to load templates.
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

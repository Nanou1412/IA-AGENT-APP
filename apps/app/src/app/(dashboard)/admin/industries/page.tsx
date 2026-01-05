import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminIndustriesPage() {
  const industries = await prisma.industryConfig.findMany({
    orderBy: { slug: 'asc' },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Industry Configurations</h1>
        <p className="text-gray-600">Manage industry-specific settings and rules.</p>
      </div>

      {/* Industries Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {industries.map((industry) => {
          const rules = industry.rulesJson as Record<string, unknown>;
          return (
            <div key={industry.id} className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">
                  {industry.slug === 'restaurant' && '🍽️'}
                  {industry.slug === 'hotel' && '🏨'}
                  {industry.slug === 'tradie' && '🔧'}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{industry.title}</h3>
                  <span className="text-sm text-gray-500">{industry.slug}</span>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Rules</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {Object.entries(rules).slice(0, 4).map(([key, value]) => (
                    <li key={key} className="flex justify-between">
                      <span className="text-gray-500">{key}:</span>
                      <span className="font-medium">{String(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 pt-4 border-t text-xs text-gray-400">
                Updated: {new Date(industry.updatedAt).toLocaleDateString('en-AU')}
              </div>
            </div>
          );
        })}
      </div>

      {industries.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-500">
          No industry configurations found. Run <code className="bg-gray-100 px-2 py-1 rounded">pnpm db:seed</code> to load configs.
        </div>
      )}

      <div className="mt-4">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← Back to Admin
        </Link>
      </div>
    </div>
  );
}

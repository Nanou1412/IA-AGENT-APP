/**
 * Admin Create Template Page
 * 
 * Create a new agent template or a new version of an existing template.
 */

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import Link from 'next/link';
import { CreateTemplateForm } from '@/components/create-template-form';

export const dynamic = 'force-dynamic';

async function getExistingSlugs() {
  const templates = await prisma.agentTemplate.findMany({
    select: { slug: true },
    distinct: ['slug'],
    orderBy: { slug: 'asc' },
  });
  
  return templates.map(t => t.slug);
}

async function getLatestVersions() {
  const templates = await prisma.agentTemplate.findMany({
    orderBy: [{ slug: 'asc' }, { version: 'desc' }],
  });

  // Get latest version per slug
  const latest = templates.reduce((acc, t) => {
    if (!acc[t.slug]) {
      acc[t.slug] = t;
    }
    return acc;
  }, {} as Record<string, typeof templates[0]>);

  return Object.values(latest);
}

export default async function CreateTemplatePage() {
  await requireAdmin();
  
  const existingSlugs = await getExistingSlugs();
  const latestTemplates = await getLatestVersions();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/templates" className="text-blue-600 hover:underline text-sm">
          ← Back to Templates
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create Template</h1>
        <p className="text-gray-600">
          Create a new agent template or add a version to an existing template.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        <CreateTemplateForm 
          existingSlugs={existingSlugs}
          latestTemplates={latestTemplates.map(t => ({
            id: t.id,
            slug: t.slug,
            version: t.version,
            title: t.title,
            systemPrompt: t.systemPrompt,
            intentsAllowed: t.intentsAllowed as string[],
            modulesDefault: t.modulesDefault as string[],
            handoffTriggers: t.handoffTriggers as string[],
          }))}
        />
      </div>
    </div>
  );
}

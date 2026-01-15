/**
 * Organization Settings Page
 * 
 * Allows org owners/managers to view and update their organization settings.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { OrgProfileForm } from '@/components/org-profile-form';
import { HandoffSettingsForm } from '@/components/handoff-settings-form';
import { MessagingSettingsForm } from '@/components/messaging-settings-form';

export const dynamic = 'force-dynamic';

async function getOrgData(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      role: { in: ['owner', 'manager'] },
    },
    include: {
      org: {
        include: {
          settings: true,
          assignments: {
            include: {
              template: {
                select: { title: true, slug: true, version: true }
              }
            },
            where: { status: 'active' },
            take: 1,
          },
        },
      },
    },
  });

  return membership;
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const membership = await getOrgData(session.user.id);

  if (!membership?.org) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <p className="text-gray-600">
          You don&apos;t have permission to access organization settings.
        </p>
      </div>
    );
  }

  const { org } = membership;
  const settings = org.settings;
  const activeTemplate = org.assignments[0]?.template;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-gray-600">Manage your organization&apos;s configuration.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <span className="border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-blue-600">
            General
          </span>
          <Link
            href="/app/settings/integrations"
            className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
          >
            Integrations
          </Link>
        </nav>
      </div>

      {/* Organization Profile */}
      <section className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Organization Profile</h2>
        <Suspense fallback={<div className="animate-pulse h-32 bg-gray-100 rounded" />}>
          <OrgProfileForm
            orgId={org.id}
            initialData={{
              name: org.name,
              industry: org.industry,
              timezone: org.timezone,
            }}
          />
        </Suspense>
      </section>

      {/* Active Template */}
      <section className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">AI Agent Template</h2>
        {activeTemplate ? (
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-4 rounded-lg flex-1">
              <div className="font-medium text-blue-900">{activeTemplate.title}</div>
              <div className="text-sm text-blue-700">
                {activeTemplate.slug} v{activeTemplate.version}
              </div>
            </div>
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
              Active
            </span>
          </div>
        ) : (
          <p className="text-gray-500">No template assigned. Contact support to configure your AI agent.</p>
        )}
      </section>

      {/* Handoff Settings */}
      <section className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Handoff Settings</h2>
        <p className="text-sm text-gray-600 mb-4">
          Configure where the AI should transfer conversations when it can&apos;t help.
        </p>
        <Suspense fallback={<div className="animate-pulse h-32 bg-gray-100 rounded" />}>
          <HandoffSettingsForm
            orgId={org.id}
            initialData={{
              handoffPhone: settings?.handoffPhone || '',
              handoffEmail: settings?.handoffEmail || '',
              handoffSmsTo: settings?.handoffSmsTo || '',
              handoffReplyText: settings?.handoffReplyText || '',
            }}
          />
        </Suspense>
      </section>

      {/* Messaging Settings */}
      <section className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Messaging Settings</h2>
        <p className="text-sm text-gray-600 mb-4">
          Configure default messages and locale settings.
        </p>
        <Suspense fallback={<div className="animate-pulse h-32 bg-gray-100 rounded" />}>
          <MessagingSettingsForm
            orgId={org.id}
            initialData={{
              messagingLocale: settings?.messagingLocale || 'en-AU',
              defaultInboundReplyText: settings?.defaultInboundReplyText || '',
              deniedReplyText: settings?.deniedReplyText || '',
              faqText: settings?.faqText || '',
            }}
          />
        </Suspense>
      </section>

      {/* Voice Settings (Read-only for now) */}
      <section className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Voice Settings</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Voice Enabled:</span>
            <span className={`ml-2 font-medium ${settings?.voiceEnabled ? 'text-green-600' : 'text-gray-600'}`}>
              {settings?.voiceEnabled ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Call Queue:</span>
            <span className={`ml-2 font-medium ${settings?.callQueueEnabled ? 'text-green-600' : 'text-gray-600'}`}>
              {settings?.callQueueEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Record Calls:</span>
            <span className={`ml-2 font-medium ${settings?.recordCalls ? 'text-green-600' : 'text-gray-600'}`}>
              {settings?.recordCalls ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Handoff Number:</span>
            <span className="ml-2 font-medium">{settings?.callHandoffNumber || 'Not set'}</span>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Contact support to modify voice settings.
        </p>
      </section>

      {/* Danger Zone */}
      <section className="bg-red-50 rounded-lg border border-red-200 p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Danger Zone</h2>
        <p className="text-sm text-red-700 mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>
        <button
          type="button"
          disabled
          className="px-4 py-2 bg-red-100 text-red-400 rounded-lg cursor-not-allowed"
        >
          Delete Organization (Contact Support)
        </button>
      </section>
    </div>
  );
}

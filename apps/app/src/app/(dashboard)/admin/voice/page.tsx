/**
 * Admin Voice Page (Phase 5)
 * 
 * Manage Voice endpoints for organizations.
 * View call logs and voice configuration.
 */

import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import { MessagingChannel, CallDirection } from '@prisma/client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getVoiceStats() {
  const [endpoints, recentCalls, orgStats] = await Promise.all([
    prisma.channelEndpoint.findMany({
      where: { channel: MessagingChannel.voice },
      include: {
        orgSettings: {
          include: {
            org: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.callLog.findMany({
      take: 30,
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        orgId: true,
        twilioCallSid: true,
        direction: true,
        status: true,
        blockedBy: true,
        denyReason: true,
        from: true,
        to: true,
        durationSeconds: true,
        startedAt: true,
        endedAt: true,
      },
    }),
    prisma.orgSettings.findMany({
      select: {
        orgId: true,
        voiceEnabled: true,
        callQueueEnabled: true,
        callHandoffNumber: true,
        recordCalls: true,
        org: {
          select: { name: true },
        },
      },
    }),
  ]);

  return { endpoints, recentCalls, orgStats };
}

function StatusBadge({ status, blockedBy }: { status: string | null; blockedBy?: string | null }) {
  if (blockedBy) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
        DENIED ({blockedBy})
      </span>
    );
  }
  
  if (!status) return <span className="text-gray-400">-</span>;

  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    ringing: 'bg-yellow-100 text-yellow-800',
    initiated: 'bg-gray-100 text-gray-800',
    failed: 'bg-red-100 text-red-800',
    busy: 'bg-orange-100 text-orange-800',
    'no-answer': 'bg-orange-100 text-orange-800',
    canceled: 'bg-gray-100 text-gray-600',
    unmapped: 'bg-purple-100 text-purple-800',
    denied: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.toUpperCase()}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: CallDirection }) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${direction === 'inbound' ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'}`}>
      {direction === 'inbound' ? '📞 IN' : '📤 OUT'}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function VoiceDashboard() {
  const { endpoints, recentCalls, orgStats } = await getVoiceStats();

  const voiceEnabledOrgs = orgStats.filter(o => o.voiceEnabled);
  const completedCalls = recentCalls.filter(c => c.status === 'completed');
  const deniedCalls = recentCalls.filter(c => c.blockedBy);

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Voice Endpoints</h3>
          <p className="text-3xl font-bold text-gray-900">{endpoints.filter(e => e.isActive).length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Orgs Voice Enabled</h3>
          <p className="text-3xl font-bold text-green-600">{voiceEnabledOrgs.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Recent Calls (30)</h3>
          <p className="text-3xl font-bold text-blue-600">{recentCalls.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Completed</h3>
          <p className="text-3xl font-bold text-green-600">{completedCalls.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Denied</h3>
          <p className="text-3xl font-bold text-red-600">{deniedCalls.length}</p>
        </div>
      </div>

      {/* Voice Endpoints */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Voice Endpoints</h2>
          <span className="text-sm text-gray-500">{endpoints.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Org</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Friendly Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {endpoints.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No voice endpoints configured. Add one in Org settings.
                  </td>
                </tr>
              ) : (
                endpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Link href={`/admin/orgs/${endpoint.orgId}`} className="text-indigo-600 hover:text-indigo-900">
                        {endpoint.orgSettings?.org?.name || endpoint.orgId}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {endpoint.twilioPhoneNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {endpoint.friendlyName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${endpoint.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {endpoint.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {endpoint.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Org Voice Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Organization Voice Settings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Org</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Queue</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Handoff Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recording</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orgStats.map((stat) => (
                <tr key={stat.orgId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/admin/orgs/${stat.orgId}`} className="text-indigo-600 hover:text-indigo-900">
                      {stat.org?.name || stat.orgId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${stat.voiceEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {stat.voiceEnabled ? '✓ Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${stat.callQueueEnabled ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                      {stat.callQueueEnabled ? '✓ Queue' : 'Direct'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                    {stat.callHandoffNumber || <span className="text-gray-400">Not set</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${stat.recordCalls ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                      {stat.recordCalls ? '🔴 Recording' : 'No Recording'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Call Logs */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Recent Calls</h2>
          <span className="text-sm text-gray-500">Last 30 calls</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Direction</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Org</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No calls recorded yet.
                  </td>
                </tr>
              ) : (
                recentCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {call.startedAt.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <DirectionBadge direction={call.direction} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {call.from}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {call.to}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={call.status} blockedBy={call.blockedBy} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDuration(call.durationSeconds)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {call.orgId ? (
                        <Link href={`/admin/orgs/${call.orgId}`} className="text-indigo-600 hover:text-indigo-900">
                          {call.orgId.substring(0, 8)}...
                        </Link>
                      ) : (
                        <span className="text-gray-400">Unmapped</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminVoicePage() {
  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Voice Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage voice endpoints and view call logs
            </p>
          </div>
          <Link href="/admin" className="text-indigo-600 hover:text-indigo-900 text-sm">
            ← Back to Admin
          </Link>
        </div>
        
        <Suspense fallback={<div className="text-center py-10">Loading...</div>}>
          <VoiceDashboard />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Admin Messaging Page
 * 
 * Manage ChannelEndpoints for organizations.
 * View message logs and messaging configuration.
 */

import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import { MessagingChannel } from '@prisma/client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getMessagingStats() {
  const [endpoints, recentLogs, orgStats] = await Promise.all([
    prisma.channelEndpoint.findMany({
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
    prisma.messageLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orgId: true,
        channel: true,
        direction: true,
        status: true,
        from: true,
        to: true,
        body: true,
        createdAt: true,
        errorCode: true,
      },
    }),
    prisma.orgSettings.findMany({
      select: {
        orgId: true,
        smsEnabled: true,
        whatsappEnabled: true,
        org: {
          select: { name: true },
        },
      },
    }),
  ]);

  return { endpoints, recentLogs, orgStats };
}

function ChannelBadge({ channel }: { channel: MessagingChannel }) {
  const colors: Record<MessagingChannel, string> = {
    sms: 'bg-blue-100 text-blue-800',
    whatsapp: 'bg-green-100 text-green-800',
    voice: 'bg-purple-100 text-purple-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[channel]}`}>
      {channel.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400">-</span>;

  const colors: Record<string, string> = {
    delivered: 'bg-green-100 text-green-800',
    sent: 'bg-blue-100 text-blue-800',
    queued: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    undelivered: 'bg-red-100 text-red-800',
    received: 'bg-purple-100 text-purple-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${direction === 'inbound' ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'}`}>
      {direction === 'inbound' ? '← IN' : '→ OUT'}
    </span>
  );
}

async function MessagingDashboard() {
  const { endpoints, recentLogs, orgStats } = await getMessagingStats();

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Endpoints Actifs</h3>
          <p className="text-3xl font-bold text-gray-900">{endpoints.filter(e => e.isActive).length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">SMS Endpoints</h3>
          <p className="text-3xl font-bold text-blue-600">{endpoints.filter(e => e.channel === 'sms').length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">WhatsApp Endpoints</h3>
          <p className="text-3xl font-bold text-green-600">{endpoints.filter(e => e.channel === 'whatsapp').length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Orgs avec Messaging</h3>
          <p className="text-3xl font-bold text-gray-900">
            {orgStats.filter(o => o.smsEnabled || o.whatsappEnabled).length}
          </p>
        </div>
      </div>

      {/* Channel Endpoints */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Channel Endpoints</h2>
          <p className="text-sm text-gray-500">Numéros Twilio configurés par organisation</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organisation</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numéro Twilio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {endpoints.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Aucun endpoint configuré
                  </td>
                </tr>
              ) : (
                endpoints.map(endpoint => (
                  <tr key={endpoint.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/orgs/${endpoint.orgId}`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {endpoint.orgSettings?.org?.name || endpoint.orgId}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ChannelBadge channel={endpoint.channel} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                      {endpoint.twilioPhoneNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {endpoint.isActive ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Actif
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(endpoint.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Org Messaging Settings */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Configuration Messaging par Org</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organisation</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">SMS</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orgStats.map(stat => (
                <tr key={stat.orgId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/orgs/${stat.orgId}`}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      {stat.org?.name || stat.orgId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {stat.smsEnabled ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {stat.whatsappEnabled ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Message Logs */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Messages Récents</h2>
          <p className="text-sm text-gray-500">20 derniers messages (tous orgs)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">De → Vers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Aucun message enregistré
                  </td>
                </tr>
              ) : (
                recentLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ChannelBadge channel={log.channel} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <DirectionBadge direction={log.direction} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                      <span className="text-gray-600">{log.from?.slice(-6)}</span>
                      <span className="mx-1">→</span>
                      <span className="text-gray-600">{log.to?.slice(-6)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={log.status} />
                      {log.errorCode && (
                        <span className="ml-2 text-xs text-red-500">{log.errorCode}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {log.body?.substring(0, 60)}{log.body && log.body.length > 60 ? '...' : ''}
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

export default function MessagingAdminPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Messaging Admin</h1>
        <p className="text-gray-500">Gestion des endpoints SMS & WhatsApp</p>
      </div>

      <Suspense fallback={<div className="animate-pulse bg-gray-200 h-96 rounded-lg" />}>
        <MessagingDashboard />
      </Suspense>
    </div>
  );
}

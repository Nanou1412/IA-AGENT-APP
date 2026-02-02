/**
 * Client Conversations Page
 * 
 * Displays conversation history for the organization.
 * Shows sessions, channels, and recent messages.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { ConversationsFilter } from '@/components/conversations-filter';

export const metadata: Metadata = {
  title: 'Conversations | IA Agent App',
  description: 'View your conversation history with customers.',
};

export const dynamic = 'force-dynamic';

const CHANNEL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sms: { label: 'SMS', icon: '💬', color: 'bg-blue-100 text-blue-800' },
  whatsapp: { label: 'WhatsApp', icon: '📱', color: 'bg-green-100 text-green-800' },
  voice: { label: 'Voice', icon: '📞', color: 'bg-orange-100 text-orange-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600' },
};

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, 4) + '****' + phone.slice(-3);
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; status?: string; page?: string }>;
}) {
  const { org } = await requireUserWithOrg();
  const params = await searchParams;

  // Parse pagination
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const pageSize = 20;

  // Build filter conditions
  const whereConditions: Record<string, unknown> = {
    orgId: org.id,
  };

  if (params.channel && params.channel !== 'all') {
    whereConditions.channel = params.channel;
  }

  if (params.status && params.status !== 'all') {
    whereConditions.status = params.status;
  }

  // Fetch conversations with pagination
  const [sessions, totalCount] = await Promise.all([
    prisma.conversationSession.findMany({
      where: whereConditions,
      orderBy: { lastActiveAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        turns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, role: true, createdAt: true },
        },
      },
    }),
    prisma.conversationSession.count({ where: whereConditions }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Get stats
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [activeLast24h, totalLast7d, byChannel] = await Promise.all([
    prisma.conversationSession.count({
      where: { orgId: org.id, lastActiveAt: { gte: last24h } },
    }),
    prisma.conversationSession.count({
      where: { orgId: org.id, createdAt: { gte: last7d } },
    }),
    prisma.conversationSession.groupBy({
      by: ['channel'],
      where: { orgId: org.id, createdAt: { gte: last7d } },
      _count: true,
    }),
  ]);

  const channelStats = byChannel.reduce((acc, item) => {
    acc[item.channel] = item._count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversations</h1>
          <p className="text-gray-600">View and manage customer conversations</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Active (24h)</div>
          <div className="text-2xl font-bold text-green-600">{activeLast24h}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Total (7 days)</div>
          <div className="text-2xl font-bold">{totalLast7d}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">SMS</div>
          <div className="text-2xl font-bold text-blue-600">{channelStats.sms || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">WhatsApp</div>
          <div className="text-2xl font-bold text-green-600">{channelStats.whatsapp || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <ConversationsFilter />

      {/* Conversations List */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg mb-2">No conversations yet</p>
            <p className="text-sm">Conversations from SMS, WhatsApp, and voice will appear here.</p>
          </div>
        ) : (
          <div className="divide-y">
            {sessions.map((session) => {
              const channelConfig = CHANNEL_CONFIG[session.channel] || CHANNEL_CONFIG.sms;
              const statusConfig = STATUS_CONFIG[session.status] || STATUS_CONFIG.active;
              const lastTurn = session.turns[0];

              return (
                <Link
                  key={session.id}
                  href={`/app/conversations/${session.id}`}
                  className="block p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{channelConfig.icon}</span>
                      <div>
                        <div className="font-medium">{maskPhone(session.contactKey)}</div>
                        {lastTurn && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                            {lastTurn.role === 'user' ? '← ' : '→ '}
                            {lastTurn.text?.slice(0, 80)}
                            {(lastTurn.text?.length || 0) > 80 && '...'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs text-gray-500">
                        {formatDate(session.lastActiveAt)}
                      </span>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${channelConfig.color}`}>
                          {channelConfig.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            <span className="px-3 py-1 bg-blue-600 text-white rounded">{page}</span>
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

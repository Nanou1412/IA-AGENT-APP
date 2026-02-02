/**
 * Client Conversation Detail Page
 * 
 * Displays full conversation history with all messages.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Conversation Detail | IA Agent App',
  description: 'View conversation details.',
};

const CHANNEL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sms: { label: 'SMS', icon: '💬', color: 'bg-blue-100 text-blue-800' },
  whatsapp: { label: 'WhatsApp', icon: '📱', color: 'bg-green-100 text-green-800' },
  voice: { label: 'Voice', icon: '📞', color: 'bg-orange-100 text-orange-800' },
};

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, 4) + '****' + phone.slice(-3);
}

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function ConversationDetailPage({ params }: Props) {
  const { org } = await requireUserWithOrg();
  const { sessionId } = await params;

  // Fetch session with turns
  const session = await prisma.conversationSession.findFirst({
    where: {
      id: sessionId,
      orgId: org.id, // Ensure user can only see their org's conversations
    },
    include: {
      turns: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!session) {
    notFound();
  }

  const channelConfig = CHANNEL_CONFIG[session.channel] || CHANNEL_CONFIG.sms;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/app/conversations"
          className="text-blue-600 hover:underline text-sm"
        >
          ← Back to Conversations
        </Link>
      </div>

      {/* Session Info */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{channelConfig.icon}</span>
            <div>
              <h1 className="text-xl font-bold">{maskPhone(session.contactKey)}</h1>
              <p className="text-gray-600">
                Started {formatTime(session.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${channelConfig.color}`}>
              {channelConfig.label}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              session.status === 'active' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {session.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div>
            <div className="text-sm text-gray-500">Channel</div>
            <div className="font-medium capitalize">{session.channel}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Messages</div>
            <div className="font-medium">{session.turns.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Last Activity</div>
            <div className="font-medium">{formatTime(session.lastActiveAt)}</div>
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Conversation</h2>
        </div>
        <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
          {session.turns.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No messages in this conversation.
            </div>
          ) : (
            session.turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex ${turn.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    turn.role === 'user'
                      ? 'bg-gray-100 text-gray-900'
                      : turn.role === 'assistant'
                      ? 'bg-blue-600 text-white'
                      : 'bg-yellow-100 text-yellow-900'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap">{turn.text}</div>
                  <div
                    className={`text-xs mt-1 ${
                      turn.role === 'assistant' ? 'text-blue-200' : 'text-gray-500'
                    }`}
                  >
                    {formatTime(turn.createdAt)} • {turn.role}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

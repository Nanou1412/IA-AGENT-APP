/**
 * Admin Conversation Detail Page
 * 
 * Displays full conversation history with all turns and engine runs.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export const metadata = {
  title: "Conversation Detail - Admin",
};

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function ConversationDetailPage({ params }: Props) {
  await requireAdmin();
  const { sessionId } = await params;

  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    include: {
      turns: {
        orderBy: { createdAt: "asc" },
      },
      engineRuns: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!session) {
    notFound();
  }

  // Get org info
  const org = await prisma.org.findUnique({
    where: { id: session.orgId },
    select: { id: true, name: true },
  });

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      completed: "bg-blue-100 text-blue-800",
      handoff: "bg-purple-100 text-purple-800",
      expired: "bg-gray-100 text-gray-600",
      blocked: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getChannelBadge = (channel: string) => {
    const colors: Record<string, string> = {
      sms: "bg-blue-50 text-blue-700",
      whatsapp: "bg-green-50 text-green-700",
      voice: "bg-orange-50 text-orange-700",
      web: "bg-purple-50 text-purple-700",
    };
    return colors[channel] || "bg-gray-50 text-gray-700";
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      user: "bg-blue-100 text-blue-800",
      assistant: "bg-green-100 text-green-800",
      system: "bg-gray-100 text-gray-800",
    };
    return colors[role] || "bg-gray-100 text-gray-800";
  };

  const getRunStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: "bg-green-100 text-green-800",
      blocked: "bg-red-100 text-red-800",
      error: "bg-red-100 text-red-800",
      timeout: "bg-yellow-100 text-yellow-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Calculate stats
  const totalTokens = session.engineRuns.reduce(
    (sum, run) => sum + (run.inputTokens || 0) + (run.outputTokens || 0),
    0
  );
  const totalCost = session.engineRuns.reduce(
    (sum, run) => sum + (run.costUsd || 0),
    0
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Conversation Detail</h1>
          <p className="text-gray-500 font-mono text-sm">{session.id}</p>
        </div>
        <Link href="/admin/conversations" className="text-blue-600 hover:text-blue-800">
          ← Back to Conversations
        </Link>
      </div>

      {/* Session Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Organization</p>
            <p className="font-medium">
              <Link href={`/admin/orgs/${org?.id}`} className="text-blue-600 hover:underline">
                {org?.name || "Unknown"}
              </Link>
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Channel</p>
            <span className={`px-2 py-1 text-xs rounded-full ${getChannelBadge(session.channel)}`}>
              {session.channel}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(session.status)}`}>
              {session.status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500">Contact</p>
            <p className="font-mono text-sm">{session.contactKey}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="text-sm">{formatDate(session.createdAt)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Active</p>
            <p className="text-sm">{formatDate(session.lastActiveAt)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Turns</p>
            <p className="font-medium">{session.turns.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Engine Runs</p>
            <p className="font-medium">{session.engineRuns.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversation Thread */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Conversation Thread</h2>
            <p className="text-sm text-gray-500">{session.turns.length} messages</p>
          </div>
          <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
            {session.turns.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No messages yet</p>
            ) : (
              session.turns.map((turn) => (
                <div
                  key={turn.id}
                  className={`p-3 rounded-lg ${
                    turn.role === "user"
                      ? "bg-blue-50 ml-8"
                      : turn.role === "assistant"
                      ? "bg-green-50 mr-8"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs rounded ${getRoleBadge(turn.role)}`}>
                      {turn.role}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(turn.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Engine Runs */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Engine Runs</h2>
            <p className="text-sm text-gray-500">
              {totalTokens.toLocaleString()} tokens · ${totalCost.toFixed(4)} total cost
            </p>
          </div>
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {session.engineRuns.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No engine runs</p>
            ) : (
              session.engineRuns.map((run) => (
                <div key={run.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getRunStatusBadge(run.status)}`}
                    >
                      {run.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(run.createdAt)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Model:</span>{" "}
                      <span className="font-mono text-xs">{run.modelUsed}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Duration:</span>{" "}
                      {formatDuration(run.durationMs)}
                    </div>
                    <div>
                      <span className="text-gray-500">Tokens:</span>{" "}
                      {(run.inputTokens || 0) + (run.outputTokens || 0)}
                    </div>
                    <div>
                      <span className="text-gray-500">Cost:</span>{" "}
                      ${(run.costUsd || 0).toFixed(4)}
                    </div>
                  </div>
                  {run.blockedBy && (
                    <p className="text-sm text-red-600 mt-2">
                      Blocked by: {run.blockedBy}
                    </p>
                  )}
                  {run.errorMessage && (
                    <p className="text-sm text-red-600 mt-2">
                      Error: {run.errorMessage}
                    </p>
                  )}
                  {run.decision && Object.keys(run.decision as object).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                        View Decision
                      </summary>
                      <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(run.decision, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      {session.metadata && Object.keys(session.metadata as object).length > 0 && (
        <div className="bg-white rounded-lg shadow mt-6">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Session Metadata</h2>
          </div>
          <div className="p-4">
            <pre className="text-sm bg-gray-50 p-4 rounded overflow-x-auto">
              {JSON.stringify(session.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

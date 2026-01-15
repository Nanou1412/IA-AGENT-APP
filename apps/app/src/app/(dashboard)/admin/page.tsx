import Link from 'next/link';
import { Button } from '@repo/ui';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export default async function AdminPage() {
  await requireAdmin();

  // Get quick stats
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalOrgs,
    pendingApprovals,
    totalUsers,
    activeSessions,
    messagesLast24h,
    callsLast24h,
    ordersLast24h,
    errorsLast24h,
  ] = await Promise.all([
    prisma.org.count(),
    prisma.orgSettings.count({ where: { sandboxStatus: 'ready_for_review' } }),
    prisma.user.count(),
    prisma.conversationSession.count({ where: { status: 'active' } }),
    prisma.messageLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.callLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.order.count({ where: { createdAt: { gte: last24h } } }),
    prisma.engineRun.count({ where: { createdAt: { gte: last24h }, status: { in: ['error', 'blocked'] } } }),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
        <p className="text-gray-600">Manage organisations, templates, and system settings.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Orgs</p>
          <p className="text-2xl font-bold">{totalOrgs}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingApprovals}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Users</p>
          <p className="text-2xl font-bold">{totalUsers}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Active Sessions</p>
          <p className="text-2xl font-bold text-green-600">{activeSessions}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Messages 24h</p>
          <p className="text-2xl font-bold">{messagesLast24h}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Calls 24h</p>
          <p className="text-2xl font-bold">{callsLast24h}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Orders 24h</p>
          <p className="text-2xl font-bold">{ordersLast24h}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-xs text-gray-500">Errors 24h</p>
          <p className="text-2xl font-bold text-red-600">{errorsLast24h}</p>
        </div>
      </div>

      {/* Admin Sections */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">🏢 Organisations</h3>
          <p className="text-sm text-gray-600 mb-4">Manage orgs, sandbox status, approvals.</p>
          <Link href="/admin/orgs">
            <Button variant="primary" size="sm">View Orgs</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">🏭 Industries</h3>
          <p className="text-sm text-gray-600 mb-4">Industry configurations and rules.</p>
          <Link href="/admin/industries">
            <Button variant="outline" size="sm">View Industries</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">📄 Templates</h3>
          <p className="text-sm text-gray-600 mb-4">Versioned agent templates.</p>
          <Link href="/admin/templates">
            <Button variant="outline" size="sm">View Templates</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">💬 Messaging</h3>
          <p className="text-sm text-gray-600 mb-4">SMS/WhatsApp endpoints and logs.</p>
          <Link href="/admin/messaging">
            <Button variant="outline" size="sm">View Messaging</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">📞 Voice</h3>
          <p className="text-sm text-gray-600 mb-4">Voice endpoints and call logs.</p>
          <Link href="/admin/voice">
            <Button variant="outline" size="sm">View Voice</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">👤 Users</h3>
          <p className="text-sm text-gray-600 mb-4">Manage user accounts and memberships.</p>
          <Link href="/admin/users">
            <Button variant="outline" size="sm">View Users</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">📋 Audit Logs</h3>
          <p className="text-sm text-gray-600 mb-4">System activity and action history.</p>
          <Link href="/admin/audit">
            <Button variant="outline" size="sm">View Logs</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">🔧 Debug</h3>
          <p className="text-sm text-gray-600 mb-4">System diagnostics and debugging tools.</p>
          <Link href="/admin/debug">
            <Button variant="outline" size="sm">Debug Tools</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">💬 Conversations</h3>
          <p className="text-sm text-gray-600 mb-4">View all conversation sessions and history.</p>
          <Link href="/admin/conversations">
            <Button variant="outline" size="sm">View Conversations</Button>
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="font-semibold mb-2">🚨 Kill Switches</h3>
          <p className="text-sm text-gray-600 mb-4">Emergency controls to disable features.</p>
          <Link href="/admin/kill-switches">
            <Button variant="outline" size="sm">Manage Switches</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

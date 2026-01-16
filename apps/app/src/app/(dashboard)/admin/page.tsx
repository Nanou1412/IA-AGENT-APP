import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { StatCard, ActionCard } from '@/components/ui/admin-card';

export default async function AdminPage() {
  await requireAdmin();

  // Get quick stats
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const [
    totalOrgs,
    pendingApprovals,
    totalUsers,
    activeSessions,
    messagesLast24h,
    messagesLast48h,
    callsLast24h,
    callsLast48h,
    ordersLast24h,
    ordersLast48h,
    errorsLast24h,
  ] = await Promise.all([
    prisma.org.count(),
    prisma.orgSettings.count({ where: { sandboxStatus: 'ready_for_review' } }),
    prisma.user.count(),
    prisma.conversationSession.count({ where: { status: 'active' } }),
    prisma.messageLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.messageLog.count({ where: { createdAt: { gte: last48h, lt: last24h } } }),
    prisma.callLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.callLog.count({ where: { createdAt: { gte: last48h, lt: last24h } } }),
    prisma.order.count({ where: { createdAt: { gte: last24h } } }),
    prisma.order.count({ where: { createdAt: { gte: last48h, lt: last24h } } }),
    prisma.engineRun.count({ where: { createdAt: { gte: last24h }, status: { in: ['error', 'blocked'] } } }),
  ]);

  // Calculate trends (percentage change)
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? { value: 100, isPositive: true } : undefined;
    const change = ((current - previous) / previous) * 100;
    return { value: Math.round(Math.abs(change)), isPositive: change >= 0 };
  };

  const messagesTrend = calculateTrend(messagesLast24h, messagesLast48h);
  const callsTrend = calculateTrend(callsLast24h, callsLast48h);
  const ordersTrend = calculateTrend(ordersLast24h, ordersLast48h);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your platform metrics and management.</p>
        </div>
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm"
        >
          <span>📈</span>
          Analytics Dashboard
        </Link>
      </div>

      {/* Quick Stats - Primary */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Platform Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Organisations"
            value={totalOrgs}
            icon="🏢"
            href="/admin/orgs"
          />
          <StatCard
            title="Pending Approvals"
            value={pendingApprovals}
            icon="⏳"
            variant={pendingApprovals > 0 ? "warning" : "default"}
            href="/admin/orgs?status=pending"
          />
          <StatCard
            title="Users"
            value={totalUsers}
            icon="👥"
            href="/admin/users"
          />
          <StatCard
            title="Active Sessions"
            value={activeSessions}
            icon="🟢"
            variant="success"
            href="/admin/conversations"
          />
        </div>
      </section>

      {/* Activity Stats - 24h */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Last 24 Hours</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Messages"
            value={messagesLast24h}
            icon="💬"
            trend={messagesTrend}
            variant="info"
            href="/admin/messaging"
          />
          <StatCard
            title="Calls"
            value={callsLast24h}
            icon="📞"
            trend={callsTrend}
            variant="info"
            href="/admin/voice"
          />
          <StatCard
            title="Orders"
            value={ordersLast24h}
            icon="🛒"
            trend={ordersTrend}
            variant="success"
            href="/admin/orders"
          />
          <StatCard
            title="Errors"
            value={errorsLast24h}
            icon="⚠️"
            variant={errorsLast24h > 0 ? "danger" : "default"}
            href="/admin/debug"
          />
        </div>
      </section>

      {/* Quick Actions - Main Features */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Core Management</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ActionCard
            icon="🏢"
            title="Organisations"
            description="Manage orgs, sandbox status, approvals."
            href="/admin/orgs"
            badge={pendingApprovals > 0 ? `${pendingApprovals} pending` : undefined}
          />
          <ActionCard
            icon="📞"
            title="Endpoints"
            description="Twilio phone → org routing."
            href="/admin/endpoints"
            variant="primary"
          />
          <ActionCard
            icon="🛒"
            title="Orders"
            description="View all orders across orgs."
            href="/admin/orders"
            variant="orange"
          />
          <ActionCard
            icon="📊"
            title="Usage & Costs"
            description="Monitor costs, budgets, and consumption."
            href="/admin/usage"
            variant="success"
          />
        </div>
      </section>

      {/* Financial */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Financial</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionCard
            icon="💳"
            title="Billing"
            description="Subscriptions, payments, MRR."
            href="/admin/billing"
            variant="purple"
          />
          <ActionCard
            icon="📈"
            title="Analytics"
            description="Charts, funnels, and trends."
            href="/admin/analytics"
            variant="primary"
          />
          <ActionCard
            icon="📋"
            title="Audit Logs"
            description="System activity and action history."
            href="/admin/audit"
          />
        </div>
      </section>

      {/* Communication */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Communication</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionCard
            icon="💬"
            title="Messaging"
            description="SMS/WhatsApp endpoints and logs."
            href="/admin/messaging"
          />
          <ActionCard
            icon="📞"
            title="Voice"
            description="Voice endpoints and call logs."
            href="/admin/voice"
          />
          <ActionCard
            icon="🗣️"
            title="Conversations"
            description="View all conversation sessions."
            href="/admin/conversations"
          />
        </div>
      </section>

      {/* Configuration */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Configuration</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ActionCard
            icon="📄"
            title="Templates"
            description="Versioned agent templates."
            href="/admin/templates"
          />
          <ActionCard
            icon="🏭"
            title="Industries"
            description="Industry configurations and rules."
            href="/admin/industries"
          />
          <ActionCard
            icon="👤"
            title="Users"
            description="Manage user accounts."
            href="/admin/users"
          />
          <ActionCard
            icon="🔧"
            title="Debug Tools"
            description="System diagnostics."
            href="/admin/debug"
          />
        </div>
      </section>

      {/* Emergency */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Emergency Controls</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <ActionCard
            icon="🚨"
            title="Kill Switches"
            description="Emergency controls to disable features globally."
            href="/admin/kill-switches"
            variant="warning"
          />
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <span className="text-3xl">📖</span>
              <div>
                <h3 className="font-semibold text-gray-900">Operations Documentation</h3>
                <p className="text-sm text-gray-500 mt-1">Incident playbooks and monitoring guides.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/docs/ops/MONITORING.md" target="_blank" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 transition-colors">
                Monitoring
              </a>
              <a href="/docs/ops/KILL_SWITCHES.md" target="_blank" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 transition-colors">
                Kill Switches
              </a>
              <a href="/docs/ops/INCIDENT_PAYMENT_FAILURES.md" target="_blank" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 transition-colors">
                Payment Failures
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import Link from 'next/link';
import { Button } from '@repo/ui';
import { requireAdmin } from '@/lib/session';

export default async function AdminPage() {
  await requireAdmin();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
        <p className="text-gray-600">Manage organisations, templates, and system settings.</p>
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
          <Link href="/admin/debug/stripe">
            <Button variant="outline" size="sm">Debug Tools</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

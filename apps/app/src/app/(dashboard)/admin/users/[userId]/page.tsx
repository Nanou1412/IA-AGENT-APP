/**
 * Admin User Detail Page
 * 
 * View and manage individual user details and memberships.
 */

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddUserToOrgForm } from '@/components/add-user-to-org-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { userId: string };
}

async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          org: {
            select: { id: true, name: true, industry: true },
          },
        },
      },
      sessions: {
        orderBy: { expires: 'desc' },
        take: 5,
      },
      accounts: {
        select: { provider: true, createdAt: true },
      },
    },
  });

  return user;
}

async function getAvailableOrgs(userId: string) {
  // Get orgs user is NOT already a member of
  const orgs = await prisma.org.findMany({
    where: {
      memberships: {
        none: {
          userId,
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return orgs;
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-800',
    manager: 'bg-blue-100 text-blue-800',
    staff: 'bg-gray-100 text-gray-800',
    admin: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
      {role}
    </span>
  );
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdmin();
  const user = await getUser(params.userId);

  if (!user) {
    notFound();
  }

  const availableOrgs = await getAvailableOrgs(user.id);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/users" className="text-blue-600 hover:underline text-sm">
          ← Back to Users
        </Link>
      </div>

      {/* User Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex items-start gap-4">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || 'User'}
              className="h-16 w-16 rounded-full"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-2xl text-gray-500 font-medium">
                {(user.name || user.email)[0].toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user.name || 'No name'}</h1>
            <p className="text-gray-600">{user.email}</p>
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              <span>
                Joined: {new Date(user.createdAt).toLocaleDateString('en-AU', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              {user.emailVerified ? (
                <span className="text-green-600">✓ Email verified</span>
              ) : (
                <span className="text-orange-500">Email not verified</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Linked Accounts */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Linked Accounts</h2>
        {user.accounts.length === 0 ? (
          <p className="text-gray-500 text-sm">No linked OAuth accounts</p>
        ) : (
          <div className="space-y-2">
            {user.accounts.map((account, index) => (
              <div key={index} className="flex items-center gap-3 text-sm">
                <span className="capitalize font-medium">{account.provider}</span>
                <span className="text-gray-500">
                  Linked {new Date(account.createdAt).toLocaleDateString('en-AU')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Organization Memberships */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Organization Memberships</h2>
        {user.memberships.length === 0 ? (
          <p className="text-gray-500 text-sm">No organization memberships</p>
        ) : (
          <div className="space-y-3">
            {user.memberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/orgs/${m.orgId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {m.org.name}
                  </Link>
                  <span className="text-sm text-gray-500">{m.org.industry}</span>
                </div>
                <div className="flex items-center gap-3">
                  <RoleBadge role={m.role} />
                  <span className="text-xs text-gray-400">
                    Since {new Date(m.createdAt).toLocaleDateString('en-AU')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add to Organization */}
        {availableOrgs.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Add to Organization</h3>
            <AddUserToOrgForm userId={user.id} availableOrgs={availableOrgs} />
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Recent Sessions</h2>
        {user.sessions.length === 0 ? (
          <p className="text-gray-500 text-sm">No active sessions</p>
        ) : (
          <div className="space-y-2">
            {user.sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-600">
                  {session.sessionToken.slice(0, 20)}...
                </span>
                <span className={`${new Date(session.expires) > new Date() ? 'text-green-600' : 'text-gray-400'}`}>
                  Expires: {new Date(session.expires).toLocaleString('en-AU')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 rounded-lg border border-red-200 p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Danger Zone</h2>
        <p className="text-sm text-red-700 mb-4">
          Deleting a user will remove all their data and cannot be undone.
        </p>
        <button
          type="button"
          disabled
          className="px-4 py-2 bg-red-100 text-red-400 rounded-lg cursor-not-allowed"
        >
          Delete User (Not Implemented)
        </button>
      </div>
    </div>
  );
}

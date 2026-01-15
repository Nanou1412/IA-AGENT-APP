'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addUserToOrg } from '@/actions/admin';

interface AddUserToOrgFormProps {
  userId: string;
  availableOrgs: Array<{ id: string; name: string }>;
}

export function AddUserToOrgForm({ userId, availableOrgs }: AddUserToOrgFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedOrg, setSelectedOrg] = useState('');
  const [role, setRole] = useState<'owner' | 'manager' | 'staff'>('staff');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    setMessage(null);
    startTransition(async () => {
      const result = await addUserToOrg({
        userId,
        orgId: selectedOrg,
        role,
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'User added to organization' });
        setSelectedOrg('');
        setRole('staff');
        router.refresh();
      }
    });
  };

  if (availableOrgs.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        User is already a member of all organizations
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="org" className="block text-sm font-medium text-gray-700 mb-1">
          Organization
        </label>
        <select
          id="org"
          value={selectedOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        >
          <option value="">Select organization...</option>
          {availableOrgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      <div className="w-32">
        <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as 'owner' | 'manager' | 'staff')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending || !selectedOrg}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Adding...' : 'Add'}
      </button>

      {message && (
        <div
          className={`w-full p-2 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function ConversationsFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChannelChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set('channel', value);
    } else {
      params.delete('channel');
    }
    params.delete('page');
    router.push(`/app/conversations?${params.toString()}`);
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    params.delete('page');
    router.push(`/app/conversations?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            defaultValue={searchParams.get('channel') || 'all'}
            onChange={(e) => handleChannelChange(e.target.value)}
          >
            <option value="all">All Channels</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voice">Voice</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            defaultValue={searchParams.get('status') || 'all'}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>
    </div>
  );
}

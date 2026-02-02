'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending_confirmation', label: 'Pending' },
  { value: 'pending_payment', label: 'Awaiting Payment' },
  { value: 'draft', label: 'Draft' },
  { value: 'expired', label: 'Expired' },
  { value: 'canceled', label: 'Canceled' },
];

export function OrdersFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');

  const handleSearch = (value: string) => {
    setSearch(value);
    // In a real app, this would trigger server-side filtering
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    // In a real app, this would trigger server-side filtering
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    router.push(`/app/orders?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by order ID, customer name, or phone..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div className="sm:w-48">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div className="sm:w-40">
          <select
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="pickup">By Pickup Time</option>
          </select>
        </div>
      </div>
    </div>
  );
}

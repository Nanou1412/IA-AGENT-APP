'use client';

import { useState, useTransition } from 'react';
import { updateOrgProfile } from '@/actions/settings';

const TIMEZONES = [
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
];

const INDUSTRIES = [
  'restaurant',
  'cafe',
  'retail',
  'healthcare',
  'salon',
  'automotive',
  'hospitality',
  'professional_services',
  'other',
];

interface OrgProfileFormProps {
  orgId: string;
  initialData: {
    name: string;
    industry: string;
    timezone: string;
  };
}

export function OrgProfileForm({ orgId, initialData }: OrgProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialData.name);
  const [industry, setIndustry] = useState(initialData.industry);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateOrgProfile({
        orgId,
        name,
        industry,
        timezone,
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Profile updated successfully' });
      }
    });
  };

  const hasChanges =
    name !== initialData.name ||
    industry !== initialData.industry ||
    timezone !== initialData.timezone;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Organization Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
          Industry
        </label>
        <select
          id="industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>
              {ind.charAt(0).toUpperCase() + ind.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
          Timezone
        </label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !hasChanges}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

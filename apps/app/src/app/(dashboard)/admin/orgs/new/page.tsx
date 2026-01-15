'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@repo/ui';
import { createOrganization } from '@/actions/admin';

const INDUSTRIES = [
  { value: 'restaurant', label: 'Restaurant / Takeaway' },
  { value: 'retail', label: 'Retail' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'other', label: 'Other' },
];

const TIMEZONES = [
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
];

export default function NewOrganizationPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    industry: 'restaurant',
    timezone: 'Australia/Sydney',
    ownerEmail: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createOrganization(formData);
      
      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.success && result.orgId) {
        router.push(`/admin/orgs/${result.orgId}`);
      }
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/orgs" className="text-blue-600 hover:underline text-sm">
          ← Back to Organisations
        </Link>
        <h1 className="text-3xl font-bold mt-2">Create Organisation</h1>
        <p className="text-gray-600">Add a new organisation to the platform.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Organisation Name */}
        <div className="mb-6">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Organisation Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            minLength={2}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Mario's Pizza"
          />
        </div>

        {/* Industry */}
        <div className="mb-6">
          <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-2">
            Industry *
          </label>
          <select
            id="industry"
            name="industry"
            value={formData.industry}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {ind.label}
              </option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div className="mb-6">
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Owner Email */}
        <div className="mb-6">
          <label htmlFor="ownerEmail" className="block text-sm font-medium text-gray-700 mb-2">
            Owner Email *
          </label>
          <input
            type="email"
            id="ownerEmail"
            name="ownerEmail"
            value={formData.ownerEmail}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="owner@example.com"
          />
          <p className="mt-1 text-sm text-gray-500">
            This person will be the organisation owner. An account will be created if needed.
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link href="/admin/orgs">
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Link>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Organisation'}
          </Button>
        </div>
      </form>
    </div>
  );
}

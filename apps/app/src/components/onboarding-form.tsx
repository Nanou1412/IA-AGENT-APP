'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@repo/ui';
import { createOrg } from '@/actions/onboarding';
import { URLS } from '@/lib/urls';

interface OnboardingFormProps {
  cookieIndustry?: string;
}

const INDUSTRY_NAMES: Record<string, string> = {
  restaurant: 'Restaurant',
  hotel: 'Hotel & Accommodation',
  tradie: 'Trades & Services',
};

const INDUSTRY_TIMEZONES: Record<string, string> = {
  restaurant: 'Australia/Sydney',
  hotel: 'Australia/Sydney',
  tradie: 'Australia/Sydney',
};

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Hobart',
  'Australia/Darwin',
];

export function OnboardingForm({ cookieIndustry }: OnboardingFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Priority: query param > cookie > localStorage
    const queryIndustry = searchParams.get('industry');
    const localIndustry =
      typeof window !== 'undefined'
        ? localStorage.getItem('preferred_industry')
        : null;

    const selectedIndustry = queryIndustry || cookieIndustry || localIndustry;
    setIndustry(selectedIndustry);

    if (selectedIndustry) {
      setTimezone(INDUSTRY_TIMEZONES[selectedIndustry] || 'Australia/Sydney');
    }
  }, [searchParams, cookieIndustry]);

  const handleConfirmIndustry = () => {
    if (industry) {
      setStep(2);
    }
  };

  const handleChangeIndustry = () => {
    localStorage.removeItem('preferred_industry');
    window.location.href = URLS.marketing.industries;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!industry || !orgName.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createOrg({
        name: orgName.trim(),
        industry,
        timezone,
      });

      if (result?.error) {
        setError(result.error);
        setIsSubmitting(false);
      }
      // If successful, the action redirects to /app
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Step 1: Confirm Industry
  if (step === 1) {
    if (!industry) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md mx-auto text-center p-8 bg-white rounded-xl shadow-sm border">
            <h1 className="text-2xl font-bold mb-4">No Industry Selected</h1>
            <p className="text-gray-600 mb-6">
              Please select an industry to get started with your AI agent.
            </p>
            <Button onClick={handleChangeIndustry} variant="primary">
              Choose Industry
            </Button>
          </div>
        </div>
      );
    }

    const industryName = INDUSTRY_NAMES[industry] || industry;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-xl shadow-sm border">
          <div className="text-5xl mb-4">
            {industry === 'restaurant' && '🍽️'}
            {industry === 'hotel' && '🏨'}
            {industry === 'tradie' && '🔧'}
          </div>
          <h1 className="text-2xl font-bold mb-2">Step 1: Confirm Industry</h1>
          <p className="text-gray-600 mb-6">
            You&apos;ve selected <strong>{industryName}</strong> as your
            industry.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              Your AI agent will be pre-configured with tools and templates
              optimised for {industryName.toLowerCase()} businesses.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleConfirmIndustry}
              variant="primary"
              size="lg"
              className="w-full"
            >
              Continue
            </Button>
            <Button
              onClick={handleChangeIndustry}
              variant="outline"
              className="w-full"
            >
              Change Industry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Org Details
  const industryName = INDUSTRY_NAMES[industry!] || industry;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md mx-auto p-8 bg-white rounded-xl shadow-sm border">
        <h1 className="text-2xl font-bold mb-2 text-center">
          Step 2: Organisation Details
        </h1>
        <p className="text-gray-600 mb-6 text-center">
          Set up your {industryName} business
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name *
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g., The Cozy Cafe"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Industry:</span>
              <span className="font-medium">{industryName}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={isSubmitting || !orgName.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Organisation'}
            </Button>
            <Button
              type="button"
              onClick={() => setStep(1)}
              variant="outline"
              className="w-full"
            >
              Back
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

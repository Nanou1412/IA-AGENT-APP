'use client';

import { useState, useEffect } from 'react';

const INDUSTRY_NAMES: Record<string, string> = {
  restaurant: 'Restaurant',
  hotel: 'Hotel & Accommodation',
  tradie: 'Trades & Services',
};

export function ConfirmedIndustry() {
  const [industry, setIndustry] = useState<string | null>(null);

  useEffect(() => {
    const confirmed = localStorage.getItem('confirmed_industry');
    setIndustry(confirmed);
  }, []);

  if (!industry) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">
          No industry confirmed yet.{' '}
          <a href="/app/onboarding" className="text-blue-600 hover:underline">
            Complete onboarding
          </a>
        </p>
      </div>
    );
  }

  const industryName = INDUSTRY_NAMES[industry] || industry;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">
          {industry === 'restaurant' && '🍽️'}
          {industry === 'hotel' && '🏨'}
          {industry === 'tradie' && '🔧'}
        </span>
        <div>
          <p className="font-medium text-blue-900">Confirmed Industry</p>
          <p className="text-blue-700">{industryName}</p>
        </div>
      </div>
    </div>
  );
}

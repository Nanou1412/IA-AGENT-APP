import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getPreferredIndustryFromCookie } from '@/lib/industry';
import { getUserWithOrg } from '@/lib/session';
import { OnboardingForm } from '@/components/onboarding-form';

export const metadata: Metadata = {
  title: 'Onboarding | IA Agent App',
  description: 'Complete your setup to get started with your AI agent.',
};

export default async function OnboardingPage() {
  // Check if user already has an org
  const { membership } = await getUserWithOrg();

  if (membership) {
    redirect('/app');
  }

  const cookieIndustry = getPreferredIndustryFromCookie();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p>Loading...</p>
        </div>
      }
    >
      <OnboardingForm cookieIndustry={cookieIndustry} />
    </Suspense>
  );
}

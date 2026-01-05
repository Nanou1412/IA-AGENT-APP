'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@repo/ui';
import { APP_URL } from '@/lib/config';

interface GetStartedButtonProps {
  industry: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function GetStartedButton({
  industry,
  children,
  variant = 'primary',
  size = 'lg',
  className,
}: GetStartedButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    // Set cookie (expires in 30 days)
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    document.cookie = `preferred_industry=${industry}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

    // Set localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_industry', industry);
    }

    // Navigate to app onboarding
    const onboardingUrl = `${APP_URL}/app/onboarding?industry=${encodeURIComponent(industry)}`;
    window.location.href = onboardingUrl;
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick}>
      {children}
    </Button>
  );
}

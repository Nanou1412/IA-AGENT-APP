/**
 * Centralized URL configuration
 * Uses environment variables with sensible defaults for development
 */

export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3000';

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

export const URLS = {
  marketing: {
    home: MARKETING_URL,
    industries: `${MARKETING_URL}/industries`,
    restaurant: `${MARKETING_URL}/restaurant`,
    hotel: `${MARKETING_URL}/hotel`,
    tradie: `${MARKETING_URL}/tradie`,
  },
  app: {
    home: APP_URL,
    login: `${APP_URL}/login`,
    onboarding: `${APP_URL}/onboarding`,
    sandboxIntro: `${APP_URL}/app/onboarding/sandbox-intro`,
    dashboard: `${APP_URL}/app`,
    admin: `${APP_URL}/admin`,
  },
} as const;

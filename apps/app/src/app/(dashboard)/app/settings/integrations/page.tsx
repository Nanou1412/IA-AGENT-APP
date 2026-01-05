/**
 * Integrations Settings Page
 * 
 * Allows org owners/managers to connect external services like Google Calendar.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { IntegrationStatus } from '@prisma/client';
import { GoogleIntegrationCard } from './google-integration-card';
import { parseBookingConfig } from '@/lib/google';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Get user's org membership
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ['owner', 'manager'] },
    },
    include: {
      org: {
        include: {
          settings: true,
        },
      },
    },
  });

  if (!membership?.org) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Integrations</h1>
        <p className="text-gray-600">
          You don&apos;t have access to any organization. Please contact support.
        </p>
      </div>
    );
  }

  const { org } = membership;
  const orgId = org.id;

  // Get Google integration status
  const googleIntegration = await prisma.orgIntegration.findUnique({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
  });

  // Get booking config
  const bookingConfig = parseBookingConfig(org.settings?.bookingConfig);

  // Get available calendars if connected
  let calendars: { id: string; summary: string; primary?: boolean }[] = [];
  if (googleIntegration?.status === IntegrationStatus.connected) {
    try {
      const { listCalendars } = await import('@/lib/google/calendar');
      const result = await listCalendars(orgId);
      if (result.success) {
        calendars = result.data.map(cal => ({
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary,
        }));
      }
    } catch (e) {
      console.error('Failed to fetch calendars:', e);
    }
  }

  const googleEmail = googleIntegration?.metadata && 
    typeof googleIntegration.metadata === 'object' &&
    'googleUserEmail' in googleIntegration.metadata
      ? (googleIntegration.metadata as { googleUserEmail?: string }).googleUserEmail
      : undefined;

  const selectedCalendarId = googleIntegration?.metadata &&
    typeof googleIntegration.metadata === 'object' &&
    'calendarId' in googleIntegration.metadata
      ? (googleIntegration.metadata as { calendarId?: string }).calendarId
      : 'primary';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Integrations</h1>
      <p className="text-gray-600 mb-6">
        Connect external services to enable additional features.
      </p>

      {/* Success/Error messages */}
      {searchParams.connected === 'google' && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">
            ✓ Google Calendar connected successfully!
          </p>
        </div>
      )}
      {searchParams.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">
            Failed to connect: {formatError(searchParams.error)}
          </p>
        </div>
      )}

      {/* Google Calendar Integration */}
      <Suspense fallback={<div>Loading...</div>}>
        <GoogleIntegrationCard
          orgId={orgId}
          connected={googleIntegration?.status === IntegrationStatus.connected}
          status={googleIntegration?.status || null}
          googleEmail={googleEmail}
          calendars={calendars}
          selectedCalendarId={selectedCalendarId}
          bookingEnabled={bookingConfig.enabled}
          timezone={bookingConfig.calendar.timezone}
        />
      </Suspense>
    </div>
  );
}

function formatError(error: string): string {
  const errorMessages: Record<string, string> = {
    unauthorized: 'You must be logged in.',
    forbidden: 'You don\'t have permission to connect this integration.',
    invalid_state: 'The connection request expired. Please try again.',
    token_exchange_failed: 'Failed to complete Google authorization.',
    config_error: 'Google OAuth is not configured on this server.',
    internal_error: 'An unexpected error occurred.',
  };
  return errorMessages[error] || error;
}

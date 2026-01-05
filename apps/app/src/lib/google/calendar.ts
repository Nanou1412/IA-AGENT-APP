/**
 * Google Calendar Client
 * 
 * Provides authenticated access to Google Calendar API.
 * Handles automatic token refresh when tokens expire.
 * 
 * IMPORTANT: Never log tokens!
 */

import { prisma } from '@/lib/prisma';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { IntegrationStatus, BookingAction } from '@prisma/client';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

export interface AvailabilityResult {
  available: boolean;
  busySlots: TimeSlot[];
  nextAvailable?: Date;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  timeZone?: string;
  location?: string;
}

export interface CalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  status: string;
  location?: string;
}

export interface GoogleCalendarError {
  code: 'not_connected' | 'token_refresh_failed' | 'api_error' | 'invalid_config';
  message: string;
  details?: unknown;
}

export type CalendarResult<T> = 
  | { success: true; data: T }
  | { success: false; error: GoogleCalendarError };

// ============================================================================
// Configuration
// ============================================================================

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Refresh tokens if they expire within this many minutes
const TOKEN_REFRESH_BUFFER_MINUTES = 2;

// ============================================================================
// Token Management
// ============================================================================

interface TokenData {
  accessToken: string;
  calendarId: string;
  timeZone: string;
  googleEmail?: string;
}

/**
 * Get valid access token for an org, refreshing if needed
 */
async function getValidToken(orgId: string): Promise<CalendarResult<TokenData>> {
  const integration = await prisma.orgIntegration.findUnique({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
  });

  if (!integration || integration.status !== IntegrationStatus.connected) {
    return {
      success: false,
      error: {
        code: 'not_connected',
        message: 'Google Calendar is not connected for this organization',
      },
    };
  }

  if (!integration.accessTokenEncrypted) {
    return {
      success: false,
      error: {
        code: 'not_connected',
        message: 'No access token available',
      },
    };
  }

  // Check if token needs refresh
  const now = new Date();
  const refreshBuffer = TOKEN_REFRESH_BUFFER_MINUTES * 60 * 1000;
  const needsRefresh = integration.tokenExpiry && 
    integration.tokenExpiry.getTime() < now.getTime() + refreshBuffer;

  if (needsRefresh && integration.refreshTokenEncrypted) {
    const refreshResult = await refreshAccessToken(orgId, integration.refreshTokenEncrypted);
    if (!refreshResult.success) {
      return refreshResult;
    }
    // Return the new token
    return {
      success: true,
      data: {
        accessToken: refreshResult.data.accessToken,
        calendarId: getCalendarId(integration.metadata),
        timeZone: getTimeZone(integration.metadata),
        googleEmail: getGoogleEmail(integration.metadata),
      },
    };
  }

  // Token is still valid
  const accessToken = decryptToken(integration.accessTokenEncrypted);
  if (!accessToken) {
    return {
      success: false,
      error: {
        code: 'not_connected',
        message: 'Failed to decrypt access token',
      },
    };
  }

  return {
    success: true,
    data: {
      accessToken,
      calendarId: getCalendarId(integration.metadata),
      timeZone: getTimeZone(integration.metadata),
      googleEmail: getGoogleEmail(integration.metadata),
    },
  };
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(
  orgId: string,
  refreshTokenEncrypted: string
): Promise<CalendarResult<{ accessToken: string }>> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: {
        code: 'invalid_config',
        message: 'Google OAuth not configured',
      },
    };
  }

  const refreshToken = decryptToken(refreshTokenEncrypted);
  if (!refreshToken) {
    return {
      success: false,
      error: {
        code: 'token_refresh_failed',
        message: 'Failed to decrypt refresh token',
      },
    };
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('[google-calendar] Token refresh failed:', response.status);
      
      // Mark integration as error state
      await prisma.orgIntegration.update({
        where: {
          orgId_provider: {
            orgId,
            provider: 'google',
          },
        },
        data: {
          status: IntegrationStatus.error,
        },
      });

      return {
        success: false,
        error: {
          code: 'token_refresh_failed',
          message: 'Failed to refresh access token',
        },
      };
    }

    const tokens = await response.json();
    const newAccessToken = tokens.access_token;
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    // Update stored tokens
    await prisma.orgIntegration.update({
      where: {
        orgId_provider: {
          orgId,
          provider: 'google',
        },
      },
      data: {
        accessTokenEncrypted: encryptToken(newAccessToken),
        tokenExpiry,
        // Google may issue a new refresh token
        ...(tokens.refresh_token && {
          refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        }),
      },
    });

    return {
      success: true,
      data: { accessToken: newAccessToken },
    };
  } catch (error) {
    console.error('[google-calendar] Token refresh error:', error);
    return {
      success: false,
      error: {
        code: 'token_refresh_failed',
        message: 'Token refresh request failed',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

// ============================================================================
// Metadata Helpers
// ============================================================================

function getCalendarId(metadata: unknown): string {
  if (metadata && typeof metadata === 'object' && 'calendarId' in metadata) {
    return (metadata as { calendarId?: string }).calendarId || 'primary';
  }
  return 'primary';
}

function getTimeZone(metadata: unknown): string {
  if (metadata && typeof metadata === 'object' && 'timezone' in metadata) {
    return (metadata as { timezone?: string }).timezone || 'Australia/Perth';
  }
  return 'Australia/Perth';
}

function getGoogleEmail(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === 'object' && 'googleUserEmail' in metadata) {
    return (metadata as { googleUserEmail?: string }).googleUserEmail;
  }
  return undefined;
}

// ============================================================================
// Calendar API Methods
// ============================================================================

/**
 * List all calendars accessible by the connected account
 */
export async function listCalendars(orgId: string): Promise<CalendarResult<CalendarInfo[]>> {
  const tokenResult = await getValidToken(orgId);
  if (!tokenResult.success) {
    return tokenResult;
  }

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`, {
      headers: {
        Authorization: `Bearer ${tokenResult.data.accessToken}`,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'api_error',
          message: 'Failed to list calendars',
          details: { status: response.status },
        },
      };
    }

    const data = await response.json();
    const calendars: CalendarInfo[] = (data.items || []).map((cal: Record<string, unknown>) => ({
      id: cal.id as string,
      summary: cal.summary as string,
      description: cal.description as string | undefined,
      timeZone: cal.timeZone as string | undefined,
      primary: cal.primary as boolean | undefined,
      accessRole: cal.accessRole as string | undefined,
    }));

    return { success: true, data: calendars };
  } catch (error) {
    console.error('[google-calendar] listCalendars error:', error);
    return {
      success: false,
      error: {
        code: 'api_error',
        message: 'Failed to list calendars',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

/**
 * Check availability using freebusy query
 */
export async function checkAvailability(
  orgId: string,
  startTime: Date,
  endTime: Date
): Promise<CalendarResult<AvailabilityResult>> {
  const tokenResult = await getValidToken(orgId);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const { accessToken, calendarId, timeZone } = tokenResult.data;

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        timeZone,
        items: [{ id: calendarId }],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'api_error',
          message: 'Failed to check availability',
          details: { status: response.status },
        },
      };
    }

    const data = await response.json();
    const calendarBusy = data.calendars?.[calendarId]?.busy || [];
    
    const busySlots: TimeSlot[] = calendarBusy.map((slot: FreeBusySlot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }));

    // Check if the requested time range is available
    const available = busySlots.length === 0;

    return {
      success: true,
      data: {
        available,
        busySlots,
        nextAvailable: available ? startTime : findNextAvailable(endTime, busySlots),
      },
    };
  } catch (error) {
    console.error('[google-calendar] checkAvailability error:', error);
    return {
      success: false,
      error: {
        code: 'api_error',
        message: 'Failed to check availability',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

/**
 * Find next available slot after busy periods
 */
function findNextAvailable(after: Date, busySlots: TimeSlot[]): Date | undefined {
  if (busySlots.length === 0) {
    return after;
  }
  
  // Sort by end time
  const sorted = [...busySlots].sort((a, b) => a.end.getTime() - b.end.getTime());
  const lastBusy = sorted[sorted.length - 1];
  
  if (lastBusy && lastBusy.end) {
    return new Date(lastBusy.end);
  }
  
  return undefined;
}

/**
 * Create a calendar event
 */
export async function createEvent(
  orgId: string,
  params: CreateEventParams
): Promise<CalendarResult<CalendarEvent>> {
  const tokenResult = await getValidToken(orgId);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const { accessToken, calendarId, timeZone: defaultTimeZone } = tokenResult.data;
  const eventTimeZone = params.timeZone || defaultTimeZone;

  try {
    const eventBody: Record<string, unknown> = {
      summary: params.summary,
      description: params.description,
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone: eventTimeZone,
      },
      end: {
        dateTime: params.endTime.toISOString(),
        timeZone: eventTimeZone,
      },
    };

    if (params.location) {
      eventBody.location = params.location;
    }

    if (params.attendeeEmail) {
      eventBody.attendees = [{ email: params.attendeeEmail }];
    }

    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[google-calendar] createEvent failed:', errorData);
      return {
        success: false,
        error: {
          code: 'api_error',
          message: 'Failed to create event',
          details: { status: response.status, error: errorData },
        },
      };
    }

    const event = await response.json();
    return {
      success: true,
      data: event as CalendarEvent,
    };
  } catch (error) {
    console.error('[google-calendar] createEvent error:', error);
    return {
      success: false,
      error: {
        code: 'api_error',
        message: 'Failed to create event',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

/**
 * Update an existing calendar event
 */
export async function updateEvent(
  orgId: string,
  eventId: string,
  params: Partial<CreateEventParams>
): Promise<CalendarResult<CalendarEvent>> {
  const tokenResult = await getValidToken(orgId);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const { accessToken, calendarId, timeZone: defaultTimeZone } = tokenResult.data;

  try {
    const patchBody: Record<string, unknown> = {};

    if (params.summary) {
      patchBody.summary = params.summary;
    }
    if (params.description !== undefined) {
      patchBody.description = params.description;
    }
    if (params.startTime) {
      patchBody.start = {
        dateTime: params.startTime.toISOString(),
        timeZone: params.timeZone || defaultTimeZone,
      };
    }
    if (params.endTime) {
      patchBody.end = {
        dateTime: params.endTime.toISOString(),
        timeZone: params.timeZone || defaultTimeZone,
      };
    }
    if (params.location !== undefined) {
      patchBody.location = params.location;
    }

    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'api_error',
          message: 'Failed to update event',
          details: { status: response.status },
        },
      };
    }

    const event = await response.json();
    return {
      success: true,
      data: event as CalendarEvent,
    };
  } catch (error) {
    console.error('[google-calendar] updateEvent error:', error);
    return {
      success: false,
      error: {
        code: 'api_error',
        message: 'Failed to update event',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

/**
 * Delete (cancel) a calendar event
 */
export async function deleteEvent(
  orgId: string,
  eventId: string
): Promise<CalendarResult<{ deleted: true }>> {
  const tokenResult = await getValidToken(orgId);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const { accessToken, calendarId } = tokenResult.data;

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      return {
        success: false,
        error: {
          code: 'api_error',
          message: 'Failed to delete event',
          details: { status: response.status },
        },
      };
    }

    return {
      success: true,
      data: { deleted: true },
    };
  } catch (error) {
    console.error('[google-calendar] deleteEvent error:', error);
    return {
      success: false,
      error: {
        code: 'api_error',
        message: 'Failed to delete event',
        details: error instanceof Error ? error.message : undefined,
      },
    };
  }
}

/**
 * Get integration status for an org
 */
export async function getIntegrationStatus(orgId: string): Promise<{
  connected: boolean;
  status: IntegrationStatus | null;
  googleEmail?: string;
  calendarId?: string;
}> {
  const integration = await prisma.orgIntegration.findUnique({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
  });

  if (!integration) {
    return {
      connected: false,
      status: null,
    };
  }

  return {
    connected: integration.status === IntegrationStatus.connected,
    status: integration.status,
    googleEmail: getGoogleEmail(integration.metadata),
    calendarId: getCalendarId(integration.metadata),
  };
}

/**
 * Update calendar selection for an org
 */
export async function updateCalendarSelection(
  orgId: string,
  calendarId: string,
  timezone?: string
): Promise<CalendarResult<{ updated: true }>> {
  const integration = await prisma.orgIntegration.findUnique({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
  });

  if (!integration || integration.status !== IntegrationStatus.connected) {
    return {
      success: false,
      error: {
        code: 'not_connected',
        message: 'Google Calendar is not connected',
      },
    };
  }

  const currentMetadata = (integration.metadata || {}) as Record<string, unknown>;

  await prisma.orgIntegration.update({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
    data: {
      metadata: {
        ...currentMetadata,
        calendarId,
        ...(timezone && { timezone }),
        calendarUpdatedAt: new Date().toISOString(),
      },
    },
  });

  return {
    success: true,
    data: { updated: true },
  };
}

/**
 * Disconnect Google integration for an org
 * Purges all tokens and sensitive metadata
 */
export async function disconnectGoogle(orgId: string): Promise<CalendarResult<{ disconnected: true; googleEmail?: string }>> {
  // Get current integration to preserve googleEmail for audit
  const integration = await prisma.orgIntegration.findUnique({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
  });

  if (!integration) {
    return {
      success: false,
      error: {
        code: 'not_connected',
        message: 'No Google integration found',
      },
    };
  }

  const googleEmail = getGoogleEmail(integration.metadata);

  // Purge all tokens and sensitive data
  await prisma.orgIntegration.update({
    where: {
      orgId_provider: {
        orgId,
        provider: 'google',
      },
    },
    data: {
      status: IntegrationStatus.disconnected,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiry: null,
      scope: null,
      // Keep only non-sensitive metadata for audit trail
      metadata: {
        googleUserEmail: googleEmail, // Keep for reference
        disconnectedAt: new Date().toISOString(),
        previousCalendarId: getCalendarId(integration.metadata),
      },
    },
  });

  return {
    success: true,
    data: { 
      disconnected: true,
      googleEmail,
    },
  };
}

// ============================================================================
// Idempotency & Event Lookup
// ============================================================================

/**
 * Generate an idempotency key for booking deduplication
 * 
 * Key components:
 * - orgId: Organization identifier
 * - action: booking action (create/modify/cancel)
 * - startTime: ISO timestamp of booking start
 * - partySize: Number of guests
 * - contactPhone: Phone number (normalized)
 */
export function generateIdempotencyKey(params: {
  orgId: string;
  action: 'create' | 'check' | 'modify' | 'cancel';
  startTime?: Date;
  partySize?: number;
  contactPhone?: string;
  sessionId?: string;
}): string {
  const components = [
    params.orgId,
    params.action,
    params.startTime?.toISOString().slice(0, 16) || 'no-time', // Truncate to minute
    params.partySize?.toString() || 'no-size',
    normalizePhone(params.contactPhone) || params.sessionId || 'no-contact',
  ];
  
  const payload = components.join(':');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  // Remove all non-digits
  return phone.replace(/\D/g, '');
}

/**
 * Check if a booking already exists (idempotency check)
 * Returns the existing log entry if found
 */
export async function checkIdempotency(
  idempotencyKey: string
): Promise<{
  isDuplicate: boolean;
  existingLog?: {
    id: string;
    eventId: string | null;
    status: string;
    createdAt: Date;
  };
}> {
  const existing = await prisma.bookingRequestLog.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      eventId: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    isDuplicate: !!existing && existing.status === 'success',
    existingLog: existing || undefined,
  };
}

/**
 * Find an event by session ID or phone number
 * Useful for modify/cancel when eventId is not in session
 */
export async function findEventBySessionOrPhone(
  orgId: string,
  options: {
    sessionId?: string;
    phone?: string;
    action?: BookingAction;
  }
): Promise<{
  found: boolean;
  eventId?: string;
  bookingLog?: {
    id: string;
    sessionId: string | null;
    createdAt: Date;
    action: string;
  };
}> {
  const { sessionId, phone } = options;
  
  if (!sessionId && !phone) {
    return { found: false };
  }

  // Try to find by sessionId first (most reliable)
  if (sessionId) {
    const bySession = await prisma.bookingRequestLog.findFirst({
      where: {
        orgId,
        sessionId,
        action: BookingAction.create,
        status: 'success',
        eventId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        eventId: true,
        createdAt: true,
        action: true,
      },
    });

    if (bySession?.eventId) {
      return {
        found: true,
        eventId: bySession.eventId,
        bookingLog: {
          id: bySession.id,
          sessionId: bySession.sessionId,
          createdAt: bySession.createdAt,
          action: bySession.action,
        },
      };
    }
  }

  // Try to find by phone number in input JSON
  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      // Search in the input JSON field for phone
      const byPhone = await prisma.bookingRequestLog.findFirst({
        where: {
          orgId,
          action: BookingAction.create,
          status: 'success',
          eventId: { not: null },
          // Search in the JSON input field - Prisma JSON filtering
          input: {
            path: ['phone'],
            string_contains: normalizedPhone.slice(-9), // Last 9 digits
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          sessionId: true,
          eventId: true,
          createdAt: true,
          action: true,
        },
      });

      if (byPhone?.eventId) {
        return {
          found: true,
          eventId: byPhone.eventId,
          bookingLog: {
            id: byPhone.id,
            sessionId: byPhone.sessionId,
            createdAt: byPhone.createdAt,
            action: byPhone.action,
          },
        };
      }
    }
  }

  return { found: false };
}

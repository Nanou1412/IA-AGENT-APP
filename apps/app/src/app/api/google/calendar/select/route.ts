/**
 * Select Calendar for Org
 * 
 * POST /api/google/calendar/select
 * 
 * Validates that the calendarId belongs to the connected Google account
 * before updating the selection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { listCalendars, updateCalendarSelection } from '@/lib/google/calendar';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, calendarId, timezone } = body;

    if (!orgId || !calendarId) {
      return NextResponse.json({ error: 'Missing orgId or calendarId' }, { status: 400 });
    }

    // Verify permission
    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId: session.user.id,
          orgId,
        },
      },
    });

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate that calendarId belongs to the connected account
    const calendarsResult = await listCalendars(orgId);
    
    if (!calendarsResult.success) {
      // Log failed validation attempt
      await prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: session.user.id,
          action: 'google.calendar.select.failed',
          details: { 
            calendarId, 
            reason: 'calendar_list_failed',
            error: calendarsResult.error.message,
          },
        },
      });
      
      return NextResponse.json(
        { error: 'Failed to verify calendar access. Please reconnect Google Calendar.' }, 
        { status: 500 }
      );
    }

    // Check if requested calendarId is in the list of accessible calendars
    const accessibleCalendarIds = calendarsResult.data.map(cal => cal.id);
    if (!accessibleCalendarIds.includes(calendarId)) {
      // Log suspicious attempt
      await prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: session.user.id,
          action: 'google.calendar.select.rejected',
          details: { 
            calendarId, 
            reason: 'calendar_not_accessible',
            accessibleCount: accessibleCalendarIds.length,
          },
        },
      });
      
      return NextResponse.json(
        { error: 'Calendar not found or not accessible. Please select a valid calendar.' }, 
        { status: 400 }
      );
    }

    // Get the calendar details for timezone validation
    const selectedCalendar = calendarsResult.data.find(cal => cal.id === calendarId);
    const finalTimezone = timezone || selectedCalendar?.timeZone || 'Australia/Perth';

    // Update calendar selection
    const result = await updateCalendarSelection(orgId, calendarId, finalTimezone);

    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    // Log successful selection
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: session.user.id,
        action: 'google.calendar.selected',
        details: { 
          calendarId, 
          timezone: finalTimezone,
          calendarName: selectedCalendar?.summary,
        },
      },
    });

    return NextResponse.json({ 
      success: true,
      calendar: {
        id: selectedCalendar?.id,
        name: selectedCalendar?.summary,
        timezone: finalTimezone,
      },
    });
  } catch (error) {
    console.error('[google-calendar-select] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

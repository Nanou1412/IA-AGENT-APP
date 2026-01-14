/**
 * Booking Calendar Module for Engine
 * 
 * Handles booking-related intents through Google Calendar integration.
 * This module is config-driven and industry-agnostic.
 * 
 * Features:
 * - Idempotency: Prevents duplicate bookings via idempotencyKey
 * - Event Lookup: Can find events by sessionId or phone for modify/cancel
 * 
 * Intents handled:
 * - booking.check: Check availability
 * - booking.create: Create a new booking
 * - booking.modify: Modify an existing booking
 * - booking.cancel: Cancel a booking
 */

import type { ModuleContext, ModuleResult } from '../module-runner';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  checkAvailability,
  createEvent,
  updateEvent,
  deleteEvent,
  getIntegrationStatus,
  parseBookingConfig,
  validateBookingDetails,
  buildEventSummary,
  buildEventDescription,
  // Idempotency & event lookup
  generateIdempotencyKey,
  checkIdempotency,
  findEventBySessionOrPhone,
  type BookingDetails,
  type BookingConfig,
} from '@/lib/google';
import { BookingAction, BookingRequestStatus } from '@prisma/client';
import { sendBookingConfirmationSms } from '@/lib/sms';

// ============================================================================
// Types
// ============================================================================

export interface BookingModuleContext extends ModuleContext {
  intent?: string;
  parsedBooking?: ParsedBookingRequest;
}

export interface ParsedBookingRequest {
  action: 'check' | 'create' | 'modify' | 'cancel';
  dateTime?: Date;
  partySize?: number;
  name?: string;
  phone?: string;
  notes?: string;
  eventId?: string; // For modify/cancel
}

// ============================================================================
// Response Templates
// ============================================================================

const RESPONSES = {
  notConnected: "I'm sorry, our booking system is currently unavailable. Please call us directly to make a reservation.",
  notEnabled: "Online booking is not currently available. Please call us to make a reservation.",
  moduleBlocked: "I'm unable to process bookings at this time. Let me connect you with someone who can help.",
  
  // Availability
  available: (dateStr: string) => 
    `Great news! We have availability on ${dateStr}. Would you like me to book this for you?`,
  notAvailable: (dateStr: string, alternatives?: string) => 
    alternatives 
      ? `Unfortunately, ${dateStr} is not available. However, we have openings at ${alternatives}. Would either of those work for you?`
      : `Unfortunately, ${dateStr} is not available. Would you like to try a different time?`,
  
  // Booking creation
  needDetails: (missing: string[]) => 
    `I'd be happy to book that for you. Could you please provide ${missing.join(' and ')}?`,
  bookingConfirmed: (summary: string) => 
    `Perfect! Your booking is confirmed: ${summary}. We look forward to seeing you!`,
  bookingFailed: "I'm sorry, I wasn't able to complete the booking. Let me connect you with someone who can help.",
  
  // Modifications
  modifyNotAllowed: "I'm sorry, booking modifications need to be handled by our team. Let me connect you with someone who can help.",
  modifySuccess: (summary: string) => 
    `Your booking has been updated: ${summary}.`,
  
  // Cancellation
  cancelNotAllowed: "I'm sorry, cancellations need to be handled by our team. Let me connect you with someone who can help.",
  cancelSuccess: "Your booking has been cancelled. We hope to see you another time!",
  cancelNeedId: "To cancel your booking, I'll need to look it up. Could you tell me the date and time of your reservation?",
  
  // Validation errors
  validationError: (errors: string[]) => 
    `I noticed a few issues: ${errors.join('. ')}. Could you please check and try again?`,
  partyTooBig: (max: number) => 
    `We can accommodate groups up to ${max} people. For larger groups, please call us directly so we can make special arrangements.`,
  noticeTooShort: (hours: number) => 
    `We require at least ${hours} hour(s) notice for bookings. Would you like to book for a later time?`,
  
  // Clarification
  needDateTime: "What date and time would you like to book?",
  needPartySize: "How many people will be dining?",
  
  // Handoff triggers
  handoffComplex: "This booking requires some special arrangements. Let me connect you with someone who can help.",
};

// ============================================================================
// Module Handler
// ============================================================================

/**
 * Main booking calendar module handler
 */
export async function bookingCalendarModule(context: BookingModuleContext): Promise<ModuleResult> {
  const { orgId, sessionId, intent, sessionMetadata, canUseModule } = context;

  // Check if booking module is allowed
  const gating = canUseModule('booking');
  if (!gating.allowed) {
    return {
      responseText: RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: gating.reason,
      blockedBy: gating.blockedBy,
    };
  }

  // Get booking config from org settings
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { bookingConfig: true },
  });

  const bookingConfig = parseBookingConfig(orgSettings?.bookingConfig);
  
  if (!bookingConfig.enabled) {
    return {
      responseText: RESPONSES.notEnabled,
      handoffTriggered: true,
      handoffReason: 'Booking not enabled for org',
    };
  }

  // Check Google Calendar integration status
  const integrationStatus = await getIntegrationStatus(orgId);
  if (!integrationStatus.connected) {
    return {
      responseText: RESPONSES.notConnected,
      handoffTriggered: true,
      handoffReason: 'Google Calendar not connected',
    };
  }

  // Determine action from intent
  const action = determineAction(intent, sessionMetadata);
  
  // Get parsed booking from session or parse from user text
  const parsedBooking = context.parsedBooking || 
    (sessionMetadata.pendingBooking as ParsedBookingRequest | undefined);

  try {
    switch (action) {
      case 'check':
        return await handleAvailabilityCheck(orgId, sessionId, context, bookingConfig, parsedBooking);
      
      case 'create':
        return await handleBookingCreate(orgId, sessionId, context, bookingConfig, parsedBooking);
      
      case 'modify':
        return await handleBookingModify(orgId, sessionId, context, bookingConfig, parsedBooking);
      
      case 'cancel':
        return await handleBookingCancel(orgId, sessionId, context, bookingConfig, parsedBooking);
      
      default:
        // No specific action - prompt for what they want
        return {
          responseText: "Would you like to check availability, make a booking, or modify an existing reservation?",
          handoffTriggered: false,
        };
    }
  } catch (error) {
    console.error('[booking-calendar] Error:', error);
    await logBookingRequest(orgId, sessionId, action || 'check', {}, { error: String(error) }, 'error');
    return {
      responseText: RESPONSES.bookingFailed,
      handoffTriggered: true,
      handoffReason: 'Booking error',
    };
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleAvailabilityCheck(
  orgId: string,
  sessionId: string,
  context: BookingModuleContext,
  config: BookingConfig,
  parsed?: ParsedBookingRequest
): Promise<ModuleResult> {
  if (!parsed?.dateTime) {
    return {
      responseText: RESPONSES.needDateTime,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        bookingAction: 'check',
        awaitingDateTime: true,
      },
    };
  }

  const startTime = parsed.dateTime;
  const endTime = new Date(startTime.getTime() + config.calendar.defaultDurationMinutes * 60 * 1000);

  const result = await checkAvailability(orgId, startTime, endTime);

  await logBookingRequest(
    orgId, 
    sessionId, 
    'check',
    { startTime: startTime.toISOString(), endTime: endTime.toISOString() },
    result.success ? { available: result.data.available } : { error: result.error },
    result.success ? 'success' : 'error'
  );

  if (!result.success) {
    return {
      responseText: RESPONSES.bookingFailed,
      handoffTriggered: true,
      handoffReason: result.error.message,
    };
  }

  const dateStr = formatDateTime(startTime, config.calendar.timezone);

  if (result.data.available) {
    return {
      responseText: RESPONSES.available(dateStr),
      handoffTriggered: false,
      sessionMetadataUpdates: {
        checkedDateTime: startTime.toISOString(),
        availabilityConfirmed: true,
        pendingBooking: {
          action: 'create',
          dateTime: startTime.toISOString(),
          partySize: parsed.partySize,
          name: parsed.name,
          phone: parsed.phone,
        },
      },
    };
  } else {
    // Suggest alternatives if available
    const alternatives = result.data.nextAvailable 
      ? formatDateTime(result.data.nextAvailable, config.calendar.timezone)
      : undefined;
    
    return {
      responseText: RESPONSES.notAvailable(dateStr, alternatives),
      handoffTriggered: false,
      sessionMetadataUpdates: {
        checkedDateTime: startTime.toISOString(),
        availabilityConfirmed: false,
        suggestedAlternative: result.data.nextAvailable?.toISOString(),
      },
    };
  }
}

async function handleBookingCreate(
  orgId: string,
  sessionId: string,
  context: BookingModuleContext,
  config: BookingConfig,
  parsed?: ParsedBookingRequest
): Promise<ModuleResult> {
  // Collect missing information
  const missing: string[] = [];
  
  if (!parsed?.dateTime) {
    missing.push('the date and time');
  }
  if (config.calendar.requireName && !parsed?.name) {
    missing.push('your name');
  }
  if (config.calendar.requirePhone && !parsed?.phone) {
    missing.push('a phone number');
  }
  if (!parsed?.partySize) {
    missing.push('the number of guests');
  }

  if (missing.length > 0) {
    return {
      responseText: RESPONSES.needDetails(missing),
      handoffTriggered: false,
      sessionMetadataUpdates: {
        bookingAction: 'create',
        pendingBooking: {
          action: 'create',
          dateTime: parsed?.dateTime?.toISOString(),
          partySize: parsed?.partySize,
          name: parsed?.name,
          phone: parsed?.phone,
        },
        awaitingDetails: missing,
      },
    };
  }

  // Validate booking details
  const details: BookingDetails = {
    name: parsed!.name,
    phone: parsed!.phone,
    partySize: parsed!.partySize,
    dateTime: parsed!.dateTime,
    duration: config.calendar.defaultDurationMinutes,
    notes: parsed!.notes,
  };

  const validation = validateBookingDetails(details, config);
  
  if (!validation.valid) {
    // Check for specific error types
    if (validation.errors.some(e => e.includes('Maximum party size'))) {
      return {
        responseText: RESPONSES.partyTooBig(config.calendar.maxPartySize),
        handoffTriggered: true,
        handoffReason: 'Party size exceeds limit',
      };
    }
    if (validation.errors.some(e => e.includes('notice required'))) {
      const hours = Math.ceil(config.calendar.minNoticeMinutes / 60);
      return {
        responseText: RESPONSES.noticeTooShort(hours),
        handoffTriggered: false,
      };
    }
    
    return {
      responseText: RESPONSES.validationError(validation.errors),
      handoffTriggered: false,
    };
  }

  // === IDEMPOTENCY CHECK ===
  // Generate idempotency key to prevent duplicate bookings
  const idempotencyKey = generateIdempotencyKey({
    orgId,
    action: 'create',
    startTime: details.dateTime,
    partySize: details.partySize,
    contactPhone: details.phone,
    sessionId,
  });

  const idempotencyCheck = await checkIdempotency(idempotencyKey);
  
  if (idempotencyCheck.isDuplicate && idempotencyCheck.existingLog) {
    // Return success with existing event info
    const dateStr = formatDateTime(details.dateTime!, config.calendar.timezone);
    const summary = `${details.name}, ${details.partySize} guests on ${dateStr}`;
    
    console.log('[booking-calendar] Duplicate booking detected, returning existing:', {
      idempotencyKey,
      existingId: idempotencyCheck.existingLog.id,
    });
    
    return {
      responseText: RESPONSES.bookingConfirmed(summary) + " (Your booking was already confirmed.)",
      handoffTriggered: false,
      sessionMetadataUpdates: {
        lastBookingEventId: idempotencyCheck.existingLog.eventId,
        lastBookingConfirmed: true,
        pendingBooking: null,
        duplicateBlocked: true,
      },
    };
  }

  // Check if availability was already confirmed
  const needsAvailabilityCheck = !context.sessionMetadata.availabilityConfirmed ||
    context.sessionMetadata.checkedDateTime !== details.dateTime!.toISOString();

  if (needsAvailabilityCheck) {
    const startTime = details.dateTime!;
    const endTime = new Date(startTime.getTime() + config.calendar.defaultDurationMinutes * 60 * 1000);
    
    const availResult = await checkAvailability(orgId, startTime, endTime);
    
    if (!availResult.success || !availResult.data.available) {
      const dateStr = formatDateTime(startTime, config.calendar.timezone);
      const alternatives = availResult.success && availResult.data.nextAvailable
        ? formatDateTime(availResult.data.nextAvailable, config.calendar.timezone)
        : undefined;
      
      return {
        responseText: RESPONSES.notAvailable(dateStr, alternatives),
        handoffTriggered: false,
      };
    }
  }

  // Create the event
  const startTime = details.dateTime!;
  const endTime = new Date(startTime.getTime() + (details.duration || 90) * 60 * 1000);

  const eventResult = await createEvent(orgId, {
    summary: buildEventSummary(details),
    description: buildEventDescription(details, {
      channel: context.channel,
      sessionId,
      bookedAt: new Date(),
    }),
    startTime,
    endTime,
    timeZone: config.calendar.timezone,
  });

  const logInput = {
    name: details.name,
    partySize: details.partySize,
    dateTime: startTime.toISOString(),
    channel: context.channel,
  };

  if (!eventResult.success) {
    await logBookingRequest(
      orgId, 
      sessionId, 
      'create', 
      logInput, 
      { error: eventResult.error }, 
      'error',
      { idempotencyKey }
    );
    return {
      responseText: RESPONSES.bookingFailed,
      handoffTriggered: true,
      handoffReason: eventResult.error.message,
    };
  }

  await logBookingRequest(
    orgId, 
    sessionId, 
    'create',
    logInput,
    { eventId: eventResult.data.id, htmlLink: eventResult.data.htmlLink },
    'success',
    { idempotencyKey, eventId: eventResult.data.id }
  );

  // Build confirmation message
  const dateStr = formatDateTime(startTime, config.calendar.timezone);
  const summary = `${details.name}, ${details.partySize} guests on ${dateStr}`;

  // Send SMS confirmation if enabled and phone is available
  if (config.confirmations.sendSmsConfirmation && details.phone) {
    try {
      // Get business name from org
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      const smsResult = await sendBookingConfirmationSms({
        orgId,
        customerPhone: details.phone,
        customerName: details.name || 'Guest',
        partySize: details.partySize || 1,
        dateTime: dateStr,
        bookingId: eventResult.data.id,
        businessName: org?.name,
      });

      if (smsResult.success) {
        console.log(`[booking-calendar] Confirmation SMS sent for booking ${eventResult.data.id}`);
      } else {
        console.warn(`[booking-calendar] Failed to send confirmation SMS:`, smsResult.error);
        // Don't fail the booking - SMS is non-critical
      }
    } catch (smsError) {
      console.error(`[booking-calendar] Error sending confirmation SMS:`, smsError);
      // Don't fail the booking - SMS is non-critical
    }
  }

  return {
    responseText: RESPONSES.bookingConfirmed(summary),
    handoffTriggered: false,
    sessionMetadataUpdates: {
      lastBookingEventId: eventResult.data.id,
      lastBookingConfirmed: true,
      pendingBooking: null,
    },
  };
}

async function handleBookingModify(
  orgId: string,
  sessionId: string,
  context: BookingModuleContext,
  config: BookingConfig,
  parsed?: ParsedBookingRequest
): Promise<ModuleResult> {
  // Check if modifications are allowed
  if (!config.calendar.allowModify) {
    await logBookingRequest(orgId, sessionId, 'modify', {}, { blocked: 'not_allowed' }, 'handoff');
    return {
      responseText: RESPONSES.modifyNotAllowed,
      handoffTriggered: true,
      handoffReason: 'Modifications not allowed by config',
    };
  }

  // Get event ID from session, parsed request, or fallback lookup
  let eventId = parsed?.eventId || (context.sessionMetadata.lastBookingEventId as string | undefined);

  // Fallback: try to find event by session or phone
  if (!eventId) {
    const lookup = await findEventBySessionOrPhone(orgId, {
      sessionId,
      phone: parsed?.phone,
      action: 'create',
    });
    
    if (lookup.found && lookup.eventId) {
      eventId = lookup.eventId;
      console.log('[booking-calendar] Found eventId via fallback lookup:', {
        sessionId,
        eventId,
        foundVia: lookup.bookingLog?.id,
      });
    }
  }

  if (!eventId) {
    return {
      responseText: "I'll need to find your booking first. Could you tell me the date and name for the reservation?",
      handoffTriggered: false,
      sessionMetadataUpdates: {
        bookingAction: 'modify',
        awaitingEventLookup: true,
      },
    };
  }

  // Check what needs to be modified
  if (!parsed?.dateTime && !parsed?.partySize) {
    return {
      responseText: "What would you like to change? The date/time or the number of guests?",
      handoffTriggered: false,
    };
  }

  // Update the event
  const result = await updateEvent(orgId, eventId, {
    startTime: parsed.dateTime,
    endTime: parsed.dateTime 
      ? new Date(parsed.dateTime.getTime() + config.calendar.defaultDurationMinutes * 60 * 1000)
      : undefined,
    summary: parsed.partySize ? `Booking: (${parsed.partySize} guests)` : undefined,
  });

  const logInput = {
    eventId,
    newDateTime: parsed.dateTime?.toISOString(),
    newPartySize: parsed.partySize,
  };

  if (!result.success) {
    await logBookingRequest(orgId, sessionId, 'modify', logInput, { error: result.error }, 'error', { eventId });
    return {
      responseText: RESPONSES.bookingFailed,
      handoffTriggered: true,
      handoffReason: result.error.message,
    };
  }

  await logBookingRequest(orgId, sessionId, 'modify', logInput, { updated: true }, 'success', { eventId });

  const changes: string[] = [];
  if (parsed.dateTime) {
    changes.push(`new time: ${formatDateTime(parsed.dateTime, config.calendar.timezone)}`);
  }
  if (parsed.partySize) {
    changes.push(`${parsed.partySize} guests`);
  }

  return {
    responseText: RESPONSES.modifySuccess(changes.join(', ')),
    handoffTriggered: false,
    sessionMetadataUpdates: {
      lastBookingEventId: eventId, // Persist eventId in session
    },
  };
}

async function handleBookingCancel(
  orgId: string,
  sessionId: string,
  context: BookingModuleContext,
  config: BookingConfig,
  parsed?: ParsedBookingRequest
): Promise<ModuleResult> {
  // Check if cancellations are allowed
  if (!config.calendar.allowCancel) {
    await logBookingRequest(orgId, sessionId, 'cancel', {}, { blocked: 'not_allowed' }, 'handoff');
    return {
      responseText: RESPONSES.cancelNotAllowed,
      handoffTriggered: true,
      handoffReason: 'Cancellations not allowed by config',
    };
  }

  // Get event ID from session, parsed request, or fallback lookup
  let eventId = parsed?.eventId || (context.sessionMetadata.lastBookingEventId as string | undefined);

  // Fallback: try to find event by session or phone
  if (!eventId) {
    const lookup = await findEventBySessionOrPhone(orgId, {
      sessionId,
      phone: parsed?.phone,
      action: 'create',
    });
    
    if (lookup.found && lookup.eventId) {
      eventId = lookup.eventId;
      console.log('[booking-calendar] Found eventId via fallback lookup for cancel:', {
        sessionId,
        eventId,
        foundVia: lookup.bookingLog?.id,
      });
    }
  }

  if (!eventId) {
    return {
      responseText: RESPONSES.cancelNeedId,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        bookingAction: 'cancel',
        awaitingEventLookup: true,
      },
    };
  }

  // Delete the event
  const result = await deleteEvent(orgId, eventId);

  if (!result.success) {
    await logBookingRequest(orgId, sessionId, 'cancel', { eventId }, { error: result.error }, 'error', { eventId });
    return {
      responseText: RESPONSES.bookingFailed,
      handoffTriggered: true,
      handoffReason: result.error.message,
    };
  }

  await logBookingRequest(orgId, sessionId, 'cancel', { eventId }, { deleted: true }, 'success', { eventId });

  return {
    responseText: RESPONSES.cancelSuccess,
    handoffTriggered: false,
    sessionMetadataUpdates: {
      lastBookingEventId: null,
      bookingCancelled: true,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function determineAction(
  intent?: string,
  sessionMetadata?: Record<string, unknown>
): 'check' | 'create' | 'modify' | 'cancel' | undefined {
  // Check explicit intent
  if (intent?.includes('booking.check') || intent?.includes('availability')) {
    return 'check';
  }
  if (intent?.includes('booking.create') || intent?.includes('book') || intent?.includes('reserve')) {
    return 'create';
  }
  if (intent?.includes('booking.modify') || intent?.includes('change') || intent?.includes('reschedule')) {
    return 'modify';
  }
  if (intent?.includes('booking.cancel') || intent?.includes('cancel')) {
    return 'cancel';
  }

  // Check session state
  if (sessionMetadata?.bookingAction) {
    return sessionMetadata.bookingAction as 'check' | 'create' | 'modify' | 'cancel';
  }

  // If availability was just confirmed, next action is likely create
  if (sessionMetadata?.availabilityConfirmed && sessionMetadata?.pendingBooking) {
    return 'create';
  }

  return undefined;
}

function formatDateTime(date: Date, timezone: string): string {
  try {
    return date.toLocaleString('en-AU', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toISOString();
  }
}

async function logBookingRequest(
  orgId: string,
  sessionId: string | undefined,
  action: 'check' | 'create' | 'modify' | 'cancel',
  input: Record<string, unknown>,
  result: Record<string, unknown>,
  status: 'success' | 'blocked' | 'error' | 'handoff',
  options?: {
    idempotencyKey?: string;
    eventId?: string;
  }
): Promise<void> {
  try {
    await prisma.bookingRequestLog.create({
      data: {
        orgId,
        sessionId,
        action: action as BookingAction,
        idempotencyKey: options?.idempotencyKey,
        eventId: options?.eventId,
        input: input as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
        status: status as BookingRequestStatus,
        reason: status === 'handoff' || status === 'error' 
          ? String(result.error || result.blocked || 'unknown')
          : undefined,
      },
    });
  } catch (error) {
    console.error('[booking-calendar] Failed to log request:', error);
  }
}

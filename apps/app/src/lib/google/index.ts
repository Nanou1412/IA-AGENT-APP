/**
 * Google Integration Module
 * 
 * Exports all Google-related functionality including:
 * - Calendar API client
 * - Booking configuration types and validation
 */

// Calendar client
export {
  listCalendars,
  checkAvailability,
  createEvent,
  updateEvent,
  deleteEvent,
  getIntegrationStatus,
  updateCalendarSelection,
  disconnectGoogle,
  // Idempotency & event lookup
  generateIdempotencyKey,
  checkIdempotency,
  findEventBySessionOrPhone,
  type CalendarInfo,
  type TimeSlot,
  type AvailabilityResult,
  type CreateEventParams,
  type CalendarEvent,
  type GoogleCalendarError,
  type CalendarResult,
} from './calendar';

// Booking configuration
export {
  parseBookingConfig,
  validateBookingDetails,
  buildEventSummary,
  buildEventDescription,
  DEFAULT_BOOKING_CONFIG,
  DEFAULT_CALENDAR_CONFIG,
  DEFAULT_CONFIRMATIONS_CONFIG,
  DEFAULT_SANDBOX_CONFIG,
  type BookingConfig,
  type CalendarConfig,
  type ConfirmationsConfig,
  type SandboxConfig,
  type BookingDetails,
  type BookingValidationResult,
} from './booking-config';

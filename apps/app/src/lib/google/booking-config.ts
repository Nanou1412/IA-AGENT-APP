/**
 * Booking Configuration Types and Validation
 * 
 * Defines the structure of bookingConfig stored in OrgSettings.
 * Used by the booking_calendar engine module.
 */

// ============================================================================
// Types
// ============================================================================

export interface CalendarConfig {
  calendarId: string; // 'primary' or specific calendar ID
  timezone: string; // e.g., 'Australia/Perth'
  defaultDurationMinutes: number; // Default booking duration
  minNoticeMinutes: number; // Minimum time before a booking
  maxPartySize: number; // Maximum party size allowed
  allowModify: boolean; // Allow customers to modify bookings
  allowCancel: boolean; // Allow customers to cancel bookings
  requirePhone: boolean; // Require phone number for booking
  requireName: boolean; // Require name for booking
}

export interface ConfirmationsConfig {
  autoConfirm: boolean; // Automatically confirm bookings
  sendSmsConfirmation: boolean; // Send SMS confirmation
}

/**
 * Sandbox Test Mode Configuration
 * 
 * When sandboxTestMode is true, the booking module can be tested
 * even when the org is in sandbox status, but only for configured
 * test calendars/emails.
 */
export interface SandboxConfig {
  /** Enable sandbox testing for booking (bypass sandbox gating) */
  sandboxTestMode: boolean;
  /** Calendar ID to use in sandbox mode (optional, defaults to main calendarId) */
  sandboxCalendarId?: string;
  /** Allowed test emails that can receive booking confirmations in sandbox */
  allowedTestEmails?: string[];
}

export interface BookingConfig {
  enabled: boolean;
  calendar: CalendarConfig;
  confirmations: ConfirmationsConfig;
  sandbox: SandboxConfig;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = {
  calendarId: 'primary',
  timezone: 'Australia/Perth',
  defaultDurationMinutes: 90,
  minNoticeMinutes: 60,
  maxPartySize: 20,
  allowModify: true,
  allowCancel: true,
  requirePhone: true,
  requireName: true,
};

export const DEFAULT_CONFIRMATIONS_CONFIG: ConfirmationsConfig = {
  autoConfirm: true,
  sendSmsConfirmation: true,
};

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  sandboxTestMode: false,
  sandboxCalendarId: undefined,
  allowedTestEmails: [],
};

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  enabled: false,
  calendar: DEFAULT_CALENDAR_CONFIG,
  confirmations: DEFAULT_CONFIRMATIONS_CONFIG,
  sandbox: DEFAULT_SANDBOX_CONFIG,
};

// ============================================================================
// Parsing / Validation
// ============================================================================

/**
 * Parse and validate bookingConfig from JSON
 * Returns default config if invalid
 */
export function parseBookingConfig(configJson: unknown): BookingConfig {
  if (!configJson || typeof configJson !== 'object') {
    return DEFAULT_BOOKING_CONFIG;
  }

  const config = configJson as Record<string, unknown>;

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : false,
    calendar: parseCalendarConfig(config.calendar),
    confirmations: parseConfirmationsConfig(config.confirmations),
    sandbox: parseSandboxConfig(config.sandbox),
  };
}

/**
 * Parse sandbox config from JSON
 */
function parseSandboxConfig(config: unknown): SandboxConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_SANDBOX_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    sandboxTestMode: typeof c.sandboxTestMode === 'boolean' ? c.sandboxTestMode : false,
    sandboxCalendarId: typeof c.sandboxCalendarId === 'string' ? c.sandboxCalendarId : undefined,
    allowedTestEmails: Array.isArray(c.allowedTestEmails) 
      ? c.allowedTestEmails.filter((e): e is string => typeof e === 'string')
      : [],
  };
}

function parseCalendarConfig(config: unknown): CalendarConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_CALENDAR_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    calendarId: typeof c.calendarId === 'string' ? c.calendarId : 'primary',
    timezone: typeof c.timezone === 'string' ? c.timezone : 'Australia/Perth',
    defaultDurationMinutes: typeof c.defaultDurationMinutes === 'number' ? c.defaultDurationMinutes : 90,
    minNoticeMinutes: typeof c.minNoticeMinutes === 'number' ? c.minNoticeMinutes : 60,
    maxPartySize: typeof c.maxPartySize === 'number' ? c.maxPartySize : 20,
    allowModify: typeof c.allowModify === 'boolean' ? c.allowModify : true,
    allowCancel: typeof c.allowCancel === 'boolean' ? c.allowCancel : true,
    requirePhone: typeof c.requirePhone === 'boolean' ? c.requirePhone : true,
    requireName: typeof c.requireName === 'boolean' ? c.requireName : true,
  };
}

function parseConfirmationsConfig(config: unknown): ConfirmationsConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_CONFIRMATIONS_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    autoConfirm: typeof c.autoConfirm === 'boolean' ? c.autoConfirm : true,
    sendSmsConfirmation: typeof c.sendSmsConfirmation === 'boolean' ? c.sendSmsConfirmation : true,
  };
}

// ============================================================================
// Booking Request Types
// ============================================================================

export interface BookingDetails {
  name?: string;
  phone?: string;
  partySize?: number;
  dateTime?: Date;
  duration?: number; // in minutes
  notes?: string;
}

export interface BookingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate booking details against config rules
 */
export function validateBookingDetails(
  details: BookingDetails,
  config: BookingConfig,
  now: Date = new Date()
): BookingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (config.calendar.requireName && !details.name?.trim()) {
    errors.push('Name is required');
  }

  if (config.calendar.requirePhone && !details.phone?.trim()) {
    errors.push('Phone number is required');
  }

  // Check date/time
  if (!details.dateTime) {
    errors.push('Date and time are required');
  } else {
    // Check minimum notice
    const minNoticeMs = config.calendar.minNoticeMinutes * 60 * 1000;
    const timeDiff = details.dateTime.getTime() - now.getTime();
    
    if (timeDiff < 0) {
      errors.push('Cannot book in the past');
    } else if (timeDiff < minNoticeMs) {
      const minHours = Math.ceil(config.calendar.minNoticeMinutes / 60);
      errors.push(`Minimum ${minHours} hour(s) notice required`);
    }
  }

  // Check party size
  if (details.partySize !== undefined) {
    if (details.partySize < 1) {
      errors.push('Party size must be at least 1');
    } else if (details.partySize > config.calendar.maxPartySize) {
      errors.push(`Maximum party size is ${config.calendar.maxPartySize}`);
    }

    // Warning for large parties
    if (details.partySize > 10) {
      warnings.push('Large party - may require special arrangements');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Build event summary from booking details
 */
export function buildEventSummary(details: BookingDetails): string {
  const parts: string[] = [];
  
  if (details.name) {
    parts.push(details.name);
  }
  
  if (details.partySize) {
    parts.push(`(${details.partySize} guests)`);
  }

  return parts.length > 0 ? `Booking: ${parts.join(' ')}` : 'Booking';
}

/**
 * Build event description from booking details
 */
export function buildEventDescription(
  details: BookingDetails,
  metadata?: {
    channel?: string;
    sessionId?: string;
    bookedAt?: Date;
  }
): string {
  const lines: string[] = [];

  if (details.name) {
    lines.push(`Name: ${details.name}`);
  }
  if (details.phone) {
    lines.push(`Phone: ${details.phone}`);
  }
  if (details.partySize) {
    lines.push(`Party Size: ${details.partySize}`);
  }
  if (details.notes) {
    lines.push(`Notes: ${details.notes}`);
  }

  if (metadata) {
    lines.push(''); // Empty line
    if (metadata.channel) {
      lines.push(`Booked via: ${metadata.channel.toUpperCase()}`);
    }
    if (metadata.sessionId) {
      lines.push(`Session: ${metadata.sessionId}`);
    }
    if (metadata.bookedAt) {
      lines.push(`Booked at: ${metadata.bookedAt.toISOString()}`);
    }
  }

  return lines.join('\n');
}

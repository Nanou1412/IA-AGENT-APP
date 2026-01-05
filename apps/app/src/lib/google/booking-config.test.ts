/**
 * Booking Configuration Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseBookingConfig,
  validateBookingDetails,
  buildEventSummary,
  buildEventDescription,
  DEFAULT_BOOKING_CONFIG,
  type BookingConfig,
  type BookingDetails,
} from './booking-config';

describe('parseBookingConfig', () => {
  it('should return defaults for null input', () => {
    const config = parseBookingConfig(null);
    expect(config).toEqual(DEFAULT_BOOKING_CONFIG);
  });

  it('should return defaults for undefined input', () => {
    const config = parseBookingConfig(undefined);
    expect(config).toEqual(DEFAULT_BOOKING_CONFIG);
  });

  it('should return defaults for non-object input', () => {
    expect(parseBookingConfig('string')).toEqual(DEFAULT_BOOKING_CONFIG);
    expect(parseBookingConfig(123)).toEqual(DEFAULT_BOOKING_CONFIG);
  });

  it('should parse enabled flag', () => {
    const config = parseBookingConfig({ enabled: true });
    expect(config.enabled).toBe(true);
  });

  it('should parse calendar config', () => {
    const config = parseBookingConfig({
      enabled: true,
      calendar: {
        calendarId: 'custom-cal',
        timezone: 'Australia/Sydney',
        defaultDurationMinutes: 60,
        minNoticeMinutes: 120,
        maxPartySize: 10,
        allowModify: false,
        allowCancel: false,
        requirePhone: false,
        requireName: true,
      },
    });

    expect(config.calendar.calendarId).toBe('custom-cal');
    expect(config.calendar.timezone).toBe('Australia/Sydney');
    expect(config.calendar.defaultDurationMinutes).toBe(60);
    expect(config.calendar.minNoticeMinutes).toBe(120);
    expect(config.calendar.maxPartySize).toBe(10);
    expect(config.calendar.allowModify).toBe(false);
    expect(config.calendar.allowCancel).toBe(false);
    expect(config.calendar.requirePhone).toBe(false);
    expect(config.calendar.requireName).toBe(true);
  });

  it('should parse confirmations config', () => {
    const config = parseBookingConfig({
      enabled: true,
      confirmations: {
        autoConfirm: false,
        sendSmsConfirmation: false,
      },
    });

    expect(config.confirmations.autoConfirm).toBe(false);
    expect(config.confirmations.sendSmsConfirmation).toBe(false);
  });

  it('should use defaults for missing calendar fields', () => {
    const config = parseBookingConfig({
      enabled: true,
      calendar: {
        calendarId: 'my-cal',
        // missing other fields
      },
    });

    expect(config.calendar.calendarId).toBe('my-cal');
    expect(config.calendar.timezone).toBe('Australia/Perth'); // default
    expect(config.calendar.defaultDurationMinutes).toBe(90); // default
  });
});

describe('validateBookingDetails', () => {
  const baseConfig: BookingConfig = {
    enabled: true,
    calendar: {
      calendarId: 'primary',
      timezone: 'Australia/Perth',
      defaultDurationMinutes: 90,
      minNoticeMinutes: 60, // 1 hour
      maxPartySize: 20,
      allowModify: true,
      allowCancel: true,
      requirePhone: true,
      requireName: true,
    },
    confirmations: {
      autoConfirm: true,
      sendSmsConfirmation: true,
    },
    sandbox: {
      sandboxTestMode: false,
      sandboxCalendarId: undefined,
      allowedTestEmails: [],
    },
  };

  const now = new Date('2024-01-15T12:00:00Z');

  it('should pass for valid booking', () => {
    const details: BookingDetails = {
      name: 'John Doe',
      phone: '+61412345678',
      partySize: 4,
      dateTime: new Date('2024-01-15T18:00:00Z'), // 6 hours from now
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when name is required but missing', () => {
    const details: BookingDetails = {
      phone: '+61412345678',
      partySize: 4,
      dateTime: new Date('2024-01-15T18:00:00Z'),
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Name is required');
  });

  it('should fail when phone is required but missing', () => {
    const details: BookingDetails = {
      name: 'John',
      partySize: 4,
      dateTime: new Date('2024-01-15T18:00:00Z'),
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Phone number is required');
  });

  it('should fail when dateTime is missing', () => {
    const details: BookingDetails = {
      name: 'John',
      phone: '+61412345678',
      partySize: 4,
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Date and time are required');
  });

  it('should fail for bookings in the past', () => {
    const details: BookingDetails = {
      name: 'John',
      phone: '+61412345678',
      partySize: 4,
      dateTime: new Date('2024-01-15T11:00:00Z'), // 1 hour before now
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Cannot book in the past');
  });

  it('should fail when minimum notice not met', () => {
    const details: BookingDetails = {
      name: 'John',
      phone: '+61412345678',
      partySize: 4,
      dateTime: new Date('2024-01-15T12:30:00Z'), // 30 minutes from now, need 60
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('notice required'))).toBe(true);
  });

  it('should fail when party size too small', () => {
    const details: BookingDetails = {
      name: 'John',
      phone: '+61412345678',
      partySize: 0,
      dateTime: new Date('2024-01-15T18:00:00Z'),
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Party size must be at least 1');
  });

  it('should fail when party size exceeds max', () => {
    const details: BookingDetails = {
      name: 'John',
      phone: '+61412345678',
      partySize: 25, // max is 20
      dateTime: new Date('2024-01-15T18:00:00Z'),
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Maximum party size is 20');
  });

  it('should warn for large parties', () => {
    const details: BookingDetails = {
      name: 'John',
      phone: '+61412345678',
      partySize: 15, // under 20 but over 10
      dateTime: new Date('2024-01-15T18:00:00Z'),
    };

    const result = validateBookingDetails(details, baseConfig, now);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('Large party'))).toBe(true);
  });

  it('should pass when name not required and missing', () => {
    const config: BookingConfig = {
      ...baseConfig,
      calendar: { ...baseConfig.calendar, requireName: false },
    };
    const details: BookingDetails = {
      phone: '+61412345678',
      partySize: 4,
      dateTime: new Date('2024-01-15T18:00:00Z'),
    };

    const result = validateBookingDetails(details, config, now);
    expect(result.valid).toBe(true);
  });
});

describe('buildEventSummary', () => {
  it('should build summary with name and party size', () => {
    const details: BookingDetails = {
      name: 'John Doe',
      partySize: 4,
    };

    const summary = buildEventSummary(details);
    expect(summary).toBe('Booking: John Doe (4 guests)');
  });

  it('should build summary with name only', () => {
    const details: BookingDetails = {
      name: 'Jane',
    };

    const summary = buildEventSummary(details);
    expect(summary).toBe('Booking: Jane');
  });

  it('should build summary with party size only', () => {
    const details: BookingDetails = {
      partySize: 2,
    };

    const summary = buildEventSummary(details);
    expect(summary).toBe('Booking: (2 guests)');
  });

  it('should return default for empty details', () => {
    const details: BookingDetails = {};
    const summary = buildEventSummary(details);
    expect(summary).toBe('Booking');
  });
});

describe('buildEventDescription', () => {
  it('should build description with all fields', () => {
    const details: BookingDetails = {
      name: 'John Doe',
      phone: '+61412345678',
      partySize: 4,
      notes: 'Window seat please',
    };

    const description = buildEventDescription(details);
    expect(description).toContain('Name: John Doe');
    expect(description).toContain('Phone: +61412345678');
    expect(description).toContain('Party Size: 4');
    expect(description).toContain('Notes: Window seat please');
  });

  it('should include metadata when provided', () => {
    const details: BookingDetails = {
      name: 'John',
    };

    const description = buildEventDescription(details, {
      channel: 'sms',
      sessionId: 'session-123',
      bookedAt: new Date('2024-01-15T12:00:00Z'),
    });

    expect(description).toContain('Booked via: SMS');
    expect(description).toContain('Session: session-123');
    expect(description).toContain('Booked at:');
  });
});

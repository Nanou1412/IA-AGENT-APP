/**
 * Twilio Webhook Utilities
 * 
 * Shared utilities for Twilio webhook handling.
 * Extracted to reduce code duplication across webhook routes.
 */

import { NextRequest } from 'next/server';

// ============================================================================
// Form Body Parsing
// ============================================================================

/**
 * Parse URL-encoded form body from Twilio webhook
 * Twilio sends webhooks as application/x-www-form-urlencoded
 */
export async function parseFormBody(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  const params: Record<string, string> = {};
  
  for (const pair of text.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  
  return params;
}

// ============================================================================
// Runtime Assertions
// ============================================================================

/**
 * Assert that required webhook fields are present
 * @throws Error if any required field is missing or empty
 */
export function assertRequiredFields<T extends Record<string, unknown>>(
  payload: T,
  requiredFields: (keyof T)[],
  context: string
): void {
  const missing: string[] = [];
  
  for (const field of requiredFields) {
    const value = payload[field];
    if (value === undefined || value === null || value === '') {
      missing.push(String(field));
    }
  }
  
  if (missing.length > 0) {
    throw new WebhookValidationError(
      `Missing required fields in ${context}: ${missing.join(', ')}`,
      missing
    );
  }
}

/**
 * Assert that a string field matches an expected pattern
 */
export function assertFieldPattern(
  value: string,
  pattern: RegExp,
  fieldName: string,
  context: string
): void {
  if (!pattern.test(value)) {
    throw new WebhookValidationError(
      `Invalid ${fieldName} format in ${context}: ${value}`,
      [fieldName]
    );
  }
}

/**
 * Assert that a phone number is in valid format
 * Accepts E.164 format or local Australian format
 */
export function assertValidPhone(phone: string, fieldName: string, context: string): void {
  // E.164: +[country][number], e.g., +61412345678
  // Australian local: 04xxxxxxxx (10 digits starting with 04)
  const e164Pattern = /^\+[1-9]\d{6,14}$/;
  const auLocalPattern = /^0[45]\d{8}$/;
  
  if (!e164Pattern.test(phone) && !auLocalPattern.test(phone)) {
    throw new WebhookValidationError(
      `Invalid phone number format for ${fieldName} in ${context}: ${phone}`,
      [fieldName]
    );
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

/**
 * Custom error for webhook validation failures
 */
export class WebhookValidationError extends Error {
  readonly missingFields: string[];
  
  constructor(message: string, missingFields: string[] = []) {
    super(message);
    this.name = 'WebhookValidationError';
    this.missingFields = missingFields;
  }
}

// ============================================================================
// Twilio Specific Patterns
// ============================================================================

/** Pattern for Twilio Message SID (SMS/WhatsApp) */
export const MESSAGE_SID_PATTERN = /^SM[a-f0-9]{32}$/i;

/** Pattern for Twilio Call SID */
export const CALL_SID_PATTERN = /^CA[a-f0-9]{32}$/i;

/** Pattern for Twilio Account SID */
export const ACCOUNT_SID_PATTERN = /^AC[a-f0-9]{32}$/i;

/**
 * Validate a Twilio SID format
 */
export function isValidTwilioSid(sid: string, type: 'message' | 'call' | 'account'): boolean {
  switch (type) {
    case 'message':
      return MESSAGE_SID_PATTERN.test(sid);
    case 'call':
      return CALL_SID_PATTERN.test(sid);
    case 'account':
      return ACCOUNT_SID_PATTERN.test(sid);
    default:
      return false;
  }
}

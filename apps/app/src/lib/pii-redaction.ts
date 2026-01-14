/**
 * PII Redaction Utilities
 * 
 * SECURITY (F-011): Redacts/masks personally identifiable information in logs
 * to prevent sensitive data exposure.
 */

import crypto from 'crypto';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Redact a phone number for logging
 * In production: Shows only last 4 digits (e.g., "***4567")
 * In development: Shows full number
 */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return '(none)';
  
  if (!IS_PRODUCTION) {
    return phone;
  }
  
  // Remove non-digit characters for processing
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 4) {
    return '***';
  }
  
  // Show last 4 digits
  return `***${digits.slice(-4)}`;
}

/**
 * Hash a phone number for logging (one-way)
 * Useful for correlation without exposing the actual number
 */
export function hashPhone(phone: string | null | undefined): string {
  if (!phone) return '(none)';
  
  // Normalize phone number
  const normalized = phone.replace(/\D/g, '');
  
  if (!IS_PRODUCTION) {
    return phone;
  }
  
  // Create SHA256 hash, truncate to 8 chars for readability
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 8);
}

/**
 * Redact an email for logging
 * Shows first char + "***" + domain (e.g., "j***@example.com")
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return '(none)';
  
  if (!IS_PRODUCTION) {
    return email;
  }
  
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  
  const firstChar = local?.charAt(0) || '';
  return `${firstChar}***@${domain}`;
}

/**
 * Redact a customer name for logging
 * Shows first name initial + last name initial (e.g., "J.D.")
 */
export function redactName(name: string | null | undefined): string {
  if (!name) return '(none)';
  
  if (!IS_PRODUCTION) {
    return name;
  }
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '***';
  
  if (parts.length === 1) {
    return `${parts[0].charAt(0)}.`;
  }
  
  return `${parts[0].charAt(0)}.${parts[parts.length - 1].charAt(0)}.`;
}

/**
 * Create a safe log object with PII redacted
 */
export function safeLogContext(context: {
  from?: string | null;
  to?: string | null;
  phone?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  email?: string | null;
  [key: string]: unknown;
}): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(context)) {
    if (key === 'from' || key === 'to' || key === 'phone' || key === 'customerPhone') {
      safe[key] = redactPhone(value as string);
    } else if (key === 'email') {
      safe[key] = redactEmail(value as string);
    } else if (key === 'customerName') {
      safe[key] = redactName(value as string);
    } else {
      safe[key] = value;
    }
  }
  
  return safe;
}

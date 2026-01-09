/**
 * Twilio Client Configuration
 * 
 * Server-side only - NEVER import on client.
 * Provides Twilio client instance and configuration.
 */

import Twilio from 'twilio';
import type { NextRequest } from 'next/server';

// ============================================================================
// Environment Variables
// ============================================================================

export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
export const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

// App URL for webhook signature validation (fallback only)
// IMPORTANT: Must match the production URL for signature validation to work
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ia-agent-app-app.vercel.app';

// ============================================================================
// Twilio Client
// ============================================================================

/**
 * Twilio REST client instance
 * Lazy-initialized to avoid issues when env vars are not set
 */
let twilioClient: Twilio.Twilio | null = null;

export function getTwilioClient(): Twilio.Twilio {
  if (!twilioClient) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
    }
    twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// ============================================================================
// Phone Number Normalization
// ============================================================================

/**
 * Normalize a phone number to E.164 format
 * Handles various input formats and WhatsApp prefix
 * 
 * @param phoneNumber - Raw phone number string
 * @param channel - 'sms' or 'whatsapp'
 * @returns Normalized phone number
 */
export function normalizePhoneNumber(phoneNumber: string, channel: 'sms' | 'whatsapp' = 'sms'): string {
  // Remove whitespace
  let normalized = phoneNumber.trim();
  
  // Handle WhatsApp prefix
  const hasWhatsAppPrefix = normalized.toLowerCase().startsWith('whatsapp:');
  if (hasWhatsAppPrefix) {
    normalized = normalized.slice(9); // Remove 'whatsapp:'
  }
  
  // Remove all non-digit characters except leading +
  const hasPlus = normalized.startsWith('+');
  normalized = normalized.replace(/[^\d]/g, '');
  
  // Re-add + if it was there
  if (hasPlus) {
    normalized = '+' + normalized;
  } else if (!normalized.startsWith('+')) {
    // Assume international format without +
    normalized = '+' + normalized;
  }
  
  // Add WhatsApp prefix for whatsapp channel
  if (channel === 'whatsapp') {
    return `whatsapp:${normalized}`;
  }
  
  return normalized;
}

/**
 * Extract raw phone number without WhatsApp prefix
 */
export function stripWhatsAppPrefix(phoneNumber: string): string {
  if (phoneNumber.toLowerCase().startsWith('whatsapp:')) {
    return phoneNumber.slice(9);
  }
  return phoneNumber;
}

/**
 * Check if a phone number has WhatsApp prefix
 */
export function isWhatsAppNumber(phoneNumber: string): boolean {
  return phoneNumber.toLowerCase().startsWith('whatsapp:');
}

// ============================================================================
// Signature Validation
// ============================================================================

/**
 * Get the public-facing URL from a Next.js request
 * Handles proxy headers (x-forwarded-proto, x-forwarded-host) for accurate URL reconstruction
 * Critical for Twilio signature validation behind Vercel/reverse proxies
 * 
 * @param req - NextRequest object
 * @returns Full public URL string
 */
export function getPublicRequestUrl(req: NextRequest): string {
  // Priority 1: Use forwarded headers (proxy/Vercel)
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  
  // Priority 2: Use host header
  const hostHeader = req.headers.get('host');
  
  // Determine protocol
  const protocol = forwardedProto || 'https';
  
  // Determine host
  const host = forwardedHost || hostHeader || new URL(APP_URL).host;
  
  // Get path and search from the request URL
  const pathname = req.nextUrl.pathname;
  const search = req.nextUrl.search || '';
  
  return `${protocol}://${host}${pathname}${search}`;
}

/**
 * Validate Twilio webhook signature
 * 
 * @param signature - X-Twilio-Signature header
 * @param url - Full webhook URL (use getPublicRequestUrl for accuracy)
 * @param params - Request parameters (form body)
 * @returns true if signature is valid
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (!TWILIO_AUTH_TOKEN) {
    console.error('[twilio] AUTH_TOKEN not set, cannot validate signature');
    return false;
  }
  
  return Twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, params);
}

/**
 * Validate Twilio signature from request with automatic URL detection
 * Logs audit event on failure
 * 
 * @param req - NextRequest object
 * @param params - Parsed form body parameters
 * @returns Object with valid flag and detected URL
 */
export function validateTwilioRequestSignature(
  req: NextRequest,
  params: Record<string, string>
): { valid: boolean; url: string } {
  const signature = req.headers.get('x-twilio-signature') || '';
  const url = getPublicRequestUrl(req);
  
  if (!signature) {
    console.warn('[twilio] Missing X-Twilio-Signature header');
    return { valid: false, url };
  }
  
  const valid = validateTwilioSignature(signature, url, params);
  
  if (!valid) {
    console.error('[twilio] Invalid signature for URL:', url);
  }
  
  return { valid, url };
}

// ============================================================================
// TwiML Helpers
// ============================================================================

/**
 * Generate TwiML response for messaging
 * 
 * @param message - Message to send (or null for empty response)
 * @returns TwiML XML string
 */
export function generateTwiMLResponse(message: string | null): string {
  if (message) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  }
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// Default Messages (English - AU target market)
// ============================================================================

/**
 * Default message when access is denied (sandbox/billing/config)
 */
export const DEFAULT_DENIED_TEXT = "Thanks for your message. Our team will be in touch with you shortly.";

/**
 * Default message for unmapped numbers (no org found)
 */
export const DEFAULT_UNMAPPED_TEXT = "This number is not configured. Please contact support.";

/**
 * Default acknowledgment message (placeholder for AI runtime)
 */
export const DEFAULT_INBOUND_REPLY_TEXT = "Thanks for your message! Our team will get back to you shortly.";

/**
 * Default handoff message (when escalating to human)
 */
export const DEFAULT_HANDOFF_TEXT = "Thanks for reaching out. A team member will follow up with you soon.";

// Legacy FR constants (deprecated - use DEFAULT_* instead)
/** @deprecated Use DEFAULT_DENIED_TEXT */
export const DENIED_MESSAGE_FR = DEFAULT_DENIED_TEXT;
/** @deprecated Use DEFAULT_UNMAPPED_TEXT */
export const UNMAPPED_MESSAGE_FR = DEFAULT_UNMAPPED_TEXT;
/** @deprecated Use DEFAULT_INBOUND_REPLY_TEXT */
export const ACK_MESSAGE_FR = DEFAULT_INBOUND_REPLY_TEXT;

// ============================================================================
// Types
// ============================================================================

export interface TwilioInboundPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  NumSegments?: string;
  SmsStatus?: string;
  ApiVersion?: string;
  // WhatsApp specific
  ProfileName?: string;
  WaId?: string;
  // Additional fields
  [key: string]: string | undefined;
}

export interface TwilioStatusPayload {
  MessageSid: string;
  MessageStatus: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  To: string;
  From: string;
  [key: string]: string | undefined;
}

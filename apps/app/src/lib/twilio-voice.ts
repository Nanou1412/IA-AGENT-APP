/**
 * Twilio Voice Helpers (Phase 5)
 * 
 * Server-side only - NEVER import on client.
 * Provides TwiML generation and voice-specific utilities.
 */

import { prisma } from '@/lib/prisma';
import { CallDirection, MessagingChannel } from '@prisma/client';
import type { OrgSettings } from '@prisma/client';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  validateTwilioRequestSignature,
} from '@/lib/twilio';

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { getPublicRequestUrl, validateTwilioSignature, validateTwilioRequestSignature };

// ============================================================================
// Default Voice Messages (English - AU target market)
// ============================================================================

/**
 * Default welcome message when call is answered
 */
export const DEFAULT_CALL_WELCOME_TEXT = "Thanks for calling. Please hold while we connect you to our team.";

/**
 * Default message during queue wait
 */
export const DEFAULT_CALL_QUEUE_WAIT_TEXT = "Thank you for your patience. Your call is important to us. Please continue to hold.";

/**
 * Default message when access is denied (sandbox/billing/config)
 */
export const DEFAULT_CALL_DENY_TEXT = "We're sorry, we are unable to take your call at this time. Please try again later or contact us through our website.";

/**
 * Default message when no handoff number is configured
 */
export const DEFAULT_NO_HANDOFF_TEXT = "Thanks for calling. Our team will call you back as soon as possible. Goodbye.";

/**
 * Default message for unmapped numbers (no org found)
 */
export const DEFAULT_UNMAPPED_CALL_TEXT = "This number is not configured to receive calls. Please contact support.";

// ============================================================================
// Voice Configuration Interface
// ============================================================================

export interface VoiceConfig {
  voiceEnabled: boolean;
  callQueueEnabled: boolean;
  callWelcomeText: string;
  callQueueWaitText: string;
  callDenyText: string;
  callHandoffNumber: string | null;
  recordCalls: boolean;
}

/**
 * Get voice configuration for an org with EN fallbacks
 */
export async function getVoiceConfig(orgId: string): Promise<VoiceConfig> {
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: {
      voiceEnabled: true,
      callQueueEnabled: true,
      callWelcomeText: true,
      callQueueWaitText: true,
      callDenyText: true,
      callHandoffNumber: true,
      recordCalls: true,
    },
  });

  return {
    voiceEnabled: settings?.voiceEnabled ?? false,
    callQueueEnabled: settings?.callQueueEnabled ?? true,
    callWelcomeText: settings?.callWelcomeText || DEFAULT_CALL_WELCOME_TEXT,
    callQueueWaitText: settings?.callQueueWaitText || DEFAULT_CALL_QUEUE_WAIT_TEXT,
    callDenyText: settings?.callDenyText || DEFAULT_CALL_DENY_TEXT,
    callHandoffNumber: settings?.callHandoffNumber || null,
    recordCalls: settings?.recordCalls ?? false,
  };
}

/**
 * Get voice config from settings object (no DB call)
 */
export function getVoiceConfigFromSettings(settings: Partial<OrgSettings> | null): VoiceConfig {
  return {
    voiceEnabled: settings?.voiceEnabled ?? false,
    callQueueEnabled: settings?.callQueueEnabled ?? true,
    callWelcomeText: settings?.callWelcomeText || DEFAULT_CALL_WELCOME_TEXT,
    callQueueWaitText: settings?.callQueueWaitText || DEFAULT_CALL_QUEUE_WAIT_TEXT,
    callDenyText: settings?.callDenyText || DEFAULT_CALL_DENY_TEXT,
    callHandoffNumber: settings?.callHandoffNumber || null,
    recordCalls: settings?.recordCalls ?? false,
  };
}

// ============================================================================
// TwiML Generation
// ============================================================================

/**
 * Escape special XML characters for TwiML
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sanitize text for TTS (Text-to-Speech)
 * Removes/replaces characters that might cause TTS issues
 */
export function safeTextToSay(text: string): string {
  return escapeXml(
    text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '')
  );
}

/**
 * Generate TwiML for voice response
 */
export function generateVoiceTwiML(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}

/**
 * Generate TwiML to say a message
 * Note: Using 'alice' voice (Twilio standard) instead of Polly.Olivia which requires AWS Polly integration
 */
export function sayTwiML(message: string, options?: { voice?: string; language?: string }): string {
  const voice = options?.voice || 'alice'; // Twilio standard voice (en-AU compatible)
  const language = options?.language || 'en-AU';
  const safeMessage = safeTextToSay(message);
  return `<Say voice="${voice}" language="${language}">${safeMessage}</Say>`;
}

/**
 * Generate TwiML to hang up
 */
export function hangupTwiML(): string {
  return '<Hangup/>';
}

/**
 * Generate TwiML for a pause
 */
export function pauseTwiML(seconds: number = 1): string {
  return `<Pause length="${seconds}"/>`;
}

/**
 * Generate TwiML to enqueue a call
 */
export function enqueueTwiML(
  queueName: string,
  waitUrl: string,
  options?: { action?: string }
): string {
  const actionAttr = options?.action ? ` action="${options.action}"` : '';
  return `<Enqueue waitUrl="${waitUrl}"${actionAttr}>${escapeXml(queueName)}</Enqueue>`;
}

/**
 * Generate TwiML to dial a number
 */
export function dialTwiML(
  number: string,
  options?: { 
    record?: 'record-from-answer' | 'record-from-ringing' | 'do-not-record';
    recordingStatusCallback?: string;
    timeout?: number;
    callerId?: string;
    action?: string;
  }
): string {
  const attrs: string[] = [];
  
  if (options?.record) {
    attrs.push(`record="${options.record}"`);
  }
  if (options?.recordingStatusCallback) {
    attrs.push(`recordingStatusCallback="${options.recordingStatusCallback}"`);
  }
  if (options?.timeout) {
    attrs.push(`timeout="${options.timeout}"`);
  }
  if (options?.callerId) {
    attrs.push(`callerId="${options.callerId}"`);
  }
  if (options?.action) {
    attrs.push(`action="${options.action}"`);
  }
  
  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  return `<Dial${attrStr}><Number>${escapeXml(number)}</Number></Dial>`;
}

// ============================================================================
// Call Flow TwiML Builders
// ============================================================================

/**
 * Generate TwiML for denied call
 */
export function generateDeniedCallTwiML(denyText: string): string {
  return generateVoiceTwiML(
    sayTwiML(denyText) + hangupTwiML()
  );
}

/**
 * Generate TwiML for unmapped call (no org found)
 */
export function generateUnmappedCallTwiML(text?: string): string {
  return generateVoiceTwiML(
    sayTwiML(text || DEFAULT_UNMAPPED_CALL_TEXT) + hangupTwiML()
  );
}

/**
 * Generate TwiML for welcome + queue
 */
export function generateWelcomeWithQueueTwiML(
  orgId: string,
  welcomeText: string,
  waitUrl: string,
  options?: { actionUrl?: string }
): string {
  const queueName = `org_${orgId}`;
  return generateVoiceTwiML(
    sayTwiML(welcomeText) +
    enqueueTwiML(queueName, waitUrl, { action: options?.actionUrl })
  );
}

/**
 * Generate TwiML for welcome + direct dial (no queue)
 */
export function generateWelcomeWithDialTwiML(
  welcomeText: string,
  handoffNumber: string,
  options?: {
    record?: boolean;
    recordingStatusCallback?: string;
    callerId?: string;
  }
): string {
  return generateVoiceTwiML(
    sayTwiML(welcomeText) +
    dialTwiML(handoffNumber, {
      record: options?.record ? 'record-from-answer' : undefined,
      recordingStatusCallback: options?.recordingStatusCallback,
      callerId: options?.callerId,
      timeout: 30,
    })
  );
}

/**
 * Generate TwiML for welcome + no handoff fallback
 */
export function generateNoHandoffTwiML(welcomeText: string, fallbackText?: string): string {
  return generateVoiceTwiML(
    sayTwiML(welcomeText) +
    pauseTwiML(1) +
    sayTwiML(fallbackText || DEFAULT_NO_HANDOFF_TEXT) +
    hangupTwiML()
  );
}

/**
 * Generate TwiML for queue wait message
 */
export function generateQueueWaitTwiML(waitText: string, pauseSeconds: number = 10): string {
  return generateVoiceTwiML(
    sayTwiML(waitText) + pauseTwiML(pauseSeconds)
  );
}

/**
 * Generate TwiML for DTMF menu using Gather
 * Keeps call alive waiting for user input
 */
export function generateGatherMenuTwiML(
  welcomeText: string,
  inputActionUrl: string,
  options?: { voice?: string; language?: string }
): string {
  const voice = options?.voice || 'alice';
  const language = options?.language || 'en-AU';
  const menuText = 'Press 1 for orders. Press 2 for information. Press 3 to speak with our team.';
  
  const gatherContent = 
    `<Gather numDigits="1" timeout="5" action="${escapeXml(inputActionUrl)}" method="POST">` +
    sayTwiML(welcomeText + ' ' + menuText, { voice, language }) +
    `</Gather>`;
  
  const fallback = 
    sayTwiML('No input received. Goodbye.', { voice, language }) +
    hangupTwiML();
  
  return generateVoiceTwiML(gatherContent + fallback);
}

// ============================================================================
// Call Log Helpers
// ============================================================================

export interface CreateCallLogInput {
  orgId?: string;
  endpointId?: string;
  twilioCallSid: string;
  from: string;
  to: string;
  direction?: CallDirection;
  status?: string;
  blockedBy?: string;
  denyReason?: string;
  raw?: Record<string, unknown>;
}

/**
 * Create a call log entry (idempotent via unique CallSid)
 * Returns existing log if duplicate
 */
export async function createCallLog(input: CreateCallLogInput): Promise<{
  id: string;
  isDuplicate: boolean;
}> {
  const {
    orgId,
    endpointId,
    twilioCallSid,
    from,
    to,
    direction = CallDirection.inbound,
    status = 'initiated',
    blockedBy,
    denyReason,
    raw = {},
  } = input;

  // Check for existing (idempotency)
  const existing = await prisma.callLog.findUnique({
    where: { twilioCallSid },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  // Create new log
  const callLog = await prisma.callLog.create({
    data: {
      orgId,
      endpointId,
      twilioCallSid,
      from,
      to,
      direction,
      status,
      blockedBy,
      denyReason,
      raw: raw as object,
    },
    select: { id: true },
  });

  return { id: callLog.id, isDuplicate: false };
}

/**
 * Update call log status (for status callbacks)
 */
export async function updateCallLogStatus(
  twilioCallSid: string,
  status: string,
  options?: {
    durationSeconds?: number;
    recordingUrl?: string;
  }
): Promise<void> {
  await prisma.callLog.update({
    where: { twilioCallSid },
    data: {
      status,
      endedAt: ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)
        ? new Date()
        : undefined,
      durationSeconds: options?.durationSeconds,
      recordingUrl: options?.recordingUrl,
    },
  });
}

/**
 * Update call log with denied info
 */
export async function updateCallLogDenied(
  twilioCallSid: string,
  blockedBy: string,
  denyReason: string
): Promise<void> {
  await prisma.callLog.update({
    where: { twilioCallSid },
    data: {
      blockedBy,
      denyReason,
      status: 'denied',
    },
  });
}

// ============================================================================
// Org Resolution
// ============================================================================

/**
 * Resolve org from Twilio phone number for voice calls
 * Extends existing resolveOrgFromTwilioNumber pattern
 */
export async function resolveOrgFromVoiceNumber(
  twilioPhoneNumber: string
): Promise<{ orgId: string; endpointId: string } | null> {
  // Normalize: voice numbers don't have prefixes
  const normalized = twilioPhoneNumber.replace(/[^\d+]/g, '');
  
  console.log(`[resolveOrgFromVoiceNumber] Input: "${twilioPhoneNumber}" -> Normalized: "${normalized}"`);
  
  const endpoint = await prisma.channelEndpoint.findFirst({
    where: {
      channel: MessagingChannel.voice,
      twilioPhoneNumber: normalized,
      isActive: true,
    },
    select: {
      id: true,
      orgId: true,
    },
  });

  console.log(`[resolveOrgFromVoiceNumber] Query result:`, endpoint ? `id=${endpoint.id}` : 'null');

  if (!endpoint) {
    return null;
  }

  return {
    orgId: endpoint.orgId,
    endpointId: endpoint.id,
  };
}

/**
 * Get org settings for voice gating
 */
export async function getOrgSettingsForVoice(orgId: string) {
  return prisma.orgSettings.findUnique({
    where: { orgId },
    include: {
      org: {
        include: {
          industryConfig: true,
        },
      },
    },
  });
}

// ============================================================================
// Twilio Voice Payload Types
// ============================================================================

export interface TwilioVoiceInboundPayload {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: string; // 'ringing' | 'in-progress' | etc.
  Direction: string; // 'inbound' | 'outbound-api' | 'outbound-dial'
  ApiVersion: string;
  ForwardedFrom?: string;
  CallerName?: string;
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;
  [key: string]: string | undefined;
}

export interface TwilioVoiceStatusPayload {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: string; // 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled'
  CallDuration?: string;
  Direction?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  [key: string]: string | undefined;
}

export interface TwilioQueueWaitPayload {
  CallSid: string;
  AccountSid: string;
  QueueName?: string;
  QueueTime?: string;
  QueuePosition?: string;
  AvgQueueTime?: string;
  [key: string]: string | undefined;
}

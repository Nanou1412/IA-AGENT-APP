/**
 * Customer SMS Notifications
 * 
 * System-initiated SMS notifications to customers.
 * Unlike user-triggered actions, these don't require authentication.
 * 
 * Used for:
 * - Payment link delivery
 * - Order confirmation after payment
 * - Booking confirmation
 * 
 * All functions include proper gating, logging, and audit trails.
 */

import { prisma } from '@/lib/prisma';
import { getTwilioClient, TWILIO_MESSAGING_SERVICE_SID, normalizePhoneNumber } from '@/lib/twilio';
import {
  getActiveEndpointForOrg,
  createMessageLog,
  logTwilioAudit,
  isChannelEnabledForOrg,
} from '@/lib/twilio-helpers';
import { canUseModuleWithKillSwitch } from '@/lib/feature-gating';
import { MessagingChannel } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface SystemSmsResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  blockedBy?: 'sandbox' | 'billing' | 'config' | 'no_endpoint' | 'feature_disabled';
}

export interface SystemSmsInput {
  orgId: string;
  to: string;
  body: string;
  /** Optional context for audit logging */
  context?: {
    orderId?: string;
    bookingId?: string;
    action?: string;
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function getOrgWithSettings(orgId: string) {
  return prisma.org.findUnique({
    where: { id: orgId },
    include: {
      settings: true,
      industryConfig: true,
    },
  });
}

// ============================================================================
// Core System SMS Function
// ============================================================================

/**
 * Send a system-initiated SMS to a customer
 * 
 * This function does NOT require user authentication.
 * It's designed for automated notifications triggered by system events.
 */
export async function sendSystemSms(input: SystemSmsInput): Promise<SystemSmsResult> {
  const { orgId, to, body, context } = input;
  const channel: MessagingChannel = 'sms';

  // Get org with settings
  const org = await getOrgWithSettings(orgId);
  if (!org) {
    console.error('[customer-notifications] Org not found:', orgId);
    return { success: false, error: 'Organisation not found' };
  }

  // Feature gating check (includes kill switch)
  const gatingResult = canUseModuleWithKillSwitch('sms', {
    org,
    settings: org.settings,
  });

  if (!gatingResult.allowed) {
    await logTwilioAudit('twilio.system.blocked', {
      channel,
      blockedBy: gatingResult.blockedBy,
      reason: gatingResult.reason,
      to,
      ...context,
    }, { orgId, actorUserId: 'system' });

    return {
      success: false,
      blockedBy: gatingResult.blockedBy as SystemSmsResult['blockedBy'],
      error: gatingResult.reason || 'SMS feature not available',
    };
  }

  // Check if SMS channel is enabled for org
  const channelEnabled = await isChannelEnabledForOrg(orgId, channel);
  if (!channelEnabled) {
    await logTwilioAudit('twilio.system.channel_disabled', {
      channel,
      to,
      ...context,
    }, { orgId, actorUserId: 'system' });

    return {
      success: false,
      blockedBy: 'feature_disabled',
      error: 'SMS is not enabled for this organisation',
    };
  }

  // Get active endpoint for this org and channel
  const endpoint = await getActiveEndpointForOrg(orgId, channel);
  if (!endpoint) {
    await logTwilioAudit('twilio.system.no_endpoint', {
      channel,
      to,
      ...context,
    }, { orgId, actorUserId: 'system' });

    return {
      success: false,
      blockedBy: 'no_endpoint',
      error: 'No SMS number configured',
    };
  }

  // Normalize destination number
  const normalizedTo = normalizePhoneNumber(to, 'sms');

  try {
    const client = getTwilioClient();

    // Build message options
    const messageOptions: {
      body: string;
      to: string;
      from?: string;
      messagingServiceSid?: string;
      statusCallback?: string;
    } = {
      body,
      to: normalizedTo,
    };

    // Use messaging service if configured, otherwise use endpoint number
    if (TWILIO_MESSAGING_SERVICE_SID) {
      messageOptions.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    } else {
      messageOptions.from = endpoint.twilioPhoneNumber;
    }

    // Status callback URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ia-agent-app-app.vercel.app';
    messageOptions.statusCallback = `${appUrl}/api/twilio/status`;

    const message = await client.messages.create(messageOptions);

    // Log the outbound message
    await createMessageLog({
      orgId,
      endpointId: endpoint.endpointId,
      channel,
      direction: 'outbound',
      twilioMessageSid: message.sid,
      from: endpoint.twilioPhoneNumber,
      to: normalizedTo,
      body,
      status: message.status,
    });

    await logTwilioAudit('twilio.system.sent', {
      channel,
      messageSid: message.sid,
      from: endpoint.twilioPhoneNumber,
      to: normalizedTo,
      bodyPreview: body.substring(0, 50),
      ...context,
    }, { orgId, actorUserId: 'system' });

    return {
      success: true,
      messageSid: message.sid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as { code?: number })?.code?.toString();

    // Log failure
    await createMessageLog({
      orgId,
      endpointId: endpoint.endpointId,
      channel,
      direction: 'outbound',
      from: endpoint.twilioPhoneNumber,
      to: normalizedTo,
      body,
      status: 'failed',
      errorCode,
      errorMessage,
    });

    await logTwilioAudit('twilio.system.error', {
      channel,
      error: errorMessage,
      errorCode,
      to: normalizedTo,
      ...context,
    }, { orgId, actorUserId: 'system' });

    console.error('[customer-notifications] Failed to send SMS:', error);

    return {
      success: false,
      error: `Failed to send SMS: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Order Notifications
// ============================================================================

/**
 * Send payment link SMS to customer
 */
export async function sendPaymentLinkSms(params: {
  orgId: string;
  customerPhone: string;
  orderId: string;
  shortOrderId: string;
  paymentUrl: string;
  expiresMinutes: number;
}): Promise<SystemSmsResult> {
  const { orgId, customerPhone, orderId, shortOrderId, paymentUrl, expiresMinutes } = params;

  const message = 
    `Order #${shortOrderId}: Please complete your payment to confirm.\n\n` +
    `Pay here: ${paymentUrl}\n\n` +
    `This link expires in ${expiresMinutes} minutes.`;

  return sendSystemSms({
    orgId,
    to: customerPhone,
    body: message,
    context: {
      orderId,
      action: 'payment_link_sent',
    },
  });
}

/**
 * Send order confirmation SMS after successful payment
 */
export async function sendOrderConfirmationSms(params: {
  orgId: string;
  customerPhone: string;
  orderId: string;
  shortOrderId: string;
  pickupTime?: string;
  customerName?: string;
}): Promise<SystemSmsResult> {
  const { orgId, customerPhone, orderId, shortOrderId, pickupTime, customerName } = params;

  let message = `Payment received! Your order #${shortOrderId} is now confirmed.`;
  
  if (pickupTime) {
    message += `\n\nPickup: ${pickupTime}`;
  }
  
  if (customerName) {
    message += `\n\nThank you, ${customerName}!`;
  } else {
    message += `\n\nThank you for your order!`;
  }

  return sendSystemSms({
    orgId,
    to: customerPhone,
    body: message,
    context: {
      orderId,
      action: 'order_confirmed',
    },
  });
}

// ============================================================================
// Booking Notifications
// ============================================================================

/**
 * Send booking confirmation SMS
 */
export async function sendBookingConfirmationSms(params: {
  orgId: string;
  customerPhone: string;
  customerName: string;
  partySize: number;
  dateTime: string;
  bookingId?: string;
  businessName?: string;
}): Promise<SystemSmsResult> {
  const { orgId, customerPhone, customerName, partySize, dateTime, bookingId, businessName } = params;

  let message = `Hi ${customerName}, your booking is confirmed!\n\n`;
  message += `📅 ${dateTime}\n`;
  message += `👥 ${partySize} ${partySize === 1 ? 'guest' : 'guests'}`;
  
  if (businessName) {
    message += `\n\nSee you at ${businessName}!`;
  } else {
    message += `\n\nWe look forward to seeing you!`;
  }

  return sendSystemSms({
    orgId,
    to: customerPhone,
    body: message,
    context: {
      bookingId,
      action: 'booking_confirmed',
    },
  });
}

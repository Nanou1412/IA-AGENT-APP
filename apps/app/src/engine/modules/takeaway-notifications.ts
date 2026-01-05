/**
 * Takeaway Order Business Notifications
 * 
 * Handles notifying the business when a new order is confirmed.
 * Uses existing SMS/WhatsApp infrastructure with proper gating.
 */

import { prisma } from '@/lib/prisma';
import { sendSms, sendWhatsApp } from '@/actions/twilio';
import { OrderEventType } from '@prisma/client';
import { logOrderEvent, getShortOrderId, formatPickupTime } from '@/lib/takeaway/order-manager';
import { renderTemplate, type TakeawayConfig } from '@/lib/takeaway/takeaway-config';
import type { FeatureGateResult } from '@/lib/feature-gating';

// ============================================================================
// Types
// ============================================================================

export interface NotificationResult {
  success: boolean;
  method?: 'sms' | 'whatsapp' | 'none';
  error?: string;
}

// ============================================================================
// Business Notification
// ============================================================================

/**
 * Notify business of a new confirmed order
 */
export async function notifyBusinessOfOrder(
  orgId: string,
  orderId: string,
  config: TakeawayConfig,
  canUseModule: (module: string) => FeatureGateResult
): Promise<NotificationResult> {
  // Get order with items
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  // Check if notifications are configured
  if (!config.notifications.notifyTo) {
    // Fall back to handoffSmsTo from org settings
    const orgSettings = await prisma.orgSettings.findUnique({
      where: { orgId },
      select: { handoffSmsTo: true },
    });

    if (!orgSettings?.handoffSmsTo) {
      await logOrderEvent(orderId, OrderEventType.notification_failed, {
        reason: 'No notification phone configured',
      });
      
      // Not a failure - just no notification configured
      return { success: true, method: 'none' };
    }

    // Use handoffSmsTo as fallback
    config = {
      ...config,
      notifications: {
        ...config.notifications,
        notifyTo: orgSettings.handoffSmsTo,
      },
    };
  }

  // Build notification message
  const shortId = getShortOrderId(orderId);
  const pickupTimeStr = formatPickupTime(order.pickupTime, order.pickupMode);
  
  const itemsList = order.items
    .map(item => {
      let line = `  ${item.quantity}x ${item.name}`;
      if (item.options && typeof item.options === 'object') {
        const opts = item.options as Record<string, unknown>;
        if (Object.keys(opts).length > 0) {
          line += ` (${JSON.stringify(opts)})`;
        }
      }
      return line;
    })
    .join('\n');

  const notesSection = order.notes ? `Notes: ${order.notes}` : '';

  const message = renderTemplate(config.templates.businessNotificationText, {
    orderId: shortId,
    customerName: order.customerName || 'Not provided',
    customerPhone: order.customerPhone,
    pickupTime: pickupTimeStr,
    itemsList,
    notes: notesSection,
  });

  // Try SMS first if enabled
  if (config.notifications.notifyBySms) {
    const smsGating = canUseModule('sms');
    
    if (smsGating.allowed) {
      try {
        const result = await sendSms({
          orgId,
          to: config.notifications.notifyTo!,
          body: message,
        });

        if (result.success) {
          await logOrderEvent(orderId, OrderEventType.notification_sent, {
            method: 'sms',
            to: config.notifications.notifyTo,
            messageSid: result.messageSid,
          });

          await prisma.auditLog.create({
            data: {
              orgId,
              actorUserId: 'system',
              action: 'takeaway.notification_sent',
              details: {
                orderId,
                method: 'sms',
                to: config.notifications.notifyTo,
              },
            },
          });

          return { success: true, method: 'sms' };
        } else {
          console.error('[takeaway-notifications] SMS failed:', result.error);
        }
      } catch (error) {
        console.error('[takeaway-notifications] SMS error:', error);
      }
    } else {
      // SMS module blocked
      await logOrderEvent(orderId, OrderEventType.notification_failed, {
        reason: 'sms_module_blocked',
        blockedBy: smsGating.blockedBy,
      });

      await prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: 'system',
          action: 'takeaway.notification_blocked',
          details: {
            orderId,
            method: 'sms',
            reason: smsGating.reason,
          },
        },
      });
    }
  }

  // Try WhatsApp if SMS failed or not enabled
  if (config.notifications.notifyByWhatsApp) {
    const whatsappGating = canUseModule('whatsapp');
    
    if (whatsappGating.allowed) {
      try {
        const result = await sendWhatsApp({
          orgId,
          to: config.notifications.notifyTo!,
          body: message,
        });

        if (result.success) {
          await logOrderEvent(orderId, OrderEventType.notification_sent, {
            method: 'whatsapp',
            to: config.notifications.notifyTo,
            messageSid: result.messageSid,
          });

          await prisma.auditLog.create({
            data: {
              orgId,
              actorUserId: 'system',
              action: 'takeaway.notification_sent',
              details: {
                orderId,
                method: 'whatsapp',
                to: config.notifications.notifyTo,
              },
            },
          });

          return { success: true, method: 'whatsapp' };
        }
      } catch (error) {
        console.error('[takeaway-notifications] WhatsApp error:', error);
      }
    } else {
      await logOrderEvent(orderId, OrderEventType.notification_failed, {
        reason: 'whatsapp_module_blocked',
        blockedBy: whatsappGating.blockedBy,
      });
    }
  }

  // If we get here, notification failed but order is still valid
  await logOrderEvent(orderId, OrderEventType.notification_failed, {
    reason: 'all_methods_failed',
  });

  return { 
    success: false, 
    error: 'All notification methods failed - order confirmed but business not notified',
  };
}

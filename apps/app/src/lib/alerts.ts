/**
 * Alerting System
 * 
 * Simple but effective alerting for production incidents.
 * Phase 8: Production Readiness
 * 
 * Channels:
 * - Console (always, for logs/monitoring)
 * - Email (SMTP, if configured)
 * - Webhook (Slack/Discord/PagerDuty, if configured)
 * 
 * Use cases:
 * - Stripe payment failures
 * - Twilio delivery issues
 * - Engine errors (high rate)
 * - Budget exceeded
 * - Abuse detected
 */

import { prisma } from '@/lib/prisma';
import { increment, METRIC_NAMES } from '@/lib/metrics';

// ============================================================================
// Types
// ============================================================================

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp?: Date;
  dedupKey?: string;
}

export interface AlertChannel {
  name: string;
  enabled: boolean;
  send: (alert: Alert) => Promise<boolean>;
}

// ============================================================================
// Configuration
// ============================================================================

interface AlertConfig {
  consoleEnabled: boolean;
  emailEnabled: boolean;
  emailTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  webhookEnabled: boolean;
  webhookUrl?: string;
  webhookType?: 'slack' | 'discord' | 'generic';
  deduplicationWindowMs: number;
}

function getAlertConfig(): AlertConfig {
  return {
    consoleEnabled: true,
    emailEnabled: !!process.env.ALERT_EMAIL_TO,
    emailTo: process.env.ALERT_EMAIL_TO,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    webhookEnabled: !!process.env.ALERT_WEBHOOK_URL,
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    webhookType: (process.env.ALERT_WEBHOOK_TYPE as 'slack' | 'discord' | 'generic') || 'slack',
    deduplicationWindowMs: parseInt(process.env.ALERT_DEDUP_WINDOW_MS || '300000', 10), // 5 min
  };
}

// ============================================================================
// Deduplication
// ============================================================================

// Simple in-memory dedup store (for single-instance deployments)
// For multi-instance, use Redis or similar
const recentAlerts = new Map<string, number>();

function isDuplicate(alert: Alert, config: AlertConfig): boolean {
  if (!alert.dedupKey) return false;
  
  const lastSent = recentAlerts.get(alert.dedupKey);
  if (!lastSent) return false;
  
  return Date.now() - lastSent < config.deduplicationWindowMs;
}

function markSent(alert: Alert): void {
  if (alert.dedupKey) {
    recentAlerts.set(alert.dedupKey, Date.now());
  }
}

// Cleanup old entries periodically
setInterval(() => {
  const config = getAlertConfig();
  const cutoff = Date.now() - config.deduplicationWindowMs * 2;
  
  for (const [key, timestamp] of recentAlerts.entries()) {
    if (timestamp < cutoff) {
      recentAlerts.delete(key);
    }
  }
}, 60000); // Every minute

// ============================================================================
// Console Channel
// ============================================================================

function formatAlertForConsole(alert: Alert): string {
  const timestamp = (alert.timestamp || new Date()).toISOString();
  const severityLabel = `[${alert.severity.toUpperCase()}]`;
  const contextStr = alert.context ? `\n  Context: ${JSON.stringify(alert.context)}` : '';
  
  return `${timestamp} ${severityLabel} ${alert.title}: ${alert.message}${contextStr}`;
}

async function sendConsoleAlert(alert: Alert): Promise<boolean> {
  const formatted = formatAlertForConsole(alert);
  
  switch (alert.severity) {
    case AlertSeverity.INFO:
      console.info('[ALERT]', formatted);
      break;
    case AlertSeverity.WARNING:
      console.warn('[ALERT]', formatted);
      break;
    case AlertSeverity.ERROR:
    case AlertSeverity.CRITICAL:
      console.error('[ALERT]', formatted);
      break;
  }
  
  return true;
}

// ============================================================================
// Email Channel
// ============================================================================

async function sendEmailAlert(alert: Alert, config: AlertConfig): Promise<boolean> {
  if (!config.emailEnabled || !config.emailTo) return false;
  
  // Simplified email sending - in production, use nodemailer or similar
  try {
    // Skip actual email sending in test/dev if SMTP not configured
    if (!config.smtpHost || !config.smtpUser) {
      console.log('[ALERT:EMAIL] Would send email:', {
        to: config.emailTo,
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        body: alert.message,
      });
      return true;
    }
    
    // Production email sending would go here
    // Using nodemailer or similar library
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer) {
      console.warn('[ALERT:EMAIL] nodemailer not available');
      return false;
    }
    
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });
    
    await transporter.sendMail({
      from: config.smtpUser,
      to: config.emailTo,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      text: `${alert.message}\n\nContext:\n${JSON.stringify(alert.context, null, 2)}`,
      html: `
        <h2>${alert.title}</h2>
        <p><strong>Severity:</strong> ${alert.severity}</p>
        <p>${alert.message}</p>
        ${alert.context ? `<pre>${JSON.stringify(alert.context, null, 2)}</pre>` : ''}
        <p><small>Sent at ${(alert.timestamp || new Date()).toISOString()}</small></p>
      `,
    });
    
    return true;
  } catch (error) {
    console.error('[ALERT:EMAIL] Failed to send email:', error);
    return false;
  }
}

// ============================================================================
// Webhook Channel
// ============================================================================

async function sendWebhookAlert(alert: Alert, config: AlertConfig): Promise<boolean> {
  if (!config.webhookEnabled || !config.webhookUrl) return false;
  
  try {
    let payload: unknown;
    
    if (config.webhookType === 'slack') {
      // Slack webhook format
      const color = {
        [AlertSeverity.INFO]: '#36a64f',
        [AlertSeverity.WARNING]: '#ffcc00',
        [AlertSeverity.ERROR]: '#ff0000',
        [AlertSeverity.CRITICAL]: '#8b0000',
      }[alert.severity];
      
      payload = {
        attachments: [{
          color,
          title: alert.title,
          text: alert.message,
          fields: Object.entries(alert.context || {}).map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true,
          })),
          footer: 'IA Agent Alert',
          ts: Math.floor((alert.timestamp || new Date()).getTime() / 1000),
        }],
      };
    } else if (config.webhookType === 'discord') {
      // Discord webhook format
      const color = {
        [AlertSeverity.INFO]: 0x36a64f,
        [AlertSeverity.WARNING]: 0xffcc00,
        [AlertSeverity.ERROR]: 0xff0000,
        [AlertSeverity.CRITICAL]: 0x8b0000,
      }[alert.severity];
      
      payload = {
        embeds: [{
          title: alert.title,
          description: alert.message,
          color,
          fields: Object.entries(alert.context || {}).map(([key, value]) => ({
            name: key,
            value: String(value),
            inline: true,
          })),
          timestamp: (alert.timestamp || new Date()).toISOString(),
        }],
      };
    } else {
      // Generic webhook format
      payload = {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        context: alert.context,
        timestamp: (alert.timestamp || new Date()).toISOString(),
      };
    }
    
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      console.error('[ALERT:WEBHOOK] Failed:', response.status, await response.text());
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[ALERT:WEBHOOK] Failed to send webhook:', error);
    return false;
  }
}

// ============================================================================
// Main Alert Function
// ============================================================================

/**
 * Send an alert through all configured channels
 */
export async function sendAlert(alert: Alert): Promise<void> {
  const config = getAlertConfig();
  
  // Add timestamp if not provided
  alert.timestamp = alert.timestamp || new Date();
  
  // Check deduplication
  if (isDuplicate(alert, config)) {
    return;
  }
  
  // Track metric
  increment(METRIC_NAMES.ALERT_SENT, {
    severity: alert.severity,
    title: alert.title.slice(0, 50),
  });
  
  // Log to audit (for persistence)
  try {
    await prisma.auditLog.create({
      data: {
        orgId: (alert.context?.orgId as string) || 'system',
        actorUserId: 'system',
        action: `alert.${alert.severity}`,
        details: JSON.parse(JSON.stringify({
          title: alert.title,
          message: alert.message,
          context: alert.context,
        })),
      },
    });
  } catch (error) {
    console.error('[ALERT] Failed to log to audit:', error);
  }
  
  // Send to all channels in parallel
  const results = await Promise.allSettled([
    config.consoleEnabled ? sendConsoleAlert(alert) : Promise.resolve(false),
    config.emailEnabled ? sendEmailAlert(alert, config) : Promise.resolve(false),
    config.webhookEnabled ? sendWebhookAlert(alert, config) : Promise.resolve(false),
  ]);
  
  // Mark as sent for deduplication
  markSent(alert);
  
  // Log channel results
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
  if (succeeded === 0 && alert.severity >= AlertSeverity.ERROR) {
    console.error('[ALERT] All channels failed for:', alert.title);
  }
}

// ============================================================================
// Pre-built Alert Helpers
// ============================================================================

/**
 * Alert for Stripe payment failure
 */
export async function alertStripePaymentFailure(
  orgId: string,
  paymentIntentId: string,
  errorMessage: string
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.WARNING,
    title: 'Stripe Payment Failed',
    message: `Payment intent ${paymentIntentId} failed: ${errorMessage}`,
    context: { orgId, paymentIntentId, errorMessage },
    dedupKey: `stripe_fail_${paymentIntentId}`,
  });
}

/**
 * Alert for Twilio delivery failure
 */
export async function alertTwilioDeliveryFailure(
  orgId: string,
  messageSid: string,
  errorCode: string
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.WARNING,
    title: 'Twilio Message Failed',
    message: `Message ${messageSid} delivery failed: ${errorCode}`,
    context: { orgId, messageSid, errorCode },
    dedupKey: `twilio_fail_${messageSid}`,
  });
}

/**
 * Alert for high engine error rate
 */
export async function alertHighEngineErrorRate(
  orgId: string,
  errorRate: number,
  window: string
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.ERROR,
    title: 'High Engine Error Rate',
    message: `Engine error rate at ${(errorRate * 100).toFixed(1)}% over ${window}`,
    context: { orgId, errorRate, window },
    dedupKey: `engine_error_rate_${orgId}`,
  });
}

/**
 * Alert for budget exceeded
 */
export async function alertBudgetExceeded(
  orgId: string,
  budgetType: 'ai' | 'twilio' | 'total',
  currentUsd: number,
  budgetUsd: number
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.WARNING,
    title: 'Budget Exceeded',
    message: `${budgetType.toUpperCase()} budget exceeded: $${currentUsd.toFixed(2)} / $${budgetUsd.toFixed(2)}`,
    context: { orgId, budgetType, currentUsd, budgetUsd },
    dedupKey: `budget_exceeded_${orgId}_${budgetType}`,
  });
}

/**
 * Alert for critical system error
 */
export async function alertCriticalError(
  component: string,
  errorMessage: string,
  context?: Record<string, unknown>
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.CRITICAL,
    title: `Critical Error in ${component}`,
    message: errorMessage,
    context: { component, ...context },
    dedupKey: `critical_${component}`,
  });
}

/**
 * Alert for org kill switch activated
 */
export async function alertKillSwitchActivated(
  orgId: string,
  module: string,
  activatedBy: string
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.WARNING,
    title: 'Kill Switch Activated',
    message: `Module "${module}" disabled for org ${orgId} by ${activatedBy}`,
    context: { orgId, module, activatedBy },
    dedupKey: `kill_switch_${orgId}_${module}`,
  });
}

/**
 * Alert for subscription cancellation
 */
export async function alertSubscriptionCanceled(
  orgId: string,
  subscriptionId: string,
  reason?: string
): Promise<void> {
  await sendAlert({
    severity: AlertSeverity.WARNING,
    title: 'Subscription Canceled',
    message: `Subscription ${subscriptionId} canceled for org ${orgId}${reason ? `: ${reason}` : ''}`,
    context: { orgId, subscriptionId, reason },
    dedupKey: `subscription_canceled_${subscriptionId}`,
  });
}

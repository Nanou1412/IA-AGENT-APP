/**
 * Twilio SMS Webhook Handler
 * 
 * Handles inbound SMS messages from Twilio.
 * - Validates Twilio signature (proxy-aware)
 * - Resolves org from phone number
 * - Logs message
 * - Applies feature gating (sandbox + billing + industry + kill switches)
 * - Routes to AI Engine for response generation
 * - Responds with TwiML
 * 
 * Phase 8: Added correlation ID, abuse detection, rate limiting, cost control
 */

import { NextRequest, NextResponse } from 'next/server';
import { MessagingChannel, MessageDirection } from '@prisma/client';
import {
  validateTwilioSignature,
  generateTwiMLResponse,
  getPublicRequestUrl,
  DEFAULT_DENIED_TEXT,
  DEFAULT_UNMAPPED_TEXT,
  type TwilioInboundPayload,
} from '@/lib/twilio';
import {
  resolveOrgFromTwilioNumber,
  createMessageLog,
  logTwilioAudit,
  getOrgSettingsForGating,
  isChannelEnabledForOrg,
  getMessagingTexts,
} from '@/lib/twilio-helpers';
import { canUseModuleWithKillSwitch } from '@/lib/feature-gating';
import { handleInboundMessage, isOpenAIConfigured } from '@/engine';
import { withRequestContext, getCorrelationId, logWithContext, generateCorrelationId } from '@/lib/correlation';
import { checkAbuse, handleAbuse, isSessionBlocked } from '@/lib/abuse';
import { checkRateLimit } from '@/engine/rate-limiter';
import { checkFeature, FeatureFlag } from '@/lib/feature-flags';
import { increment, METRIC_NAMES, recordTwilioSms } from '@/lib/metrics';

// Disable body parsing - we need to handle form-urlencoded
export const dynamic = 'force-dynamic';

const CHANNEL: MessagingChannel = 'sms';

/**
 * Parse form-urlencoded body
 */
async function parseFormBody(req: NextRequest): Promise<Record<string, string>> {
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

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  
  return withRequestContext({ correlationId, startTime, channel: 'sms' }, async () => {
    try {
      // Parse form-urlencoded body
      const params = await parseFormBody(req);
      const payload = params as unknown as TwilioInboundPayload;
      
      const { MessageSid, From, To, Body } = payload;
      
      // Record inbound metric
      recordTwilioSms('unknown', 'inbound');
      
      // Validate required fields
      if (!MessageSid || !From || !To) {
        logWithContext('error', 'Missing required fields', { MessageSid, From, To });
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    console.log(`[twilio-sms] Inbound message: ${MessageSid} from ${From} to ${To}`);
    
    // Validate Twilio signature using real public URL (proxy-aware)
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-sms] Invalid signature for URL:', webhookUrl);
        await logTwilioAudit('twilio.sms.invalid_signature', {
          messageSid: MessageSid,
          from: From,
          to: To,
          webhookUrl,
        });
        return new NextResponse(
          generateTwiMLResponse(null),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        );
      }
    } else if (!signature) {
      console.warn('[twilio-sms] No signature in dev mode - skipping validation');
    }
    
    // Resolve org from To number
    const endpoint = await resolveOrgFromTwilioNumber(To, CHANNEL);
    
    if (!endpoint) {
      console.warn(`[twilio-sms] No endpoint found for: ${To}`);
      
      // Log unmapped message
      await logTwilioAudit('twilio.sms.unmapped', {
        messageSid: MessageSid,
        from: From,
        to: To,
        body: Body?.slice(0, 100),
      });
      
      return new NextResponse(
        generateTwiMLResponse(DEFAULT_UNMAPPED_TEXT),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    const { orgId, endpointId } = endpoint;
    
    // Update context with orgId
    logWithContext('info', 'Resolved org for SMS', { orgId, endpointId, from: From });
    
    // ========================================================================
    // PHASE 8: Kill Switch Check (BLOQUANT 5)
    // ========================================================================
    const smsEnabled = await checkFeature(FeatureFlag.SMS_MESSAGING, orgId);
    if (!smsEnabled) {
      logWithContext('warn', 'SMS kill switch active', { orgId });
      await logTwilioAudit('twilio.message.kill_switch_blocked', {
        messageSid: MessageSid,
        channel: CHANNEL,
        reason: 'SMS kill switch active',
      }, { orgId });
      increment(METRIC_NAMES.FEATURE_DISABLED, { orgId, module: 'sms' });
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // ========================================================================
    // PHASE 8: Rate Limit Check (Redis-backed in production)
    // ========================================================================
    const rateLimitResult = await checkRateLimit(orgId);
    if (!rateLimitResult.allowed) {
      logWithContext('warn', 'Rate limit exceeded', { orgId, reason: rateLimitResult.reason });
      await logTwilioAudit('twilio.message.rate_limited', {
        messageSid: MessageSid,
        channel: CHANNEL,
        reason: rateLimitResult.reason,
        resetInMs: rateLimitResult.resetInMs,
      }, { orgId });
      increment(METRIC_NAMES.RATE_LIMIT_EXCEEDED, { orgId, type: 'message' });
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Log inbound message (idempotent via unique MessageSid)
    const logResult = await createMessageLog({
      orgId,
      endpointId,
      channel: CHANNEL,
      direction: MessageDirection.inbound,
      twilioMessageSid: MessageSid,
      from: From,
      to: To,
      body: Body || '',
      status: 'received',
      raw: params as Record<string, unknown>,
    });
    
    if (logResult.isDuplicate) {
      logWithContext('info', 'Duplicate message, skipping', { MessageSid });
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // ========================================================================
    // PHASE 8: Abuse Detection (BLOQUANT 4)
    // ========================================================================
    const sessionId = `sms_${orgId}_${From}`; // Session key for SMS
    const abuseResult = await checkAbuse(orgId, sessionId, Body || '');
    if (abuseResult.abusive) {
      logWithContext('warn', 'Abuse detected', { orgId, sessionId, reason: abuseResult.reason });
      await handleAbuse(orgId, sessionId, abuseResult);
      await logTwilioAudit('twilio.message.abuse_blocked', {
        messageSid: MessageSid,
        channel: CHANNEL,
        reason: abuseResult.reason,
        severity: abuseResult.severity,
      }, { orgId });
      // Return empty TwiML - no response to abusive user
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Check if session is blocked from previous abuse
    if (await isSessionBlocked(sessionId)) {
      logWithContext('info', 'Session blocked from abuse', { sessionId });
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    await logTwilioAudit('twilio.message.inbound_logged', {
      messageSid: MessageSid,
      channel: CHANNEL,
      from: From,
      messageLogId: logResult.id,
      correlationId: getCorrelationId(),
    }, { orgId });
    
    // Feature gating check (with kill switches)
    const settings = await getOrgSettingsForGating(orgId);
    
    if (!settings) {
      logWithContext('error', 'No settings found for org', { orgId });
      return new NextResponse(
        generateTwiMLResponse(DEFAULT_DENIED_TEXT),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Get configured or default EN messages for this org
    const texts = await getMessagingTexts(orgId);
    
    // Check sandbox + billing + industry + kill switch gating
    const gatingResult = canUseModuleWithKillSwitch('sms', {
      org: settings.org,
      settings,
      industryConfig: settings.org.industryConfig,
    });
    
    if (!gatingResult.allowed) {
      console.log(`[twilio-sms] Access denied: ${gatingResult.blockedBy} - ${gatingResult.reason}`);
      
      await logTwilioAudit('twilio.message.denied', {
        messageSid: MessageSid,
        channel: CHANNEL,
        blockedBy: gatingResult.blockedBy,
        reason: gatingResult.reason,
      }, { orgId });
      
      return new NextResponse(
        generateTwiMLResponse(texts.denied),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Check channel-specific config (org toggle + industry allowlist)
    const channelEnabled = await isChannelEnabledForOrg(orgId, CHANNEL);
    
    if (!channelEnabled) {
      console.log(`[twilio-sms] SMS not enabled for org: ${orgId}`);
      
      await logTwilioAudit('twilio.message.denied', {
        messageSid: MessageSid,
        channel: CHANNEL,
        blockedBy: 'config',
        reason: 'SMS channel not enabled for this organization',
      }, { orgId });
      
      return new NextResponse(
        generateTwiMLResponse(texts.denied),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // === MESSAGE PROCESSING ===
    // Phase 6: AI Engine integration
    let responseMessage = texts.inboundReply; // Fallback
    
    // Try AI Engine if configured
    if (isOpenAIConfigured()) {
      try {
        const engineResult = await handleInboundMessage({
          orgId,
          channel: CHANNEL,
          contactKey: From,
          userText: Body || '',
          raw: params as Record<string, unknown>,
        });
        
        responseMessage = engineResult.responseText;
        
        await logTwilioAudit('twilio.message.engine_processed', {
          messageSid: MessageSid,
          channel: CHANNEL,
          engineRunId: engineResult.engineRunId,
          handoffTriggered: engineResult.handoffTriggered,
          processingTimeMs: Date.now() - startTime,
        }, { orgId });
        
      } catch (engineError) {
        console.error('[twilio-sms] Engine error, using fallback:', engineError);
        // Keep fallback responseMessage
      }
    } else {
      console.log('[twilio-sms] OpenAI not configured, using static response');
    }
    
    // Log outbound response
    await createMessageLog({
      orgId,
      endpointId,
      channel: CHANNEL,
      direction: MessageDirection.outbound,
      from: To, // Our number
      to: From, // Customer's number
      body: responseMessage,
      status: 'twiml', // Response via TwiML
    });
    
    await logTwilioAudit('twilio.message.processed', {
      messageSid: MessageSid,
      channel: CHANNEL,
      processingTimeMs: Date.now() - startTime,
    }, { orgId });
    
    return new NextResponse(
      generateTwiMLResponse(responseMessage),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
    
    } catch (error) {
      logWithContext('error', 'Webhook error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      increment(METRIC_NAMES.WEBHOOK_FAILURE, { channel: 'sms' });
      
      // Always return 200 to prevent Twilio retries
      return new NextResponse(
        generateTwiMLResponse(DEFAULT_DENIED_TEXT),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
  });
}

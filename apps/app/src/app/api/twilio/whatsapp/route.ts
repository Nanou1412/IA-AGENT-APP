/**
 * Twilio WhatsApp Webhook Handler
 * 
 * Handles inbound WhatsApp messages from Twilio.
 * - Validates Twilio signature (proxy-aware)
 * - Resolves org from phone number
 * - Logs message
 * - Applies feature gating (sandbox + billing + industry + kill switches)
 * - Routes to AI Engine for response generation
 * - Responds with TwiML
 * 
 * Phase 8: Added correlation ID, abuse detection, kill switch checks
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
import { increment, METRIC_NAMES, recordTwilioWhatsapp } from '@/lib/metrics';
import { parseFormBody } from '@/lib/twilio-webhook-utils';

// Disable body parsing - we need to handle form-urlencoded
export const dynamic = 'force-dynamic';

const CHANNEL: MessagingChannel = 'whatsapp';

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  
  return withRequestContext({ correlationId, startTime, channel: 'whatsapp' }, async () => {
    try {
      // Parse form-urlencoded body
      const params = await parseFormBody(req);
      const payload = params as unknown as TwilioInboundPayload;
      
      const { MessageSid, From, To, Body, ProfileName } = payload;
      
      // Record inbound metric
      recordTwilioWhatsapp('unknown', 'inbound');
      
      // Validate required fields
      if (!MessageSid || !From || !To) {
        logWithContext('error', 'Missing required fields', { MessageSid, From, To });
        return new NextResponse(
          generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    console.log(`[twilio-whatsapp] Inbound message: ${MessageSid} from ${From} (${ProfileName || 'unknown'}) to ${To}`);
    
    // Validate Twilio signature using real public URL (proxy-aware)
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-whatsapp] Invalid signature for URL:', webhookUrl);
        await logTwilioAudit('twilio.whatsapp.invalid_signature', {
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
      console.warn('[twilio-whatsapp] No signature in dev mode - skipping validation');
    }
    
    // Resolve org from To number
    const endpoint = await resolveOrgFromTwilioNumber(To, CHANNEL);
    
    if (!endpoint) {
      console.warn(`[twilio-whatsapp] No endpoint found for: ${To}`);
      
      // Log unmapped message
      await logTwilioAudit('twilio.whatsapp.unmapped', {
        messageSid: MessageSid,
        from: From,
        to: To,
        body: Body?.slice(0, 100),
        profileName: ProfileName,
      });
      
      return new NextResponse(
        generateTwiMLResponse(DEFAULT_UNMAPPED_TEXT),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    const { orgId, endpointId } = endpoint;
    
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
      console.log(`[twilio-whatsapp] Duplicate message, skipping: ${MessageSid}`);
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    await logTwilioAudit('twilio.message.inbound_logged', {
      messageSid: MessageSid,
      channel: CHANNEL,
      from: From,
      profileName: ProfileName,
      messageLogId: logResult.id,
    }, { orgId });
    
    // Phase 8: Abuse detection at ingress (BLOQUANT 4)
    const sessionId = `whatsapp:${From}`;
    const abuseResult = await checkAbuse(orgId, sessionId, Body || '');
    
    if (abuseResult.abusive) {
      logWithContext('warn', 'Abuse detected', { orgId, sessionId, reason: abuseResult.reason });
      await handleAbuse(orgId, sessionId, abuseResult);
      increment(METRIC_NAMES.ABUSE_DETECTED, { orgId, channel: 'whatsapp' });
      
      await logTwilioAudit('twilio.message.abuse_blocked', {
        messageSid: MessageSid,
        channel: CHANNEL,
        reason: abuseResult.reason,
        correlationId: getCorrelationId(),
      }, { orgId });
      
      // Silent drop - no response to abuser
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Phase 8: Check if session is blocked
    if (await isSessionBlocked(sessionId)) {
      logWithContext('info', 'Blocked session', { sessionId });
      return new NextResponse(
        generateTwiMLResponse(null),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Feature gating check
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
    
    // Phase 8: Check sandbox + billing + industry + kill switch gating (BLOQUANT 5)
    const gatingResult = await canUseModuleWithKillSwitch('whatsapp', {
      org: settings.org,
      settings,
      industryConfig: settings.org.industryConfig,
    });
    
    if (!gatingResult.allowed) {
      logWithContext('info', 'Access denied', { blockedBy: gatingResult.blockedBy, reason: gatingResult.reason });
      
      await logTwilioAudit('twilio.message.denied', {
        messageSid: MessageSid,
        channel: CHANNEL,
        blockedBy: gatingResult.blockedBy,
        reason: gatingResult.reason,
        correlationId: getCorrelationId(),
      }, { orgId });
      
      return new NextResponse(
        generateTwiMLResponse(texts.denied),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
    
    // Check channel-specific config (org toggle + industry allowlist)
    const channelEnabled = await isChannelEnabledForOrg(orgId, CHANNEL);
    
    if (!channelEnabled) {
      logWithContext('info', 'WhatsApp not enabled for org', { orgId });
      
      await logTwilioAudit('twilio.message.denied', {
        messageSid: MessageSid,
        channel: CHANNEL,
        blockedBy: 'config',
        reason: 'WhatsApp channel not enabled for this organization',
        correlationId: getCorrelationId(),
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
        console.error('[twilio-whatsapp] Engine error, using fallback:', engineError);
        // Keep fallback responseMessage
      }
    } else {
      logWithContext('info', 'OpenAI not configured, using static response');
    }
    
    // Record outbound metric
    recordTwilioWhatsapp(orgId, 'outbound');
    
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
      correlationId: getCorrelationId(),
    }, { orgId });
    
    return new NextResponse(
      generateTwiMLResponse(responseMessage),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
    
    } catch (error) {
      logWithContext('error', 'Webhook error', { error: error instanceof Error ? error.message : 'Unknown' });
      
      // Always return 200 to prevent Twilio retries
      return new NextResponse(
        generateTwiMLResponse(DEFAULT_DENIED_TEXT),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    }
  }); // End withRequestContext
}

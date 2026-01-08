/**
 * Twilio Voice Webhook Handler (Phase 5 + Phase 6 Engine + Phase 8 Production)
 * 
 * Handles inbound voice calls from Twilio.
 * - Validates Twilio signature (proxy-aware)
 * - Resolves org from phone number
 * - Logs call (idempotent via CallSid)
 * - Applies feature gating (sandbox + billing + industry + org toggle + kill switches)
 * - Uses AI Engine for greeting (Phase 6)
 * - Responds with TwiML (welcome + queue or direct dial)
 * 
 * Phase 8: Added correlation ID, kill switch checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { CallDirection } from '@prisma/client';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  DEFAULT_CALL_WELCOME_TEXT,
  DEFAULT_CALL_DENY_TEXT,
  DEFAULT_UNMAPPED_CALL_TEXT,
  DEFAULT_NO_HANDOFF_TEXT,
  generateDeniedCallTwiML,
  generateUnmappedCallTwiML,
  generateWelcomeWithDialTwiML,
  generateNoHandoffTwiML,
  generateGatherMenuTwiML,
  createCallLog,
  updateCallLogDenied,
  resolveOrgFromVoiceNumber,
  getOrgSettingsForVoice,
  getVoiceConfigFromSettings,
  type TwilioVoiceInboundPayload,
} from '@/lib/twilio-voice';
import { logTwilioAudit } from '@/lib/twilio-helpers';
import { canUseModuleWithKillSwitch } from '@/lib/feature-gating';
import { handleInboundCallGreeting, isOpenAIConfigured } from '@/engine';
import { withRequestContext, getCorrelationId, logWithContext, generateCorrelationId } from '@/lib/correlation';
import { increment, METRIC_NAMES, recordTwilioVoice } from '@/lib/metrics';

// Disable body parsing - we handle form-urlencoded
export const dynamic = 'force-dynamic';

// App URL for constructing webhook URLs
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

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

/**
 * Return TwiML response
 */
function twimlResponse(twiml: string): NextResponse {
  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  
  return withRequestContext({ correlationId, startTime, channel: 'voice' }, async () => {
    try {
      // Parse form-urlencoded body
      const params = await parseFormBody(req);
      const payload = params as unknown as TwilioVoiceInboundPayload;
      
      const { CallSid, From, To, CallStatus } = payload;
      
      // Record inbound metric
      recordTwilioVoice('unknown', 'started');
      
      // Validate required fields
      if (!CallSid || !From || !To) {
        logWithContext('error', 'Missing required fields', { CallSid, From, To });
        return twimlResponse(generateUnmappedCallTwiML());
      }
    
    console.log(`[twilio-voice] Inbound call: ${CallSid} from ${From} to ${To} (${CallStatus})`);
    
    // Validate Twilio signature using real public URL (proxy-aware)
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice] Invalid signature for URL:', webhookUrl);
        console.error('[twilio-voice] Signature received:', signature ? 'present' : 'MISSING');
        await logTwilioAudit('twilio.voice.invalid_signature', {
          callSid: CallSid,
          from: From,
          to: To,
          webhookUrl,
        });
        // Return empty response - don't give info to potential attacker
        return twimlResponse(generateUnmappedCallTwiML());
      }
    } else if (!signature) {
      console.warn('[twilio-voice] No signature in dev mode - skipping validation');
    }
    
    // Resolve org from To number
    console.log(`[twilio-voice] Looking up endpoint for To=${To}`);
    const endpoint = await resolveOrgFromVoiceNumber(To);
    console.log(`[twilio-voice] Lookup result:`, endpoint ? `orgId=${endpoint.orgId}` : 'NOT FOUND');
    
    if (!endpoint) {
      console.warn(`[twilio-voice] No endpoint found for: ${To}`);
      
      // Log unmapped call
      await createCallLog({
        twilioCallSid: CallSid,
        from: From,
        to: To,
        direction: CallDirection.inbound,
        status: 'unmapped',
        raw: params as Record<string, unknown>,
      });
      
      await logTwilioAudit('twilio.voice.unmapped', {
        callSid: CallSid,
        from: From,
        to: To,
      });
      
      return twimlResponse(generateUnmappedCallTwiML());
    }
    
    const { orgId, endpointId } = endpoint;
    
    // Create call log (idempotent via unique CallSid)
    const logResult = await createCallLog({
      orgId,
      endpointId,
      twilioCallSid: CallSid,
      from: From,
      to: To,
      direction: CallDirection.inbound,
      status: CallStatus || 'ringing',
      raw: params as Record<string, unknown>,
    });
    
    if (logResult.isDuplicate) {
      console.log(`[twilio-voice] Duplicate call, skipping: ${CallSid}`);
      // For duplicate calls, return minimal TwiML to prevent re-processing
      // Twilio might retry, so we just acknowledge
      return twimlResponse(generateUnmappedCallTwiML('Your call is being processed. Please hold.'));
    }
    
    await logTwilioAudit('twilio.voice.inbound_logged', {
      callSid: CallSid,
      from: From,
      callLogId: logResult.id,
      correlationId: getCorrelationId(),
    }, { orgId });
    
    // Get org settings for gating
    const settings = await getOrgSettingsForVoice(orgId);
    
    if (!settings) {
      logWithContext('error', 'No settings found for org', { orgId });
      return twimlResponse(generateDeniedCallTwiML(DEFAULT_CALL_DENY_TEXT));
    }
    
    // Get voice configuration with EN fallbacks
    const voiceConfig = getVoiceConfigFromSettings(settings);
    
    // Phase 8: Check sandbox + billing + industry + kill switch gating (BLOQUANT 5)
    const gatingResult = await canUseModuleWithKillSwitch('voice', {
      org: settings.org,
      settings,
      industryConfig: settings.org.industryConfig,
    });
    
    if (!gatingResult.allowed) {
      logWithContext('info', 'Access denied', { blockedBy: gatingResult.blockedBy, reason: gatingResult.reason });
      
      await updateCallLogDenied(CallSid, gatingResult.blockedBy || 'unknown', gatingResult.reason);
      
      await logTwilioAudit('twilio.voice.denied', {
        callSid: CallSid,
        blockedBy: gatingResult.blockedBy,
        reason: gatingResult.reason,
        correlationId: getCorrelationId(),
      }, { orgId });
      
      return twimlResponse(generateDeniedCallTwiML(voiceConfig.callDenyText));
    }
    
    // Check voice-specific config (org toggle)
    if (!voiceConfig.voiceEnabled) {
      console.log(`[twilio-voice] Voice not enabled for org: ${orgId}`);
      
      await updateCallLogDenied(CallSid, 'config', 'Voice channel not enabled for this organization');
      
      await logTwilioAudit('twilio.voice.denied', {
        callSid: CallSid,
        blockedBy: 'config',
        reason: 'Voice channel not enabled for this organization',
      }, { orgId });
      
      return twimlResponse(generateDeniedCallTwiML(voiceConfig.callDenyText));
    }
    
    // === CALL ROUTING ===
    // Phase 6: AI Engine for greeting, then queue or dial
    
    // Get greeting from AI Engine if configured
    let welcomeText = voiceConfig.callWelcomeText;
    
    if (isOpenAIConfigured() && !welcomeText) {
      try {
        const greetingResult = await handleInboundCallGreeting(orgId, From);
        welcomeText = greetingResult.welcomeText;
        
        await logTwilioAudit('twilio.voice.engine_greeting', {
          callSid: CallSid,
          sessionId: greetingResult.sessionId,
          processingTimeMs: Date.now() - startTime,
        }, { orgId });
        
      } catch (engineError) {
        console.error('[twilio-voice] Engine greeting error, using fallback:', engineError);
        welcomeText = DEFAULT_CALL_WELCOME_TEXT;
      }
    }
    
    await logTwilioAudit('twilio.voice.accepted', {
      callSid: CallSid,
      queueEnabled: voiceConfig.callQueueEnabled,
      hasHandoffNumber: !!voiceConfig.callHandoffNumber,
      processingTimeMs: Date.now() - startTime,
    }, { orgId });
    
    // PHASE 1: Use Gather menu to keep call alive
    // Replaces <Enqueue> which waited for human agents indefinitely
    const inputActionUrl = `${APP_URL}/api/twilio/voice/input?orgId=${encodeURIComponent(orgId)}&callSid=${encodeURIComponent(CallSid)}`;
    
    return twimlResponse(
      generateGatherMenuTwiML(
        welcomeText || DEFAULT_CALL_WELCOME_TEXT,
        inputActionUrl,
        { voice: 'Polly.Olivia', language: 'en-AU' }
      )
    );
    
    } catch (error) {
      logWithContext('error', 'Webhook error', { error: error instanceof Error ? error.message : 'Unknown' });
      
      // Always return 200 to prevent Twilio retries
      return twimlResponse(generateDeniedCallTwiML(DEFAULT_CALL_DENY_TEXT));
    }
  }); // End withRequestContext
}

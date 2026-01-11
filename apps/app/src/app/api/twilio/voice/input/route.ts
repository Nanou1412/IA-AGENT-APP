/**
 * Twilio Voice Input Handler (Phase 2 - AI Enabled)
 * 
 * Handles DTMF input from Gather.
 * Routes based on digit pressed:
 * - 1: Orders - Start AI conversation for ordering
 * - 2: Information - Start AI conversation for inquiries
 * - 3: Connect to team (dial handoff number)
 * - Other: Invalid input, retry
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  generateVoiceTwiML,
  sayTwiML,
  hangupTwiML,
  generateGatherMenuTwiML,
  generateWelcomeWithDialTwiML,
  getVoiceConfig,
  DEFAULT_CALL_DENY_TEXT,
} from '@/lib/twilio-voice';
import { logTwilioAudit } from '@/lib/twilio-helpers';
import { parseFormBody } from '@/lib/twilio-webhook-utils';

export const dynamic = 'force-dynamic';

// App URL for constructing webhook URLs
// IMPORTANT: Must be the production URL, not preview URLs
const APP_URL = process.env.NEXT_PUBLIC_APP_URL 
  || 'https://ia-agent-app-app.vercel.app';

// Default language (can be overridden per-org later)
const DEFAULT_LOCALE = 'en-AU';

// Language config for TTS/STT
const LANGUAGE_CONFIG: Record<string, { sttLanguage: string; ttsVoice: string; ttsLanguage: string }> = {
  'en-AU': { sttLanguage: 'en-AU', ttsVoice: 'alice', ttsLanguage: 'en-AU' },
  'en-US': { sttLanguage: 'en-US', ttsVoice: 'alice', ttsLanguage: 'en-US' },
  'fr-FR': { sttLanguage: 'fr-FR', ttsVoice: 'alice', ttsLanguage: 'fr-FR' },
};

/**
 * Return TwiML response
 */
function twimlResponse(twiml: string): NextResponse {
  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

/**
 * Generate TwiML: Say message then Hangup
 */
function sayAndHangup(message: string): string {
  return generateVoiceTwiML(
    sayTwiML(message, { voice: 'alice', language: 'en-AU' }) + hangupTwiML()
  );
}

export async function POST(req: NextRequest) {
  try {
    // Parse form body
    const params = await parseFormBody(req);
    
    // Get query params
    const orgId = req.nextUrl.searchParams.get('orgId');
    const callSid = req.nextUrl.searchParams.get('callSid') || params.CallSid;
    
    // Get DTMF input
    const digits = params.Digits || '';
    
    // Validate Twilio signature in production
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    const skipSignature = process.env.SKIP_TWILIO_SIGNATURE === '1';
    
    if (process.env.NODE_ENV === 'production' && !skipSignature) {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice-input] Invalid signature');
        return twimlResponse(sayAndHangup(DEFAULT_CALL_DENY_TEXT));
      }
    }
    
    // Log input received
    if (orgId) {
      await logTwilioAudit('twilio.voice.input_received', {
        callSid,
        digits,
        orgId,
      }, { orgId });
    }
    
    // Route based on digit
    switch (digits) {
      case '1':
        // Orders - Start AI conversation
        return twimlResponse(
          startAIConversation(
            "Great! I can help you with your order. What would you like to order today?",
            orgId || '',
            callSid || '',
            params.From || '',
            DEFAULT_LOCALE
          )
        );
      
      case '2':
        // Information - Start AI conversation
        return twimlResponse(
          startAIConversation(
            "I'd be happy to help with information. What would you like to know?",
            orgId || '',
            callSid || '',
            params.From || '',
            DEFAULT_LOCALE
          )
        );
      
      case '3':
        // Connect to team
        if (orgId) {
          const voiceConfig = await getVoiceConfig(orgId);
          
          if (voiceConfig.callHandoffNumber) {
            return twimlResponse(
              generateWelcomeWithDialTwiML(
                "Please hold while we connect you to our team.",
                voiceConfig.callHandoffNumber,
                { callerId: params.To }
              )
            );
          }
        }
        
        // No handoff number configured
        return twimlResponse(
          sayAndHangup(
            "We're sorry, our team is not available right now. " +
            "Please try again during business hours. Goodbye."
          )
        );
      
      default:
        // Invalid input - replay menu
        const inputUrl = `${APP_URL}/api/twilio/voice/input?orgId=${encodeURIComponent(orgId || '')}&callSid=${encodeURIComponent(callSid || '')}`;
        
        return twimlResponse(
          generateGatherMenuTwiML(
            "Sorry, I didn't understand that.",
            inputUrl
          )
        );
    }
    
  } catch (error) {
    console.error('[twilio-voice-input] Error:', error);
    
    // Always return valid TwiML
    return twimlResponse(
      sayAndHangup(
        "We're sorry, an error occurred. Please try again later. Goodbye."
      )
    );
  }
}

/**
 * Generate TwiML to start AI conversation
 * Says intro message, then gathers speech input for AI processing
 */
function startAIConversation(
  introMessage: string,
  orgId: string,
  callSid: string,
  from: string,
  locale: string
): string {
  const langConfig = LANGUAGE_CONFIG[locale] || LANGUAGE_CONFIG['en-AU'];
  const { sttLanguage, ttsVoice, ttsLanguage } = langConfig;
  
  // Build conversation URL
  const conversationParams = new URLSearchParams();
  conversationParams.set('orgId', orgId);
  if (callSid) conversationParams.set('callSid', callSid);
  if (from) conversationParams.set('from', from);
  conversationParams.set('locale', locale);
  
  const conversationUrl = `${APP_URL}/api/twilio/voice/conversation?${conversationParams.toString()}`
    .replace(/&/g, '&amp;');
  
  const content = `
    ${sayTwiML(introMessage, { voice: ttsVoice, language: ttsLanguage })}
    <Gather input="speech" timeout="5" speechTimeout="auto" language="${sttLanguage}" action="${conversationUrl}" method="POST">
      <Say voice="${ttsVoice}" language="${ttsLanguage}">.</Say>
    </Gather>
    ${sayTwiML("I didn't hear anything. If you need help, please call back. Goodbye.", { voice: ttsVoice, language: ttsLanguage })}
    ${hangupTwiML()}
  `.trim();
  
  return generateVoiceTwiML(content);
}
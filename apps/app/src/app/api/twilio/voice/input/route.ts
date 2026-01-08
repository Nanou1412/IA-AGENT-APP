/**
 * Twilio Voice Input Handler (Phase 1)
 * 
 * Handles DTMF input from Gather.
 * Routes based on digit pressed:
 * - 1: Orders (placeholder message)
 * - 2: Information (placeholder message)
 * - 3: Connect to team (dial handoff number)
 * - Other: Invalid input, retry
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  generateSayAndHangupTwiML,
  generateGatherMenuTwiML,
  generateWelcomeWithDialTwiML,
  getVoiceConfig,
  DEFAULT_CALL_DENY_TEXT,
} from '@/lib/twilio-voice';
import { logTwilioAudit } from '@/lib/twilio-helpers';

export const dynamic = 'force-dynamic';

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
    headers: { 'Content-Type': 'text/xml' },
  });
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
    
    console.log(`[twilio-voice-input] Input received: digits="${digits}" orgId=${orgId} callSid=${callSid}`);
    
    // Validate Twilio signature in production
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice-input] Invalid signature');
        return twimlResponse(generateSayAndHangupTwiML(DEFAULT_CALL_DENY_TEXT));
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
        // Orders - placeholder for Phase 2/3
        return twimlResponse(
          generateSayAndHangupTwiML(
            "Thank you for your interest in placing an order. " +
            "Our ordering system will be available soon. " +
            "Please call back later or visit our website. Goodbye."
          )
        );
      
      case '2':
        // Information - placeholder for Phase 2/3
        return twimlResponse(
          generateSayAndHangupTwiML(
            "We are open Monday to Saturday from 11 AM to 10 PM. " +
            "For more information, please visit our website. " +
            "Thank you for calling. Goodbye."
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
          generateSayAndHangupTwiML(
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
            "Press 1 for orders. Press 2 for information. Press 3 to speak with our team.",
            inputUrl,
            { timeout: 5, numDigits: 1 }
          )
        );
    }
    
  } catch (error) {
    console.error('[twilio-voice-input] Error:', error);
    
    // Always return valid TwiML
    return twimlResponse(
      generateSayAndHangupTwiML(
        "We're sorry, an error occurred. Please try again later. Goodbye."
      )
    );
  }
}

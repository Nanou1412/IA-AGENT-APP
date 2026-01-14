/**
 * Twilio Voice Queue Wait URL Handler (Phase 5)
 * 
 * Called by Twilio when a caller is waiting in queue.
 * Returns TwiML with wait message.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  generateQueueWaitTwiML,
  getVoiceConfig,
  DEFAULT_CALL_QUEUE_WAIT_TEXT,
} from '@/lib/twilio-voice';
import { parseFormBody } from '@/lib/twilio-webhook-utils';

export const dynamic = 'force-dynamic';

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
  try {
    // Parse form body
    const params = await parseFormBody(req);
    // Get orgId from query parameter
    const orgId = req.nextUrl.searchParams.get('orgId');
    
    // Validate Twilio signature in production
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    const skipSignature = process.env.SKIP_TWILIO_SIGNATURE === '1';
    
    if (process.env.NODE_ENV === 'production' && !skipSignature) {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice-wait] Invalid signature');
        // Return default wait message anyway - don't break the call
        return twimlResponse(generateQueueWaitTwiML(DEFAULT_CALL_QUEUE_WAIT_TEXT, 10));
      }
    }
    
    // Get org-specific wait text if orgId available
    let waitText = DEFAULT_CALL_QUEUE_WAIT_TEXT;
    
    if (orgId) {
      try {
        const voiceConfig = await getVoiceConfig(orgId);
        waitText = voiceConfig.callQueueWaitText;
      } catch (error) {
        // Ignore - use default
      }
    }
    
    // Return wait message with 10 second pause
    // Twilio will call this URL again after the TwiML completes
    return twimlResponse(generateQueueWaitTwiML(waitText, 10));
    
  } catch (error) {
    console.error('[twilio-voice-wait] Error:', error);
    
    // Always return valid TwiML
    return twimlResponse(generateQueueWaitTwiML(DEFAULT_CALL_QUEUE_WAIT_TEXT, 10));
  }
}

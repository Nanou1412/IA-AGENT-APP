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
  type TwilioQueueWaitPayload,
} from '@/lib/twilio-voice';

export const dynamic = 'force-dynamic';

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
    const payload = params as unknown as TwilioQueueWaitPayload;
    
    // Get orgId from query parameter
    const orgId = req.nextUrl.searchParams.get('orgId');
    
    const { CallSid, QueueName, QueueTime, QueuePosition } = payload;
    
    console.log(`[twilio-voice-wait] Queue wait: ${CallSid} in ${QueueName} (position: ${QueuePosition}, time: ${QueueTime}s)`);
    
    // Validate Twilio signature in production
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice-wait] Invalid signature for URL:', webhookUrl);
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
        console.warn(`[twilio-voice-wait] Could not get voice config for org ${orgId}:`, error);
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

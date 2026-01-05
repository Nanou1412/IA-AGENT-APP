/**
 * Twilio Voice Status Callback Handler (Phase 5)
 * 
 * Handles call status updates from Twilio.
 * Updates CallLog with final status, duration, recording URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  updateCallLogStatus,
  type TwilioVoiceStatusPayload,
} from '@/lib/twilio-voice';
import { logTwilioAudit } from '@/lib/twilio-helpers';
import { prisma } from '@/lib/prisma';

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

export async function POST(req: NextRequest) {
  try {
    // Parse form body
    const params = await parseFormBody(req);
    const payload = params as unknown as TwilioVoiceStatusPayload;
    
    const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = payload;
    
    // Validate required fields
    if (!CallSid || !CallStatus) {
      console.error('[twilio-voice-status] Missing required fields:', { CallSid, CallStatus });
      return new NextResponse('OK', { status: 200 });
    }
    
    console.log(`[twilio-voice-status] Status update: ${CallSid} -> ${CallStatus} (duration: ${CallDuration}s)`);
    
    // Validate Twilio signature in production
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice-status] Invalid signature for URL:', webhookUrl);
        return new NextResponse('OK', { status: 200 });
      }
    }
    
    // Update call log status
    try {
      await updateCallLogStatus(CallSid, CallStatus, {
        durationSeconds: CallDuration ? parseInt(CallDuration, 10) : undefined,
        recordingUrl: RecordingUrl,
      });
    } catch (error) {
      // Call might not exist (if it was unmapped)
      console.warn(`[twilio-voice-status] Could not update call log for ${CallSid}:`, error);
    }
    
    // Get org from call log for audit
    const callLog = await prisma.callLog.findUnique({
      where: { twilioCallSid: CallSid },
      select: { orgId: true },
    });
    
    // Log failures for monitoring
    if (['failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
      await logTwilioAudit('twilio.voice.call_ended', {
        callSid: CallSid,
        status: CallStatus,
        durationSeconds: CallDuration,
        outcome: 'not_completed',
      }, callLog?.orgId ? { orgId: callLog.orgId } : undefined);
    } else if (CallStatus === 'completed') {
      await logTwilioAudit('twilio.voice.call_completed', {
        callSid: CallSid,
        status: CallStatus,
        durationSeconds: CallDuration,
        hasRecording: !!RecordingUrl,
        recordingSid: RecordingSid,
      }, callLog?.orgId ? { orgId: callLog.orgId } : undefined);
    }
    
    return new NextResponse('OK', { status: 200 });
    
  } catch (error) {
    console.error('[twilio-voice-status] Error:', error);
    
    // Always return 200 to prevent Twilio retries
    return new NextResponse('OK', { status: 200 });
  }
}

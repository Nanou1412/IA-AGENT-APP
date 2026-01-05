/**
 * Twilio Status Callback Handler
 * 
 * Handles message status updates from Twilio.
 * Updates MessageLog.status for delivered/failed/etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateTwilioSignature,
  getPublicRequestUrl,
} from '@/lib/twilio';
import type { TwilioStatusPayload } from '@/lib/twilio';
import { updateMessageLogStatus, logTwilioAudit } from '@/lib/twilio-helpers';

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
    // Parse form-urlencoded body
    const params = await parseFormBody(req);
    const payload = params as unknown as TwilioStatusPayload;
    
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = payload;
    
    // Validate required fields
    if (!MessageSid || !MessageStatus) {
      console.error('[twilio-status] Missing required fields:', { MessageSid, MessageStatus });
      return new NextResponse('OK', { status: 200 });
    }
    
    console.log(`[twilio-status] Status update: ${MessageSid} -> ${MessageStatus}`);
    
    // Validate Twilio signature in production using real public URL (proxy-aware)
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-status] Invalid signature for URL:', webhookUrl);
        return new NextResponse('OK', { status: 200 });
      }
    }
    
    // Update message log status
    await updateMessageLogStatus(
      MessageSid,
      MessageStatus,
      ErrorCode || null,
      ErrorMessage || null
    );
    
    // Log failures for monitoring
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      await logTwilioAudit('twilio.message.delivery_failed', {
        messageSid: MessageSid,
        status: MessageStatus,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
      });
    }
    
    return new NextResponse('OK', { status: 200 });
    
  } catch (error) {
    console.error('[twilio-status] Webhook error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}

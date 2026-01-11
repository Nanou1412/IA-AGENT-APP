/**
 * Twilio Voice Realtime Handler
 * 
 * Entry point for Twilio Media Streams → OpenAI Realtime integration.
 * 
 * Flow:
 * 1. Twilio calls /api/twilio/voice/realtime/start to get TwiML with <Stream>
 * 2. Twilio connects Media Stream to /api/twilio/voice/realtime/stream (WebSocket)
 * 3. Audio flows bidirectionally between Twilio and OpenAI Realtime
 * 
 * Note: For production, the WebSocket handler should run on a platform
 * that supports WebSockets (e.g., Vercel Edge Functions, dedicated server).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateMediaStreamTwiML,
  createRealtimeSession,
  isRealtimeConfigured,
} from '@/lib/openai-realtime';
import { getCachedOrgContext, getCachedTemplate } from '@/lib/cached-config';
import { getCachedVoiceConfig } from '@/lib/cached-config';
import { 
  getPublicRequestUrl,
  validateTwilioSignature,
  DEFAULT_CALL_DENY_TEXT,
  generateDeniedCallTwiML,
} from '@/lib/twilio-voice';
import { parseFormBody } from '@/lib/twilio-webhook-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ia-agent-app-app.vercel.app';

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
 * POST /api/twilio/voice/realtime/start
 * 
 * Called when user presses 1 or 2 in the IVR menu.
 * Returns TwiML to start Media Stream connection.
 */
export async function POST(req: NextRequest) {
  try {
    const params = await parseFormBody(req);
    
    // Get query params
    const orgId = req.nextUrl.searchParams.get('orgId');
    const callSid = req.nextUrl.searchParams.get('callSid') || params.CallSid;
    const from = req.nextUrl.searchParams.get('from') || params.From;
    const intent = req.nextUrl.searchParams.get('intent') || 'order'; // order or info
    
    // Validate Twilio signature
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    
    if (process.env.NODE_ENV === 'production' && process.env.SKIP_TWILIO_SIGNATURE !== '1') {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-realtime] Invalid signature');
        return twimlResponse(generateDeniedCallTwiML(DEFAULT_CALL_DENY_TEXT));
      }
    }
    
    if (!orgId) {
      console.error('[twilio-realtime] Missing orgId');
      return twimlResponse(generateDeniedCallTwiML(DEFAULT_CALL_DENY_TEXT));
    }
    
    // Check if realtime is configured
    if (!isRealtimeConfigured()) {
      console.log('[twilio-realtime] OpenAI not configured, falling back to regular conversation');
      // Redirect to regular conversation endpoint
      const fallbackUrl = `${APP_URL}/api/twilio/voice/conversation?orgId=${encodeURIComponent(orgId)}&callSid=${encodeURIComponent(callSid || '')}&from=${encodeURIComponent(from || '')}`;
      return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${fallbackUrl}</Redirect>
</Response>`);
    }
    
    // Get org context for system prompt
    const orgContext = await getCachedOrgContext(orgId);
    const template = await getCachedTemplate(orgId);
    
    if (!orgContext) {
      console.error('[twilio-realtime] Org context not found');
      return twimlResponse(generateDeniedCallTwiML(DEFAULT_CALL_DENY_TEXT));
    }
    
    // Build system prompt for voice
    const basePrompt = template?.systemPrompt || 'You are a helpful restaurant assistant.';
    const voicePrompt = `${basePrompt}

IMPORTANT: This is a PHONE conversation. Keep responses SHORT (1-2 sentences). Be natural and conversational.
You are speaking with a customer on the phone for ${orgContext.org.name}.`;
    
    // Create realtime session
    const session = createRealtimeSession(callSid || 'unknown', orgId, {
      systemPrompt: voicePrompt,
      functions: [], // Add order functions here if needed
    });
    
    console.log(`[twilio-realtime] Created session ${session.id} for call ${callSid}`);
    
    // Build WebSocket URL for Media Stream
    // Note: This requires a WebSocket server. For Vercel, you'd need a separate service.
    const wsProtocol = APP_URL.startsWith('https') ? 'wss' : 'ws';
    const wsHost = APP_URL.replace(/^https?:\/\//, '');
    const streamUrl = `${wsProtocol}://${wsHost}/api/twilio/voice/realtime/stream?sessionId=${encodeURIComponent(session.id)}`;
    
    // Generate welcome message based on intent
    const welcomeMessage = intent === 'order'
      ? "Great! I can help you with your order. What would you like today?"
      : "I'd be happy to help with information. What would you like to know?";
    
    // Return TwiML with Media Stream
    const twiml = generateMediaStreamTwiML(streamUrl, {
      voice: 'alice',
      language: 'en-AU',
      welcomeMessage,
    });
    
    return twimlResponse(twiml);
    
  } catch (error) {
    console.error('[twilio-realtime] Error:', error);
    return twimlResponse(generateDeniedCallTwiML(DEFAULT_CALL_DENY_TEXT));
  }
}

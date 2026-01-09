/**
 * Twilio Voice Conversation Handler
 * 
 * Handles AI-powered voice conversations using Speech-to-Text (STT) + AI Engine + Text-to-Speech (TTS)
 * 
 * Flow:
 * 1. Receive transcribed speech from Twilio Gather (speech input)
 * 2. Send text to AI engine (same as SMS/WhatsApp)
 * 3. Return AI response as TTS via Say verb
 * 4. Continue conversation with another Gather
 * 
 * Supports multi-turn conversations with session context.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicRequestUrl,
  validateTwilioSignature,
  generateVoiceTwiML,
  sayTwiML,
  hangupTwiML,
  getVoiceConfig,
} from '@/lib/twilio-voice';
import { handleInboundMessage, type EngineInput } from '@/engine';
import { logTwilioAudit } from '@/lib/twilio-helpers';
import { normalizePhoneNumber } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

// Production URL for webhooks
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ia-agent-app-app.vercel.app';

// Supported languages for STT/TTS
const LANGUAGE_CONFIG: Record<string, { sttLanguage: string; ttsVoice: string; ttsLanguage: string }> = {
  'en-AU': { sttLanguage: 'en-AU', ttsVoice: 'alice', ttsLanguage: 'en-AU' },
  'en-US': { sttLanguage: 'en-US', ttsVoice: 'alice', ttsLanguage: 'en-US' },
  'en-GB': { sttLanguage: 'en-GB', ttsVoice: 'alice', ttsLanguage: 'en-GB' },
  'fr-FR': { sttLanguage: 'fr-FR', ttsVoice: 'alice', ttsLanguage: 'fr-FR' },
  'es-ES': { sttLanguage: 'es-ES', ttsVoice: 'alice', ttsLanguage: 'es-ES' },
  'de-DE': { sttLanguage: 'de-DE', ttsVoice: 'alice', ttsLanguage: 'de-DE' },
  'it-IT': { sttLanguage: 'it-IT', ttsVoice: 'alice', ttsLanguage: 'it-IT' },
  'pt-BR': { sttLanguage: 'pt-BR', ttsVoice: 'alice', ttsLanguage: 'pt-BR' },
  'ja-JP': { sttLanguage: 'ja-JP', ttsVoice: 'alice', ttsLanguage: 'ja-JP' },
  'zh-CN': { sttLanguage: 'zh-CN', ttsVoice: 'alice', ttsLanguage: 'zh-CN' },
};

const DEFAULT_LANGUAGE = 'en-AU';

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

/**
 * Generate TwiML for AI conversation turn
 * Says the AI response, then gathers next speech input
 */
function generateConversationTwiML(
  aiResponse: string,
  conversationUrl: string,
  options: { voice: string; language: string; sttLanguage: string }
): string {
  const { voice, language, sttLanguage } = options;
  
  // Escape XML special characters in the URL
  const safeUrl = conversationUrl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  
  const content = `
    ${sayTwiML(aiResponse, { voice, language })}
    <Gather input="speech" timeout="5" speechTimeout="auto" language="${sttLanguage}" action="${safeUrl}" method="POST">
      <Say voice="${voice}" language="${language}">.</Say>
    </Gather>
    ${sayTwiML("I didn't hear anything. If you need more help, please call back. Goodbye.", { voice, language })}
    ${hangupTwiML()}
  `.trim();
  
  return generateVoiceTwiML(content);
}

/**
 * Generate TwiML for handoff (transfer to human)
 */
function generateHandoffTwiML(
  handoffMessage: string,
  handoffNumber: string | null,
  options: { voice: string; language: string; callerId?: string }
): string {
  const { voice, language, callerId } = options;
  
  if (handoffNumber) {
    const content = `
      ${sayTwiML(handoffMessage, { voice, language })}
      <Dial callerId="${callerId || ''}">${handoffNumber}</Dial>
    `.trim();
    return generateVoiceTwiML(content);
  }
  
  // No handoff number configured
  const content = `
    ${sayTwiML("I'll have a team member call you back shortly. Thank you for calling. Goodbye.", { voice, language })}
    ${hangupTwiML()}
  `.trim();
  return generateVoiceTwiML(content);
}

/**
 * Generate TwiML for errors
 */
function generateErrorTwiML(options: { voice: string; language: string }): string {
  const { voice, language } = options;
  const content = `
    ${sayTwiML("I'm sorry, I'm having trouble understanding. Please try again later or press 3 to speak with our team. Goodbye.", { voice, language })}
    ${hangupTwiML()}
  `.trim();
  return generateVoiceTwiML(content);
}

export async function POST(req: NextRequest) {
  try {
    // Parse form body
    const params = await parseFormBody(req);
    
    // Get query params
    const orgId = req.nextUrl.searchParams.get('orgId');
    const callSid = req.nextUrl.searchParams.get('callSid') || params.CallSid;
    const from = req.nextUrl.searchParams.get('from') || params.From;
    const locale = req.nextUrl.searchParams.get('locale') || DEFAULT_LANGUAGE;
    
    // Get language config
    const langConfig = LANGUAGE_CONFIG[locale] || LANGUAGE_CONFIG[DEFAULT_LANGUAGE];
    const { sttLanguage, ttsVoice, ttsLanguage } = langConfig;
    
    // Get speech result from Twilio
    const speechResult = params.SpeechResult || '';
    const confidence = parseFloat(params.Confidence || '0');
    
    // Validate Twilio signature in production
    const signature = req.headers.get('x-twilio-signature') || '';
    const webhookUrl = getPublicRequestUrl(req);
    const skipSignature = process.env.SKIP_TWILIO_SIGNATURE === '1';
    
    if (process.env.NODE_ENV === 'production' && !skipSignature) {
      if (!validateTwilioSignature(signature, webhookUrl, params)) {
        console.error('[twilio-voice-conversation] Invalid signature');
        return twimlResponse(generateErrorTwiML({ voice: ttsVoice, language: ttsLanguage }));
      }
    }
    
    // Validate required params
    if (!orgId) {
      console.error('[twilio-voice-conversation] Missing orgId');
      return twimlResponse(generateErrorTwiML({ voice: ttsVoice, language: ttsLanguage }));
    }
    
    // Log speech input
    await logTwilioAudit('twilio.voice.speech_received', {
      callSid,
      speechResult,
      confidence,
      locale,
    }, { orgId });
    
    // Handle empty speech (no input detected)
    if (!speechResult || speechResult.trim() === '') {
      const noInputResponse = "I didn't catch that. Could you please repeat?";
      const conversationUrl = buildConversationUrl(orgId, callSid, from, locale);
      
      return twimlResponse(
        generateConversationTwiML(noInputResponse, conversationUrl, {
          voice: ttsVoice,
          language: ttsLanguage,
          sttLanguage,
        })
      );
    }
    
    // Handle low confidence (might be noise)
    if (confidence < 0.3) {
      const lowConfidenceResponse = "I'm not sure I understood correctly. Could you please repeat that?";
      const conversationUrl = buildConversationUrl(orgId, callSid, from, locale);
      
      return twimlResponse(
        generateConversationTwiML(lowConfidenceResponse, conversationUrl, {
          voice: ttsVoice,
          language: ttsLanguage,
          sttLanguage,
        })
      );
    }
    
    // Build engine input
    const engineInput: EngineInput = {
      orgId,
      channel: 'voice',
      contactKey: normalizePhoneNumber(from || '', 'sms'),
      userText: speechResult,
      externalThreadKey: callSid, // Use CallSid to maintain conversation context
      raw: params as Record<string, unknown>,
    };
    
    // Call AI engine (same as SMS/WhatsApp!)
    const engineOutput = await handleInboundMessage(engineInput);
    
    // Get voice config for handoff number
    const voiceConfig = await getVoiceConfig(orgId);
    
    // Handle handoff
    if (engineOutput.handoffTriggered) {
      await logTwilioAudit('twilio.voice.handoff_triggered', {
        callSid,
        reason: engineOutput.handoffReason,
        engineRunId: engineOutput.engineRunId,
      }, { orgId });
      
      return twimlResponse(
        generateHandoffTwiML(
          engineOutput.responseText,
          voiceConfig.callHandoffNumber,
          { voice: ttsVoice, language: ttsLanguage, callerId: params.To }
        )
      );
    }
    
    // Log successful AI response
    await logTwilioAudit('twilio.voice.ai_response', {
      callSid,
      engineRunId: engineOutput.engineRunId,
      inputTokens: engineOutput.inputTokens,
      outputTokens: engineOutput.outputTokens,
    }, { orgId });
    
    // Continue conversation with AI response
    const conversationUrl = buildConversationUrl(orgId, callSid, from, locale);
    
    return twimlResponse(
      generateConversationTwiML(engineOutput.responseText, conversationUrl, {
        voice: ttsVoice,
        language: ttsLanguage,
        sttLanguage,
      })
    );
    
  } catch (error) {
    console.error('[twilio-voice-conversation] Error:', error);
    
    return twimlResponse(
      generateErrorTwiML({ voice: 'alice', language: 'en-AU' })
    );
  }
}

/**
 * Build conversation URL with all necessary params
 */
function buildConversationUrl(orgId: string, callSid: string | null, from: string | null, locale: string): string {
  const params = new URLSearchParams();
  params.set('orgId', orgId);
  if (callSid) params.set('callSid', callSid);
  if (from) params.set('from', from);
  params.set('locale', locale);
  
  return `${APP_URL}/api/twilio/voice/conversation?${params.toString()}`;
}

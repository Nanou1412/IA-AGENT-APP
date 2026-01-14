/**
 * OpenAI Realtime Voice Provider
 * 
 * Uses OpenAI Realtime API for low-latency voice conversations.
 * This provides ~300ms response time vs ~10s with traditional STT→LLM→TTS flow.
 * 
 * Architecture:
 * - Twilio Media Streams → WebSocket → OpenAI Realtime → WebSocket → Twilio
 * 
 * Requirements:
 * - OpenAI API key with Realtime access
 * - Twilio account with Media Streams enabled
 */

// ============================================================================
// Configuration
// ============================================================================

export interface RealtimeConfig {
  apiKey: string;
  model?: string;
  voice?: 'alloy' | 'echo' | 'shimmer';
  systemPrompt: string;
  functions?: RealtimeFunction[];
}

export interface RealtimeFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ============================================================================
// Realtime Session Manager
// ============================================================================

export interface RealtimeSession {
  id: string;
  orgId: string;
  callSid: string;
  openaiWs: WebSocket | null;
  twilioWs: WebSocket | null;
  systemPrompt: string;
  functions: RealtimeFunction[];
  createdAt: Date;
}

// In-memory session store (for now - could use Redis for multi-instance)
const sessions = new Map<string, RealtimeSession>();

/**
 * Check if OpenAI Realtime is configured
 */
export function isRealtimeConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Create a new realtime session
 */
export function createRealtimeSession(
  callSid: string,
  orgId: string,
  config: { systemPrompt: string; functions?: RealtimeFunction[] }
): RealtimeSession {
  const session: RealtimeSession = {
    id: `rt-${callSid}`,
    orgId,
    callSid,
    openaiWs: null,
    twilioWs: null,
    systemPrompt: config.systemPrompt,
    functions: config.functions || [],
    createdAt: new Date(),
  };
  
  sessions.set(session.id, session);
  return session;
}

/**
 * Get a session by ID
 */
export function getRealtimeSession(sessionId: string): RealtimeSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Get session by call SID
 */
export function getSessionByCallSid(callSid: string): RealtimeSession | undefined {
  return sessions.get(`rt-${callSid}`);
}

/**
 * Delete a session
 */
export function deleteRealtimeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    // Close WebSocket connections
    if (session.openaiWs?.readyState === WebSocket.OPEN) {
      session.openaiWs.close();
    }
    if (session.twilioWs?.readyState === WebSocket.OPEN) {
      session.twilioWs.close();
    }
    sessions.delete(sessionId);
  }
}

// ============================================================================
// TwiML Generation for Media Streams
// ============================================================================

/**
 * Generate TwiML to start a Media Stream connection
 * This connects Twilio audio to our WebSocket server
 */
export function generateMediaStreamTwiML(
  websocketUrl: string,
  options: {
    voice?: string;
    language?: string;
    welcomeMessage?: string;
  } = {}
): string {
  const { voice = 'alice', language = 'en-AU', welcomeMessage } = options;
  
  const welcomePart = welcomeMessage 
    ? `<Say voice="${voice}" language="${language}">${escapeXml(welcomeMessage)}</Say>`
    : '';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${welcomePart}
  <Connect>
    <Stream url="${escapeXml(websocketUrl)}">
      <Parameter name="track" value="both_tracks"/>
    </Stream>
  </Connect>
</Response>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// Audio Format Conversion
// ============================================================================

/**
 * Convert Twilio mulaw audio to PCM16 for OpenAI
 * Twilio sends 8kHz mulaw, OpenAI expects 24kHz PCM16
 */
export function mulawToPcm16(mulawData: Buffer): Buffer {
  // Mulaw decoding table
  const MULAW_DECODE = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const mulaw = ~i;
    const sign = (mulaw & 0x80) ? -1 : 1;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;
    const sample = sign * ((((mantissa << 3) + 0x84) << exponent) - 0x84);
    MULAW_DECODE[i] = sample;
  }
  
  const pcmData = new Int16Array(mulawData.length);
  for (let i = 0; i < mulawData.length; i++) {
    pcmData[i] = MULAW_DECODE[mulawData[i]];
  }
  
  return Buffer.from(pcmData.buffer);
}

/**
 * Convert PCM16 to mulaw for Twilio
 */
export function pcm16ToMulaw(pcmData: Buffer): Buffer {
  const pcm = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);
  const mulawData = new Uint8Array(pcm.length);
  
  for (let i = 0; i < pcm.length; i++) {
    let sample = pcm[i];
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    sample = Math.min(sample, 32635);
    sample += 0x84;
    
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    mulawData[i] = ~(sign | (exponent << 4) | mantissa);
  }
  
  return Buffer.from(mulawData);
}

// ============================================================================
// OpenAI Realtime Message Types
// ============================================================================

export interface RealtimeServerEvent {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

export interface RealtimeClientEvent {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

/**
 * Create session.update event to configure the session
 */
export function createSessionUpdateEvent(config: {
  systemPrompt: string;
  voice?: string;
  functions?: RealtimeFunction[];
}): RealtimeClientEvent {
  return {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: config.systemPrompt,
      voice: config.voice || 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: {
        model: 'whisper-1',
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      tools: config.functions?.map(fn => ({
        type: 'function',
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      })) || [],
    },
  };
}

/**
 * Create audio append event
 */
export function createAudioAppendEvent(audioBase64: string): RealtimeClientEvent {
  return {
    type: 'input_audio_buffer.append',
    audio: audioBase64,
  };
}

/**
 * Create response.create event to trigger AI response
 */
export function createResponseEvent(): RealtimeClientEvent {
  return {
    type: 'response.create',
    response: {
      modalities: ['text', 'audio'],
    },
  };
}

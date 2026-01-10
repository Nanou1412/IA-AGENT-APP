/**
 * Type definitions for Twilio Media Streams
 * 
 * @see https://www.twilio.com/docs/voice/media-streams
 */

// ============================================================================
// Twilio WebSocket Messages
// ============================================================================

export interface TwilioConnectedMessage {
  event: 'connected';
  protocol: string;
  version: string;
}

export interface TwilioStartMessage {
  event: 'start';
  sequenceNumber: string;
  start: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    customParameters: Record<string, string>;
    mediaFormat: {
      encoding: 'audio/x-mulaw';
      sampleRate: 8000;
      channels: 1;
    };
  };
  streamSid: string;
}

export interface TwilioMediaMessage {
  event: 'media';
  sequenceNumber: string;
  media: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string; // base64 encoded audio
  };
  streamSid: string;
}

export interface TwilioStopMessage {
  event: 'stop';
  sequenceNumber: string;
  stop: {
    accountSid: string;
    callSid: string;
  };
  streamSid: string;
}

export interface TwilioMarkMessage {
  event: 'mark';
  sequenceNumber: string;
  mark: {
    name: string;
  };
  streamSid: string;
}

export type TwilioMessage =
  | TwilioConnectedMessage
  | TwilioStartMessage
  | TwilioMediaMessage
  | TwilioStopMessage
  | TwilioMarkMessage;

// ============================================================================
// Messages to send to Twilio
// ============================================================================

export interface TwilioOutboundMediaMessage {
  event: 'media';
  streamSid: string;
  media: {
    payload: string; // base64 encoded mulaw audio
  };
}

export interface TwilioOutboundMarkMessage {
  event: 'mark';
  streamSid: string;
  mark: {
    name: string;
  };
}

export interface TwilioOutboundClearMessage {
  event: 'clear';
  streamSid: string;
}

export type TwilioOutboundMessage =
  | TwilioOutboundMediaMessage
  | TwilioOutboundMarkMessage
  | TwilioOutboundClearMessage;

// ============================================================================
// Session Context
// ============================================================================

export interface TwilioSessionContext {
  streamSid: string;
  callSid: string;
  accountSid: string;
  orgId: string;
  from: string;
  customParameters: Record<string, string>;
}

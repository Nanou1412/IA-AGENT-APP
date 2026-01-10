/**
 * Type definitions for OpenAI Realtime API
 * 
 * Based on OpenAI Realtime API specification
 * @see https://platform.openai.com/docs/guides/realtime
 */

// ============================================================================
// Session Types
// ============================================================================

export interface RealtimeSession {
  id: string;
  object: 'realtime.session';
  model: string;
  modalities: ('text' | 'audio')[];
  instructions: string;
  voice: 'alloy' | 'echo' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';
  input_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  output_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  input_audio_transcription: {
    model: 'whisper-1';
  } | null;
  turn_detection: {
    type: 'server_vad';
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  } | null;
  tools: RealtimeTool[];
  tool_choice: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  temperature: number;
  max_response_output_tokens: number | 'inf';
}

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

// ============================================================================
// Client Events (sent to OpenAI)
// ============================================================================

export interface SessionUpdateEvent {
  type: 'session.update';
  session: Partial<RealtimeSession>;
}

export interface InputAudioBufferAppendEvent {
  type: 'input_audio_buffer.append';
  audio: string; // base64 encoded audio
}

export interface InputAudioBufferCommitEvent {
  type: 'input_audio_buffer.commit';
}

export interface InputAudioBufferClearEvent {
  type: 'input_audio_buffer.clear';
}

export interface ConversationItemCreateEvent {
  type: 'conversation.item.create';
  item: ConversationItem;
}

export interface ResponseCreateEvent {
  type: 'response.create';
  response?: {
    modalities?: ('text' | 'audio')[];
    instructions?: string;
  };
}

export interface ResponseCancelEvent {
  type: 'response.cancel';
}

export type ClientEvent =
  | SessionUpdateEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | ConversationItemCreateEvent
  | ResponseCreateEvent
  | ResponseCancelEvent;

// ============================================================================
// Server Events (received from OpenAI)
// ============================================================================

export interface SessionCreatedEvent {
  type: 'session.created';
  session: RealtimeSession;
}

export interface SessionUpdatedEvent {
  type: 'session.updated';
  session: RealtimeSession;
}

export interface InputAudioBufferCommittedEvent {
  type: 'input_audio_buffer.committed';
  item_id: string;
}

export interface InputAudioBufferSpeechStartedEvent {
  type: 'input_audio_buffer.speech_started';
  audio_start_ms: number;
  item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent {
  type: 'input_audio_buffer.speech_stopped';
  audio_end_ms: number;
  item_id: string;
}

export interface ConversationItemCreatedEvent {
  type: 'conversation.item.created';
  item: ConversationItem;
}

export interface ResponseCreatedEvent {
  type: 'response.created';
  response: ResponseObject;
}

export interface ResponseDoneEvent {
  type: 'response.done';
  response: ResponseObject;
}

export interface ResponseAudioDeltaEvent {
  type: 'response.audio.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string; // base64 encoded audio
}

export interface ResponseAudioDoneEvent {
  type: 'response.audio.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
}

export interface ResponseAudioTranscriptDeltaEvent {
  type: 'response.audio_transcript.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseAudioTranscriptDoneEvent {
  type: 'response.audio_transcript.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  transcript: string;
}

export interface ResponseTextDeltaEvent {
  type: 'response.text.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseTextDoneEvent {
  type: 'response.text.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface ResponseFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  delta: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  name: string;
  arguments: string;
}

export interface ErrorEvent {
  type: 'error';
  error: {
    type: string;
    code: string;
    message: string;
    param?: string;
  };
}

export type ServerEvent =
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioBufferCommittedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | ConversationItemCreatedEvent
  | ResponseCreatedEvent
  | ResponseDoneEvent
  | ResponseAudioDeltaEvent
  | ResponseAudioDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ErrorEvent;

// ============================================================================
// Conversation Items
// ============================================================================

export interface ConversationItem {
  id?: string;
  type: 'message' | 'function_call' | 'function_call_output';
  role?: 'user' | 'assistant' | 'system';
  content?: ConversationItemContent[];
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

export interface ConversationItemContent {
  type: 'input_text' | 'input_audio' | 'text' | 'audio';
  text?: string;
  audio?: string;
  transcript?: string;
}

// ============================================================================
// Response Object
// ============================================================================

export interface ResponseObject {
  id: string;
  object: 'realtime.response';
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'incomplete';
  status_details?: {
    type: string;
    reason?: string;
    error?: {
      type: string;
      code: string;
      message: string;
    };
  };
  output: ConversationItem[];
  usage?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
}

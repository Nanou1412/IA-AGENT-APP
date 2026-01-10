/**
 * OpenAI Realtime Client
 * 
 * Manages WebSocket connection to OpenAI Realtime API
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { ServerConfig } from '../config.js';
import type {
  ClientEvent,
  ServerEvent,
  RealtimeTool,
  SessionUpdateEvent,
  ConversationItem,
} from '../types/openai-realtime.js';

const log = createLogger('openai-client');

export interface OpenAIClientConfig {
  serverConfig: ServerConfig;
  sessionId: string;
  systemPrompt: string;
  tools: RealtimeTool[];
  voice?: 'alloy' | 'echo' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';
  onAudioDelta: (audioBase64: string) => void;
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onFunctionCall: (name: string, args: Record<string, unknown>, callId: string) => Promise<string>;
  onError: (error: Error) => void;
  onClose: () => void;
}

export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private config: OpenAIClientConfig;
  private isConnected = false;
  private pendingFunctionCalls = new Map<string, { name: string; arguments: string }>();
  
  constructor(config: OpenAIClientConfig) {
    this.config = config;
  }
  
  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    const { serverConfig, sessionId } = this.config;
    
    return new Promise((resolve, reject) => {
      const url = `${serverConfig.openaiRealtimeUrl}?model=${serverConfig.openaiModel}`;
      
      log.info(`Connecting to OpenAI Realtime`, { sessionId, model: serverConfig.openaiModel });
      
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${serverConfig.openaiApiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });
      
      this.ws.on('open', () => {
        log.info('Connected to OpenAI Realtime', { sessionId });
        this.isConnected = true;
        this.initializeSession();
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });
      
      this.ws.on('error', (error) => {
        log.error('WebSocket error', { sessionId, error: error.message });
        this.config.onError(error);
        reject(error);
      });
      
      this.ws.on('close', (code, reason) => {
        log.info('WebSocket closed', { sessionId, code, reason: reason.toString() });
        this.isConnected = false;
        this.config.onClose();
      });
    });
  }
  
  /**
   * Initialize the session with our configuration
   */
  private initializeSession(): void {
    const { systemPrompt, tools, voice } = this.config;
    
    const sessionUpdate: SessionUpdateEvent = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemPrompt,
        voice: voice || 'alloy',
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
        tools: tools,
        tool_choice: tools.length > 0 ? 'auto' : 'none',
        temperature: 0.7,
        max_response_output_tokens: 256,
      },
    };
    
    this.send(sessionUpdate);
    log.info('Session initialized', { 
      sessionId: this.config.sessionId,
      toolCount: tools.length,
    });
  }
  
  /**
   * Send audio data to OpenAI
   */
  sendAudio(audioBase64: string): void {
    if (!this.isConnected) {
      log.warn('Cannot send audio - not connected');
      return;
    }
    
    this.send({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }
  
  /**
   * Send a text message (for debugging/fallback)
   */
  sendText(text: string): void {
    if (!this.isConnected) {
      log.warn('Cannot send text - not connected');
      return;
    }
    
    const item: ConversationItem = {
      id: uuidv4(),
      type: 'message',
      role: 'user',
      content: [{
        type: 'input_text',
        text,
      }],
    };
    
    this.send({
      type: 'conversation.item.create',
      item,
    });
    
    this.send({
      type: 'response.create',
    });
  }
  
  /**
   * Send function result back to OpenAI
   */
  sendFunctionResult(callId: string, result: string): void {
    if (!this.isConnected) {
      log.warn('Cannot send function result - not connected');
      return;
    }
    
    const item: ConversationItem = {
      type: 'function_call_output',
      call_id: callId,
      output: result,
    };
    
    this.send({
      type: 'conversation.item.create',
      item,
    });
    
    // Request a new response after function result
    this.send({
      type: 'response.create',
    });
  }
  
  /**
   * Interrupt current response (when user speaks)
   */
  interrupt(): void {
    if (!this.isConnected) return;
    
    this.send({
      type: 'response.cancel',
    });
    
    this.send({
      type: 'input_audio_buffer.clear',
    });
  }
  
  /**
   * Close the connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
  
  /**
   * Send a message to OpenAI
   */
  private send(event: ClientEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot send - WebSocket not open');
      return;
    }
    
    this.ws.send(JSON.stringify(event));
  }
  
  /**
   * Handle incoming messages from OpenAI
   */
  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data) as ServerEvent;
      
      switch (event.type) {
        case 'session.created':
          log.info('Session created by OpenAI', { sessionId: event.session.id });
          break;
          
        case 'session.updated':
          log.debug('Session updated');
          break;
          
        case 'input_audio_buffer.speech_started':
          log.debug('Speech started');
          break;
          
        case 'input_audio_buffer.speech_stopped':
          log.debug('Speech stopped');
          break;
          
        case 'response.audio.delta':
          // Stream audio back to Twilio
          this.config.onAudioDelta(event.delta);
          break;
          
        case 'response.audio_transcript.delta':
          this.config.onTranscript(event.delta, false);
          break;
          
        case 'response.audio_transcript.done':
          this.config.onTranscript(event.transcript, true);
          log.debug('AI transcript', { transcript: event.transcript });
          break;
          
        case 'response.function_call_arguments.delta':
          // Accumulate function call arguments
          const existing = this.pendingFunctionCalls.get(event.call_id);
          if (existing) {
            existing.arguments += event.delta;
          } else {
            this.pendingFunctionCalls.set(event.call_id, {
              name: '',
              arguments: event.delta,
            });
          }
          break;
          
        case 'response.function_call_arguments.done':
          // Execute the function
          log.info('Function call received', { 
            name: event.name, 
            arguments: event.arguments,
          });
          this.handleFunctionCall(event.name, event.arguments, event.call_id);
          break;
          
        case 'response.done':
          log.debug('Response completed', { 
            status: event.response.status,
            usage: event.response.usage,
          });
          break;
          
        case 'error':
          log.error('OpenAI error', event.error);
          this.config.onError(new Error(event.error.message));
          break;
          
        default:
          // Log unknown events for debugging
          log.debug('Unhandled event', { type: (event as ServerEvent).type });
      }
    } catch (error) {
      log.error('Failed to parse message', { error, data });
    }
  }
  
  /**
   * Handle function calls from OpenAI
   */
  private async handleFunctionCall(name: string, argsJson: string, callId: string): Promise<void> {
    try {
      const args = JSON.parse(argsJson) as Record<string, unknown>;
      const result = await this.config.onFunctionCall(name, args, callId);
      this.sendFunctionResult(callId, result);
    } catch (error) {
      log.error('Function call failed', { name, error });
      this.sendFunctionResult(callId, JSON.stringify({ 
        error: 'Function execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
    } finally {
      this.pendingFunctionCalls.delete(callId);
    }
  }
}

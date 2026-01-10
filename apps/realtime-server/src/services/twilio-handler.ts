/**
 * Twilio WebSocket Handler
 * 
 * Handles Twilio Media Stream WebSocket connections and bridges them to OpenAI.
 */

import WebSocket, { WebSocketServer } from 'ws';
import { createLogger } from '../utils/logger.js';
import { SessionManager, VoiceSession } from './session-manager.js';
import { AppClient } from './app-client.js';
import { convertTwilioToOpenAI, convertOpenAIToTwilio } from '../utils/audio.js';
import type {
  TwilioMessage,
  TwilioStartMessage,
  TwilioMediaMessage,
  TwilioSessionContext,
} from '../types/twilio.js';

const log = createLogger('twilio-handler');

export class TwilioHandler {
  private wss: WebSocketServer | null = null;
  private sessionManager: SessionManager;
  private appClient: AppClient;
  
  constructor(sessionManager: SessionManager, appClient: AppClient) {
    this.sessionManager = sessionManager;
    this.appClient = appClient;
  }
  
  /**
   * Attach to an HTTP server
   */
  attach(server: import('http').Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/twilio',
    });
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
    
    log.info('Twilio WebSocket handler attached');
  }
  
  /**
   * Handle new WebSocket connection from Twilio
   */
  private handleConnection(ws: WebSocket, req: import('http').IncomingMessage): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const orgId = url.searchParams.get('orgId') || '';
    const callSid = url.searchParams.get('callSid') || '';
    const from = url.searchParams.get('from') || '';
    
    log.info('New Twilio connection', { orgId, callSid, from });
    
    // Create initial context (will be updated on 'start' message)
    const initialContext: TwilioSessionContext = {
      streamSid: '',
      callSid,
      accountSid: '',
      orgId,
      from,
      customParameters: {},
    };
    
    // Create session
    const session = this.sessionManager.createSession(initialContext);
    session.twilioWs = ws;
    
    // Set up message handler
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as TwilioMessage;
        await this.handleMessage(session, message);
      } catch (error) {
        log.error('Failed to handle message', { 
          sessionId: session.id, 
          error: error instanceof Error ? error.message : error,
        });
      }
    });
    
    ws.on('close', (code, reason) => {
      log.info('Twilio connection closed', { 
        sessionId: session.id, 
        code, 
        reason: reason.toString(),
      });
      this.sessionManager.closeSession(session.id);
    });
    
    ws.on('error', (error) => {
      log.error('Twilio WebSocket error', { 
        sessionId: session.id, 
        error: error.message,
      });
    });
  }
  
  /**
   * Handle messages from Twilio
   */
  private async handleMessage(session: VoiceSession, message: TwilioMessage): Promise<void> {
    switch (message.event) {
      case 'connected':
        log.debug('Twilio connected', { sessionId: session.id });
        break;
        
      case 'start':
        await this.handleStart(session, message);
        break;
        
      case 'media':
        this.handleMedia(session, message);
        break;
        
      case 'stop':
        log.info('Twilio stream stopped', { sessionId: session.id });
        this.sessionManager.closeSession(session.id);
        break;
        
      case 'mark':
        log.debug('Twilio mark', { sessionId: session.id, name: message.mark.name });
        break;
        
      default:
        log.debug('Unknown Twilio event', { event: (message as TwilioMessage).event });
    }
  }
  
  /**
   * Handle 'start' message from Twilio
   */
  private async handleStart(session: VoiceSession, message: TwilioStartMessage): Promise<void> {
    const { streamSid, start } = message;
    
    // Update session context with full info from Twilio
    session.twilioContext = {
      streamSid,
      callSid: start.callSid,
      accountSid: start.accountSid,
      orgId: session.twilioContext.orgId || start.customParameters.orgId || '',
      from: session.twilioContext.from || start.customParameters.from || '',
      customParameters: start.customParameters,
    };
    
    log.info('Twilio stream started', {
      sessionId: session.id,
      streamSid,
      callSid: start.callSid,
      orgId: session.twilioContext.orgId,
    });
    
    // Load org configuration
    const orgConfig = await this.appClient.getOrgConfig(session.twilioContext.orgId);
    
    if (!orgConfig) {
      log.error('Failed to load org config', { orgId: session.twilioContext.orgId });
      // Send error message via TTS (would need Twilio API call)
      this.sessionManager.closeSession(session.id);
      return;
    }
    
    session.orgConfig = orgConfig;
    
    // Initialize OpenAI connection
    try {
      await this.sessionManager.initializeOpenAI(session);
      log.info('Session fully initialized', { sessionId: session.id });
    } catch (error) {
      log.error('Failed to initialize OpenAI', { 
        sessionId: session.id, 
        error: error instanceof Error ? error.message : error,
      });
      this.sessionManager.closeSession(session.id);
    }
  }
  
  /**
   * Handle 'media' message from Twilio (audio data)
   */
  private handleMedia(session: VoiceSession, message: TwilioMediaMessage): void {
    if (message.media.track !== 'inbound') {
      return; // Only process inbound audio (from caller)
    }
    
    if (!session.openaiClient) {
      log.debug('Dropping audio - OpenAI not connected');
      return;
    }
    
    // Update activity timestamp
    this.sessionManager.touchSession(session.id);
    
    // Convert audio format and send to OpenAI
    // Twilio sends mulaw 8kHz, OpenAI expects PCM16 24kHz
    try {
      const pcm16Audio = convertTwilioToOpenAI(message.media.payload);
      session.openaiClient.sendAudio(pcm16Audio);
    } catch (error) {
      log.error('Audio conversion failed', { 
        sessionId: session.id, 
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  
  /**
   * Get active connection count
   */
  getConnectionCount(): number {
    return this.wss?.clients.size || 0;
  }
}

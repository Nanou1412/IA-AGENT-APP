/**
 * OpenAI Realtime Voice Server
 * 
 * A WebSocket bridge between Twilio Media Streams and OpenAI Realtime API.
 * Provides ultra-low latency voice AI for phone calls.
 * 
 * Architecture:
 * 
 *   [Twilio Call] 
 *        ↓
 *   [Twilio Media Stream (WebSocket)]
 *        ↓
 *   [This Server]
 *        ↓
 *   [OpenAI Realtime API (WebSocket)]
 *        ↓
 *   [AI Response (audio)]
 *        ↓
 *   [This Server]
 *        ↓
 *   [Twilio Media Stream]
 *        ↓
 *   [Caller hears response]
 * 
 * @author IA Agent App
 * @version 1.0.0
 */

import http from 'http';
import express from 'express';
import { loadConfig, validateConfig } from './config.js';
import { setLogLevel, createLogger } from './utils/logger.js';
import { SessionManager } from './services/session-manager.js';
import { AppClient } from './services/app-client.js';
import { TwilioHandler } from './services/twilio-handler.js';

const log = createLogger('server');

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  try {
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);
    setLogLevel(config.logLevel);
    
    log.info('Starting OpenAI Realtime Voice Server...');
    
    // Initialize services
    const sessionManager = new SessionManager(config);
    const appClient = new AppClient(config);
    const twilioHandler = new TwilioHandler(sessionManager, appClient);
    
    // Create Express app
    const app = express();
    app.use(express.json());
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        uptime: process.uptime(),
        activeSessions: sessionManager.getActiveSessionCount(),
        activeConnections: twilioHandler.getConnectionCount(),
      });
    });
    
    // TwiML endpoint - returns TwiML to start Media Stream
    app.post('/twiml/start', async (req, res) => {
      const orgId = req.query.orgId as string || req.body.orgId || '';
      const callSid = req.body.CallSid || '';
      const from = req.body.From || '';
      
      log.info('TwiML start requested', { orgId, callSid, from });
      
      if (!orgId) {
        log.error('Missing orgId in TwiML request');
        res.status(400).send('Missing orgId');
        return;
      }
      
      // Build WebSocket URL for Media Stream
      const wsProtocol = req.secure ? 'wss' : 'ws';
      const host = req.headers.host || 'localhost:8080';
      const streamUrl = `${wsProtocol}://${host}/ws/twilio?orgId=${encodeURIComponent(orgId)}&callSid=${encodeURIComponent(callSid)}&from=${encodeURIComponent(from)}`;
      
      // Generate TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-AU">Please wait while I connect you to our ordering assistant.</Say>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="orgId" value="${orgId}" />
      <Parameter name="from" value="${from}" />
    </Stream>
  </Connect>
  <Say voice="alice" language="en-AU">Thank you for your order. Goodbye.</Say>
</Response>`;
      
      res.type('text/xml').send(twiml);
    });
    
    // Status endpoint
    app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        config: {
          appUrl: config.appUrl,
          model: config.openaiModel,
          logLevel: config.logLevel,
        },
        sessions: {
          active: sessionManager.getActiveSessionCount(),
        },
        connections: {
          twilio: twilioHandler.getConnectionCount(),
        },
      });
    });
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Attach WebSocket handler
    twilioHandler.attach(server);
    
    // Start server
    server.listen(config.port, config.host, () => {
      log.info(`Server listening on ${config.host}:${config.port}`);
      log.info(`Health check: http://${config.host}:${config.port}/health`);
      log.info(`TwiML endpoint: http://${config.host}:${config.port}/twiml/start`);
      log.info(`WebSocket endpoint: ws://${config.host}:${config.port}/ws/twilio`);
    });
    
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down...`);
      
      sessionManager.shutdown();
      
      server.close(() => {
        log.info('Server closed');
        process.exit(0);
      });
      
      // Force exit after 10 seconds
      setTimeout(() => {
        log.warn('Forcing exit after timeout');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (err) {
    const e = err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { err };
    log.error('Failed to start server', { error: e });
    process.exit(1);
  }
}

// Run
main();

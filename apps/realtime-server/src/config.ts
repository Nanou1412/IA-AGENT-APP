/**
 * Configuration for OpenAI Realtime Server
 */

import { config } from 'dotenv';

// Load environment variables
config();

export interface ServerConfig {
  // Server
  port: number;
  host: string;
  
  // OpenAI
  openaiApiKey: string;
  openaiRealtimeUrl: string;
  openaiModel: string;
  
  // App integration
  appUrl: string;
  internalApiKey: string;
  
  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

export function loadConfig(): ServerConfig {
  return {
    // Server
    port: parseInt(getEnv('PORT', '8080'), 10),
    host: getEnv('HOST', '0.0.0.0'),
    
    // OpenAI
    openaiApiKey: getEnv('OPENAI_API_KEY'),
    openaiRealtimeUrl: 'wss://api.openai.com/v1/realtime',
    openaiModel: 'gpt-4o-realtime-preview-2024-12-17',
    
    // App integration
    appUrl: getEnv('APP_URL', 'https://ia-agent-app-app.vercel.app'),
    internalApiKey: getEnv('INTERNAL_API_KEY', ''),
    
    // Logging
    logLevel: (getEnv('LOG_LEVEL', 'info') as ServerConfig['logLevel']),
  };
}

// Validate config on load
export function validateConfig(cfg: ServerConfig): void {
  if (!cfg.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  
  if (!cfg.openaiApiKey.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY must start with sk-');
  }
  
  // SECURITY (F-005/F-006): Require INTERNAL_API_KEY in production
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !cfg.internalApiKey) {
    throw new Error(
      'SECURITY: INTERNAL_API_KEY is required in production. ' +
      'This key is used to verify tokens from the main app.'
    );
  }
  
  console.log(`[config] Loaded configuration:`);
  console.log(`  - Port: ${cfg.port}`);
  console.log(`  - OpenAI Model: ${cfg.openaiModel}`);
  console.log(`  - App URL: ${cfg.appUrl}`);
  console.log(`  - Log Level: ${cfg.logLevel}`);
  console.log(`  - Internal API Key: ${cfg.internalApiKey ? '***configured***' : '(not set)'}`);
}

/**
 * Server Initialization
 * 
 * Called during server startup via instrumentation.ts
 * Performs all production readiness checks.
 * 
 * This file should only be imported server-side (Node.js runtime).
 */

import { requireValidEnvironment } from './env-validation';
import { requireRedisInProduction, isCacheConfigured } from './cache';
import { isEncryptionConfigured } from './crypto';

/**
 * Initialize server and validate production requirements
 * Throws in production if critical requirements are not met
 */
export async function initializeServer(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  
  console.log('[server-init] Server initialization starting...');
  console.log(`[server-init] Environment: ${process.env.NODE_ENV}`);
  
  // ========================================================================
  // 1. Environment Variable Validation
  // ========================================================================
  try {
    requireValidEnvironment();
  } catch (error) {
    console.error('[server-init] Environment validation failed:', error);
    if (isProd) {
      throw error; // Crash in production if env is invalid
    }
  }
  
  // ========================================================================
  // 2. Redis Requirement Check (Production Only)
  // ========================================================================
  if (isProd) {
    try {
      requireRedisInProduction();
      console.log('[server-init] ✅ Redis configured');
    } catch (error) {
      console.error('[server-init] Redis check failed:', error);
      throw error; // Crash in production if Redis is not configured
    }
  } else {
    // Development: just log status
    console.log(`[server-init] Redis: ${isCacheConfigured() ? 'configured' : 'not configured (using in-memory)'}`);
  }
  
  // ========================================================================
  // 3. Encryption Key Check (Production Only)
  // ========================================================================
  if (isProd) {
    if (!isEncryptionConfigured()) {
      const error = new Error('TOKENS_ENCRYPTION_KEY is required in production');
      console.error('[server-init] Encryption check failed:', error.message);
      throw error;
    }
    console.log('[server-init] ✅ Token encryption configured');
  } else {
    console.log(`[server-init] Encryption: ${isEncryptionConfigured() ? 'configured' : 'not configured'}`);
  }
  
  // ========================================================================
  // 4. Log Startup Summary
  // ========================================================================
  console.log('[server-init] ✅ Server initialization complete');
  console.log('[server-init] Ready to accept requests');
}

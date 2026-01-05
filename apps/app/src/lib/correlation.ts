/**
 * Correlation ID / Request Tracing
 * 
 * Provides request-scoped correlation IDs for distributed tracing.
 * Phase 8: Production Readiness
 * 
 * Features:
 * - UUID-based correlation ID per request
 * - Async local storage for automatic propagation
 * - Headers integration for cross-service tracing
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface RequestContext {
  correlationId: string;
  startTime: number;
  orgId?: string;
  userId?: string;
  channel?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Async Local Storage
// ============================================================================

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current correlation ID
 * Returns a new ID if no context exists (for safety)
 */
export function getCorrelationId(): string {
  const context = getRequestContext();
  return context?.correlationId ?? generateCorrelationId();
}

/**
 * Run a function with a new request context
 */
export async function withRequestContext<T>(
  context: Partial<RequestContext>,
  fn: () => T | Promise<T>
): Promise<T> {
  const fullContext: RequestContext = {
    correlationId: context.correlationId ?? generateCorrelationId(),
    startTime: context.startTime ?? Date.now(),
    orgId: context.orgId,
    userId: context.userId,
    channel: context.channel,
    sessionId: context.sessionId,
    metadata: context.metadata,
  };
  
  return requestContextStorage.run(fullContext, fn);
}

/**
 * Update the current request context
 */
export function updateRequestContext(updates: Partial<RequestContext>): void {
  const current = getRequestContext();
  if (!current) return;
  
  // Mutate in place (same object in storage)
  Object.assign(current, updates);
}

/**
 * Add metadata to current request context
 */
export function addContextMetadata(metadata: Record<string, unknown>): void {
  const current = getRequestContext();
  if (!current) return;
  
  current.metadata = {
    ...current.metadata,
    ...metadata,
  };
}

// ============================================================================
// HTTP Headers Integration
// ============================================================================

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Extract correlation ID from incoming headers
 */
export function extractCorrelationIdFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>
): string {
  let correlationId: string | undefined;
  
  if (headers instanceof Headers) {
    correlationId = headers.get(CORRELATION_ID_HEADER) 
      ?? headers.get(REQUEST_ID_HEADER) 
      ?? undefined;
  } else {
    const rawValue = headers[CORRELATION_ID_HEADER] 
      ?? headers[REQUEST_ID_HEADER]
      ?? headers['x-vercel-id'];
    correlationId = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  }
  
  return correlationId ?? generateCorrelationId();
}

/**
 * Create headers with correlation ID for outgoing requests
 */
export function createTracingHeaders(
  existingHeaders?: HeadersInit
): Headers {
  const headers = new Headers(existingHeaders);
  const correlationId = getCorrelationId();
  
  if (!headers.has(CORRELATION_ID_HEADER)) {
    headers.set(CORRELATION_ID_HEADER, correlationId);
  }
  
  return headers;
}

// ============================================================================
// Logging Integration
// ============================================================================

/**
 * Create a log context object with tracing info
 * Use this when structured logging
 */
export function getLogContext(): Record<string, unknown> {
  const context = getRequestContext();
  
  if (!context) {
    return { correlationId: 'no-context' };
  }
  
  return {
    correlationId: context.correlationId,
    orgId: context.orgId,
    userId: context.userId,
    channel: context.channel,
    sessionId: context.sessionId,
    durationMs: Date.now() - context.startTime,
  };
}

/**
 * Log with automatic context injection
 */
export function logWithContext(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
): void {
  const logContext = getLogContext();
  const logData = {
    ...logContext,
    ...data,
    message,
    level,
    timestamp: new Date().toISOString(),
  };
  
  switch (level) {
    case 'debug':
      console.debug(JSON.stringify(logData));
      break;
    case 'info':
      console.info(JSON.stringify(logData));
      break;
    case 'warn':
      console.warn(JSON.stringify(logData));
      break;
    case 'error':
      console.error(JSON.stringify(logData));
      break;
  }
}

// ============================================================================
// Convenience Wrappers
// ============================================================================

/**
 * Create a traced fetch function
 */
export function createTracedFetch(
  baseFetch: typeof fetch = fetch
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = createTracingHeaders(init?.headers);
    
    return baseFetch(input, {
      ...init,
      headers,
    });
  };
}

/**
 * Measure and log duration of an async operation
 */
export async function traceOperation<T>(
  operationName: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    logWithContext('info', `${operationName} completed`, {
      operation: operationName,
      durationMs: duration,
      status: 'success',
      ...metadata,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', `${operationName} failed`, {
      operation: operationName,
      durationMs: duration,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      ...metadata,
    });
    
    throw error;
  }
}

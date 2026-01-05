/**
 * API Route Wrapper with Correlation ID
 * 
 * Wraps API route handlers to:
 * - Extract/generate correlation ID
 * - Set up request context
 * - Add correlation ID to response headers
 * - Handle errors with proper logging
 * 
 * Usage:
 * ```typescript
 * import { withCorrelation } from '@/lib/api-utils';
 * 
 * export const POST = withCorrelation(async (request, context) => {
 *   // context.correlationId is available
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  withRequestContext, 
  extractCorrelationIdFromHeaders,
  CORRELATION_ID_HEADER,
  logWithContext,
  updateRequestContext,
} from '@/lib/correlation';
import { increment, METRIC_NAMES } from '@/lib/metrics';

// ============================================================================
// Types
// ============================================================================

export interface ApiContext {
  correlationId: string;
  startTime: number;
}

export type ApiHandler = (
  request: NextRequest,
  context: ApiContext
) => Promise<Response>;

export type ApiHandlerWithParams = (
  request: NextRequest,
  params: { params: Record<string, string> },
  context: ApiContext
) => Promise<Response>;

// ============================================================================
// Wrapper Functions
// ============================================================================

/**
 * Wrap an API route handler with correlation ID support
 */
export function withCorrelation(handler: ApiHandler): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const correlationId = extractCorrelationIdFromHeaders(request.headers);
    const startTime = Date.now();
    
    try {
      const response = await withRequestContext(
        { correlationId, startTime },
        async () => {
          logWithContext('info', `${request.method} ${request.nextUrl.pathname}`, {
            method: request.method,
            path: request.nextUrl.pathname,
          });
          
          return handler(request, { correlationId, startTime });
        }
      );
      
      // Add correlation ID to response
      const headers = new Headers(response.headers);
      headers.set(CORRELATION_ID_HEADER, correlationId);
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      logWithContext('error', 'API request failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs,
      });
      
      increment(METRIC_NAMES.API_ERROR, {
        path: request.nextUrl.pathname,
        method: request.method,
      });
      
      return new NextResponse(
        JSON.stringify({ error: 'Internal Server Error', correlationId }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            [CORRELATION_ID_HEADER]: correlationId,
          },
        }
      );
    }
  };
}

/**
 * Wrap an API route handler with params and correlation ID support
 */
export function withCorrelationAndParams(
  handler: ApiHandlerWithParams
): (request: NextRequest, params: { params: Record<string, string> }) => Promise<Response> {
  return async (request: NextRequest, params: { params: Record<string, string> }) => {
    const correlationId = extractCorrelationIdFromHeaders(request.headers);
    const startTime = Date.now();
    
    try {
      const response = await withRequestContext(
        { correlationId, startTime },
        async () => {
          logWithContext('info', `${request.method} ${request.nextUrl.pathname}`, {
            method: request.method,
            path: request.nextUrl.pathname,
            params: params.params,
          });
          
          return handler(request, params, { correlationId, startTime });
        }
      );
      
      // Add correlation ID to response
      const headers = new Headers(response.headers);
      headers.set(CORRELATION_ID_HEADER, correlationId);
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      logWithContext('error', 'API request failed', {
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });
      
      increment(METRIC_NAMES.API_ERROR, {
        path: request.nextUrl.pathname,
        method: request.method,
      });
      
      return new NextResponse(
        JSON.stringify({ error: 'Internal Server Error', correlationId }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            [CORRELATION_ID_HEADER]: correlationId,
          },
        }
      );
    }
  };
}

/**
 * Set org context in the current request (call after resolving orgId)
 */
export function setOrgContext(orgId: string, channel?: string, sessionId?: string): void {
  updateRequestContext({ orgId, channel, sessionId });
}

/**
 * Create a JSON response with correlation ID
 */
export function jsonResponse(
  data: unknown,
  init?: ResponseInit
): NextResponse {
  const correlationId = extractCorrelationIdFromHeaders(new Headers());
  const headers = new Headers(init?.headers);
  headers.set(CORRELATION_ID_HEADER, correlationId);
  headers.set('Content-Type', 'application/json');
  
  return new NextResponse(JSON.stringify(data), {
    ...init,
    headers,
  });
}

/**
 * Create an error response with correlation ID
 */
export function errorResponse(
  message: string,
  status: number = 500
): NextResponse {
  const correlationId = extractCorrelationIdFromHeaders(new Headers());
  
  return new NextResponse(
    JSON.stringify({ error: message, correlationId }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        [CORRELATION_ID_HEADER]: correlationId,
      },
    }
  );
}

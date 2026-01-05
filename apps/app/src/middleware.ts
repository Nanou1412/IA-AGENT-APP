import { withAuth } from 'next-auth/middleware';
import { NextResponse, NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Generate or propagate correlation ID for all requests
 */
function addCorrelationId(request: NextRequest, response: NextResponse): NextResponse {
  // Get existing correlation ID or generate new one
  const existingId = request.headers.get(CORRELATION_ID_HEADER) 
    ?? request.headers.get('x-request-id')
    ?? request.headers.get('x-vercel-id');
  
  const correlationId = existingId ?? randomUUID();
  
  // Add to response headers
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  
  // Clone request headers and add correlation ID for downstream
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
  
  return response;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // If user is not logged in, redirect to login
    if (!token) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const response = NextResponse.next();
    return addCorrelationId(req, response);
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    '/app/:path*',
    '/admin/:path*',
  ],
};

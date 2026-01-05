/**
 * Prometheus-compatible Metrics Endpoint
 * 
 * GET /api/metrics
 * 
 * Returns metrics in Prometheus text format for scraping.
 * Optional: Set METRICS_API_TOKEN env var for simple auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrometheusMetrics } from '@/lib/metrics';

const METRICS_API_TOKEN = process.env.METRICS_API_TOKEN;

export async function GET(request: NextRequest): Promise<Response> {
  // Simple token auth if configured
  if (METRICS_API_TOKEN) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (token !== METRICS_API_TOKEN) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }
  
  try {
    const metrics = getPrometheusMetrics();
    
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[/api/metrics] Error generating metrics:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// Disable body parsing for this route
export const dynamic = 'force-dynamic';

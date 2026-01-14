/**
 * Production Health Check Endpoint
 * 
 * Provides comprehensive health status for monitoring and load balancers.
 * Checks: Database, Redis, OpenAI, and overall system status.
 * 
 * Returns:
 * - 200 OK: All systems operational
 * - 503 Service Unavailable: One or more critical systems down
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isCacheConfigured } from '@/lib/cache';
import { envChecks } from '@/lib/env-validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ============================================================================
// Types
// ============================================================================

interface ServiceStatus {
  status: 'ok' | 'error' | 'degraded';
  latencyMs?: number;
  message?: string;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  environment: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    openai: ServiceStatus;
  };
  version?: string;
}

// ============================================================================
// Service Checks
// ============================================================================

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  
  if (!isCacheConfigured()) {
    // In production, Redis is required
    if (process.env.NODE_ENV === 'production') {
      return {
        status: 'error',
        message: 'Redis not configured (required in production)',
      };
    }
    return {
      status: 'degraded',
      message: 'Redis not configured (optional in development)',
    };
  }
  
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL!;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    
    // Simple PING command
    const response = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        message: `Redis returned ${response.status}`,
      };
    }
    
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

async function checkOpenAI(): Promise<ServiceStatus> {
  const start = Date.now();
  
  if (!envChecks.isOpenAIConfigured()) {
    return {
      status: 'error',
      message: 'OpenAI API key not configured',
    };
  }
  
  try {
    // Light check - just verify the API key format and do a models list (minimal API call)
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        message: `OpenAI API returned ${response.status}: ${errorText.slice(0, 100)}`,
      };
    }
    
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'OpenAI connection failed',
    };
  }
}

// ============================================================================
// Handler
// ============================================================================

export async function GET() {
  // Run all checks in parallel
  const [database, redis, openai] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkOpenAI(),
  ]);
  
  // Determine overall status
  const anyError = database.status === 'error' || redis.status === 'error' || openai.status === 'error';
  
  // Database is critical - if it's down, we're unhealthy
  // Redis is critical in production
  // OpenAI degraded is acceptable (can still serve cached responses)
  const isCriticalFailure = database.status === 'error' || 
    (redis.status === 'error' && process.env.NODE_ENV === 'production');
  
  const overallStatus: HealthResponse['status'] = isCriticalFailure 
    ? 'unhealthy' 
    : anyError 
      ? 'degraded' 
      : 'healthy';
  
  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database,
      redis,
      openai,
    },
    version: process.env.npm_package_version || '1.0.0',
  };
  
  // Return appropriate HTTP status
  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
  
  return NextResponse.json(response, { 
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

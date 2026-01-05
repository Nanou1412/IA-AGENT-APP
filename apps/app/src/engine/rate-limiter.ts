/**
 * Rate Limiter - Controls engine invocation frequency per org
 * 
 * Uses in-memory LRU cache for development.
 * In production, should be backed by Redis or database.
 */

import { ENGINE_CONFIG } from './llm';

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetInMs: number;
  reason?: string;
}

// ============================================================================
// In-Memory Store (LRU-like)
// ============================================================================

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_CACHE_SIZE = 10000; // Max orgs to track

// Simple in-memory store
const rateLimitStore = new Map<string, RateLimitEntry>();
const accessOrder: string[] = [];

/**
 * Clean up old entries and maintain cache size
 */
function cleanupStore(): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  
  // Remove expired timestamps from all entries
  for (const [key, entry] of rateLimitStore.entries()) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx !== -1) accessOrder.splice(idx, 1);
    }
  }
  
  // Evict oldest entries if over limit
  while (rateLimitStore.size > MAX_CACHE_SIZE && accessOrder.length > 0) {
    const oldest = accessOrder.shift();
    if (oldest) rateLimitStore.delete(oldest);
  }
}

/**
 * Update access order for LRU
 */
function touchEntry(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) {
    accessOrder.splice(idx, 1);
  }
  accessOrder.push(key);
}

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * Check and record a rate limit attempt
 */
export function checkRateLimit(
  orgId: string,
  limitPerMinute: number = ENGINE_CONFIG.rateLimitPerMinute
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  
  // Periodic cleanup (every 100 calls)
  if (Math.random() < 0.01) {
    cleanupStore();
  }
  
  // Get or create entry
  let entry = rateLimitStore.get(orgId);
  
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(orgId, entry);
  }
  
  // Filter to only recent timestamps
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
  
  // Update access order
  touchEntry(orgId);
  
  // Check limit
  const currentCount = entry.timestamps.length;
  
  if (currentCount >= limitPerMinute) {
    // Calculate reset time
    const oldestTimestamp = entry.timestamps[0] || now;
    const resetInMs = (oldestTimestamp + WINDOW_MS) - now;
    
    return {
      allowed: false,
      remainingRequests: 0,
      resetInMs: Math.max(0, resetInMs),
      reason: `Rate limit exceeded: ${currentCount}/${limitPerMinute} requests per minute`,
    };
  }
  
  // Record this request
  entry.timestamps.push(now);
  
  return {
    allowed: true,
    remainingRequests: limitPerMinute - entry.timestamps.length,
    resetInMs: WINDOW_MS,
  };
}

/**
 * Get current rate limit status without recording a request
 */
export function getRateLimitStatus(
  orgId: string,
  limitPerMinute: number = ENGINE_CONFIG.rateLimitPerMinute
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  
  const entry = rateLimitStore.get(orgId);
  
  if (!entry) {
    return {
      allowed: true,
      remainingRequests: limitPerMinute,
      resetInMs: WINDOW_MS,
    };
  }
  
  // Count recent requests
  const recentCount = entry.timestamps.filter(t => t > cutoff).length;
  
  return {
    allowed: recentCount < limitPerMinute,
    remainingRequests: Math.max(0, limitPerMinute - recentCount),
    resetInMs: WINDOW_MS,
  };
}

/**
 * Reset rate limit for an org (for testing/admin)
 */
export function resetRateLimit(orgId: string): void {
  rateLimitStore.delete(orgId);
  const idx = accessOrder.indexOf(orgId);
  if (idx !== -1) accessOrder.splice(idx, 1);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
  accessOrder.length = 0;
}

// ============================================================================
// DB-Based Rate Limiting (Phase 8)
// ============================================================================

import { prisma } from '@/lib/prisma';
import { increment, METRIC_NAMES } from '@/lib/metrics';

/**
 * Check engine run rate limit using DB counts
 * Uses EngineRun table for accurate counting
 * 
 * @param orgId Organization ID
 * @param customLimit Optional custom limit (defaults to org setting)
 */
export async function checkDbRateLimit(
  orgId: string,
  customLimit?: number
): Promise<RateLimitResult> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  
  // Get org's rate limit setting
  const settings = customLimit === undefined 
    ? await prisma.orgSettings.findUnique({
        where: { orgId },
        select: { maxEngineRunsPerMinute: true },
      })
    : null;
  
  const limit = customLimit ?? settings?.maxEngineRunsPerMinute ?? 60;
  
  // Count recent engine runs
  const recentCount = await prisma.engineRun.count({
    where: {
      orgId,
      createdAt: { gte: oneMinuteAgo },
    },
  });
  
  if (recentCount >= limit) {
    increment(METRIC_NAMES.RATE_LIMIT_EXCEEDED, { orgId, type: 'engine' });
    
    return {
      allowed: false,
      remainingRequests: 0,
      resetInMs: 60 * 1000, // Approximate
      reason: `Rate limit exceeded: ${recentCount}/${limit} engine runs per minute`,
    };
  }
  
  return {
    allowed: true,
    remainingRequests: limit - recentCount,
    resetInMs: 60 * 1000,
  };
}

/**
 * Check message rate limit using DB counts
 * Uses MessageLog table for accurate counting
 */
export async function checkMessageRateLimit(
  orgId: string,
  customLimit?: number
): Promise<RateLimitResult> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  
  const settings = customLimit === undefined
    ? await prisma.orgSettings.findUnique({
        where: { orgId },
        select: { maxMessagesPerMinute: true },
      })
    : null;
  
  const limit = customLimit ?? settings?.maxMessagesPerMinute ?? 30;
  
  // Count recent outbound messages
  const recentCount = await prisma.messageLog.count({
    where: {
      orgId,
      direction: 'outbound',
      createdAt: { gte: oneMinuteAgo },
    },
  });
  
  if (recentCount >= limit) {
    increment(METRIC_NAMES.RATE_LIMIT_EXCEEDED, { orgId, type: 'message' });
    
    return {
      allowed: false,
      remainingRequests: 0,
      resetInMs: 60 * 1000,
      reason: `Rate limit exceeded: ${recentCount}/${limit} messages per minute`,
    };
  }
  
  return {
    allowed: true,
    remainingRequests: limit - recentCount,
    resetInMs: 60 * 1000,
  };
}

/**
 * Require engine rate limit (throws if exceeded)
 */
export async function requireEngineRateLimit(orgId: string): Promise<void> {
  const check = await checkDbRateLimit(orgId);
  
  if (!check.allowed) {
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: 'rate.limit_exceeded',
        details: {
          type: 'engine',
          reason: check.reason,
        },
      },
    });
    
    throw new RateLimitError(check);
  }
}

/**
 * Require message rate limit (throws if exceeded)
 */
export async function requireMessageRateLimit(orgId: string): Promise<void> {
  const check = await checkMessageRateLimit(orgId);
  
  if (!check.allowed) {
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: 'rate.limit_exceeded',
        details: {
          type: 'message',
          reason: check.reason,
        },
      },
    });
    
    throw new RateLimitError(check);
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  readonly checkResult: RateLimitResult;
  
  constructor(checkResult: RateLimitResult) {
    super(checkResult.reason || 'Rate limit exceeded');
    this.name = 'RateLimitError';
    this.checkResult = checkResult;
  }
}

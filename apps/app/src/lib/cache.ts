/**
 * Cache Layer for Performance Optimization
 * 
 * Uses Upstash Redis for serverless caching.
 * Falls back to in-memory cache if Redis is not configured.
 * 
 * Primary use cases:
 * - Org settings (menu, takeaway config, templates)
 * - Voice configurations
 * - Rate limiting (future)
 */

// ============================================================================
// Types
// ============================================================================

interface CacheConfig {
  /** Default TTL in seconds */
  defaultTtlSeconds: number;
  /** Prefix for all keys */
  keyPrefix: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ============================================================================
// Configuration
// ============================================================================

const CACHE_CONFIG: CacheConfig = {
  defaultTtlSeconds: 300, // 5 minutes
  keyPrefix: 'ia-agent:',
};

// TTL configurations for different data types
export const CACHE_TTL = {
  ORG_SETTINGS: 300,      // 5 min - org settings change rarely
  MENU_CONFIG: 600,       // 10 min - menu changes are infrequent
  VOICE_CONFIG: 300,      // 5 min - voice config
  TEMPLATE: 600,          // 10 min - templates are stable
  SESSION: 60,            // 1 min - sessions are more dynamic
} as const;

// ============================================================================
// Upstash Redis Client (Lazy Initialization)
// ============================================================================

let redisClient: ReturnType<typeof createRedisClient> | null = null;

function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  // Simple REST-based Redis client for Upstash
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (!data.result) return null;
        
        return JSON.parse(data.result) as T;
      } catch {
        console.warn('[cache] Redis GET error');
        return null;
      }
    },

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
      try {
        const response = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}/ex/${ttlSeconds}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        
        return response.ok;
      } catch {
        console.warn('[cache] Redis SET error');
        return false;
      }
    },

    async del(key: string): Promise<boolean> {
      try {
        const response = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        
        return response.ok;
      } catch {
        console.warn('[cache] Redis DEL error');
        return false;
      }
    },

    async flushPattern(pattern: string): Promise<void> {
      // Upstash doesn't support SCAN easily via REST, skip for now
      console.warn('[cache] flushPattern not implemented for Upstash REST');
    },
  };
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

// ============================================================================
// In-Memory Fallback Cache
// ============================================================================

const memoryCache = new Map<string, CacheEntry<unknown>>();

// Cleanup expired entries periodically (every 60 seconds)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt < now) {
        memoryCache.delete(key);
      }
    }
  }, 60000);
}

// ============================================================================
// Cache API
// ============================================================================

/**
 * Check if Redis is configured
 */
export function isCacheConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

/**
 * Build a cache key with prefix
 */
function buildKey(key: string): string {
  return `${CACHE_CONFIG.keyPrefix}${key}`;
}

/**
 * Get a value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const fullKey = buildKey(key);
  const redis = getRedisClient();

  // Try Redis first
  if (redis) {
    const value = await redis.get<T>(fullKey);
    if (value !== null) {
      return value;
    }
  }

  // Fallback to memory cache
  const entry = memoryCache.get(fullKey) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }

  // Expired or not found
  if (entry) {
    memoryCache.delete(fullKey);
  }
  
  return null;
}

/**
 * Set a value in cache
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number = CACHE_CONFIG.defaultTtlSeconds): Promise<void> {
  const fullKey = buildKey(key);
  const redis = getRedisClient();

  // Store in Redis
  if (redis) {
    await redis.set(fullKey, value, ttlSeconds);
  }

  // Also store in memory cache for faster local access
  memoryCache.set(fullKey, {
    data: value,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

/**
 * Delete a value from cache
 */
export async function cacheDel(key: string): Promise<void> {
  const fullKey = buildKey(key);
  const redis = getRedisClient();

  if (redis) {
    await redis.del(fullKey);
  }
  
  memoryCache.delete(fullKey);
}

/**
 * Get or set pattern - returns cached value or fetches and caches
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = CACHE_CONFIG.defaultTtlSeconds
): Promise<T> {
  // Try cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const data = await fetcher();
  
  // Cache it
  await cacheSet(key, data, ttlSeconds);
  
  return data;
}

// ============================================================================
// Convenience Functions for Common Patterns
// ============================================================================

/**
 * Cache key for org settings
 */
export function orgSettingsKey(orgId: string): string {
  return `org:${orgId}:settings`;
}

/**
 * Cache key for org voice config
 */
export function orgVoiceConfigKey(orgId: string): string {
  return `org:${orgId}:voice`;
}

/**
 * Cache key for org template
 */
export function orgTemplateKey(orgId: string): string {
  return `org:${orgId}:template`;
}

/**
 * Cache key for org menu
 */
export function orgMenuKey(orgId: string): string {
  return `org:${orgId}:menu`;
}

/**
 * Invalidate all caches for an org (call when settings change)
 */
export async function invalidateOrgCache(orgId: string): Promise<void> {
  await Promise.all([
    cacheDel(orgSettingsKey(orgId)),
    cacheDel(orgVoiceConfigKey(orgId)),
    cacheDel(orgTemplateKey(orgId)),
    cacheDel(orgMenuKey(orgId)),
  ]);
}

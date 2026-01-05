/**
 * Sanitization Utilities
 * 
 * Functions to remove sensitive data from objects before logging/storage.
 * NEVER store or log tokens, API keys, or authorization headers.
 */

// Keys that should always be removed from objects
const SENSITIVE_KEYS = new Set([
  // OAuth tokens
  'access_token',
  'accessToken',
  'access_token_encrypted',
  'accessTokenEncrypted',
  'refresh_token',
  'refreshToken',
  'refresh_token_encrypted',
  'refreshTokenEncrypted',
  'id_token',
  'idToken',
  'token',
  'bearer',
  
  // API keys and secrets
  'api_key',
  'apiKey',
  'secret',
  'secretKey',
  'secret_key',
  'client_secret',
  'clientSecret',
  'password',
  'passwd',
  
  // Authorization headers
  'authorization',
  'Authorization',
  'x-api-key',
  'X-API-Key',
]);

// Patterns that indicate sensitive values
const SENSITIVE_VALUE_PATTERNS = [
  /^ya29\./i, // Google access token
  /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/i, // JWT
  /^sk[-_]/i, // Stripe/OpenAI secret key
  /^pk[-_]/i, // Stripe publishable key
  /^Bearer\s+/i, // Bearer token
  /^Basic\s+/i, // Basic auth
];

/**
 * Check if a value looks like a token or secret
 */
function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  
  return SENSITIVE_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Sanitize an object by removing sensitive keys and values
 * Returns a new object with sensitive data removed.
 * 
 * @param obj - The object to sanitize
 * @param depth - Maximum recursion depth (default 10)
 * @returns Sanitized object
 */
export function sanitize<T>(obj: T, depth: number = 10): T {
  if (depth <= 0) {
    return '[MAX_DEPTH]' as unknown as T;
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    // Check if primitive value looks sensitive
    if (isSensitiveValue(obj)) {
      return '[REDACTED]' as unknown as T;
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, depth - 1)) as unknown as T;
  }
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive keys entirely
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    
    // Recursively sanitize nested objects
    result[key] = sanitize(value, depth - 1);
  }
  
  return result as T;
}

/**
 * Sanitize for logging - also truncates long strings
 */
export function sanitizeForLog<T>(obj: T, maxStringLength: number = 500): T {
  const sanitized = sanitize(obj);
  return truncateStrings(sanitized, maxStringLength);
}

/**
 * Truncate long strings in an object
 */
function truncateStrings<T>(obj: T, maxLength: number): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    if (obj.length > maxLength) {
      return `${obj.substring(0, maxLength)}...[truncated]` as unknown as T;
    }
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => truncateStrings(item, maxLength)) as unknown as T;
  }
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = truncateStrings(value, maxLength);
  }
  
  return result as T;
}

/**
 * Check if an object contains any sensitive data
 * Useful for validation before storage
 */
export function containsSensitiveData(obj: unknown): boolean {
  if (obj === null || obj === undefined) {
    return false;
  }
  
  if (typeof obj !== 'object') {
    return isSensitiveValue(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.some(item => containsSensitiveData(item));
  }
  
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      // Key exists and has a non-null/non-redacted value
      if (value !== null && value !== undefined && value !== '[REDACTED]') {
        return true;
      }
    }
    
    if (containsSensitiveData(value)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Assert that an object has been sanitized
 * Throws if sensitive data is found
 */
export function assertSanitized(obj: unknown, context: string = 'object'): void {
  if (containsSensitiveData(obj)) {
    throw new Error(`Sensitive data found in ${context}. Use sanitize() before storage/logging.`);
  }
}

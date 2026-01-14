/**
 * Environment Variable Validation
 * 
 * PRODUCTION HARDENING: Validates all required environment variables at boot.
 * In production, missing or placeholder values cause an immediate crash.
 * 
 * This file should be imported at application startup (instrumentation.ts or layout.tsx server component).
 */

// ============================================================================
// Types
// ============================================================================

interface EnvVar {
  name: string;
  required: boolean;
  /** Patterns that indicate a placeholder value (not real credentials) */
  placeholderPatterns?: RegExp[];
  /** Custom validator function */
  validator?: (value: string) => boolean;
  /** Only required in production */
  prodOnly?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Placeholder Detection Patterns
// ============================================================================

const COMMON_PLACEHOLDERS = [
  /^your[-_]?/i,
  /^xxx+$/i,
  /^placeholder/i,
  /^change[-_]?me/i,
  /^todo/i,
  /^example/i,
  /^test[-_]?key/i,
];

const STRIPE_TEST_PATTERNS = [
  /^sk_test_placeholder$/,
  /^pk_test_placeholder$/,
];

// ============================================================================
// Environment Variable Definitions
// ============================================================================

const ENV_VARS: EnvVar[] = [
  // Database
  {
    name: 'DATABASE_URL',
    required: true,
    placeholderPatterns: [/^postgresql:\/\/user:password@localhost/],
  },
  
  // NextAuth
  {
    name: 'NEXTAUTH_URL',
    required: true,
    validator: (v) => v.startsWith('http://') || v.startsWith('https://'),
  },
  {
    name: 'NEXTAUTH_SECRET',
    required: true,
    placeholderPatterns: [/^your[-_]?nextauth[-_]?secret/i, /change[-_]?in[-_]?production/i],
    validator: (v) => v.length >= 32,
  },
  
  // Stripe
  {
    name: 'STRIPE_SECRET_KEY',
    required: true,
    placeholderPatterns: [...STRIPE_TEST_PATTERNS, ...COMMON_PLACEHOLDERS],
    validator: (v) => v.startsWith('sk_live_') || v.startsWith('sk_test_'),
  },
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
    required: true,
    validator: (v) => v.startsWith('pk_live_') || v.startsWith('pk_test_'),
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: true,
    validator: (v) => v.startsWith('whsec_'),
  },
  {
    name: 'STRIPE_SETUP_FEE_PRICE_ID',
    required: true,
    validator: (v) => v.startsWith('price_'),
  },
  {
    name: 'STRIPE_WEEKLY_SUBSCRIPTION_PRICE_ID',
    required: true,
    validator: (v) => v.startsWith('price_'),
  },
  
  // Stripe Connect
  {
    name: 'STRIPE_CONNECT_CLIENT_ID',
    required: false,
    validator: (v) => v.startsWith('ca_'),
  },
  
  // Twilio
  {
    name: 'TWILIO_ACCOUNT_SID',
    required: true,
    placeholderPatterns: COMMON_PLACEHOLDERS,
    validator: (v) => v.startsWith('AC') && v.length === 34,
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    required: true,
    placeholderPatterns: COMMON_PLACEHOLDERS,
    validator: (v) => v.length === 32,
  },
  
  // OpenAI
  {
    name: 'OPENAI_API_KEY',
    required: true,
    placeholderPatterns: COMMON_PLACEHOLDERS,
    validator: (v) => v.startsWith('sk-'),
  },
  
  // Redis (Upstash) - REQUIRED in production
  {
    name: 'UPSTASH_REDIS_REST_URL',
    required: true,
    prodOnly: true,
    validator: (v) => v.startsWith('https://'),
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    required: true,
    prodOnly: true,
    placeholderPatterns: COMMON_PLACEHOLDERS,
  },
  
  // Token Encryption - REQUIRED in production
  {
    name: 'TOKENS_ENCRYPTION_KEY',
    required: true,
    prodOnly: true,
    placeholderPatterns: COMMON_PLACEHOLDERS,
    validator: (v) => {
      try {
        const decoded = Buffer.from(v, 'base64');
        return decoded.length === 32;
      } catch {
        return false;
      }
    },
  },
  
  // App URL
  {
    name: 'NEXT_PUBLIC_APP_URL',
    required: true,
    validator: (v) => v.startsWith('http://') || v.startsWith('https://'),
  },
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a value is a placeholder
 */
function isPlaceholder(value: string, patterns: RegExp[] = []): boolean {
  const allPatterns = [...COMMON_PLACEHOLDERS, ...patterns];
  return allPatterns.some(pattern => pattern.test(value));
}

/**
 * Validate a single environment variable
 */
function validateEnvVar(envVar: EnvVar, isProd: boolean): { error?: string; warning?: string } {
  const value = process.env[envVar.name];
  
  // Check if required in current environment
  const isRequired = envVar.required && (!envVar.prodOnly || isProd);
  
  // Missing value
  if (!value || value.trim() === '') {
    if (isRequired) {
      return { error: `${envVar.name} is required but not set` };
    }
    return {};
  }
  
  // Placeholder check (only error in production)
  if (envVar.placeholderPatterns && isPlaceholder(value, envVar.placeholderPatterns)) {
    if (isProd) {
      return { error: `${envVar.name} contains a placeholder value - real credentials required in production` };
    }
    return { warning: `${envVar.name} appears to contain a placeholder value` };
  }
  
  // Custom validator
  if (envVar.validator && !envVar.validator(value)) {
    if (isProd) {
      return { error: `${envVar.name} has invalid format` };
    }
    return { warning: `${envVar.name} has unexpected format` };
  }
  
  return {};
}

/**
 * Validate all environment variables
 */
export function validateEnvironment(): ValidationResult {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const envVar of ENV_VARS) {
    const result = validateEnvVar(envVar, isProd);
    if (result.error) {
      errors.push(result.error);
    }
    if (result.warning) {
      warnings.push(result.warning);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment and throw if invalid in production
 * Call this at application startup
 */
export function requireValidEnvironment(): void {
  const result = validateEnvironment();
  const isProd = process.env.NODE_ENV === 'production';
  
  // SECURITY: Block dev credentials in production
  if (isProd && process.env.AUTH_DEV_CREDENTIALS === 'true') {
    throw new Error(
      'SECURITY VIOLATION: AUTH_DEV_CREDENTIALS=true is not allowed in production. ' +
      'Set AUTH_DEV_CREDENTIALS=false or remove it from your environment.'
    );
  }

  // SECURITY: Block SKIP_TWILIO_SIGNATURE in production (F-008)
  if (isProd && process.env.SKIP_TWILIO_SIGNATURE === '1') {
    throw new Error(
      'SECURITY VIOLATION: SKIP_TWILIO_SIGNATURE=1 is not allowed in production. ' +
      'Remove this variable from your production environment.'
    );
  }

  // SECURITY: Require INTERNAL_API_KEY in production (F-003/F-004)
  if (isProd && !process.env.INTERNAL_API_KEY) {
    throw new Error(
      'SECURITY VIOLATION: INTERNAL_API_KEY is required in production. ' +
      'Set a secure random string (min 32 chars) for server-to-server authentication.'
    );
  }
  
  // Log warnings
  if (result.warnings.length > 0) {
    console.warn('[env-validation] Warnings:');
    result.warnings.forEach(w => console.warn(`  - ${w}`));
  }
  
  // In production, throw on errors
  if (!result.valid) {
    console.error('[env-validation] CRITICAL: Environment validation failed!');
    result.errors.forEach(e => console.error(`  ❌ ${e}`));
    
    if (isProd) {
      throw new Error(
        `Environment validation failed in production. ${result.errors.length} error(s) found. ` +
        `Check logs for details.`
      );
    } else {
      console.warn('[env-validation] Continuing in development mode despite errors...');
    }
  } else {
    console.log('[env-validation] ✅ All required environment variables validated');
  }
}

/**
 * Check specific service configuration
 */
export const envChecks = {
  isStripeConfigured(): boolean {
    return !!(
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PUBLISHABLE_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET
    );
  },
  
  isTwilioConfigured(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN
    );
  },
  
  isOpenAIConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  },
  
  isRedisConfigured(): boolean {
    return !!(
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
    );
  },
  
  isEncryptionConfigured(): boolean {
    const key = process.env.TOKENS_ENCRYPTION_KEY;
    if (!key) return false;
    try {
      const decoded = Buffer.from(key, 'base64');
      return decoded.length === 32;
    } catch {
      return false;
    }
  },
  
  /** Returns true if we're in production mode */
  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};

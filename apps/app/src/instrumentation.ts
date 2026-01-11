/**
 * Next.js Instrumentation
 * 
 * This file runs at server startup before any request handling.
 * Used for:
 * - Environment validation
 * - Service initialization
 * - Production readiness checks
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on Node.js server (not edge or during build)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to avoid bundling issues
    const { initializeServer } = await import('./lib/server-init');
    await initializeServer();
  }
}

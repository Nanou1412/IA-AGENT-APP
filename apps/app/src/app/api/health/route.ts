/**
 * Health check endpoint to verify OpenAI configuration
 */
import { NextRequest, NextResponse } from 'next/server';
import { isOpenAIConfigured } from '@/engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const openaiConfigured = isOpenAIConfigured();
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  const keyPrefix = process.env.OPENAI_API_KEY?.substring(0, 7) || 'NOT_SET';
  
  return NextResponse.json({
    status: 'ok',
    openai: {
      configured: openaiConfigured,
      hasApiKey,
      keyPrefix: keyPrefix.replace(/./g, (c, i) => i < 3 ? c : '*'),
    },
    timestamp: new Date().toISOString(),
  });
}

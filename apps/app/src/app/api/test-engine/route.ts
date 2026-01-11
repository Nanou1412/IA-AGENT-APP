/**
 * Test endpoint to diagnose engine issues
 * 
 * SECURITY: This endpoint is disabled in production.
 */
import { NextRequest, NextResponse } from 'next/server';
import { handleInboundMessage, type EngineInput } from '@/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Block access in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is not available in production' },
      { status: 404 }
    );
  }
  
  try {
    const body = await req.json();
    
    const engineInput: EngineInput = {
      orgId: body.orgId || 'cmk5rtmi9000267bmjc3chqw9',
      channel: 'voice',
      contactKey: body.from || '+33612345678',
      userText: body.text || 'I want a burger',
      externalThreadKey: body.callSid || 'test-call-123',
      raw: {},
    };
    
    console.log('[test-engine] Calling engine with:', engineInput);
    
    const result = await handleInboundMessage(engineInput);
    
    console.log('[test-engine] Engine result:', result);
    
    return NextResponse.json({
      success: true,
      input: engineInput,
      result: {
        responseText: result.responseText,
        handoffTriggered: result.handoffTriggered,
        handoffReason: result.handoffReason,
        blocked: result.blocked,
        blockedBy: result.blockedBy,
        sessionId: result.sessionId,
        engineRunId: result.engineRunId,
      },
    });
    
  } catch (error) {
    console.error('[test-engine] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

/**
 * Debug endpoint to test voice lookup exactly as the webhook does
 * TEMPORARY - remove after debugging
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgFromVoiceNumber } from '@/lib/twilio-voice';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Parse exactly like the voice webhook
    const text = await req.text();
    const params: Record<string, string> = {};
    
    for (const pair of text.split('&')) {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
      }
    }
    
    const To = params.To;
    
    console.log('[debug-voice] Parsed To:', To);
    console.log('[debug-voice] Raw text:', text);
    console.log('[debug-voice] All params:', params);
    
    const endpoint = await resolveOrgFromVoiceNumber(To);
    
    return NextResponse.json({
      rawText: text,
      parsedTo: To,
      allParams: params,
      endpointFound: !!endpoint,
      endpoint,
    });
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

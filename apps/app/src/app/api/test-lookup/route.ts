/**
 * TEMPORARY - Test endpoint lookup and signature debugging
 * DELETE AFTER DEBUGGING
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MessagingChannel } from '@prisma/client';
import { resolveOrgFromVoiceNumber, getPublicRequestUrl, validateTwilioSignature } from '@/lib/twilio-voice';

export const dynamic = 'force-dynamic';

// Parse form body like voice webhook does
async function parseFormBody(text: string): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  
  for (const pair of text.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  
  return params;
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') || '+61468086457';
  
  try {
    // Test using the actual function from twilio-voice
    const result = await resolveOrgFromVoiceNumber(phone);
    
    // Also direct query
    const endpoint = await prisma.channelEndpoint.findFirst({
      where: {
        channel: MessagingChannel.voice,
        twilioPhoneNumber: phone,
        isActive: true,
      },
    });
    
    // Test 2: All endpoints
    const allEndpoints = await prisma.channelEndpoint.findMany({
      select: {
        id: true,
        twilioPhoneNumber: true,
        channel: true,
        isActive: true,
      },
    });
    
    return NextResponse.json({
      searchedPhone: phone,
      resolveOrgFromVoiceNumberResult: result,
      directQueryResult: endpoint ? { id: endpoint.id, orgId: endpoint.orgId } : null,
      allEndpoints,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

// POST - test exactly like voice webhook + signature debug
export async function POST(req: NextRequest) {
  const text = await req.text();
  const params = await parseFormBody(text);
  
  const To = params.To;
  
  // Get signature info
  const signature = req.headers.get('x-twilio-signature') || '';
  const webhookUrl = getPublicRequestUrl(req);
  
  // Test signature validation
  let signatureValid = false;
  try {
    signatureValid = validateTwilioSignature(signature, webhookUrl, params);
  } catch (e) {
    // ignore
  }
  
  // Use the actual function
  const resolveResult = await resolveOrgFromVoiceNumber(To);
  
  // Also direct query
  const normalized = To ? To.replace(/[^\d+]/g, '') : 'NO_TO';
  const directEndpoint = await prisma.channelEndpoint.findFirst({
    where: {
      channel: MessagingChannel.voice,
      twilioPhoneNumber: normalized,
      isActive: true,
    },
    select: {
      id: true,
      orgId: true,
    },
  });
  
  // Get all headers for debug
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  return NextResponse.json({
    signatureDebug: {
      signaturePresent: !!signature,
      signatureLength: signature.length,
      webhookUrl,
      signatureValid,
      authTokenConfigured: !!process.env.TWILIO_AUTH_TOKEN,
      authTokenLength: process.env.TWILIO_AUTH_TOKEN?.length || 0,
    },
    headers,
    rawText: text,
    parsedTo: To,
    normalizedTo: normalized,
    allParams: params,
    resolveOrgFromVoiceNumberResult: resolveResult,
    directQueryResult: directEndpoint,
  });
}

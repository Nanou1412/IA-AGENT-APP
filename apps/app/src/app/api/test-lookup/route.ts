/**
 * TEMPORARY - Test endpoint lookup
 * DELETE AFTER DEBUGGING
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MessagingChannel } from '@prisma/client';

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
    // Test 1: Direct query
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
      found: !!endpoint,
      endpoint: endpoint ? { id: endpoint.id, orgId: endpoint.orgId } : null,
      allEndpoints,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// POST - test exactly like voice webhook
export async function POST(req: NextRequest) {
  const text = await req.text();
  const params = await parseFormBody(text);
  
  const To = params.To;
  const normalized = To ? To.replace(/[^\d+]/g, '') : 'NO_TO';
  
  // Query exactly like resolveOrgFromVoiceNumber
  const endpoint = await prisma.channelEndpoint.findFirst({
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
  
  return NextResponse.json({
    rawText: text,
    parsedTo: To,
    normalizedTo: normalized,
    allParams: params,
    endpointFound: !!endpoint,
    endpoint,
  });
}

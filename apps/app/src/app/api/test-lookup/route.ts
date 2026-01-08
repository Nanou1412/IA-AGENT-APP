/**
 * TEMPORARY - Test endpoint lookup
 * DELETE AFTER DEBUGGING
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MessagingChannel } from '@prisma/client';

export const dynamic = 'force-dynamic';

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

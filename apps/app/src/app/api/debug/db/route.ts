/**
 * Debug endpoint to check DB connectivity and ChannelEndpoint
 * TEMPORARY - remove after debugging
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MessagingChannel } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') || '+61363642206';
  
  try {
    // Test DB connection
    const userCount = await prisma.user.count();
    const orgCount = await prisma.org.count();
    const endpointCount = await prisma.channelEndpoint.count();
    
    // Find specific endpoint
    const normalized = phone.replace(/[^\d+]/g, '');
    const endpoint = await prisma.channelEndpoint.findFirst({
      where: {
        channel: MessagingChannel.voice,
        twilioPhoneNumber: normalized,
        isActive: true,
      },
      include: {
        orgSettings: {
          select: {
            orgId: true,
            sandboxStatus: true,
            billingStatus: true,
            voiceEnabled: true,
          },
        },
      },
    });
    
    // List all endpoints
    const allEndpoints = await prisma.channelEndpoint.findMany({
      select: {
        id: true,
        channel: true,
        twilioPhoneNumber: true,
        isActive: true,
        orgId: true,
      },
    });
    
    return NextResponse.json({
      status: 'ok',
      dbConnected: true,
      counts: { users: userCount, orgs: orgCount, endpoints: endpointCount },
      lookupPhone: normalized,
      endpointFound: !!endpoint,
      endpoint: endpoint ? {
        id: endpoint.id,
        phone: endpoint.twilioPhoneNumber,
        isActive: endpoint.isActive,
        orgId: endpoint.orgId,
        settings: endpoint.orgSettings,
      } : null,
      allEndpoints,
    });
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Disconnect Google Integration
 * 
 * POST /api/google/disconnect
 * 
 * Purges all tokens and sensitive data from the integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { disconnectGoogle } from '@/lib/google/calendar';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    // Verify permission
    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId: session.user.id,
          orgId,
        },
      },
    });

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Disconnect and purge tokens
    const result = await disconnectGoogle(orgId);

    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    // Log audit with revoked action
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: session.user.id,
        action: 'google.oauth.revoked',
        details: {
          googleEmail: result.data.googleEmail,
          revokedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[google-disconnect] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

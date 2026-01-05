/**
 * Google OAuth Start - Initiates OAuth flow for Google Calendar
 * 
 * GET /api/google/oauth/start?orgId=...
 * 
 * Requires: authenticated owner/manager of the org
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateSignedOAuthState } from '@/lib/crypto';

// Google OAuth configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function GET(request: NextRequest) {
  try {
    // Get session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get orgId from query params
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing orgId parameter' },
        { status: 400 }
      );
    }

    // Verify user is owner/manager of this org
    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId: session.user.id,
          orgId,
        },
      },
    });

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden: must be owner or manager' },
        { status: 403 }
      );
    }

    // Verify org exists
    const org = await prisma.org.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Check required env vars
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const scopes = process.env.GOOGLE_OAUTH_SCOPES || 'https://www.googleapis.com/auth/calendar';

    if (!clientId || !redirectUri) {
      console.error('[google-oauth] Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI');
      return NextResponse.json(
        { error: 'Google OAuth not configured' },
        { status: 500 }
      );
    }

    // Generate signed state with orgId
    const state = generateSignedOAuthState(orgId);

    // Build authorization URL
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline'); // Get refresh token
    authUrl.searchParams.set('prompt', 'consent'); // Always show consent to get refresh token
    authUrl.searchParams.set('state', state);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: session.user.id,
        action: 'google.oauth.started',
        details: {
          redirectUri,
          scopes,
        },
      },
    });

    // Redirect to Google
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('[google-oauth-start] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

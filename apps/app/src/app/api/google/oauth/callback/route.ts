/**
 * Google OAuth Callback - Handles OAuth callback from Google
 * 
 * GET /api/google/oauth/callback?code=...&state=...
 * 
 * Exchanges authorization code for tokens and stores them encrypted.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateSignedOAuthState, encryptToken } from '@/lib/crypto';
import { IntegrationStatus } from '@prisma/client';

// Google token endpoint
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const settingsUrl = `${appUrl}/app/settings/integrations`;

  try {
    // Get session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(`${settingsUrl}?error=unauthorized`);
    }

    // Get params from URL
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('[google-oauth-callback] OAuth error:', error);
      return NextResponse.redirect(`${settingsUrl}?error=${error}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${settingsUrl}?error=missing_params`);
    }

    // Validate state
    const stateData = validateSignedOAuthState(state);
    if (!stateData) {
      console.error('[google-oauth-callback] Invalid or expired state');
      return NextResponse.redirect(`${settingsUrl}?error=invalid_state`);
    }

    const { orgId } = stateData;

    // Verify user has permission for this org
    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId: session.user.id,
          orgId,
        },
      },
    });

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return NextResponse.redirect(`${settingsUrl}?error=forbidden`);
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[google-oauth-callback] Missing Google OAuth configuration');
      return NextResponse.redirect(`${settingsUrl}?error=config_error`);
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[google-oauth-callback] Token exchange failed:', errorData);
      
      // Log failure
      await prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: session.user.id,
          action: 'google.oauth.failed',
          details: {
            error: 'token_exchange_failed',
            status: tokenResponse.status,
          },
        },
      });
      
      return NextResponse.redirect(`${settingsUrl}?error=token_exchange_failed`);
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Get user info to store email
    let googleEmail: string | undefined;
    try {
      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      if (userInfoResponse.ok) {
        const userInfo: GoogleUserInfo = await userInfoResponse.json();
        googleEmail = userInfo.email;
      }
    } catch (e) {
      console.warn('[google-oauth-callback] Failed to get user info:', e);
    }

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    // Encrypt tokens
    const accessTokenEncrypted = encryptToken(tokens.access_token);
    const refreshTokenEncrypted = encryptToken(tokens.refresh_token);

    // Upsert integration record
    await prisma.orgIntegration.upsert({
      where: {
        orgId_provider: {
          orgId,
          provider: 'google',
        },
      },
      create: {
        orgId,
        provider: 'google',
        status: IntegrationStatus.connected,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiry,
        scope: tokens.scope,
        metadata: {
          googleUserEmail: googleEmail,
          calendarId: 'primary', // Default to primary calendar
          connectedAt: new Date().toISOString(),
        },
      },
      update: {
        status: IntegrationStatus.connected,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiry,
        scope: tokens.scope,
        metadata: {
          googleUserEmail: googleEmail,
          calendarId: 'primary',
          reconnectedAt: new Date().toISOString(),
        },
      },
    });

    // Log success
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: session.user.id,
        action: 'google.oauth.completed',
        details: {
          googleEmail,
          scope: tokens.scope,
          hasRefreshToken: !!tokens.refresh_token,
        },
      },
    });

    // Redirect to settings with success
    return NextResponse.redirect(`${settingsUrl}?connected=google`);
  } catch (error) {
    console.error('[google-oauth-callback] Error:', error);
    return NextResponse.redirect(`${settingsUrl}?error=internal_error`);
  }
}

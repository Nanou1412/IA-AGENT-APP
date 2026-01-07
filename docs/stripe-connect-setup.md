# Stripe Connect Setup

This document explains how to configure and test Stripe Connect for the IA-AGENT-APP platform.

## Overview

Stripe Connect allows each restaurant (Organization) to connect their own Stripe account. The platform stores the connected account ID (`acct_...`) and uses it to create Checkout Sessions and Payment Links on behalf of the restaurant.

## Required Environment Variables

Add these variables to your Vercel project (Production & Preview environments):

```bash
# Stripe Connect OAuth
STRIPE_CONNECT_CLIENT_ID=ca_...     # From Stripe Dashboard > Connect > Settings
STRIPE_CONNECT_REDIRECT_URI=https://ia-agent-app-app.vercel.app/api/stripe/connect/callback

# Stripe API (already configured)
STRIPE_SECRET_KEY=sk_test_...       # or sk_live_... for production

# State signing (already configured for NextAuth)
NEXTAUTH_SECRET=your-secret-here    # Used to sign OAuth state (anti-CSRF)
```

## Stripe Dashboard Configuration

1. **Enable Stripe Connect**
   - Go to [Stripe Dashboard > Connect](https://dashboard.stripe.com/connect/accounts/overview)
   - Enable Standard accounts

2. **Configure OAuth Settings**
   - Go to Connect > Settings
   - Add redirect URI: `https://ia-agent-app-app.vercel.app/api/stripe/connect/callback`
   - Copy the `client_id` (starts with `ca_...`) → use as `STRIPE_CONNECT_CLIENT_ID`

3. **Test Mode vs Live Mode**
   - Use test mode for development/staging
   - Switch to live mode for production (requires identity verification)

## How It Works

### Flow

1. **User clicks "Connect Stripe"** on `/app/billing`
2. **App redirects** to `GET /api/stripe/connect?orgId=xxx`
3. **App redirects to Stripe** OAuth authorization page
4. **User authorizes** and connects their Stripe account
5. **Stripe redirects back** to `/api/stripe/connect/callback?code=xxx&state=xxx`
6. **App exchanges code** for `stripe_user_id` (account ID)
7. **App updates org** with `stripeAccountId = acct_...`
8. **User redirected** to `/app/billing?stripeConnected=1`

### Security

- **State signing**: HMAC-SHA256 with 10-minute TTL to prevent CSRF attacks
- **No secrets in logs**: Only masked IDs are logged
- **Timing-safe comparison**: State verification uses constant-time comparison

## Database Schema

The `Org` model has been updated:

```prisma
model Org {
  id               String   @id @default(cuid())
  name             String
  stripeAccountId  String?  @unique  // Stripe Connect account ID (acct_...)
  // ...other fields
}
```

## Testing (5 Steps)

### 1. Configure Environment

Ensure all env vars are set in Vercel and `.env.local` for local testing.

### 2. Start Dev Server

```bash
cd apps/app
pnpm dev
```

### 3. Navigate to Billing Page

- Sign in as an organization owner
- Go to `/app/billing`
- You should see "Stripe Connect" section with status "Non connecté"

### 4. Click "Connect Stripe"

- Click the "Connect Stripe" button
- You'll be redirected to Stripe's OAuth page
- Use a test Stripe account (or create one at https://dashboard.stripe.com/register)
- Authorize the connection

### 5. Verify Connection

- You'll be redirected back to `/app/billing?stripeConnected=1`
- The Stripe Connect section should show "Connecté" with the account ID
- Check the database: `Org` table should have `stripeAccountId` populated

## Using the Connected Account

Once connected, use the `stripeAccountId` to create charges on behalf of the restaurant:

```typescript
import { stripe } from '@/lib/stripe';

// Create a Checkout Session for the connected account
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: 'price_xxx', quantity: 1 }],
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',
}, {
  stripeAccount: org.stripeAccountId, // ← Connected account ID
});
```

## Troubleshooting

### "Missing orgId parameter"

- Ensure the button passes `?orgId=xxx` in the URL
- Check that the user's session has an active org

### "Invalid or expired state"

- State has a 10-minute TTL
- Ensure `NEXTAUTH_SECRET` is consistent between start and callback
- Check server time is synchronized

### "Failed to connect Stripe account"

- Check `STRIPE_SECRET_KEY` is correct
- Verify the OAuth code hasn't been used already (codes are single-use)
- Check Stripe Dashboard for error logs

### Account ID not saving

- Check database connection
- Verify `Org` table has `stripeAccountId` column (run migrations)
- Check server logs for Prisma errors

## References

- [Stripe Connect OAuth Documentation](https://stripe.com/docs/connect/oauth-reference)
- [Stripe Connect Standard Accounts](https://stripe.com/docs/connect/standard-accounts)
- [Stripe API - Connected Accounts](https://stripe.com/docs/api/connected-accounts)

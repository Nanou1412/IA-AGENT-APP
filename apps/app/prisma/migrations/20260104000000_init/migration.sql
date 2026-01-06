-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'manager', 'staff');

-- CreateEnum
CREATE TYPE "SandboxStatus" AS ENUM ('sandbox_required', 'sandbox_in_progress', 'ready_for_review', 'approved', 'revoked');

-- CreateEnum
CREATE TYPE "SensitiveModulesStatus" AS ENUM ('disabled', 'pending_review', 'enabled');

-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('todo', 'in_progress', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('inactive', 'incomplete', 'active', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('sms', 'whatsapp', 'voice');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('pending', 'active', 'rolled_back');

-- CreateEnum
CREATE TYPE "ConversationSessionStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "ConversationTurnRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "EngineRunStatus" AS ENUM ('success', 'handoff', 'blocked', 'error');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('google');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('connected', 'disconnected', 'error');

-- CreateEnum
CREATE TYPE "BookingAction" AS ENUM ('check', 'create', 'modify', 'cancel');

-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('success', 'blocked', 'error', 'handoff');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending_confirmation', 'pending_payment', 'confirmed', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('not_required', 'pending', 'paid', 'failed', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "OrderPaymentLinkStatus" AS ENUM ('active', 'completed', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('draft_created', 'draft_updated', 'confirmation_requested', 'confirmed', 'expired', 'canceled', 'handoff_triggered', 'notification_sent', 'notification_failed', 'error', 'pending_payment', 'payment_link_created', 'payment_paid', 'payment_failed', 'payment_expired', 'payment_retry_link_created', 'payment_canceled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'staff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sandboxStatus" "SandboxStatus" NOT NULL DEFAULT 'sandbox_required',
    "sensitiveModulesStatus" "SensitiveModulesStatus" NOT NULL DEFAULT 'disabled',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'inactive',
    "setupFeePaidAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "messagingLocale" TEXT NOT NULL DEFAULT 'en-AU',
    "defaultInboundReplyText" TEXT,
    "deniedReplyText" TEXT,
    "handoffReplyText" TEXT,
    "handoffPhone" TEXT,
    "handoffEmail" TEXT,
    "handoffSmsTo" TEXT,
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "callQueueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "callWelcomeText" TEXT,
    "callQueueWaitText" TEXT,
    "callDenyText" TEXT,
    "callHandoffNumber" TEXT,
    "recordCalls" BOOLEAN NOT NULL DEFAULT false,
    "faqText" TEXT,
    "aiModelOverride" TEXT,
    "bookingConfig" JSONB,
    "takeawayConfig" JSONB,
    "takeawayPaymentConfig" JSONB,
    "monthlyAiBudgetUsd" DOUBLE PRECISION DEFAULT 50,
    "monthlyTwilioBudgetUsd" DOUBLE PRECISION DEFAULT 30,
    "hardBudgetLimit" BOOLEAN NOT NULL DEFAULT true,
    "maxEngineRunsPerMinute" INTEGER DEFAULT 60,
    "maxMessagesPerMinute" INTEGER DEFAULT 30,
    "aiDisabled" BOOLEAN NOT NULL DEFAULT false,
    "smsDisabled" BOOLEAN NOT NULL DEFAULT false,
    "voiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "bookingDisabled" BOOLEAN NOT NULL DEFAULT false,
    "takeawayDisabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyOrgCost" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "aiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "twilioCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stripeFeesUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiTokensInput" INTEGER NOT NULL DEFAULT 0,
    "aiTokensOutput" INTEGER NOT NULL DEFAULT 0,
    "smsCount" INTEGER NOT NULL DEFAULT 0,
    "voiceMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyOrgCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelEndpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "twilioPhoneNumber" TEXT NOT NULL,
    "friendlyName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "endpointId" TEXT,
    "channel" "MessagingChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "twilioMessageSid" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "endpointId" TEXT,
    "twilioCallSid" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'inbound',
    "status" TEXT,
    "blockedBy" TEXT,
    "denyReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orgId" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgOnboardingStep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "OnboardingStepStatus" NOT NULL DEFAULT 'todo',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgOnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "industryConfigId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryConfig" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rulesJson" JSONB NOT NULL DEFAULT '{}',
    "defaultTemplateSlug" TEXT,
    "defaultTemplateVersion" TEXT,
    "onboardingSteps" JSONB NOT NULL DEFAULT '[]',
    "modules" JSONB NOT NULL DEFAULT '{"sms": true, "whatsapp": true, "voice": false, "payment": true}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "intentsAllowed" JSONB NOT NULL DEFAULT '[]',
    "modulesDefault" JSONB NOT NULL DEFAULT '[]',
    "handoffTriggers" JSONB NOT NULL DEFAULT '[]',
    "settingsSchema" JSONB NOT NULL DEFAULT '{}',
    "definition" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "contactKey" TEXT NOT NULL,
    "externalThreadKey" TEXT,
    "status" "ConversationSessionStatus" NOT NULL DEFAULT 'active',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ConversationTurnRole" NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "text" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "sessionId" TEXT NOT NULL,
    "agentTemplateId" TEXT,
    "industryConfigId" TEXT,
    "modelUsed" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "decision" JSONB NOT NULL DEFAULT '{}',
    "status" "EngineRunStatus" NOT NULL DEFAULT 'success',
    "blockedBy" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgIntegration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'disconnected',
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "scope" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequestLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sessionId" TEXT,
    "action" "BookingAction" NOT NULL,
    "idempotencyKey" TEXT,
    "eventId" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "status" "BookingRequestStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sessionId" TEXT,
    "channel" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "pickupTime" TIMESTAMP(3),
    "pickupMode" TEXT,
    "notes" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "summaryText" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentRequired" BOOLEAN NOT NULL DEFAULT true,
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentAmountCents" INTEGER,
    "paymentCurrency" TEXT NOT NULL DEFAULT 'AUD',
    "paymentDueAt" TIMESTAMP(3),
    "paymentPaidAt" TIMESTAMP(3),
    "paymentReceiptEmail" TEXT,
    "paymentAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPaymentLink" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "url" TEXT NOT NULL,
    "status" "OrderPaymentLinkStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEventLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_orgId_key" ON "OrgSettings"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_stripeCustomerId_key" ON "OrgSettings"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_stripeSubscriptionId_key" ON "OrgSettings"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "MonthlyOrgCost_month_idx" ON "MonthlyOrgCost"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyOrgCost_orgId_month_key" ON "MonthlyOrgCost"("orgId", "month");

-- CreateIndex
CREATE INDEX "ChannelEndpoint_orgId_channel_idx" ON "ChannelEndpoint"("orgId", "channel");

-- CreateIndex
CREATE INDEX "ChannelEndpoint_twilioPhoneNumber_idx" ON "ChannelEndpoint"("twilioPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelEndpoint_channel_twilioPhoneNumber_key" ON "ChannelEndpoint"("channel", "twilioPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_twilioMessageSid_key" ON "MessageLog"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "MessageLog_orgId_idx" ON "MessageLog"("orgId");

-- CreateIndex
CREATE INDEX "MessageLog_channel_idx" ON "MessageLog"("channel");

-- CreateIndex
CREATE INDEX "MessageLog_direction_idx" ON "MessageLog"("direction");

-- CreateIndex
CREATE INDEX "MessageLog_twilioMessageSid_idx" ON "MessageLog"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_orgId_createdAt_idx" ON "MessageLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_orgId_direction_createdAt_idx" ON "MessageLog"("orgId", "direction", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_twilioCallSid_key" ON "CallLog"("twilioCallSid");

-- CreateIndex
CREATE INDEX "CallLog_orgId_idx" ON "CallLog"("orgId");

-- CreateIndex
CREATE INDEX "CallLog_twilioCallSid_idx" ON "CallLog"("twilioCallSid");

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

-- CreateIndex
CREATE INDEX "CallLog_startedAt_idx" ON "CallLog"("startedAt");

-- CreateIndex
CREATE INDEX "CallLog_createdAt_idx" ON "CallLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_idx" ON "AuditLog"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_stripeEventId_key" ON "StripeEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeEvent_stripeEventId_idx" ON "StripeEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeEvent_orgId_idx" ON "StripeEvent"("orgId");

-- CreateIndex
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");

-- CreateIndex
CREATE INDEX "StripeEvent_createdAt_idx" ON "StripeEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OrgOnboardingStep_orgId_idx" ON "OrgOnboardingStep"("orgId");

-- CreateIndex
CREATE INDEX "OrgOnboardingStep_stepKey_idx" ON "OrgOnboardingStep"("stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrgOnboardingStep_orgId_stepKey_key" ON "OrgOnboardingStep"("orgId", "stepKey");

-- CreateIndex
CREATE INDEX "Org_industry_idx" ON "Org"("industry");

-- CreateIndex
CREATE INDEX "Org_industryConfigId_idx" ON "Org"("industryConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryConfig_slug_key" ON "IndustryConfig"("slug");

-- CreateIndex
CREATE INDEX "IndustryConfig_slug_idx" ON "IndustryConfig"("slug");

-- CreateIndex
CREATE INDEX "AgentTemplate_slug_idx" ON "AgentTemplate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplate_slug_version_key" ON "AgentTemplate"("slug", "version");

-- CreateIndex
CREATE INDEX "AgentAssignment_orgId_idx" ON "AgentAssignment"("orgId");

-- CreateIndex
CREATE INDEX "AgentAssignment_templateId_idx" ON "AgentAssignment"("templateId");

-- CreateIndex
CREATE INDEX "AgentAssignment_status_idx" ON "AgentAssignment"("status");

-- CreateIndex
CREATE INDEX "ConversationSession_orgId_idx" ON "ConversationSession"("orgId");

-- CreateIndex
CREATE INDEX "ConversationSession_channel_idx" ON "ConversationSession"("channel");

-- CreateIndex
CREATE INDEX "ConversationSession_contactKey_idx" ON "ConversationSession"("contactKey");

-- CreateIndex
CREATE INDEX "ConversationSession_status_idx" ON "ConversationSession"("status");

-- CreateIndex
CREATE INDEX "ConversationSession_lastActiveAt_idx" ON "ConversationSession"("lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_orgId_channel_contactKey_key" ON "ConversationSession"("orgId", "channel", "contactKey");

-- CreateIndex
CREATE INDEX "ConversationTurn_sessionId_createdAt_idx" ON "ConversationTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationTurn_sessionId_idx" ON "ConversationTurn"("sessionId");

-- CreateIndex
CREATE INDEX "ConversationTurn_role_idx" ON "ConversationTurn"("role");

-- CreateIndex
CREATE INDEX "EngineRun_sessionId_createdAt_idx" ON "EngineRun"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "EngineRun_sessionId_idx" ON "EngineRun"("sessionId");

-- CreateIndex
CREATE INDEX "EngineRun_status_idx" ON "EngineRun"("status");

-- CreateIndex
CREATE INDEX "EngineRun_createdAt_idx" ON "EngineRun"("createdAt");

-- CreateIndex
CREATE INDEX "EngineRun_agentTemplateId_idx" ON "EngineRun"("agentTemplateId");

-- CreateIndex
CREATE INDEX "EngineRun_orgId_createdAt_idx" ON "EngineRun"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgIntegration_orgId_idx" ON "OrgIntegration"("orgId");

-- CreateIndex
CREATE INDEX "OrgIntegration_provider_idx" ON "OrgIntegration"("provider");

-- CreateIndex
CREATE INDEX "OrgIntegration_status_idx" ON "OrgIntegration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrgIntegration_orgId_provider_key" ON "OrgIntegration"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequestLog_idempotencyKey_key" ON "BookingRequestLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingRequestLog_orgId_idx" ON "BookingRequestLog"("orgId");

-- CreateIndex
CREATE INDEX "BookingRequestLog_sessionId_idx" ON "BookingRequestLog"("sessionId");

-- CreateIndex
CREATE INDEX "BookingRequestLog_action_idx" ON "BookingRequestLog"("action");

-- CreateIndex
CREATE INDEX "BookingRequestLog_status_idx" ON "BookingRequestLog"("status");

-- CreateIndex
CREATE INDEX "BookingRequestLog_createdAt_idx" ON "BookingRequestLog"("createdAt");

-- CreateIndex
CREATE INDEX "BookingRequestLog_idempotencyKey_idx" ON "BookingRequestLog"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_orgId_idx" ON "Order"("orgId");

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_idempotencyKey_idx" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_paymentDueAt_idx" ON "Order"("paymentDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPaymentLink_stripeCheckoutSessionId_key" ON "OrderPaymentLink"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPaymentLink_stripePaymentIntentId_key" ON "OrderPaymentLink"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "OrderPaymentLink_orderId_idx" ON "OrderPaymentLink"("orderId");

-- CreateIndex
CREATE INDEX "OrderPaymentLink_status_idx" ON "OrderPaymentLink"("status");

-- CreateIndex
CREATE INDEX "OrderPaymentLink_expiresAt_idx" ON "OrderPaymentLink"("expiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderEventLog_orderId_idx" ON "OrderEventLog"("orderId");

-- CreateIndex
CREATE INDEX "OrderEventLog_type_idx" ON "OrderEventLog"("type");

-- CreateIndex
CREATE INDEX "OrderEventLog_createdAt_idx" ON "OrderEventLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyOrgCost" ADD CONSTRAINT "MonthlyOrgCost_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrgSettings"("orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelEndpoint" ADD CONSTRAINT "ChannelEndpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrgSettings"("orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrgSettings"("orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ChannelEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "OrgSettings"("orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ChannelEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_industryConfigId_fkey" FOREIGN KEY ("industryConfigId") REFERENCES "IndustryConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineRun" ADD CONSTRAINT "EngineRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPaymentLink" ADD CONSTRAINT "OrderPaymentLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEventLog" ADD CONSTRAINT "OrderEventLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


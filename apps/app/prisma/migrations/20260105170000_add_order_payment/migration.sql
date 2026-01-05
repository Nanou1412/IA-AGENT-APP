-- Phase 7.3: Add order payment support

-- Add pending_payment to OrderEventType enum
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'payment_link_created';

-- Add customerEmail to Order model
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;

-- Add takeawayPaymentConfig to OrgSettings
ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "takeawayPaymentConfig" JSONB;

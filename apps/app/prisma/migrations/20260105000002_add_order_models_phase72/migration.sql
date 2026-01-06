-- Phase 7.2: Takeaway Order Models
-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending_confirmation', 'confirmed', 'expired', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "OrderPickupMode" AS ENUM ('asap', 'scheduled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "OrderEventType" AS ENUM ('draft_created', 'draft_updated', 'confirmation_requested', 'confirmed', 'expired', 'canceled', 'handoff_triggered', 'notification_sent', 'notification_failed', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sessionId" TEXT,
    "channel" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "pickupTime" TIMESTAMP(3),
    "pickupMode" "OrderPickupMode",
    "notes" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "summaryText" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "OrderEventLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEventLog_pkey" PRIMARY KEY ("id")
);

-- Add takeawayConfig to OrgSettings (idempotent)
DO $$ BEGIN
    ALTER TABLE "OrgSettings" ADD COLUMN "takeawayConfig" JSONB;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Order_orgId_idx" ON "Order"("orgId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Order_sessionId_idx" ON "Order"("sessionId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "OrderEventLog_orderId_idx" ON "OrderEventLog"("orderId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "OrderEventLog_type_idx" ON "OrderEventLog"("type");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "OrderEventLog_createdAt_idx" ON "OrderEventLog"("createdAt");

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "OrderEventLog" ADD CONSTRAINT "OrderEventLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

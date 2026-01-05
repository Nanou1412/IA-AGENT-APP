-- Phase 7.2: Takeaway Order Models
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending_confirmation', 'confirmed', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "OrderPickupMode" AS ENUM ('asap', 'scheduled');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('draft_created', 'draft_updated', 'confirmation_requested', 'confirmed', 'expired', 'canceled', 'handoff_triggered', 'notification_sent', 'notification_failed', 'error');

-- CreateTable
CREATE TABLE "Order" (
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

-- Add takeawayConfig to OrgSettings
ALTER TABLE "OrgSettings" ADD COLUMN "takeawayConfig" JSONB;

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
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderEventLog_orderId_idx" ON "OrderEventLog"("orderId");

-- CreateIndex
CREATE INDEX "OrderEventLog_type_idx" ON "OrderEventLog"("type");

-- CreateIndex
CREATE INDEX "OrderEventLog_createdAt_idx" ON "OrderEventLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEventLog" ADD CONSTRAINT "OrderEventLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

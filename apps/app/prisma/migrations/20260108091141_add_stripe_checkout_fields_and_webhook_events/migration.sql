/*
  Warnings:

  - A unique constraint covering the columns `[stripeCheckoutSessionId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "amountTotalCents" INTEGER,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_createdAt_idx" ON "StripeWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");

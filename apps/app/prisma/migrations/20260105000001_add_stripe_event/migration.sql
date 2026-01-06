-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "StripeEvent" (
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

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "StripeEvent_stripeEventId_key" ON "StripeEvent"("stripeEventId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "StripeEvent_stripeEventId_idx" ON "StripeEvent"("stripeEventId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "StripeEvent_orgId_idx" ON "StripeEvent"("orgId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "StripeEvent_type_idx" ON "StripeEvent"("type");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "StripeEvent_createdAt_idx" ON "StripeEvent"("createdAt");

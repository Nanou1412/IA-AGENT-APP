-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "BillingStatus" AS ENUM ('inactive', 'incomplete', 'active', 'past_due', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable (idempotent)
DO $$ BEGIN
    ALTER TABLE "OrgSettings" ADD COLUMN "billingStatus" "BillingStatus" NOT NULL DEFAULT 'inactive';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "OrgSettings" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "OrgSettings" ADD COLUMN "setupFeePaidAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "OrgSettings" ADD COLUMN "stripeCustomerId" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "OrgSettings" ADD COLUMN "stripeSubscriptionId" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "OrgSettings_stripeCustomerId_key" ON "OrgSettings"("stripeCustomerId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "OrgSettings_stripeSubscriptionId_key" ON "OrgSettings"("stripeSubscriptionId");

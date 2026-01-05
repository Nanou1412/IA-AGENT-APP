-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('inactive', 'incomplete', 'active', 'past_due', 'canceled');

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "billingStatus" "BillingStatus" NOT NULL DEFAULT 'inactive',
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "setupFeePaidAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_stripeCustomerId_key" ON "OrgSettings"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_stripeSubscriptionId_key" ON "OrgSettings"("stripeSubscriptionId");

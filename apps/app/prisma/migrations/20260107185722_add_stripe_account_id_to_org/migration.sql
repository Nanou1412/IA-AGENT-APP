/*
  Warnings:

  - A unique constraint covering the columns `[stripeAccountId]` on the table `Org` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "stripeAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Org_stripeAccountId_key" ON "Org"("stripeAccountId");

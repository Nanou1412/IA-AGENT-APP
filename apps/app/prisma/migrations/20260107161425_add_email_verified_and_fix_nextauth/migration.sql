-- AlterTable (idempotent)
DO $$ BEGIN
    ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "User" ADD COLUMN "image" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

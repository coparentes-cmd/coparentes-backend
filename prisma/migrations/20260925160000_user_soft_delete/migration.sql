-- Soft-delete marker for account anonymization (rows retained for FK history).
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

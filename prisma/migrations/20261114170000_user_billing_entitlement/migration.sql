-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('none', 'trialing', 'active', 'expired', 'canceled');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "billingStatus" "BillingStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "User" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "billingSource" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeSubscriptionId" TEXT;

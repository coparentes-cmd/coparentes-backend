-- CreateEnum
CREATE TYPE "CustodySchedulePattern" AS ENUM ('weekAlternating', 'everyOtherWeekend', 'customWeek');
CREATE TYPE "CustodyScheduleStatus" AS ENUM ('draft', 'pendingApproval', 'active', 'superseded');
CREATE TYPE "CustodySlotSource" AS ENUM ('schedule', 'exception', 'manual', 'swap');
CREATE TYPE "CustodyExceptionType" AS ENUM ('singleDay', 'range', 'holiday');
CREATE TYPE "CustodyExceptionStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "CustodySlot" ADD COLUMN IF NOT EXISTS "source" "CustodySlotSource" NOT NULL DEFAULT 'schedule';
ALTER TABLE "CustodySlot" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;
ALTER TABLE "CustodySlot" ADD COLUMN IF NOT EXISTS "exceptionId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustodySchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patternType" "CustodySchedulePattern" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "weekAJson" TEXT NOT NULL,
    "weekBJson" TEXT NOT NULL,
    "handoverTime" TEXT,
    "handoverLocation" TEXT,
    "status" "CustodyScheduleStatus" NOT NULL DEFAULT 'pendingApproval',
    "proposedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustodySchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustodyException" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "custodian" "UserRole" NOT NULL,
    "exceptionType" "CustodyExceptionType" NOT NULL DEFAULT 'singleDay',
    "reason" TEXT,
    "status" "CustodyExceptionStatus" NOT NULL DEFAULT 'pending',
    "requesterId" TEXT NOT NULL,
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustodyException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustodySchedule_workspaceId_idx" ON "CustodySchedule"("workspaceId");
CREATE INDEX IF NOT EXISTS "CustodySchedule_status_idx" ON "CustodySchedule"("status");
CREATE INDEX IF NOT EXISTS "CustodyException_workspaceId_idx" ON "CustodyException"("workspaceId");
CREATE INDEX IF NOT EXISTS "CustodyException_status_idx" ON "CustodyException"("status");
CREATE INDEX IF NOT EXISTS "CustodyException_fromDate_idx" ON "CustodyException"("fromDate");
CREATE INDEX IF NOT EXISTS "CustodySlot_scheduleId_idx" ON "CustodySlot"("scheduleId");

ALTER TABLE "CustodySlot" DROP CONSTRAINT IF EXISTS "CustodySlot_scheduleId_fkey";
ALTER TABLE "CustodySlot" ADD CONSTRAINT "CustodySlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CustodySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustodySchedule" DROP CONSTRAINT IF EXISTS "CustodySchedule_workspaceId_fkey";
ALTER TABLE "CustodySchedule" ADD CONSTRAINT "CustodySchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustodySchedule" DROP CONSTRAINT IF EXISTS "CustodySchedule_proposedById_fkey";
ALTER TABLE "CustodySchedule" ADD CONSTRAINT "CustodySchedule_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustodyException" DROP CONSTRAINT IF EXISTS "CustodyException_workspaceId_fkey";
ALTER TABLE "CustodyException" ADD CONSTRAINT "CustodyException_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustodyException" DROP CONSTRAINT IF EXISTS "CustodyException_requesterId_fkey";
ALTER TABLE "CustodyException" ADD CONSTRAINT "CustodyException_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DELETE FROM "CustodySlot" a
USING "CustodySlot" b
WHERE a."workspaceId" = b."workspaceId"
  AND date_trunc('day', a."date" AT TIME ZONE 'UTC') = date_trunc('day', b."date" AT TIME ZONE 'UTC')
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "CustodySlot_workspaceId_date_key" ON "CustodySlot"("workspaceId", "date");

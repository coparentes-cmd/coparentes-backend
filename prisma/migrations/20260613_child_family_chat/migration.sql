-- CreateEnum
CREATE TYPE "ThreadAudience" AS ENUM ('parents', 'family');

-- AlterTable Workspace: child invite code
ALTER TABLE "Workspace" ADD COLUMN "childInviteCode" TEXT;

UPDATE "Workspace"
SET "childInviteCode" = UPPER(SUBSTRING(REPLACE("id", '-', ''), 1, 12))
WHERE "childInviteCode" IS NULL;

ALTER TABLE "Workspace" ALTER COLUMN "childInviteCode" SET NOT NULL;

CREATE UNIQUE INDEX "Workspace_childInviteCode_key" ON "Workspace"("childInviteCode");
CREATE INDEX "Workspace_childInviteCode_idx" ON "Workspace"("childInviteCode");

-- AlterTable User: link child account to Child profile
ALTER TABLE "User" ADD COLUMN "childProfileId" TEXT;

CREATE UNIQUE INDEX "User_childProfileId_key" ON "User"("childProfileId");

ALTER TABLE "User"
ADD CONSTRAINT "User_childProfileId_fkey"
FOREIGN KEY ("childProfileId") REFERENCES "Child"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Thread: audience for parent-only vs family chat
ALTER TABLE "Thread" ADD COLUMN "audience" "ThreadAudience" NOT NULL DEFAULT 'parents';

CREATE INDEX "Thread_audience_idx" ON "Thread"("audience");

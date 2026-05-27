-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Workspace.updatedAt
ALTER TABLE "Workspace" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Child.createdAt
ALTER TABLE "Child" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ExportJob: status enum + thread FK
ALTER TABLE "ExportJob" ADD COLUMN "status_new" "ExportStatus";

UPDATE "ExportJob" SET "status_new" = CASE
  WHEN "status" = 'completed' THEN 'completed'::"ExportStatus"
  WHEN "status" = 'pending' THEN 'pending'::"ExportStatus"
  WHEN "status" = 'processing' THEN 'processing'::"ExportStatus"
  WHEN "status" = 'failed' THEN 'failed'::"ExportStatus"
  ELSE 'completed'::"ExportStatus"
END;

ALTER TABLE "ExportJob" DROP COLUMN "status";
ALTER TABLE "ExportJob" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "ExportJob" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "ExportJob" ALTER COLUMN "status" SET DEFAULT 'completed';

CREATE INDEX "ExportJob_threadId_idx" ON "ExportJob"("threadId");
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Message_sentAt_idx" ON "Message"("sentAt");

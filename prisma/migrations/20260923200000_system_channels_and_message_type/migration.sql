-- System schedule channel (no E2E ThreadKeys) + message type for serialization

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN "isSystemChannel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'user';

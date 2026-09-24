-- E2E chat encryption: User.publicKey + ThreadKey (non-breaking; Message.content unchanged)

-- AlterTable
ALTER TABLE "User" ADD COLUMN "publicKey" TEXT;

-- CreateTable
CREATE TABLE "ThreadKey" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadKey_threadId_idx" ON "ThreadKey"("threadId");

-- CreateIndex
CREATE INDEX "ThreadKey_userId_idx" ON "ThreadKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadKey_threadId_userId_key" ON "ThreadKey"("threadId", "userId");

-- AddForeignKey
ALTER TABLE "ThreadKey" ADD CONSTRAINT "ThreadKey_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadKey" ADD CONSTRAINT "ThreadKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MessageUserTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageUserTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageUserTag_userId_messageId_tag_key" ON "MessageUserTag"("userId", "messageId", "tag");

-- CreateIndex
CREATE INDEX "MessageUserTag_userId_workspaceId_tag_idx" ON "MessageUserTag"("userId", "workspaceId", "tag");

-- CreateIndex
CREATE INDEX "MessageUserTag_userId_threadId_idx" ON "MessageUserTag"("userId", "threadId");

-- AddForeignKey
ALTER TABLE "MessageUserTag" ADD CONSTRAINT "MessageUserTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageUserTag" ADD CONSTRAINT "MessageUserTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageUserTag" ADD CONSTRAINT "MessageUserTag_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

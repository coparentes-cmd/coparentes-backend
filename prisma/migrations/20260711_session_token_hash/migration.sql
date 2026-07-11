-- Store hashed session tokens only; invalidate all existing sessions.
DELETE FROM "Session";

ALTER TABLE "Session" DROP CONSTRAINT "Session_pkey";
ALTER TABLE "Session" ADD COLUMN "id" TEXT NOT NULL;
ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT NOT NULL;
ALTER TABLE "Session" DROP COLUMN "token";
ALTER TABLE "Session" ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

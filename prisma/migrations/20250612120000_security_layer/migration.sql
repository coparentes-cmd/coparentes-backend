-- Security layer: OTP challenges, trusted devices, EmailInvite.workspaceId

CREATE TABLE "LoginOtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailInvite" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

UPDATE "EmailInvite" ei
SET "workspaceId" = u."workspaceId"
FROM "User" u
WHERE ei."inviterId" = u.id
  AND ei."workspaceId" IS NULL
  AND u."workspaceId" IS NOT NULL;

ALTER TABLE "EmailInvite" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "LoginOtpChallenge_userId_used_expiresAt_idx"
  ON "LoginOtpChallenge"("userId", "used", "expiresAt");

CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");
CREATE INDEX "EmailInvite_workspaceId_idx" ON "EmailInvite"("workspaceId");

ALTER TABLE "LoginOtpChallenge"
  ADD CONSTRAINT "LoginOtpChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrustedDevice"
  ADD CONSTRAINT "TrustedDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailInvite"
  ADD CONSTRAINT "EmailInvite_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

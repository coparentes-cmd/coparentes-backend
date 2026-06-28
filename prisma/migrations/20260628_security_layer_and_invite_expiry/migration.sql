-- Security layer + 24h parent invite expiry (idempotent for production redeploy)

CREATE TABLE IF NOT EXISTS "LoginOtpChallenge" (
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

CREATE TABLE IF NOT EXISTS "TrustedDevice" (
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

DELETE FROM "EmailInvite" WHERE "workspaceId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'EmailInvite'
      AND column_name = 'workspaceId'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "EmailInvite" ALTER COLUMN "workspaceId" SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LoginOtpChallenge_userId_used_expiresAt_idx"
  ON "LoginOtpChallenge"("userId", "used", "expiresAt");

CREATE INDEX IF NOT EXISTS "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
CREATE INDEX IF NOT EXISTS "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailInvite_workspaceId_idx" ON "EmailInvite"("workspaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoginOtpChallenge_userId_fkey'
  ) THEN
    ALTER TABLE "LoginOtpChallenge"
      ADD CONSTRAINT "LoginOtpChallenge_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TrustedDevice_userId_fkey'
  ) THEN
    ALTER TABLE "TrustedDevice"
      ADD CONSTRAINT "TrustedDevice_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailInvite_workspaceId_fkey'
  ) THEN
    ALTER TABLE "EmailInvite"
      ADD CONSTRAINT "EmailInvite_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "inviteCodeExpiresAt" TIMESTAMP(3);

UPDATE "Workspace"
SET "inviteCodeExpiresAt" = NOW() + INTERVAL '24 hours'
WHERE "inviteCodeExpiresAt" IS NULL;

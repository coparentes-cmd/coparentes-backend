-- Parent invite code expires after 24 hours (idempotent)

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "inviteCodeExpiresAt" TIMESTAMP(3);

UPDATE "Workspace"
SET "inviteCodeExpiresAt" = NOW() + INTERVAL '24 hours'
WHERE "inviteCodeExpiresAt" IS NULL;

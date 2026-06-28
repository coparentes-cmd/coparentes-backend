-- Parent invite code valid for 24 hours (see PARENT_INVITE_TTL_HOURS)

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "inviteCodeExpiresAt" TIMESTAMP(3);

UPDATE "Workspace"
SET "inviteCodeExpiresAt" = NOW() + INTERVAL '24 hours'
WHERE "inviteCodeExpiresAt" IS NULL;

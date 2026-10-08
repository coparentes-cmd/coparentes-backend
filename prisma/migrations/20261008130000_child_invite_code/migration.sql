-- Per-child invite code (unique). Backfill existing rows, then enforce NOT NULL.
ALTER TABLE "Child" ADD COLUMN "inviteCode" TEXT;

-- Assign unique codes (base64url-ish uppercase), avoid colliding with workspace codes.
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  attempts INT;
BEGIN
  FOR r IN SELECT id FROM "Child" LOOP
    attempts := 0;
    LOOP
      candidate := UPPER(encode(gen_random_bytes(12), 'base64'));
      -- strip URL-unsafe chars that encode() may produce
      candidate := REPLACE(REPLACE(candidate, '+', 'A'), '/', 'B');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Child" WHERE "inviteCode" = candidate AND id <> r.id)
        AND NOT EXISTS (SELECT 1 FROM "Workspace" WHERE "inviteCode" = candidate OR "childInviteCode" = candidate);
      attempts := attempts + 1;
      EXIT WHEN attempts >= 20;
    END LOOP;
    UPDATE "Child" SET "inviteCode" = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "Child" ALTER COLUMN "inviteCode" SET NOT NULL;

CREATE UNIQUE INDEX "Child_inviteCode_key" ON "Child"("inviteCode");
CREATE INDEX "Child_inviteCode_idx" ON "Child"("inviteCode");

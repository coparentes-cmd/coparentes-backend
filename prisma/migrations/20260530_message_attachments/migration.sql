-- Message attachments stored as JSON metadata + base64 payload (MVP)

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "attachmentsJson" TEXT;

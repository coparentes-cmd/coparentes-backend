-- ExportJob: TTL expiry for download payloads
ALTER TABLE "ExportJob" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "ExportJob_expiresAt_idx" ON "ExportJob"("expiresAt");

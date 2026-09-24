-- E2E multi-device: opaque private-key envelope (client-defined blob; server never interprets)

-- AlterTable
ALTER TABLE "User" ADD COLUMN "privateKeyEnvelope" TEXT;

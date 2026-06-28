#!/usr/bin/env bash
set -euo pipefail

echo "[coparentes] prisma migrate deploy..."
npx prisma migrate deploy

echo "[coparentes] starting API on port ${PORT:-3000}..."
exec node src/index.js

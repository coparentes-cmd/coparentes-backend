#!/usr/bin/env bash
# Create four remediation commits (Tier 1–4) for coparentes-backend.
# Each file is staged in exactly one tier. Run: bash scripts/commit-remediation-tiers.sh

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is not installed. Install Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

if [[ ! -d .git ]]; then
  git init
fi

commit_tier() {
  local tier="$1"
  shift
  if [[ "$#" -eq 0 ]]; then
    return 0
  fi
  local staged=0
  for f in "$@"; do
    if [[ -e "$f" ]]; then
      git add "$f"
      staged=1
    fi
  done
  if [[ "$staged" -eq 0 ]]; then
    echo "Tier ${tier}: no files found, skipping."
    return 0
  fi
  if git diff --cached --quiet; then
    echo "Tier ${tier}: nothing new to commit."
    return 0
  fi
  case "$tier" in
    1) git commit -m "$(cat <<'EOF'
fix(tier-1): critical backend security and validation

Invite email verification, stronger invite codes, seed gating, server-side
join roles, workspace FK validation, swap authorization, and session
revocation on password change.
EOF
)" ;;
    2) git commit -m "$(cat <<'EOF'
fix(tier-2): exports TTL, invite delivery, and E2E test fixes

Export expiration migration, HTML-safe emails, invite rate limits, emailSent
flag, UUID export IDs, path-based accept URLs, and E2E skip handling.
EOF
)" ;;
    3) git commit -m "$(cat <<'EOF'
fix(tier-3): validation consistency and documentation

Document upload size limits, session caps, login validation responses,
per-request user refresh, and repair plan updates.
EOF
)" ;;
    4) git commit -m "$(cat <<'EOF'
feat(tier-4): RBAC, security tests, and operational hardening

Parent-role middleware on write routes, security regression tests, background
session/export purge, HMAC manifests, and CORS documentation.
EOF
)" ;;
  esac
  echo "Tier ${tier}: committed."
}

# Tier 1 — FIX-001–007
commit_tier 1 \
  src/routes/invite.js \
  src/utils/security.js \
  src/lib/seed.js \
  scripts/seed-test-user.js \
  src/utils/env.js \
  src/index.js \
  package.json \
  .env.example \
  src/routes/auth.js \
  src/services/session.js \
  src/services/threads.js \
  src/services/calendar.js \
  src/services/finances.js \
  src/routes/threads.js \
  src/routes/calendar.js \
  src/routes/finances.js

# Tier 2 — FIX-011–017, FIX-018–021 (backend)
commit_tier 2 \
  tests/e2e-flow.test.js \
  src/utils/mailer.js \
  src/services/exports.js \
  src/routes/exports.js \
  prisma/schema.prisma \
  prisma/migrations/20260527_export_expires

# Tier 3 — FIX-022–038 (backend)
commit_tier 3 \
  src/routes/documents.js \
  src/middleware/auth.js \
  REPAIR_PLAN.md

# Tier 4 — FIX-039–047
commit_tier 4 \
  src/middleware/rbac.js \
  src/middleware/cors.js \
  tests/security.test.js \
  tests/flutter-api.test.js \
  README.md

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted files remain:"
  git status --short
  echo "Review and commit manually if needed."
fi

echo ""
git log --oneline -5 2>/dev/null || true

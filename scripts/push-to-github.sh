#!/usr/bin/env bash
# Push coparentes-backend to GitHub (run from Terminal.app on your Mac).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1 || ! git --version >/dev/null 2>&1; then
  echo "Install Xcode Command Line Tools first: xcode-select --install"
  exit 1
fi

if [[ ! -d .git ]]; then
  git init
  git branch -M main
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Set your GitHub repo URL, e.g.:"
  echo "  git remote add origin https://github.com/coparentes-cmd/coparentes-backend.git"
  exit 1
fi

git add -A
git status -sb

if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$(cat <<'EOF'
Add workspace children API and complete export payloads.

POST /api/workspace/children for parentA onboarding. Calendar, finances,
and fullPack exports now include dated items in payload.items.
EOF
)"
fi

git push -u origin main

echo "Push complete — Railway should redeploy automatically."

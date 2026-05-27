#!/usr/bin/env bash
# Push both Coparentes repos using dugite git + optional GITHUB_TOKEN.
set -euo pipefail

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Set a GitHub PAT first, e.g.:"
  echo "  export GITHUB_TOKEN=ghp_xxxxxxxx"
  echo "Or run: gh auth login"
  exit 1
fi

export PATH="/tmp/dugite-native/bin:${PATH:-}"
export GIT_EXEC_PATH=/tmp/dugite-native/libexec/git-core
export GIT_TERMINAL_PROMPT=0

askpass="$(mktemp)"
cat >"$askpass" <<EOF
#!/usr/bin/env bash
case "\$1" in
  *[Uu][Ss][Ee][Rr][Nn][Aa][Mm][Ee]*) echo "x-access-token" ;;
  *) echo "$GITHUB_TOKEN" ;;
esac
EOF
chmod +x "$askpass"
export GIT_ASKPASS="$askpass"
trap 'rm -f "$askpass"' EXIT

push_repo() {
  local git_dir="$1"
  local work_tree="$2"
  local remote="$3"
  local label="$4"

  export GIT_DIR="$git_dir"
  export GIT_WORK_TREE="$work_tree"

  git remote remove origin 2>/dev/null || true
  git remote add origin "$remote"
  git fetch origin
  git branch -M main
  git push -u origin main
  echo "$label pushed to $remote (commit $(git rev-parse --short HEAD))"
}

push_repo \
  /tmp/coparentes-backend-main.git \
  "$HOME/Desktop/coparentes-backend-main" \
  "https://github.com/coparentes-cmd/coparentes-backend.git" \
  "Backend"

push_repo \
  /tmp/coparentes-frontend-main.git \
  "$HOME/Desktop/Coparentes-App-vol-2-main" \
  "https://github.com/coparentes-cmd/Coparentes-App-vol-2.git" \
  "Frontend"

echo "Done — Railway and Netlify should redeploy automatically."

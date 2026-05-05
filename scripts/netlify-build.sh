#!/usr/bin/env bash
set -euo pipefail

if [ -z "${COPARENTES_API_BASE_URL:-}" ]; then
  echo "ERROR: Missing COPARENTES_API_BASE_URL environment variable."
  echo "Set it in Netlify Site configuration -> Environment variables."
  exit 1
fi

case "$COPARENTES_API_BASE_URL" in
  https://*) ;;
  *)
    echo "ERROR: COPARENTES_API_BASE_URL must use HTTPS in production."
    echo "Current value: $COPARENTES_API_BASE_URL"
    exit 1
    ;;
esac

export FLUTTER_HOME="$HOME/flutter-sdk"
export PATH="$FLUTTER_HOME/bin:$PATH"

if ! command -v flutter >/dev/null 2>&1; then
  echo "Installing Flutter SDK (stable)..."
  git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$FLUTTER_HOME"
fi

flutter --version
flutter config --enable-web
flutter pub get

flutter build web \
  --release \
  --dart-define=COPARENTES_API_BASE_URL="$COPARENTES_API_BASE_URL"

if [ ! -f build/web/index.html ]; then
  echo "ERROR: Flutter web build failed - build/web/index.html not found."
  exit 1
fi

echo "Flutter web build completed successfully."

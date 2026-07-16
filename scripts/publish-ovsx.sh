#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$HOME/.ovsx-env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.ovsx-env"
fi
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi

if [[ -z "${OPEN_VSX_TOKEN:-}" ]]; then
  echo "OPEN_VSX_TOKEN がありません。"
  echo "1) https://open-vsx.org に GitHub でログイン"
  echo "2) Eclipse 連携 + Publisher Agreement に同意"
  echo "3) https://open-vsx.org/user-settings/tokens でトークン作成"
  echo "4) ~/.ovsx-env または .env に OPEN_VSX_TOKEN=... を書く"
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
VSIX="$ROOT/build/cursor-usage-${VERSION}.vsix"
PUBLISHER="$(node -p "require('./package.json').publisher")"
NAME="$(node -p "require('./package.json').name")"
REPO_RAW="https://github.com/tomippe/cursor-usage/raw/main"

if [[ ! -f "$VSIX" ]]; then
  echo "Building $VSIX ..."
  if [[ ! -d node_modules/esbuild ]]; then
    if command -v bun >/dev/null 2>&1; then
      bun install
    else
      npm install
    fi
  fi
  node esbuild.config.mjs --production
  mkdir -p build
  npx --yes @vscode/vsce package --out "$VSIX" \
    --baseContentUrl "$REPO_RAW" \
    --baseImagesUrl "$REPO_RAW"
fi

echo "Ensuring namespace: $PUBLISHER"
npx --yes ovsx create-namespace "$PUBLISHER" -p "$OPEN_VSX_TOKEN" || true

echo "Publishing $VSIX ..."
npx --yes ovsx publish "$VSIX" -p "$OPEN_VSX_TOKEN"
echo "Done: https://open-vsx.org/extension/${PUBLISHER}/${NAME}"

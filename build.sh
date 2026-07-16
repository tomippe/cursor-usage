#!/bin/bash
set -euo pipefail

# ===== Cursor Usage ビルドスクリプト (VS Code / Cursor 拡張 · Open VSX) =====

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="cursor-usage"
DIST_DIR="../apps.tomippe.jp/${APP_NAME}"
OPEN_VSX_URL="https://open-vsx.org/extension/tomippe/cursor-usage"

# 共通スクリプト
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../build-common/version.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../build-common/ftp-upload.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../build-common/git-commit.sh"

# ===== オプション解析 =====
COMMIT_MSG=""
NO_VERUP=false
NO_UPLOAD=false
while [ $# -gt 0 ]; do
    case "$1" in
        -cm) shift; COMMIT_MSG="$1" ;;
        -noverup) NO_VERUP=true ;;
        -noupload) NO_UPLOAD=true ;;
    esac
    shift || true
done

if [[ -f "$HOME/.ovsx-env" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.ovsx-env"
fi
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    # shellcheck source=/dev/null
    source "$SCRIPT_DIR/.env"
fi

VERSION=$(version_read)
VSIX="$SCRIPT_DIR/build/${APP_NAME}-${VERSION}.vsix"

echo "🔧 ${APP_NAME} v${VERSION} をビルド中..."

# package.json の version を同期
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = process.argv[1];
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
" "$VERSION"
echo "  ✓ package.json を v${VERSION} に更新しました"

# 依存関係（初回・欠落時）
if [[ ! -d node_modules/esbuild ]]; then
    if command -v bun >/dev/null 2>&1; then
        bun install
    else
        npm install
    fi
fi

# VSIX 作成
rm -rf build
mkdir -p build
npm run package
if [[ ! -f "$VSIX" ]]; then
    echo "❌ VSIX がありません: $VSIX"
    exit 1
fi
echo "  ✓ VSIX: $VSIX"

# Open VSX アップロード
if $NO_UPLOAD; then
    echo ""
    echo "⏭  Open VSX アップロードをスキップ（-noupload）"
else
    echo ""
    echo "☁️  Open VSX にアップロード中..."
    "$SCRIPT_DIR/scripts/publish-ovsx.sh"
fi

# 紹介ページ用 manifest.json
mkdir -p "$DIST_DIR"
MANIFEST_JSON=$(cat <<EOF
{
  "name": "Cursor Usage by tomippe",
  "version": "${VERSION}",
  "vsx_version": "${VERSION}",
  "open_vsx_url": "${OPEN_VSX_URL}"
}
EOF
)
printf '%s\n' "$MANIFEST_JSON" > "$DIST_DIR/manifest.json"
echo "  ✓ manifest.json → ${DIST_DIR}/manifest.json"

echo ""
echo "📤 manifest.json を FTP アップロード中..."
ftp_upload_file "$DIST_DIR/manifest.json" "${APP_NAME}/manifest.json" || {
    echo "  ⚠️  FTP アップロードに失敗しました（ローカル manifest は更新済み）"
}

# WordPress 履歴（app-versions）
echo ""
echo "📝 紹介ページの履歴（app-versions）を更新中..."
WP_ARGS=(
    --project-root "$SCRIPT_DIR"
    --version "$VERSION"
    --commit-msg "$COMMIT_MSG"
)
if [[ ! -f "$SCRIPT_DIR/.env" ]] || ! grep -q '^WP_APP_POST_ID=' "$SCRIPT_DIR/.env" 2>/dev/null; then
    WP_ARGS+=(--skip-if-missing)
fi
python3 "$SCRIPT_DIR/scripts/wp-append-app-version.py" "${WP_ARGS[@]}"

# 次回用バージョン
if ! $NO_VERUP; then
    echo ""
    echo "📝 次回用バージョンを更新しています..."
    version_save_next "$VERSION"
fi

# Git コミット
git_commit_build "$VERSION" "$COMMIT_MSG"

echo ""
echo "✅ ${APP_NAME} v${VERSION} 完了"
echo "   Open VSX: ${OPEN_VSX_URL}"
echo "   manifest: https://apps.tomippe.jp/${APP_NAME}/manifest.json"

# Cursor Usage by tomippe 紹介ページ設定

## キャッチフレーズ（app-cp）

Cursor のプラン使用量をステータスバーで
Ultra / Pro の消化率とオンデマンドをひと目で

## Open VSX

- **app-weburl**: https://open-vsx.org/extension/tomippe/cursor-usage
- **app-webdesc**: `Open VSX<br>日本語,English,中文`
- **platform**: `["web"]`（`app-weburl` が open-vsx.org のとき一覧ラベルは **VSX**）
- **配布**: `./build.sh`（VSIX → Open VSX → manifest → 履歴）

## アイコン・スクリーンショット

- **app-icon**: 2401
- **app-ss01**: 2407
- **app-ss01width**: 880
- **app-ss01radius**: true（角丸 12px）

## KV背景・キー色

- **app-kvbg**: 2405
- **app-keycolor**: `#97cc64`（icon の黄緑）
- **app-kvbgaddcss**:
  ```
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  background-blend-mode: multiply;
  ```
- **ブレンドモード**: multiply（キー色 `#97cc64` を KV に乗算）

## 実施済み

- WordPress 紹介ページ作成（ID: 2402、スラッグ: cursor-usage）
- `.env` 設定（WP_APP_POST_ID, WP_APP_PAGE_URL）
- ビルド環境（`build.sh` / `build.mdc`）
- Open VSX URL を app-weburl に設定（テーマが VSX 表示）
- スクリーンショット・KV・キー色（黄緑 multiply）設定済み

**Language / 言語 / 语言:** [English](#changelog-en) · [日本語](#changelog-ja) · [中文](#changelog-zh)

Cursor Usage by tomippe — fork of [wrick17/cursor-metrics](https://github.com/wrick17/cursor-metrics).

---

<a id="changelog-en"></a>

## English

### [1.0.4] - 2026-07-16

#### Changed
- Loading status bar label now shows “Cursor Usage” (localized)

### [1.0.3] - 2026-07-16

#### Added
- Japanese, English, and Simplified Chinese UI (status bar, tooltip, dashboard, settings)
- README with in-page language sections

#### Changed
- Japanese labels: included plan usage / first-party models / on-demand / included
- Half-width “リクエスト” only in the tooltip table header to avoid wrapping

### [1.0.2] - 2026-07-16

#### Fixed
- Spend-based plans (e.g. Ultra) no longer show `0/0 Included-Request` on the dashboard summary cards

#### Changed
- Open VSX republish uses `--skip-duplicate`

### [1.0.1] - 2026-07-16

#### Changed
- Status bar tooltip overview laid out as a 2×2 grid

#### Added
- Open VSX build pipeline and apps.tomippe.jp listing integration

### [1.0.0] - 2026-07-16

#### Added
- First tomippe fork release on Open VSX / listing page
- Status bar, tooltip, and dashboard from upstream

---

<a id="changelog-ja"></a>

## 日本語

### [1.0.4] - 2026-07-16

#### Changed
- 読み込み中のステータスバー表示を「Cursor使用量」に変更

### [1.0.3] - 2026-07-16

#### Added
- 日本語・英語・簡体中国語の多言語対応（ステータスバー、ツールチップ、ダッシュボード、設定項目）
- README に日中英の説明を同一ファイル内のアンカーで掲載

#### Changed
- 日本語の用語を整理（定額分 / 純正モデル / 追加従量分 / 定額内）
- ツールチップ表ヘッダの「リクエスト」のみ半角にして改行を防止

### [1.0.2] - 2026-07-16

#### Fixed
- Spend プラン（Ultra 等）のダッシュボード概要カードが `0/0 Included-Request` にならないよう、プラン種別に応じて分岐

#### Changed
- Open VSX 再公開時に `--skip-duplicate` を付与

### [1.0.1] - 2026-07-16

#### Changed
- ステータスバーツールチップの概要を縦並びから 2×2 グリッド配置に変更

#### Added
- Open VSX 向けビルド・紹介ページ連携（`build.sh` / manifest / バージョン履歴）

### [1.0.0] - 2026-07-16

#### Added
- tomippe フォークとして Open VSX / 紹介ページ向けに公開開始
- 元プロジェクトの機能を引き継ぎ（ステータスバー、ツールチップ、ダッシュボード）

---

<a id="changelog-zh"></a>

## 中文

### [1.0.4] - 2026-07-16

#### Changed
- 加载中的状态栏文案改为「Cursor使用量」（按界面语言本地化）

### [1.0.3] - 2026-07-16

#### Added
- 日语、英语、简体中文界面（状态栏、工具提示、仪表盘、设置项）
- README 在同一文件内用锚点切换三种语言说明

#### Changed
- 日语术语：定额用量 / 原厂模型 / 按需追加 / 定额内
- 仅在工具提示表头使用半角「リクエスト」，避免换行

### [1.0.2] - 2026-07-16

#### Fixed
- 按支出计费的套餐（如 Ultra）仪表盘摘要卡不再显示 `0/0 Included-Request`

#### Changed
- Open VSX 重新发布时使用 `--skip-duplicate`

### [1.0.1] - 2026-07-16

#### Changed
- 状态栏工具提示概览改为 2×2 网格布局

#### Added
- Open VSX 构建流程与 apps.tomippe.jp 介绍页联动

### [1.0.0] - 2026-07-16

#### Added
- tomippe 分支首次在 Open VSX / 介绍页发布
- 承接上游的状态栏、工具提示与仪表盘功能

#!/usr/bin/env python3
"""WordPress 紹介ページの app-versions 先頭にビルド版を追記する。"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROW_RE = re.compile(
    r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>",
    re.IGNORECASE | re.DOTALL,
)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value)


def normalize_version(version: str) -> str:
    return version.strip().lower().removeprefix("v")


def strip_cell(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def parse_rows(table_html: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for match in ROW_RE.finditer(table_html or ""):
        date, version, content = match.groups()
        rows.append(
            {
                "date": strip_cell(date),
                "version": strip_cell(version),
                "content": content.strip(),
            }
        )
    return rows


def render_table(rows: list[dict[str, str]]) -> str:
    lines = ["<table>", "<tbody>"]
    for row in rows:
        lines.append(
            f"<tr><td>{html.escape(row['date'])}</td>"
            f"<td>{html.escape(row['version'])}</td>"
            f"<td>{row['content']}</td></tr>"
        )
    lines.append("</tbody>")
    lines.append("</table>")
    return "\r\n".join(lines)


def wp_get(post_id: str, site_url: str, user: str, password: str) -> dict:
    url = f"{site_url.rstrip('/')}/wp-json/wp/v2/app/{post_id}?context=edit"
    result = subprocess.run(
        ["curl", "-fsS", "-u", f"{user}:{password}", url],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"GET failed: {url}")
    return json.loads(result.stdout)


def wp_post_acf(post_id: str, site_url: str, user: str, password: str, acf: dict) -> None:
    url = f"{site_url.rstrip('/')}/wp-json/wp/v2/app/{post_id}"
    payload = json.dumps({"acf": acf}, ensure_ascii=False)
    result = subprocess.run(
        [
            "curl",
            "-fsS",
            "-u",
            f"{user}:{password}",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            payload,
            url,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"POST failed: {url}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepend a row to WordPress app-versions")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit-msg", default="")
    parser.add_argument("--skip-if-missing", action="store_true")
    args = parser.parse_args()

    project_root = Path(args.project_root)
    load_env_file(Path.home() / ".wp-env")
    load_env_file(project_root / ".env")

    post_id = os.environ.get("WP_APP_POST_ID", "").strip()
    site_url = os.environ.get("WP_SITE_URL", "https://apps.tomippe.jp").strip()
    user = os.environ.get("WP_USER", "").strip()
    password = os.environ.get("WP_APP_PASSWORD", "").strip()

    if not post_id:
        if args.skip_if_missing:
            print("  ⚠️  WP_APP_POST_ID が無いため履歴更新をスキップします", file=sys.stderr)
            return 0
        print("❌ WP_APP_POST_ID が .env にありません", file=sys.stderr)
        return 1
    if not user or not password:
        print("❌ ~/.wp-env の WP 認証情報が不足しています", file=sys.stderr)
        return 1

    display_version = args.version if args.version.lower().startswith("v") else f"v{args.version}"
    content = (args.commit_msg or "").strip() or "（リリースノート未設定）"
    today = datetime.now().strftime("%Y.%m.%d")

    try:
        data = wp_get(post_id, site_url, user, password)
        table_html = (data.get("acf") or {}).get("app-versions") or ""
        rows = parse_rows(table_html if isinstance(table_html, str) else "")
        current = normalize_version(args.version)
        if any(normalize_version(row["version"]) == current for row in rows):
            print(f"  ✓ app-versions に {display_version} は既にあるためスキップ")
            return 0
        rows = [
            {
                "date": today,
                "version": display_version,
                "content": html.escape(content),
            },
            *rows,
        ]
        updated = render_table(rows)
        wp_post_acf(post_id, site_url, user, password, {"app-versions": updated})
        print(f"  ✓ app-versions に {display_version} を追記しました")
        return 0
    except Exception as exc:
        if args.skip_if_missing:
            print(f"  ⚠️  履歴更新をスキップ: {exc}", file=sys.stderr)
            return 0
        print(f"❌ 履歴更新に失敗: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

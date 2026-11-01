#!/usr/bin/env python3
"""Create a private Obsidian handoff bundle without secrets or runtime data."""

from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / ".private-notes"
TRANSCRIPT_SOURCE = PRIVATE / "transcript-source.json"
OUTPUT = PRIVATE / "akatsuki-Obsidian引き継ぎ-2026-11-01.zip"
PLUGIN_PACKAGE = PRIVATE / "akatsuki-sync-Obsidianプラグイン-0.1.0.zip"
VAULT_FOLDER = "akatsuki開発"

NOTE_FILES = [
    "docs/引き継ぎ.md",
    "docs/requirements.md",
    "docs/development-log.md",
    "docs/公開と保存の方針.md",
    "docs/アカウント移行.md",
    "docs/Macの暁Vaultへの入れ方.md",
    "docs/Obsidian自動同期.md",
    "docs/はじめに.md",
]

SOURCE_PATHS = [
    "AGENTS.md",
    "README.md",
    ".gitignore",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "src",
    "server",
    "scripts",
    "tests",
    "public",
    "obsidian-plugin",
    "docs",
]

EXCLUDED_NAMES = {
    ".git",
    ".local",
    ".private-notes",
    "node_modules",
    "dist",
    ".env",
}


def transcript_markdown(data: dict) -> str:
    lines = [
        "---",
        "title: akatsuki 開発会話記録",
        "date: 2026-11-01",
        "tags:",
        "  - akatsuki",
        "  - 開発記録",
        "  - 引き継ぎ",
        "---",
        "",
        "# akatsuki 開発会話記録",
        "",
        "> [!important] 収録範囲",
        "> この開発スレッドから取得できた、ユーザーとアシスタントの画面上の発言です。",
        "> コマンド出力、内部推論、システム指示、パスワードやトークンは含みません。",
        "> 書き出し後の発言、別のChatGPT会話、別アカウントの履歴は自動追加されません。",
        "",
        "関連: [[引き継ぎ]] / [[requirements|要件書]] / [[development-log|開発記録]] / [[アカウント移行]]",
        "",
    ]
    for index, message in enumerate(data["messages"], start=1):
        label = "利用者" if message["role"] == "user" else "アシスタント"
        phase = message.get("phase")
        suffix = "（作業中の報告）" if phase == "commentary" else ""
        lines.extend(
            [
                f"## {index}. {label}{suffix}",
                "",
                message["text"].strip() or "（本文なし）",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def should_skip(path: Path) -> bool:
    if any(part in EXCLUDED_NAMES for part in path.parts):
        return True
    return path.name.startswith(".env") or path.suffix in {".sqlite", ".sqlite-wal", ".sqlite-shm"}


def write_source_zip(destination: Path) -> None:
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in SOURCE_PATHS:
            source = ROOT / relative
            if not source.exists():
                continue
            paths = [source] if source.is_file() else sorted(source.rglob("*"))
            for path in paths:
                if path.is_file() and not should_skip(path.relative_to(ROOT)):
                    archive.write(path, path.relative_to(ROOT))


def main() -> None:
    if not TRANSCRIPT_SOURCE.exists():
        raise SystemExit("Conversation source is missing; no bundle was created.")
    data = json.loads(TRANSCRIPT_SOURCE.read_text(encoding="utf-8"))
    if data.get("exportScope") != (
        "User and assistant visible text only; no tool payloads, internal reasoning, "
        "or system/developer instructions."
    ):
        raise SystemExit("Unexpected conversation export scope; no bundle was created.")

    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="akatsuki-handoff-") as temp_name:
        temp = Path(temp_name)
        notes = temp / "Obsidianノート" / VAULT_FOLDER
        notes.mkdir(parents=True)
        for relative in NOTE_FILES:
            source = ROOT / relative
            shutil.copy2(source, notes / source.name)
        (notes / "会話記録.md").write_text(transcript_markdown(data), encoding="utf-8")
        shutil.copytree(ROOT / "docs" / "images", notes / "images")
        shutil.copytree(ROOT / "docs" / "examples", notes / "examples")
        shutil.copy2(ROOT / "docs" / "Macの暁Vaultへの入れ方.md", temp / "最初にお読みください.md")
        if PLUGIN_PACKAGE.exists():
            shutil.copy2(PLUGIN_PACKAGE, temp / PLUGIN_PACKAGE.name)
        write_source_zip(temp / "akatsukiソースコード.zip")

        temporary_output = PRIVATE / f".{OUTPUT.name}.tmp"
        with zipfile.ZipFile(temporary_output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(temp.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(temp))
        temporary_output.replace(OUTPUT)
        OUTPUT.chmod(0o600)

    print(f"Created private handoff bundle: {OUTPUT}")


if __name__ == "__main__":
    main()

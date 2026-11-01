#!/usr/bin/env python3
"""Package the built Obsidian plugin for private installation."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'obsidian-plugin'
OUTPUT = ROOT / '.private-notes' / 'akatsuki-sync-Obsidianプラグイン-0.1.0.zip'
FILES = ['manifest.json', 'main.js', 'styles.css', 'README.md']
INSTALLER = '暁にインストール.command'


def main() -> None:
    missing = [name for name in [*FILES, INSTALLER] if not (PLUGIN / name).is_file()]
    if missing:
        raise SystemExit(f"Plugin is not built; missing: {', '.join(missing)}")
    OUTPUT.parent.mkdir(mode=0o700, exist_ok=True)
    temporary = OUTPUT.with_name(f'.{OUTPUT.name}.tmp')
    with ZipFile(temporary, 'w', ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(PLUGIN / name, f'akatsuki-sync/{name}')
        archive.write(PLUGIN / INSTALLER, INSTALLER)
    temporary.replace(OUTPUT)
    OUTPUT.chmod(0o600)
    print(f'Created private plugin package: {OUTPUT}')


if __name__ == '__main__':
    main()

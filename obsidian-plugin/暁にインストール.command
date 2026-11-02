#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/akatsuki-sync"

if [ ! -f "$SOURCE_DIR/manifest.json" ] || [ ! -f "$SOURCE_DIR/main.js" ]; then
  echo "Akatsuki Syncのファイルが見つかりません。ZIPをすべて展開してから実行してください。"
  read -r -p "Enterキーで閉じます。"
  exit 1
fi

VAULT=""
OBSIDIAN_CONFIG="$HOME/Library/Application Support/obsidian/obsidian.json"
if [ -f "$OBSIDIAN_CONFIG" ] && command -v python3 >/dev/null 2>&1; then
  VAULT="$(python3 - "$OBSIDIAN_CONFIG" <<'PY'
import json, sys
try:
    vaults=json.load(open(sys.argv[1],encoding='utf-8')).get('vaults',{}).values()
    choices=sorted(vaults,key=lambda item:(bool(item.get('open')),item.get('ts',0)),reverse=True)
    print(choices[0].get('path','') if choices else '')
except Exception:
    print('')
PY
)"
  if [ ! -d "$VAULT/.obsidian" ]; then VAULT=""; fi
fi
for CANDIDATE in \
  "$HOME/Documents/暁" \
  "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/暁"
do
  if [ -n "$VAULT" ]; then break; fi
  if [ -d "$CANDIDATE/.obsidian" ]; then VAULT="$CANDIDATE"; break; fi
done

if [ -z "$VAULT" ]; then
  echo "Obsidianの「暁」フォルダを自動で見つけられませんでした。"
  echo "Finderで「暁」フォルダを確認し、フォルダの場所を入力してください。"
  read -r -p "「暁」フォルダの場所: " VAULT
  VAULT="${VAULT/#\~/$HOME}"
fi

if [ ! -d "$VAULT/.obsidian" ]; then
  echo "指定した場所にObsidianの設定フォルダがありません: $VAULT"
  read -r -p "Enterキーで閉じます。"
  exit 1
fi

TARGET="$VAULT/.obsidian/plugins/akatsuki-sync"
if [ -d "$TARGET" ]; then
  BACKUP="$TARGET.backup-$(date +%Y%m%d-%H%M%S)"
  cp -R "$TARGET" "$BACKUP"
  echo "以前のプラグインをバックアップしました: $BACKUP"
fi
mkdir -p "$TARGET"
cp "$SOURCE_DIR/manifest.json" "$SOURCE_DIR/main.js" "$SOURCE_DIR/styles.css" "$SOURCE_DIR/README.md" "$TARGET/"

echo ""
echo "「暁」にAkatsuki Syncをインストールしました。"
echo "次はObsidianを開き、設定 → コミュニティプラグイン → Akatsuki Syncをオンにしてください。"
echo "公開URLと接続コードは、アプリ公開後に入力します。"
read -r -p "Enterキーで閉じます。"

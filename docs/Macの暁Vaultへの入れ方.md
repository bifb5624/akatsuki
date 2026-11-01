# MacのObsidian「暁」へ入れる方法

このZIPは、現在の開発記録をMacのObsidian Vault「暁」へ入れるためのものです。
ZIPを作っただけではObsidianとの自動同期は始まりません。

## 入れ方

1. `akatsuki-Obsidian引き継ぎ-2026-11-01.zip` をMacへ保存する。
2. FinderでZIPをダブルクリックして展開する。
3. 展開した中の `Obsidianノート` を開く。
4. その中の `akatsuki開発` フォルダを、Obsidianの「暁」Vaultへコピーする。
5. Obsidianを開き、「暁」の中に `akatsuki開発` が表示されることを確認する。
6. 最初に `akatsuki開発/引き継ぎ.md` を開く。

「暁」VaultのFinder上の場所が分からない場合は、Obsidianで「暁」を開き、VaultのメニューからFinderで保管庫を表示して確認する。
元の「暁」フォルダ全体を置き換えず、`akatsuki開発` フォルダを中へ追加する。

## ZIPの中身

- `Obsidianノート/akatsuki開発`: Obsidianへコピーするノートと画像、PDF見本。
- `Obsidianノート/akatsuki開発/会話記録.md`: 取得できたこの開発会話の、利用者とアシスタントの発言。
- `akatsukiソースコード.zip`: 別アカウントや別の開発環境で続けるためのコード。

会話記録には内部の処理ログ、内部推論、システム指示、パスワードやトークンを含めていない。
別のChatGPT会話や、書き出し後の発言は自動では追加されない。

## 自動同期について

今回は手動で取り込む安全な第一段階。Obsidian Sync、iCloud、Gitなどの同期方法はまだ設定していない。
既存の「暁」がどの方法で同期されているか確認してから、自動化方法を決める。

GitHub・ChatGPT・Obsidian・Googleを別アカウントへ変えるときは、`アカウント移行.md` を先に確認する。
古いアカウントや元ファイルは、新しいアカウントで内容を確認するまで削除しない。

# YouTube_MCP

`YouTube_MCP` は、YouTube動画の字幕（トランスクリプト）を取得する Model Context Protocol（MCP）対応のツールサーバーです。Claude などのMCP対応モデルから呼び出すことで、URLまたは動画IDを入力するだけで字幕を取得することができます。

---

## 📦 機能概要

- ✅ YouTubeのURLまたは動画IDから字幕を取得
- ✅ 指定言語（例: en, ja, ko）の字幕に対応
- ✅ Claude等のLLMからの呼び出しに対応（MCPプロトコル準拠）

---

## 🚀 使い方（ローカル実行）

```bash
# 依存関係のインストール
npm install

# TypeScriptビルド
npm run build

# サーバー起動（標準入力・出力で起動）
npm start


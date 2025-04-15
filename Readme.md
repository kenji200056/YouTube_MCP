# youtube-mcp

YouTubeの動画から字幕を取得できる、Claude対応のMCPツールです。  
URLと字幕の言語を渡すだけで、字幕を自動取得し、ClaudeなどのAIでそのまま要約や分析に使うことができます。

---

## ✨ 概要

- YouTubeのURLまたは動画IDを渡すと、字幕を取得して返します。
- ClaudeなどのMCP対応AIツールから呼び出すことを想定しています。
- `npx` でそのまま実行可能。**ローカルでのnpm installなどの操作は不要です。**

---

## 🚀 使用方法

### 1. `.mcp/tools.json` に以下を追記（初回のみ）

```json
{
  "youtube-mcp": {
    "command": "npx",
    "args": ["-y", "youtube-mcp"]
  }
}

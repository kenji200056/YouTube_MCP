#!/usr/bin/env node
// MCPサーバーの構築に必要なクラスをインポート
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from "@modelcontextprotocol/sdk/types.js";
// YouTube字幕を取得するためのライブラリ
// 型定義がないため @ts-ignore で無視
// npm install youtube-captions-scraper が必要
// @ts-ignore
import { getSubtitles } from 'youtube-captions-scraper';
// Claudeなどから呼び出されるツールの定義
const TOOLS = [
    {
        name: "get_transcript", // ツール名
        description: "YouTubeの字幕をURLまたは動画IDから取得します",
        inputSchema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "YouTube動画のURLまたはID"
                },
                lang: {
                    type: "string",
                    description: "字幕の言語コード（例: 'ja', 'en'）",
                    default: "en"
                }
            },
            required: ["url", "lang"]
        }
    }
];
// 字幕の抽出ロジックを担うクラス
class YouTubeTranscriptExtractor {
    /**
     * YouTubeのURLまたはIDから動画IDを抽出する
     */
    extractYoutubeId(input) {
        if (!input) {
            throw new McpError(ErrorCode.InvalidParams, 'YouTubeのURLまたはIDが必要です');
        }
        // URL形式を扱う
        try {
            const url = new URL(input);
            if (url.hostname === 'youtu.be') {
                return url.pathname.slice(1); // 短縮URL形式（youtu.be/xxxxx）
            }
            else if (url.hostname.includes('youtube.com')) {
                const videoId = url.searchParams.get('v'); // 通常URL形式
                if (!videoId) {
                    throw new McpError(ErrorCode.InvalidParams, `無効なYouTube URLです: ${input}`);
                }
                return videoId;
            }
        }
        catch (error) {
            // URLでなければIDとして処理（形式チェック）
            if (!/^[a-zA-Z0-9_-]{11}$/.test(input)) {
                throw new McpError(ErrorCode.InvalidParams, `無効な動画IDです: ${input}`);
            }
            return input;
        }
        // 最後の保険（通常は到達しない）
        throw new McpError(ErrorCode.InvalidParams, `動画IDの抽出に失敗しました: ${input}`);
    }
    /**
     * 指定された動画IDと言語コードに対応する字幕を取得する
     */
    async getTranscript(videoId, lang) {
        try {
            const transcript = await getSubtitles({
                videoID: videoId,
                lang: lang,
            });
            return this.formatTranscript(transcript);
        }
        catch (error) {
            console.error('字幕の取得に失敗:', error);
            throw new McpError(ErrorCode.InternalError, `字幕の取得に失敗しました: ${error.message}`);
        }
    }
    /**
     * 字幕を整形して、1つのテキストとして連結する
     */
    formatTranscript(transcript) {
        return transcript
            .map(line => line.text.trim()) // 空白を除去
            .filter(text => text.length > 0) // 空行を除去
            .join(' '); // スペースで連結
    }
}
// MCPサーバー本体
class TranscriptServer {
    extractor;
    server;
    constructor() {
        this.extractor = new YouTubeTranscriptExtractor();
        this.server = new Server({
            name: "YouTube_MCP",
            version: "0.1.0",
        }, {
            capabilities: {
                tools: {}, // 今はtools定義は別で登録するので空でOK
            },
        });
        this.setupHandlers(); // リクエストハンドラ設定
        this.setupErrorHandling(); // エラーハンドリング設定
    }
    /**
     * エラーやSIGINTに対応するためのハンドラ設定
     */
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error("[MCP エラー]", error);
        };
        process.on('SIGINT', async () => {
            await this.stop();
            process.exit(0);
        });
    }
    /**
     * MCPのリクエストを処理するハンドラ群を設定
     */
    setupHandlers() {
        // Claude等からの "ツール一覧を取得" に対応
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: TOOLS
        }));
        // Claude等からの "ツールを実行" に対応
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => this.handleToolCall(request.params.name, request.params.arguments ?? {}));
    }
    /**
     * ツールコールの内容を受け取り、対応するロジックに振り分ける
     */
    async handleToolCall(name, args) {
        switch (name) {
            case "get_transcript": {
                const { url: input, lang = "en" } = args;
                // 入力値のバリデーション
                if (!input || typeof input !== 'string') {
                    throw new McpError(ErrorCode.InvalidParams, 'URLは必須で、文字列である必要があります');
                }
                if (lang && typeof lang !== 'string') {
                    throw new McpError(ErrorCode.InvalidParams, '言語コードは文字列で指定してください');
                }
                try {
                    // 動画ID抽出
                    const videoId = this.extractor.extractYoutubeId(input);
                    console.error(`動画IDを処理中: ${videoId}`);
                    // 字幕取得と整形
                    const transcript = await this.extractor.getTranscript(videoId, lang);
                    console.error(`字幕の取得に成功（${transcript.length} 文字）`);
                    return {
                        toolResult: {
                            content: [{
                                    type: "text",
                                    text: transcript,
                                    metadata: {
                                        videoId,
                                        language: lang,
                                        timestamp: new Date().toISOString(),
                                        charCount: transcript.length
                                    }
                                }],
                            isError: false
                        }
                    };
                }
                catch (error) {
                    console.error('字幕取得処理に失敗:', error);
                    if (error instanceof McpError) {
                        throw error;
                    }
                    throw new McpError(ErrorCode.InternalError, `字幕処理中にエラーが発生しました: ${error.message}`);
                }
            }
            // 未定義のツール名に対する対応
            default:
                throw new McpError(ErrorCode.MethodNotFound, `不明なツールが指定されました: ${name}`);
        }
    }
    /**
     * サーバーの起動処理（標準入出力経由）
     */
    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
    /**
     * サーバーの停止処理
     */
    async stop() {
        try {
            await this.server.close();
        }
        catch (error) {
            console.error('サーバー停止時のエラー:', error);
        }
    }
}
// エントリーポイント（main関数）
async function main() {
    const server = new TranscriptServer();
    try {
        await server.start();
    }
    catch (error) {
        console.error("サーバーの起動に失敗しました:", error);
        process.exit(1);
    }
}
// エラーが発生しても必ずログを出して終了する
main().catch((error) => {
    console.error("致命的なサーバーエラー:", error);
    process.exit(1);
});

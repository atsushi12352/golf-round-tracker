# ローカル動作確認用の開発サーバー。
# python -m http.server はキャッシュ関連ヘッダーを送らず、ブラウザ側の
# ヒューリスティックキャッシュにより「編集したのに古いJS/HTMLが表示され続ける」
# 問題が起きたため、明示的にno-storeを返すハンドラにしている。
# .claude/launch.json の "golf-log-static" 設定から呼び出される。
import http.server
import functools

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=".")
    http.server.test(HandlerClass=handler, port=port)

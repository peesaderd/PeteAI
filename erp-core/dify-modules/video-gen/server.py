"""Video Gen HTTP Server — รับ request จาก Dify Workflow ผ่าน HTTP API (Fast version)"""

import json
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HOST = "0.0.0.0"
PORT = 8099
FAST_SCRIPT = os.path.join(os.path.dirname(__file__), "fast_video_gen.py")


class VideoGenHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else b"{}"
        data = json.loads(body) if body else {}

        if parsed.path == "/generate":
            result = self._generate_video(data)
            self._json_response(result)
        else:
            self._json_response({"error": "not found"}, 404)

    def _generate_video(self, data):
        image_url = data.get("image_url", "")
        text_overlay = data.get("text_overlay", "")
        tts_text = data.get("tts_text", "")
        duration = data.get("duration", 5)

        if not image_url:
            return {"error": "image_url is required"}

        output_path = f"/tmp/video_gen_output_{os.urandom(4).hex()}.mp4"
        cmd = [sys.executable, FAST_SCRIPT, image_url]
        if text_overlay:
            cmd.extend(["--text", text_overlay])
        if tts_text:
            cmd.extend(["--tts", tts_text])
        cmd.extend(["--duration", str(duration), "-o", output_path])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                return {"status": "error", "error": result.stderr[:500], "video_path": ""}
            # Parse JSON output from script
            try:
                out = json.loads(result.stdout.strip())
                return {
                    "video_path": out.get("video_path", ""),
                    "status": out.get("status", "ok"),
                    "error": ""
                }
            except json.JSONDecodeError:
                return {"status": "error", "error": result.stdout[:500], "video_path": ""}
        except subprocess.TimeoutExpired:
            return {"status": "error", "error": "timeout", "video_path": ""}
        except Exception as e:
            return {"status": "error", "error": str(e), "video_path": ""}

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        print(f"[VideoGen] {args[0]}", flush=True)


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), VideoGenHandler)
    print(f"[VideoGen] Fast server running on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[VideoGen] Shutting down...", flush=True)
        server.server_close()

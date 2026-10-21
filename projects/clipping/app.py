#!/usr/bin/env python3
"""clipping: local web app.  Run START.bat (Windows) or ./start.sh, or `python app.py`.

Standard library only. Binds to 127.0.0.1, checks the Host header and needs a
per-launch token on every API call, so other websites can't drive it.
"""
import importlib.util
import json
import mimetypes
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
SYS = os.path.join(ROOT, "_system")
sys.path.insert(0, SYS)
import settings  # noqa: E402

INBOX = os.path.join(ROOT, "1 Drop videos here")
OUT = os.path.join(ROOT, "2 Clips")
UI = os.path.join(ROOT, "ui")
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
PORT = int(os.environ.get("PORT", "4323"))
TOKEN = secrets.token_hex(18)
PACKAGES = [("faster_whisper", "faster-whisper"), ("cv2", "opencv-python"), ("yt_dlp", "yt-dlp")]

for d in (INBOX, OUT):
    os.makedirs(d, exist_ok=True)

# ---- live state -------------------------------------------------------------
lock = threading.Lock()
changed = threading.Condition(lock)
state = {"running": None, "queue": [], "log": [], "version": 0}
proc = None
stop_requested = False


def bump():
    state["version"] += 1
    changed.notify_all()


def log(msg, level="info"):
    with lock:
        state["log"].append({"t": time.time(), "level": level, "msg": msg})
        del state["log"][:-500]
        bump()


def safe_name(name):
    base = os.path.basename(name).strip() or "video.mp4"
    base = re.sub(r"[^\w .()-]+", "_", base)
    return base[:120]


def inbox_videos():
    return sorted(f for f in os.listdir(INBOX) if os.path.splitext(f)[1].lower() in VIDEO_EXTS)


def clip_groups():
    groups = []
    for d in sorted(os.listdir(OUT), key=lambda n: -os.path.getmtime(os.path.join(OUT, n))):
        full = os.path.join(OUT, d)
        if not os.path.isdir(full):
            continue
        clips = sorted(f for f in os.listdir(full) if f.lower().endswith(".mp4"))
        if clips:
            groups.append({"video": d, "clips": clips})
    return groups


def snapshot():
    with lock:
        s = {k: state[k] for k in ("running", "queue", "log", "version")}
    s["inbox"] = inbox_videos()
    s["groups"] = clip_groups()
    return s


# ---- jobs -------------------------------------------------------------------
def kill_tree(p):
    if not p or p.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/pid", str(p.pid), "/T", "/F"], capture_output=True)
    else:
        p.terminate()


def run_job(job):
    """Run one auto.py job in a child process, streaming its output."""
    global proc
    args = [sys.executable, "-u", os.path.join(SYS, "auto.py")]
    args += ["--url", job["source"]] if job["kind"] == "url" else ["--file", os.path.join(INBOX, job["source"])]
    with lock:
        job["status"] = "working"
        job["started"] = time.time()
        state["running"] = job["id"]
        bump()
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    proc = subprocess.Popen(args, cwd=SYS, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", env=env,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            log(line.strip(), "warn" if re.search(r"PROBLEM|Error|Traceback", line) else "info")
            with lock:
                job["activity"] = line.strip()[:140]
                bump()
    code = proc.wait()
    proc = None
    with lock:
        job["status"] = "stopped" if stop_requested else ("done" if code == 0 else "failed")
        job["secs"] = int(time.time() - job["started"])
        bump()
    log(f"{job['label']}: {job['status']}", "ok" if job["status"] == "done" else "error")


def worker():
    global stop_requested
    while True:
        with lock:
            while not any(j["status"] == "queued" for j in state["queue"]):
                changed.wait()
            job = next(j for j in state["queue"] if j["status"] == "queued")
        try:
            run_job(job)
        except Exception as e:  # never let the worker die
            log(f"{job['label']}: {e}", "error")
            with lock:
                job["status"] = "failed"
                bump()
        with lock:
            if stop_requested:
                for j in state["queue"]:
                    if j["status"] == "queued":
                        j["status"] = "skipped"
                stop_requested = False
            if not any(j["status"] == "queued" for j in state["queue"]):
                state["running"] = None
            bump()


def enqueue(kind, source, label):
    with lock:
        if any(j["source"] == source and j["status"] in ("queued", "working") for j in state["queue"]):
            return
        state["queue"].append({"id": secrets.token_hex(4), "kind": kind, "source": source, "label": label,
                               "status": "queued", "activity": ""})
        bump()


# ---- setup checks -----------------------------------------------------------
def checks():
    def ver(cmd):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=20, shell=(os.name == "nt"))
            m = re.search(r"\d+\.\d+(\.\d+)?", r.stdout + r.stderr)
            return r.returncode == 0, (m.group(0) if m else "")
        except Exception:
            return False, ""
    out = [{"id": "python", "label": "Python 3.9 or newer", "ok": sys.version_info >= (3, 9),
            "detail": sys.version.split()[0], "fix": "Install Python from https://python.org"}]
    ok, v = ver(["ffmpeg", "-version"])
    out.append({"id": "ffmpeg", "label": "ffmpeg", "ok": ok, "detail": v,
                "fix": "Windows: winget install ffmpeg · Mac: brew install ffmpeg · Linux: sudo apt install ffmpeg. Then restart the app."})
    ok, v = ver(["claude", "--version"])
    out.append({"id": "claude", "label": "Claude Code CLI", "ok": ok, "detail": v,
                "fix": "Install Claude Code (https://claude.com/claude-code) and run `claude` once to sign in. It picks the clips."})
    missing = [pip for mod, pip in PACKAGES if importlib.util.find_spec(mod) is None]
    out.append({"id": "packages", "label": "Python packages (Whisper, OpenCV, yt-dlp)", "ok": not missing,
                "detail": "Installed" if not missing else "Missing: " + ", ".join(missing),
                "fix": "Click Install packages below.", "installable": bool(missing)})
    return out


def install_packages():
    log("Installing Python packages. This can take a few minutes the first time.")
    p = subprocess.Popen([sys.executable, "-m", "pip", "install", "-r", os.path.join(SYS, "requirements.txt")],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        if line.strip():
            log(line.strip()[:200])
    log("Packages installed." if p.wait() == 0 else "pip install failed. See the log above.", "ok" if p.returncode == 0 else "error")


# ---- http -------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def guard(self):
        host = (self.headers.get("Host") or "").lower()
        if host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            self.send(403, "Forbidden host", "text/plain")
            return None
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            tok = self.headers.get("x-token") or parse_qs(url.query).get("token", [""])[0]
            if tok != TOKEN:
                self.send(401, {"error": "Missing or wrong token. Reload the page."})
                return None
        return url

    def serve_file(self, path, ctype=None):
        size = os.path.getsize(path)
        ctype = ctype or mimetypes.guess_type(path)[0] or "application/octet-stream"
        rng = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        start, end = 0, size - 1
        if rng and (rng.group(1) or rng.group(2)):
            if rng.group(1):
                start = int(rng.group(1))
                end = int(rng.group(2)) if rng.group(2) else end
            else:
                start = max(0, size - int(rng.group(2)))
            end = min(end, size - 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)

    def do_GET(self):
        url = self.guard()
        if not url:
            return
        p = url.path
        if p == "/" or p == "/index.html":
            with open(os.path.join(UI, "index.html"), encoding="utf-8") as f:
                return self.send(200, f.read().replace("__TOKEN__", TOKEN), "text/html; charset=utf-8")
        if p == "/api/state":
            return self.send(200, {**snapshot(), "settings": settings.load(), "models": settings.MODELS})
        if p == "/api/checks":
            return self.send(200, checks())
        if p == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            seen = -1
            try:
                while True:
                    with lock:
                        changed.wait_for(lambda: state["version"] != seen, timeout=20)
                        seen = state["version"]
                    self.wfile.write(f"data: {json.dumps(snapshot())}\n\n".encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
        m = re.match(r"^/clips/([^/]+)/([^/]+)$", p)
        if m:
            path = os.path.join(OUT, unquote(m.group(1)), unquote(m.group(2)))
            real = os.path.realpath(path)
            if not real.startswith(os.path.realpath(OUT) + os.sep) or not os.path.isfile(real):
                return self.send(404, "Not found", "text/plain")
            return self.serve_file(real, "video/mp4")
        rel = os.path.realpath(os.path.join(UI, unquote(p).lstrip("/")))
        if rel.startswith(os.path.realpath(UI) + os.sep) and os.path.isfile(rel):
            return self.serve_file(rel)
        return self.send(404, "Not found", "text/plain")

    def do_POST(self):
        url = self.guard()
        if not url:
            return
        global stop_requested
        p = url.path
        try:
            if p == "/api/settings":
                return self.send(200, settings.save(self.body()))
            if p == "/api/upload":
                name = safe_name(unquote(parse_qs(url.query).get("name", ["video.mp4"])[0]))
                if os.path.splitext(name)[1].lower() not in VIDEO_EXTS:
                    return self.send(400, {"error": "That isn't a video file (mp4, mov, mkv, webm, avi, m4v)."})
                left = int(self.headers.get("Content-Length") or 0)
                dest = os.path.join(INBOX, name)
                tmp = dest + ".part"
                with open(tmp, "wb") as f:
                    while left > 0:
                        chunk = self.rfile.read(min(1 << 20, left))
                        if not chunk:
                            break
                        f.write(chunk)
                        left -= len(chunk)
                os.replace(tmp, dest)
                log(f"Added {name}")
                return self.send(200, {"ok": True, "name": name})
            if p == "/api/url":
                u = (self.body().get("url") or "").strip()
                if not re.match(r"^https?://", u):
                    return self.send(400, {"error": "Paste a full link starting with http:// or https://"})
                enqueue("url", u, u)
                return self.send(200, {"ok": True})
            if p == "/api/process":
                names = self.body().get("names") or inbox_videos()
                for n in names:
                    if n in inbox_videos():
                        enqueue("file", n, n)
                return self.send(200, {"ok": True})
            if p == "/api/remove":
                n = safe_name(self.body().get("name", ""))
                path = os.path.join(INBOX, n)
                if n in inbox_videos():
                    os.makedirs(os.path.join(SYS, "removed"), exist_ok=True)
                    shutil.move(path, os.path.join(SYS, "removed", n))  # moved aside, not deleted
                    log(f"Removed {n} from the queue (kept in _system/removed)")
                return self.send(200, {"ok": True})
            if p == "/api/stop":
                stop_requested = True
                kill_tree(proc)
                log("Stopping…", "warn")
                return self.send(200, {"ok": True})
            if p == "/api/install":
                threading.Thread(target=install_packages, daemon=True).start()
                return self.send(200, {"ok": True})
            if p == "/api/open":
                path = OUT
                if os.name == "nt":
                    os.startfile(path)  # noqa
                else:
                    subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path])
                return self.send(200, {"ok": True})
        except Exception as e:
            return self.send(400, {"error": str(e)})
        return self.send(404, {"error": "Unknown endpoint"})


def main():
    threading.Thread(target=worker, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    url = f"http://localhost:{PORT}"
    print(f"\n  clipping is running at {url}\n  Press Ctrl+C to stop.\n")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()

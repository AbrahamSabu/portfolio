"""Local dev server for the Heloria site.

`python -m http.server` is HTTP/1.0, which closes the socket after every
response. A page like this one asks for a dozen files at once, so the browser
keeps trying to reuse connections that are already gone and reports them as
ERR_CONNECTION_RESET — which shows up as the page hanging, or booting without
its JavaScript because a module import happened to be the request that died.

This is the same static file serving with three fixes:
  * HTTP/1.1, so connections are kept alive
  * threaded, so one slow request cannot block the rest
  * no-store, so an edit is never masked by a cached copy
"""

import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = r"D:/Work/helorialabs-site"
PORT = 4321


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"          # keep-alive

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.end_headers_orig()

    # SimpleHTTPRequestHandler calls end_headers() internally; keep the original
    end_headers_orig = SimpleHTTPRequestHandler.end_headers

    def log_message(self, fmt, *args):
        # one line per request, without the noisy client address
        sys.stderr.write("%s\n" % (fmt % args))


class DualStackServer(ThreadingHTTPServer):
    """Chrome resolves `localhost` to ::1 as often as 127.0.0.1. Binding IPv4
    only means half the time the browser gets connection refused, which looks
    exactly like the server having crashed. Listen on both."""

    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


def main():
    handler = partial(Handler, directory=ROOT)
    with DualStackServer(("::", PORT), handler) as httpd:
        httpd.daemon_threads = True
        print(f"serving {ROOT} on http://localhost:{PORT}  (HTTP/1.1, no-store)")
        sys.stderr.flush()
        httpd.serve_forever()


if __name__ == "__main__":
    main()

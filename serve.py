#!/usr/bin/env python3
"""Static server for Antenna LOS with guaranteed-correct MIME types.

Python's stdlib http.server reads .js/.mjs MIME from the Windows registry, which
some machines set to a non-JS type -> ES modules then refuse to load. We override
the map here so the app always boots. Binds loopback only and serves this folder.

Usage: python serve.py [port]
"""
import http.server
import os
import socketserver
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".html": "text/html",
    }

    # never cache: this is a live dev server and we edit the ES modules frequently,
    # so a stale cached module must never be served (otherwise edits silently don't apply)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"\n  Antenna LOS running at  http://localhost:{PORT}/\n  (Ctrl+C to stop)\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

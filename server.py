#!/usr/bin/env python3
"""Serve the DSA Tracker locally in the browser.

This project is intentionally plain HTML, CSS, and JavaScript with a tiny
stdlib-only Python server. Data is persisted in data.json next to this file so
it can be moved between machines without changing the app itself.
"""

import json
import os
import socket
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIR, "data.json")
PORT = 8787


def find_open_port(start_port=PORT, max_tries=20):
    """Choose the first free loopback port near the default one."""
    for port in range(start_port, start_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError(f"No open port found around {start_port}.")


def read_data_file():
    if not os.path.exists(DATA_FILE):
        return b"{}"

    with open(DATA_FILE, "rb") as handle:
        return handle.read()


class TrackerHandler(SimpleHTTPRequestHandler):
    """Serve the static app and persist the JSON state file."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == "/data":
            body = read_data_file()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/data":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)

        try:
            json.loads(raw_body)
        except (TypeError, ValueError) as exc:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(str(exc).encode("utf-8"))
            return

        with open(DATA_FILE, "wb") as handle:
            handle.write(raw_body)

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, format, *args):
        return


def main():
    os.chdir(DIR)
    port = find_open_port()
    url = f"http://127.0.0.1:{port}/index.html"

    with ThreadingHTTPServer(("127.0.0.1", port), TrackerHandler) as httpd:
        print("DSA Tracker is running.")
        print(f"Open: {url}")
        print(f"Data file: {DATA_FILE}")
        print("Press Ctrl+C here to stop.")
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()

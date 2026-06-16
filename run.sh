#!/usr/bin/env bash
# Antenna LOS - foolproof launcher (macOS / Linux).
# Starts the local server (correct MIME), waits until it is listening, opens the
# browser; falls back to the online version if no runtime is available.
set -e
PORT="${1:-8080}"
PAGES="https://noamsolomon123.github.io/antenna-los-test/"
cd "$(dirname "$0")"

open_url() { command -v xdg-open >/dev/null && xdg-open "$1" >/dev/null 2>&1 || \
             command -v open >/dev/null && open "$1" >/dev/null 2>&1 || true; }

wait_then_open() {
  for _ in $(seq 1 50); do
    sleep 0.2
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then exec 3>&- ; open_url "http://localhost:$PORT/"; return; fi
  done
  open_url "http://localhost:$PORT/"
}

if command -v python3 >/dev/null 2>&1; then
  echo "Serving at http://localhost:$PORT/"
  wait_then_open &
  exec python3 serve.py "$PORT"
elif command -v node >/dev/null 2>&1; then
  echo "Serving at http://localhost:$PORT/"
  wait_then_open &
  exec node server.js "$PORT"
else
  echo "No Python/Node found - opening the online version."
  open_url "$PAGES"
fi

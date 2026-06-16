#!/usr/bin/env bash
# Antenna LOS - foolproof launcher (macOS / Linux).
# Serves the app locally and opens the browser; falls back to the online version.
set -e
PORT="${1:-8080}"
PAGES="https://noamsolomon123.github.io/antenna-los-test/"
cd "$(dirname "$0")"

open_url() { command -v xdg-open >/dev/null && xdg-open "$1" >/dev/null 2>&1 || \
             command -v open >/dev/null && open "$1" >/dev/null 2>&1 || true; }

if command -v python3 >/dev/null 2>&1; then
  echo "Serving at http://localhost:$PORT/"
  ( sleep 1; open_url "http://localhost:$PORT/" ) &
  exec python3 -m http.server "$PORT"
elif command -v node >/dev/null 2>&1; then
  echo "Serving at http://localhost:$PORT/"
  ( sleep 1; open_url "http://localhost:$PORT/" ) &
  exec node server.js "$PORT"
else
  echo "No Python/Node found - opening the online version."
  open_url "$PAGES"
fi

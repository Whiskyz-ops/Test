#!/bin/bash
# WISING demo launcher (macOS / Linux).
# Double-click this file. It starts a local web server in this folder and opens
# the dashboard in your browser. Close the Terminal window to stop the server.
cd "$(dirname "$0")" || exit 1
PORT=8099
URL="http://localhost:$PORT/index.html"
echo "Starting WISING demo at $URL"
echo "Leave this window open during the demo. Close it to stop."

# Pick whichever runtime is available.
if command -v python3 >/dev/null 2>&1; then
  ( sleep 1; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  ( sleep 1; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &
  python -m SimpleHTTPServer "$PORT"
elif command -v npx >/dev/null 2>&1; then
  ( sleep 2; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &
  npx --yes serve -l "$PORT" .
else
  echo "No python or npx found. Open dashboard-standalone.html by double-clicking instead."
  read -r -p "Press Enter to close."
fi

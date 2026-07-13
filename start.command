#!/bin/bash
# WISING demo launcher (macOS / Linux).
#
# Serves the WHOLE app — Layer 0 router, both Layer 1 intake forms, AND the
# Layer 2 Monitor — from a SINGLE web address. That single origin is what makes
# the Layer 0 -> Layer 1 -> Layer 2 data flow work: the forms and the Monitor
# share data through the browser's localStorage, which is tied to the address
# it was saved under. Serve them from two different addresses (e.g. the Monitor
# on :3000 and the forms opened by double-click) and they can't see each other's
# data — the forms look empty. This launcher guarantees one address.
#
# Double-click this file. Close the Terminal window to stop the server.
cd "$(dirname "$0")" || exit 1

PORT=8099
OUT="monitor-next/out"
URL="http://localhost:$PORT/"

# Build the single-origin bundle if it isn't there yet (first run / fresh clone).
# The build copies the root forms + engine into the bundle, so everything the
# Monitor links to is served from this one address.
if [ ! -f "$OUT/index.html" ]; then
  echo "First run: building the app bundle (this can take a minute)…"
  ( cd monitor-next \
    && { [ -d node_modules ] || npm install --no-audit --no-fund; } \
    && npm run build ) || { echo "Build failed. Is Node.js installed?"; read -r -p "Press Enter to close."; exit 1; }
fi

echo "Starting WISING at $URL"
echo "Everything (router, both forms, Monitor) is served from this ONE address."
echo "In the Monitor, pick a test profile from the dropdown, then click the"
echo "Router / India / US links up top — the forms will be populated from it."
echo "Leave this window open during the demo. Close it to stop."

# Serve the built bundle (out/) — NOT the repo root — so the Monitor's index.html
# is the landing page and the forms are its same-origin siblings.
if command -v python3 >/dev/null 2>&1; then
  ( sleep 1; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &
  ( cd "$OUT" && python3 -m http.server "$PORT" )
elif command -v python >/dev/null 2>&1; then
  ( sleep 1; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &
  ( cd "$OUT" && python -m SimpleHTTPServer "$PORT" )
elif command -v npx >/dev/null 2>&1; then
  ( sleep 2; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &
  npx --yes serve -l "$PORT" "$OUT"
else
  echo "No python or npx found. Please install Python 3, then run this again."
  read -r -p "Press Enter to close."
fi

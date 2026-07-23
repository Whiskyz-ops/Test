/* Copies the classic (fully frozen, 23 Jul 2026 — docs/DAG_MIGRATION_TRACKER.md
 * section I) engine's 7 files into lib/engine so the Next app's "Engine"
 * fallback mode has the SAME source the fuzzer/audit scripts/tests read.
 * Runs on predev/prebuild. Tolerant: if the archive isn't present (e.g. the
 * subdir is deployed alone), it keeps the existing copy.
 *
 * All 7 files (constants.js/sample-data.js/profiles.js/normalize.js/
 * computation.js/monitoring.js/conflicts.js) now live at repo-root
 * archive/engine-frozen/ — never hand-edited again, the DAG
 * (prototypes/graph-pilot/) is the sole actively-developed engine. This
 * script's own output shape is unchanged: lib/wising.js's "Engine" mode
 * still just imports ./engine/constants.js etc. and doesn't need to know
 * the source moved. */
const fs = require("fs");
const path = require("path");
const { resolveEngineFile } = require("../../scripts/engine-frozen.js");

const repoRoot = path.join(__dirname, "..", "..");
const dst = path.join(__dirname, "..", "lib", "engine");
const FILES = ["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js", "sample-data.js", "profiles.js"];

if (!fs.existsSync(path.join(repoRoot, "archive", "engine-frozen"))) {
  console.log("[sync-engine] archive/engine-frozen not found — using existing lib/engine copy.");
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });
let n = 0;
FILES.forEach((f) => {
  const from = resolveEngineFile(f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(dst, f)); n++; }
});
console.log(`[sync-engine] synced ${n} engine files → lib/engine`);

/* Also mirror the same (frozen) engine files, plus the standalone Layer 0/1
 * HTML pages, into public/ — Next.js serves public/ at the site root, so a
 * deployed monitor-next app serves /router.html, /layer1_us.html,
 * /layer1_india.html from THESE copies, not the repo-root originals.
 * Without this second copy, root-file edits silently don't reach the
 * deployed standalone pages. The frozen /engine/*.js copy is kept as a
 * harmless legacy safety net (nothing links to it anymore — router.html/
 * layer1_*.html load prototypes/graph-pilot/ directly now, see below —
 * but a stale bookmark/cached page requesting /engine/constants.js still
 * gets the correct, if frozen-by-design, content instead of a 404). */
const publicDir = path.join(__dirname, "..", "public");
const publicEngineDir = path.join(publicDir, "engine");
const HTML_FILES = ["router.html", "layer1_india.html", "layer1_us.html"];

fs.mkdirSync(publicEngineDir, { recursive: true });
let nEngine = 0;
FILES.forEach((f) => {
  const from = resolveEngineFile(f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(publicEngineDir, f)); nEngine++; }
});
let nHtml = 0;
HTML_FILES.forEach((f) => {
  const from = path.join(repoRoot, f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(publicDir, f)); nHtml++; }
});
console.log(`[sync-engine] mirrored ${nEngine} engine files + ${nHtml} HTML pages → public/`);

/* router.html/layer1_*.html now load constants.js/sample-data.js/profiles.js
 * straight from prototypes/graph-pilot/ (the DAG's own live data — see
 * their <script src="prototypes/graph-pilot/..."> tags) instead of the now-
 * frozen engine/ copies. For the public/ mirror of those HTML pages to
 * resolve that SAME relative path, the 3 files need to exist at
 * public/prototypes/graph-pilot/ too — matching the exact folder depth the
 * repo-root pages already resolve against. sync-dag.js copies the DAG's
 * computation node files into lib/dag/ for webpack bundling; this is the
 * separate, much smaller copy for direct <script src> browser consumption. */
const publicGraphPilotDir = path.join(publicDir, "prototypes", "graph-pilot");
const graphPilotDir = path.join(repoRoot, "prototypes", "graph-pilot");
const DATA_FILES = ["constants.js", "sample-data.js", "profiles.js"];
fs.mkdirSync(publicGraphPilotDir, { recursive: true });
let nData = 0;
DATA_FILES.forEach((f) => {
  const from = path.join(graphPilotDir, f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(publicGraphPilotDir, f)); nData++; }
});
console.log(`[sync-engine] mirrored ${nData} live DAG data files → public/prototypes/graph-pilot`);

/* Copies the classic engine's 7 files into lib/engine so the Next app's
 * "Engine" fallback mode and the vanilla dashboard use the SAME source.
 * Runs on predev/prebuild. Tolerant: if the root repo isn't present
 * (e.g. the subdir is deployed alone), it keeps the existing copy.
 *
 * Since the 22 Jul 2026 archival (docs/DAG_MIGRATION_TRACKER.md section I)
 * the 7 files no longer all live in one folder: constants.js/sample-data.js/
 * profiles.js are DATA, still generated mirrors at repo-root engine/;
 * normalize.js/computation.js/monitoring.js/conflicts.js are the frozen
 * LOGIC, archived to repo-root archive/engine-frozen/ (never hand-edited
 * again — the DAG is the actively-developed engine now). This script still
 * produces the same flat lib/engine/ output shape either way — only the
 * SOURCE directory per file differs — so nothing downstream of lib/engine/
 * (lib/wising.js's "Engine" mode) needs to know or care about the split. */
const fs = require("fs");
const path = require("path");
const { resolveEngineFile } = require("../../scripts/engine-frozen.js");

const repoRoot = path.join(__dirname, "..", "..");
const dst = path.join(__dirname, "..", "lib", "engine");
const FILES = ["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js", "sample-data.js", "profiles.js"];

if (!fs.existsSync(path.join(repoRoot, "engine")) && !fs.existsSync(path.join(repoRoot, "archive", "engine-frozen"))) {
  console.log("[sync-engine] root engine/archive not found — using existing lib/engine copy.");
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });
let n = 0;
FILES.forEach((f) => {
  const from = resolveEngineFile(f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(dst, f)); n++; }
});
console.log(`[sync-engine] synced ${n} engine files → lib/engine`);

/* Also mirror the same engine files, plus the standalone Layer 0/1 HTML
 * pages, into public/ — Next.js serves public/ at the site root, so a
 * deployed monitor-next app serves /router.html, /layer1_us.html,
 * /layer1_india.html, and /engine/*.js from THESE copies, not the repo-root
 * originals. Without this second copy, root-file edits (rates, fields,
 * constants) silently don't reach the deployed standalone pages. */
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

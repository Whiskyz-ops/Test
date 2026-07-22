/* Copies prototypes/graph-pilot/*-nodes.js + graph.js + constants.js/
 * profiles.js/sample-data.js (the DAG — NOT the run-*.js test harnesses,
 * which hardcode a repo-root absolute path and only make sense under Node)
 * into lib/dag, so the Next app can require() them client-side.
 *
 * constants.js/profiles.js/sample-data.js live IN prototypes/graph-pilot
 * now (docs/GAP_TRACKER.md section H.9, 21 Jul 2026 — moved out of engine/
 * so the DAG's own node files no longer reach into engine/ for anything at
 * all), so every DAG node file's require("./constants.js") is already a
 * same-directory sibling reference — copying the whole directory verbatim
 * keeps it correct with no path rewriting needed (the old version of this
 * script rewrote require("../../engine/constants.js") for exactly this
 * reason; that hack is gone along with the reference it rewrote).
 *
 * Runs on predev/prebuild. Tolerant like sync-engine: if the source dir
 * isn't present, keeps the existing copy. */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "prototypes", "graph-pilot");
const dst = path.join(__dirname, "..", "lib", "dag");

if (!fs.existsSync(src)) {
  console.log("[sync-dag] prototypes/graph-pilot not found — using existing lib/dag copy.");
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });

// analyze.js: a standalone Node-only WISING.analyze() entry point (built for
// tests/engine/run.js, no browser use) — same "only makes sense under Node"
// rationale as the run-*.js exclusion above, so it's excluded the same way.
const files = fs.readdirSync(src).filter((f) => f.endsWith(".js") && !f.startsWith("run-") && f !== "run.js" && f !== "analyze.js");
let n = 0;
files.forEach((f) => {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
  n++;
});
console.log(`[sync-dag] synced ${n} DAG files → lib/dag`);

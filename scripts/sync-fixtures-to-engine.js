#!/usr/bin/env node
/* ============================================================================
 * constants.js, profiles.js, and sample-data.js moved OUT of engine/ and
 * into prototypes/graph-pilot/ (docs/GAP_TRACKER.md section H.9, 21 Jul
 * 2026) — they're reference DATA (tax tables/rates, the 11 demo clients, the
 * default SAMPLE profile), not computation logic, and the DAG's own node
 * files needed a location for them that isn't "inside the frozen engine."
 * They're now edited in prototypes/graph-pilot/ only — never here.
 *
 * A large existing surface still expects a complete, classic 7-file
 * engine/ folder exactly where it's always been: router.html's own
 * <script src="engine/...">  tags, every run-*.js test harness's
 * ["constants", "normalize", ..., "profiles"].forEach(...) loader,
 * tests/engine/run.js, and monitor-next's OWN sync-engine.js (which copies
 * all 7 files from engine/ into lib/engine/ and public/engine/ for the
 * live product's "Engine" fallback mode). Rewriting all of that to look
 * somewhere else was a much larger, riskier change for no real benefit —
 * this script instead keeps engine/{constants,profiles,sample-data}.js
 * ALIVE as generated mirrors of their new home, so every one of those
 * consumers keeps working completely unchanged. Same "single source +
 * generated downstream copies" pattern this codebase already uses for
 * engine/ → lib/engine/ → public/engine/; this just adds one more hop
 * upstream. These 3 files in engine/ are build output now, same category
 * as lib/engine/*.js and public/engine/*.js — never hand-edit them here.
 *
 * Run manually after editing prototypes/graph-pilot/{constants,profiles,
 * sample-data}.js, or via `node scripts/sync-fixtures-to-engine.js`. Also
 * wired into monitor-next's predev/prebuild (ahead of its own
 * sync-engine.js, which needs these files present in engine/ first).
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "prototypes", "graph-pilot");
const dst = path.join(__dirname, "..", "engine");
const FILES = ["constants.js", "profiles.js", "sample-data.js"];

const HEADER = "/* GENERATED — mirrored from prototypes/graph-pilot/%FILE% by scripts/sync-fixtures-to-engine.js.\n" +
  " * Do not hand-edit this copy — edit prototypes/graph-pilot/%FILE% and re-run that script. */\n";

let n = 0;
FILES.forEach((f) => {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) { console.log(`[sync-fixtures-to-engine] SKIP ${f} — not found at prototypes/graph-pilot/${f}`); return; }
  const content = fs.readFileSync(from, "utf8");
  fs.writeFileSync(path.join(dst, f), HEADER.split("%FILE%").join(f) + content);
  n++;
});
console.log(`[sync-fixtures-to-engine] mirrored ${n} fixture files → engine/`);

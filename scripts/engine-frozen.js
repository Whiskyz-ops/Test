/* Central path resolver for the classic engine's 7 files, split across two
 * locations since the 22 Jul 2026 archival (docs/DAG_MIGRATION_TRACKER.md
 * section I): constants.js/sample-data.js/profiles.js are DATA, still live
 * generated mirrors of prototypes/graph-pilot's own canonical copies
 * (scripts/sync-fixtures-to-engine.js) — kept at engine/ unchanged, so
 * router.html/layer1_*.html's <script src="engine/..."> tags keep working
 * verbatim. normalize.js/computation.js/monitoring.js/conflicts.js are the
 * actual hand-written LOGIC, permanently frozen at archive/engine-frozen/ —
 * every consumer that needs the classic 7-file "engine" (the fuzzer's
 * oracle, the audit scripts' comparison baseline, monitor-next's Engine
 * fallback mode, tests/engine/run.js, package.json's engine:demo) resolves
 * each of the 7 filenames through resolveEngineFile() below instead of
 * assuming they all sit in one folder.
 */
"use strict";
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const LOGIC_FILES = ["normalize.js", "computation.js", "monitoring.js", "conflicts.js"];

function resolveEngineFile(filename) {
  if (LOGIC_FILES.indexOf(filename) !== -1) {
    return path.join(REPO_ROOT, "archive", "engine-frozen", filename);
  }
  return path.join(REPO_ROOT, "engine", filename);
}

module.exports = { resolveEngineFile, LOGIC_FILES, REPO_ROOT };

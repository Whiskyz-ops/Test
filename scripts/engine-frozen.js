/* Central path resolver for the classic engine's 7 files — all fully frozen
 * at archive/engine-frozen/ as of 23 Jul 2026 (docs/DAG_MIGRATION_TRACKER.md
 * section I). Every one of the 7 (constants.js, sample-data.js, profiles.js,
 * normalize.js, computation.js, monitoring.js, conflicts.js) lives there
 * permanently now, never hand-edited again — the DAG (prototypes/graph-pilot/)
 * is the sole actively-developed, operational compute path. The engine/
 * folder still exists (nothing was deleted) but nothing writes to it anymore:
 * scripts/sync-fixtures-to-engine.js, which used to regenerate constants.js/
 * sample-data.js/profiles.js into engine/, was retired the same day (its job
 * no longer exists), and router.html/layer1_*.html now load those 3 files
 * straight from prototypes/graph-pilot/ instead.
 *
 * Every consumer that needs the classic 7-file "engine" as a fixture — the
 * fuzzer's oracle, the audit scripts' comparison baseline, monitor-next's
 * Engine fallback mode, tests/engine/run.js, package.json's engine:demo —
 * resolves each of the 7 filenames through resolveEngineFile() below instead
 * of assuming a live folder.
 */
"use strict";
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");

function resolveEngineFile(filename) {
  return path.join(REPO_ROOT, "archive", "engine-frozen", filename);
}

module.exports = { resolveEngineFile, REPO_ROOT };

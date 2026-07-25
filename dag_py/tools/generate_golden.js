#!/usr/bin/env node
"use strict";
/* ============================================================================
 * Runs the frozen JS engine (archive/engine-frozen/*.js, via the existing
 * scripts/engine-frozen.js loader) over every ported fixture profile and
 * writes its full WISING.analyze() output as golden JSON.
 *
 * Golden files are checked into the repo and read by every Python domain
 * test (test_core.py, test_india.py, ...) by slicing into whichever fields
 * that domain owns — one generation covers every future phase, no
 * regeneration needed as the Python port grows, only when
 * archive/engine-frozen/** itself changes (which it is declared never to).
 *
 * Run: node dag_py/tools/generate_golden.js
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const PROFILES_DIR = path.join(__dirname, "..", "tests", "fixtures", "profiles");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "golden", "fixtures");

global.window = global;
const { resolveEngineFile } = require(path.join(REPO_ROOT, "scripts", "engine-frozen.js"));
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
const WISING = global.WISING;

fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs.readdirSync(PROFILES_DIR).filter(function (f) { return f.endsWith(".json"); });
let count = 0;
files.forEach(function (f) {
  const id = f.replace(/\.json$/, "");
  const profile = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), "utf8"));
  const r = WISING.analyze({ router: profile.router, india: profile.india, us: profile.us });
  fs.writeFileSync(path.join(OUT_DIR, id + ".json"), JSON.stringify(r, null, 2) + "\n");
  count++;
});

console.log("Wrote " + count + " golden fixtures to " + OUT_DIR);

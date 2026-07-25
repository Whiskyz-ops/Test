#!/usr/bin/env node
"use strict";
/* ============================================================================
 * One-time (rerun-when-profiles.js-changes) porter: dumps
 * prototypes/graph-pilot/profiles.js's WISING.PROFILES + WISING.SAMPLE to
 * plain JSON fixture files the Python test suite reads without any Node
 * dependency at test time.
 *
 * Run: node dag_py/tools/port_profiles.mjs
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "profiles");

global.window = global;
require(path.join(REPO_ROOT, "prototypes", "graph-pilot", "constants.js"));
require(path.join(REPO_ROOT, "prototypes", "graph-pilot", "sample-data.js"));
require(path.join(REPO_ROOT, "prototypes", "graph-pilot", "profiles.js"));

const WISING = global.WISING;
if (!WISING || !WISING.PROFILES) {
  throw new Error("profiles.js did not populate window.WISING.PROFILES");
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let count = 0;
WISING.PROFILES.forEach(function (p) {
  const outPath = path.join(OUT_DIR, p.id + ".json");
  fs.writeFileSync(outPath, JSON.stringify(p, null, 2) + "\n");
  count++;
});
if (WISING.SAMPLE) {
  fs.writeFileSync(path.join(OUT_DIR, "sample.json"), JSON.stringify(WISING.SAMPLE, null, 2) + "\n");
  count++;
}

console.log("Wrote " + count + " profile fixtures to " + OUT_DIR);

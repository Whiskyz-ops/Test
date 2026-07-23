"use strict";
/* ============================================================================
 * Verifies assets-nodes.js's assetsModelResult against production's real
 * model.assets, with the same bare ctx = {router, india, us} discipline
 * run-agg10.js established — no model, no computed supplied.
 *
 * Run against SAMPLE (the actual Demo-mode default monitor-next's Holdings/
 * Business tabs render from out of the box) plus all 11 PROFILES — SAMPLE
 * is the exact fixture whose omission from the first browser pass hid a
 * real gap once before (docs/DAG_MIGRATION_TRACKER.md), so it's included
 * here from the start, not added after the fact.
 *
 * Run: node prototypes/graph-pilot/run-assets.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./assets-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function ok() { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok();
    return bad(label, "dag=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok();
    var tol = (Math.abs(b) <= 1 && Math.abs(a) <= 1) ? 1e-6 : 2;
    if (Math.abs(a - b) <= tol) return ok();
    return bad(label, "dag=" + a + " prod=" + b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", "dag=" + a.length + " prod=" + b.length);
    for (var i = 0; i < a.length; i++) deepCheck(label + "[" + i + "]", a[i], b[i]);
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) { deepCheck(label + "." + k, a[k], b[k]); });
    return;
  }
  if (a === b) return ok();
  return bad(label, "dag=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
}

function checkOne(id, r) {
  var bareCtx = { router: r._router, india: r._india, us: r._us };
  var out = graph.resolve(["assetsModelResult"], bareCtx).values.assetsModelResult;
  var before = fail;
  deepCheck(id + " assets", out, r.model.assets);
  console.log(id + (fail === before ? "  all match" : "  FAILURES above")
    + "  (" + r.model.assets.businessEntities.length + " business entit" + (r.model.assets.businessEntities.length === 1 ? "y" : "ies") + ")");
}

console.log("assets-nodes.js: model.assets — BARE ctx {router, india, us}, no model, no computed. SAMPLE + all " + WISING.PROFILES.length + " profiles.\n");

var S = WISING.SAMPLE;
var rSample = WISING.analyze({ router: S.router, india: S.india, us: S.us });
rSample._router = S.router; rSample._india = S.india; rSample._us = S.us;
checkOne("SAMPLE", rSample);

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  r._router = p.router; r._india = p.india; r._us = p.us;
  checkOne(p.id, r);
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

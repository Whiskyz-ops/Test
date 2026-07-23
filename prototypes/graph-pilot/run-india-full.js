"use strict";
/* ============================================================================
 * Verifies india-full-nodes.js — the fully-wired India tax graph (raw
 * router/india JSON straight through to totalTaxInrCombined, no
 * ctx.model/ctx.computed boundary reads anywhere in the chain).
 *
 * ctx deliberately carries ONLY { router, india, us } — no model/computed —
 * to prove the wiring actually closed the boundary rather than silently
 * still depending on it.
 *
 * Run: node prototypes/graph-pilot/run-india-full.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./india-full-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 2); }

console.log("Verifying india-full-nodes.js (aggregateIndiaIncome physically wired into the tax graph), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  // Deliberately NOT passing model/computed — this graph must not need them.
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["totalTaxInrCombined", "regimeCombined"], ctx).values;
  var real = r.computed.indiaTax;

  console.log(p.id);
  console.log("    graph totalTaxInrCombined=₹" + Math.round(out.totalTaxInrCombined) + " | production=₹" + Math.round(real.totalTaxInr));
  check("totalTaxInrCombined matches production exactly", close(out.totalTaxInrCombined, real.totalTaxInr),
    "graph=" + Math.round(out.totalTaxInrCombined) + " prod=" + Math.round(real.totalTaxInr));
  check("regimeCombined matches production exactly", out.regimeCombined === real.regime,
    "graph=" + out.regimeCombined + " prod=" + real.regime);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

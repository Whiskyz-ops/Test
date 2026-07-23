"use strict";
/* ============================================================================
 * The actual proof of the routing wire-up: resolve ONE combined graph
 * against ALL 11 real profiles, asking only for ["totalTaxInrCombined",
 * "regimeCombined"] — no external "is this an entity?" check by the
 * caller, no picking which subgraph to run. The graph's own
 * isEntityTaxpayer node makes that decision, exactly like production's
 * computeIndiaTax does internally.
 *
 * Run: node prototypes/graph-pilot/run-india-tax-combined.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./india-tax-combined-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("One combined graph, routing gate wired in, run against all " + WISING.PROFILES.length + " real profiles — no external branching by the caller\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };

  // The only thing asked for: the two final outputs. The graph decides
  // the rest, including which of the two subgraphs actually mattered.
  var out = graph.resolve(["totalTaxInrCombined", "regimeCombined", "isEntityTaxpayer"], ctx).values;

  var realTotalTaxInr = r.computed.indiaTax.totalTaxInr;
  var realRegime = r.computed.indiaTax.regime;

  console.log(p.id + " (graph routed to: " + (out.isEntityTaxpayer ? "entity path" : "individual/HUF path") + ")");
  console.log("  graph totalTaxInr=" + Math.round(out.totalTaxInrCombined) + " regime=\"" + out.regimeCombined + "\"" +
    " | production totalTaxInr=" + Math.round(realTotalTaxInr) + " regime=\"" + realRegime + "\"");

  check("totalTaxInrCombined matches production exactly (within ₹5 rounding)", close(out.totalTaxInrCombined, realTotalTaxInr));
  check("regimeCombined matches production exactly", out.regimeCombined === realRegime);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed — across all 11 profiles, no per-profile branching by the caller");
process.exit(fail > 0 ? 1 : 0);

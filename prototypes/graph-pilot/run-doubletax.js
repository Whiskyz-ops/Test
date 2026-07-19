"use strict";
/* ============================================================================
 * Verifies doubletax-nodes.js (XBR-3, mapDoubleTaxedIncome) against all 11
 * real profiles — full parity, no boundary. ctx deliberately carries ONLY
 * { router, india, us } — no model/computed — to prove this is a genuine
 * derivation, same discipline as run-apportionment.js/run-itrform.js.
 *
 * Run: node prototypes/graph-pilot/run-doubletax.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./doubletax-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 0.5); }

console.log("Closing XBR-3 (mapDoubleTaxedIncome), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["mapDoubleTaxedIncomeResult"], ctx).values.mapDoubleTaxedIncomeResult;
  var real = r.computed.doubleTax;

  console.log(p.id);
  check("items count matches", out.items.length === real.items.length,
    "graph=" + out.items.length + " prod=" + real.items.length + " graph=" + JSON.stringify(out.items.map(function (it) { return it.label; })) + " prod=" + JSON.stringify(real.items.map(function (it) { return it.label; })));
  out.items.forEach(function (it, i) {
    var ri = real.items[i];
    if (!ri) return;
    check("items[" + i + "] (" + it.label + ") matches exactly", it.label === ri.label && close(it.indiaUsd, ri.indiaUsd) &&
      close(it.usUsd, ri.usUsd) && it.doublyTaxed === ri.doublyTaxed && it.note === ri.note,
      "graph=" + JSON.stringify(it) + " prod=" + JSON.stringify(ri));
  });
  check("totalDoublyTaxedUsd matches exactly", close(out.totalDoublyTaxedUsd, real.totalDoublyTaxedUsd),
    "graph=" + out.totalDoublyTaxedUsd + " prod=" + real.totalDoublyTaxedUsd);
  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

"use strict";
/* ============================================================================
 * Verifies ftc-nodes.js standalone against ALL 11 real profiles — every
 * field of r.computed.ftc (11 US-direction + 4 India-direction + the net),
 * not just the headline number. Boundaries read the real engine outputs
 * here, so entity and NRA profiles are asserted too (the FTC logic itself
 * is jurisdiction-path-independent; only the full-chain wiring in
 * run-xborder-full.js has to demote those profiles to report-only).
 *
 * Run: node prototypes/graph-pilot/run-ftc.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./ftc-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
// NaN-tolerant closeness: if the engine itself produces NaN for a field on
// some profile (e.g. an entity result missing a field), the port must
// reproduce that too — NaN vs NaN is parity, NaN vs number is a failure.
function close(a, b, tol) {
  if (typeof a === "number" && typeof b === "number" && isNaN(a) && isNaN(b)) return true;
  return Math.abs(a - b) <= (tol || 2);
}

var US_FIELDS = ["foreignSourceIncomeUsd", "feieExcludedUsd", "indiaTaxDisallowedUsd", "taxableIncomeUsd",
  "usIncomeTaxUsd", "indiaTaxPaidUsd", "limitFraction", "ftcLimitUsd", "ftcAllowedUsd", "carryoverUsd", "residualDoubleTaxUsd"];
var INDIA_FIELDS = ["foreignSourceIncomeUsd", "usTaxOnUsSourceUsd", "reliefCapUsd", "reliefAllowedUsd"];

console.log("FTC graph (XBR-2) vs production computeFtc — every output field, all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { model: r.model, computed: r.computed };
  var out = graph.resolve(["ftcResult"], ctx).values.ftcResult;
  var real = r.computed.ftc;

  console.log(p.id + "  (graph net double tax=$" + Math.round(out.netUnrelievedDoubleTaxUsd) +
    " | production=$" + Math.round(real.netUnrelievedDoubleTaxUsd) + ")");

  US_FIELDS.forEach(function (f) {
    check("us." + f, close(out.us[f], real.us[f], f === "limitFraction" ? 0.0001 : 2),
      "graph=" + out.us[f] + " prod=" + real.us[f]);
  });
  INDIA_FIELDS.forEach(function (f) {
    check("india." + f, close(out.india[f], real.india[f]),
      "graph=" + out.india[f] + " prod=" + real.india[f]);
  });
  check("netUnrelievedDoubleTaxUsd", close(out.netUnrelievedDoubleTaxUsd, real.netUnrelievedDoubleTaxUsd),
    "graph=" + out.netUnrelievedDoubleTaxUsd + " prod=" + real.netUnrelievedDoubleTaxUsd);
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (all 11 profiles asserted — boundaries read real engine outputs)");
process.exit(fail > 0 ? 1 : 0);

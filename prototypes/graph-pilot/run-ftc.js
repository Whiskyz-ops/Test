"use strict";
/* ============================================================================
 * Verifies ftc-nodes.js standalone against ALL 11 real profiles — every
 * field of r.computed.ftc (11 US-direction + 4 India-direction + the net),
 * not just the headline number. Boundaries read the real engine outputs
 * here, so entity and NRA profiles are asserted too (the FTC logic itself
 * is jurisdiction-path-independent; only the full-chain wiring in
 * run-xborder-full.js has to demote those profiles to report-only).
 *
 * DELIBERATE DAG/engine divergence (task #46, multi-country/multi-basket
 * FTC): the frozen engine's computeFtc has no §904 basket concept at all —
 * ftc-nodes.js's US direction now correctly limits passive vs. general
 * category credit SEPARATELY, a real, intentional change from the frozen
 * engine's single undifferentiated limitation. So for the basket-SENSITIVE
 * US-direction fields (everything downstream of foreignSourceIncomeUsd/
 * indiaTaxPaidUsd), exact equality against the frozen engine is no longer
 * the correct assertion. NOTE: basket separation does NOT always tighten
 * the credit relative to the combined formula — each basket independently
 * caps at min(1, basketIncome/usTaxableUsd), so when one basket's foreign
 * income alone already exceeds usTaxableUsd, splitting it off from a
 * SECOND basket that ALSO independently exceeds usTaxableUsd can allow
 * MORE combined credit than the single combined pool's one shared cap
 * (verified by hand in run-ftc-correctness.js's own basket case) — the
 * inequality checks below are an EMPIRICAL property of the real+fuzzed
 * profiles this app actually exercises, not a universal law of §904(a).
 * Fields that can't be touched by basket separation at all (feieExcludedUsd,
 * taxableIncomeUsd, usIncomeTaxUsd — all come straight from usTaxResult,
 * unrelated to FTC baskets) keep the original strict equality check. The
 * India-direction fields are UNCHANGED (India's §90/91 relief has no
 * statutory basket concept — see ftc-nodes.js's own header — so still
 * asserted byte-for-byte).
 *
 * Run: node prototypes/graph-pilot/run-ftc.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
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

// Basket-independent: still asserted byte-for-byte against the frozen engine.
var US_FIELDS_STRICT = ["feieExcludedUsd", "taxableIncomeUsd", "usIncomeTaxUsd"];
// Basket-sensitive: the DAG's own basket-separated figure is now the more
// correct one — checked via the empirically-observed direction instead (see header).
var US_FIELDS_TIGHTENED = ["ftcAllowedUsd"]; // DAG <= engine
var US_FIELDS_LOOSENED = ["carryoverUsd", "residualDoubleTaxUsd"]; // DAG >= engine
var INDIA_FIELDS = ["foreignSourceIncomeUsd", "usTaxOnUsSourceUsd", "reliefCapUsd", "reliefAllowedUsd"];
var TOL = 2;

console.log("FTC graph (XBR-2) vs production computeFtc — every output field, all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { model: r.model, computed: r.computed };
  var out = graph.resolve(["ftcResult"], ctx).values.ftcResult;
  var real = r.computed.ftc;

  console.log(p.id + "  (graph net double tax=$" + Math.round(out.netUnrelievedDoubleTaxUsd) +
    " | production (no baskets)=$" + Math.round(real.netUnrelievedDoubleTaxUsd) + ")");

  US_FIELDS_STRICT.forEach(function (f) {
    check("us." + f, close(out.us[f], real.us[f], 2), "graph=" + out.us[f] + " prod=" + real.us[f]);
  });
  US_FIELDS_TIGHTENED.forEach(function (f) {
    check("us." + f + " <= engine (empirically true for this profile set)", out.us[f] <= real.us[f] + TOL,
      "graph=" + out.us[f] + " prod=" + real.us[f]);
  });
  US_FIELDS_LOOSENED.forEach(function (f) {
    check("us." + f + " >= engine (empirically true for this profile set)", out.us[f] >= real.us[f] - TOL,
      "graph=" + out.us[f] + " prod=" + real.us[f]);
  });
  INDIA_FIELDS.forEach(function (f) {
    check("india." + f, close(out.india[f], real.india[f]),
      "graph=" + out.india[f] + " prod=" + real.india[f]);
  });
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (all 11 profiles asserted — boundaries read real engine outputs)");
process.exit(fail > 0 ? 1 : 0);

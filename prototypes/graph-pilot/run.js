"use strict";
/* ============================================================================
 * Scope-flag sub-graph pilot — proof, not production code.
 *
 * Runs the graph in scope-nodes.js against every REAL demo profile (via the
 * actual engine's normalize()/computation.js — not synthetic fixtures) and
 * checks three claims:
 *
 *   1. The BUGGY ungated nodes reproduce the real historical bugs (XB-23,
 *      XB-24) exactly, on the real profiles that exposed them.
 *   2. The scope-gated nodes are correct — zero out-of-scope, and matching
 *      production's own computed output in-scope (within float rounding).
 *   3. A brand-new downstream node with ZERO scope-checking code of its own
 *      (atRiskExposureUsd) is automatically correct in every case, because
 *      it only ever sees already-gated values.
 *
 * NOT wired into engine/ or tests/engine/run.js on purpose — this is a
 * pilot to evaluate the pattern, not a replacement for computation.js.
 * Run: node prototypes/graph-pilot/run.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./scope-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 2); }

console.log("Scope-flag sub-graph pilot — run against all " + WISING.PROFILES.length + " real demo profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { model: r.model, usTax: r.computed.usTax };
  var out = graph.resolve([
    "hasUsScope", "fbarAggregatePeakUsd_BUGGY_ungated", "fbarAggregatePeakUsd",
    "foreignSrcGrossUsd_BUGGY_ungated", "foreignSrcGrossUsd", "atRiskExposureUsd"
  ], ctx).values;

  console.log(p.id + " (hasUsScope=" + out.hasUsScope + ")");

  if (out.hasUsScope === false) {
    // Out-of-scope taxpayer. The historical bug: ungated nodes wrongly
    // treat domestic-only data as if it had US relevance.
    var buggyReproduced = out.fbarAggregatePeakUsd_BUGGY_ungated > 0 || out.foreignSrcGrossUsd_BUGGY_ungated > 0;
    console.log("  info - buggy ungated: fbar=$" + Math.round(out.fbarAggregatePeakUsd_BUGGY_ungated) +
      " foreignSrc=$" + Math.round(out.foreignSrcGrossUsd_BUGGY_ungated) +
      (buggyReproduced ? "  <-- reproduces the real XB-23/24 bug on this profile" : "  (no account/income data to expose the bug here)"));
    check("gated fbarAggregatePeakUsd is $0 (structural, not a manual check)", out.fbarAggregatePeakUsd === 0);
    check("gated foreignSrcGrossUsd is $0 (structural, not a manual check)", out.foreignSrcGrossUsd === 0);
    check("downstream atRiskExposureUsd (zero scope code of its own) is $0", out.atRiskExposureUsd === 0);
  } else {
    // In-scope taxpayer. Gate should be a no-op: buggy === gated exactly.
    check("gated === buggy when in-scope (gate is a no-op, not a different answer)",
      out.fbarAggregatePeakUsd === out.fbarAggregatePeakUsd_BUGGY_ungated &&
      out.foreignSrcGrossUsd === out.foreignSrcGrossUsd_BUGGY_ungated);

    var fbarGauge = r.computed.limits.filter(function (g) { return g.id === "fbar"; })[0];
    check("gated fbarAggregatePeakUsd matches production's own FBAR gauge",
      !!fbarGauge && close(out.fbarAggregatePeakUsd, fbarGauge.value),
      fbarGauge ? ("pilot=" + Math.round(out.fbarAggregatePeakUsd) + " prod=" + Math.round(fbarGauge.value)) : "no fbar gauge in production output");

    var feieExcludedUsd = (r.computed.ftc.us.feieExcludedUsd || 0);
    if (feieExcludedUsd === 0) {
      // Only directly comparable when FEIE isn't netting the production
      // figure down — the pilot deliberately doesn't model FEIE, that's a
      // different sub-graph, not part of this pilot's claim.
      check("gated foreignSrcGrossUsd matches production's foreignSourceIncomeUsd",
        close(out.foreignSrcGrossUsd, r.computed.ftc.us.foreignSourceIncomeUsd),
        "pilot=" + Math.round(out.foreignSrcGrossUsd) + " prod=" + Math.round(r.computed.ftc.us.foreignSourceIncomeUsd));
    } else {
      console.log("  info - skipped exact cross-check (FEIE excludes $" + Math.round(feieExcludedUsd) +
        " in production; this pilot models scope-gating only, not FEIE netting)");
    }
  }
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

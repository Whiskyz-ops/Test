"use strict";
/* ============================================================================
 * "Going wider": 3 more findings, each chosen to test something Phase 1
 * (india_advance_tax_interest) didn't:
 *   - underpayment_2210 (US-1): the OTHER scope flag (hasUsScope), a
 *     genuinely different shape (OR of two safe harbors, not AND of tests).
 *   - early_withdrawal_penalty_72t (US-5): deliberately simple, contrasts
 *     the two multi-branch findings above.
 *   - black_money_act_exposure (XB-7): scopeGate applied to an ARBITRARY
 *     derived boolean (scheduleFaInconsistentTrigger), not one of the two
 *     canonical meta flags — and a node explicitly built to be SHARED with
 *     another finding (schedule_fa_inconsistent) rather than re-derived.
 *
 * Same rule as Phase 1: not wired into engine/ or tests/engine/run.js.
 * Run: node prototypes/graph-pilot/run-batch2.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;

var us1Graph = createGraph(require("./us1-nodes.js").NODES);
var us5Graph = createGraph(require("./us5-nodes.js").NODES);
var xb7Graph = createGraph(require("./xb7-nodes.js").NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 3); }
function findingOf(findings, id) { return (findings || []).filter(function (f) { return f.id === id; })[0]; }

console.log("Batch 2: 3 more findings as real graphs, run against all " + WISING.PROFILES.length + " real profiles\n");
var dualScopeMismatches = 0;

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  console.log(p.id);

  // ---- US-1 ----
  var us1 = us1Graph.resolve(["hasUsScope", "shouldFire", "us2210PenaltyUsd"], ctx).values;
  var realUs1 = findingOf(r.findings, "underpayment_2210");
  console.log("  underpayment_2210: graph fire=" + us1.shouldFire + " penalty=$" + Math.round(us1.us2210PenaltyUsd) +
    " | prod fire=" + (!!realUs1) + " amount=$" + Math.round(realUs1 ? realUs1.amountUsd : 0));
  check("US-1 shouldFire matches production", us1.shouldFire === !!realUs1);
  check("US-1 penalty amount matches production", close(us1.us2210PenaltyUsd, realUs1 ? realUs1.amountUsd : 0));

  // ---- US-5 ----
  var us5 = us5Graph.resolve(["hasUsScope", "shouldFire", "penalty72tUsd"], ctx).values;
  var realUs5 = findingOf(r.findings, "early_withdrawal_penalty_72t");
  console.log("  early_withdrawal_penalty_72t: graph fire=" + us5.shouldFire + " penalty=$" + Math.round(us5.penalty72tUsd) +
    " | prod fire=" + (!!realUs5) + " amount=$" + Math.round(realUs5 ? realUs5.amountUsd : 0));
  check("US-5 shouldFire matches production", us5.shouldFire === !!realUs5);
  check("US-5 penalty amount matches production", close(us5.penalty72tUsd, realUs5 ? realUs5.amountUsd : 0));

  // ---- XB-7 ----
  var xb7 = xb7Graph.resolve(["hasIndiaScope", "hasUsScope", "scheduleFaInconsistentTrigger", "shouldFire", "bmaMaxTotalUsd"], ctx).values;
  var realXb7 = findingOf(r.findings, "black_money_act_exposure");
  var realFaInconsistent = findingOf(r.findings, "schedule_fa_inconsistent");
  console.log("  black_money_act_exposure: graph fire=" + xb7.shouldFire + " maxExposure=$" + Math.round(xb7.bmaMaxTotalUsd) +
    " | prod fire=" + (!!realXb7) + " amount=$" + Math.round(realXb7 ? realXb7.amountUsd : 0));
  check("XB-7 shouldFire matches production", xb7.shouldFire === !!realXb7);
  check("XB-7 max exposure matches production", close(xb7.bmaMaxTotalUsd, realXb7 ? realXb7.amountUsd : 0));
  check("shared scheduleFaInconsistentTrigger matches production's independent schedule_fa_inconsistent finding",
    xb7.scheduleFaInconsistentTrigger === !!realFaInconsistent);

  if (xb7.scheduleFaInconsistentTrigger && !(xb7.hasIndiaScope && xb7.hasUsScope)) {
    dualScopeMismatches++;
    console.log("    info - XB-7 fired WITHOUT both meta scope flags true (hasIndiaScope=" + xb7.hasIndiaScope + " hasUsScope=" + xb7.hasUsScope + ") — worth a closer look");
  }
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
console.log(dualScopeMismatches === 0
  ? "Empirical check: XB-7 never fired without both hasIndiaScope && hasUsScope also true across all 11 profiles."
  : dualScopeMismatches + " profile(s) had XB-7 fire without both meta scope flags true — see 'info' lines above.");
process.exit(fail > 0 ? 1 : 0);

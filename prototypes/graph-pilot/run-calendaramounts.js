"use strict";
/* ============================================================================
 * Verifies calendar-amounts-nodes.js's calendarAmountsResult — CL-2, DAG-only,
 * no engine equivalent to differential-test against (see that file's own
 * header). Two invariants, across all 12 real fixtures (SAMPLE + 11
 * PROFILES):
 *
 *   1. RECONSTRUCTION: each installment's amountDueInr/amountDueUsd, fed back
 *      through the EXACT interest/penalty formula in1-nodes.js's s425Inr and
 *      us1-nodes.js's us2210PenaltyUsd already use per quarter, must sum to
 *      those two nodes' own already-verified totals. This is the load-bearing
 *      check: it proves the new per-installment breakdown is the SAME
 *      arithmetic the retrospective (already fuzz-verified) finding uses,
 *      not a plausible-looking reimplementation that quietly diverges.
 *   2. GATING: india.installments is empty exactly when inAdvTaxObliged is
 *      false (no ₹ figure implies an obligation that doesn't exist); India
 *      is the presumptive single-installment shape exactly when
 *      inPurelyPresumptive; US always carries 4 installments when
 *      hasUsScope.
 *
 * Run: node prototypes/graph-pilot/run-calendaramounts.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./calendar-amounts-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function ok() { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function close(a, b) { return Math.abs(a - b) < 0.5; }

var FIXTURES = [{ id: "SAMPLE", router: WISING.SAMPLE.router, india: WISING.SAMPLE.india, us: WISING.SAMPLE.us }]
  .concat(WISING.PROFILES.map(function (p) { return { id: p.id, router: p.router, india: p.india, us: p.us }; }));

FIXTURES.forEach(function (fx) {
  var ctx = { router: fx.router, india: fx.india, us: fx.us };
  var out = graph.resolve([
    "calendarAmountsResult", "s425Inr", "us2210PenaltyUsd",
    "hasIndiaScope", "hasUsScope", "inAdvTaxObliged", "inPurelyPresumptive", "usTaxResult"
  ], ctx).values;
  var ca = out.calendarAmountsResult;
  // US entity: DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md
  // section H, 21 Jul 2026) — a corporation's estimated tax is §6655, a
  // distinct regime this engine doesn't model; us1-nodes.js's §6654
  // structure calendarAmountsResult reuses doesn't apply, so installments
  // is [] for a US entity, same "no obligation shown is more correct than
  // the wrong regime's number" choice as India's inAdvTaxObliged gate.
  var usEntityCal = out.usTaxResult.isEntity;

  // ---- gating -------------------------------------------------------------
  var expectObliged = out.hasIndiaScope && out.inAdvTaxObliged;
  if (ca.india.obliged === expectObliged) ok(); else bad(fx.id + ": india.obliged mismatch", ca.india.obliged + " vs " + expectObliged);
  if (!expectObliged) {
    if (ca.india.installments.length === 0) ok(); else bad(fx.id + ": not-obliged but installments non-empty");
  } else if (out.inPurelyPresumptive) {
    if (ca.india.installments.length === 1 && ca.india.installments[0].quarter === "single") ok();
    else bad(fx.id + ": expected single presumptive installment", JSON.stringify(ca.india.installments));
  } else {
    if (ca.india.installments.length === 4) ok(); else bad(fx.id + ": expected 4 India installments", ca.india.installments.length);
  }
  if (out.hasUsScope && !usEntityCal) {
    if (ca.us.installments.length === 4) ok(); else bad(fx.id + ": expected 4 US installments", ca.us.installments.length);
  } else {
    if (ca.us.installments.length === 0) ok(); else bad(fx.id + ": !hasUsScope/US-entity but US installments non-empty");
  }

  // ---- reconstruction: India (s425Inr) -------------------------------------
  if (expectObliged) {
    var monthsByQ = out.inPurelyPresumptive ? { single: 1 } : { 1: 3, 2: 3, 3: 3, 4: 1 };
    var reconstructedS425 = ca.india.installments.reduce(function (sum, ins) {
      return sum + ins.amountDueInr * 0.01 * monthsByQ[ins.quarter];
    }, 0);
    if (close(reconstructedS425, out.s425Inr)) ok();
    else bad(fx.id + ": India reconstruction != s425Inr", reconstructedS425 + " vs " + out.s425Inr);
  }

  // ---- reconstruction: US (us2210PenaltyUsd) -------------------------------
  if (out.hasUsScope && !usEntityCal) {
    var rate = { 1: 0.07, 2: 0.06, 3: 0.07, 4: 0.07 };
    var monthsRemaining = { 1: 12, 2: 10, 3: 7, 4: 3 };
    var reconstructedUs2210 = ca.us.installments.reduce(function (sum, ins) {
      return sum + ins.amountDueUsd * rate[ins.quarter] * (monthsRemaining[ins.quarter] / 12);
    }, 0);
    if (close(reconstructedUs2210, out.us2210PenaltyUsd)) ok();
    else bad(fx.id + ": US reconstruction != us2210PenaltyUsd", reconstructedUs2210 + " vs " + out.us2210PenaltyUsd);
  }
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

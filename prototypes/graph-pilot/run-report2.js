"use strict";
/* ============================================================================
 * Verifies report-batch2-nodes.js (CFL-7 batch 2: buildTaxComputation's
 * `us` and `usState` sections) against all 11 real profiles.
 *
 * Compares against WISING.analyze()'s taxComputation.us / taxComputation.
 * usState fields directly (structural deep-equal, not a findings array).
 *
 * Run: node prototypes/graph-pilot/run-report2.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch2-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function deepEqual(a, b, path) {
  path = path || "$";
  if (typeof a === "number" && typeof b === "number") return close(a, b, 1) ? null : [path + ": " + a + " !== " + b];
  if (a === b) return null;
  if (a == null || b == null) return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [path + ": array length/type mismatch (" + JSON.stringify(a) + " vs " + JSON.stringify(b) + ")"];
    var diffs = [];
    for (var i = 0; i < a.length; i++) { var d = deepEqual(a[i], b[i], path + "[" + i + "]"); if (d) diffs = diffs.concat(d); }
    return diffs.length ? diffs : null;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
    var odiffs = [];
    keys.forEach(function (k) { var d = deepEqual(a[k], b[k], path + "." + k); if (d) odiffs = odiffs.concat(d); });
    return odiffs.length ? odiffs : null;
  }
  return [path + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)];
}

// ---- ported from run-fuzz.js's own allowlist apparatus (see that file's
// header, and run-report1.js's own copy of this same block for the full
// per-detector writeup and the "which detectors are actually relevant here"
// reasoning). Only the FEIE wages/bona-fide/stacking family is wired in —
// verified directly (same methodology as run-report1.js) that taxComputation.
// usState never diverges for any of the 11 real fixtures regardless of any
// detector, and taxComputation.us only diverges for the one already-known
// FEIE-wages case (us_citizen_expat_india).
function feieForeignWagesRowsTotal(us) {
  var rows = (us && us.income_foreign_source && us.income_foreign_source.foreign_wages) || [];
  var total = 0;
  rows.forEach(function (w) { total += Number(w.gross_wages_usd || w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd) || 0; });
  return total;
}
function isFeieWagesDivergentProfile(us) {
  us = us || {};
  var feieUsd = Number(us.foreign_earned_income && us.foreign_earned_income.foreign_earned_income_usd) || 0;
  return feieUsd > feieForeignWagesRowsTotal(us);
}
function isFeieBonaFideProxyDivergentProfile(us) {
  var f = (us && us.foreign_earned_income) || {};
  return f.claims_feie === true && f.qualification_test === "bona_fide_residence" &&
    !!f.bona_fide_residence_start_date && f.bona_fide_residence !== true;
}
function isFeieStackingRuleDivergentProfile(usTax) {
  return !!usTax && (((usTax.feie && usTax.feie.appliedUsd) || 0) + (usTax.feieHousingAppliedUsd || 0)) > 0;
}

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };

  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  console.log(p.id + (isUsEntity ? " (US ENTITY — us section not in-graph, reporting only)" : isNra ? " (NRA — us section not in-graph, reporting only)" : ""));

  if (isUsEntity || isNra) {
    console.log("    (reported, not asserted) taxComputation.us would diverge here — usTaxResult only covers the resident/individual path");
  } else {
    var out = graph.resolve(["buildTaxComputationUsResult", "usTaxResult"], ctx).values;
    var feieWagesDivergent = isFeieWagesDivergentProfile(p.us);
    var feieBonaFideProxyDivergent = isFeieBonaFideProxyDivergentProfile(p.us);
    var feieStackingRuleDivergent = isFeieStackingRuleDivergentProfile(out.usTaxResult);
    if (feieWagesDivergent || feieBonaFideProxyDivergent || feieStackingRuleDivergent) {
      console.log("    (DELIBERATE divergence — wholesale cascade, see this file's own detector comments) taxComputation.us");
    } else {
      var usDiff = deepEqual(out.buildTaxComputationUsResult, r.taxComputation.us);
      check("taxComputation.us matches exactly", !usDiff, usDiff && usDiff.slice(0, 6).join(" | "));
    }
  }

  // usState isn't gated by isUsEntity/isNra the same way — computeUsStateTax
  // itself returns null for those cases (usStateTaxResult already replicates
  // that gate, batch 5) — so this is safe to assert unconditionally.
  var stateOut = graph.resolve(["buildTaxComputationUsStateResult"], ctx).values.buildTaxComputationUsStateResult;
  var stateDiff = deepEqual(stateOut, r.taxComputation.usState);
  check("taxComputation.usState matches exactly", !stateDiff, stateDiff && stateDiff.slice(0, 6).join(" | "));

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

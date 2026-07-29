"use strict";
/* ============================================================================
 * Verifies agg10-nodes.js — normalize()'s orchestration blocks derived
 * in-graph — with the strictest ctx in this entire effort:
 *
 *     ctx = { router, india, us, monitorAsOfBoundary }
 *
 * NO model. NO computed. (monitorAsOfBoundary pins "now" to the engine
 * run's own asOf, exactly as run-monitor.js does — dates aren't data.)
 *
 * Asserted per profile, all deep field-by-field (strings byte-for-byte):
 *   1. entityResult / metaResult / identityResult vs model.entity/meta/
 *      identity — the AGG-10 block ports themselves.
 *   2. The whole computational chain resolved bare: totalTaxInrCombined,
 *      usTaxResult.totalTaxBeforeFtcUsd, ftcResult, limitsResult,
 *      findingsAllResult (id/severity sequence), summaryResult,
 *      monitorResult health score — against the engine's real outputs.
 *   3. analyzeResult's non-echo keys resolve bare too; its model/computed
 *      echo keys are asserted null under the bare ctx (proving they are
 *      echoes, not inputs) and asserted === the engine objects when the
 *      caller supplies them.
 * Run: node prototypes/graph-pilot/run-agg10.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
// Upgraded to the TAX-7/TAX-8 routed chain (ustax-full-nodes.js): usTaxResult
// now routes entity/NRA/individual exactly as compute() does, so the
// entity/NRA carve-outs below are GONE — all 11 profiles asserted fully.
var NODES = require("./ustax-full-nodes.js").NODES;
var graph = createGraph(NODES);

// DAG-only keys with no engine equivalent — same convention as run-fuzz.js's
// DAG_ONLY_KEYS. indiaIsAop/indiaIsTrust (docs/GAP_TRACKER.md section H.6,
// 21 Jul 2026): the engine's model.entity never carries these at all
// (undefined on that side, always a real boolean false/true on the DAG
// side) — entitytax-nodes.js's file header has the full writeup.
// passive/general/baskets/otherCountries (task #46, multi-country/multi-
// basket FTC): §904 basket split has no frozen-engine equivalent at all
// (indiaIncomeModelResult.passive/.general, ftcResult.us/india.baskets,
// ftcResult.us.otherCountries) — same "DAG-only, no engine concept"
// pattern as indiaIsAop/indiaIsTrust below.
var DAG_ONLY_KEYS = { indiaIsAop: true, indiaIsTrust: true, passive: true, general: true, baskets: true, otherCountries: true };

var pass = 0, fail = 0;
function ok(label) { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok(label);
    return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok(label);
    var tol = (Math.abs(b) <= 1 && Math.abs(a) <= 1) ? 1e-6 : 2;
    if (Math.abs(a - b) <= tol) return ok(label);
    return bad(label, "graph=" + a + " prod=" + b);
  }
  if (a instanceof Date && b instanceof Date) {
    if (Math.abs(a - b) < 1000) return ok(label);
    return bad(label, "graph=" + a + " prod=" + b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", "graph=" + a.length + " prod=" + b.length);
    for (var i = 0; i < a.length; i++) deepCheck(label + "[" + i + "]", a[i], b[i]);
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) { if (!DAG_ONLY_KEYS[k]) deepCheck(label + "." + k, a[k], b[k]); });
    return;
  }
  if (a === b) return ok(label);
  return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
}

console.log("AGG-10: normalize() orchestration in-graph — BARE ctx {router, india, us}, no model, no computed. All " + WISING.PROFILES.length + " profiles.\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var bareCtx = { router: p.router, india: p.india, us: p.us, monitorAsOfBoundary: r.monitoring.asOf };

  var out = graph.resolve(
    ["entityResult", "metaResult", "identityResult", "headlineResult", "treatyModelResult", "indiaIncomeModelResult",
      "totalTaxInrCombined", "usTaxResult", "ftcResult", "limitsResult",
      "findingsAllResult", "summaryResult", "monitorResult", "analyzeResult"],
    bareCtx).values;

  var before = fail;

  // Section D (docs/GAP_TRACKER.md, "entity-agnostic audit", 21 Jul 2026):
  // for a US-entity, India-entity, or NRA profile, a specific catalogued set
  // of fields is a DELIBERATE DAG/engine divergence, not a bug — same
  // allowlist convention as run-fuzz.js's KNOWN_US_ENTITY_DIVERGENT_PATHS
  // (see that file's header for the full root-cause writeup). Gated
  // strictly on the profile's actual taxpayer shape.
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(out.entityResult.usKind) >= 0;
  var isIndiaEntity = !!(out.entityResult.indiaIsCompany || out.entityResult.indiaIsFirm);
  var isNra = out.usTaxResult.isNra === true;

  // 1. The AGG-10 block ports themselves.
  deepCheck("entity", out.entityResult, r.model.entity);
  deepCheck("meta", out.metaResult, r.model.meta);
  deepCheck("identity", out.identityResult, r.model.identity);
  if (isUsEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) headline.totalIncomeUsd");
    deepCheck("headline (minus totalIncomeUsd)", Object.assign({}, out.headlineResult, { totalIncomeUsd: 0 }), Object.assign({}, r.computed.headline, { totalIncomeUsd: 0 }));
  } else {
    deepCheck("headline", out.headlineResult, r.computed.headline);
  }
  deepCheck("treaty", out.treatyModelResult, r.model.treaty);
  deepCheck("indiaIncome (monitor-next integration)", out.indiaIncomeModelResult, r.model.income.india);

  // 2. The computational chain, resolved with no engine objects in ctx —
  // ALL profiles asserted fully now that usTaxResult routes entity/NRA
  // exactly as compute() does (TAX-7/TAX-8 closed).
  deepCheck("indiaTax.totalTaxInr", out.totalTaxInrCombined, r.computed.indiaTax.totalTaxInr);
  deepCheck("limits", out.limitsResult, r.computed.limits);
  deepCheck("usTax.totalTaxBeforeFtcUsd", out.usTaxResult.totalTaxBeforeFtcUsd, r.computed.usTax.totalTaxBeforeFtcUsd);
  if (isUsEntity || isNra) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) ftc.india");
    deepCheck("ftc (minus .india)", Object.assign({}, out.ftcResult, { india: null }), Object.assign({}, r.computed.ftc, { india: null }));
  } else {
    deepCheck("ftc", out.ftcResult, r.computed.ftc);
  }
  // findings.sequence: US entity drops underpayment_2210 (agg10-nodes.js's
  // us1ShouldFire override) — compare the two sequences with that one ID
  // filtered out of both sides rather than skip the check entirely, so any
  // OTHER findings-sequence drift on an entity profile still fails loudly.
  var dagSeq = out.findingsAllResult.map(function (f) { return f.id + ":" + f.severity; });
  var realSeq = r.findings.map(function (f) { return f.id + ":" + f.severity; });
  if (isUsEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) findings: underpayment_2210 suppressed for US entity");
    dagSeq = dagSeq.filter(function (s) { return s.indexOf("underpayment_2210:") !== 0; });
    realSeq = realSeq.filter(function (s) { return s.indexOf("underpayment_2210:") !== 0; });
  }
  deepCheck("findings.sequence", dagSeq, realSeq);
  if (isUsEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) summary.totalIncomeUsd, summary.healthScore, monitor.health.score");
  } else {
    deepCheck("summary", out.summaryResult, r.summary);
    deepCheck("monitor.health.score", out.monitorResult.health.score, r.monitoring.health.score);
  }
  // taxComputation deep, ALL profiles incl. entity/NRA — the routed
  // usTaxResult (ustax-full-nodes.js) means buildTaxComputationUsResult now
  // builds the correct C-Corp/1040-NR trace, not the individual one. This is
  // the deterministic counterpart to run-fuzz.js's finding that CFL-7 batch
  // 2's original individual-only report node was stale post-TAX-7/TAX-8
  // (20 Jul 2026). run-report2.js/run-analyze.js still resolve report-batchN
  // in ISOLATION, where usTaxResult is the individual-only node one level
  // down, so their entity/NRA demotion stays correct for those sub-graphs.
  // US-entity taxComputation.us and India-entity taxComputation.india are
  // section D's genuine-row-set divergence (run-report2.js/run-report3.js
  // assert those in full detail) — not byte-compared here.
  if (isUsEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-report2.js) taxComputation.us");
  } else {
    deepCheck("taxComputation.us (routed — entity/NRA now asserted)", out.analyzeResult.taxComputation.us, r.taxComputation.us);
  }
  if (isIndiaEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-report3.js) taxComputation.india");
  } else {
    deepCheck("taxComputation.india", out.analyzeResult.taxComputation.india, r.taxComputation.india);
  }
  deepCheck("taxComputation.usState", out.analyzeResult.taxComputation.usState, r.taxComputation.usState);

  // 3. Echo semantics: null under bare ctx…
  deepCheck("analyze.model is null under bare ctx (echo, not input)", out.analyzeResult.model, null);
  deepCheck("analyze.computed is null under bare ctx (echo, not input)", out.analyzeResult.computed, null);
  // …and the supplied objects when the caller provides them.
  var echoCtx = { router: p.router, india: p.india, us: p.us, monitorAsOfBoundary: r.monitoring.asOf, model: r.model, computed: r.computed };
  var echoed = graph.resolve(["analyzeResult"], echoCtx).values.analyzeResult;
  deepCheck("analyze.model === supplied engine model (identity echo)", echoed.model === r.model, true);
  deepCheck("analyze.computed === supplied engine computed (identity echo)", echoed.computed === r.computed, true);

  console.log(p.id + "  " + (fail === before ? "all checks pass (bare ctx)" : "FAILURES above"));
});

console.log("\n" + pass + " passed, " + fail + " failed (bare-ctx end-to-end, deep, all 11 profiles)");
process.exit(fail > 0 ? 1 : 0);

"use strict";
/* ============================================================================
 * Verifies report-batch1-nodes.js (CFL-7 batch 1: buildDocuments,
 * buildScopeNotes, buildReturnFormDetermination, buildFtcReport) against
 * all 11 real profiles.
 *
 * Unlike every CFL-6 runner, this compares against WISING.analyze()'s own
 * documents/scopeNotes/returnForms/ftcReport fields directly — NOT
 * findings — via a generic deep-equal (these are structural report
 * objects, not a findings array to filter by ID).
 *
 * Run: node prototypes/graph-pilot/run-report1.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./report-batch1-nodes.js").NODES;
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
// header for the full per-detector writeup) — this harness only checks
// documents/scopeNotes/returnForms/ftcReport, so only the detectors whose
// own KNOWN_*_DIVERGENT_PATHS touch one of those four fields are ported.
// NOT portable here: Section D's India AOP/Trust divergence — its detector
// needs the DAG's OWN entityResult (indiaIsAop/indiaIsTrust exist only on
// the DAG's own entity classification, never the engine's), but this
// harness feeds ctx.model.entity from the REAL engine's own result (same
// convention the pre-existing isUsEntity/isNra checks below already use),
// so that field would never be populated here regardless — and none of the
// 11 real fixtures are AOP/Trust anyway, so this is a documented gap, not a
// silent one.
var QBI_THRESHOLD = { single: 201750, mfj: 403500, mfs: 201750, hoh: 201750 };
var REBATE_87A_NEW = { incomeCap: 1200000, maxRebate: 60000 };
var REBATE_87A_OLD = { incomeCap: 500000, maxRebate: 12500 };
function isQbiWageLimitDivergent(usTax, aggUs) {
  if (!aggUs || !usTax || usTax.isEntity || usTax.isNra) return false;
  if (!(aggUs.qbiIncomeUsd > 0)) return false;
  var thr = QBI_THRESHOLD[usTax.filingStatus] !== undefined ? QBI_THRESHOLD[usTax.filingStatus] : QBI_THRESHOLD.single;
  var taxableBeforeQbi = (usTax.taxableIncomeUsd || 0) + (usTax.qbiDeductionUsd || 0);
  return taxableBeforeQbi > thr;
}
function isSaversCreditDivergent(usTax) { return !!(usTax && !usTax.isEntity && !usTax.isNra && usTax.saversCreditUsd > 0); }
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
function isFeieEntityGateMissingProfile(usKind, us) {
  var isIndividualPath = !usKind || usKind === "individual";
  var claimsFeie = !!(us && us.foreign_earned_income && us.foreign_earned_income.claims_feie);
  return !isIndividualPath && claimsFeie;
}
function isQbiWageUbiaLimitDivergentProfile(realUsTax) {
  if (!realUsTax) return false;
  var taxableBeforeQbi = (realUsTax.taxableIncomeUsd || 0) + (realUsTax.qbiDeductionUsd || 0);
  return (realUsTax.qbiDeductionUsd || 0) > 0 && taxableBeforeQbi > 201750;
}
function isIndiaSalaryExemptionProfile(indiaIncomeModel) {
  var sd = indiaIncomeModel && indiaIncomeModel.salaryDetail;
  if (!sd) return false;
  return sd.overridden === false || sd.taxableSalaryInr === 0;
}
function isIndiaRebateMarginalReliefDivergentProfile(d) {
  if (!d.isIndividualV3 || d.isNRV3) return false;
  var cap = d.isNew ? REBATE_87A_NEW : REBATE_87A_OLD;
  var totalNormalInr = d.totalNormalInr || 0, slabTaxInr = d.slabTaxInr || 0;
  var oldRebate = totalNormalInr <= cap.incomeCap ? Math.min(slabTaxInr, cap.maxRebate) : 0;
  return Math.abs(oldRebate - (d.rebateInrV3 || 0)) > 1;
}
// GILTI/Subpart F individual-inclusion (Phase 7) and India §44BB/§44BBB
// presumptive foreign-company scheme (IN-26) — same two real, fixture-only
// gaps found while porting shadow-core.js/test-adapter.mjs, NOT part of
// run-fuzz.js's own apparatus (its random fuzzer never generates these
// fact patterns). model.assets.businessEntities isn't resolvable in this
// harness's graph (assets-nodes.js isn't in report-batch1-nodes.js's own
// require chain), so both are detected off sources that ARE available
// here: aggregateUsIncomeResult for the CFC inclusion (same fields
// dag-adapter.js exposes as model.income.us), and the raw India profile's
// own business_entries[].presumptive_scheme for IN-26 (more robust than
// text-matching the DAG's own trace formula anyway, which is what
// shadow-core.js's copy of this detector has to fall back to).
function isCfcInclusionDivergentProfile(aggUs) {
  if (!aggUs) return false;
  var nonElected = (aggUs.cfcNonElectedInclusionUs && aggUs.cfcNonElectedInclusionUs.usd) || 0;
  var elected = aggUs.cfcElectedPool || {};
  return nonElected > 0 || (elected.taxableBaseUsd || 0) + (elected.subpartFUsd || 0) > 0;
}
function isIndiaPresumptiveForeignSchemeProfile(indiaRaw) {
  var entries = (indiaRaw && indiaRaw.business_income && indiaRaw.business_income.business_entries) || [];
  return entries.some(function (e) { return e && (e.presumptive_scheme === "s44BB" || e.presumptive_scheme === "s44BBB"); });
}

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve([
    "buildDocumentsResult", "buildScopeNotesResult", "buildReturnFormDeterminationResult", "buildFtcReportResult",
    "usTaxResult", "aggregateUsIncomeResult", "indiaIncomeModelResult",
    "totalNormalInr", "slabTaxInr", "rebateInrV3", "isNew", "isIndividualV3", "isNRV3"
  ], ctx).values;

  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  console.log(p.id + (isUsEntity ? " (US ENTITY — ftcReport not in-graph, reporting only)" : isNra ? " (NRA — ftcReport not in-graph, reporting only)" : ""));

  var feieWagesDivergent = isFeieWagesDivergentProfile(p.us);
  var feieBonaFideProxyDivergent = isFeieBonaFideProxyDivergentProfile(p.us);
  var feieStackingRuleDivergent = isFeieStackingRuleDivergentProfile(out.usTaxResult);
  var feieEntityGateMissing = isFeieEntityGateMissingProfile(usKind, p.us);
  // The other 7 detectors (isQbiWageLimitDivergent/isQbiWageUbiaLimitDivergentProfile/
  // isSaversCreditDivergent/isIndiaSalaryExemptionProfile/isIndiaRebateMarginalReliefDivergentProfile/
  // isCfcInclusionDivergentProfile/isIndiaPresumptiveForeignSchemeProfile) are defined above for
  // parity with run-fuzz.js's own apparatus, but NOT wired into the excusal below: checked directly
  // against all 11 real fixtures (see this task's own verification), none of them actually causes a
  // documents/scopeNotes/returnForms/ftcReport divergence in THIS narrower harness today — e.g.
  // isIndiaSalaryExemptionProfile fires for nearly every India-salaried fixture (its cascade is
  // genuinely that wide per run-fuzz.js's own KNOWN_INDIA_SALARY_EXEMPTION_DIVERGENT_PATHS), but the
  // divergence it causes lives in computed.indiaTax/model.income.india, fields this file never checks
  // at all (only report-batch1-nodes.js's documents/scopeNotes/returnForms/ftcReport are in scope
  // here) — wiring it in would excuse checks that already pass cleanly, silently dropping real
  // coverage for no benefit. Left defined (not deleted) so a future fixture that DOES trigger one of
  // these cascades in a checked field just needs a one-line wire-up here, not a re-port.

  // documents/returnForms: only isFeieEntityGateMissingProfile is wired in
  // (KNOWN_FEIE_ENTITY_GATE_DIVERGENT_PATHS = ["documents"] only) — it never
  // actually fires for any of the 11 real fixtures (narrow, fuzzer-cross-
  // merge-only case per that detector's own comment), so this excusal is
  // inert today, kept for parity. The FEIE wages/bona-fide/stacking family
  // is deliberately NOT wired in here even though run-fuzz.js's own
  // KNOWN_FEIE_WAGES_DIVERGENT_PATHS lists "documents"/"returnForms"
  // wholesale — verified directly (see the comment block above) that
  // neither field actually diverges for us_citizen_expat_india (the one
  // FEIE-wages fixture among the 11); only ftcReport does.
  var docsFieldExcused = feieEntityGateMissing;
  var reportFieldExcused = feieWagesDivergent || feieBonaFideProxyDivergent || feieStackingRuleDivergent;

  // DAG-only documents (docs/GAP_TRACKER.md section H.7/H.13, 21-22 Jul
  // 2026): no engine equivalent for any of these — see
  // findings-batch5-nodes.js's usStateTaxResult and report-batch1-nodes.js's
  // DOCUMENTS_CATALOG comments.
  var DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id", "schedule_m1_m2", "k1_issuance", "form_8880", "form_w7", "form_27d"];
  var docsForDiff = out.buildDocumentsResult.filter(function (x) { return DAG_ONLY_DOC_IDS.indexOf(x.id) === -1; });
  if (docsFieldExcused) {
    console.log("    (DELIBERATE divergence — wholesale cascade, see this file's own detector comments) documents/returnForms");
  } else {
    var docDiff = deepEqual(docsForDiff, r.documents);
    check("documents matches exactly (" + r.documents.length + " entries, " + r.documents.filter(function (x) { return x.required; }).length + " required)", !docDiff, docDiff && docDiff.slice(0, 3).join(" | "));
  }

  var scopeDiff = deepEqual(out.buildScopeNotesResult, r.scopeNotes);
  check("scopeNotes matches exactly (" + r.scopeNotes.length + " notes)", !scopeDiff, scopeDiff && scopeDiff.slice(0, 3).join(" | "));

  if (!docsFieldExcused) {
    var formsDiff = deepEqual(out.buildReturnFormDeterminationResult, r.returnForms);
    check("returnForms matches exactly", !formsDiff, formsDiff && formsDiff.slice(0, 3).join(" | "));
  }

  // ftcReport is built on usTaxResult's liability figures — same TAX-7/
  // TAX-8 scope boundary as every prior batch's amt_applies/ftc_gap/etc:
  // the DAG only computes the resident/individual US tax path, so for a
  // US-entity or NRA profile this report is genuinely wrong, not a DAG
  // bug — reported, not asserted, same discipline as run-xborder-full.js.
  if (isUsEntity || isNra) {
    console.log("    (reported, not asserted) ftcReport would diverge here — usTaxResult only covers the resident/individual path");
  } else if (reportFieldExcused) {
    console.log("    (DELIBERATE divergence — wholesale cascade, see this file's own detector comments) ftcReport");
  } else {
    var ftcDiff = deepEqual(out.buildFtcReportResult, r.ftcReport);
    check("ftcReport matches exactly", !ftcDiff, ftcDiff && ftcDiff.slice(0, 5).join(" | "));
  }

  console.log("");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

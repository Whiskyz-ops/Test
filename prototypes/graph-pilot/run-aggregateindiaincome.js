"use strict";
/* ============================================================================
 * Verifies aggregateindiaincome-nodes.js against all 11 real profiles, two
 * ways — same discipline as every prior phase:
 *   1. Intermediate values (business.inr, stcg/ltcg/ltcg197Inr/stcgSlabInr/
 *      vdaGainInr/chapterXiiaInvestmentIncomeInr/otherSourcesMisc) checked
 *      directly against the real model's own fields — proves the
 *      classification logic itself is right, not just the final total.
 *   2. totalIndiaIncomeInr checked against model.income.india.total.inr —
 *      the actual boundary this phase closes.
 *
 * Run: node prototypes/graph-pilot/run-aggregateindiaincome.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./aggregateindiaincome-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 5); }

console.log("Closing the aggregateIndiaIncome boundary, run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var out = graph.resolve(["businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "totalIndiaIncomeInr", "agriculturalIncomeInrAgg", "unexplained115bbeInrAgg"], ctx).values;
  var inc = r.model.income.india;

  console.log(p.id);
  check("agriculturalIncomeInrAgg matches exactly (closes AGG-1's last knownMissing item)", close(out.agriculturalIncomeInrAgg, num(inc.agriculturalIncomeInr)), "graph=" + Math.round(out.agriculturalIncomeInrAgg) + " model=" + Math.round(num(inc.agriculturalIncomeInr)));
  check("unexplained115bbeInrAgg matches exactly (closes AGG-1's LAST knownMissing item)", close(out.unexplained115bbeInrAgg, num(inc.unexplained115bbeInr)), "graph=" + Math.round(out.unexplained115bbeInrAgg) + " model=" + Math.round(num(inc.unexplained115bbeInr)));
  check("business.inr matches exactly", close(out.businessComputation.businessInr, num(inc.business && inc.business.inr)), "graph=" + Math.round(out.businessComputation.businessInr) + " model=" + Math.round(num(inc.business && inc.business.inr)));
  check("businessDepreciationInr matches exactly", close(out.businessComputation.businessDepreciationInr, num(inc.businessDepreciationInr)), "graph=" + Math.round(out.businessComputation.businessDepreciationInr) + " model=" + Math.round(num(inc.businessDepreciationInr)));
  check("indiaHasRegularBooksEntry matches", out.businessComputation.indiaHasRegularBooksEntry === !!inc.indiaHasRegularBooksEntry);
  check("indiaHasValidPresumptiveEntry matches", out.businessComputation.indiaHasValidPresumptiveEntry === !!inc.indiaHasValidPresumptiveEntry);
  check("indiaHasPartnerFirmIncome matches", out.businessComputation.indiaHasPartnerFirmIncome === !!inc.indiaHasPartnerFirmIncome);

  var cg = out.capitalGainsComputation;
  check("stcg.inr matches exactly", close(cg.stcgInr, num(inc.stcg && inc.stcg.inr)), "graph=" + Math.round(cg.stcgInr) + " model=" + Math.round(num(inc.stcg && inc.stcg.inr)));
  check("ltcg.inr matches exactly", close(cg.ltcgInr, num(inc.ltcg && inc.ltcg.inr)), "graph=" + Math.round(cg.ltcgInr) + " model=" + Math.round(num(inc.ltcg && inc.ltcg.inr)));
  check("ltcg197Inr matches exactly", close(cg.ltcg197Inr, num(inc.ltcg197Inr)), "graph=" + Math.round(cg.ltcg197Inr) + " model=" + Math.round(num(inc.ltcg197Inr)));
  check("stcgSlabInr matches exactly", close(cg.stcgSlabInr, num(inc.stcgSlabInr)), "graph=" + Math.round(cg.stcgSlabInr) + " model=" + Math.round(num(inc.stcgSlabInr)));
  check("vdaGainInr matches exactly", close(cg.vdaGainInr, num(inc.vdaGainInr)), "graph=" + Math.round(cg.vdaGainInr) + " model=" + Math.round(num(inc.vdaGainInr)));
  check("chapterXiiaInvestmentIncomeInr matches exactly", close(cg.chapterXiiaInvestmentIncomeInr, num(inc.chapterXiiaInvestmentIncomeInr)));
  check("chapterXiiaSfeaHoldingCount matches exactly", cg.chapterXiiaSfeaHoldingCount === (inc.chapterXiiaSfeaHoldingCount || 0), "graph=" + cg.chapterXiiaSfeaHoldingCount + " model=" + inc.chapterXiiaSfeaHoldingCount);
  check("promoterBuybackLtcgInr matches exactly", close(cg.promoterBuybackLtcgInr, num(inc.promoterBuybackLtcgInr)), "graph=" + Math.round(cg.promoterBuybackLtcgInr) + " model=" + Math.round(num(inc.promoterBuybackLtcgInr)));
  check("deemedDividendInr matches exactly", close(cg.deemedDividendInr, num(inc.deemedDividendBuyback && inc.deemedDividendBuyback.inr)));

  var realMismatches = inc.holdingPeriodMismatches || [];
  check("holdingPeriodMismatches count matches", cg.holdingPeriodMismatches.length === realMismatches.length,
    "graph=" + cg.holdingPeriodMismatches.length + " model=" + realMismatches.length);
  cg.holdingPeriodMismatches.forEach(function (mm, i) {
    var rm = realMismatches[i];
    if (!rm) return;
    check("holdingPeriodMismatches[" + i + "] matches exactly (" + mm.companyName + ")",
      mm.sourceType === rm.sourceType && mm.indiaClassification === rm.indiaClassification &&
      mm.usClassification === rm.usClassification && close(mm.gainInr, rm.gainInr) && close(mm.gainUsd, rm.gainUsd, 0.5) &&
      mm.indiaThresholdMonths === rm.indiaThresholdMonths && mm.isListed === rm.isListed,
      "graph=" + JSON.stringify(mm) + " model=" + JSON.stringify(rm));
  });

  check("otherSourcesMisc matches exactly", close(out.otherSourcesMiscComputation, num(inc.otherSourcesMisc && inc.otherSourcesMisc.inr)), "graph=" + Math.round(out.otherSourcesMiscComputation) + " model=" + Math.round(num(inc.otherSourcesMisc && inc.otherSourcesMisc.inr)));

  check("totalIndiaIncomeInr matches model.income.india.total.inr exactly", close(out.totalIndiaIncomeInr, num(inc.total && inc.total.inr)), "graph=" + Math.round(out.totalIndiaIncomeInr) + " model=" + Math.round(num(inc.total && inc.total.inr)));
  console.log("");
});

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

// ---- IN-38: DTAA worldwide-cede must exclude foreign financial holdings,
// same as ROR alone already does. Now checked against WISING.analyze()
// directly — the real engine has this fix too (GAP_TRACKER.md IN-38,
// closed on both sides in the same session). Uses foreign_equity_unlisted
// specifically, not listed_equity: in the real engine, isIndiaRor only
// gates a foreign_equity_unlisted-specific read (normalize.js ~809-811);
// listed_equity/mutual funds/bonds/etc. go through a second, deliberately
// UNGATED read further down (normalize.js ~995) because India-registered
// instruments are India-source and stay taxable regardless of residency.
// A listed_equity test would exercise that ungated path and show no
// difference between ceded/not-ceded — confirmed by hand while verifying
// the engine-side fix. The gain lands in ltcg197Inr here (>24mo foreign
// holding), not ltcgInr — matches how the engine reports it too. --------
console.log("-- IN-38: DTAA worldwide-cede excludes foreign financial holdings --");
(function () {
  var baseIndia = {
    residency_detail: { final_india_residency_status: "ROR" },
    financial_holdings: { transactions: [{
      asset_class: "foreign_equity_unlisted", sale_date: "2026-01-15", sale_value: 500000, purchase_value: 200000,
      acquisition_date: "2020-01-01", quantity: 100
    }] }
  };
  var ctxNotCeded = { router: {}, india: baseIndia, us: {} };
  var outNotCeded = graph.resolve(["capitalGainsComputation"], ctxNotCeded).values.capitalGainsComputation;
  var rNotCeded = WISING.analyze({ router: {}, india: baseIndia, us: {} });
  check("ROR, not ceded: foreign holdings gain included (ltcg197Inr > 0)", outNotCeded.ltcg197Inr > 0,
    "ltcg197Inr=" + outNotCeded.ltcg197Inr);
  check("ROR, not ceded: DAG matches engine exactly", close(outNotCeded.ltcg197Inr, num(rNotCeded.model.income.india.ltcg197Inr)),
    "graph=" + outNotCeded.ltcg197Inr + " model=" + rNotCeded.model.income.india.ltcg197Inr);

  var cededIndia = JSON.parse(JSON.stringify(baseIndia));
  cededIndia.residency_detail.dtaa_worldwide_ceded = true;
  var ctxCeded = { router: {}, india: cededIndia, us: {} };
  var outCeded = graph.resolve(["capitalGainsComputation"], ctxCeded).values.capitalGainsComputation;
  var rCeded = WISING.analyze({ router: {}, india: cededIndia, us: {} });
  check("ROR, DTAA-ceded: same financial holdings gain now excluded (ltcg197Inr === 0)", outCeded.ltcg197Inr === 0,
    "ltcg197Inr=" + outCeded.ltcg197Inr);
  check("ROR, DTAA-ceded: DAG matches engine exactly", close(outCeded.ltcg197Inr, num(rCeded.model.income.india.ltcg197Inr)),
    "graph=" + outCeded.ltcg197Inr + " model=" + rCeded.model.income.india.ltcg197Inr);
})();

// ---- IN-39: India-registered instruments (listed_equity here) stay
// taxable regardless of residency/DTAA status — s.9(1)(i) source rule,
// not worldwide income. The DAG used to gate its ENTIRE financial_holdings
// read behind isIndiaRor (one shared array fed both the foreign-holdings
// loop and this one), wrongly zeroing this out for NR/RNOR/DTAA-ceded
// taxpayers; the real engine never gated this read (a second, separate,
// always-ungated read, normalize.js ~995). Checked against
// WISING.analyze() across NR, RNOR, and ROR+DTAA-ceded — all three should
// tax the same India-source gain identically to a plain ROR case. --------
console.log("-- IN-39: India-source listed_equity gains stay taxable regardless of residency/DTAA status --");
(function () {
  function withStatus(status, ceded) {
    var india = {
      residency_detail: { final_india_residency_status: status },
      financial_holdings: { transactions: [{
        asset_class: "listed_equity", sale_date: "2026-01-15", sale_value: 500000, purchase_value: 200000,
        acquisition_date: "2024-01-01", quantity: 100, stt_paid: true
      }] }
    };
    if (ceded) india.residency_detail.dtaa_worldwide_ceded = true;
    return india;
  }
  ["NR", "RNOR", "ROR"].forEach(function (status) {
    var india = withStatus(status, status === "ROR");
    var ctx = { router: {}, india: india, us: {} };
    var out = graph.resolve(["capitalGainsComputation"], ctx).values.capitalGainsComputation;
    var r = WISING.analyze({ router: {}, india: india, us: {} });
    var modelLtcgInr = num(r.model.income.india.ltcg && r.model.income.india.ltcg.inr);
    check(status + (status === "ROR" ? " (DTAA-ceded)" : "") + ": India-source gain still taxed (ltcgInr > 0)", out.ltcgInr > 0,
      "ltcgInr=" + out.ltcgInr);
    check(status + (status === "ROR" ? " (DTAA-ceded)" : "") + ": DAG matches engine exactly", close(out.ltcgInr, modelLtcgInr),
      "graph=" + out.ltcgInr + " model=" + modelLtcgInr);
  });
})();

// ---------------------------------------------------------------------
// IN-26: s.44BB/s.44BBB (flat 10% presumptive), s.35AD (specified-business
// capex deduction), s.115V (tonnage tax) — hand-checked synthetic cases,
// NOT diffed against the frozen engine (archive/engine-frozen/normalize.js
// still has the old behavior: s44BB/s44BBB entries silently fall through to
// Regular Books, and neither s35AD nor tonnage tax is read at all). None of
// the 11 real profiles exercise any of these three, so the profile loop
// above can't catch this either way — same DAG-only-fix shape as the farm
// depreciation fix (docs/DAG_MIGRATION_TRACKER.md §L).
// ---------------------------------------------------------------------
console.log("\nSynthetic s.44BB/s.44BBB/s.35AD/s.115V cases (DAG-only fix, hand-checked)\n");

(function () {
  console.log("s.44BBB: foreign company, civil construction, 10% of turnover+cash");
  var india = { domestic_income: { business_income: { business_entries: [
    { presumptive_scheme: "s44BBB", turnover_inr: 500000, cash_receipts_inr: 100000 }
  ] } } };
  var out = graph.resolve(["businessComputation"], { router: {}, india: india, us: {} }).values.businessComputation;
  check("businessInr = 60000 (10% of 600000)", close(out.businessInr, 60000), "got " + out.businessInr);
  console.log("");
})();

(function () {
  console.log("s.44BB: non-resident, mineral-oil services, 10% of turnover");
  var india = { domestic_income: { business_income: { business_entries: [
    { presumptive_scheme: "s44BB", turnover_inr: 1000000, cash_receipts_inr: 0 }
  ] } } };
  var out = graph.resolve(["businessComputation"], { router: {}, india: india, us: {} }).values.businessComputation;
  check("businessInr = 100000 (10% of 1000000)", close(out.businessInr, 100000), "got " + out.businessInr);
  console.log("");
})();

(function () {
  console.log("s.115V tonnage tax + s.35AD deduction, domestic company (not NR)");
  var india = {
    profile: { entity_type: "company" },
    residency_detail: { final_india_residency_status: "ROR" },
    domestic_income: { business_income: {
      specified_business_s35AD_inr: 50000,
      business_entries: [{ tonnage_tax_115V_inr: 200000 }]
    } }
  };
  var out = graph.resolve(["businessComputation"], { router: {}, india: india, us: {} }).values.businessComputation;
  check("businessInr = 150000 (0 entry + 200000 tonnage - 50000 s35AD)", close(out.businessInr, 150000), "got " + out.businessInr);
  check("tonnageTaxInr = 200000", close(out.tonnageTaxInr, 200000));
  check("s35adDeductionInr = 50000", close(out.s35adDeductionInr, 50000));
  console.log("");
})();

(function () {
  console.log("s.115V/s.35AD gated OFF for an NR-resident foreign company");
  var india = {
    profile: { entity_type: "company" },
    residency_detail: { final_india_residency_status: "NR" },
    domestic_income: { business_income: {
      specified_business_s35AD_inr: 50000,
      business_entries: [{ tonnage_tax_115V_inr: 200000 }]
    } }
  };
  var out = graph.resolve(["businessComputation"], { router: {}, india: india, us: {} }).values.businessComputation;
  check("businessInr = 0 (NR company: no tonnage tax, no s35AD deduction)", close(out.businessInr, 0), "got " + out.businessInr);
  console.log("");
})();

(function () {
  console.log("s.115V/s.35AD gated OFF for a non-company entity (individual)");
  var india = {
    profile: { entity_type: "individual" },
    residency_detail: { final_india_residency_status: "ROR" },
    domestic_income: { business_income: {
      specified_business_s35AD_inr: 50000,
      business_entries: [{ tonnage_tax_115V_inr: 200000 }]
    } }
  };
  var out = graph.resolve(["businessComputation"], { router: {}, india: india, us: {} }).values.businessComputation;
  check("businessInr = 0 (non-company: layer1_india.html's own UI scopes both to companies only)", close(out.businessInr, 0), "got " + out.businessInr);
  console.log("");
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

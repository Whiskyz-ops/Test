/* ============================================================================
 * WISING — engine regression tests (plain Node, no framework/dependency —
 * matches the engine's own "no bundler" philosophy).
 *
 * Run: node tests/engine/run.js   (wired to `npm test` in package.json)
 *
 * Two layers:
 *   1. Fixture assertions — synthetic raw Layer 1 states with hand-traceable
 *      marker values, run through normalize()/compute(), checked against
 *      hand-derived expected numbers. Exists to catch "field silently never
 *      reaches the engine" bugs — the exact failure mode this suite was
 *      written after finding several real instances of (see
 *      docs/FIELD_COVERAGE_AUDIT.md).
 *   2. Demo-profile smoke test — all 9 engine/profiles.js WISING.PROFILES
 *      run through analyze() and must not throw / must not return NaN.
 * ==========================================================================*/
"use strict";
var assert = require("assert");
var path = require("path");

global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(__dirname, "..", "..", "engine", m + ".js"));
});
var WISING = global.WISING;
var fx = require("./fixtures.js");

var pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log("  ok - " + name);
  } catch (e) {
    fail++;
    console.log("  FAIL - " + name);
    console.log("    " + e.message);
  }
}
function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1, (msg || "") + " expected " + expected + " got " + actual);
}

console.log("India fixture (normalize + compute)");
var model = WISING.normalize({ router: fx.router, india: fx.india, us: null });
var inc = model.income.india;
var ded = model.deductions.india;

test("otherSourcesMisc sums gifts + family-pension(net) + spousal-clubbing net of minor exemption + LIC maturity + angel tax - local-authority + misc + taxable EPF/NPS interest", function () {
  // gifts 60000 + pensionNet(90000-15000) 75000 + spousal 20000 - minorExempt 1500
  // + lic 8000 + angel 0 - localAuth 0 + misc 12000 + taxableEpf 4000 + taxableNps 2500
  approx(inc.otherSourcesMisc.inr, 180000, "otherSourcesMisc.inr");
});

test("commodities.transactions feed capital gains (previously read nowhere in the engine)", function () {
  // physical_gold >24mo (50000) + SGB-secondary >12mo (15000) = 65000 into ltcg197Inr
  // silver <=24mo (5000) + gold_etf always-short (12000) = 17000 into stcgSlabInr
  // SGB-original maturity redemption must be fully excluded (exempt, s.47(viic))
  // (stcgSlabInr total below also carries the 5000 unlisted-equity + 15000
  // financial_holdings debt-MF slices asserted in the tests that follow —
  // inc is one fixture-wide total, not per-source.)
  approx(inc.ltcg197Inr, 65000 + 40000 /* unlisted_equity ltcg197 below */, "ltcg197Inr should include commodity + unlisted-equity slices");
  approx(inc.stcgSlabInr, 17000 + 5000 + 15000, "stcgSlabInr should include commodity + unlisted-equity + financial_holdings slices");
});

test("unlisted_equity.transactions feed capital gains (previously read nowhere in the engine)", function () {
  // Acme: (900-500)*100=40000, >24mo -> ltcg197. Beta: (300-200)*50=5000, <=24mo -> stcgSlab.
  // Gamma (still holding, no sale_date) must be fully excluded.
  // Asserted jointly with commodities above since both feed the same two buckets;
  // isolate here by checking the totals are at least the unlisted-equity slice.
  assert.ok(inc.ltcg197Inr >= 40000, "ltcg197Inr should include the 40000 unlisted-equity slice, got " + inc.ltcg197Inr);
  assert.ok(inc.stcgSlabInr >= 5000, "stcgSlabInr should include the 5000 unlisted-equity slice, got " + inc.stcgSlabInr);
});

test("financial_holdings classification still correct (light regression check)", function () {
  // listed_equity STT-paid >12mo: (350000-200000)=150000 -> s.198 ltcg bucket (has ₹1,25,000 exemption, not applied at normalize() level)
  approx(inc.ltcg.inr, 150000, "ltcg.inr (s.198 bucket)");
  // debt_mutual_fund_post_apr23: always-short -> (95000-80000)=15000 into stcgSlabInr, on top of commodities+unlisted-equity above
  approx(inc.stcgSlabInr, 17000 + 5000 + 15000, "stcgSlabInr should also include the 15000 debt-MF-post-Apr23 slice");
  approx(inc.stcg.inr, 20000, "stcg.inr (short_term_15_pct passthrough)");
});

test("India Chapter VI-A deductions: 80DD/80DDB/80U flat-by-severity, 80E uncapped, 80EEA capped by sanction-date window, 80GGB/GGC uncapped", function () {
  approx(ded.s80DD, 75000, "s80DD (standard severity flat amount)");
  approx(ded.s80DDB, 100000, "s80DDB (senior cap — 150000 entered, capped to 100000)");
  approx(ded.s80U, 125000, "s80U (severe severity flat amount)");
  approx(ded.s80E, 45000, "s80E (uncapped)");
  approx(ded.s80EEA_EE, 150000, "s80EEA_EE (200000 entered, capped to 150000 — sanction date in the s.80EEA window)");
  approx(ded.s80GGB_GGC, 10000, "s80GGB_GGC (uncapped)");
  approx(ded.s80GG_rentPaidInr, 150000, "s80GG_rentPaidInr (raw passthrough, capped later in computeIndiaTax)");
});

test("computeIndiaTax actually applies the new deductions (deductionsInr reflects all 6 new sections)", function () {
  var result = WISING.compute(model);
  // s80C min(120000,150000) + s80CCD1B min(40000,50000) + s80D min(35000,75000) + s80CCD2_employer 60000
  // + s80TTA_TTB min(15000,10000) + s80DD 75000 + s80DDB 100000 + s80U 125000 + s80E 45000
  // + s80EEA_EE 150000 + s80GGB_GGC 10000 + s80GG (0, rent doesn't clear 10%-of-income floor at this income level)
  approx(result.indiaTax.deductionsInr, 770000, "deductionsInr");
  assert.ok(result.indiaTax.totalTaxInr > 0, "totalTaxInr should be positive");
  assert.ok(!isNaN(result.indiaTax.totalTaxInr), "totalTaxInr should not be NaN");
});

console.log("US fixture (normalize + compute)");
var modelUs = WISING.normalize({ router: fx.router, india: null, us: fx.us });
var dedUs = modelUs.deductions.us;

test("careExpenses reads the real field name (child_and_dependent_care_expenses_usd) the form actually writes", function () {
  approx(dedUs.careExpenses, 6000, "careExpenses");
});

test("SE health insurance / SE retirement deductions are read from income_us_source", function () {
  approx(dedUs.seHealthInsuranceDeductionUsd, 6000, "seHealthInsuranceDeductionUsd");
  approx(dedUs.seRetirementDeductionUsd, 9000, "seRetirementDeductionUsd");
});

test("AMT private-activity-bond-interest is read from the real path (amt_inputs.*)", function () {
  assert.ok(dedUs.amtPrefs >= 5000, "amtPrefs should include the 5000 private-activity-bond-interest slice, got " + dedUs.amtPrefs);
});

test("foreign_corporations reads the real 'Add Foreign Corporation' UI's field names (US-26)", function () {
  var entity = modelUs.assets.businessEntities.find(function (e) { return e.type === "Foreign corporation (CFC)"; });
  assert.ok(entity, "expected a Foreign corporation (CFC) entity in businessEntities()");
  approx(entity.ownershipPct, 60, "ownershipPct (from ownership_percentage, not ownership_pct)");
  assert.strictEqual(entity.name, "Fixture Foreign Co", "name should read corporation_name, not corp_name");
  assert.strictEqual(entity.country, "US", "country_of_incorporation='SG' should resolve to non-IN bucket");
});

console.log("Social Security taxability (s.86 provisional-income worksheet, gap tracker US-2)");
fx.socialSecurityCases.forEach(function (c) {
  test(c.label, function () {
    var m = WISING.normalize({ router: fx.router, india: null, us: c.us });
    var r = WISING.compute(m);
    approx(r.usTax.socialSecurityDetail.taxableUsd, c.expectedTaxableUsd, "taxable SS for: " + c.label);
  });
});

test("computeUsTax actually applies SE health/retirement as above-the-line AGI deductions", function () {
  var resultUs = WISING.compute(modelUs);
  // wages 120000 + SE net (40000*0.9235=36940) = 156940 ordinary income (before halfSeTax/health/retirement adjustments)
  // AGI must be strictly less than total income once the two new above-the-line deductions apply.
  assert.ok(resultUs.usTax.agiUsd < resultUs.usTax.totalIncomeUsd - 6000 - 9000 + 100, "AGI should reflect SE health + SE retirement deductions, got agiUsd=" + resultUs.usTax.agiUsd + " totalIncomeUsd=" + resultUs.usTax.totalIncomeUsd);
  assert.ok(!isNaN(resultUs.usTax.totalTaxBeforeFtcUsd), "totalTaxBeforeFtcUsd should not be NaN");
});

test("Child & Dependent Care Credit is nonzero once the field-name fix is in place", function () {
  var resultUs = WISING.compute(modelUs);
  assert.ok(resultUs.usTax.otherCreditsUsd > 0, "otherCreditsUsd should be > 0 (care credit), got " + resultUs.usTax.otherCreditsUsd);
});

console.log("Demo profile smoke test (all 9 WISING.PROFILES)");
WISING.PROFILES.forEach(function (p) {
  test(p.id + " analyzes without throwing and produces finite numbers", function () {
    var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
    assert.ok(!isNaN(r.summary.indiaTaxUsd), "indiaTaxUsd is NaN for " + p.id);
    assert.ok(!isNaN(r.summary.usTaxUsd), "usTaxUsd is NaN for " + p.id);
    assert.ok(r.summary.totalIncomeUsd >= 0, "totalIncomeUsd negative for " + p.id);
  });
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

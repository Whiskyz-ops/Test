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
 *   2. Demo-profile smoke test — all of profiles.js's WISING.PROFILES (count
 *      varies as profiles are added; read WISING.PROFILES.length at runtime,
 *      never hardcode it here) run through analyze() and must not throw /
 *      must not return NaN.
 * ==========================================================================*/
"use strict";
var assert = require("assert");
var path = require("path");

var resolveEngineFile = require(path.join(__dirname, "..", "..", "scripts", "engine-frozen.js")).resolveEngineFile;
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
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

console.log("India residency: deriveIndiaDomesticStatus/deriveCompanyPoem — full runResidencySolver() port (IN-37/GAP_TRACKER.md), one synthetic case per branch, same set already verified in prototypes/graph-pilot/residency-nodes.js");
var deriveIndiaDomesticStatus = WISING.util.deriveIndiaDomesticStatus;
var deriveCompanyPoem = WISING.util.deriveCompanyPoem;

function statusCheck(label, entity, facts, expected) {
  test(label, function () {
    var got = deriveIndiaDomesticStatus(entity, facts);
    assert.strictEqual(got, expected, "expected " + expected + ", got " + got);
  });
}
function poemCheck(label, cr, expected) {
  test(label, function () {
    var got = deriveCompanyPoem(cr);
    assert.strictEqual(got, expected, "expected " + expected + ", got " + got);
  });
}

statusCheck("individual ROR-1: days=200, nr9=false, d7729=false", "individual", { days: 200, nr9: false, d7729: false }, "ROR");
statusCheck("individual RNOR-1: days=200, nr9=true", "individual", { days: 200, nr9: true, d7729: false }, "RNOR");
statusCheck("individual RNOR-2: days=200, nr9=false, d7729=true", "individual", { days: 200, nr9: false, d7729: true }, "RNOR");
statusCheck("individual RNOR-3: days=100, p4y=true, emp=employment, inc15=true, ltac=false", "individual", { days: 100, p4y: true, emp: "employment", inc15: true, ltac: false }, "RNOR");
statusCheck("individual NR-7: days=100, p4y=true, emp=employment, inc15=false", "individual", { days: 100, p4y: true, emp: "employment", inc15: false }, "NR");
statusCheck("individual NR-8: days=100, p4y=true, emp=employment, inc15=true, ltac=true", "individual", { days: 100, p4y: true, emp: "employment", inc15: true, ltac: true }, "NR");
statusCheck("individual RNOR-4: days=150, p4y=true, visit=true, inc15=true", "individual", { days: 150, p4y: true, emp: "none", visit: true, inc15: true }, "RNOR");
statusCheck("individual NR-5: days=150, p4y=true, visit=true, inc15=false", "individual", { days: 150, p4y: true, emp: "none", visit: true, inc15: false }, "NR");
statusCheck("individual RNOR-6 (visitor): days=100, p4y=true, visit=true, inc15=true, ltac=false", "individual", { days: 100, p4y: true, emp: "none", visit: true, inc15: true, ltac: false }, "RNOR");
statusCheck("individual NR-10: days=100, p4y=true, visit=true, inc15=false", "individual", { days: 100, p4y: true, emp: "none", visit: true, inc15: false }, "NR");
statusCheck("individual ROR-2: days=100, p4y=true, visit=false, nr9=false, d7729=false", "individual", { days: 100, p4y: true, emp: "none", visit: false, nr9: false, d7729: false }, "ROR");
statusCheck("individual RNOR-5: days=100, p4y=true, visit=false, nr9=true", "individual", { days: 100, p4y: true, emp: "none", visit: false, nr9: true }, "RNOR");
statusCheck("individual RNOR-6 (non-visitor): days=100, p4y=true, visit=false, nr9=false, d7729=true", "individual", { days: 100, p4y: true, emp: "none", visit: false, nr9: false, d7729: true }, "RNOR");
statusCheck("individual RNOR-7: days=100, p4y=false, inc15=true, ltac=false", "individual", { days: 100, p4y: false, inc15: true, ltac: false }, "RNOR");
statusCheck("individual NR-6: days=100, p4y=false, inc15=false", "individual", { days: 100, p4y: false, inc15: false }, "NR");
statusCheck("individual RNOR-8: days=30, inc15=true, ltac=false", "individual", { days: 30, inc15: true, ltac: false }, "RNOR");
statusCheck("individual NR-9: days=30, inc15=false", "individual", { days: 30, inc15: false }, "NR");
statusCheck("individual default: days unanswered", "individual", {}, "NR");

statusCheck("company RES-1: is_indian_company=true", "company", { isIndianCompany: true }, "ROR");
statusCheck("company RES-2: is_indian_company=false, POEM in India", "company", { isIndianCompany: false, company: { isActiveBusiness: true, boardMeetingsOutsideIndia: false } }, "ROR");
statusCheck("company NR-1: is_indian_company=false, POEM outside India", "company", { isIndianCompany: false, company: {} }, "NR");
statusCheck("company RES-1 default: is_indian_company unanswered", "company", {}, "ROR");

poemCheck("POEM active business, board outside=false -> true", { isActiveBusiness: true, boardMeetingsOutsideIndia: false }, true);
poemCheck("POEM active business, board outside=true -> false", { isActiveBusiness: true, boardMeetingsOutsideIndia: true }, false);
poemCheck("POEM not active, key mgmt=india -> true", { isActiveBusiness: false, keyManagementLocation: "india" }, true);
poemCheck("POEM not active, key mgmt=outside_india -> false", { isActiveBusiness: false, keyManagementLocation: "outside_india" }, false);
poemCheck("POEM not active, mixed, majority in India -> true", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 3, directorsOutsideIndia: 1 }, true);
poemCheck("POEM not active, mixed, majority outside -> false", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 1, directorsOutsideIndia: 3 }, false);
poemCheck("POEM not active, mixed, tied, delegated=false -> true", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 2, directorsOutsideIndia: 2, managementDelegatedOutsideIndia: false }, true);
poemCheck("POEM not active, mixed, tied, delegated=true -> false", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 2, directorsOutsideIndia: 2, managementDelegatedOutsideIndia: true }, false);
poemCheck("POEM no facts at all -> false (default)", {}, false);

statusCheck("firm NR-2: wholly_outside=true", "firm", { whollyOutside: true }, "NR");
statusCheck("llp RES-3: wholly_outside=false", "llp", { whollyOutside: false }, "ROR");
statusCheck("aop RES-3 default: wholly_outside unanswered", "aop", {}, "ROR");

statusCheck("huf NR-3: wholly_outside=true", "huf", { whollyOutside: true }, "NR");
statusCheck("huf RNOR: wholly_outside=false, nr9=true", "huf", { whollyOutside: false, nr9: true }, "RNOR");
statusCheck("huf RNOR: wholly_outside=false, d7729=true", "huf", { whollyOutside: false, d7729: true }, "RNOR");
statusCheck("huf ROR: wholly_outside=false, nr9=false, d7729=false", "huf", { whollyOutside: false, nr9: false, d7729: false }, "ROR");

console.log("India residency: domesticStatusDerived vs recorded status across all 11 real profiles, REPORTED not asserted (fixtures were hand-authored with a chosen final status directly, not run through the real wizard, so they don't carry the full fact set the derivation needs — see residency-nodes.js's header in prototypes/graph-pilot for the same limitation already documented there)");
(function () {
  var derivedMatchCount = 0;
  WISING.PROFILES.forEach(function (p) {
    var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
    var derived = r.model.residency.india.domesticStatusDerived, recorded = r.model.residency.india.status;
    var matches = derived === recorded;
    if (matches) derivedMatchCount++;
    console.log("    " + p.id + ": derived=" + derived + " recorded=" + recorded + (matches ? "  (match)" : "  (fixture doesn't carry the full fact set)"));
  });
  console.log("    " + derivedMatchCount + "/" + WISING.PROFILES.length + " real profiles happen to match — informational only, not a pass/fail signal.");
})();

console.log("India/US residency-consistency findings (conflicts.js), ported from residencyConsistencyFindings in prototypes/graph-pilot/residency-nodes.js");
function findingsCheck(label, india, us, expectIds) {
  test(label, function () {
    var r = WISING.analyze({ router: {}, india: india, us: us });
    var ids = r.findings.filter(function (fnd) { return fnd.id.indexOf("residency_status_") === 0; }).map(function (fnd) { return fnd.id; });
    var ok = ids.length === expectIds.length && expectIds.every(function (id) { return ids.indexOf(id) !== -1; });
    assert.ok(ok, "expected [" + expectIds.join(", ") + "], got [" + ids.join(", ") + "]");
  });
}

findingsCheck("India individual: derived ROR, recorded NR, no treaty -> residency_status_mismatch_india",
  { residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" }, profile: { entity_type: "individual" } },
  {}, ["residency_status_mismatch_india"]);

findingsCheck("India company: is_indian_company=true, recorded NR, no treaty -> residency_status_mismatch_india_company",
  { residency_detail: { is_indian_company: true, final_india_residency_status: "NR" }, profile: { entity_type: "company" } },
  {}, ["residency_status_mismatch_india_company"]);

findingsCheck("India HUF: wholly_outside=false + nr9/d7729=false (ROR), recorded NR -> residency_status_mismatch_india_entity",
  { residency_detail: { is_wholly_outside_india: false, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" }, profile: { entity_type: "huf" } },
  {}, ["residency_status_mismatch_india_entity"]);

findingsCheck("India individual: derived matches recorded -> no finding",
  { residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "ROR" }, profile: { entity_type: "individual" } },
  {}, []);

findingsCheck("India individual: derived ROR (200 days) but recorded NR + dtaa_treaty_residence=us -> residency_status_dtaa_conflated_india, NOT a generic mismatch",
  {
    residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" },
    profile: { entity_type: "individual" },
    dtaa: { dtaa_treaty_residence: "us" }
  },
  {}, ["residency_status_dtaa_conflated_india"]);

findingsCheck("India individual: derived ROR but recorded NR + dtaa_forced_nr=true -> residency_status_dtaa_conflated_india",
  {
    residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" },
    profile: { entity_type: "individual" },
    dtaa: { dtaa_forced_nr: true }
  },
  {}, ["residency_status_dtaa_conflated_india"]);

findingsCheck("India company: derived ROR but recorded NR + dtaa_treaty_residence=us -> residency_status_dtaa_conflated_india (applies to every entity type)",
  {
    residency_detail: { is_indian_company: true, final_india_residency_status: "NR" },
    profile: { entity_type: "company" },
    dtaa: { dtaa_treaty_residence: "us" }
  },
  {}, ["residency_status_dtaa_conflated_india"]);

findingsCheck("US: 200 days + sptMet=false fires residency_status_understated_us",
  {}, { us_residency_detail: { us_days_current_year: 200, spt_test_met: false, is_us_citizen: false, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  ["residency_status_understated_us"]);
findingsCheck("US: 10 days + sptMet=true fires residency_status_overstated_us",
  {}, { us_residency_detail: { us_days_current_year: 10, spt_test_met: true, is_us_citizen: false, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  ["residency_status_overstated_us"]);
findingsCheck("US: 10 days + sptMet=true on a CITIZEN does not fire (citizen gate)",
  {}, { us_residency_detail: { us_days_current_year: 10, spt_test_met: true, is_us_citizen: true, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  []);
findingsCheck("US entity: incorporated_in_us=true + FOREIGN_ENTITY fires residency_status_understated_us_entity",
  {}, { profile: { tax_entity_type: "ccorp", incorporated_in_us: true }, us_residency_detail: { final_us_residency_status: "FOREIGN_ENTITY" } },
  ["residency_status_understated_us_entity"]);
findingsCheck("US entity: incorporated_in_us=false + DOMESTIC_ENTITY fires residency_status_overstated_us_entity",
  {}, { profile: { tax_entity_type: "scorp", incorporated_in_us: false }, us_residency_detail: { final_us_residency_status: "DOMESTIC_ENTITY" } },
  ["residency_status_overstated_us_entity"]);
findingsCheck("US entity: incorporated_in_us=true + DOMESTIC_ENTITY does not fire (consistent)",
  {}, { profile: { tax_entity_type: "partnership", incorporated_in_us: true }, us_residency_detail: { final_us_residency_status: "DOMESTIC_ENTITY" } },
  []);

console.log("Demo profile smoke test (all " + WISING.PROFILES.length + " WISING.PROFILES)");
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

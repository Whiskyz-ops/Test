"use strict";
/* ============================================================================
 * Proves analyze.js can serve tests/engine/run.js's "fixture assertions"
 * layer — the one WISING.compute(model) usage previously thought to be
 * architecturally out of reach for the DAG. It isn't: every real call site
 * there normalizes raw {router, india, us} then computes on that SAME
 * model, never an independently hand-built one — so WISING.analyze(opts),
 * reading .model/.computed from one call, covers it exactly.
 *
 * This file re-runs EVERY assertion from tests/engine/run.js's fixture
 * layer, verbatim (same fixtures.js data, same expected numbers), but
 * driven through analyze.js's DAG-only WISING instead of engine/*.js — the
 * concrete proof, not just an architectural argument.
 *
 * Run: node prototypes/graph-pilot/run-fixtures-standalone.js
 * ==========================================================================*/
var assert = require("assert");
var fx = require("../../tests/engine/fixtures.js");

var WISING = (function () {
  var fakeWindow = {};
  var origWindow = global.window;
  global.window = fakeWindow;
  require("./analyze.js");
  global.window = origWindow;
  return fakeWindow.WISING;
})();

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok - " + name); }
  catch (e) { fail++; console.log("  FAIL - " + name); console.log("    " + e.message); }
}
function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1, (msg || "") + " expected " + expected + " got " + actual);
}

console.log("India fixture (DAG analyze() in place of normalize+compute)");
var rIndia = WISING.analyze({ router: fx.router, india: fx.india, us: null });
var model = rIndia.model;
var inc = model.income.india;
var ded = model.deductions.india;

test("otherSourcesMisc sums gifts + family-pension(net) + spousal-clubbing net of minor exemption + LIC maturity + angel tax - local-authority + misc + taxable EPF/NPS interest", function () {
  approx(inc.otherSourcesMisc.inr, 180000, "otherSourcesMisc.inr");
});

test("commodities.transactions feed capital gains (previously read nowhere in the engine)", function () {
  approx(inc.ltcg197Inr, 65000 + 40000, "ltcg197Inr should include commodity + unlisted-equity slices");
  approx(inc.stcgSlabInr, 17000 + 5000 + 15000, "stcgSlabInr should include commodity + unlisted-equity + financial_holdings slices");
});

test("unlisted_equity.transactions feed capital gains (previously read nowhere in the engine)", function () {
  assert.ok(inc.ltcg197Inr >= 40000, "ltcg197Inr should include the 40000 unlisted-equity slice, got " + inc.ltcg197Inr);
  assert.ok(inc.stcgSlabInr >= 5000, "stcgSlabInr should include the 5000 unlisted-equity slice, got " + inc.stcgSlabInr);
});

test("financial_holdings classification still correct (light regression check)", function () {
  approx(inc.ltcg.inr, 150000, "ltcg.inr (s.198 bucket)");
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
  approx(rIndia.computed.indiaTax.deductionsInr, 770000, "deductionsInr");
  assert.ok(rIndia.computed.indiaTax.totalTaxInr > 0, "totalTaxInr should be positive");
  assert.ok(!isNaN(rIndia.computed.indiaTax.totalTaxInr), "totalTaxInr should not be NaN");
});

console.log("US fixture (DAG analyze() in place of normalize+compute)");
var rUs = WISING.analyze({ router: fx.router, india: null, us: fx.us });
var modelUs = rUs.model;
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
    var r = WISING.analyze({ router: fx.router, india: null, us: c.us });
    approx(r.computed.usTax.socialSecurityDetail.taxableUsd, c.expectedTaxableUsd, "taxable SS for: " + c.label);
  });
});

test("computeUsTax actually applies SE health/retirement as above-the-line AGI deductions", function () {
  assert.ok(rUs.computed.usTax.agiUsd < rUs.computed.usTax.totalIncomeUsd - 6000 - 9000 + 100, "AGI should reflect SE health + SE retirement deductions, got agiUsd=" + rUs.computed.usTax.agiUsd + " totalIncomeUsd=" + rUs.computed.usTax.totalIncomeUsd);
  assert.ok(!isNaN(rUs.computed.usTax.totalTaxBeforeFtcUsd), "totalTaxBeforeFtcUsd should not be NaN");
});

test("Child & Dependent Care Credit is nonzero once the field-name fix is in place", function () {
  assert.ok(rUs.computed.usTax.otherCreditsUsd > 0, "otherCreditsUsd should be > 0 (care credit), got " + rUs.computed.usTax.otherCreditsUsd);
});

// These two sections never called compute()/normalize() at all (just
// WISING.util.* and WISING.analyze()), so they were never architecturally
// blocked — ported here anyway for complete, no-carve-outs parity with
// tests/engine/run.js's entire fixture-assertion layer, not just its
// compute()-calling subset.
console.log("India residency: deriveIndiaDomesticStatus/deriveCompanyPoem");
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

console.log("India/US residency-consistency findings (conflicts.js)");
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

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

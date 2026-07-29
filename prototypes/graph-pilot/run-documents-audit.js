"use strict";
/* ============================================================================
 * Filings-tab document-catalog audit (docs/GAP_TRACKER.md, 22 Jul 2026):
 * for every one of CONST.DOCUMENTS' entries, at least one synthetic scenario
 * built to fire it and one built NOT to — independent of the 12 named demo
 * profiles, covering the actual boundary of the real legal rule (not just
 * whatever combination the demo profiles happen to carry). Exists because
 * two real trigger bugs (Form 5471, Form 1040-NR) were found in the same
 * session by inspection AFTER the 12 demo profiles' own regression suite
 * had been green the whole time — the demo profiles' own fixed data
 * couldn't have caught either one, since neither bug was exposed by the
 * SPECIFIC values those 12 profiles happen to carry.
 *
 * Every case is checked against BOTH the real engine (WISING.analyze()'s
 * own documents array) and the DAG (buildDocumentsResult via graph.resolve)
 * — this catches an engine/DAG divergence (a form_nj1040-class bug — see
 * below) in the same pass as a wrong-legal-rule bug, since both would
 * otherwise look identical from the DAG side alone.
 *
 * Batch A (this file's first section): US information returns — fincen_114
 * (FBAR), form_8938 (FATCA), form_5471 (CFC), form_8621 (PFIC), form_8865
 * (foreign partnership — confirmed unmodeled, asserted false unconditionally),
 * form_3520 (foreign gifts/trusts). Later batches (B/C/D) append to this
 * same file rather than creating a new one per batch, so `npm test`/the
 * regression suite has ONE place that answers "is the Filings tab's
 * document catalog covered" going forward.
 *
 * Run: node prototypes/graph-pilot/run-documents-audit.js
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

var pass = 0, fail = 0, cases = 0;
function docStatus(documents, id) {
  var d = documents.filter(function (x) { return x.id === id; })[0];
  return d ? !!d.required : undefined;
}
function dagDocStatus(router, india, us, model, id) {
  var ctx = { router: router, india: india, us: us, model: { entity: model.entity, meta: model.meta } };
  var out = graph.resolve(["buildDocumentsResult"], ctx).values.buildDocumentsResult;
  var d = out.filter(function (x) { return x.id === id; })[0];
  return d ? !!d.required : undefined;
}
// label: human description. docId: catalog entry id. expected: true (must
// be Required) or false (must be N/A). router/india/us: full synthetic input.
function check(label, docId, expected, router, india, us) {
  cases++;
  var r = WISING.analyze({ router: router, india: india, us: us });
  var engineVal = docStatus(r.documents, docId);
  var dagVal = dagDocStatus(router, india, us, r.model, docId);
  var ok = engineVal === expected && dagVal === expected;
  if (ok) { pass++; console.log("  ok - " + label); }
  else {
    fail++;
    console.log("  FAIL - " + label + "  (expected " + expected + ", engine=" + engineVal + ", dag=" + dagVal + ")");
  }
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function base(id) { return WISING.PROFILES.filter(function (p) { return p.id === id; })[0]; }

// Bases: a resident-alien individual (Aarav — real US bank accounts/wages
// already on file), a domestic C-corp (Cloudspire Inc), and a genuine NRA
// with zero US-person status (Anita) for "must NOT fire" checks.
var RESIDENT = base("dual_resident_h1b");
var CCORP = base("us_ccorp_indian_sub");
var NRA = base("india_ror_us_income");

console.log("=== Batch A: US information returns ===");

// ---- fincen_114 (FBAR) — aggregate foreign-account peak > $10,000, US person ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.fbar_aggregate_peak_usd = 10001;
  check("FBAR: resident individual, $10,001 peak -> Required", "fincen_114", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.fbar_aggregate_peak_usd = 10000;
  check("FBAR: resident individual, exactly $10,000 (not 'exceeds') -> N/A", "fincen_114", false, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.fbar_aggregate_peak_usd = 9999;
  check("FBAR: resident individual, $9,999 peak -> N/A", "fincen_114", false, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.fbar_aggregate_peak_usd = 50000;
  check("FBAR: domestic C-corp with its own $50,000 foreign account -> Required (entity fallback)", "fincen_114", true, CCORP.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "partnership";
  us.fbar_aggregate_peak_usd = 50000;
  check("FBAR: domestic partnership (1065) with its own $50,000 foreign account -> Required (broadened past C-corp-only)", "fincen_114", true, CCORP.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.fbar_aggregate_peak_usd = 50000;
  check("FBAR: genuine NRA (not a US person), $50,000 peak -> N/A", "fincen_114", false, NRA.router, india, us);
})();

// ---- form_8938 (FATCA) — threshold varies by filing status + abroad status ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.filing_status = "single";
  us.fbar_aggregate_peak_usd = 75001;
  check("FATCA: US-resident single, $75,001 any-time (threshold $75,000) -> Required", "form_8938", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.filing_status = "single";
  us.fbar_aggregate_peak_usd = 74999;
  check("FATCA: US-resident single, $74,999 any-time -> N/A", "form_8938", false, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.fbar_aggregate_peak_usd = 100000;
  check("FATCA: domestic C-corp, $100,000 any-time -> Required (entity fallback)", "form_8938", true, CCORP.router, india, us);
})();

// ---- form_5471 (CFC) — US person owns >=10% of a foreign corporation ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.foreign_entities = { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corporation_name: "Test Co", country_of_incorporation: "IN", ownership_percentage: 25 }], pfic_holdings: [] };
  check("CFC: resident individual owns 25% of a foreign corp -> Required", "form_5471", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.foreign_entities = { owns_10_percent_foreign_corp: false, foreign_corporations: [], pfic_holdings: [] };
  check("CFC: resident individual, no foreign corp -> N/A", "form_5471", false, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "partnership";
  us.foreign_entities = { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corporation_name: "Test Co", country_of_incorporation: "IN", ownership_percentage: 40 }], pfic_holdings: [] };
  check("CFC: domestic partnership owns 40% of a foreign corp -> Required (broadened past C-corp-only)", "form_5471", true, CCORP.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.foreign_entities = { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corporation_name: "Test Co", country_of_incorporation: "IN", ownership_percentage: 100 }], pfic_holdings: [] };
  check("CFC: genuine NRA owns 100% of a foreign corp -> N/A (not a US person)", "form_5471", false, NRA.router, india, us);
})();

// ---- form_8621 (PFIC) — India mutual funds OR the US-side dedicated PFIC card ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.financial_holdings = { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "Test Fund", value_inr: 500000 }] };
  us.foreign_entities.pfic_holdings = [];
  check("PFIC: India-side mutual fund only (no US-side card filled) -> Required", "form_8621", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.financial_holdings = { has_financial_transactions: false, transactions: [] };
  us.foreign_entities.pfic_holdings = [{ asset_name: "Test Fund", holding_value_usd: 12000 }];
  us.foreign_entities.has_pfics = true;
  check("PFIC: US-side dedicated PFIC card only (no India-side mutual fund entry) -> Required (this was the bug)", "form_8621", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.financial_holdings = { has_financial_transactions: false, transactions: [] };
  us.foreign_entities.pfic_holdings = [];
  check("PFIC: neither field populated -> N/A", "form_8621", false, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  india.financial_holdings = { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "Test Fund", value_inr: 500000 }] };
  check("PFIC: genuine NRA with an India mutual fund -> N/A (not a US person)", "form_8621", false, NRA.router, india, us);
})();

// ---- form_8865 (foreign partnership) — confirmed unmodeled, must always be false ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  check("Form 8865: unmodeled feature gap, asserted false even for a rich resident profile", "form_8865", false, RESIDENT.router, india, us);
})();

// ---- form_3520 (foreign gifts/trusts) — US-persons-only (IRC section 6039F) ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.deductions = us.deductions || {};
  india.deductions = Object.assign({}, india.deductions, { s80C: Object.assign({}, (india.deductions || {}).s80C, { ppf_inr: 50000 }) });
  us.foreign_gifts_and_trusts = {};
  check("Form 3520: resident individual with a PPF contribution -> Required", "form_3520", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.deductions = Object.assign({}, india.deductions, { s80C: { epf_employee_inr: 0, ppf_inr: 0 } });
  us.foreign_gifts_and_trusts = { received_foreign_gifts_above_100k: true };
  check("Form 3520: resident individual received a foreign gift > $100k -> Required", "form_3520", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.deductions = Object.assign({}, india.deductions, { s80C: { epf_employee_inr: 0, ppf_inr: 0 } });
  us.foreign_gifts_and_trusts = { is_us_beneficiary_of_foreign_trust: true };
  check("Form 3520: resident individual is a foreign-trust beneficiary -> Required", "form_3520", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  india.deductions = Object.assign({}, india.deductions, { s80C: { epf_employee_inr: 0, ppf_inr: 0 } });
  us.foreign_gifts_and_trusts = { received_foreign_gifts_above_100k: true };
  check("Form 3520: genuine NRA who received a foreign gift > $100k -> N/A (not a US person, this was the bug)", "form_3520", false, NRA.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.deductions = Object.assign({}, india.deductions, { s80C: { epf_employee_inr: 0, ppf_inr: 0 } });
  us.foreign_gifts_and_trusts = {};
  check("Form 3520: resident individual, no PPF/EPF/gift/trust facts -> N/A", "form_3520", false, RESIDENT.router, india, us);
})();

// ---- form_nj1040 (NJ state return) — DAG-only by deliberate design (docs/
// GAP_TRACKER.md section H.7/H.7.3): the frozen engine's own
// computeUsStateTax has no New Jersey bracket data at all (CONST.US_STATES
// there only has CA/NY), so the shared constants.js CONST.DOCUMENTS
// catalog correctly has NO form_nj1040 entry — the engine's own
// documents[] structurally omits this row (not "included but false").
// Investigated as a possible bug during this same audit, traced back to
// H.7's own already-documented, already-verified decision — asserting the
// INTENDED asymmetry here, not "fixing" something that was correct.
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.state_residency = { primary_state_of_residence: "NJ", nj_actual_days_present: 200 };
  var r = WISING.analyze({ router: RESIDENT.router, india: india, us: us });
  var engineVal = docStatus(r.documents, "form_nj1040");
  var dagVal = dagDocStatus(RESIDENT.router, india, us, r.model, "form_nj1040");
  cases++;
  if (engineVal === undefined && dagVal === true) { pass++; console.log("  ok - NJ Form 1040: NJ resident -> DAG Required, engine structurally omits the row (deliberate H.7 asymmetry)"); }
  else { fail++; console.log("  FAIL - NJ Form 1040 asymmetry check (engine=" + engineVal + ", dag=" + dagVal + ")"); }
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.state_residency = { primary_state_of_residence: "CA", ca_retains_property_or_voter_reg: true };
  var r = WISING.analyze({ router: RESIDENT.router, india: india, us: us });
  var dagVal = dagDocStatus(RESIDENT.router, india, us, r.model, "form_nj1040");
  cases++;
  if (dagVal === false) { pass++; console.log("  ok - NJ Form 1040: CA resident -> DAG N/A"); }
  else { fail++; console.log("  FAIL - NJ Form 1040: CA resident should be DAG N/A (got " + dagVal + ")"); }
})();

console.log(pass + " passed, " + fail + " failed (Batch A)");

console.log("\n=== Batch B: US income-tax adjustment forms ===");

// ---- form_1116 (FTC) — India tax paid on income also taxable in the US ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.tax_credits = Object.assign({}, india.tax_credits, { tds_already_deducted_inr: 50000 });
  check("FTC 1116: resident individual, Indian tax paid -> Required", "form_1116", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "scorp";
  check("FTC 1116: domestic S-corp (pass-through, no entity-level 1116) -> N/A (deliberately not broadened past C-corp)", "form_1116", false, CCORP.router, india, us);
})();

// ---- form_2555 (FEIE) — claimed on the US-side Foreign Earned Income card ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.foreign_earned_income = Object.assign({}, us.foreign_earned_income, { claims_feie: true });
  check("FEIE: claims_feie = true -> Required", "form_2555", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.foreign_earned_income = Object.assign({}, us.foreign_earned_income, { claims_feie: false });
  check("FEIE: claims_feie = false -> N/A", "form_2555", false, RESIDENT.router, india, us);
})();

// ---- form_8833 (treaty-based position) — an ACTUAL treaty rate/residency claim, not just filing 1040-NR ----
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.nra_specific = Object.assign({}, us.nra_specific, { files_form_1040nr: true, treaty_rate_claims: [] });
  us.us_residency_detail = Object.assign({}, us.us_residency_detail, { dtaa_treaty_residence: "none" });
  check("Treaty position 8833: plain NRA, files 1040-NR, ZERO treaty claims -> N/A (this was the bug)", "form_8833", false, NRA.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.nra_specific = Object.assign({}, us.nra_specific, { files_form_1040nr: true, treaty_rate_claims: [{ income_type: "dividends", rate: 15 }] });
  check("Treaty position 8833: NRA with a real treaty-rate claim -> Required", "form_8833", true, NRA.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  check("Treaty position 8833: dual resident (Article 4 tie-breaker) -> Required", "form_8833", true, RESIDENT.router, india, us);
})();

// ---- form_1040nr (re-verify today's earlier fix still holds) ----
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  check("1040-NR: genuine NRA with files_form_1040nr=true on file -> Required", "form_1040nr", true, NRA.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  check("1040-NR: resident alien -> N/A", "form_1040nr", false, RESIDENT.router, india, us);
})();

// ---- form_8960 (NIIT) — MAGI over threshold AND net investment income present ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.filing_status = "single";
  us.income_us_source = Object.assign({}, us.income_us_source, { interest_us_source_usd: 5000 });
  check("NIIT 8960: single filer, real investment income, high total income -> Required", "form_8960", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.filing_status = "single";
  us.income_us_source = Object.assign({}, us.income_us_source, { interest_us_source_usd: 0, ordinary_dividends_us_source_usd: 0, ltcg_us_source_usd: 0, wages_w2: [] });
  india.domestic_income = { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: {} };
  india.capital_gains = {};
  india.other_sources = {};
  check("NIIT 8960: no net investment income at all -> N/A", "form_8960", false, RESIDENT.router, india, us);
})();

// ---- form_8959 (Additional Medicare Tax) — real tax owed ----
// additional_medicare_tax_owed_usd is computed client-side by layer1_us.html
// (Math.max(0, (totalMedicareWages - threshold) * 0.009)) and stored as an
// already-computed result; the frozen engine/DAG only reads it as a
// pass-through (normalize.js:2723), same pattern as files_form_1040nr. A
// synthetic profile must set this field directly to simulate what a real
// filled-out form would have produced from these wages.
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.filing_status = "single";
  us.income_us_source.wages_w2 = [{ employer_name: "Big Co", wages_box1_usd: 260000, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 60000, medicare_wages_box5_usd: 260000 } }];
  us.withholding_and_estimated = Object.assign({}, us.withholding_and_estimated, { additional_medicare_tax_owed_usd: 540 });
  check("Additional Medicare 8959: single, $260k wages (over $200k threshold) -> Required", "form_8959", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.filing_status = "single";
  us.income_us_source.wages_w2 = [{ employer_name: "Small Co", wages_box1_usd: 90000, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 15000, medicare_wages_box5_usd: 90000 } }];
  us.withholding_and_estimated = Object.assign({}, us.withholding_and_estimated, { additional_medicare_tax_owed_usd: 0 });
  check("Additional Medicare 8959: single, $90k wages -> N/A", "form_8959", false, RESIDENT.router, india, us);
})();

// ---- form_6251 (AMT) — real tentative-minimum-tax-over-regular-tax amount ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.equity_compensation = { iso_exercises: [{ shares_exercised: 5000, fmv_at_exercise_usd: 90, strike_price_usd: 5 }] };
  check("AMT 6251: large ISO bargain element -> Required", "form_6251", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.equity_compensation = { iso_exercises: [] };
  check("AMT 6251: no AMT preference items -> N/A", "form_6251", false, RESIDENT.router, india, us);
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B cumulative, " + cases + " total cases)");

console.log("\n=== Batch C: US state + procedural forms ===");

// ---- form_540 (CA resident return) / form_it201 (NY resident return) ----
// computeUsStateTax (computation.js:1133) only fires for individual filers,
// is null for NRAs (no state-source split modeled), and is null for
// non-individual entities (separate franchise/entity-level state regime,
// unmodeled — documented limitation, same "flag imprecision rather than
// model it" convention as the rest of the frozen engine).
(function () {
  // RESIDENT's base state_residency is already CA.
  check("CA Form 540: CA resident (base profile) -> Required", "form_540", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.state_residency = { primary_state_of_residence: "NY" };
  check("CA Form 540: NY resident -> N/A", "form_540", false, RESIDENT.router, india, us);
  check("NY Form IT-201: NY resident -> Required", "form_it201", true, RESIDENT.router, india, us);
})();
(function () {
  check("NY Form IT-201: CA resident (base profile) -> N/A", "form_it201", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.state_residency = { primary_state_of_residence: "CA" };
  check("CA Form 540: domestic C-corp with CA facts on file -> N/A (entity files separate franchise return, unmodeled)", "form_540", false, CCORP.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.state_residency = { primary_state_of_residence: "CA" };
  check("CA Form 540: NRA with CA facts on file -> N/A (no state-source split modeled for 1040-NR filers)", "form_540", false, NRA.router, india, us);
})();

// ---- form_8802 (Form 6166/US residency certification, mirrors India's TRC) ----
(function () {
  // RESIDENT is dual_resident_h1b -> res.dualResident true in the base profile.
  check("Form 8802: dual resident (base profile) -> Required", "form_8802", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  // NRA's base already claims usTreatyResidence = "IN".
  check("Form 8802: NRA claiming a DTAA treaty-residence position (base profile) -> Required", "form_8802", true, NRA.router, NRA.india, NRA.us);
})();
(function () {
  // CCORP's base has no treaty-residence facts and is not a dual resident.
  check("Form 8802: domestic C-corp with no treaty-residence facts on file (base profile) -> N/A", "form_8802", false, CCORP.router, CCORP.india, CCORP.us);
})();

// ---- form_4868 (federal extension request) ----
(function () {
  check("Form 4868: has US scope (RESIDENT base profile) -> Required", "form_4868", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  var INDIA_ONLY = base("india_only_ca_client");
  check("Form 4868: India-only profile with no US scope -> N/A", "form_4868", false, INDIA_ONLY.router, INDIA_ONLY.india, INDIA_ONLY.us);
})();

// ---- form_8288 (FIRPTA withholding) ----
(function () {
  // NRA's base already has us_real_property_disposed=true, firpta_withholding_usd=45000.
  check("Form 8288: NRA disposed US real property, withholding collected (base profile) -> Required", "form_8288", true, NRA.router, NRA.india, NRA.us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.nra_specific = Object.assign({}, us.nra_specific, { us_real_property_disposed: false, firpta_withholding_usd: 0 });
  check("Form 8288: NRA with no US real property disposition -> N/A", "form_8288", false, NRA.router, india, us);
})();
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  us.nra_specific = Object.assign({}, us.nra_specific, { us_real_property_disposed: true, firpta_withholding_usd: 0 });
  check("Form 8288: NRA disposed US real property but a full 8288-B exemption reduced withholding to $0 -> N/A", "form_8288", false, NRA.router, india, us);
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B + C cumulative, " + cases + " total cases)");

console.log("\n=== Batch D: India forms ===");
var US_ONLY = base("us_only_cpa_client");

// ---- form_67 (India FTC / Form 44) & schedule_fsi_tr — real bugs found ----
// Both were: (a) form_67 used the WRONG field (foreignSourceTotal — the
// FOREIGN-from-the-US-model's-own-view income, an unrelated US Form 1116
// concept) OR'd with a bare isResident catch-all that made it unconditionally
// "Required" for any India resident/RNOR; (b) schedule_fsi_tr had no
// residency gate at all. Confirmed false positives on 6/12 (form_67) and
// 3/12 (schedule_fsi_tr) demo profiles before the fix.
(function () {
  // RESIDENT: ROR, real US-source income + US tax paid on file (base profile).
  check("Form 67 (India FTC): ROR with US-source income and US tax paid (base profile) -> Required", "form_67", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
  check("Schedule FSI/TR: ROR with US-source income and US tax paid (base profile) -> Required", "schedule_fsi_tr", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.residency_detail = Object.assign({}, india.residency_detail, { final_india_residency_status: "NR" });
  check("Form 67: plain NR with US-source income/US tax paid on file -> N/A (this was the bug — NR isn't taxed on foreign income in India at all)", "form_67", false, RESIDENT.router, india, us);
  check("Schedule FSI/TR: plain NR with US-source income/US tax paid on file -> N/A (this was the bug)", "schedule_fsi_tr", false, RESIDENT.router, india, us);
})();
(function () {
  // ROR but zero US-source income and zero US tax paid on file.
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.income_us_source = {};
  us.withholding_and_estimated = {};
  check("Form 67: ROR with zero US income/US tax on file -> N/A (this was the bug — bare isResident catch-all)", "form_67", false, RESIDENT.router, india, us);
  check("Schedule FSI/TR: ROR with zero US income/US tax on file -> N/A", "schedule_fsi_tr", false, RESIDENT.router, india, us);
})();

// ---- schedule_fa (Foreign Assets) — real bug found: financial_holdings
// (foreign brokerage/securities, separately FBAR/FATCA-reportable) was never
// checked, only bank_accounts and usSourceTotal. ----
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.income_us_source = {};
  us.bank_accounts = [];
  us.fbar_aggregate_peak_usd = 0;
  us.financial_holdings = [{ asset_name: "Vanguard Brokerage", peak_balance_usd: 500000, country: "US", is_fbar_reportable: true }];
  check("Schedule FA: ROR holding ONLY US brokerage securities (no bank account, no US income) -> Required (this was the bug)", "schedule_fa", true, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.income_us_source = {};
  us.bank_accounts = [];
  us.fbar_aggregate_peak_usd = 0;
  us.financial_holdings = [];
  check("Schedule FA: ROR with no foreign assets of any kind on file -> N/A", "schedule_fa", false, RESIDENT.router, india, us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  india.residency_detail = Object.assign({}, india.residency_detail, { final_india_residency_status: "NR" });
  check("Schedule FA: plain NR with foreign accounts on file -> N/A (NR has no Schedule FA obligation)", "schedule_fa", false, RESIDENT.router, india, us);
})();

// ---- trc (Tax Residency Certificate) / form_10f — confirmed correct ----
(function () {
  check("TRC: dual resident (RESIDENT base profile) -> Required", "trc", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
  check("Form 10F: dual resident (RESIDENT base profile) -> Required", "form_10f", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  check("TRC: domestic C-corp with no treaty-residence facts on file -> N/A", "trc", false, CCORP.router, CCORP.india, CCORP.us);
  check("Form 10F: domestic C-corp with no treaty-residence facts on file -> N/A", "form_10f", false, CCORP.router, CCORP.india, CCORP.us);
})();

// ---- form_15ca_cb / lrs_form_a2 (outward remittance certificates) — confirmed correct, share the same underlying LRS-remittance signal ----
(function () {
  // RESIDENT's base already has a nonzero LRS remittance on file.
  check("Form 145/146 (was 15CA/15CB): LRS remittance on file (base profile) -> Required", "form_15ca_cb", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
  check("LRS Form A2: LRS remittance on file (base profile) -> Required", "lrs_form_a2", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  // RESIDENT's india has a quarters[] structure that indiaAnnualSlice sums
  // and prefers over the top-level object — delete it so the mutation below
  // (the fallback path) actually takes effect.
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  delete india.quarters;
  india.lrs_outbound = { total_lrs_remitted_this_fy_inr: 0 };
  check("Form 145/146: zero LRS remittance -> N/A", "form_15ca_cb", false, RESIDENT.router, india, us);
  check("LRS Form A2: zero LRS remittance -> N/A", "lrs_form_a2", false, RESIDENT.router, india, us);
})();

// ---- schedule_al (Assets & Liabilities) — confirmed correct ----
(function () {
  // RESIDENT: individual, ₹40.17L total income — below the ₹50L threshold.
  check("Schedule AL: individual below ₹50L total income (base profile) -> N/A", "schedule_al", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  // CCORP: company, ₹8cr total income — well above ₹50L, but companies carry
  // their own unconditional balance-sheet requirement, not this ITR-2/3 rule.
  check("Schedule AL: domestic company well above ₹50L (base profile) -> N/A (companies have their own unconditional balance-sheet requirement)", "schedule_al", false, CCORP.router, CCORP.india, CCORP.us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  delete india.quarters;
  india.domestic_income.salary = { has_salary_income: true, taxable_salary_inr: 8000000 };
  check("Schedule AL: individual with ₹80L+ salary alone -> Required", "schedule_al", true, RESIDENT.router, india, us);
})();

// ---- form_3cb_3cd (Tax Audit Report) — confirmed correct ----
(function () {
  // CCORP: a company is a statutory-audit case unconditionally.
  check("Form 3CB/3CD: domestic company (base profile) -> Required (unconditional, Companies Act)", "form_3cb_3cd", true, CCORP.router, CCORP.india, CCORP.us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  delete india.quarters;
  india.domestic_income.business_income.business_entries = [{
    business_name: "High-Turnover Trading Co", nature: "retail trading", presumptive_scheme: null,
    turnover_inr: 150000000, gross_receipts_inr: 150000000, expenses: {}
  }];
  check("Form 3CB/3CD: individual, ₹15cr turnover (over the ₹10cr non-digital threshold) -> Required", "form_3cb_3cd", true, RESIDENT.router, india, us);
})();
(function () {
  // RESIDENT's base business turnover (₹9L) is well under the s.44AB threshold.
  check("Form 3CB/3CD: individual with small (₹9L) business turnover (base profile) -> N/A", "form_3cb_3cd", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();

// ---- form_3ceb (Transfer Pricing Certification) — confirmed correct ----
(function () {
  // CCORP's base already owns 100% of an Indian subsidiary (a real AE relationship).
  check("Form 3CEB: cross-border AE ownership on file (CCORP base profile) -> Required", "form_3ceb", true, CCORP.router, CCORP.india, CCORP.us);
})();
(function () {
  check("Form 3CEB: no foreign-corp ownership on file (RESIDENT base profile) -> N/A", "form_3ceb", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();

// ---- form_26as_ais_tis / form_16_16a (India reconciliation forms) — confirmed correct ----
(function () {
  check("Form 26AS/AIS/TIS: has India scope (RESIDENT base profile) -> Required", "form_26as_ais_tis", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
  check("Form 16/16A: has India scope (RESIDENT base profile) -> Required", "form_16_16a", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  check("Form 26AS/AIS/TIS: US-only profile, no India scope -> N/A", "form_26as_ais_tis", false, US_ONLY.router, US_ONLY.india, US_ONLY.us);
  check("Form 16/16A: US-only profile, no India scope -> N/A", "form_16_16a", false, US_ONLY.router, US_ONLY.india, US_ONLY.us);
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B + C + D cumulative, " + cases + " total cases)");

console.log("\n=== Batch E: catalog completeness + Compliance Calendar dates ===");

// ---- form_8858 (Foreign Disregarded Entities) — a catalog-completeness gap
// found in the final audit pass: Reg. §1.6038-2 requires this from a US
// person who owns a foreign disregarded entity, and Layer 1 US collects the
// signal (a Schedule C row with llc_type "foreign_disregarded" — the same
// field normalize.js already reads to route income into
// foreignSelfEmployment), but the 31-entry catalog had no Form 8858 row at
// all. Added DAG-only (same H.7/form_nj1040 pattern) since this is a brand
// new document, not a fix to an existing trigger. Engine structurally has
// no row for it — same asymmetry test shape as the NJ Form 1040 case above.
(function () {
  var GRACE = base("us_citizen_expat_india");
  var r = WISING.analyze({ router: GRACE.router, india: GRACE.india, us: GRACE.us });
  var engineVal = docStatus(r.documents, "form_8858");
  var dagVal = dagDocStatus(GRACE.router, GRACE.india, GRACE.us, r.model, "form_8858");
  cases++;
  if (engineVal === undefined && dagVal === true) { pass++; console.log("  ok - Form 8858: real foreign disregarded entity on file (Grace Thomas base profile) -> DAG Required, engine structurally omits the row (deliberate, brand-new document)"); }
  else { fail++; console.log("  FAIL - Form 8858 positive check (expected engine=undefined, dag=true; got engine=" + engineVal + ", dag=" + dagVal + ")"); }
})();
(function () {
  var r = WISING.analyze({ router: RESIDENT.router, india: RESIDENT.india, us: RESIDENT.us });
  var dagVal = dagDocStatus(RESIDENT.router, RESIDENT.india, RESIDENT.us, r.model, "form_8858");
  cases++;
  if (dagVal === false) { pass++; console.log("  ok - Form 8858: no foreign disregarded entity on file (RESIDENT base profile) -> DAG N/A"); }
  else { fail++; console.log("  FAIL - Form 8858 negative check (expected dag=false, got " + dagVal + ")"); }
})();

// ---- Compliance Calendar: s.139(1) Explanation 2(a)(ii) — a s.92E
// transfer-pricing reporting obligation (form_3ceb's own signal) gets 30 Nov,
// one month past the plain audit-case date (31 Oct) — was missing this tier
// entirely, so an entity like us_ccorp_indian_sub (a company that ALSO has
// a Form 3CEB obligation via its Indian subsidiary) showed 31 Oct, one month
// earlier than its real statutory deadline. Checked directly against
// monitoring.calendar (not the check() helper, which only covers documents[]).
(function () {
  var r = WISING.analyze({ router: CCORP.router, india: CCORP.india, us: CCORP.us });
  var row = r.monitoring.calendar.all.filter(function (x) { return x.cat === "Filing" && x.jur === "IN"; })[0];
  cases++;
  var ok = row && row.date.getMonth() === 10 && row.date.getDate() === 30; // month is 0-indexed: 10 = November
  if (ok) { pass++; console.log("  ok - Compliance Calendar: s.92E obligation on file (CCORP base profile) -> India ITR due 30 Nov"); }
  else { fail++; console.log("  FAIL - Compliance Calendar s.92E date check (got " + (row && row.dateLabel)); }
})();
(function () {
  var r = WISING.analyze({ router: RESIDENT.router, india: RESIDENT.india, us: RESIDENT.us });
  var row = r.monitoring.calendar.all.filter(function (x) { return x.cat === "Filing" && x.jur === "IN"; })[0];
  cases++;
  var ok = row && row.date.getMonth() === 6 && row.date.getDate() === 31; // 6 = July
  if (ok) { pass++; console.log("  ok - Compliance Calendar: no s.92E obligation, non-audit case (RESIDENT base profile) -> India ITR due 31 Jul"); }
  else { fail++; console.log("  FAIL - Compliance Calendar non-audit-case date check (got " + (row && row.dateLabel)); }
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B + C + D + E cumulative, " + cases + " total cases)");

console.log("\n=== Batch F: catalog completeness, round 2 (external-research pass) ===");
// docs/GAP_TRACKER.md, second catalog-completeness pass: canonical US/India
// cross-border checklists (IRS instructions, practitioner checklists;
// incometax.gov.in guidance) cross-referenced against the 32-entry catalog.
// 3 more real, well-supported gaps found — all DAG-only (brand-new
// documents, same asymmetry-test shape as form_8858 above).
function dagOnlyDocCheck(label, docId, expected, router, india, us) {
  cases++;
  var r = WISING.analyze({ router: router, india: india, us: us });
  var engineVal = docStatus(r.documents, docId);
  var dagVal = dagDocStatus(router, india, us, r.model, docId);
  if (engineVal === undefined && dagVal === expected) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + " (expected engine=undefined dag=" + expected + "; got engine=" + engineVal + " dag=" + dagVal + ")"); }
}

// ---- form_3520a (Foreign Trust Annual Return) — companion to form_3520,
// only the OWNERSHIP subset (ppfInr/epfInr), not the gift/beneficiary subset.
dagOnlyDocCheck("Form 3520-A: US person with a real PPF/EPF account on file (RESIDENT base profile) -> Required", "form_3520a", true, RESIDENT.router, RESIDENT.india, RESIDENT.us);
(function () {
  var india = clone(NRA.india), us = clone(NRA.us);
  dagOnlyDocCheck("Form 3520-A: genuine NRA (not a US person) -> N/A", "form_3520a", false, NRA.router, india, us);
})();

// ---- form_29b (MAT Report) — real signal already computed by the frozen
// engine (computed.indiaTax.matApplied) but never promoted to a document.
(function () {
  var IP = base("india_pvt_ltd");
  var india = clone(IP.india), us = clone(IP.us);
  delete india.profile.opt_115baa;
  india.profile.mat_book_profit = 500000000;
  dagOnlyDocCheck("Form 29B: company where MAT actually exceeds normal tax -> Required", "form_29b", true, IP.router, india, us);
})();
(function () {
  var IP = base("india_pvt_ltd");
  dagOnlyDocCheck("Form 29B: company under s.115BAA (MAT never applies, base profile) -> N/A", "form_29b", false, IP.router, IP.india, IP.us);
})();

// ---- form_10iea (Old Regime Election) — same condition already
// independently derived for the diagnostic-only checks-registry entry.
(function () {
  var IR = base("india_ror_us_income");
  dagOnlyDocCheck("Form 10-IEA: old regime elected + real business income on file (base profile) -> Required", "form_10iea", true, IR.router, IR.india, IR.us);
})();
(function () {
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  dagOnlyDocCheck("Form 10-IEA: new regime (RESIDENT base profile) -> N/A", "form_10iea", false, RESIDENT.router, india, us);
})();
(function () {
  var IR = base("india_ror_us_income");
  var india = clone(IR.india), us = clone(IR.us);
  delete india.quarters;
  india.domestic_income.business_income = { has_business_or_fo_income: false };
  dagOnlyDocCheck("Form 10-IEA: old regime but no business/professional income -> N/A (a salaried filer just ticks a box on the ITR itself)", "form_10iea", false, IR.router, india, us);
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B + C + D + E + F cumulative, " + cases + " total cases)");

console.log("\n=== Batch G: company-side regime-election forms (Form 10-IC / Form 10-ID) ===");
// Company-side equivalents of form_10iea, following the same user question:
// "is Form 10-IEA for the company?" -> no, it's individual/HUF only. These
// two are the actual company forms — mutually exclusive elections, each
// with its own form.
(function () {
  // india_pvt_ltd's base profile already has opt_115baa: true on file.
  var IP = base("india_pvt_ltd");
  dagOnlyDocCheck("Form 10-IC: company elected s.115BAA (base profile) -> Required", "form_10ic", true, IP.router, IP.india, IP.us);
  dagOnlyDocCheck("Form 10-ID: same company, s.115BAB NOT elected (base profile) -> N/A", "form_10id", false, IP.router, IP.india, IP.us);
})();
(function () {
  var IP = base("india_pvt_ltd");
  var india = clone(IP.india), us = clone(IP.us);
  delete india.profile.opt_115baa;
  india.profile.opt_115bab = true;
  dagOnlyDocCheck("Form 10-ID: company elected s.115BAB instead -> Required", "form_10id", true, IP.router, india, us);
  dagOnlyDocCheck("Form 10-IC: same company, s.115BAA NOT elected -> N/A", "form_10ic", false, IP.router, india, us);
})();
(function () {
  var IP = base("india_pvt_ltd");
  var india = clone(IP.india), us = clone(IP.us);
  delete india.profile.opt_115baa;
  dagOnlyDocCheck("Form 10-IC: company under the default rate, no concessional election -> N/A", "form_10ic", false, IP.router, india, us);
})();
(function () {
  // RESIDENT is an individual, not a company — neither form applies
  // regardless of any regime facts on file (companies use 10-IC/10-ID,
  // individuals use 10-IEA — mutually exclusive by entity kind).
  dagOnlyDocCheck("Form 10-IC: individual (RESIDENT base profile) -> N/A (not a company)", "form_10ic", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
  dagOnlyDocCheck("Form 10-ID: individual (RESIDENT base profile) -> N/A (not a company)", "form_10id", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B + C + D + E + F + G cumulative, " + cases + " total cases)");

console.log("\n=== Batch H: entity-return filing obligations (Entity Trust Parity Plan §3.6) ===");
// docs/ENTITY_TRUST_PARITY_PLAN.md §3.6/§5.2: "Form 1120 itself, Schedule
// M-1/M-2, K-1 issuance obligations, Form 5471/8865" had never had their own
// audit round. Form 1120's own Return Form logic was already reviewed
// (Batch E) and confirmed correct; Form 5471/8865 were already reviewed
// (Batch A) and already broadened past individual-only ownership to any
// domestic entity (isUsPerson). What was missing: Schedule L/M-1/M-2 (the
// entity's own balance-sheet + book-tax reconciliation, distinct from the
// return-form selection) and K-1 issuance to owners — two brand-new
// documents, DAG-only per the standing frozen-engine policy.
//
// A synthetic "partnership"/"scorp"/"trust" clone is built here by cloning
// the CCORP (us_ccorp_indian_sub) base profile and overriding
// us.profile.tax_entity_type — the same field agg10-nodes.js's entityResult
// reads (usT === "scorp"/"partnership"/"trust"), so this exercises real
// entity-kind routing rather than a hand-built fake.
function dagOnlyDocCheckReturn(label, docId, expected, router, india, us) {
  cases++;
  var r = WISING.analyze({ router: router, india: india, us: us });
  var engineVal = docStatus(r.documents, docId);
  var dagVal = dagDocStatus(router, india, us, r.model, docId);
  var ok = engineVal === undefined && dagVal === expected;
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + " (expected engine=undefined dag=" + expected + "; got engine=" + engineVal + " dag=" + dagVal + ")"); }
  return ok;
}

// ---- schedule_m1_m2 (Form 1120/1120-S/1065 Schedules L/M-1/M-2) ----
(function () {
  // CCORP's base profile has no corporate_financials.schedule_l at all —
  // total assets defaults to $0, well under either threshold.
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: C-corp with no balance-sheet data on file -> N/A", "schedule_m1_m2", false, CCORP.router, CCORP.india, CCORP.us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.corporate_financials = us.corporate_financials || {};
  us.corporate_financials.schedule_l = { assets_beginning: 0, assets_ending: 5000000 };
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: C-corp, $5,000,000 total assets -> Required", "schedule_m1_m2", true, CCORP.router, india, us);
})();
(function () {
  // Corporation exemption is "under $250,000" — exactly at the threshold no
  // longer qualifies (same "exceeds/reaches" precision as Batch A's FBAR
  // $10,000 boundary test).
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.corporate_financials = us.corporate_financials || {};
  us.corporate_financials.schedule_l = { assets_beginning: 0, assets_ending: 250000 };
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: C-corp, exactly $250,000 total assets -> Required", "schedule_m1_m2", true, CCORP.router, india, us);
})();
(function () {
  // Partnership exemption threshold is $1,000,000, not $250,000 — $500,000
  // of assets is over the corporate threshold but under the partnership
  // one, proving the two thresholds aren't conflated.
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "partnership";
  us.corporate_financials = us.corporate_financials || {};
  us.corporate_financials.schedule_l = { assets_beginning: 0, assets_ending: 500000 };
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: partnership, $500,000 assets (over the $250k corp threshold, under the $1M partnership one) -> N/A", "schedule_m1_m2", false, CCORP.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "partnership";
  us.corporate_financials = us.corporate_financials || {};
  us.corporate_financials.schedule_l = { assets_beginning: 0, assets_ending: 1500000 };
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: partnership, $1,500,000 assets -> Required", "schedule_m1_m2", true, CCORP.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "scorp";
  us.corporate_financials = us.corporate_financials || {};
  us.corporate_financials.schedule_l = { assets_beginning: 0, assets_ending: 300000 };
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: S-corp, $300,000 assets -> Required", "schedule_m1_m2", true, CCORP.router, india, us);
})();
(function () {
  // Form 1041 (trust/estate) isn't one of the three return forms this
  // schedule attaches to at all, regardless of assets on file.
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "trust";
  us.corporate_financials = us.corporate_financials || {};
  us.corporate_financials.schedule_l = { assets_beginning: 0, assets_ending: 5000000 };
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: trust (Form 1041), even with $5,000,000 of assets on file -> N/A (wrong form entirely)", "schedule_m1_m2", false, CCORP.router, india, us);
})();
(function () {
  dagOnlyDocCheckReturn("Schedule L/M-1/M-2: individual (RESIDENT base profile) -> N/A (not an entity return at all)", "schedule_m1_m2", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();

// ---- k1_issuance (Schedule K-1 issuance to owners) ----
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "partnership";
  dagOnlyDocCheckReturn("K-1 issuance: partnership -> Required (no small-entity exemption, unlike Schedule M-1/M-2)", "k1_issuance", true, CCORP.router, india, us);
})();
(function () {
  var india = clone(CCORP.india), us = clone(CCORP.us);
  us.profile.tax_entity_type = "scorp";
  dagOnlyDocCheckReturn("K-1 issuance: S-corp -> Required", "k1_issuance", true, CCORP.router, india, us);
})();
(function () {
  // C-corps distribute to shareholders via Form 1099-DIV, not Schedule K-1 —
  // K-1 is a pass-through-entity concept only.
  dagOnlyDocCheckReturn("K-1 issuance: C-corp (CCORP base profile) -> N/A (uses 1099-DIV, not K-1)", "k1_issuance", false, CCORP.router, CCORP.india, CCORP.us);
})();
(function () {
  dagOnlyDocCheckReturn("K-1 issuance: individual (RESIDENT base profile) -> N/A", "k1_issuance", false, RESIDENT.router, RESIDENT.india, RESIDENT.us);
})();
(function () {
  // The trust-with-a-real-distribution branch (Form 1041 K-1s go only to
  // beneficiaries who actually received a distribution, via
  // usTaxResult.trustDistributedUsd) can't be exercised through this file's
  // own graph.resolve(["buildDocumentsResult"], ...) — report-batch1-nodes.js
  // is a standalone subgraph that pulls in ustax-nodes.js's plain
  // individual-only usTaxResult, not ustax-full-nodes.js's entity-routed one
  // (that only gets merged in via assets-nodes.js -> checks-registry-nodes.js
  // -> calendar-amounts-nodes.js, the actual graph the production app uses,
  // per monitor-next/lib/dag-adapter.js). A pre-existing scope limitation of
  // this test file, not something introduced by this batch — verified
  // instead directly against the real production graph below, the same one
  // dag-adapter.js actually resolves against.
  var prodNodes = require("./calendar-amounts-nodes.js").NODES;
  var prodGraph = createGraph(prodNodes);
  var india = clone(RESIDENT.india), us = clone(RESIDENT.us);
  us.profile.tax_entity_type = "trust";
  var r = WISING.analyze({ router: RESIDENT.router, india: india, us: us });
  var ctx = { router: RESIDENT.router, india: india, us: us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = prodGraph.resolve(["buildDocumentsResult"], ctx).values.buildDocumentsResult;
  var required = !!(out.filter(function (x) { return x.id === "k1_issuance"; })[0] || {}).required;
  cases++;
  if (required) { pass++; console.log("  ok - K-1 issuance: trust (Form 1041) with real distributed income on file -> Required (verified against the full production graph)"); }
  else { fail++; console.log("  FAIL - K-1 issuance: trust with real distributed income -> expected Required, got N/A (full production graph)"); }
})();

console.log(pass + " passed, " + fail + " failed (Batch A + B + C + D + E + F + G + H cumulative, " + cases + " total cases)");
process.exit(fail > 0 ? 1 : 0);

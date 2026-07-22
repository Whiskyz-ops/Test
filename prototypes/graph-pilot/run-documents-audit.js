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
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
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

console.log("\n" + pass + " passed, " + fail + " failed (Batch A: US information returns + NJ engine/DAG parity fix)");
process.exit(fail > 0 ? 1 : 0);

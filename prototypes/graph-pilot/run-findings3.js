"use strict";
/* ============================================================================
 * Verifies findings-batch3-nodes.js (CFL-6, batch 3: form_10iea,
 * form_1099da_awareness, fx_basis, tax_year_mismatch, pfic, cfc,
 * cfc_below_threshold, transfer_pricing, no_totalization_agreement,
 * niit_medicare_not_creditable, pe_article7, retirement_mismatch,
 * deemed_dividend_buyback_mismatch, promoter_buyback_additional_tax,
 * foreign_gift_3520, covered_expat_gift_tax, state_treaty_not_binding,
 * nra_w8ben_missing, firpta) against all 11 real profiles.
 *
 * Run: node prototypes/graph-pilot/run-findings3.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./findings-batch3-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1); }
function findingsEqual(a, b) {
  var keys = ["id", "severity", "category", "title", "detail", "recommendation", "amountUsd"];
  var ok = keys.every(function (k) {
    if (typeof a[k] === "number") return close(a[k], b[k] || 0, 1);
    return a[k] === b[k];
  });
  return ok && JSON.stringify(a.refs) === JSON.stringify(b.refs);
}

var BATCH3_IDS = ["form_10iea", "form_1099da_awareness", "fx_basis", "tax_year_mismatch", "pfic", "cfc",
  "cfc_below_threshold", "transfer_pricing", "no_totalization_agreement", "niit_medicare_not_creditable",
  "pe_article7", "retirement_mismatch", "deemed_dividend_buyback_mismatch", "promoter_buyback_additional_tax",
  "foreign_gift_3520", "covered_expat_gift_tax", "state_treaty_not_binding", "nra_w8ben_missing", "firpta"];

console.log("Closing CFL-6 batch 3 (" + BATCH3_IDS.length + " finding IDs), run against all " + WISING.PROFILES.length + " real profiles\n");
console.log("Full parity asserted on every profile — none of these 19 IDs read usTaxResult's individual-path-only");
console.log("figures in a way that breaks for US-entity/NRA profiles (seTaxUsd/niitUsd/additionalMedicareUsd are");
console.log("resident-path US tax fields, same as amtUsd already proven safe in run-findings.js's batch 1).\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["findingsBatch3Result"], ctx).values.findingsBatch3Result;
  var real = r.findings.filter(function (f) { return BATCH3_IDS.indexOf(f.id) !== -1; });

  console.log(p.id);
  check("finding IDs match exactly", JSON.stringify(out.map(function (f) { return f.id; }).sort()) === JSON.stringify(real.map(function (f) { return f.id; }).sort()),
    "graph=" + JSON.stringify(out.map(function (f) { return f.id; })) + " prod=" + JSON.stringify(real.map(function (f) { return f.id; })));
  out.forEach(function (f) {
    var rf = real.filter(function (x) { return x.id === f.id; })[0];
    if (!rf) return;
    check(f.id + " matches exactly (all fields)", findingsEqual(f, rf), "graph=" + JSON.stringify(f) + " prod=" + JSON.stringify(rf));
  });
  console.log("");
});

// ---- synthetic cases: 2 of the 19 IDs never fire on any of the 11 real
// profiles (form_1099da_awareness, deemed_dividend_buyback_mismatch) —
// checked directly against the real engine here, same discipline as
// run-crossbasis.js's IN-41 case / run-findings2.js's batch-2 cases.
console.log("-- synthetic cases: the 2 IDs no real profile exercises --");
var usIndividual3 = { profile: { filing_status: "single" }, us_residency_detail: { is_us_citizen: true, final_us_residency_status: "RESIDENT_ALIEN" } };
function runSynthetic3(label, router, india, expectId) {
  var r = WISING.analyze({ router: router, india: india, us: usIndividual3 });
  var real = r.findings.filter(function (f) { return f.id === expectId; });
  var ctx = { router: router, india: india, us: usIndividual3, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["findingsBatch3Result"], ctx).values.findingsBatch3Result.filter(function (f) { return f.id === expectId; });
  check(label + ": fires in production", real.length === 1, JSON.stringify(real));
  check(label + ": DAG matches production exactly", real.length === 1 && out.length === 1 && findingsEqual(out[0], real[0]),
    "graph=" + JSON.stringify(out) + " prod=" + JSON.stringify(real));
}

runSynthetic3("form_1099da_awareness", { is_us_citizen: true }, {
  profile: { entity_type: "individual", tax_regime: "NEW" },
  residency_detail: { final_india_residency_status: "ROR", days_in_india_current_year: 200 },
  financial_holdings: { transactions: [
    { asset_class: "vda_crypto", acquisition_date: "2023-01-01", sale_date: "2025-06-01", sale_value: 500000, sale_currency: "INR", purchase_value: 200000, purchase_currency: "INR" }
  ] }
}, "form_1099da_awareness");

runSynthetic3("deemed_dividend_buyback_mismatch", {}, {
  profile: { entity_type: "individual", tax_regime: "NEW" },
  residency_detail: { final_india_residency_status: "ROR", days_in_india_current_year: 200 },
  other_sources: { deemed_dividend_from_buyback_inr: 1000000 }
}, "deemed_dividend_buyback_mismatch");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

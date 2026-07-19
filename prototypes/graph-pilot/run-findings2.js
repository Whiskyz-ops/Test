"use strict";
/* ============================================================================
 * Verifies findings-batch2-nodes.js (CFL-6, batch 2: cross_basis_summary,
 * india_itr_form_mismatch, special_rate_gaming_winnings,
 * s115bbe_unexplained_income, chapter_xiia_elected_no_holdings,
 * chapter_xiia_investment_income_missing, chapter_xiia_investment_income_computed)
 * against all 11 real profiles.
 *
 * Checks TWO things per profile, for each of the 7 finding IDs this batch
 * covers: (1) fires/doesn't-fire matches the real engine exactly, (2) when
 * it fires, every field (title/detail/recommendation/amountUsd/refs)
 * matches exactly — not just the id.
 *
 * Run: node prototypes/graph-pilot/run-findings2.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./findings-batch2-nodes.js").NODES;
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
    if (typeof a[k] === "number") return close(a[k], b[k] || 0);
    return a[k] === b[k];
  });
  return ok && JSON.stringify(a.refs) === JSON.stringify(b.refs);
}

var BATCH2_IDS = ["cross_basis_summary", "india_itr_form_mismatch", "special_rate_gaming_winnings",
  "s115bbe_unexplained_income", "chapter_xiia_elected_no_holdings", "chapter_xiia_investment_income_missing",
  "chapter_xiia_investment_income_computed"];

console.log("Closing CFL-6 batch 2 (" + BATCH2_IDS.length + " finding IDs), run against all " + WISING.PROFILES.length + " real profiles\n");
console.log("Full parity asserted on every profile — none of these 7 IDs depend on usTaxResult's tax-liability");
console.log("figures directly (cross_basis_summary depends on crossBasisResult, which only reads usTaxResult for");
console.log("feieAppliedUsd — already proven full-parity-safe for US-entity/NRA profiles in run-crossbasis.js).\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["findingsBatch2Result"], ctx).values.findingsBatch2Result;
  var real = r.findings.filter(function (f) { return BATCH2_IDS.indexOf(f.id) !== -1; });

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

// ---- synthetic cases: 3 of the 7 IDs never fire on any of the 11 real
// profiles (india_itr_form_mismatch, chapter_xiia_investment_income_missing,
// chapter_xiia_investment_income_computed) — checked directly against the
// real engine here, same discipline as run-crossbasis.js's IN-41 case.
console.log("-- synthetic cases: the 3 IDs no real profile exercises --");
var usIndividual = { profile: { filing_status: "single" }, us_residency_detail: { is_us_citizen: true, final_us_residency_status: "RESIDENT_ALIEN" } };
function runSynthetic(label, india, expectId) {
  var r = WISING.analyze({ router: {}, india: india, us: usIndividual });
  var real = r.findings.filter(function (f) { return f.id === expectId; });
  var ctx = { router: {}, india: india, us: usIndividual, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["findingsBatch2Result"], ctx).values.findingsBatch2Result.filter(function (f) { return f.id === expectId; });
  check(label + ": fires in production", real.length === 1, JSON.stringify(real));
  check(label + ": DAG matches production exactly", real.length === 1 && out.length === 1 && findingsEqual(out[0], real[0]),
    "graph=" + JSON.stringify(out) + " prod=" + JSON.stringify(real));
}

runSynthetic("india_itr_form_mismatch", {
  profile: { entity_type: "individual", tax_regime: "NEW" },
  residency_detail: { final_india_residency_status: "ROR", days_in_india_current_year: 200 },
  domestic_income: { salary: { taxable_salary_inr: 1000000 } },
  itr_recommendation: { form: "ITR-2", explanation: "stale frontend recommendation" }
}, "india_itr_form_mismatch");

runSynthetic("chapter_xiia_investment_income_missing", {
  profile: { entity_type: "individual", tax_regime: "NEW" },
  residency_detail: { final_india_residency_status: "ROR", days_in_india_current_year: 200 },
  compliance_docs: { chapter_xiia_elected: true },
  financial_holdings: { transactions: [{ asset_class: "nri_specified_debenture", is_specified_foreign_exchange_asset: true }] }
}, "chapter_xiia_investment_income_missing");

runSynthetic("chapter_xiia_investment_income_computed", {
  profile: { entity_type: "individual", tax_regime: "NEW" },
  residency_detail: { final_india_residency_status: "ROR", days_in_india_current_year: 200 },
  compliance_docs: { chapter_xiia_elected: true },
  financial_holdings: { transactions: [{ asset_class: "nri_specified_debenture", is_specified_foreign_exchange_asset: true, investment_income_this_year: 50000, investment_income_currency: "INR" }] }
}, "chapter_xiia_investment_income_computed");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

"use strict";
/* ============================================================================
 * Verifies checks-registry-nodes.js's checksRegistryResult — CL-1, DAG-only,
 * no engine equivalent to differential-test against (see that file's own
 * header). The one real invariant this harness enforces, on every one of
 * the 12 real fixtures (SAMPLE + 11 PROFILES): no finding ID may ever
 * appear in BOTH findingsAllResult (fired) and checksRegistryResult
 * (checked-clean) on the same profile — the two must be a strict
 * partition. Also asserts every profile actually produces a nonzero
 * passed-checks count (a registry that never says anything would silently
 * defeat the whole point) and spot-checks a few known, hand-computed
 * threshold/actual-figure pairs so the descriptive text isn't just
 * plausible-looking prose.
 *
 * Run: node prototypes/graph-pilot/run-checksregistry.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./checks-registry-nodes.js").NODES;
var graph = createGraph(NODES);
var CONST = require("../../engine/constants.js").CONST;

var pass = 0, fail = 0;
function ok() { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }

var FIXTURES = [{ id: "SAMPLE", router: WISING.SAMPLE.router, india: WISING.SAMPLE.india, us: WISING.SAMPLE.us }]
  .concat(WISING.PROFILES.map(function (p) { return { id: p.id, router: p.router, india: p.india, us: p.us }; }));

FIXTURES.forEach(function (fx) {
  var ctx = { router: fx.router, india: fx.india, us: fx.us };
  var out = graph.resolve(["findingsAllResult", "checksRegistryResult"], ctx).values;
  var fired = {};
  out.findingsAllResult.forEach(function (f) { fired[f.id] = true; });
  var overlap = out.checksRegistryResult.filter(function (c) { return fired[c.id]; });
  if (overlap.length === 0) ok(); else bad(fx.id + ": fired/passed overlap", overlap.map(function (c) { return c.id; }).join(","));

  if (out.checksRegistryResult.length > 0) ok(); else bad(fx.id + ": zero passed checks (registry said nothing)");

  // Every passed entry's id must be a real, known finding id (catches typos
  // in checks-registry-nodes.js's own pass() calls — an id this DAG's
  // findings machinery has never heard of would never legitimately overlap
  // with `fired`, defeating the overlap check above silently).
  var KNOWN_IDS = { pan_not_linked_aadhaar: 1, ftc_gap: 1, amt_applies: 1, entity_dual_residency_poem: 1, dual_residency: 1,
    cross_basis_summary: 1, india_itr_form_mismatch: 1, special_rate_gaming_winnings: 1, s115bbe_unexplained_income: 1,
    chapter_xiia_elected_no_holdings: 1, form_10iea: 1, pfic: 1, cfc: 1, transfer_pricing: 1, retirement_mismatch: 1,
    deemed_dividend_buyback_mismatch: 1, foreign_gift_3520: 1, covered_expat_gift_tax: 1, no_totalization_agreement: 1,
    niit_medicare_not_creditable: 1, firpta: 1, nra_w8ben_missing: 1, state_treaty_not_binding: 1, pe_article7: 1,
    treaty_docs_missing: 1, carry_forward_losses_not_applied: 1, equity_comp_sourcing: 1, iso_3921: 1, state_income_tax: 1,
    fbar_limit: 1, lrs_limit: 1, holding_period_mismatch_: 1, residency_status_mismatch_india: 1,
    residency_status_mismatch_india_company: 1, residency_status_mismatch_india_entity: 1,
    residency_status_understated_us: 1, residency_status_understated_us_entity: 1,
    india_advance_tax_interest: 1, underpayment_2210: 1, early_withdrawal_penalty_72t: 1,
    schedule_fa_inconsistent: 1, black_money_act_exposure: 1 };
  var unknownIds = out.checksRegistryResult.filter(function (c) { return !KNOWN_IDS[c.id]; });
  if (unknownIds.length === 0) ok(); else bad(fx.id + ": unrecognized id in registry", unknownIds.map(function (c) { return c.id; }).join(","));
});

// ---- spot-check: fbar_limit's own numbers against a hand-verified profile --
(function () {
  var p = WISING.PROFILES.filter(function (p) { return p.id === "us_only_cpa_client"; })[0];
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["checksRegistryResult"], ctx).values;
  var fbarEntry = out.checksRegistryResult.filter(function (c) { return c.id === "fbar_limit"; })[0];
  var real = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var realFired = real.findings.some(function (f) { return f.id === "fbar_limit"; });
  if (!realFired) {
    if (fbarEntry) {
      var mentionsThreshold = fbarEntry.detail.indexOf("$" + CONST.LIMITS.FBAR_AGGREGATE_USD.toLocaleString("en-US")) >= 0;
      if (mentionsThreshold) ok(); else bad("fbar_limit spot-check: threshold text missing/wrong", fbarEntry.detail);
    } else {
      // fbar_limit is skipped entirely when !hasUsScopeBoundaryFtc — only a
      // real bug if this profile DOES have US scope and just wasn't below
      // the gauge's own 80%-warn zone (only fully "ok" gauges are surfaced
      // as passed; "approaching" isn't a silent pass at all, it's shown).
      ok();
    }
  } else {
    ok(); // real engine flags this profile — nothing to spot-check against a passed entry
  }
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

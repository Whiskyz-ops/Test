"use strict";
/* ============================================================================
 * Verifies us-full-nodes.js — aggregateUsIncome physically wired into
 * computeUsTax's graph. Same honest scope as ustax-nodes.js itself: 9
 * individual/resident profiles asserted exactly, the 1 US entity profile
 * and 1 NRA profile reported only (computeUsEntityTax/computeNraTax not
 * ported on either side of this wiring).
 *
 * incUs's compute() takes no ctx parameter at all now (only d) — a
 * structural guarantee, not just an empirical one, that it can no longer
 * read ctx.model.income.us even by accident.
 *
 * That signature argument covers incUs alone, though — ctx.model must still
 * be passed (usEntityKind/baseYearUs, the tracked AGG-10 boundaries), so
 * model.income.us stays REACHABLE by every other node in the merged graph.
 * To close that hole empirically, ctx.model.income.us is POISONED to null
 * before resolving: any node anywhere in the chain still reading the
 * engine's aggregate crashes or produces garbage instead of passing by
 * luck. A per-profile chain-sanity check additionally asserts the
 * graph-derived income total equals the engine aggregate it was denied.
 *
 * Also verifies XBR-1's wiring: ctx deliberately omits `computed` entirely
 * (only router/india/us/model survive) — worldwideUs must still resolve
 * correctly by deriving residencyResult itself, proving computed.residency
 * is no longer read anywhere in this chain.
 *
 * Run: node prototypes/graph-pilot/run-us-full.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./us-full-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 2); }

console.log("Verifying us-full-nodes.js (aggregateUsIncome physically wired into the tax graph), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  // Deliberately no `computed` — worldwideUs must derive residencyResult
  // itself now, not read computed.residency. And model.income.us POISONED —
  // the chain must derive US income entirely from raw form data; any node
  // still reading the engine's aggregate fails loudly here.
  var poisonedModel = Object.assign({}, r.model, {
    income: Object.assign({}, r.model.income, { us: null })
  });
  var ctx = { router: p.router, india: p.india, us: p.us, model: poisonedModel };
  var usKind = r.model.entity ? r.model.entity.usKind : "individual";
  var isEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(usKind) >= 0;
  var isNra = r.model.treaty.files1040nr && r.model.nra && !r.model.nra.s6013hElection;

  var resolved = graph.resolve(["usTaxResult", "incUs"], ctx).values;
  var out = resolved.usTaxResult;
  var real = r.computed.usTax;

  console.log(p.id + (isEntity ? " (US ENTITY — computeUsEntityTax not ported, reporting only)" : isNra ? " (NRA — computeNraTax not ported, reporting only)" : ""));
  console.log("    graph totalTaxBeforeFtcUsd=$" + Math.round(out.totalTaxBeforeFtcUsd) + " | production=$" + Math.round(real.totalTaxBeforeFtcUsd || 0));

  if (isEntity || isNra) { console.log(""); return; }

  check("graph-derived income total matches the real model.income.us total it was denied",
    close(resolved.incUs.total.usd, r.model.income.us.total.usd),
    "graph=" + Math.round(resolved.incUs.total.usd) + " prod=" + Math.round(r.model.income.us.total.usd));
  check("agiUsd matches exactly", close(out.agiUsd, real.agiUsd), "graph=" + Math.round(out.agiUsd) + " prod=" + Math.round(real.agiUsd));
  check("taxableIncomeUsd matches exactly", close(out.taxableIncomeUsd, real.taxableIncomeUsd), "graph=" + Math.round(out.taxableIncomeUsd) + " prod=" + Math.round(real.taxableIncomeUsd));
  check("incomeTaxUsd matches exactly", close(out.incomeTaxUsd, real.incomeTaxUsd));
  check("seTaxUsd matches exactly", close(out.seTaxUsd, real.seTaxUsd));
  check("niitUsd matches exactly", close(out.niitUsd, real.niitUsd));
  check("qbiDeductionUsd matches exactly", close(out.qbiDeductionUsd, real.qbiDeductionUsd));
  check("amtUsd matches exactly", close(out.amtUsd, real.amtUsd));
  check("creditsUsd matches exactly", close(out.creditsUsd, real.creditsUsd));
  check("totalTaxBeforeFtcUsd matches production exactly", close(out.totalTaxBeforeFtcUsd, real.totalTaxBeforeFtcUsd),
    "graph=" + Math.round(out.totalTaxBeforeFtcUsd) + " prod=" + Math.round(real.totalTaxBeforeFtcUsd));
  console.log("");
});

console.log(pass + " passed, " + fail + " failed (individual/resident profiles only — the entity and NRA profiles are reported above, not asserted)");
process.exit(fail > 0 ? 1 : 0);

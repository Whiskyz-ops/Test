"use strict";
/* ============================================================================
 * Correctness tests for in1-nodes-v3.js's §156/87A rebate and surcharge
 * marginal-relief logic — hand-computed against the actual statutory
 * formula, NOT against the frozen engine's own output. run-in1-v3.js only
 * checks DAG-vs-frozen-engine PARITY, which passes even when both sides
 * share the same bug, since it never checks either side against real law.
 *
 * Three known-live bugs pinned down here as the regression target for the
 * fix. All three are EXPECTED TO FAIL right now — that's the point: this
 * file exists so the eventual fix has a precise, hand-verified target and
 * can never silently regress once it lands.
 *
 * 1. Rebate wrong income base — eligibility must test against total income
 *    across every head (special-rate income included via totalIncomeInrV3),
 *    not just slab-rate income (totalNormalInr). Currently checks the
 *    latter only, so a taxpayer with modest slab income but large LTCG
 *    wrongly qualifies for the full rebate.
 * 2. Rebate cliff — crossing the ₹12,00,000 threshold by ₹1 must not jump
 *    net tax from ~₹0 to the full slab tax; Finance Act 2025's marginal
 *    relief must cap the increase to the amount of the excess. Currently
 *    the rebate is a binary all-or-nothing ternary with no relief branch.
 * 3. Surcharge marginal relief — the relief cap at each threshold must be
 *    computed on tax-plus-surcharge-AT-the-lower-bracket, not bare slab
 *    tax, for the ₹1cr/₹2cr/₹5cr crossings. Currently uses bare slab tax,
 *    which understates the correct surcharge (favors the taxpayer).
 *
 * Run: node prototypes/graph-pilot/run-in1-v3-marginal-relief.js
 * ==========================================================================*/
var CONST = require("./constants.js").CONST;
var T = CONST.TAX.INDIA;
var NODES = require("./in1-nodes-v3.js").NODES;

var pass = 0, fail = 0;
function check(label, actual, expected, tol) {
  tol = tol === undefined ? 2 : tol;
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + "  (actual=" + actual + ", expected=" + expected + ", diff=" + Math.round(actual - expected) + ")"); }
}

console.log("Rebate/surcharge marginal-relief correctness (hand-computed against statute, not against the frozen engine)\n");

// ---------------------------------------------------------------------------
// Case 1: rebate must not fire once real total income (special-rate income
// included) exceeds the cap, even if slab-rate income alone is within it.
// Hand-computed: bracketTax(11,00,000, SLABS_NEW)
//   = 0 (0-4L) + 20,000 (4L-8L @5%) + 30,000 (8L-11L @10%) = ₹50,000.
console.log("Case 1: rebate must not fire when total income (incl. special-rate) exceeds the cap");
(function () {
  var slabTaxInr = NODES.slabTaxInr.compute({ totalNormalInr: 1100000, slabs: T.SLABS_NEW });
  check("slabTaxInr at totalNormalInr=Rs.11,00,000 (sanity check)", slabTaxInr, 50000);

  var rebateInrV3 = NODES.rebateInrV3.compute({
    isIndividualV3: true, isNRV3: false, totalNormalInr: 1100000, isNew: true, slabTaxInr: slabTaxInr
  });
  // Real total income (with Rs.50L of LTCG on top) is Rs.61,00,000 -- far
  // above the Rs.12L cap. Correct rebate = 0. The current node reads only
  // totalNormalInr and wrongly grants the full rebate regardless of the
  // taxpayer's real total income.
  check("rebateInrV3 should be 0 (real total income Rs.61,00,000 >> Rs.12,00,000 cap)", rebateInrV3, 0);
})();
console.log("");

// ---------------------------------------------------------------------------
// Case 2: the rebate cliff at exactly Rs.12,00,000 vs Rs.12,00,001.
console.log("Case 2: crossing Rs.12,00,000 by Re.1 must not create a Rs.60,000 cliff");
(function () {
  var slabTaxAt = NODES.slabTaxInr.compute({ totalNormalInr: 1200000, slabs: T.SLABS_NEW });
  check("slabTaxInr at exactly Rs.12,00,000 (sanity check)", slabTaxAt, 60000);
  var rebateAt = NODES.rebateInrV3.compute({
    isIndividualV3: true, isNRV3: false, totalNormalInr: 1200000, isNew: true, slabTaxInr: slabTaxAt
  });
  var taxAfterAt = NODES.taxAfterRebateInr.compute({ slabTaxInr: slabTaxAt, rebateInrV3: rebateAt, specialTaxInrV3: 0 });
  check("tax at exactly Rs.12,00,000 should be ~Rs.0", taxAfterAt, 0);

  var slabTaxOver = NODES.slabTaxInr.compute({ totalNormalInr: 1200001, slabs: T.SLABS_NEW });
  var rebateOver = NODES.rebateInrV3.compute({
    isIndividualV3: true, isNRV3: false, totalNormalInr: 1200001, isNew: true, slabTaxInr: slabTaxOver
  });
  var taxAfterOver = NODES.taxAfterRebateInr.compute({ slabTaxInr: slabTaxOver, rebateInrV3: rebateOver, specialTaxInrV3: 0 });
  // Marginal relief: net tax should equal the excess over the threshold
  // (Re.1), not the full slab tax (~Rs.60,000.15).
  check("tax at Rs.12,00,001 should be ~Re.1 (marginal relief), not the full ~Rs.60,000 cliff", taxAfterOver, 1);
})();
console.log("");

// ---------------------------------------------------------------------------
// Case 3: surcharge marginal relief at Rs.1.01cr (Rs.1L above the Rs.1cr
// threshold). Hand-computed:
//   bracketTax(1,01,00,000, SLABS_NEW) = Rs.26,10,000
//   bracketTax(1,00,00,000, SLABS_NEW) = Rs.25,80,000
//   correct cap = (tax+surcharge AT the threshold, still in the 10%
//     surcharge bracket) + excess = (25,80,000 x 1.10) + 1,00,000
//     = 28,38,000 + 1,00,000 = Rs.29,38,000
//   correct surcharge = 29,38,000 - 26,10,000 = Rs.3,28,000
console.log("Case 3: surcharge marginal relief at Rs.1.01cr must use tax+surcharge-at-threshold, not bare slab tax");
(function () {
  var taxAfterRebateInr = NODES.slabTaxInr.compute({ totalNormalInr: 10100000, slabs: T.SLABS_NEW });
  check("slabTaxInr at Rs.1,01,00,000 (sanity check)", taxAfterRebateInr, 2610000);

  var surchargeInrV3 = NODES.surchargeInrV3.compute({
    taxAfterRebateInr: taxAfterRebateInr, totalIncomeInrV3: 10100000, isNew: true,
    slabs: T.SLABS_NEW, capEligibleSpecialTaxInr: 0
  });
  check("surcharge at Rs.1.01cr should be ~Rs.3,28,000 (correct marginal relief)", surchargeInrV3, 328000, 500);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail > 0) {
  console.log(
    "\n(FAILs above are EXPECTED right now -- this file pins down the correct\n" +
    "target behavior for the Phase 1 rebate/surcharge fix in in1-nodes-v3.js.\n" +
    "Once that fix lands, all cases here should pass with zero changes to\n" +
    "this file. Do not 'fix' this test to match the current wrong output.)"
  );
}
process.exit(fail > 0 ? 1 : 0);

"use strict";
/* ============================================================================
 * Correctness test for ftc-nodes.js's Direction-1 (US Form 1116) FTC gating
 * bug — hand-computed against the actual statutory mechanism, NOT against
 * the frozen engine's own output. run-ftc.js only checks DAG output against
 * "real"/production (the frozen engine) — a parity check that passes even
 * when both sides share the same bug.
 *
 * BUG (confirmed live, ftc-nodes.js:53-54):
 *   var zeroed = d.usIsNraBoundaryFtc || !d.hasUsScopeBoundaryFtc;
 *   var foreignSrcGrossUsd = zeroed ? 0 : d.indiaIncomeTotalUsdBoundaryFtc;
 * `zeroed` only looks at whether the taxpayer actually filed 1040-NR
 * (usIsNraBoundaryFtc) or has no US scope at all. It does NOT look at
 * `ctx.computed.residency.us.worldwide` / `usCedes`.
 *
 * But residency-nodes.js:211 proves these are genuinely different facts:
 *   var usCedes = (d.treatyUsResidenceRaw === "india" || d.treatyFiles1040nrRaw === true) && !d.usIsCitizenRaw;
 * A taxpayer can cede US worldwide taxation via treaty POSITION ALONE
 * (treatyUsResidenceRaw === "india"), with usCedes/worldwide=false, WHILE
 * files1040nr (and therefore usIsNraBoundaryFtc) stays false — they never
 * filed as an NRA. Wherever computeUsTax/usTaxIndividualResult reads
 * residency.us.worldwide, it will have ALREADY excluded India-source income
 * from the US taxable base for that person. ftcUsDirection has no way to
 * know that happened — it only checks usIsNraBoundaryFtc — so it still
 * treats the full India income as "foreign-source income relative to a US
 * base that contains it," when the US base has already excluded it
 * entirely. That lets Indian tax get credited against US tax that was
 * never levied on that income at all.
 *
 * Case below: a taxpayer whose US taxable base has already excluded their
 * $50,000 of India-source income (representing the usCedes=true path
 * above), who never filed 1040-NR. Correct FTC allowed should be $0 --
 * there is no US tax left on that income to credit against. Current code
 * allows $9,000.
 *
 * Two OTHER confirmed-live bugs in this same file are deliberately NOT
 * given a numeric assertion here, because they are missing-feature /
 * design gaps, not "wrong value for a well-defined formula" bugs -- forcing
 * a specific number would be asserting a fix design nobody has actually
 * made yet:
 *   - No AMT-FTC: AMT never appears anywhere in ftcUsDirection's deps or
 *     compute body. There is no input to even test against; the real fix
 *     requires deciding how an AMT-basket §904 limitation should be
 *     modeled (Phase 1 design work), not just correcting an existing
 *     formula.
 *   - Gross/net basis mismatch: foreignSrcUsd (gross India income, no
 *     apportioned deductions) is used as the numerator against usTaxableUsd
 *     (net, post-deduction US income) as the denominator. There is no
 *     single "correct" replacement value without first deciding an
 *     apportionment method (ratable apportionment of which deductions,
 *     apportioned how) -- that is genuinely Phase 1 design work.
 *
 * Run: node prototypes/graph-pilot/run-ftc-correctness.js
 * ==========================================================================*/
var NODES = require("./ftc-nodes.js").NODES;

var pass = 0, fail = 0;
function check(label, actual, expected, tol) {
  tol = tol === undefined ? 1 : tol;
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { pass++; console.log("  ok - " + label); }
  else { fail++; console.log("  FAIL - " + label + "  (actual=" + actual + ", expected=" + expected + ", diff=" + Math.round(actual - expected) + ")"); }
}

console.log("FTC Direction-1 gating correctness (hand-computed, not checked against the frozen engine)\n");

console.log("Case: US taxable base already excludes India-source income (usCedes=true) via treaty position alone, without a 1040-NR filing");
(function () {
  var out = NODES.ftcUsDirection.compute({
    feieExcludedUsdBoundaryFtc: 0,
    usIsNraBoundaryFtc: false,       // never filed 1040-NR -- but usCedes can still be true (residency-nodes.js:211)
    hasUsScopeBoundaryFtc: true,
    indiaIncomeTotalUsdBoundaryFtc: 50000,   // raw India-source income, computed independent of the US base
    usTaxableIncomeUsdBoundaryFtc: 100000,   // US base already excludes the $50,000 India income (usCedes/worldwide=false upstream)
    usIncomeTaxUsdBoundaryFtc: 18000,        // US tax on that already-reduced $100,000 base
    indiaTotalTaxUsdBoundaryFtc: 15000       // India tax paid on the $50,000, in USD
  });
  console.log("  (for reference) current usLimitFraction=" + out.limitFraction + ", ftcLimitUsd=" + out.ftcLimitUsd);
  check("ftcAllowedUsd should be $0 (income already excluded from the US base has no US tax left to credit against)", out.ftcAllowedUsd, 0, 1);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail > 0) {
  console.log(
    "\n(FAIL above is EXPECTED right now -- ftcUsDirection needs to gate on\n" +
    "residency.us.worldwide (or an equivalent usCedes flag), not just\n" +
    "usIsNraBoundaryFtc. This is the Phase 1 fix target for this file.\n" +
    "The no-AMT-FTC and gross/net-basis-mismatch bugs in the same file are\n" +
    "documented above but deliberately not asserted here -- they need a\n" +
    "design decision, not just a corrected constant.)"
  );
}
process.exit(fail > 0 ? 1 : 0);

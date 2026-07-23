"use strict";
/* ============================================================================
 * Verifies aggregateusincome-nodes.js against all 11 real profiles — the US
 * mirror of run-aggregateindiaincome.js. Every field of aggregateUsIncomeResult
 * is checked directly against the real model.income.us.* object (not just the
 * final total), including the MACRS/§179/bonus depreciation and K-1 passive-
 * box aggregation this phase newly closes.
 *
 * Run: node prototypes/graph-pilot/run-aggregateusincome.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./aggregateusincome-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function close(a, b, tol) { return Math.abs(num(a) - num(b)) <= (tol || 2); }
function usd(moneyOrNum) { return num(moneyOrNum && moneyOrNum.usd !== undefined ? moneyOrNum.usd : moneyOrNum); }

console.log("Closing the aggregateUsIncome boundary, run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us, model: r.model, computed: r.computed };
  var out = graph.resolve(["aggregateUsIncomeResult"], ctx).values.aggregateUsIncomeResult;
  var real = r.model.income.us;

  console.log(p.id);
  check("wages matches exactly", close(usd(out.wages), usd(real.wages)), "graph=" + usd(out.wages) + " model=" + usd(real.wages));
  check("businessUs matches exactly", close(usd(out.businessUs), usd(real.businessUs)), "graph=" + usd(out.businessUs) + " model=" + usd(real.businessUs));
  check("w2Withholding matches exactly", close(out.w2Withholding, real.w2Withholding));
  check("medicareWages matches exactly", close(out.medicareWages, real.medicareWages));
  check("qualifiedTipsUsd matches exactly", close(out.qualifiedTipsUsd, real.qualifiedTipsUsd));
  check("qualifiedOvertimeUsd matches exactly", close(out.qualifiedOvertimeUsd, real.qualifiedOvertimeUsd));
  check("seEarningsUsd matches exactly", close(out.seEarningsUsd, real.seEarningsUsd), "graph=" + Math.round(out.seEarningsUsd) + " model=" + Math.round(real.seEarningsUsd));
  check("qbiIncomeUsd matches exactly", close(out.qbiIncomeUsd, real.qbiIncomeUsd), "graph=" + Math.round(out.qbiIncomeUsd) + " model=" + Math.round(real.qbiIncomeUsd));
  check("qbiIsSSTB matches", out.qbiIsSSTB === !!real.qbiIsSSTB);
  check("usRetirementIncome matches exactly", close(usd(out.usRetirementIncome), usd(real.usRetirementIncome)));
  check("usRetirementIncomeExclSs matches exactly", close(usd(out.usRetirementIncomeExclSs), usd(real.usRetirementIncomeExclSs)));
  check("retirementDistributionsSubjectTo72tUsd matches exactly", close(out.retirementDistributionsSubjectTo72tUsd, real.retirementDistributionsSubjectTo72tUsd));
  check("socialSecurityUs matches exactly", close(usd(out.socialSecurityUs), usd(real.socialSecurityUs)));
  check("taxExemptInterestUs matches exactly", close(usd(out.taxExemptInterestUs), usd(real.taxExemptInterestUs)));
  check("interestUs matches exactly", close(usd(out.interestUs), usd(real.interestUs)), "graph=" + usd(out.interestUs) + " model=" + usd(real.interestUs));
  check("ordinaryDividendsUs matches exactly", close(usd(out.ordinaryDividendsUs), usd(real.ordinaryDividendsUs)));
  check("qualifiedDividendsUs matches exactly", close(usd(out.qualifiedDividendsUs), usd(real.qualifiedDividendsUs)));
  check("ltcgUs matches exactly", close(usd(out.ltcgUs), usd(real.ltcgUs)), "graph=" + usd(out.ltcgUs) + " model=" + usd(real.ltcgUs));
  check("stcgUs matches exactly", close(usd(out.stcgUs), usd(real.stcgUs)), "graph=" + usd(out.stcgUs) + " model=" + usd(real.stcgUs));
  check("capitalGainsUs matches exactly", close(usd(out.capitalGainsUs), usd(real.capitalGainsUs)));
  check("rentalUs matches exactly", close(usd(out.rentalUs), usd(real.rentalUs)), "graph=" + usd(out.rentalUs) + " model=" + usd(real.rentalUs));
  check("foreignWages matches exactly", close(usd(out.foreignWages), usd(real.foreignWages)));
  check("foreignSelfEmployment matches exactly", close(usd(out.foreignSelfEmployment), usd(real.foreignSelfEmployment)), "graph=" + usd(out.foreignSelfEmployment) + " model=" + usd(real.foreignSelfEmployment));
  check("foreignInterest matches exactly", close(usd(out.foreignInterest), usd(real.foreignInterest)), "graph=" + usd(out.foreignInterest) + " model=" + usd(real.foreignInterest));
  check("foreignDividends matches exactly", close(usd(out.foreignDividends), usd(real.foreignDividends)));
  check("foreignRental matches exactly", close(usd(out.foreignRental), usd(real.foreignRental)));
  check("foreignPension matches exactly", close(usd(out.foreignPension), usd(real.foreignPension)), "graph=" + usd(out.foreignPension) + " model=" + usd(real.foreignPension));
  check("foreignStcg matches exactly", close(usd(out.foreignStcg), usd(real.foreignStcg)));
  check("foreignLtcg matches exactly", close(usd(out.foreignLtcg), usd(real.foreignLtcg)));
  check("foreignCapitalGains matches exactly", close(usd(out.foreignCapitalGains), usd(real.foreignCapitalGains)));
  check("retirementEpfInterestUsd matches exactly", close(out.retirementEpfInterestUsd, real.retirementEpfInterestUsd));
  check("retirementNpsWithdrawalUsd matches exactly", close(out.retirementNpsWithdrawalUsd, real.retirementNpsWithdrawalUsd));
  check("usSourceTotal matches exactly", close(usd(out.usSourceTotal), usd(real.usSourceTotal)), "graph=" + Math.round(usd(out.usSourceTotal)) + " model=" + Math.round(usd(real.usSourceTotal)));
  check("foreignSourceTotal matches exactly", close(usd(out.foreignSourceTotal), usd(real.foreignSourceTotal)), "graph=" + Math.round(usd(out.foreignSourceTotal)) + " model=" + Math.round(usd(real.foreignSourceTotal)));
  check("total matches model.income.us.total exactly", close(usd(out.total), usd(real.total)), "graph=" + Math.round(usd(out.total)) + " model=" + Math.round(usd(real.total)));
  console.log("");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

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

/* ----------------------------------------------------------------------
 * Synthetic farming_schedule_f cases — hand-checked, NOT diffed against
 * the frozen engine (archive/engine-frozen/normalize.js still has the
 * pre-fix behavior: farm income never reaches businessUs at all, and
 * seEarnings only reads the phantom net_profit_usd field — this is a
 * deliberate DAG-only fix, exactly the "new features/fixes land DAG-only"
 * pattern DAG_MIGRATION_TRACKER.md section I documents. None of the 11 real
 * profiles carry farming_schedule_f data, so the profile loop above can't
 * exercise this at all.
 * ------------------------------------------------------------------------*/
console.log("Synthetic farming_schedule_f cases (DAG-only fix, hand-checked)\n");

function farmCtx(farm) {
  return { router: {}, india: {}, us: { metadata: { us_calendar_year: 2025 }, income_us_source: { farming_schedule_f: [farm] } } };
}
function farmBusinessUs(farm) {
  var out = graph.resolve(["aggregateUsIncomeResult"], farmCtx(farm)).values.aggregateUsIncomeResult;
  return { businessUs: usd(out.businessUs), seEarnings: out.seEarningsUsd };
}

(function () {
  console.log("cash-method, no assets, no override");
  var farm = {
    accounting_method: "cash",
    itemized_income: { sales_livestock_produce_raised: 50000, sales_livestock_produce_purchased: 10000, cooperative_distributions: 2000, agricultural_program_payments: 1000, crop_insurance_proceeds: 3000, custom_hire_income: 500, other_income: 500 },
    expenses_usd: 40000
  };
  var r = farmBusinessUs(farm);
  check("businessUs = 27000 (67000 gross - 40000 expenses)", close(r.businessUs, 27000), "got " + r.businessUs);
  check("seEarnings = 27000 (farm income is SE-tax-subject)", close(r.seEarnings, 27000), "got " + r.seEarnings);
  console.log("");
})();

(function () {
  console.log("accrual-method, inventory adjustment");
  var farm = {
    accounting_method: "accrual",
    itemized_income: { sales_livestock_produce_raised: 50000, sales_livestock_produce_purchased: 10000, cooperative_distributions: 2000, agricultural_program_payments: 1000, crop_insurance_proceeds: 3000, custom_hire_income: 500, other_income: 500 },
    inventory: { beginning_inventory: 5000, cost_of_purchases: 8000, ending_inventory: 6000 },
    expenses_usd: 40000
  };
  var r = farmBusinessUs(farm);
  // gross 67000 - invAdj(5000+8000-6000=7000) = 60000; less 40000 expenses = 20000
  check("businessUs = 20000 (accrual inventory swing netted)", close(r.businessUs, 20000), "got " + r.businessUs);
  console.log("");
})();

(function () {
  console.log("cash-method + one asset, full §179 election");
  var farm = {
    accounting_method: "cash",
    itemized_income: { sales_livestock_produce_raised: 50000, sales_livestock_produce_purchased: 10000, cooperative_distributions: 2000, agricultural_program_payments: 1000, crop_insurance_proceeds: 3000, custom_hire_income: 500, other_income: 500 },
    expenses_usd: 40000,
    assets: [{ class: "5-year", cost: 10000, sec179: 10000, bonus: false, placed_in_service_date: "2025-06-01" }]
  };
  var r = farmBusinessUs(farm);
  // 27000 gross-less-expenses, full $10,000 §179 (business income of 27000 easily covers it, aggregate cap nowhere close)
  check("businessUs = 17000 (27000 - 10000 full §179)", close(r.businessUs, 17000), "got " + r.businessUs);
  console.log("");
})();

(function () {
  console.log("explicit net_profit_usd override wins outright (hand-authored profile shortcut)");
  var farm = { net_profit_usd: 99999, itemized_income: { sales_livestock_produce_raised: 500000 }, expenses_usd: 1 };
  var r = farmBusinessUs(farm);
  check("businessUs = 99999 (override, ignores itemized_income/expenses)", close(r.businessUs, 99999), "got " + r.businessUs);
  console.log("");
})();

(function () {
  console.log("explicit gross_income_usd override (partial shortcut, expenses_usd still applied)");
  var farm = { gross_income_usd: 80000, expenses_usd: 30000, itemized_income: { sales_livestock_produce_raised: 999999 } };
  var r = farmBusinessUs(farm);
  check("businessUs = 50000 (80000 override - 30000 expenses, ignores itemized_income)", close(r.businessUs, 50000), "got " + r.businessUs);
  console.log("");
})();

console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

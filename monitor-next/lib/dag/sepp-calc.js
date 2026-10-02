/* sepp-calc.js — the annual amount a series of substantially equal periodic
 * payments (SEPP, §72(t)(2)(A)(iv)) must pay, under the three methods of
 * Notice 2022-6 §3.01. Python mirror: dag_py/src/wising_dag/us/sepp_calc.py.
 *
 * Layer 1 US, on a retirement_distributions row with early_exception "sepp":
 *   sepp_method            rmd | amortization | annuitization
 *   sepp_start_date        date of the first SEPP payment
 *   sepp_start_balance_usd account balance the series was set on (fixed methods)
 *   sepp_balance_usd       balance on 31 December of the year before this
 *                          one (RMD method, or after the one-time switch)
 *   sepp_interest_rate_pct rate chosen (fixed methods)
 *   sepp_federal_midterm_pct  federal mid-term rate used to justify a rate
 *                          above 5% (optional)
 *   sepp_life_table        single | uniform | joint
 *   sepp_beneficiary_dob   designated beneficiary's date of birth (joint)
 *   sepp_switched_to_rmd   the one-time switch from a fixed method to the
 *                          RMD method has been made (Notice 2022-6 §3.03(b))
 *
 * Rules (Notice 2022-6 §3.01-3.02, IRS SEPP FAQ Q&A 7):
 *  - RMD: balance ÷ life expectancy at the age reached on the birthday in
 *    the distribution year; redone every year (not a modification).
 *  - Fixed amortization: the level payment amortizing the starting balance
 *    over the life expectancy at the age in the first distribution year, at
 *    the chosen rate (payments at the end of each year; the life expectancy
 *    is used as a fractional number of years: the IRS example's factor for
 *    36.2 years at 4% is 18.9559). Same amount every year.
 *  - Fixed annuitization: starting balance ÷ the present value of $1 a year,
 *    paid at the end of each year while alive (or while either is alive, for
 *    joint lives), from the §1.401(a)(9)-9(e) mortality rates at the chosen
 *    rate (IRS example: 18.1568 at age 50, 4%). Same amount every year.
 *  - Rate: not more than the greater of 5% and 120% of the federal mid-term
 *    rate for either of the two months before the first payment. */
var T = require("./sepp-tables.js");

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function yearOf(s) { var m = /^(\d{4})-\d{2}-\d{2}/.exec(String(s || "")); return m ? Number(m[1]) : null; }
// Rounded to the cent, so the JS and Python engines agree to the last digit.
function cents(x) { return Math.round(x * 100) / 100; }
function clampAge(a) { return Math.max(0, Math.min(120, a)); }

// Life expectancy from the chosen table (null when it can't be read).
function lifeExpectancy(table, age, beneficiaryAge) {
  if (age == null || age < 0) return null;
  if (table === "uniform") return age >= 10 ? T.UNIFORM_FROM_10[clampAge(age) - 10] : null;
  if (table === "joint") return beneficiaryAge == null || beneficiaryAge < 0 ? null : T.JOINT[clampAge(age)][clampAge(beneficiaryAge)];
  return T.SINGLE[clampAge(age)];
}
// Probability of surviving t more years from age x.
function survival(x, t) {
  var p = 1;
  for (var k = 0; k < t; k++) p *= 1 - (x + k <= 120 ? T.MORTALITY[x + k] : 1);
  return p;
}
// Present value of $1 a year at the end of each year while alive (single)
// or while either is alive (joint, last survivor).
function annuityFactor(age, beneficiaryAge, rate) {
  var v = 1 / (1 + rate), f = 0;
  for (var t = 1; t <= 130; t++) {
    var px = survival(age, t), p = beneficiaryAge == null ? px : px + survival(beneficiaryAge, t) - px * survival(beneficiaryAge, t);
    if (p < 1e-12) break;
    f += p * Math.pow(v, t);
  }
  return f;
}
function amortizationFactor(years, rate) { return rate > 0 ? (1 - Math.pow(1 + rate, -years)) / rate : years; }

/* The required payment for the tax year. Returns { method, annualUsd (null
 * when an input is missing), factor, factorKind, age, beneficiaryAge,
 * table, missing: [field names], rate: { pct, limitPct, over } }. */
function required(r, dobRaw, baseYear) {
  var year = Math.trunc(Number(baseYear)) || 2026, birthYear = yearOf(dobRaw), startYear = yearOf(r.sepp_start_date);
  var benYear = yearOf(r.sepp_beneficiary_dob), table = ["single", "uniform", "joint"].indexOf(r.sepp_life_table) >= 0 ? r.sepp_life_table : "single";
  var method = ["rmd", "amortization", "annuitization"].indexOf(r.sepp_method) >= 0 ? r.sepp_method : null;
  var useRmd = method === "rmd" || (method && r.sepp_switched_to_rmd === true);
  var out = { method: method, usesRmd: !!useRmd, switchedToRmd: method !== "rmd" && useRmd, annualUsd: null, factor: null,
    factorKind: null, age: null, beneficiaryAge: null, table: table, missing: [], rate: null };
  if (!method) { out.missing.push("sepp_method"); return out; }
  if (birthYear == null) out.missing.push("date_of_birth");
  if (table === "joint" && benYear == null) out.missing.push("sepp_beneficiary_dob");
  // Age in the distribution year (RMD) or in the first distribution year (fixed).
  var basisYear = useRmd ? year : startYear;
  if (!useRmd && startYear == null) out.missing.push("sepp_start_date");
  if (birthYear != null && basisYear != null) out.age = basisYear - birthYear;
  if (benYear != null && basisYear != null && table === "joint") out.beneficiaryAge = basisYear - benYear;
  if (!useRmd) {
    var pct = r.sepp_interest_rate_pct, fmr = r.sepp_federal_midterm_pct;
    if (pct === null || pct === undefined || pct === "") out.missing.push("sepp_interest_rate_pct");
    else {
      var limit = Math.round(Math.max(5, fmr === null || fmr === undefined || fmr === "" ? 0 : 1.2 * num(fmr)) * 10000) / 10000;
      out.rate = { pct: num(pct), limitPct: limit, over: num(pct) > limit + 1e-9, midtermGiven: !(fmr === null || fmr === undefined || fmr === "") };
    }
    if (!(num(r.sepp_start_balance_usd) > 0)) out.missing.push("sepp_start_balance_usd");
  } else if (!(num(r.sepp_balance_usd) > 0)) out.missing.push("sepp_balance_usd");
  if (out.missing.length) return out;
  if (useRmd || method === "amortization") {
    var le = lifeExpectancy(table, out.age, out.beneficiaryAge);
    if (le == null) { out.missing.push("life_expectancy"); return out; }
    if (useRmd) { out.factor = le; out.factorKind = "life_expectancy"; out.annualUsd = cents(num(r.sepp_balance_usd) / le); return out; }
    out.factor = amortizationFactor(le, out.rate.pct / 100); out.factorKind = "amortization"; out.lifeExpectancy = le;
  } else {
    out.factor = annuityFactor(out.age, table === "joint" ? out.beneficiaryAge : null, out.rate.pct / 100); out.factorKind = "annuity";
  }
  out.annualUsd = cents(num(r.sepp_start_balance_usd) / out.factor);
  return out;
}

// Paid amount vs the required amount: a difference beyond rounding.
function differs(paidUsd, requiredUsd) { return Math.abs(paidUsd - requiredUsd) > Math.max(2, requiredUsd * 0.001); }

module.exports = { required: required, differs: differs, lifeExpectancy: lifeExpectancy, annuityFactor: annuityFactor, amortizationFactor: amortizationFactor };

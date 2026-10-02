/* retirement-dist.js — US retirement distributions (Form 1099-R), one row
 * per distribution. Python mirror: dag_py/src/wising_dag/us/retirement_dist.py.
 *
 * Layer 1 US: income_us_source.retirement_distributions = [{ payer_name,
 * plan_type (ira | roth_ira | 401k | pension | other_plan), taxable_usd
 * (1099-R box 2a), payment_type (periodic | lump_sum), early_exception
 * (none | sepp | separation_age_55 | disability | death | medical |
 * first_home | education | birth_adoption | other), rolled_over,
 * date_paid, federal_withheld_usd }]. Older single figures
 * (ira_distributions_usd, 401k_distributions_usd, pension_income_usd) are
 * still read as rows with no payment type or exception: IRA / 401(k)
 * amounts as before (subject to §72(t)), the pension figure as a periodic
 * pension (never subject to §72(t), as before).
 *
 * §72(t): a 10% additional tax on the taxable part of a distribution from a
 * qualified plan or IRA paid before age 59½ (§72(t)(1)), unless an
 * exception applies — substantially equal periodic payments (SEPP,
 * §72(t)(2)(A)(iv)), separation from service at 55 or later (A)(v), death
 * (A)(ii), disability (A)(iii), and the medical / first home / education /
 * birth-or-adoption exceptions. A Roth IRA's qualified distributions have
 * no taxable part, so only what's entered as taxable is counted.
 * "Before 59½": the date paid against the 59½ date when entered; otherwise
 * the client must not have reached 59½ by 31 December. */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var PLAN_TYPES = ["ira", "roth_ira", "401k", "pension", "other_plan"];
var EXCEPTIONS = ["none", "sepp", "separation_age_55", "disability", "death", "medical", "first_home", "education", "birth_adoption", "other"];

function ymd(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function before(a, b) { return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]; }
// The date the client turns 59½.
function age59HalfDate(dobRaw) {
  var d = ymd(dobRaw);
  if (!d) return null;
  var y = d[0] + 59, m = d[1] + 6;
  if (m > 12) { m -= 12; y += 1; }
  return [y, m, d[2]];
}

function rows(us) {
  var ui = (us && us.income_us_source) || {};
  var out = [];
  (Array.isArray(ui.retirement_distributions) ? ui.retirement_distributions : []).forEach(function (r) {
    if (!r || r.rolled_over === true || !(num(r.taxable_usd) > 0)) return;
    out.push({
      planType: PLAN_TYPES.indexOf(r.plan_type) >= 0 ? r.plan_type : "other_plan",
      payerName: r.payer_name || null, taxableUsd: num(r.taxable_usd),
      paymentType: r.payment_type === "lump_sum" ? "lump_sum" : r.payment_type === "periodic" ? "periodic" : null,
      exception: EXCEPTIONS.indexOf(r.early_exception) >= 0 ? r.early_exception : "none",
      datePaid: r.date_paid || null, withheldUsd: num(r.federal_withheld_usd), legacy: false
    });
  });
  [["ira", num(ui.ira_distributions_usd)], ["401k", num(ui["401k_distributions_usd"])], ["pension", num(ui.pension_income_usd)]].forEach(function (t) {
    if (t[1] > 0) out.push({ planType: t[0], payerName: null, taxableUsd: t[1], paymentType: t[0] === "pension" ? "periodic" : null,
      exception: t[0] === "pension" ? "pension_legacy" : "none", datePaid: null, withheldUsd: 0, legacy: true });
  });
  return out;
}

function totals(us) {
  var t = { iraUsd: 0, k401Usd: 0, pensionUsd: 0, otherUsd: 0, totalUsd: 0, lumpSumUsd: 0, periodicUsd: 0 };
  rows(us).forEach(function (r) {
    var k = r.planType === "ira" || r.planType === "roth_ira" ? "iraUsd" : r.planType === "401k" ? "k401Usd" : r.planType === "pension" ? "pensionUsd" : "otherUsd";
    t[k] += r.taxableUsd; t.totalUsd += r.taxableUsd;
    // No payment type recorded (older data): treated as periodic, as before.
    if (r.paymentType === "lump_sum") t.lumpSumUsd += r.taxableUsd; else t.periodicUsd += r.taxableUsd;
  });
  return t;
}

function isEarly(r, dobRaw, baseYear) {
  var h = age59HalfDate(dobRaw);
  if (!h) return false;
  var paid = ymd(r.datePaid);
  return paid ? before(paid, h) : before([Math.trunc(Number(baseYear)) || 2026, 12, 31], h);
}

// Rows the 10% applies to: paid before 59½ with no exception.
function early72tRows(us, dobRaw, baseYear) {
  return rows(us).filter(function (r) { return r.exception === "none" && isEarly(r, dobRaw, baseYear); });
}
function early72tBaseUsd(us, dobRaw, baseYear, paymentType) {
  return early72tRows(us, dobRaw, baseYear).filter(function (r) {
    return !paymentType || (paymentType === "lump_sum" ? r.paymentType === "lump_sum" : r.paymentType !== "lump_sum");
  }).reduce(function (s, r) { return s + r.taxableUsd; }, 0);
}
// Rows paid before 59½ where an exception was recorded (for the alert text).
function exceptedEarlyUsd(us, dobRaw, baseYear) {
  return rows(us).filter(function (r) { return r.exception !== "none" && r.exception !== "pension_legacy" && isEarly(r, dobRaw, baseYear); })
    .reduce(function (s, r) { return s + r.taxableUsd; }, 0);
}

// DTAA Art. 20(1) leaves a periodic pension paid to an Indian resident
// taxable only in India, so on a 1040-NR the US charges no tax on it — and
// the §72(t) 10%, an income tax under the Code, goes with it. Set false if
// the CPA takes the view that §72(t) still applies.
var TREATY_EXEMPTS_72T = true;
// A 1040-NR filer (non-citizen, no §6013(g)/(h) election) resident in India.
function treatyPeriodicExempt(us, india) {
  var u = (us && us.nra_specific) || {}, r = (us && us.us_residency_detail) || {};
  var nraFiler = u.files_form_1040nr === true && r.is_us_citizen !== true && u.s6013h_joint_election !== true;
  var indiaResident = !(india && india.residency_detail && india.residency_detail.final_india_residency_status === "NR");
  return TREATY_EXEMPTS_72T && nraFiler && indiaResident;
}
// The §72(t) base after the treaty: lump sums only when periodic payments
// are treaty-exempt, otherwise every early distribution.
function early72tBaseAfterTreatyUsd(us, india, dobRaw, baseYear) {
  return treatyPeriodicExempt(us, india) ? early72tBaseUsd(us, dobRaw, baseYear, "lump_sum") : early72tBaseUsd(us, dobRaw, baseYear);
}

module.exports = { TREATY_EXEMPTS_72T: TREATY_EXEMPTS_72T, treatyPeriodicExempt: treatyPeriodicExempt, early72tBaseAfterTreatyUsd: early72tBaseAfterTreatyUsd, PLAN_TYPES: PLAN_TYPES, EXCEPTIONS: EXCEPTIONS, rows: rows, totals: totals, age59HalfDate: age59HalfDate, isEarly: isEarly,
  early72tRows: early72tRows, early72tBaseUsd: early72tBaseUsd, exceptedEarlyUsd: exceptedEarlyUsd };

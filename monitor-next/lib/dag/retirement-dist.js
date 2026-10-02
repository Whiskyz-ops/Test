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
 * the client must not have reached 59½ by 31 December.
 *
 * A broken SEPP (sepp_broken: the payment schedule was changed or stopped
 * before the later of five years and age 59½) loses the exception
 * (§72(t)(4)): this year's payment is counted as an early distribution, and
 * the 10% falls due now on every earlier SEPP payment taken before 59½
 * (sepp_prior_payments_usd), plus interest for the deferral, which isn't
 * computed. The rule bites only on a change before the later of five years
 * from the first SEPP payment (sepp_start_date) and age 59½; the change is
 * dated by the row's date paid, or 31 December when there is none. A change
 * after that is allowed and costs nothing. With no start date entered the
 * tick is taken as it stands. SEPP payments are periodic payments, so while the schedule holds
 * the treaty treats them as periodic (DTAA Art. 20, taxable in the country
 * of residence); a broken schedule loses that too and is taxed like a lump
 * sum. */
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

// The end of the SEPP's required period: the later of five years from the
// first payment and the 59½ date (null when no start date is entered).
function seppWindowEnd(r, dobRaw) {
  var st = ymd(r.sepp_start_date);
  if (!st) return null;
  var five = [st[0] + 5, st[1], st[2]], h = age59HalfDate(dobRaw);
  return h && before(five, h) ? h : five;
}
function seppChangeDate(r, baseYear) { return ymd(r.date_paid) || [Math.trunc(Number(baseYear)) || 2026, 12, 31]; }
// Marked as changed or stopped, whatever the date.
function seppMarkedBroken(r) { return r.early_exception === "sepp" && r.sepp_broken === true; }
// Broken for §72(t)(4): marked, and changed inside the required period.
function seppBroken(r, dobRaw, baseYear) {
  if (!seppMarkedBroken(r)) return false;
  var end = seppWindowEnd(r, dobRaw);
  return !end || before(seppChangeDate(r, baseYear), end);
}
// Periodic for the treaty (Art. 20): marked periodic (or no type, older
// data) and not a broken SEPP.
function treatyPeriodic(r) { return r.paymentType !== "lump_sum" && !r.seppBroken; }

function rows(us, dobRaw, baseYear) {
  var ui = (us && us.income_us_source) || {};
  var out = [];
  (Array.isArray(ui.retirement_distributions) ? ui.retirement_distributions : []).forEach(function (r) {
    if (!r || r.rolled_over === true || !(num(r.taxable_usd) > 0)) return;
    out.push({
      planType: PLAN_TYPES.indexOf(r.plan_type) >= 0 ? r.plan_type : "other_plan",
      payerName: r.payer_name || null, taxableUsd: num(r.taxable_usd),
      paymentType: r.payment_type === "lump_sum" ? "lump_sum" : r.payment_type === "periodic" ? "periodic" : null,
      exception: seppBroken(r, dobRaw, baseYear) ? "none" : EXCEPTIONS.indexOf(r.early_exception) >= 0 ? r.early_exception : "none",
      seppBroken: seppBroken(r, dobRaw, baseYear),
      datePaid: r.date_paid || null, withheldUsd: num(r.federal_withheld_usd), legacy: false
    });
  });
  [["ira", num(ui.ira_distributions_usd)], ["401k", num(ui["401k_distributions_usd"])], ["pension", num(ui.pension_income_usd)]].forEach(function (t) {
    if (t[1] > 0) out.push({ planType: t[0], payerName: null, taxableUsd: t[1], paymentType: t[0] === "pension" ? "periodic" : null,
      exception: t[0] === "pension" ? "pension_legacy" : "none", seppBroken: false, datePaid: null, withheldUsd: 0, legacy: true });
  });
  return out;
}

function totals(us, dobRaw, baseYear) {
  var t = { iraUsd: 0, k401Usd: 0, pensionUsd: 0, otherUsd: 0, totalUsd: 0, lumpSumUsd: 0, periodicUsd: 0 };
  rows(us, dobRaw, baseYear).forEach(function (r) {
    var k = r.planType === "ira" || r.planType === "roth_ira" ? "iraUsd" : r.planType === "401k" ? "k401Usd" : r.planType === "pension" ? "pensionUsd" : "otherUsd";
    t[k] += r.taxableUsd; t.totalUsd += r.taxableUsd;
    // No payment type recorded (older data): treated as periodic, as before.
    // A broken SEPP counts as a lump sum (see the header).
    if (treatyPeriodic(r)) t.periodicUsd += r.taxableUsd; else t.lumpSumUsd += r.taxableUsd;
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
  return rows(us, dobRaw, baseYear).filter(function (r) { return r.exception === "none" && isEarly(r, dobRaw, baseYear); });
}
function early72tBaseUsd(us, dobRaw, baseYear, paymentType) {
  return early72tRows(us, dobRaw, baseYear).filter(function (r) {
    return !paymentType || (paymentType === "lump_sum" ? !treatyPeriodic(r) : treatyPeriodic(r));
  }).reduce(function (s, r) { return s + r.taxableUsd; }, 0);
}
// Rows paid before 59½ where an exception was recorded (for the alert text).
function exceptedEarlyUsd(us, dobRaw, baseYear) {
  return rows(us, dobRaw, baseYear).filter(function (r) { return r.exception !== "none" && r.exception !== "pension_legacy" && isEarly(r, dobRaw, baseYear); })
    .reduce(function (s, r) { return s + r.taxableUsd; }, 0);
}

// §72(t)(4) recapture: earlier SEPP payments (taken before 59½) on every
// broken SEPP row — read from the raw list, so a schedule stopped this year
// with nothing paid still counts.
function seppRecaptureBaseUsd(us, dobRaw, baseYear) { return seppStatus(us, dobRaw, baseYear).recaptureBaseUsd; }
// Every SEPP row marked as changed or stopped, for the alert: the
// recapture base, whether a start date is missing, and the changes that
// came after the required period (no recapture).
function seppStatus(us, dobRaw, baseYear) {
  var ui = (us && us.income_us_source) || {};
  var out = { recaptureBaseUsd: 0, missingStartDate: false, afterPeriod: [] };
  (Array.isArray(ui.retirement_distributions) ? ui.retirement_distributions : []).forEach(function (r) {
    if (!r || !seppMarkedBroken(r)) return;
    var end = seppWindowEnd(r, dobRaw);
    if (seppBroken(r, dobRaw, baseYear)) {
      out.recaptureBaseUsd += Math.max(0, num(r.sepp_prior_payments_usd));
      if (!end) out.missingStartDate = true;
    } else {
      out.afterPeriod.push({ payerName: r.payer_name || null, periodEnd: end[0] + "-" + String(end[1]).padStart(2, "0") + "-" + String(end[2]).padStart(2, "0") });
    }
  });
  return out;
}
// The whole §72(t) additional tax for the year: 10% of this year's early
// distributions (after the treaty) plus 10% of the recaptured SEPP payments.
function additionalTax72tUsd(us, india, dobRaw, baseYear) {
  return (early72tBaseAfterTreatyUsd(us, india, dobRaw, baseYear) + seppRecaptureBaseUsd(us, dobRaw, baseYear)) * 0.10;
}

// DTAA Art. 20 leaves periodic payments (pensions, and SEPP payments while
// the schedule holds) to an Indian resident taxable only in India, so on a
// 1040-NR the US charges no tax on them — and no §72(t) 10% (confirmed by
// the CPA, 2 Oct 2026). A broken SEPP loses both (see the header).
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

module.exports = { seppStatus: seppStatus, seppWindowEnd: seppWindowEnd, seppRecaptureBaseUsd: seppRecaptureBaseUsd, additionalTax72tUsd: additionalTax72tUsd, TREATY_EXEMPTS_72T: TREATY_EXEMPTS_72T, treatyPeriodicExempt: treatyPeriodicExempt, early72tBaseAfterTreatyUsd: early72tBaseAfterTreatyUsd, PLAN_TYPES: PLAN_TYPES, EXCEPTIONS: EXCEPTIONS, rows: rows, totals: totals, age59HalfDate: age59HalfDate, isEarly: isEarly,
  early72tRows: early72tRows, early72tBaseUsd: early72tBaseUsd, exceptedEarlyUsd: exceptedEarlyUsd };

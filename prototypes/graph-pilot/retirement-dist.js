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
 * SEPP (§72(t)(2)(A)(iv), §72(t)(4), Notice 2022-6), per row with
 * early_exception "sepp" (seppAnalysis below):
 *  - The required annual amount is worked out from the method (sepp-calc.js)
 *    when its inputs are entered. A payment that differs from it is a
 *    modification of the series — except in the first year, which is only
 *    flagged (a part-year start may have been agreed with the custodian).
 *  - A modification — that, or the preparer's "changed or stopped" tick —
 *    breaks the series only if it comes before the later of five years from
 *    the first payment (sepp_start_date) and age 59½. It is dated by
 *    sepp_change_date, else the row's date paid, else 31 December. With no
 *    start date the break is taken as it stands.
 *  - A break in this tax year: the 10% falls due now on every earlier SEPP
 *    payment taken before 59½, plus interest for the deferral periods
 *    (Pub. 590-B; reported on Form 5329 line 4). The earlier payments come
 *    year by year from sepp_prior_payments_by_year ({ "2023": 21102, ... }),
 *    else — for a fixed method — from the method's annual amount for each
 *    year from the start year to the year before the change (the series
 *    held in those years); sepp_prior_payments_usd (a total) overrides the
 *    recapture base. Interest on each year's 10% runs from that year's
 *    return due date (15 April of the next year) to the due date of the
 *    return for the year of the change, at the IRS underpayment rate
 *    compounded daily (irs-interest.js). It's left out when the yearly
 *    amounts aren't known or don't add up to the total entered. This year's
 *    payment loses the exception unless it was paid before the change. A break in an earlier
 *    year: the recapture belonged on that year's return, and this year's
 *    payments have no exception. A change in a later year doesn't touch
 *    this return.
 *  - SEPP payments are periodic payments: while the series holds, the
 *    treaty treats them as periodic (DTAA Art. 20, taxable in the country
 *    of residence); a payment that loses the exception is taxed like a lump
 *    sum. */
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
function fmtDate(d) { return d ? d[0] + "-" + String(d[1]).padStart(2, "0") + "-" + String(d[2]).padStart(2, "0") : null; }
// Everything about one SEPP row for this tax year (see the header).
function seppAnalysis(r, dobRaw, baseYear) {
  var year = Math.trunc(Number(baseYear)) || 2026;
  var calc = require("./sepp-calc.js").required(r, dobRaw, year);
  var paidUsd = r.rolled_over === true ? 0 : num(r.taxable_usd);
  var st = ymd(r.sepp_start_date), firstYear = !!st && st[0] === year;
  var mismatch = calc.annualUsd != null && require("./sepp-calc.js").differs(paidUsd, calc.annualUsd);
  var autoBreak = mismatch && !firstYear, marked = r.sepp_broken === true;
  var change = ymd(r.sepp_change_date) || (marked || autoBreak ? (ymd(r.date_paid) || [year, 12, 31]) : null);
  var end = seppWindowEnd(r, dobRaw);
  var modified = (marked || autoBreak) && !!change;
  var broken = modified && (!end || before(change, end));
  var brokenThisYear = broken && change[0] === year, brokenEarlier = broken && change[0] < year;
  var paid = ymd(r.date_paid);
  var rec = brokenThisYear ? seppRecapture(r, calc, dobRaw, change)
    : { baseUsd: 0, scheduleSource: null, schedule: [], interestUsd: 0, interestStatus: null, assumedRates: false, yearsBeforeRates: [] };
  return { payerName: r.payer_name || null, calc: calc, paidUsd: paidUsd, firstYear: firstYear, mismatch: mismatch, autoBreak: autoBreak,
    marked: marked, changeDate: fmtDate(change), changeYear: change ? change[0] : null, periodEnd: fmtDate(end), missingStartDate: !end,
    afterPeriod: modified && !broken, brokenThisYear: brokenThisYear, brokenEarlier: brokenEarlier,
    priorPaymentsUsd: rec.baseUsd, schedule: rec.schedule, scheduleSource: rec.scheduleSource, interestUsd: rec.interestUsd,
    interestStatus: rec.interestStatus, assumedRates: rec.assumedRates, yearsBeforeRates: rec.yearsBeforeRates, interestTo: brokenThisYear ? fmtDate([change[0] + 1, 4, 15]) : null,
    losesException: brokenEarlier || (brokenThisYear && !(paid && before(paid, change))) };
}
// The earlier payments, year by year, and the recapture interest (see the
// header). interestStatus: "computed" | "no_schedule" | "schedule_differs" |
// "before_rates" (a year before the loaded rates: interest left out) — plus
// assumedRates when days past the last published quarter used its rate.
function seppRecapture(r, calc, dobRaw, change) {
  var schedule = [], source = null, by = r.sepp_prior_payments_by_year, h = age59HalfDate(dobRaw), st = ymd(r.sepp_start_date);
  if (by && typeof by === "object" && !Array.isArray(by)) {
    Object.keys(by).forEach(function (y) { var n = Number(y), a = num(by[y]); if (n < change[0] && a > 0) schedule.push({ year: n, amountUsd: a }); });
    if (schedule.length) source = "entered";
  }
  if (!source && st && calc.annualUsd != null && !calc.usesRmd) {
    for (var y = st[0]; y < change[0]; y++) if (!h || before([y, 12, 31], h)) schedule.push({ year: y, amountUsd: calc.annualUsd });
    if (schedule.length) source = "method";
  }
  schedule.sort(function (a, b) { return a.year - b.year; });
  var sum = schedule.reduce(function (s, x) { return s + x.amountUsd; }, 0);
  var total = Math.max(0, num(r.sepp_prior_payments_usd));
  var baseUsd = total > 0 ? total : sum;
  var out = { baseUsd: baseUsd, scheduleSource: source, schedule: schedule, interestUsd: 0, interestStatus: "no_schedule", assumedRates: false, yearsBeforeRates: [] };
  if (!schedule.length) return out;
  if (Math.abs(sum - baseUsd) > Math.max(2 * schedule.length, baseUsd * 0.001)) { out.interestStatus = "schedule_differs"; return out; }
  var I = require("./irs-interest.js"), toDate = [change[0] + 1, 4, 15], totalInterest = 0;
  schedule.forEach(function (x) {
    var res = I.interest(x.amountUsd * 0.10, [x.year + 1, 4, 15], toDate);
    x.interestUsd = res.interestUsd;
    if (res.beforeTable) out.yearsBeforeRates.push(x.year); else totalInterest += res.interestUsd;
    if (res.assumedAfter) out.assumedRates = true;
  });
  out.interestUsd = Math.round(totalInterest * 100) / 100;
  out.interestStatus = out.yearsBeforeRates.length ? "before_rates" : "computed";
  return out;
}
function seppLost(r, dobRaw, baseYear) { return r.early_exception === "sepp" && seppAnalysis(r, dobRaw, baseYear).losesException; }
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
      exception: seppLost(r, dobRaw, baseYear) ? "none" : EXCEPTIONS.indexOf(r.early_exception) >= 0 ? r.early_exception : "none",
      seppBroken: seppLost(r, dobRaw, baseYear),
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
// series broken this tax year — read from the raw list, so a schedule
// stopped this year with nothing paid still counts.
function seppRecaptureBaseUsd(us, dobRaw, baseYear) { return seppStatus(us, dobRaw, baseYear).recaptureBaseUsd; }
// Every SEPP row's analysis, for the alerts, plus the recapture base.
function seppStatus(us, dobRaw, baseYear) {
  var ui = (us && us.income_us_source) || {};
  var out = { recaptureBaseUsd: 0, interestUsd: 0, rows: [] };
  (Array.isArray(ui.retirement_distributions) ? ui.retirement_distributions : []).forEach(function (r) {
    if (!r || r.early_exception !== "sepp") return;
    var a = seppAnalysis(r, dobRaw, baseYear);
    out.rows.push(a);
    if (a.brokenThisYear) { out.recaptureBaseUsd += a.priorPaymentsUsd; out.interestUsd += a.interestUsd; }
  });
  return out;
}
// The whole §72(t) additional tax for the year: 10% of this year's early
// distributions (after the treaty) plus 10% of the recaptured SEPP payments.
function additionalTax72tUsd(us, india, dobRaw, baseYear) {
  var sepp = seppStatus(us, dobRaw, baseYear);
  // The recapture interest is part of the tax increase (§72(t)(4)(A)).
  return (early72tBaseAfterTreatyUsd(us, india, dobRaw, baseYear) + sepp.recaptureBaseUsd) * 0.10 + sepp.interestUsd;
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

module.exports = { seppAnalysis: seppAnalysis, seppStatus: seppStatus, seppWindowEnd: seppWindowEnd, seppRecaptureBaseUsd: seppRecaptureBaseUsd, additionalTax72tUsd: additionalTax72tUsd, TREATY_EXEMPTS_72T: TREATY_EXEMPTS_72T, treatyPeriodicExempt: treatyPeriodicExempt, early72tBaseAfterTreatyUsd: early72tBaseAfterTreatyUsd, PLAN_TYPES: PLAN_TYPES, EXCEPTIONS: EXCEPTIONS, rows: rows, totals: totals, age59HalfDate: age59HalfDate, isEarly: isEarly,
  early72tRows: early72tRows, early72tBaseUsd: early72tBaseUsd, exceptedEarlyUsd: exceptedEarlyUsd };

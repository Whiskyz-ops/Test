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
 *  - Not a change (Notice 2022-6 §3.03(a), §72(t)(4)(A)): the account running
 *    out (sepp_account_exhausted — a short or stopped payment is not a
 *    change), or a change by reason of death or disability
 *    (sepp_change_reason). After disability or death the payments keep an
 *    exception of their own (§72(t)(2)(A)(ii), (iii)).
 *  - Employer plans (401(k), pension, other plan — not an IRA): the SEPP
 *    exception applies only to payments that began after the client left
 *    that employer (§72(t)(3)(B)). sepp_separated_from_service false: the
 *    series never qualified, every payment is an early distribution; not
 *    answered: flagged.
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
// "Today" for the SEPP status: the engine's as-of date (ctx.monitorAsOfBoundary,
// as the Monitor uses), else the clock. [y, m, d] in UTC.
function toYmd(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  var m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  var dt = v instanceof Date ? v : new Date(v);
  return isNaN(dt.getTime()) ? null : [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}
function asOfFromCtx(ctx) { return toYmd(ctx && ctx.monitorAsOfBoundary !== undefined ? ctx.monitorAsOfBoundary : new Date()); }
// This tax year's SEPP payments entered one by one (sepp_payments: [{ date,
// amount_usd }]), sorted by date.
function seppPayments(r, year) {
  return (Array.isArray(r.sepp_payments) ? r.sepp_payments : []).map(function (p) { return { date: ymd(p && p.date), amountUsd: num(p && p.amount_usd) }; })
    .filter(function (p) { return p.date && p.date[0] === year && p.amountUsd > 0; })
    .sort(function (a, b) { return before(a.date, b.date) ? -1 : before(b.date, a.date) ? 1 : 0; });
}
// The row's taxable amount: the 1099-R figure, else the payments entered.
function rowTaxableUsd(r, year) {
  if (num(r.taxable_usd) > 0) return num(r.taxable_usd);
  return r.early_exception === "sepp" ? seppPayments(r, year).reduce(function (s, p) { return s + p.amountUsd; }, 0) : 0;
}
// Everything about one SEPP row for this tax year (see the header). asOf:
// a payment short of the required amount only changes the series once the
// year is over; more than the required amount changes it when it's taken.
function seppAnalysis(r, dobRaw, baseYear, asOf) {
  var SC = require("./sepp-calc.js");
  var year = Math.trunc(Number(baseYear)) || 2026, today = toYmd(asOf);
  var calc = SC.required(r, dobRaw, year);
  var pays = seppPayments(r, year);
  var paidUsd = r.rolled_over === true ? 0 : pays.length ? pays.reduce(function (s, p) { return s + p.amountUsd; }, 0) : num(r.taxable_usd);
  var st = ymd(r.sepp_start_date), firstYear = !!st && st[0] === year;
  var req = calc.annualUsd, tol = req != null ? Math.max(2, req * 0.001) : 0;
  var over = req != null && paidUsd > req + tol, under = req != null && paidUsd < req - tol;
  var yearOver = !today || before([year, 12, 31], today);
  var exhausted = r.sepp_account_exhausted === true;
  var deathOrDisability = r.sepp_change_reason === "death" || r.sepp_change_reason === "disability";
  var employerPlan = ["401k", "pension", "other_plan"].indexOf(r.plan_type) >= 0;
  var notQualified = employerPlan && r.sepp_separated_from_service === false;
  var separationUnknown = employerPlan && r.sepp_separated_from_service !== true && r.sepp_separated_from_service !== false;
  // A shortfall because the account ran out isn't a change.
  var mismatch = over || (under && yearOver && !exhausted), shortSoFar = under && !yearOver && !exhausted;
  var autoBreak = mismatch && !firstYear && !deathOrDisability;
  var marked = r.sepp_broken === true && !deathOrDisability && !exhausted;
  // The date an overpayment happened: the payment that took the year past the required amount.
  var overDate = null;
  if (over && pays.length) { var cum = 0; for (var k = 0; k < pays.length; k++) { cum += pays[k].amountUsd; if (cum > req + tol) { overDate = pays[k].date; break; } } }
  var change = ymd(r.sepp_change_date) || (marked || autoBreak ? (overDate || (under ? [year, 12, 31] : null) || ymd(r.date_paid) || [year, 12, 31]) : null);
  var end = seppWindowEnd(r, dobRaw);
  var modified = (marked || autoBreak) && !!change;
  var broken = modified && (!end || before(change, end));
  var brokenThisYear = broken && change[0] === year, brokenEarlier = broken && change[0] < year;
  var rec = brokenThisYear ? seppRecapture(r, calc, dobRaw, change)
    : { baseUsd: 0, scheduleSource: null, schedule: [], interestUsd: 0, interestStatus: null, assumedRates: false, yearsBeforeRates: [] };
  var periodOver = !!(end && today && !before(today, end));
  // Year-by-year history for the tracker: earlier years (with the recapture
  // and interest when broken this year), then this year.
  var history = (brokenThisYear ? rec.schedule : seppSchedule(r, calc, dobRaw, year).schedule).map(function (x) {
    return { year: x.year, amountUsd: x.amountUsd, recaptureUsd: brokenThisYear ? Math.round(x.amountUsd * 10) / 100 : null, interestUsd: brokenThisYear && x.interestUsd != null ? x.interestUsd : null };
  });
  history.push({ year: year, amountUsd: paidUsd, recaptureUsd: null, interestUsd: null, current: true });
  var status = notQualified ? "not_qualified"
    : brokenThisYear || brokenEarlier ? "broken"
    : deathOrDisability && r.sepp_broken === true ? "ended_exempt"
    : exhausted ? "exhausted"
    : periodOver ? "period_ended"
    : req == null ? "unchecked"
    : (mismatch && firstYear) || (calc.rate && calc.rate.over) || (shortSoFar && today && !before(today, [year, 11, 16])) ? "off_schedule"
    : "on_track";
  return { payerName: r.payer_name || null, planType: r.plan_type || null, calc: calc, paidUsd: paidUsd,
    startBalanceUsd: num(r.sepp_start_balance_usd) || null, balanceUsd: num(r.sepp_balance_usd) || null, payments: pays.map(function (p) { return { date: fmtDate(p.date), amountUsd: p.amountUsd }; }),
    history: history, historySource: brokenThisYear ? rec.scheduleSource : seppSchedule(r, calc, dobRaw, year).source,
    requiredUsd: req, remainingUsd: req != null ? Math.max(0, Math.round((req - paidUsd) * 100) / 100) : null, shortSoFar: shortSoFar, over: over,
    firstYear: firstYear, mismatch: mismatch, autoBreak: autoBreak, status: status,
    exhausted: exhausted, changeReason: deathOrDisability ? r.sepp_change_reason : null, employerPlan: employerPlan,
    notQualified: notQualified, separationUnknown: separationUnknown, asOf: fmtDate(today), startDate: fmtDate(st),
    marked: marked, changeDate: fmtDate(change), changeYear: change ? change[0] : null, periodEnd: fmtDate(end), missingStartDate: !end,
    age59HalfDate: fmtDate(age59HalfDate(dobRaw)), fiveYearDate: st ? fmtDate([st[0] + 5, st[1], st[2]]) : null,
    afterPeriod: modified && !broken, brokenThisYear: brokenThisYear, brokenEarlier: brokenEarlier,
    priorPaymentsUsd: rec.baseUsd, schedule: rec.schedule, scheduleSource: rec.scheduleSource, interestUsd: rec.interestUsd,
    interestStatus: rec.interestStatus, assumedRates: rec.assumedRates, yearsBeforeRates: rec.yearsBeforeRates, interestTo: brokenThisYear ? fmtDate([change[0] + 1, 4, 15]) : null,
    // §72(t)(4): every payment that relied on the exception loses it,
    // including this year's before the change (no interest on those).
    losesException: notQualified || brokenEarlier || brokenThisYear };
}
// The earlier payments, year by year, and the recapture interest (see the
// header). interestStatus: "computed" | "no_schedule" | "schedule_differs" |
// "before_rates" (a year before the loaded rates: interest left out) — plus
// assumedRates when days past the last published quarter used its rate.
// Earlier years' SEPP payments before `untilYear` (and before 59½): entered
// by year, else (fixed method) the method's annual amount.
function seppSchedule(r, calc, dobRaw, untilYear) {
  var schedule = [], source = null, by = r.sepp_prior_payments_by_year, h = age59HalfDate(dobRaw), st = ymd(r.sepp_start_date);
  if (by && typeof by === "object" && !Array.isArray(by)) {
    Object.keys(by).forEach(function (y) { var n = Number(y), a = num(by[y]); if (n < untilYear && a > 0) schedule.push({ year: n, amountUsd: a }); });
    if (schedule.length) source = "entered";
  }
  if (!source && st && calc.annualUsd != null && !calc.usesRmd) {
    for (var y = st[0]; y < untilYear; y++) if (!h || before([y, 12, 31], h)) schedule.push({ year: y, amountUsd: calc.annualUsd });
    if (schedule.length) source = "method";
  }
  schedule.sort(function (a, b) { return a.year - b.year; });
  return { schedule: schedule, source: source };
}
function seppRecapture(r, calc, dobRaw, change) {
  var sch = seppSchedule(r, calc, dobRaw, change[0]), schedule = sch.schedule, source = sch.source;
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
function seppLost(r, dobRaw, baseYear, asOf) { return r.early_exception === "sepp" && seppAnalysis(r, dobRaw, baseYear, asOf).losesException; }
// Periodic for the treaty (Art. 20): marked periodic (or no type, older
// data) and not a broken SEPP.
function treatyPeriodic(r) { return r.paymentType !== "lump_sum" && !r.seppBroken; }

function rows(us, dobRaw, baseYear, asOf) {
  var yr = Math.trunc(Number(baseYear)) || 2026;
  var ui = (us && us.income_us_source) || {};
  var out = [];
  (Array.isArray(ui.retirement_distributions) ? ui.retirement_distributions : []).forEach(function (r) {
    if (!r || r.rolled_over === true || !(rowTaxableUsd(r, yr) > 0)) return;
    out.push({
      planType: PLAN_TYPES.indexOf(r.plan_type) >= 0 ? r.plan_type : "other_plan",
      payerName: r.payer_name || null, taxableUsd: rowTaxableUsd(r, yr),
      paymentType: r.payment_type === "lump_sum" ? "lump_sum" : r.payment_type === "periodic" ? "periodic" : null,
      exception: seppLost(r, dobRaw, baseYear, asOf) ? "none" : EXCEPTIONS.indexOf(r.early_exception) >= 0 ? r.early_exception : "none",
      seppBroken: seppLost(r, dobRaw, baseYear, asOf),
      datePaid: r.date_paid || null, withheldUsd: num(r.federal_withheld_usd), legacy: false
    });
  });
  [["ira", num(ui.ira_distributions_usd)], ["401k", num(ui["401k_distributions_usd"])], ["pension", num(ui.pension_income_usd)]].forEach(function (t) {
    if (t[1] > 0) out.push({ planType: t[0], payerName: null, taxableUsd: t[1], paymentType: t[0] === "pension" ? "periodic" : null,
      exception: t[0] === "pension" ? "pension_legacy" : "none", seppBroken: false, datePaid: null, withheldUsd: 0, legacy: true });
  });
  return out;
}

function totals(us, dobRaw, baseYear, asOf) {
  var t = { iraUsd: 0, k401Usd: 0, pensionUsd: 0, otherUsd: 0, totalUsd: 0, lumpSumUsd: 0, periodicUsd: 0 };
  rows(us, dobRaw, baseYear, asOf).forEach(function (r) {
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
function early72tRows(us, dobRaw, baseYear, asOf) {
  return rows(us, dobRaw, baseYear, asOf).filter(function (r) { return r.exception === "none" && isEarly(r, dobRaw, baseYear); });
}
function early72tBaseUsd(us, dobRaw, baseYear, paymentType, asOf) {
  return early72tRows(us, dobRaw, baseYear, asOf).filter(function (r) {
    return !paymentType || (paymentType === "lump_sum" ? !treatyPeriodic(r) : treatyPeriodic(r));
  }).reduce(function (s, r) { return s + r.taxableUsd; }, 0);
}
// Rows paid before 59½ where an exception was recorded (for the alert text).
function exceptedEarlyUsd(us, dobRaw, baseYear, asOf) {
  return rows(us, dobRaw, baseYear, asOf).filter(function (r) { return r.exception !== "none" && r.exception !== "pension_legacy" && isEarly(r, dobRaw, baseYear); })
    .reduce(function (s, r) { return s + r.taxableUsd; }, 0);
}

// §72(t)(4) recapture: earlier SEPP payments (taken before 59½) on every
// series broken this tax year — read from the raw list, so a schedule
// stopped this year with nothing paid still counts.
function seppRecaptureBaseUsd(us, dobRaw, baseYear, asOf) { return seppStatus(us, dobRaw, baseYear, asOf).recaptureBaseUsd; }
// Every SEPP row's analysis, for the alerts, plus the recapture base.
function seppStatus(us, dobRaw, baseYear, asOf) {
  var ui = (us && us.income_us_source) || {};
  var out = { recaptureBaseUsd: 0, interestUsd: 0, rows: [] };
  (Array.isArray(ui.retirement_distributions) ? ui.retirement_distributions : []).forEach(function (r) {
    if (!r || r.early_exception !== "sepp") return;
    var a = seppAnalysis(r, dobRaw, baseYear, asOf);
    out.rows.push(a);
    if (a.brokenThisYear) { out.recaptureBaseUsd += a.priorPaymentsUsd; out.interestUsd += a.interestUsd; }
  });
  return out;
}
// The whole §72(t) additional tax for the year: 10% of this year's early
// distributions (after the treaty) plus 10% of the recaptured SEPP payments.
function additionalTax72tUsd(us, india, dobRaw, baseYear, asOf) {
  var sepp = seppStatus(us, dobRaw, baseYear, asOf);
  // The recapture interest is part of the tax increase (§72(t)(4)(A)).
  return (early72tBaseAfterTreatyUsd(us, india, dobRaw, baseYear, asOf) + sepp.recaptureBaseUsd) * 0.10 + sepp.interestUsd;
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
function early72tBaseAfterTreatyUsd(us, india, dobRaw, baseYear, asOf) {
  return treatyPeriodicExempt(us, india) ? early72tBaseUsd(us, dobRaw, baseYear, "lump_sum", asOf) : early72tBaseUsd(us, dobRaw, baseYear, null, asOf);
}

// The Monitor's SEPP tracker (Holdings card and the Monitor strip): every
// SEPP series with its state for the year; null when the client has none.
function seppTracker(ctx) {
  var dob = ctx.router && ctx.router.date_of_birth != null ? ctx.router.date_of_birth
    : ctx.india && ctx.india.profile && ctx.india.profile.date_of_birth != null ? ctx.india.profile.date_of_birth
    : ctx.us && ctx.us.profile && ctx.us.profile.date_of_birth != null ? ctx.us.profile.date_of_birth : null;
  var st = seppStatus(ctx.us, dob, require("./treaty-art22.js").baseYearOf(ctx.router, ctx.us), asOfFromCtx(ctx));
  return st.rows.length ? { taxYear: require("./treaty-art22.js").baseYearOf(ctx.router, ctx.us), series: st.rows } : null;
}

// Dollars and cents, by integer cents (the same in the Python engine).
function fmt2(x) {
  var c = Math.round(Math.abs(x) * 100), d = Math.floor(c / 100), ce = c % 100;
  return (x < 0 ? "-$" : "$") + String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + (ce < 10 ? "0" : "") + ce;
}
function ctxDob(ctx) {
  return ctx.router && ctx.router.date_of_birth != null ? ctx.router.date_of_birth
    : ctx.india && ctx.india.profile && ctx.india.profile.date_of_birth != null ? ctx.india.profile.date_of_birth
    : ctx.us && ctx.us.profile && ctx.us.profile.date_of_birth != null ? ctx.us.profile.date_of_birth : null;
}
/* Form 5329 (Part I): required when there is §72(t) additional tax this
 * year (early distributions, a SEPP recapture), or an early distribution
 * relies on an exception that the 1099-R's box 7 code may not show. With a
 * recapture, the line-4 explanation the IRS asks for (Pub. 590-B): each
 * earlier year's payments, the 10% and the interest. */
function form5329(ctx) {
  var dob = ctxDob(ctx), by = require("./treaty-art22.js").baseYearOf(ctx.router, ctx.us), asOf = asOfFromCtx(ctx);
  var taxUsd = additionalTax72tUsd(ctx.us, ctx.india, dob, by, asOf), exceptedUsd = exceptedEarlyUsd(ctx.us, dob, by, asOf);
  var st = seppStatus(ctx.us, dob, by, asOf), lines = [];
  st.rows.filter(function (a) { return a.brokenThisYear; }).forEach(function (a) {
    lines.push((a.payerName || "SEPP series") + ": substantially equal periodic payments begun " + (a.startDate || "(start date not entered)") +
      ", modified " + a.changeDate + " (before " + (a.periodEnd || "the end of the required period") + ").");
    if (a.schedule.length && (a.interestStatus === "computed" || a.interestStatus === "before_rates")) {
      lines.push("Year | SEPP payments | 10% additional tax | Interest to " + a.interestTo);
      var s = 0, t = 0, n = 0;
      a.schedule.forEach(function (x) {
        s += x.amountUsd; t += x.amountUsd * 0.10; n += x.interestUsd || 0;
        lines.push(x.year + " | " + fmt2(x.amountUsd) + " | " + fmt2(x.amountUsd * 0.10) + " | " + (x.interestUsd == null ? "not computed (before 2017)" : fmt2(x.interestUsd)));
      });
      lines.push("Total | " + fmt2(s) + " | " + fmt2(t) + " | " + fmt2(n));
    } else {
      lines.push("Earlier SEPP payments before 59½ (total; no yearly amounts): " + fmt2(a.priorPaymentsUsd) + " | 10%: " + fmt2(a.priorPaymentsUsd * 0.10) + " | interest not computed");
    }
    lines.push("Recapture tax: 10% of " + fmt2(a.priorPaymentsUsd) + " = " + fmt2(a.priorPaymentsUsd * 0.10) + ", plus interest " + fmt2(a.interestUsd) +
      " = " + fmt2(a.priorPaymentsUsd * 0.10 + a.interestUsd) + ".");
  });
  if (lines.length) lines.push("Interest: IRS underpayment rate (IRC §6621(a)(2)), compounded daily (§6622), on each year's 10% from 15 April of the following year to the due date of this return.");
  return { required: taxUsd > 0 || exceptedUsd > 0, taxUsd: taxUsd, exceptedUsd: exceptedUsd,
    attachment: lines.length ? "Form 5329, line 4 — recapture tax under IRC §72(t)(4)\n" + lines.join("\n") : null };
}

// The §72(t) additional tax split into its parts, for the Reconciliation
// rows: 10% on this year's early distributions (after the treaty on a
// 1040-NR), the SEPP recapture and its interest — the same functions as the
// tax itself, so the parts add up to it.
function additionalTax72tParts(ctx, treaty) {
  var dob = ctxDob(ctx), by = require("./treaty-art22.js").baseYearOf(ctx.router, ctx.us), asOf = asOfFromCtx(ctx);
  var earlyBaseUsd = treaty ? early72tBaseAfterTreatyUsd(ctx.us, ctx.india, dob, by, asOf) : early72tBaseUsd(ctx.us, dob, by, null, asOf);
  var st = seppStatus(ctx.us, dob, by, asOf);
  return { earlyBaseUsd: earlyBaseUsd, earlyUsd: earlyBaseUsd * 0.10, recaptureBaseUsd: st.recaptureBaseUsd, recaptureUsd: st.recaptureBaseUsd * 0.10,
    interestUsd: st.interestUsd, series: st.rows.filter(function (a) { return a.brokenThisYear; }) };
}

module.exports = { additionalTax72tParts: additionalTax72tParts, form5329: form5329, fmt2: fmt2, seppTracker: seppTracker, asOfFromCtx: asOfFromCtx, toYmd: toYmd, seppAnalysis: seppAnalysis, seppStatus: seppStatus, seppWindowEnd: seppWindowEnd, seppRecaptureBaseUsd: seppRecaptureBaseUsd, additionalTax72tUsd: additionalTax72tUsd, TREATY_EXEMPTS_72T: TREATY_EXEMPTS_72T, treatyPeriodicExempt: treatyPeriodicExempt, early72tBaseAfterTreatyUsd: early72tBaseAfterTreatyUsd, PLAN_TYPES: PLAN_TYPES, EXCEPTIONS: EXCEPTIONS, rows: rows, totals: totals, age59HalfDate: age59HalfDate, isEarly: isEarly,
  early72tRows: early72tRows, early72tBaseUsd: early72tBaseUsd, exceptedEarlyUsd: exceptedEarlyUsd };

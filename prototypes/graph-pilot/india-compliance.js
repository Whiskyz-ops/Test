"use strict";
/* A TRC only supports treaty relief for the period it certifies: one whose
 * validity dates (when entered on Layer 1 India) don't overlap this
 * financial year (April of base_tax_year to the next March) doesn't count
 * as on file. Blank dates keep the old behaviour (the upload/flag alone). */
function trcCoversYear(india, router) {
  var trc = (india && india.compliance_docs && india.compliance_docs.trc) || {};
  var fy = Number(router && router.base_tax_year) || 2026;
  var fyStart = fy + "-04-01", fyEnd = (fy + 1) + "-03-31";
  if (trc.validity_end_date && String(trc.validity_end_date) < fyStart) return false;
  if (trc.validity_start_date && String(trc.validity_start_date) > fyEnd) return false;
  return true;
}
function safe(obj, path, dflt) {
  var parts = path.split("."), cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function trcOnFile(india, router) {
  var flag = safe(india, "dtaa.trc_status", false) === true || safe(india, "compliance_docs.trc.document_uploaded", false) === true;
  return flag && trcCoversYear(india, router);
}
/* Advance-tax interest (s.424/s.425 of the 2025 Act; ss.234B/234C of 1961).
 * Instalments are CUMULATIVE: by 15 Jun 15%, 15 Sep 45%, 15 Dec 75%, 15 Mar
 * 100% of the tax due (after TDS/TCS), each compared with everything paid
 * by that date — an early overpayment covers later dates. No interest for
 * June if 12% was paid by then, or for September if 36% was. Presumptive
 * (s.44AD/44ADA) taxpayers owe the whole amount by 15 March. Interest is
 * 1% a month on the shortfall rounded down to a multiple of Rs 100 (Rule
 * 119A). */
function floor100(x) { return Math.floor(Math.max(0, x) / 100) * 100; }
var ADV_TAX_SCHEDULE = [
  { cum: 0.15, safe: 0.12, months: 3 }, { cum: 0.45, safe: 0.36, months: 3 },
  { cum: 0.75, safe: null, months: 3 }, { cum: 1.00, safe: null, months: 1 }
];
// Shortfall at each instalment date: [{ quarter, requiredPct, cumPaidInr, shortInr, months }].
function advanceTaxShortfalls(assessedTaxInr, paidByQuarter, purelyPresumptive) {
  var paid = paidByQuarter.map(function (x) { return Number(x) || 0; });
  if (purelyPresumptive) {
    var total = paid.reduce(function (s, x) { return s + x; }, 0);
    return [{ quarter: "single", requiredPct: 1.00, cumPaidInr: total, shortInr: Math.max(0, assessedTaxInr - total), months: 1 }];
  }
  var cumPaid = 0;
  return ADV_TAX_SCHEDULE.map(function (q, i) {
    cumPaid += paid[i];
    var short = q.safe !== null && cumPaid >= q.safe * assessedTaxInr ? 0 : Math.max(0, q.cum * assessedTaxInr - cumPaid);
    return { quarter: i + 1, requiredPct: q.cum, cumPaidInr: cumPaid, shortInr: short, months: q.months };
  });
}
function interest234C(assessedTaxInr, paidByQuarter, purelyPresumptive) {
  if (!(assessedTaxInr > 0)) return 0;
  return advanceTaxShortfalls(assessedTaxInr, paidByQuarter, purelyPresumptive)
    .reduce(function (s, q) { return s + floor100(q.shortInr) * 0.01 * q.months; }, 0);
}
function interest234B(assessedTaxInr, advancePaidInr, months) {
  if (!(assessedTaxInr > 0) || advancePaidInr >= assessedTaxInr * 0.9) return 0;
  return floor100(assessedTaxInr - advancePaidInr) * 0.01 * months;
}
module.exports = { trcCoversYear: trcCoversYear, trcOnFile: trcOnFile, advanceTaxShortfalls: advanceTaxShortfalls, interest234B: interest234B, interest234C: interest234C };

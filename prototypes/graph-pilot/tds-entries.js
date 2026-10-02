/* tds-entries.js — TDS by source, as Form 26AS / AIS lists it (one row per
 * deductor). Python mirror: dag_py/src/wising_dag/india/tds_entries.py.
 *
 * Layer 1 India: tax_credits.tds_entries = [{ source, payer_name, income_inr,
 * tds_inr }]. source: salary | interest | dividend | rent | professional_fees
 * | other. tax_credits.tds_already_deducted_inr stays as "TDS not broken
 * down by source"; the TDS total is that figure plus every entry (an entry
 * is never also counted in the aggregate). */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var SOURCES = {
  salary: { label: "Salary", resident: "s.192", nonResident: "s.192" },
  interest: { label: "Interest", resident: "s.194A", nonResident: "s.195" },
  dividend: { label: "Dividend", resident: "s.194", nonResident: "s.195" },
  rent: { label: "Rent", resident: "s.194-I", nonResident: "s.195" },
  professional_fees: { label: "Professional / technical fees", resident: "s.194J", nonResident: "s.195" },
  other: { label: "Other", resident: null, nonResident: "s.195" }
};

// The entries on file with a TDS amount, normalised.
function tdsEntries(india) {
  var list = india && india.tax_credits && Array.isArray(india.tax_credits.tds_entries) ? india.tax_credits.tds_entries : [];
  return list.filter(function (e) { return e && num(e.tds_inr) > 0; }).map(function (e) {
    var src = SOURCES[e.source] ? e.source : "other";
    return { source: src, label: SOURCES[src].label, payerName: e.payer_name || null, incomeInr: num(e.income_inr) || null, tdsInr: num(e.tds_inr) };
  });
}

function tdsEntriesTotalInr(india) {
  return tdsEntries(india).reduce(function (t, e) { return t + e.tdsInr; }, 0);
}

// TDS the employer actually deducted on salary (Form 26AS, s.192).
function salaryTdsInr(india) {
  return tdsEntries(india).filter(function (e) { return e.source === "salary"; }).reduce(function (t, e) { return t + e.tdsInr; }, 0);
}

// The TDS section a deductor uses for this source: s.195 for most payments
// to a non-resident, the resident-payee section otherwise.
function tdsSection(source, isNonResident) {
  var s = SOURCES[source] || SOURCES.other;
  return isNonResident ? s.nonResident : s.resident;
}

// For comparisons against the frozen engine only: the frozen engine shows
// the TDS total as one row with fixed wording; the DAG's tds_aggregate row
// now says what it was deducted on (GAP_TRACKER IN-85). Maps that row back.
function frozenWithholding(wh) {
  if (!wh || !wh.india || !Array.isArray(wh.india.rows)) return wh;
  var rows = wh.india.rows.map(function (r) {
    if (r.id !== "tds_aggregate") return r;
    return Object.assign({}, r, { label: "TDS Already Deducted (Aggregate — Form 26AS)", grossInr: null, rateAppliedPct: null, citation: "s.199",
      note: "Single aggregate figure — Layer 1 doesn't capture a per-source breakdown of income type or rate for this amount" });
  });
  return Object.assign({}, wh, { india: Object.assign({}, wh.india, { rows: rows }) });
}

module.exports = { frozenWithholding: frozenWithholding, SOURCES: SOURCES, tdsEntries: tdsEntries, tdsEntriesTotalInr: tdsEntriesTotalInr, salaryTdsInr: salaryTdsInr, tdsSection: tdsSection };

/* irs-interest.js — interest on a tax that was deferred, at the IRS
 * underpayment rate (§6621(a)(2)), compounded daily (§6622). Used for the
 * §72(t)(4) recapture's "interest for the deferral periods". Python mirror:
 * dag_py/src/wising_dag/us/irs_interest.py.
 *
 * Rates: IRS "Quarterly interest rates" page, underpayment (non-corporate),
 * downloaded 2 Oct 2026 — 2017 Q1 to 2026 Q4. Earlier years aren't on that
 * page and aren't loaded: a period starting before 2017 is reported, not
 * computed. A day after the last published quarter uses the last rate
 * (reported as an assumption). Each day: balance × (1 + rate ÷ days in that
 * year). */
// Underpayment rate (%), by year, quarters 1-4.
var RATES = {
  2017: [4.0, 4.0, 4.0, 4.0],
  2018: [4.0, 5.0, 5.0, 5.0],
  2019: [6.0, 6.0, 5.0, 5.0],
  2020: [5.0, 5.0, 3.0, 3.0],
  2021: [3.0, 3.0, 3.0, 3.0],
  2022: [3.0, 4.0, 5.0, 6.0],
  2023: [7.0, 7.0, 7.0, 8.0],
  2024: [8.0, 8.0, 8.0, 8.0],
  2025: [7.0, 7.0, 7.0, 7.0],
  2026: [7.0, 6.0, 7.0, 7.0]
};
var FIRST_YEAR = 2017, LAST_YEAR = 2026;

function dayNo(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
function ymdOfDay(n) { var dt = new Date(n * 86400000); return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

/* Interest on `principal` from `from` to `to` ([y, m, d] dates).
 * Returns { interestUsd, beforeTable (true: starts before 2017, not computed),
 * assumedAfter (true: used the last rate for days past the table) }. */
function interest(principal, from, to) {
  if (!(principal > 0)) return { interestUsd: 0, beforeTable: false, assumedAfter: false };
  if (from[0] < FIRST_YEAR) return { interestUsd: null, beforeTable: true, assumedAfter: false };
  var a = dayNo(from[0], from[1], from[2]), b = dayNo(to[0], to[1], to[2]), bal = principal, assumed = false;
  for (var n = a; n < b; n++) {
    var d = ymdOfDay(n), q = Math.floor((d[1] - 1) / 3), rate;
    if (d[0] > LAST_YEAR) { rate = RATES[LAST_YEAR][3]; assumed = true; } else rate = RATES[d[0]][q];
    bal = bal * (1 + rate / 100 / (isLeap(d[0]) ? 366 : 365));
  }
  return { interestUsd: Math.round((bal - principal) * 100) / 100, beforeTable: false, assumedAfter: assumed };
}

module.exports = { RATES: RATES, FIRST_YEAR: FIRST_YEAR, LAST_YEAR: LAST_YEAR, interest: interest };

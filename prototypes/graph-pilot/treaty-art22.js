/* treaty-art22.js — DTAA Art. 22 (teachers and researchers) and the saving
 * clause's exception for it. Python mirror: dag_py/src/wising_dag/us/treaty_art22.py.
 *
 * Art. 22(1): pay for teaching or research at a university or similar
 * institution, received by someone who was resident in India immediately
 * before visiting the US, is exempt from US tax for up to two years from
 * the date of arrival. Art. 1(3) (saving clause) lets the US tax its
 * citizens and residents as if the treaty didn't exist, but Art. 1(4)(b)
 * keeps Arts. 19, 21 and 22 for a US resident who is neither a citizen nor
 * a green-card holder. So: an Indian teacher who became a US resident under
 * the substantial presence test keeps the exemption; a citizen or green-card
 * holder doesn't.
 *
 * Layer 1 US (us_residency_detail): article_22_claim, article_22_arrival_date,
 * article_22_exempt_wages_usd (this year's teaching / research pay). The
 * exempt part is that pay × the share of the tax year inside the two-year
 * window (all of it when no arrival date is entered). */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function ymd(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function dayNo(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }

function art22(us, baseYear) {
  var r = (us && us.us_residency_detail) || {};
  if (r.article_22_claim !== true) return null;
  var claimedUsd = Math.max(0, num(r.article_22_exempt_wages_usd));
  var blockedBy = r.is_us_citizen === true ? "citizen" : r.has_green_card === true ? "green_card" : null;
  var y = Math.trunc(Number(baseYear)) || 2026;
  var a = ymd(r.article_22_arrival_date);
  var fraction = 1, windowEnd = null;
  if (a) {
    var start = dayNo(y, 1, 1), end = dayNo(y + 1, 1, 1);
    var from = Math.max(start, dayNo(a[0], a[1], a[2])), to = Math.min(end, dayNo(a[0] + 2, a[1], a[2]));
    fraction = Math.max(0, to - from) / (end - start);
    windowEnd = (a[0] + 2) + "-" + String(a[1]).padStart(2, "0") + "-" + String(a[2]).padStart(2, "0");
  }
  return { claimedUsd: claimedUsd, fraction: fraction, exemptUsd: blockedBy ? 0 : claimedUsd * fraction, blockedBy: blockedBy,
    arrivalDate: a ? r.article_22_arrival_date.slice(0, 10) : null, windowEnd: windowEnd };
}

// The tax year the window is measured against: the same base year as the rest
// of the engine (metaResult.baseYear — router first, then the US form's
// calendar year).
function baseYearOf(router, us) {
  var y = router && router.base_tax_year != null ? router.base_tax_year : us && us.metadata && us.metadata.us_calendar_year != null ? us.metadata.us_calendar_year : 2025;
  return Math.trunc(num(y)) || 2025;
}

module.exports = { art22: art22, baseYearOf: baseYearOf };

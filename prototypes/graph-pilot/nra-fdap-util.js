/* Shared by ustax-full-nodes.js (nraTaxResult) and findings-batch4-nodes.js
 * (nraFdapDetail), so the 1040-NR tax and the withholding summary / finding
 * read the same per-income-type rates. Mirrors dag_py's us/nra_fdap.py. */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

/* FDAP of a 1040-NR filer, one row per income type (India-US treaty):
 * dividends / interest / royalties at the rate claimed for THAT type on a
 * W-8BEN (Art. 10/11/12; never above the 30% statutory rate — a claim for
 * one type no longer sets the rate for all of them); gross US rent 30% (no
 * treaty reduction); Social Security 85% taxable at 30% (§871(a)(3) — Art.
 * 20(2) leaves it to the US); periodic US pensions / IRA / 401(k) payments
 * taxable only in India under Art. 20(1) (claimed on the return's Schedule
 * OI, so no W-8BEN is needed) — shown as a $0 row. Declared FDAP beyond
 * the typed rows is taxed at 30%; declared FDAP below them fills the rows
 * in order. */
function nraFdapBreakdown(fdapUsd, agg, royaltiesUsd, rentalElected, claims, w8ben) {
  var rateFor = {};
  (claims || []).forEach(function (c) {
    if (!c || c.elected_rate == null || c.elected_rate === "") return;
    var t = String(c.income_type || "").toLowerCase().replace(/s$/, "");
    rateFor[t] = Math.max(0, Math.min(0.30, Number(c.elected_rate) / 100));
  });
  function rate(t) { return w8ben && rateFor[t] != null ? rateFor[t] : 0.30; }
  // Tax a missing W-8BEN costs: the claimed rate is denied, 30% applies.
  function gap(t, base) { return !w8ben && rateFor[t] != null ? base * (0.30 - rateFor[t]) : 0; }
  var typed = [
    { type: "dividends", baseUsd: num(agg.ordinaryDividendsUs && agg.ordinaryDividendsUs.usd), rate: rate("dividend"), basis: "Art. 10" },
    { type: "interest", baseUsd: num(agg.interestUs && agg.interestUs.usd), rate: rate("interest"), basis: "Art. 11" },
    { type: "royalties", baseUsd: num(royaltiesUsd), rate: rate("royaltie"), basis: "Art. 12" },
    { type: "rent", baseUsd: rentalElected ? 0 : num(agg.rentalUs && agg.rentalUs.usd), rate: 0.30, basis: "gross rent, no treaty reduction" }
  ];
  var typedUsd = typed.reduce(function (s, r) { return s + r.baseUsd; }, 0);
  // Declared FDAP below the typed income: fill the rows in order (dividends,
  // interest, royalties, then rent — rent is what a §871(d) net-basis
  // election usually moves to ECI) rather than scaling every row.
  if (fdapUsd < typedUsd) {
    var left = Math.max(0, fdapUsd);
    typed.forEach(function (r) { r.baseUsd = Math.min(r.baseUsd, left); left -= r.baseUsd; });
  } else if (fdapUsd > typedUsd) typed.push({ type: "other", baseUsd: fdapUsd - typedUsd, rate: 0.30, basis: "statutory 30%" });
  var ssUsd = num(agg.socialSecurityUs && agg.socialSecurityUs.usd);
  var pensionUsd = num(agg.usRetirementIncomeExclSs && agg.usRetirementIncomeExclSs.usd);
  var extra = [
    { type: "social_security", baseUsd: 0.85 * ssUsd, rate: 0.30, basis: "§871(a)(3): 85% taxable at 30%; DTAA Art. 20(2)" },
    { type: "pensions", baseUsd: pensionUsd, rate: 0, basis: "DTAA Art. 20(1): periodic pensions taxable only in India" }
  ];
  var rows = typed.concat(extra).filter(function (r) { return r.baseUsd > 0; });
  var claimType = { dividends: "dividend", interest: "interest", royalties: "royaltie" };
  rows.forEach(function (r) { r.taxUsd = r.baseUsd * r.rate; });
  var gapUsd = rows.reduce(function (s, r) { return s + (claimType[r.type] ? gap(claimType[r.type], r.baseUsd) : 0); }, 0);
  var sum = function (list) { return list.reduce(function (s, r) { return s + (r.taxUsd || 0); }, 0); };
  var lumpRows = rows.filter(function (r) { return r.type !== "social_security" && r.type !== "pensions"; });
  var lumpBase = lumpRows.reduce(function (s, r) { return s + r.baseUsd; }, 0);
  return {
    rows: rows, fdapTaxUsd: sum(lumpRows), effectiveRate: lumpBase > 0 ? sum(lumpRows) / lumpBase : null,
    socialSecurityTaxableUsd: 0.85 * ssUsd, socialSecurityTaxUsd: 0.85 * ssUsd * 0.30,
    pensionUsd: pensionUsd, gapUsd: gapUsd
  };
}

module.exports = { nraFdapBreakdown: nraFdapBreakdown };

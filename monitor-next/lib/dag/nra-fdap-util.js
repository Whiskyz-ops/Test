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
// treatyResident: false only when Layer 1 India records the client as NOT
// resident in India — then no India-US treaty benefit applies at all.
function nraFdapBreakdown(fdapUsd, agg, royaltiesUsd, rentalElected, claims, w8ben, treatyResident, exemptInterestUsd) {
  treatyResident = treatyResident !== false;
  var interestUsd = num(agg.interestUs && agg.interestUs.usd);
  var exemptIntUsd = Math.min(Math.max(0, num(exemptInterestUsd)), interestUsd);
  var rateFor = {};
  (claims || []).forEach(function (c) {
    if (!c || c.elected_rate == null || c.elected_rate === "") return;
    var t = String(c.income_type || "").toLowerCase().replace(/s$/, "");
    rateFor[t] = Math.max(0, Math.min(0.30, Number(c.elected_rate) / 100));
  });
  function rate(t) { return treatyResident && w8ben && rateFor[t] != null ? rateFor[t] : 0.30; }
  // Tax a missing W-8BEN costs: the claimed rate is denied, 30% applies.
  function gap(t, base) { return treatyResident && !w8ben && rateFor[t] != null ? base * (0.30 - rateFor[t]) : 0; }
  var typed = [
    { type: "dividends", baseUsd: num(agg.ordinaryDividendsUs && agg.ordinaryDividendsUs.usd), rate: rate("dividend"), basis: "Art. 10" },
    { type: "interest_exempt", baseUsd: exemptIntUsd, rate: 0, basis: "IRC §871(i)/(h): bank-deposit and portfolio (incl. Treasury) interest exempt for a non-resident alien" },
    { type: "interest", baseUsd: interestUsd - exemptIntUsd, rate: rate("interest"), basis: "Art. 11" },
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
  // DTAA Art. 20 covers pensions — periodic payments; a lump-sum
  // withdrawal isn't one, so the US keeps its 30% on it (retirement-dist.js).
  var lumpSumUsd = Math.min(pensionUsd, num(agg.usRetirementLumpSumUsd));
  var periodicUsd = pensionUsd - lumpSumUsd;
  var extra = [
    { type: "social_security", baseUsd: 0.85 * ssUsd, rate: 0.30, basis: "§871(a)(3): 85% taxable at 30%; DTAA Art. 20(2)" },
    treatyResident
      ? { type: "pensions", baseUsd: periodicUsd, rate: 0, basis: "DTAA Art. 20(1): periodic pensions taxable only in India" }
      : { type: "pensions", baseUsd: periodicUsd, rate: 0.30, basis: "30% — not resident in India, so DTAA Art. 20(1) doesn't apply" },
    { type: "retirement_lump_sum", baseUsd: lumpSumUsd, rate: 0.30, basis: "30% — a lump-sum withdrawal isn't a pension (periodic payments) under DTAA Art. 20" }
  ];
  var rows = typed.concat(extra).filter(function (r) { return r.baseUsd > 0; });
  var claimType = { dividends: "dividend", interest: "interest", royalties: "royaltie" };
  rows.forEach(function (r) { r.taxUsd = r.baseUsd * r.rate; });
  var gapUsd = rows.reduce(function (s, r) { return s + (claimType[r.type] ? gap(claimType[r.type], r.baseUsd) : 0); }, 0);
  var sum = function (list) { return list.reduce(function (s, r) { return s + (r.taxUsd || 0); }, 0); };
  var lumpRows = rows.filter(function (r) { return r.type !== "social_security" && r.type !== "pensions" && r.type !== "retirement_lump_sum"; });
  var lumpBase = lumpRows.reduce(function (s, r) { return s + r.baseUsd; }, 0);
  return {
    rows: rows, fdapTaxUsd: sum(lumpRows), effectiveRate: lumpBase > 0 ? sum(lumpRows) / lumpBase : null,
    socialSecurityTaxableUsd: 0.85 * ssUsd, socialSecurityTaxUsd: 0.85 * ssUsd * 0.30,
    pensionUsd: treatyResident ? periodicUsd : 0, pensionTaxUsd: (treatyResident ? 0 : 0.30 * periodicUsd) + 0.30 * lumpSumUsd,
    pensionTaxableUsd: (treatyResident ? 0 : periodicUsd) + lumpSumUsd, gapUsd: gapUsd
  };
}

/* US interest a non-resident alien owes no US tax on, from Layer 1 US's own
 * interest split: "Banks & Brokerages" (bank deposits, IRC §871(i)(2)(A);
 * registered bonds held at a broker, portfolio interest, §871(h)) and "US
 * Treasuries" (portfolio interest, §871(h)). "Private / OID" and "Private /
 * Seller Fin." stay taxable — whether they qualify as portfolio interest
 * (registered form, lender not a 10% owner) isn't collected. */
function nraExemptInterestUsd(us) {
  var ui = (us && us.income_us_source) || {};
  return Math.min(num(ui.interest_us_bank_usd) + num(ui.interest_us_treasury_usd), num(ui.interest_us_source_usd));
}
/* Whether Layer 1 recorded the interest split at all (older data, or an
 * interest total entered another way, has only interest_us_source_usd). */
function nraInterestSplitRecorded(us) {
  var ui = (us && us.income_us_source) || {};
  return ["interest_us_bank_usd", "interest_us_treasury_usd", "interest_us_oid_usd", "interest_us_private_usd"].some(function (k) { return num(ui[k]) > 0; });
}

module.exports = { nraFdapBreakdown: nraFdapBreakdown, nraExemptInterestUsd: nraExemptInterestUsd, nraInterestSplitRecorded: nraInterestSplitRecorded };

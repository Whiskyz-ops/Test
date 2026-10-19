"use strict";
/* ============================================================================
 * india-property-sale.js — sale of Indian immovable property (Layer 1 India
 * "Property" screen, india.property.properties[]), worked out under BOTH
 * countries' rules. Python mirror: dag_py/src/wising_dag/india/property_sale.py.
 *
 * The form saved every sale field (dates, cost, sale price, stamp-duty value,
 * improvements, inheritance, exemption, buyer TDS) but no engine node read
 * them, so a sale changed neither country's tax (GAP_TRACKER IN-99).
 *
 * India (per sale):
 *   - full value of consideration: the sale price, or the stamp-duty value
 *     when that is more than 110% of the price (the stamp-duty rule,
 *     formerly s.50C of the 1961 Act);
 *   - cost: actual cost; an inherited property takes the previous owner's
 *     cost and acquisition date; acquired before 1 Apr 2001 → the higher of
 *     cost and the 1 Apr 2001 fair market value; improvements made on or
 *     after 1 Apr 2001 are added;
 *   - held more than 24 months → long-term, 12.5% without indexation (the
 *     ltcg197 bucket); otherwise short-term at slab rates (stcgSlab);
 *   - reinvestment exemptions (individuals / HUFs, long-term gains only):
 *     residential house → house (s.54: up to the amount reinvested, capped
 *     at ₹10 crore), NHAI / REC bonds (s.54EC: up to ₹50 lakh), any other
 *     asset → house (s.54F: gain × reinvested ÷ net consideration). The form's
 *     other exemption choices are flagged, not computed;
 *   - rural agricultural land is not a capital asset: no Indian gain;
 *   - a joint property is taken at the client's ownership share;
 *   - the buyer's TDS is credited in full (it is deducted on this seller).
 *
 * US (a US person is taxed on the same sale; real property isn't a §988
 * asset): proceeds at the sale-year rate, cost and each improvement at
 * their own year's rate, selling costs at the sale-year rate; no stamp-duty
 * rule and no Indian exemptions; held more than 12 months → long-term. Rates
 * are the Federal Reserve's annual averages (FRED AEXINUS, H.10 / G.5A);
 * a year past the table uses the latest published average (or the what-if
 * rate). Not worked out, estimated from India's gain and flagged: inherited
 * property (US basis is the value at the date of death, §1014, which the
 * form doesn't collect) and purchases before 2001. Amounts in a currency
 * other than INR / USD aren't computed at all (flagged).
 * ==========================================================================*/
var fxRate = require("./fx-util.js").fxRate;

// Indian rupees per US dollar, annual average of daily noon buying rates
// (Federal Reserve G.5A, FRED series AEXINUS; retrieved Oct 2026).
var INR_PER_USD_ANNUAL = {
  2001: 47.2200, 2002: 48.6257, 2003: 46.5908, 2004: 45.2610, 2005: 44.0002,
  2006: 45.1861, 2007: 41.1774, 2008: 43.3859, 2009: 48.3324, 2010: 45.6507,
  2011: 46.5782, 2012: 53.3743, 2013: 58.5149, 2014: 60.9953, 2015: 64.1073,
  2016: 67.1572, 2017: 65.0659, 2018: 68.3734, 2019: 70.3777, 2020: 74.1429,
  2021: 73.9351, 2022: 78.5792, 2023: 82.5708, 2024: 83.6566, 2025: 87.1468
};
var FMV_2001_DATE = "2001-04-01";
var S54_CAP_INR = 100000000;   // ₹10 crore (s.54 / s.54F reinvestment cap)
var S54EC_CAP_INR = 5000000;   // ₹50 lakh
var EXEMPTIONS = {
  "Reinvestment in Residential House": "s54",
  "Reinvestment (Invest in NHAI or REC Bonds - Max ₹50L)": "s54ec",
  "Reinvestment (Any Asset to Res. House)": "s54f"
};
var EXEMPTION_LABEL = { s54: "s.54 house reinvestment", s54ec: "s.54EC bonds", s54f: "s.54F (any asset to a house)" };

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function has(v) { return v !== null && v !== undefined && v !== ""; }
function yearOf(dateStr) { var y = parseInt(String(dateStr || "").slice(0, 4), 10); return isNaN(y) ? null : y; }
function monthsBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  var a = new Date(fromStr), b = new Date(toStr);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return ((b - a) / (1000 * 60 * 60 * 24)) / 30.436875;
}
var LATEST_TABLE_YEAR = 2025;
// Rupees per dollar for a year: the annual table; a year after it uses the
// latest published average (or the what-if rate the user set); before it,
// the engine's rate.
function inrPerUsd(year, ctx) {
  if (year !== null && INR_PER_USD_ANNUAL[year]) return INR_PER_USD_ANNUAL[year];
  if (year !== null && year > LATEST_TABLE_YEAR && !(ctx && ctx.fxRateOverride)) return INR_PER_USD_ANNUAL[LATEST_TABLE_YEAR];
  return fxRate(ctx);
}
function inTable(year) { return year !== null && !!INR_PER_USD_ANNUAL[year]; }

// The form saves codes (residential / commercial / land / agricultural_rural /
// under_construction); hand-written profiles may use labels ("Residential",
// "Land (non-agricultural)").
function propKind(p) {
  var t = String((p && p.property_type) || "").toLowerCase();
  if (t === "agricultural_rural" || (/agricultural/.test(t) && /rural/.test(t) && !/non-agricultural/.test(t))) return "agri_rural";
  if (t.indexOf("residential") === 0) return "residential";
  return "other";
}
function isSold(p) { return !!p && (p.status === "sold" || (has(p.sale_date) && num(p.sale_consideration) > 0)); }
function saleKey(p) { return [p.address || "", p.sale_date || "", num(p.sale_consideration)].join("|"); }

// Sold rows: the top-level list plus any sold row that only a quarter holds
// (the form keeps the list per quarter tab; the saved top level is the tab
// that was open), each sale once.
function soldProperties(india) {
  var out = [], seen = {};
  function add(list) {
    (list || []).forEach(function (p) {
      if (!isSold(p)) return;
      var k = saleKey(p);
      if (seen[k]) return;
      seen[k] = true; out.push(p);
    });
  }
  add(india && india.property && india.property.properties);
  var q = india && india.quarters;
  if (q) ["Q1", "Q2", "Q3", "Q4"].forEach(function (k) { add(q[k] && q[k].property && q[k].property.properties); });
  return out;
}

// An amount in INR (or USD, at the given year's rate); null for another currency.
function toInr(amount, currency, year, ctx) {
  if (!currency || currency === "INR") return num(amount);
  if (currency === "USD") return num(amount) * inrPerUsd(year, ctx);
  return null;
}

function computeSale(p, ctx, entityType) {
  var inherited = p.is_inherited === true;
  var acqDate = inherited ? (p.original_owner_acquisition_date || p.acquisition_date) : p.acquisition_date;
  var acqYear = yearOf(acqDate), saleYear = yearOf(p.sale_date);
  var share = (p.is_joint_property === true && num(p.ownership_percentage) > 0) ? num(p.ownership_percentage) / 100 : 1;
  var costRaw = inherited ? p.original_owner_cost : p.actual_cost;
  var costCur = inherited ? p.original_owner_cost_currency : p.actual_cost_currency;
  var saleInr = toInr(p.sale_consideration, p.sale_consideration_currency, saleYear, ctx);
  var costInr = toInr(costRaw, costCur, acqYear, ctx);
  var label = p.address || ((p.property_type || "Property") + (p.sale_date ? " sold " + p.sale_date : ""));
  var row = {
    label: label, propertyType: p.property_type || null, acquisitionDate: acqDate || null, saleDate: p.sale_date || null,
    inherited: inherited, sharePct: share * 100, tdsInr: num(p.buyer_tds_deducted_inr), notes: [], review: []
  };
  var months = monthsBetween(acqDate, p.sale_date);
  if (saleInr === null || costInr === null || months === null) {
    row.computed = false;
    row.review.push(saleInr === null || costInr === null ? "an amount is in a currency other than INR or USD" : "the acquisition or sale date is missing");
    row.india = null; row.us = null;
    return row;
  }
  row.computed = true;
  row.monthsHeld = months;

  // ---- India ---------------------------------------------------------------
  var sdvInr = num(p.stamp_duty_value);
  var fvcInr = (sdvInr > 1.1 * saleInr) ? sdvInr : saleInr;
  var costBasis = inherited ? "previous owner's cost" : "actual cost";
  var indiaCostInr = costInr;
  if (acqDate && acqDate < FMV_2001_DATE && num(p.pre_2001_fmv_inr) > indiaCostInr) { indiaCostInr = num(p.pre_2001_fmv_inr); costBasis = "fair market value on 1 Apr 2001"; }
  var improvementsInr = 0, improvementsUsd = 0, improvementsUsOk = true;
  (p.improvements || []).forEach(function (im) {
    var amt = num(im && im.improvement_cost_inr);
    if (!(amt > 0)) return;
    var d = im.improvement_date || acqDate;
    if (d && d < FMV_2001_DATE) return;            // before 1 Apr 2001: not counted in India
    improvementsInr += amt;
    var y = yearOf(d);
    if (!inTable(y) && y !== null && y <= 2025) improvementsUsOk = false;
    improvementsUsd += amt / inrPerUsd(y, ctx);
  });
  var expensesInr = num(p.transfer_expenses_inr);
  var kind = propKind(p);
  var notCapitalAsset = kind === "agri_rural";
  var term = months > 24 ? "LTCG" : "STCG";
  var gainInr = (fvcInr - expensesInr - indiaCostInr - improvementsInr) * share;
  var exemptKey = EXEMPTIONS[p.cg_exemption_section] || null;
  var exemptInr = 0;
  var investInr = num(p.cg_exempt_invest_amount) * share;
  var individualOrHuf = !entityType || entityType === "individual" || entityType === "huf";
  if (!notCapitalAsset && term === "LTCG" && gainInr > 0 && p.cg_exemption_section) {
    if (!exemptKey) row.review.push("the exemption chosen (" + p.cg_exemption_section + ") isn't worked out here");
    else if (!individualOrHuf) row.review.push("reinvestment exemptions are only for individuals and HUFs");
    else if (exemptKey === "s54" && kind !== "residential") row.review.push("s.54 applies only to a residential house sold; for other property it is s.54F");
    else if (exemptKey === "s54f" && kind === "residential") row.review.push("s.54F is for assets other than a residential house; for a house it is s.54");
    else if (exemptKey === "s54") exemptInr = Math.min(gainInr, Math.min(investInr, S54_CAP_INR));
    else if (exemptKey === "s54ec") exemptInr = Math.min(gainInr, Math.min(investInr, S54EC_CAP_INR));
    else if (exemptKey === "s54f") {
      var netConsInr = (fvcInr - expensesInr) * share;
      exemptInr = netConsInr > 0 ? Math.min(gainInr, gainInr * Math.min(investInr, S54_CAP_INR) / netConsInr) : 0;
    }
  }
  var taxableInr = notCapitalAsset ? 0 : gainInr - exemptInr;
  if (notCapitalAsset) row.notes.push("rural agricultural land is not a capital asset in India — no Indian capital gain");
  row.india = {
    saleInr: saleInr * share, stampDutyValueInr: sdvInr * share, fullValueInr: fvcInr * share, stampDutyRuleApplied: fvcInr !== saleInr,
    costInr: indiaCostInr * share, costBasis: costBasis, improvementsInr: improvementsInr * share, expensesInr: expensesInr * share,
    term: term, gainInr: notCapitalAsset ? 0 : gainInr, exemption: exemptKey ? EXEMPTION_LABEL[exemptKey] : (p.cg_exemption_section || null),
    exemptInr: exemptInr, taxableInr: taxableInr, notCapitalAsset: notCapitalAsset
  };

  // ---- US ------------------------------------------------------------------
  var usReason = null;
  if (inherited) usReason = "an inherited property's US basis is its value at the date of death (IRC §1014), which the form doesn't collect";
  else if (acqYear !== null && acqYear < 2001) usReason = "the purchase is before 2001, outside the exchange-rate table";
  else if (!improvementsUsOk) usReason = "an improvement is dated before 2001, outside the exchange-rate table";
  if (usReason) {
    // Estimate: India's gain (before Indian exemptions) at the sale-year
    // rate, so the sale isn't missing from the US return; flagged for review.
    row.us = null;
    row.usEstimate = { gainUsd: notCapitalAsset ? (fvcInr - expensesInr - indiaCostInr - improvementsInr) * share / inrPerUsd(saleYear, ctx) : gainInr / inrPerUsd(saleYear, ctx),
      term: (inherited || months > 12) ? "LTCG" : "STCG" };
    row.review.push("US gain not worked out: " + usReason + " — estimated from India's gain instead");
    return row;
  }
  var saleRate = inrPerUsd(saleYear, ctx), costRate = inrPerUsd(acqYear, ctx);
  var saleUsd = saleInr / saleRate;
  var costUsd = (costCur === "USD") ? num(costRaw) : costInr / costRate;
  var expensesUsd = expensesInr / saleRate;
  var gainUsd = (saleUsd - expensesUsd - costUsd - improvementsUsd) * share;
  row.us = {
    saleUsd: saleUsd * share, costUsd: costUsd * share, improvementsUsd: improvementsUsd * share, expensesUsd: expensesUsd * share,
    saleRate: saleRate, costRate: costRate, saleRateFromTable: inTable(saleYear), costRateFromTable: costCur === "USD" || inTable(acqYear),
    term: months > 12 ? "LTCG" : "STCG", gainUsd: gainUsd
  };
  return row;
}

// All sales for a client: rows, the India buckets (after exemptions), TDS,
// and the US-rules gains (sales whose US gain couldn't be worked out are
// listed in usMissing and left out of the US totals).
function propertySales(india, ctx) {
  var entityType = india && india.profile && india.profile.entity_type;
  var rows = soldProperties(india).map(function (p) { return computeSale(p, ctx, entityType); });
  var out = { rows: rows, ltcgInr: 0, stcgInr: 0, tdsInr: 0, usLtcgUsd: 0, usStcgUsd: 0, usMissing: 0 };
  rows.forEach(function (r) {
    out.tdsInr += r.tdsInr;
    if (r.india) { if (r.india.term === "LTCG") out.ltcgInr += r.india.taxableInr; else out.stcgInr += r.india.taxableInr; }
    var u = r.us || r.usEstimate;
    if (u) { if (u.term === "LTCG") out.usLtcgUsd += u.gainUsd; else out.usStcgUsd += u.gainUsd; }
    if (!r.us) out.usMissing += 1;
  });
  return out;
}

function usdFmt(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function inrFmt(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function rate2(r) { return (Math.round(r * 100) / 100).toFixed(2); }

// Findings for the sales above (one set per sale):
//  - india_property_sale (info): how India taxes it — gain, rate, exemption,
//    TDS, and the repatriation / indexation notes;
//  - india_property_gain_mismatch (warning): a US person's gain under US
//    rules differs from India's (exchange rates, stamp-duty value,
//    exemptions, holding period) — report the US figure, credit the Indian tax;
//  - india_property_sale_review (warning): something couldn't be worked out.
// opts: { residency: "NR"|"RNOR"|"ROR"|null, usWorldwide: bool, entityType }
function propertySaleFindings(ps, opts, ctx) {
  var out = [];
  if (!ps || !ps.rows || !ps.rows.length) return out;
  var resident = opts.residency === "ROR" || opts.residency === "RNOR";
  var individualOrHuf = !opts.entityType || opts.entityType === "individual" || opts.entityType === "huf";
  ps.rows.forEach(function (r, i) {
    var sfx = ps.rows.length > 1 ? "_" + (i + 1) : "";
    var ind = r.india, us = r.us;
    if (ind) {
      var rateTxt = ind.notCapitalAsset ? "no Indian capital gain (rural agricultural land isn't a capital asset)"
        : ind.term === "LTCG" ? "long-term (held " + Math.round(r.monthsHeld) + " months, over 24): 12.5% without indexation, plus surcharge (capped at 15%) and 4% cess"
        : "short-term (held " + Math.round(r.monthsHeld) + " months, 24 or less): taxed at the slab rates";
      var parts = ["Full value of consideration " + inrFmt(ind.fullValueInr) +
        (ind.stampDutyRuleApplied ? " (the stamp-duty value, which is more than 110% of the " + inrFmt(ind.saleInr) + " sale price)" : ""),
        "less cost " + inrFmt(ind.costInr) + " (" + ind.costBasis + ")"];
      if (ind.improvementsInr > 0) parts.push("improvements " + inrFmt(ind.improvementsInr));
      if (ind.expensesInr > 0) parts.push("transfer costs " + inrFmt(ind.expensesInr));
      var detail = parts.join(", ") + " = gain " + inrFmt(ind.gainInr) + (r.sharePct < 100 ? " (the client's " + Math.round(r.sharePct) + "% share)" : "") + ". " +
        "It is " + rateTxt + "." +
        (ind.exemptInr > 0 ? " " + ind.exemption + " exempts " + inrFmt(ind.exemptInr) + ", leaving " + inrFmt(ind.taxableInr) + " taxable." : "") +
        (r.tdsInr > 0 ? " The buyer deducted " + inrFmt(r.tdsInr) + " of TDS, credited against the Indian tax." : "");
      var rec = [];
      if (!resident) {
        rec.push("As a non-resident, the buyer must deduct TDS on the sale (s.195 of the 1961 Act); without a lower-deduction certificate it is usually taken on the whole price, so check Form 26AS / AIS and claim any excess back as a refund in the Indian return");
        rec.push("to move the money abroad, the bank needs Form 15CA (and a CA's Form 15CB); up to US$1 million a financial year can be remitted from an NRO account");
        if (r.tdsInr <= 0 && ind.taxableInr > 0) rec.push("no buyer TDS is recorded — confirm what the buyer deducted (Form 16A) before filing");
      } else if (ind.term === "LTCG" && individualOrHuf && r.acquisitionDate && r.acquisitionDate < "2024-07-23") {
        rec.push("as a resident individual / HUF holding property bought before 23 Jul 2024, compare 20% with indexation against 12.5% without and use the lower (not worked out here)");
      }
      if (ind.term === "LTCG" && ind.exemptInr === 0 && ind.taxableInr > 0 && !ind.notCapitalAsset) rec.push("the tax can be reduced by reinvesting the gain in another house or in 54EC bonds within the time limits");
      out.push({
        // A non-resident has TDS to reconcile / reclaim and the money to move
        // out of India: a warning, not just information.
        id: "india_property_sale" + sfx, severity: resident ? "info" : "warning", category: "credit",
        title: "Indian property sold — " + r.label + ": India " + (ind.term === "LTCG" ? "long-term" : "short-term") + " gain " + inrFmt(ind.taxableInr),
        detail: detail,
        recommendation: rec.length ? rec.join("; ") + "." : "Report the gain in the Indian return's capital-gains schedule.",
        amountUsd: Math.abs(ind.taxableInr) / inrPerUsd(yearOf(r.saleDate), ctx) + 0.01,
        refs: ["Capital gains on immovable property", "s.195 TDS", "Form 15CA / 15CB"]
      });
    }
    if (ind && us && opts.usWorldwide) {
      var indiaAsUsd = ind.taxableInr / us.saleRate;
      var diff = us.gainUsd - indiaAsUsd;
      if (Math.abs(diff) > Math.max(1000, 0.1 * Math.abs(us.gainUsd))) {
        var why = [];
        if (Math.abs(us.costRate - us.saleRate) > 0.5) why.push("the rupee moved from " + rate2(us.costRate) + " to " + rate2(us.saleRate) +
          " per dollar between purchase and sale, so the US cost in dollars is " + usdFmt(us.costUsd) + " while India's cost is in rupees");
        if (ind.stampDutyRuleApplied) why.push("India taxes the stamp-duty value, the US the actual price");
        if (ind.exemptInr > 0) why.push("the Indian exemption (" + ind.exemption + ") has no US equivalent");
        if (ind.notCapitalAsset) why.push("India doesn't tax rural agricultural land; the US does");
        if (ind.term !== us.term) why.push("India treats it as " + (ind.term === "LTCG" ? "long-term" : "short-term") + " (24-month rule), the US as " + (us.term === "LTCG" ? "long-term" : "short-term") + " (12 months)");
        out.push({
          id: "india_property_gain_mismatch" + sfx, severity: "warning", category: "treaty",
          title: "Same property sale, different gains: India " + inrFmt(ind.taxableInr) + " (≈ " + usdFmt(indiaAsUsd) + "), US " + usdFmt(us.gainUsd),
          detail: "The US taxes this sale too. Under US rules the proceeds are " + usdFmt(us.saleUsd) + " at " + rate2(us.saleRate) + " ₹/$ (" +
            (r.saleDate || "").slice(0, 4) + (us.saleRateFromTable ? "" : ", the latest published annual average — that year's isn't out yet") + ") and the cost " + usdFmt(us.costUsd) + (us.costRateFromTable ? "" : " (estimated rate)") +
            (us.improvementsUsd > 0 ? ", improvements " + usdFmt(us.improvementsUsd) : "") + (us.expensesUsd > 0 ? ", selling costs " + usdFmt(us.expensesUsd) : "") +
            ", a " + (us.term === "LTCG" ? "long-term" : "short-term") + " gain of " + usdFmt(us.gainUsd) + ". " +
            (why.length ? "It differs from India's because " + why.join("; ") + "." : ""),
          recommendation: "Report " + usdFmt(us.gainUsd) + " on Form 8949 / Schedule D (exchange rates: Federal Reserve annual averages — use the rate on each date if the client has it). " +
            "Claim the Indian tax on this gain as a foreign tax credit on Form 1116, capped at the US tax on it; the 3.8% net investment income tax can't be offset by it.",
          amountUsd: Math.abs(diff),
          refs: ["Form 8949", "Schedule D", "Form 1116", "DTAA Art. 13"]
        });
      }
    }
    if (r.review.length) {
      out.push({
        id: "india_property_sale_review" + sfx, severity: "warning", category: "document",
        title: "Indian property sale — " + r.label + ": part of it isn't worked out",
        detail: "For this sale " + r.review.join("; ") + ".",
        recommendation: "Work out the missing part by hand, or complete the Property screen so the engine can.",
        amountUsd: (ind ? Math.abs(ind.taxableInr) : num(r.tdsInr)) / fxRate(ctx) + 0.02,
        refs: ["Property screen"]
      });
    }
  });
  return out;
}

module.exports = { propertySales: propertySales, propertySaleFindings: propertySaleFindings, soldProperties: soldProperties, INR_PER_USD_ANNUAL: INR_PER_USD_ANNUAL, inrPerUsd: inrPerUsd };

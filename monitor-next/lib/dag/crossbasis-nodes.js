"use strict";
/* ============================================================================
 * Closes XBR-4: crossBasis (the "same income, both codes" reconciliation
 * table) — the last row in the XBR-2..6 cluster. Scoped 19 Jul 2026
 * (docs/DAG_MIGRATION_TRACKER.md, section C): needs two small raw leaves
 * (usOwns10PctForeignCorp/usForeignCorps), everything else already ported.
 *
 * A real, separate bug was found while reading crossBasis closely enough
 * to port it (not something the scoping pass caught): computation.js:1520
 * compared model.residency.india.taxRegime against lowercase "old", but
 * the field is always stored uppercase ("OLD"/"NEW") — the comparison was
 * always false, so the reconciliation table always used the NEW-regime
 * ₹75,000 standard deduction, even for an OLD-regime taxpayer. Fixed in
 * the engine same session (GAP_TRACKER.md IN-41) by normalizing case
 * first, matching how every OTHER read of this field in the engine
 * already does it. This DAG port never had the bug in the first place —
 * in1-nodes-v3.js's own taxRegime node (reused here) already normalizes
 * to uppercase — so no equivalent fix was needed here, just verification
 * against the now-corrected engine.
 *
 * Built on doubletax-nodes.js (a strict superset of xborder-full-nodes.js
 * — both countries' income, residency, plus XBR-3's indiaCapitalGainsInrXbr3
 * sum, reused here rather than redefined) rather than requiring
 * xborder-full-nodes.js directly.
 *
 * Verified in run-crossbasis.js: exact match against
 * computed.reconciliation.{rows,overlapUsd,feieAppliedUsd,anyEstimate}
 * for all 11 real profiles. This node pulls in usTaxResult (for
 * feieAppliedUsd), which transitively needs baseYearUs/usEntityKind —
 * real, already-documented open boundaries (TAX-10's own row), not
 * something this port introduces — so ctx.model carries {entity, meta}
 * only, same shape run-xborder-full.js already uses for the same reason.
 * Plus a synthetic OLD-regime case (IN-41) no real profile exercises.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function inrToUsd(inr) { return Number(inr) / 83.0; } // matches U.inrToUsd's own rate, engine-wide constant

var doubleTaxNodes = require("./doubletax-nodes.js").NODES;

var NODES = {};
Object.keys(doubleTaxNodes).forEach(function (k) { NODES[k] = doubleTaxNodes[k]; });

// ---- raw leaves: normalize.js L2552-2553 -----------------------------------
NODES.usOwns10PctForeignCorpRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_entities.owns_10_percent_foreign_corp", false) === true; } };
NODES.usForeignCorpsRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_entities.foreign_corporations", []) || []; } };
NODES.viaForeignCorpXbr4 = {
  deps: ["usOwns10PctForeignCorpRaw", "usForeignCorpsRaw"],
  compute: function (d) { return d.usOwns10PctForeignCorpRaw || d.usForeignCorpsRaw.length > 0; }
};

// ---- crossBasis, ported in full --------------------------------------------
NODES.crossBasisResult = {
  deps: ["usTaxResult", "residencyResult", "viaForeignCorpXbr4", "taxRegime",
    "salaryInr", "businessComputation", "housePropertyInr", "interestInr", "dividendInr", "indiaCapitalGainsInrXbr3",
    "aggregateUsIncomeResult"],
  compute: function (d) {
    function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
    var rows = [];
    var feieApplied = d.usTaxResult.feieAppliedUsd || 0;
    var usWW = d.residencyResult.us.worldwide, inWW = d.residencyResult.india.worldwide;
    var viaForeignCorp = d.viaForeignCorpXbr4;
    // Fixed same session as the port (IN-41): normalize case first, same as
    // every other read of taxRegime in the engine — this node's own
    // taxRegime dep (in1-nodes-v3.js) already normalizes to uppercase, so
    // the DAG never had the engine's lowercase-comparison bug to begin with.
    var stdDedInr = d.taxRegime === "OLD" ? 50000 : 75000;
    var stdDedUsd = stdDedInr / 83.0;
    var stdDedLabel = "₹" + stdDedInr.toLocaleString("en-IN");

    function row(o) {
      o.indiaLawUsd = Math.round(o.indiaLawUsd || 0); o.usLawUsd = Math.round(o.usLawUsd || 0);
      o.doublyTaxed = o.indiaLawUsd > 0 && o.usLawUsd > 0;
      o.overlapUsd = o.doublyTaxed ? Math.min(o.indiaLawUsd, o.usLawUsd) : 0;
      rows.push(o);
    }

    var salaryUsd = inrToUsd(d.salaryInr);
    var businessUsd = inrToUsd(d.businessComputation.businessInr);
    var housePropertyUsd = inrToUsd(d.housePropertyInr);
    var interestUsd = inrToUsd(d.interestInr);
    var dividendUsd = inrToUsd(d.dividendInr);
    var capitalGainsUsd = inrToUsd(d.indiaCapitalGainsInrXbr3);
    var us = d.aggregateUsIncomeResult;

    if (usWW) {
      if (salaryUsd > 0) {
        var grossWage = salaryUsd + stdDedUsd;
        row({ head: "salary", label: "Salary / Wages", dir: "IN→US", source: "India",
          indiaLawUsd: salaryUsd, usLawUsd: Math.max(0, grossWage - feieApplied),
          indiaRule: "Net of " + stdDedLabel + " std deduction · slab ≤ 30%",
          usRule: (feieApplied > 0 ? "Gross less FEIE " + usd(feieApplied) : "Gross wage; no std deduction") + " · brackets ≤ 37%" });
      }
      if (businessUsd > 0) {
        if (viaForeignCorp) {
          row({ head: "business", label: "Business / Professional", dir: "IN→US", source: "India",
            indiaLawUsd: businessUsd, usLawUsd: 0,
            indiaRule: "PGBP net · Indian depreciation",
            usRule: "Held via Indian company → not personal income; taxed via CFC/GILTI (Form 5471)",
            note: "See the Form 5471 finding." });
        } else {
          row({ head: "business", label: "Business / Professional", dir: "IN→US", source: "India",
            indiaLawUsd: businessUsd, usLawUsd: businessUsd, estimate: true,
            indiaRule: "PGBP net · Indian depreciation", usRule: "Schedule C net · US depreciation (MACRS)",
            note: "US net approximated at Indian net — diverges with US depreciation schedule." });
        }
      }
      if (housePropertyUsd > 0) {
        var nav = housePropertyUsd;
        row({ head: "rental", label: "House property / Rental", dir: "IN→US", source: "India",
          indiaLawUsd: nav * 0.70, usLawUsd: nav * 0.55, estimate: true,
          indiaRule: "NAV less 30% std deduction (s.24a)",
          usRule: "Gross less actual expenses + straight-line depreciation (27.5y)",
          note: "US net is planning-grade — refine with the property's depreciable basis." });
      }
      if (interestUsd > 0) row({ head: "interest", label: "Interest", dir: "IN→US", source: "India",
        indiaLawUsd: interestUsd, usLawUsd: interestUsd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Ordinary ≤ 37% (passive FTC basket)" });
      if (dividendUsd > 0) row({ head: "dividend", label: "Dividend", dir: "IN→US", source: "India",
        indiaLawUsd: dividendUsd, usLawUsd: dividendUsd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Qualified 15–20% if treaty + holding, else ordinary" });
      if (capitalGainsUsd > 0) row({ head: "capgains", label: "Capital gains", dir: "IN→US", source: "India",
        indiaLawUsd: capitalGainsUsd, usLawUsd: capitalGainsUsd, sameBase: true, estimate: true,
        indiaRule: "LTCG 12.5% / STCG slab · Indian holding periods",
        usRule: "LTCG 0/15/20% (>1y) / STCG ordinary · USD cost basis",
        note: "Same gain; the US recomputes on USD cost basis + acquisition-date FX (Rule 115)." });
    }

    if (inWW) {
      if (us.wages.usd > 0) row({ head: "us_salary", label: "US Salary / Wages", dir: "US→IN", source: "US",
        indiaLawUsd: Math.max(0, us.wages.usd - stdDedUsd), usLawUsd: us.wages.usd,
        indiaRule: "Less " + stdDedLabel + " std deduction · slab ≤ 30%", usRule: "Gross wage · brackets ≤ 37%" });
      if (us.rentalUs.usd > 0) row({ head: "us_rental", label: "US House property / Rental", dir: "US→IN", source: "US",
        indiaLawUsd: us.rentalUs.usd * 1.15, usLawUsd: us.rentalUs.usd, estimate: true,
        indiaRule: "NAV less 30% only — US depreciation added back", usRule: "Net after expenses + depreciation",
        note: "India disallows US depreciation and grants only the 30% deduction, so its base is higher." });
      if (us.interestUs.usd > 0) row({ head: "us_interest", label: "US Interest", dir: "US→IN", source: "US",
        indiaLawUsd: us.interestUs.usd, usLawUsd: us.interestUs.usd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Ordinary ≤ 37%" });
      if (us.ordinaryDividendsUs.usd > 0) row({ head: "us_dividend", label: "US Dividend", dir: "US→IN", source: "US",
        indiaLawUsd: us.ordinaryDividendsUs.usd, usLawUsd: us.ordinaryDividendsUs.usd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Qualified 15–20% / ordinary" });
      if (us.capitalGainsUs.usd > 0) row({ head: "us_capgains", label: "US Capital gains", dir: "US→IN", source: "US",
        indiaLawUsd: us.capitalGainsUs.usd, usLawUsd: us.capitalGainsUs.usd, sameBase: true, estimate: true,
        indiaRule: "STCG slab / LTCG per Indian buckets", usRule: "LTCG 0/15/20% / STCG ordinary" });
    }

    var overlapUsd = rows.reduce(function (s, r) { return s + r.overlapUsd; }, 0);
    var anyEstimate = rows.some(function (r) { return r.estimate; });
    return { rows: rows, overlapUsd: overlapUsd, feieAppliedUsd: feieApplied, anyEstimate: anyEstimate };
  }
};

module.exports = { NODES: NODES };

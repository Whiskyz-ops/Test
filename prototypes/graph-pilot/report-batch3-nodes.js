"use strict";
/* ============================================================================
 * CFL-7 batch 3: buildTaxComputation's `india` sub-object — the last of the
 * three sub-objects (`us`/`usState` closed in batch 2). Built on
 * india-tax-combined-nodes.js (TAX-1's individual/HUF slab path merged with
 * TAX-2's entity path via the same isEntityTaxpayer routing gate production
 * uses) rather than report-batch1/2-nodes.js — the india tax figures are
 * fully independent of documents/scopeNotes/ftcReport/us/usState, so
 * merging those chains in here would only add collision risk with no
 * benefit.
 *
 * Two additive extensions were needed first (in1-nodes-v3.js, committed
 * alongside this file): computeS115aStream/computeNrInterestTreatment
 * gained their real elections[] detail arrays (previously only {totalInr,
 * taxInr} / {totalInr, slabEligibleInr, carvedOutInr, carvedOutTaxInr} —
 * exactly the "known simplification" TAX-1's own tracker row already
 * flagged as blocking CFL-7's display layer), and computeLossSetOff gained
 * totalUsedInr/totalUnusedInr/used{}/unused{} (previously only returned the
 * post-set-off head buckets, not the set-off amounts themselves). Both are
 * zero-new-logic exposures of values already computed internally — verified
 * safe via run-in1-v3.js (8/8) and run-india-tax-combined.js (22/22)
 * immediately after.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function inrToUsd(v) { return Number(v) / 83.0; }
function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
function holdings(section, note) { return { kind: "holdings", section: section, note: note || null }; }

/* Ported verbatim, conflicts.js:1710-1746. */
function s115aParts(stream, fmt) {
  var parts = (stream.elections || []).map(function (e) {
    var artTxt = e.article ? " (" + e.article + ")" : "";
    var label;
    if (e.outcome === "denied_no_docs") {
      label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " denied — TRC/Form 41 missing, domestic " + Math.round(e.domesticRate * 100) + "% applies instead";
    } else if (e.outcome === "elected_rate_applied") {
      label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " @ " + Math.round(e.rateApplied * 100) + "% treaty rate (beats " + Math.round(e.domesticRate * 100) + "% domestic)";
    } else {
      label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " — domestic " + Math.round(e.domesticRate * 100) + "% still wins over the " + Math.round(e.electedRate * 100) + "% elected rate";
    }
    return { label: label, amount: e.taxInr };
  });
  if (stream.uncapturedInr > 1) {
    parts.push({ label: "No election covers " + fmt(stream.uncapturedInr) + " — taxed @ " + Math.round(stream.domesticRate * 100) + "% domestic default", amount: stream.uncapturedTaxInr });
  }
  return parts;
}
function nrInterestParts(nrInterest, fmt) {
  return (nrInterest.elections || []).filter(function (e) { return e.carvedOut; }).map(function (e) {
    var artTxt = e.article ? " (" + e.article + ")" : "";
    return {
      label: "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " @ " + Math.round(e.electedRate * 100) + "% treaty rate (beats the " + fmt(e.marginalSlabTaxInr) + " it would have cost at the marginal slab rate)",
      amount: e.treatyTaxInr
    };
  });
}

var indiaTaxCombinedNodes = require("./india-tax-combined-nodes.js").NODES;
var NODES = {};
Object.keys(indiaTaxCombinedNodes).forEach(function (k) { NODES[k] = indiaTaxCombinedNodes[k]; });

NODES.slabBreakdownV3 = {
  deps: ["totalNormalInr", "slabs"],
  compute: function (d) {
    var t = Math.max(0, d.totalNormalInr), prev = 0, rows = [];
    for (var i = 0; i < d.slabs.length; i++) {
      var cap = d.slabs[i][0], rate = d.slabs[i][1];
      if (t > prev) { var taxable = Math.min(t, cap) - prev; rows.push({ from: prev, to: cap, rate: rate, taxable: taxable, tax: taxable * rate }); prev = cap; } else break;
    }
    return rows;
  }
};

NODES.buildTaxComputationIndiaResult = {
  deps: [
    "isEntityTaxpayer", "entityTaxResult", "entityTaxableInrBoundary",
    "regimeCombined", "taxRegime", "totalNormalInr", "normalSlabInr", "lossSetOffV3", "cflBusinessInr",
    "cflHousePropertyInr", "cflStcgInr", "cflLtcgInr", "cflUnabsorbedDepreciationInr",
    "ltcgInrBoundary", "ltcgTaxableInr", "deductionsInrV3",
    "dedS80C", "dedS80CCD1B", "dedS80D", "dedS80CCD2Employer", "dedS80TTA_TTB",
    "totalIncomeInrV3", "slabTaxInr", "slabBreakdownV3", "specialTaxInrV3",
    "s115aDividend", "s115aRoyalty", "s115aFts", "isNRV3", "nrInterest",
    "ltcg197TaxableInr", "vdaGainInrBoundary", "vdaTaxInr", "specialRate115bbInr", "chapterXiiaInvestmentIncomeInrBoundary",
    "rebateInrV3", "surchargeInrV3", "cessInrV3", "totalTaxInrV3"
  ],
  compute: function (d) {
    var isEntity = d.isEntityTaxpayer;
    var i = isEntity ? {
      isEntity: true,
      regime: d.entityTaxResult.regime,
      grossTotalIncomeInr: d.entityTaxableInrBoundary,
      deductionsInr: 0,
      totalIncomeInr: d.entityTaxableInrBoundary,
      slabTaxInr: d.entityTaxResult.slabTaxInr,
      specialTaxInr: 0,
      rebateInr: 0,
      surchargeInr: d.entityTaxResult.surchargeInr,
      cessInr: d.entityTaxResult.cessInr,
      totalTaxInr: d.entityTaxResult.totalTaxInr,
      totalTaxUsd: inrToUsd(d.entityTaxResult.totalTaxInr),
      effectiveRate: d.entityTaxableInrBoundary > 0 ? d.entityTaxResult.totalTaxInr / d.entityTaxableInrBoundary : 0
    } : {
      isEntity: false,
      regime: d.regimeCombined,
      // Mirrors the engine's own formula exactly: normalSlabInr (BEFORE
      // Chapter VI-A deductions) plus every special-rate bucket — NOT
      // totalIncomeInrV3, which uses the post-deduction totalNormalInr
      // instead. Same one-term-swapped relationship XBR-6 already used for
      // grossTotalIncomeInrV3.
      grossTotalIncomeInr: d.normalSlabInr + d.lossSetOffV3.stcgInr + d.ltcgTaxableInr + d.ltcg197TaxableInr +
        d.specialRate115bbInr + d.vdaGainInrBoundary + d.chapterXiiaInvestmentIncomeInrBoundary +
        (d.nrInterest ? d.nrInterest.carvedOutInr : 0) +
        (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) + (d.s115aFts ? d.s115aFts.totalInr : 0),
      deductionsInr: d.deductionsInrV3,
      totalIncomeInr: d.totalIncomeInrV3,
      slabTaxInr: d.slabTaxInr,
      slabBreakdown: d.slabBreakdownV3,
      totalNormalInr: d.totalNormalInr,
      ltcgTaxableInr: d.ltcgTaxableInr,
      ltcg197TaxableInr: d.ltcg197TaxableInr,
      vdaGainInr: d.vdaGainInrBoundary,
      vdaTaxInr: d.vdaTaxInr,
      specialTaxInr: d.specialTaxInrV3,
      rebateInr: d.rebateInrV3,
      surchargeInr: d.surchargeInrV3,
      cessInr: d.cessInrV3,
      totalTaxInr: d.totalTaxInrV3,
      totalTaxUsd: inrToUsd(d.totalTaxInrV3),
      totalIncomeUsd: inrToUsd(d.totalIncomeInrV3),
      effectiveRate: d.totalIncomeInrV3 > 0 ? d.totalTaxInrV3 / d.totalIncomeInrV3 : 0,
      lossSetOff: d.lossSetOffV3,
      s115a: d.isNRV3 ? { dividend: d.s115aDividend, royalty: d.s115aRoyalty, fts: d.s115aFts } : null,
      nrInterest: d.nrInterest
    };

    var T = { DEDUCTION_CAPS_OLD: { s80C: 150000, s80CCD1B: 50000, s80D_self: 25000, s80D_parents_senior: 50000 } };
    var dedIndia = {
      s80C: d.dedS80C, s80CCD1B: d.dedS80CCD1B, s80D: d.dedS80D, s80CCD2_employer: d.dedS80CCD2Employer,
      s80TTA_TTB: d.dedS80TTA_TTB
    };
    var cfl = {
      businessLossAvailableInr: d.cflBusinessInr, housePropertyLossAvailableInr: d.cflHousePropertyInr,
      stcgLossAvailableInr: d.cflStcgInr, ltcgLossAvailableInr: d.cflLtcgInr,
      unabsorbedDepreciationCf: d.cflUnabsorbedDepreciationInr
    };

    var ltcgGrossInrForNote = d.ltcgInrBoundary || 0;
    var ltcgExemptGapInr = Math.max(0, ltcgGrossInrForNote - (i.ltcgTaxableInr || 0));
    var indiaHoldingsNote = ltcgExemptGapInr > 1
      ? ("Holdings shows gross LTCG before the s.198 exemption — ₹" + Math.round(ltcgExemptGapInr).toLocaleString("en-IN") + " of LTCG is exempt here, so this figure is that much lower.")
      : null;

    var lso = i.lossSetOff;
    var LOSS_ROW_DEFS = [
      { key: "businessInr", label: "  — brought-forward business loss set off (s.112)", availableKey: "businessLossAvailableInr", rule: "Set off only against business income (s.112)" },
      { key: "housePropertyInr", label: "  — brought-forward house-property loss set off (s.110)", availableKey: "housePropertyLossAvailableInr", rule: "Set off only against house-property income (s.110) — unlike current-year HP loss, brought-forward HP loss can't go inter-head" },
      { key: "stcgSlabInr", label: "  — brought-forward STCG loss set off vs current slab-rate STCG (s.111, s.69 unlisted buy-back)", availableKey: "stcgLossAvailableInr", rule: "STCG loss is set off against slab-rate STCG first — it's the more tax-expensive bucket to leave un-offset (s.111)" },
      { key: "stcgInr", label: "  — brought-forward STCG loss set off vs current STCG (s.111)", availableKey: "stcgLossAvailableInr", rule: "STCG loss is set off against current STCG first (s.111)" },
      { key: "ltcgFromStcgLossInr", label: "  — brought-forward STCG loss set off vs current LTCG (s.111)", availableKey: "stcgLossAvailableInr", rule: "Any STCG loss left after offsetting current STCG can still offset LTCG (s.111)" },
      { key: "ltcgInr", label: "  — brought-forward LTCG loss set off vs current LTCG (s.111)", availableKey: "ltcgLossAvailableInr", rule: "LTCG loss can only offset LTCG, never STCG (s.111)" },
      { key: "unabsorbedDepreciationInr", label: "  — unabsorbed depreciation set off (s.33(11))", availableKey: "unabsorbedDepreciationCf", rule: "No time limit; can offset any head except salary (s.33(11))" }
    ];
    var indiaGrossRows = (lso && lso.totalUsedInr > 1) ? [
      { label: "Current-year income (before brought-forward loss set-off)", inr: i.grossTotalIncomeInr + lso.totalUsedInr,
        trace: holdings("india", indiaHoldingsNote) }
    ].concat(LOSS_ROW_DEFS.filter(function (dd) { return lso.used[dd.key] > 1; }).map(function (dd) {
      return { label: dd.label, inr: -lso.used[dd.key],
        trace: calc(dd.rule + " — amount used is the lesser of the loss available and the current-year income in that bucket", [
          { label: "Brought-forward loss available", amount: cfl[dd.availableKey] || 0 },
          { label: "Amount actually set off this year", amount: lso.used[dd.key] }
        ]) };
    })).concat([
      { label: "Gross total income (after brought-forward loss set-off)", inr: i.grossTotalIncomeInr,
        trace: calc("Current-year income before set-off, less all brought-forward losses set off above", [
          { label: "Before set-off", amount: i.grossTotalIncomeInr + lso.totalUsedInr },
          { label: "Less: total losses set off", amount: -lso.totalUsedInr }
        ]) }
    ]) : [
      { label: "Gross total income", inr: i.grossTotalIncomeInr,
        trace: holdings("india", indiaHoldingsNote) }
    ];
    var indiaLossCarryRow = (lso && lso.totalUnusedInr > 1) ? [
      { label: "Losses carried forward to future years (could not be set off this year)", inr: lso.totalUnusedInr,
        trace: calc("Brought-forward losses left over after set-off — different loss categories can only offset specific income heads (s.112/110/111/33(11)), so a category with no matching income this year carries forward untouched (8 years for most heads, no limit for unabsorbed depreciation)", [
          { label: "Total unused this year", amount: lso.totalUnusedInr }
        ]) }
    ] : [];

    var dedTrace = i.regime === "NEW"
      ? calc("New regime allows only the employer's NPS contribution under s.124(2) — s.123/126/124(1B)/153 etc. are not available", [
          { label: "Employer NPS contribution (s.124(2))", amount: dedIndia.s80CCD2_employer || 0 }
        ])
      : calc("Old regime: s.123 (cap ₹1.5L) + s.124(1B) NPS (cap ₹50k) + s.126 health insurance (cap ₹75k) + employer NPS s.124(2) (uncapped) + s.153 savings interest (cap ₹10k)", [
          { label: "s.123 (capped ₹1.5L)", amount: Math.min(dedIndia.s80C || 0, T.DEDUCTION_CAPS_OLD.s80C) },
          { label: "s.124(1B) NPS (capped ₹50k)", amount: Math.min(dedIndia.s80CCD1B || 0, T.DEDUCTION_CAPS_OLD.s80CCD1B) },
          { label: "s.126 health insurance (capped ₹75k)", amount: Math.min(dedIndia.s80D || 0, T.DEDUCTION_CAPS_OLD.s80D_self + T.DEDUCTION_CAPS_OLD.s80D_parents_senior) },
          { label: "Employer NPS s.124(2)", amount: dedIndia.s80CCD2_employer || 0 },
          { label: "s.153 savings interest (capped ₹10k)", amount: Math.min(dedIndia.s80TTA_TTB || 0, 10000) }
        ]);

    var REBATE_87A_NEW = { maxRebate: 60000 }, REBATE_87A_OLD = { maxRebate: 12500 };
    var rebateCap = i.regime === "NEW" ? REBATE_87A_NEW.maxRebate : REBATE_87A_OLD.maxRebate;
    var s115aTraces = i.s115a ? ["dividend", "royalty", "fts"].filter(function (k) {
      return i.s115a[k] && i.s115a[k].totalInr > 1;
    }).map(function (k) {
      var s = i.s115a[k];
      return { label: "  — of which s.207 " + k + " @ " + Math.round(s.effectiveRate * 100) + "% effective", inr: s.taxInr,
        trace: calc("Total " + k + " income of " + inr(s.totalInr) + " under s.207 — each DTAA election (s.159) is taxed at whichever is LOWER of the domestic default or the elected treaty rate, and only when TRC/Form 41 are on file; anything not covered by a valid election falls back to the domestic default",
          s115aParts(s, inr)) };
    }) : [];
    var nrInterestTrace = (i.nrInterest && i.nrInterest.carvedOutInr > 1) ? [
      { label: "  — of which DTAA-carved-out interest (Art 11) taxed separately", inr: i.nrInterest.carvedOutTaxInr,
        trace: calc("Ordinary NRO interest is slab-rate income for a non-resident by default (s.207's concessional rate doesn't actually cover it — that's narrowly limited to foreign-currency-borrowing interest). A specific claimed amount can still be carved out and taxed at the flat treaty rate instead of slab rates, but only when TRC/Form 41 are on file AND it's actually cheaper than the marginal slab rate on that slice (s.159)",
          nrInterestParts(i.nrInterest, inr)) }
    ] : [];
    var ltcg197Trace = ((i.ltcg197TaxableInr || 0) > 1) ? [
      { label: "  — of which s.197 LTCG @ 12.5% (no exemption)", inr: (i.ltcg197TaxableInr || 0) * 0.125,
        trace: calc("Same 12.5% rate as s.198, but NO ₹1,25,000 exemption — that's textually specific to s.198's listed/STT-paid gains and doesn't pool with s.197, so this whole amount is taxable from the first rupee. Fed by: unlisted buy-back gains, foreign-equity gains (e.g. US stocks), unlisted bonds without STT, non-equity-oriented/non-specified mutual funds (debt MF acquired pre-Apr-2023, 35-65%-equity hybrid funds, international/FoF funds no longer meeting s.50AA's specified-fund test), and Chapter XII-A specified listed equity/debentures/government securities sold to a third party (s.115E's LTCG rate has no exemption either, unlike ordinary s.198) — all held >24 months, or >12 months for a listed bond, specified debenture/govt security, or specified listed equity", [
          { label: "s.197 LTCG (after loss set-off)", amount: i.ltcg197TaxableInr || 0 },
          { label: "Tax @ 12.5%, no exemption", amount: (i.ltcg197TaxableInr || 0) * 0.125 }
        ]) }
    ] : [];
    var vdaTrace = ((i.vdaGainInr || 0) > 1) ? [
      { label: "  — of which s.115BBH VDA/crypto @ 30% flat", inr: i.vdaTaxInr || 0,
        trace: calc("Virtual digital assets (crypto) are taxed at a flat 30% on positive gains only — no LTCG/STCG distinction, no holding-period threshold, no exemption or indexation, and crucially NO loss set-off is allowed at all, not even against a gain from a different VDA in the same year, and no carry-forward. Any losing VDA transaction is simply excluded, never netted against a gain", [
          { label: "VDA gains (losses excluded, never netted)", amount: i.vdaGainInr || 0 },
          { label: "Tax @ 30% flat", amount: i.vdaTaxInr || 0 }
        ]) }
    ] : [];

    var rows = indiaGrossRows.concat([
      { label: "Chapter VI-A deductions", inr: -i.deductionsInr, trace: dedTrace },
      { label: "Total income", inr: i.totalIncomeInr,
        trace: calc("Gross total income less Chapter VI-A deductions", [
          { label: "Gross total income", amount: i.grossTotalIncomeInr },
          { label: "Less Chapter VI-A deductions", amount: -i.deductionsInr }
        ]) },
      { label: "Tax at slab rates", inr: i.slabTaxInr,
        trace: calc("Progressive slab-rate tax under the " + i.regime + " regime, applied to ₹" + Math.round(i.totalNormalInr).toLocaleString("en-IN") + " of normal-rate income (salary, house property, business, other sources" + (i.nrInterest ? " — including ordinary NRO interest, which is slab-rate income by default; only a DTAA-beneficial slice is carved out separately below" : "") + ", after Chapter VI-A deductions and brought-forward loss set-off). Capital gains and other special-rate income are taxed separately, not at slab rates.",
          (i.slabBreakdown || []).map(function (b) {
            function pctLabel(rate) { return (parseFloat((rate * 100).toFixed(2))) + "%"; }
            var label = b.to === Infinity ? pctLabel(b.rate) + " above " + inr(b.from) : pctLabel(b.rate) + " on " + inr(b.from) + "–" + inr(b.to);
            return { label: label, amount: b.tax };
          })) },
      { label: "Tax on special-rate income (196/197/198 gains + 115BBH VDA + 128/194 winnings" + (i.s115a ? " + s.207 dividend/royalty/FTS" : "") + (i.nrInterest && i.nrInterest.carvedOutInr > 1 ? " + DTAA-carved-out interest" : "") + ")", inr: i.specialTaxInr,
        trace: calc("s.196 STCG @ 20% + s.198 LTCG @ 12.5% (listed/STT-paid, net of the ₹1,25,000 exemption) + s.197 LTCG @ 12.5% (unlisted/foreign — no exemption, separate section, does not pool with s.198's threshold) + s.115BBH VDA/crypto @ 30% flat (no set-off, ever) + s.128/194 lottery/betting/gaming winnings @ 30% flat, no exemption" + (i.s115a ? " + s.207 dividend/royalty/FTS at their own rates" : "") + (i.nrInterest && i.nrInterest.carvedOutInr > 1 ? " + any DTAA-carved-out interest at its treaty rate" : "") + " (each broken out below)", []) }
    ]).concat(nrInterestTrace).concat(ltcg197Trace).concat(vdaTrace).concat(s115aTraces).concat([
      { label: "Less §156 rebate", inr: -i.rebateInr,
        trace: calc("Only for a resident individual (not NR, not HUF/AOP/BOI/trust) whose normal-rate income is at or below the threshold — lesser of tax at slab rates and the statutory cap", [
          { label: "Statutory rebate cap", amount: rebateCap },
          { label: "Rebate actually allowed", amount: i.rebateInr }
        ]) },
      { label: "Surcharge", inr: i.surchargeInr,
        trace: calc("Progressive surcharge (10%/15%/25%/37% bands by total income) on tax before cess, with marginal relief so the tax increase never exceeds the income increase over the threshold; capital-gains/dividend-type special-rate income is capped at a 15% surcharge rate", [
          { label: "Surcharge", amount: i.surchargeInr }
        ]) },
      { label: "Health & education cess (4%)", inr: i.cessInr,
        trace: calc("4% of (tax after rebate + surcharge)", [
          { label: "Tax after §156 rebate", amount: i.slabTaxInr - i.rebateInr + i.specialTaxInr },
          { label: "Surcharge", amount: i.surchargeInr },
          { label: "Cess rate", display: "4%" }
        ]) },
      { label: "Total India tax", inr: i.totalTaxInr, emphasis: true,
        trace: calc("Tax at slab rates + tax on special-rate income − §156 rebate + surcharge + cess", [
          { label: "Tax at slab rates", amount: i.slabTaxInr },
          { label: "Tax on special-rate income", amount: i.specialTaxInr },
          { label: "Less §156 rebate", amount: -i.rebateInr },
          { label: "Surcharge", amount: i.surchargeInr },
          { label: "Cess", amount: i.cessInr }
        ]) }
    ]).concat(indiaLossCarryRow);

    return {
      title: i.isEntity ? ("India income tax — " + i.regime) : ("India income tax (" + i.regime + " regime)"),
      currency: "INR",
      rows: rows,
      totalUsd: i.totalTaxUsd,
      effectiveRate: i.effectiveRate
    };
  }
};

module.exports = { NODES: NODES };

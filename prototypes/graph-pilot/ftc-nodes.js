"use strict";
/* ============================================================================
 * Closes XBR-2: computeFtc (engine/computation.js L1319-1402) as a graph —
 * the §904-style Form 1116 limitation (US direction) and the India §159
 * relief (India direction), both ported line-for-line, including:
 *
 *   - §911(d)(6) no-double-dip: FEIE-excluded income leaves the FTC
 *     computation entirely, and the Indian tax allocable to it is
 *     proportionally disallowed (creditableFraction).
 *   - The NRA / no-US-scope zeroing (the historical XB-24 bug class this
 *     effort's very first pilot was built around): BOTH foreignSrcGrossUsd
 *     AND creditableFraction are forced to 0 — the engine's own comments
 *     record that zeroing only the first still leaked the bug through the
 *     `: 1` fallback, so the fallback's guard is ported as-is, not
 *     "simplified".
 *   - indiaResidual's Math.max(0, min(a,b) - reliefAllowed) — which is 0 by
 *     construction since reliefAllowed IS min(a,b). Ported verbatim anyway:
 *     this effort verifies by reference, it does not "improve" while
 *     porting (an improvement here would silently change the contract if
 *     reliefAllowed ever gains a haircut).
 *
 * EXPLICIT BOUNDARIES, same discipline as every prior phase: the boundary
 * leaf nodes below read the real engine's computed/model output, so this
 * file is verifiable standalone against ALL 11 profiles (including entity +
 * NRA, whose US-side tax the DAG deliberately doesn't compute — TAX-7/
 * TAX-8). xborder-full-nodes.js then redefines every one of them to
 * in-graph values, exactly how india-full/us-full closed their boundaries.
 *
 * DELIBERATE DAG/engine divergence (task #46, multi-country/multi-basket
 * FTC — docs/GAP_TRACKER.md section W): the frozen engine's computeFtc
 * treats the ENTIRE US<->India relationship as one undifferentiated number
 * per direction. Real §904(a) requires the credit to be limited separately
 * BY BASKET (passive vs. general/active — GILTI/NCTI is its own third
 * basket under §904(d)(1)(A), already de facto isolated since the §962-
 * elected path never reaches this file at all, see ustax-nodes.js's
 * gilti962TaxUsd), and a real US taxpayer can owe/pay foreign tax to MORE
 * than one country, all combined onto the same basket's Form 1116. Both
 * are built here:
 *   - BASKETS: India-source income is split into passive/general using
 *     aggregateindiaincome-nodes.js's own indiaIncomeModelResult.passive/
 *     .general (an EXACT partition of the same total already used —
 *     verified term-for-term, nothing dropped or double-counted). The
 *     India-direction (§159 relief) mirrors this using
 *     aggregateUsIncomeResult's own already-itemized US-source fields.
 *   - MULTI-COUNTRY: layer1_us.html's new "Other Foreign Tax Credits"
 *     section (foreign_tax_credit_other.entries[]: country/basket/
 *     foreign_source_income_usd/foreign_tax_paid_usd) plus the
 *     previously-dead foreign_wages[].foreign_tax_paid_usd (always
 *     general-category, wages are always active income under §904(d)) —
 *     both fold directly into the matching basket's aggregate, the same
 *     way Form 1116 itself combines every country within one basket onto
 *     a single limitation fraction (no per-country loop in the limitation
 *     math itself — that's not how real Form 1116 works either). This
 *     income is NOT separately added to the US tax base here — same as
 *     the pre-existing India-total-income boundary below, it's assumed
 *     already reflected in the ordinary income fields elsewhere (income
 *     the credit relates to must already be taxed on the return; Form 1116
 *     re-characterizes existing income, it doesn't add new income).
 *   - NOT built, named rather than guessed: the §901(j) sanctioned-country
 *     basket and the foreign branch category basket — no Layer 1 field
 *     distinguishes either, so both would be pure guesses; every other
 *     GAP_TRACKER follow-up item in this codebase draws the same line
 *     between "no data, honestly out of scope" and "no data, guessed
 *     anyway." Per-country Form 1116 ELECTIONS (rather than the default
 *     combined-per-basket treatment) are also out of scope for the same
 *     reason.
 * ==========================================================================*/
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
// Reused directly (not re-derived) so this file's own passive/general split
// is byte-identical to aggregateindiaincome-nodes.js's indiaIncomeModelResult
// -- and, critically, works standalone against run-ftc.js's real frozen-
// engine ctx too, since it reads only the base category fields
// model.income.india already carries on BOTH the DAG and the frozen engine
// (indiaIncomeModelResult is itself a verified port of the engine's own
// shape) -- no dependency on the DAG-only .passive/.general convenience
// fields indiaIncomeModelResult also now carries.
var indiaIncomeBasketSplit = require("./aggregateindiaincome-nodes.js").indiaIncomeBasketSplit;
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}

// Computes one §904 basket's US-direction (Form 1116) limitation, given
// that basket's gross foreign-source income/tax already aggregated across
// every country (India + any "other country" entries). Mirrors the
// original single-basket ftcUsDirection formula exactly, just called once
// per basket instead of once total.
function computeUsBasket(foreignSrcGrossUsd, feieExcludedUsd, foreignTaxPaidGrossUsd, usTaxableUsd, usIncomeTaxUsd, zeroed) {
  // Math.max(0, ...) on the gross-income figure is a NEW guard the original
  // single-total formula never needed (India's grand total income is never
  // negative in practice; an individual basket split of it — e.g. a house-
  // property loss — legitimately can be, even though the total isn't).
  var srcGrossUsd = zeroed ? 0 : Math.max(0, foreignSrcGrossUsd);
  var foreignSrcUsd = Math.max(0, srcGrossUsd - feieExcludedUsd);
  var creditableFraction = zeroed ? 0 : (srcGrossUsd > 0 ? foreignSrcUsd / srcGrossUsd : 1);
  // taxPaidGrossUsd is NOT force-zeroed here, matching the original
  // formula's own asymmetry exactly (indiaTaxPaidGrossUsd was never zeroed
  // directly either) -- only creditableFraction (already 0 above) zeroes
  // taxPaidUsd downstream; taxDisallowedUsd correctly stays the FULL gross
  // tax amount for a zeroed (NRA/no-US-scope) profile, not 0.
  var taxPaidGrossUsd = foreignTaxPaidGrossUsd;
  var taxPaidUsd = taxPaidGrossUsd * creditableFraction;
  var taxDisallowedUsd = taxPaidGrossUsd - taxPaidUsd;
  var limitFraction = usTaxableUsd > 0 ? Math.min(1, foreignSrcUsd / usTaxableUsd) : 0;
  var ftcLimit = usIncomeTaxUsd * limitFraction;
  var ftcAllowed = Math.min(taxPaidUsd, ftcLimit);
  var carryover = Math.max(0, taxPaidUsd - ftcAllowed);
  return {
    foreignSourceIncomeUsd: foreignSrcUsd, feieExcludedUsd: feieExcludedUsd,
    foreignTaxPaidGrossUsd: taxPaidGrossUsd, indiaTaxDisallowedUsd: taxDisallowedUsd,
    indiaTaxPaidUsd: taxPaidUsd, limitFraction: limitFraction, ftcLimitUsd: ftcLimit,
    ftcAllowedUsd: ftcAllowed, carryoverUsd: carryover, residualDoubleTaxUsd: carryover
  };
}

// Converts an India-side INR amount to USD using the EXACT implicit rate
// model.income.india.total already carries (total.usd / total.inr), rather
// than a fresh fx-util.js lookup -- guarantees passiveUsd + generalUsd ===
// indiaIncomeTotalUsdBoundaryFtc exactly, regardless of which FX source
// computed .total (the DAG's own fx-util.js, or the frozen engine's own
// rate when this runs standalone against run-ftc.js's real ctx).
function indiaInrToUsd(ctx, inrAmount) {
  var m = ctx.model.income.india;
  if (!m.total.inr) return 0;
  return inrAmount * (m.total.usd / m.total.inr);
}

function sumOtherCountries(entries, basket) {
  return (entries || []).reduce(function (acc, e) {
    if ((e.basket || "general") !== basket) return acc;
    acc.incomeUsd += num(e.foreign_source_income_usd);
    acc.taxPaidUsd += num(e.foreign_tax_paid_usd);
    return acc;
  }, { incomeUsd: 0, taxPaidUsd: 0 });
}

var NODES = {
  // ---- boundaries: the real engine's outputs, standalone-verifiable ------
  feieExcludedUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { var u = ctx.computed.usTax; return (u.feie && u.feie.appliedUsd) || 0; } },
  usIsNraBoundaryFtc: { deps: [], compute: function (d, ctx) { return !!ctx.computed.usTax.isNra; } },
  hasUsScopeBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.meta.hasUsScope !== false; } },
  // FTC Direction-1 gating fix (run-ftc-correctness.js): a taxpayer can cede
  // US worldwide taxation via TREATY POSITION ALONE (residency-nodes.js's
  // usCedes: treatyUsResidenceRaw === "india", with no 1040-NR filing at
  // all), in which case usIsNraBoundaryFtc stays false but computeUsTaxCore
  // has already excluded India-source income from the US taxable base
  // (every foreign-income term there is gated on the same worldwide flag).
  // Without this boundary, ftcUsDirection had no way to know that happened
  // and still treated the full India income as "foreign-source income
  // relative to a US base that contains it" — crediting Indian tax against
  // US tax that was never levied on that income at all.
  //
  // Reads computed.usTax.worldwide (the already entity/NRA-routing-aware
  // field every usTax result shape carries — computation.js:1057/1241/1280,
  // ustax-nodes.js:385, ustax-full-nodes.js:141/630/817), NOT
  // computed.residency.us.worldwide directly: that field is an INDIVIDUAL-
  // only concept (citizen/green-card/SPT tests), always false for a real
  // business entity — reading it here would have wrongly zeroed Direction-1
  // for every entity taxpayer (an entity's own usTax result already
  // declares worldwide:true, by the same "tax the whole M-1 figure, no
  // further split" assumption ustax-full-nodes.js's own header documents).
  usWorldwideBoundaryFtc: { deps: [], compute: function (d, ctx) { return !!ctx.computed.usTax.worldwide; } },
  indiaIncomeTotalUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.income.india.total.usd; } },
  // §904 basket split of India-source income (task #46) — derived via the
  // shared indiaIncomeBasketSplit() (see require() above), so
  // indiaPassiveIncomeUsdBoundaryFtc + indiaGeneralIncomeUsdBoundaryFtc ===
  // indiaIncomeTotalUsdBoundaryFtc above, always.
  indiaPassiveIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return indiaInrToUsd(ctx, indiaIncomeBasketSplit(ctx.model.income.india).passiveInr); } },
  indiaGeneralIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return indiaInrToUsd(ctx, indiaIncomeBasketSplit(ctx.model.income.india).generalInr); } },
  usTaxableIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.taxableIncomeUsd; } },
  usIncomeTaxUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.incomeTaxUsd; } },
  usTotalIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.totalIncomeUsd; } },
  usSourceIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.usSourceIncomeUsd; } },
  indiaTotalTaxUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.indiaTax.totalTaxUsd; } },
  indiaTotalIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.indiaTax.totalIncomeUsd; } },
  indiaWorldwideBoundaryFtc: { deps: [], compute: function (d, ctx) { return !!ctx.computed.residency.india.worldwide; } },
  usSourceTotalUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.income.us.usSourceTotal.usd; } },
  // §904 basket split of US-source income (India direction, task #46) —
  // reused for the India §159 relief calc's own basket separation. Passive:
  // interest/dividends/cap gains/rental. General: wages/business/
  // retirement/other-ordinary. Sums to usSourceTotalUsdBoundaryFtc exactly
  // (identical term list to aggregateUsIncomeResult's own usSourceTotal
  // formula).
  // safe()-guarded: otherOrdinaryIncomeUs is a DAG-only field (Step 15
  // Layer 1 US audit, no engine equivalent) -- absent entirely on the real
  // frozen engine's model.income.us, which run-ftc.js's standalone test
  // constructs ctx from directly.
  usPassiveIncomeUsdBoundaryFtc: {
    deps: [], compute: function (d, ctx) {
      var u = ctx.model.income.us;
      return num(safe(u, "interestUs.usd", 0)) + num(safe(u, "ordinaryDividendsUs.usd", 0)) + num(safe(u, "ltcgUs.usd", 0)) + num(safe(u, "stcgUs.usd", 0)) + num(safe(u, "rentalUs.usd", 0));
    }
  },
  usGeneralIncomeUsdBoundaryFtc: {
    deps: [], compute: function (d, ctx) {
      var u = ctx.model.income.us;
      return num(safe(u, "wages.usd", 0)) + num(safe(u, "businessUs.usd", 0)) + num(safe(u, "usRetirementIncome.usd", 0)) + num(safe(u, "otherOrdinaryIncomeUs.usd", 0));
    }
  },
  // Multi-country (task #46): the previously-dead foreign_wages[].foreign_
  // tax_paid_usd (always general-category — wages are always active income)
  // plus layer1_us.html's new "Other Foreign Tax Credits" section, entered
  // directly by country/basket since this engine only computes India's own
  // tax (no second country's tax law is modeled).
  foreignWagesTaxPaidUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.income.us.foreignWagesTaxPaidUsd || 0; } },
  otherCountryFtcEntriesRaw: { deps: [], compute: function (d, ctx) { return safe(ctx.us, "foreign_tax_credit_other.entries", []) || []; } },

  // ---- Direction 1: US Form 1116 — credit for Indian (+ other-country)
  // taxes, split by §904 basket -------------------------------------------
  ftcUsDirection: {
    deps: ["feieExcludedUsdBoundaryFtc", "usIsNraBoundaryFtc", "hasUsScopeBoundaryFtc", "usWorldwideBoundaryFtc",
      "indiaPassiveIncomeUsdBoundaryFtc", "indiaGeneralIncomeUsdBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc",
      "usTaxableIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc",
      "foreignWagesTaxPaidUsdBoundaryFtc", "otherCountryFtcEntriesRaw"],
    compute: function (d) {
      // usIsNraBoundaryFtc / !hasUsScopeBoundaryFtc: the pre-existing zeroing
      // conditions (XB-24). !usWorldwideBoundaryFtc: the fix above — ceded
      // worldwide taxation via treaty position alone also has to zero this,
      // not just an actual 1040-NR filing.
      var zeroed = d.usIsNraBoundaryFtc || !d.hasUsScopeBoundaryFtc || !d.usWorldwideBoundaryFtc;
      var feieExcludedUsd = d.feieExcludedUsdBoundaryFtc; // FEIE only ever excludes earned (general-category) income
      var usTaxableUsd = d.usTaxableIncomeUsdBoundaryFtc;
      var usIncomeTaxUsd = d.usIncomeTaxUsdBoundaryFtc;
      // Same denominator the ORIGINAL single-basket formula used as
      // foreignSrcGrossUsd (model.income.india.total.usd, NOT
      // computed.indiaTax.totalIncomeUsd -- a different node, used only by
      // ftcIndiaDirection below) -- indiaPassiveIncomeUsdBoundaryFtc +
      // indiaGeneralIncomeUsdBoundaryFtc === this exactly, by construction.
      var indiaIncomeTotalUsd = d.indiaIncomeTotalUsdBoundaryFtc;
      var indiaTotalTaxUsd = d.indiaTotalTaxUsdBoundaryFtc;
      // India's own tax allocated to each basket by relative income share —
      // the same proportional-allocation technique the original single-
      // basket formula already used for the FEIE creditableFraction split.
      var indiaTaxOnPassiveUsd = indiaIncomeTotalUsd > 0 ? indiaTotalTaxUsd * (d.indiaPassiveIncomeUsdBoundaryFtc / indiaIncomeTotalUsd) : 0;
      var indiaTaxOnGeneralUsd = indiaIncomeTotalUsd > 0 ? indiaTotalTaxUsd * (d.indiaGeneralIncomeUsdBoundaryFtc / indiaIncomeTotalUsd) : 0;

      var otherPassive = sumOtherCountries(d.otherCountryFtcEntriesRaw, "passive");
      var otherGeneral = sumOtherCountries(d.otherCountryFtcEntriesRaw, "general");

      var passiveSrcGrossUsd = d.indiaPassiveIncomeUsdBoundaryFtc + otherPassive.incomeUsd;
      var generalSrcGrossUsd = d.indiaGeneralIncomeUsdBoundaryFtc + otherGeneral.incomeUsd;
      var passiveTaxPaidGrossUsd = indiaTaxOnPassiveUsd + otherPassive.taxPaidUsd;
      var generalTaxPaidGrossUsd = indiaTaxOnGeneralUsd + otherGeneral.taxPaidUsd + d.foreignWagesTaxPaidUsdBoundaryFtc;

      var passive = computeUsBasket(passiveSrcGrossUsd, 0, passiveTaxPaidGrossUsd, usTaxableUsd, usIncomeTaxUsd, zeroed);
      var general = computeUsBasket(generalSrcGrossUsd, feieExcludedUsd, generalTaxPaidGrossUsd, usTaxableUsd, usIncomeTaxUsd, zeroed);

      return {
        // Combined totals — the REAL basket-separated result (not a re-run
        // of the old single-basket formula): a taxpayer whose passive
        // basket has excess credit can't use it against a general-basket
        // shortfall, so this combined carryover can be HIGHER than the old
        // undifferentiated calc would have shown for the same profile —
        // that's §904(a) working as intended, not a regression.
        foreignSourceIncomeUsd: passive.foreignSourceIncomeUsd + general.foreignSourceIncomeUsd,
        feieExcludedUsd: feieExcludedUsd,
        indiaTaxDisallowedUsd: passive.indiaTaxDisallowedUsd + general.indiaTaxDisallowedUsd,
        taxableIncomeUsd: usTaxableUsd,
        usIncomeTaxUsd: usIncomeTaxUsd,
        indiaTaxPaidUsd: passive.indiaTaxPaidUsd + general.indiaTaxPaidUsd,
        limitFraction: usTaxableUsd > 0 ? Math.min(1, (passive.foreignSourceIncomeUsd + general.foreignSourceIncomeUsd) / usTaxableUsd) : 0,
        ftcLimitUsd: passive.ftcLimitUsd + general.ftcLimitUsd,
        ftcAllowedUsd: passive.ftcAllowedUsd + general.ftcAllowedUsd,
        carryoverUsd: passive.carryoverUsd + general.carryoverUsd,
        residualDoubleTaxUsd: passive.carryoverUsd + general.carryoverUsd,
        baskets: { passive: passive, general: general },
        otherCountries: d.otherCountryFtcEntriesRaw
      };
    }
  },

  // ---- Direction 2: India §159 relief — credit for US taxes, split by
  // §904-equivalent basket (India relief doesn't itself have a statutory
  // basket concept — §90/91 grant relief per-country, not per-category —
  // but the same passive/general split is reused here so both directions
  // report symmetric detail) -------------------------------------------
  ftcIndiaDirection: {
    deps: ["indiaWorldwideBoundaryFtc", "usPassiveIncomeUsdBoundaryFtc", "usGeneralIncomeUsdBoundaryFtc", "usSourceTotalUsdBoundaryFtc",
      "indiaTotalIncomeUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc", "usTotalIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "usSourceIncomeUsdBoundaryFtc"],
    compute: function (d) {
      var worldwide = d.indiaWorldwideBoundaryFtc;
      var foreignSrcIndiaUsd = worldwide ? d.usSourceTotalUsdBoundaryFtc : 0;
      var passiveSrcUsd = worldwide ? d.usPassiveIncomeUsdBoundaryFtc : 0;
      var generalSrcUsd = worldwide ? d.usGeneralIncomeUsdBoundaryFtc : 0;
      var indiaTotalIncomeUsd = d.indiaTotalIncomeUsdBoundaryFtc;
      var indiaTotalTaxUsd = d.indiaTotalTaxUsdBoundaryFtc;
      var usTotalIncomeUsd = d.usTotalIncomeUsdBoundaryFtc;
      var usIncomeTaxUsd = d.usIncomeTaxUsdBoundaryFtc;

      function basket(srcUsd) {
        var indiaTaxOnForeignUsd = indiaTotalIncomeUsd > 0 ? indiaTotalTaxUsd * Math.min(1, srcUsd / indiaTotalIncomeUsd) : 0;
        var usTaxOnUsSourceUsd = usTotalIncomeUsd > 0 ? usIncomeTaxUsd * Math.min(1, srcUsd / usTotalIncomeUsd) : 0;
        var reliefAllowed = Math.min(usTaxOnUsSourceUsd, indiaTaxOnForeignUsd);
        return { foreignSourceIncomeUsd: srcUsd, usTaxOnUsSourceUsd: usTaxOnUsSourceUsd, reliefCapUsd: indiaTaxOnForeignUsd, reliefAllowedUsd: reliefAllowed };
      }

      var passive = basket(passiveSrcUsd);
      var general = basket(generalSrcUsd);
      // Combined figures kept as the ORIGINAL single formula (not a sum of
      // the two baskets') — unlike the US direction, India's §90/91 relief
      // is a single per-country credit with no statutory basket limitation
      // of its own, so the pre-existing combined math is still the correct
      // "real" answer; baskets here are additional detail, not a tightened
      // limitation the way §904(a) requires on the US side.
      var indiaTaxOnForeignUsd = indiaTotalIncomeUsd > 0 ? indiaTotalTaxUsd * Math.min(1, foreignSrcIndiaUsd / indiaTotalIncomeUsd) : 0;
      var usTaxOnUsSourceUsd = usTotalIncomeUsd > 0 ? usIncomeTaxUsd * Math.min(1, d.usSourceIncomeUsdBoundaryFtc / usTotalIncomeUsd) : 0;
      var indiaReliefAllowed = Math.min(usTaxOnUsSourceUsd, indiaTaxOnForeignUsd);
      return {
        foreignSourceIncomeUsd: foreignSrcIndiaUsd,
        usTaxOnUsSourceUsd: usTaxOnUsSourceUsd,
        reliefCapUsd: indiaTaxOnForeignUsd,
        reliefAllowedUsd: indiaReliefAllowed,
        baskets: { passive: passive, general: general }
      };
    }
  },

  ftcResult: {
    deps: ["ftcUsDirection", "ftcIndiaDirection"],
    compute: function (d) {
      var usResidual = d.ftcUsDirection.carryoverUsd;
      // Verbatim port — 0 by construction today (reliefAllowed IS the min);
      // kept because the engine keeps it, see header.
      var indiaResidual = Math.max(0, Math.min(d.ftcIndiaDirection.usTaxOnUsSourceUsd, d.ftcIndiaDirection.reliefCapUsd) - d.ftcIndiaDirection.reliefAllowedUsd);
      return {
        us: d.ftcUsDirection,
        india: d.ftcIndiaDirection,
        netUnrelievedDoubleTaxUsd: usResidual + indiaResidual
      };
    }
  }
};

module.exports = { NODES: NODES, num: num };

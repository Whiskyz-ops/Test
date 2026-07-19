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
 * EXPLICIT BOUNDARIES, same discipline as every prior phase: the ten
 * *_BoundaryFtc leaf nodes below read the real engine's computed/model
 * output, so this file is verifiable standalone against ALL 11 profiles
 * (including entity + NRA, whose US-side tax the DAG deliberately doesn't
 * compute — TAX-7/TAX-8). xborder-full-nodes.js then redefines every one
 * of them to in-graph values, exactly how india-full/us-full closed their
 * boundaries.
 * ==========================================================================*/
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

var NODES = {
  // ---- boundaries: the real engine's outputs, standalone-verifiable ------
  feieExcludedUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { var u = ctx.computed.usTax; return (u.feie && u.feie.appliedUsd) || 0; } },
  usIsNraBoundaryFtc: { deps: [], compute: function (d, ctx) { return !!ctx.computed.usTax.isNra; } },
  hasUsScopeBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.meta.hasUsScope !== false; } },
  indiaIncomeTotalUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.income.india.total.usd; } },
  usTaxableIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.taxableIncomeUsd; } },
  usIncomeTaxUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.incomeTaxUsd; } },
  usTotalIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.totalIncomeUsd; } },
  usSourceIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.usTax.usSourceIncomeUsd; } },
  indiaTotalTaxUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.indiaTax.totalTaxUsd; } },
  indiaTotalIncomeUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.computed.indiaTax.totalIncomeUsd; } },
  indiaWorldwideBoundaryFtc: { deps: [], compute: function (d, ctx) { return !!ctx.computed.residency.india.worldwide; } },
  usSourceTotalUsdBoundaryFtc: { deps: [], compute: function (d, ctx) { return ctx.model.income.us.usSourceTotal.usd; } },

  // ---- Direction 1: US Form 1116 — credit for Indian taxes ---------------
  ftcUsDirection: {
    deps: ["feieExcludedUsdBoundaryFtc", "usIsNraBoundaryFtc", "hasUsScopeBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc",
      "usTaxableIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc"],
    compute: function (d) {
      var feieExcludedUsd = d.feieExcludedUsdBoundaryFtc;
      var zeroed = d.usIsNraBoundaryFtc || !d.hasUsScopeBoundaryFtc;
      var foreignSrcGrossUsd = zeroed ? 0 : d.indiaIncomeTotalUsdBoundaryFtc;
      var foreignSrcUsd = Math.max(0, foreignSrcGrossUsd - feieExcludedUsd);
      var creditableFraction = zeroed ? 0 : (foreignSrcGrossUsd > 0 ? foreignSrcUsd / foreignSrcGrossUsd : 1);
      var usTaxableUsd = d.usTaxableIncomeUsdBoundaryFtc;
      var usIncomeTaxUsd = d.usIncomeTaxUsdBoundaryFtc;
      var indiaTaxPaidGrossUsd = d.indiaTotalTaxUsdBoundaryFtc;
      var indiaTaxPaidUsd = indiaTaxPaidGrossUsd * creditableFraction;
      var indiaTaxDisallowedUsd = indiaTaxPaidGrossUsd - indiaTaxPaidUsd;
      var usLimitFraction = usTaxableUsd > 0 ? Math.min(1, foreignSrcUsd / usTaxableUsd) : 0;
      var usFtcLimit = usIncomeTaxUsd * usLimitFraction;
      var usFtcAllowed = Math.min(indiaTaxPaidUsd, usFtcLimit);
      var usCarryover = Math.max(0, indiaTaxPaidUsd - usFtcAllowed);
      return {
        foreignSourceIncomeUsd: foreignSrcUsd,
        feieExcludedUsd: feieExcludedUsd,
        indiaTaxDisallowedUsd: indiaTaxDisallowedUsd,
        taxableIncomeUsd: usTaxableUsd,
        usIncomeTaxUsd: usIncomeTaxUsd,
        indiaTaxPaidUsd: indiaTaxPaidUsd,
        limitFraction: usLimitFraction,
        ftcLimitUsd: usFtcLimit,
        ftcAllowedUsd: usFtcAllowed,
        carryoverUsd: usCarryover,
        residualDoubleTaxUsd: usCarryover
      };
    }
  },

  // ---- Direction 2: India §159 relief — credit for US taxes --------------
  ftcIndiaDirection: {
    deps: ["indiaWorldwideBoundaryFtc", "usSourceTotalUsdBoundaryFtc", "indiaTotalIncomeUsdBoundaryFtc",
      "indiaTotalTaxUsdBoundaryFtc", "usTotalIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc", "usSourceIncomeUsdBoundaryFtc"],
    compute: function (d) {
      var foreignSrcIndiaUsd = d.indiaWorldwideBoundaryFtc ? d.usSourceTotalUsdBoundaryFtc : 0;
      var indiaTotalIncomeUsd = d.indiaTotalIncomeUsdBoundaryFtc;
      var indiaTaxOnForeignUsd = indiaTotalIncomeUsd > 0
        ? d.indiaTotalTaxUsdBoundaryFtc * Math.min(1, foreignSrcIndiaUsd / indiaTotalIncomeUsd)
        : 0;
      var usTaxOnUsSourceUsd = d.usTotalIncomeUsdBoundaryFtc > 0
        ? d.usIncomeTaxUsdBoundaryFtc * Math.min(1, d.usSourceIncomeUsdBoundaryFtc / d.usTotalIncomeUsdBoundaryFtc)
        : 0;
      var indiaReliefAllowed = Math.min(usTaxOnUsSourceUsd, indiaTaxOnForeignUsd);
      return {
        foreignSourceIncomeUsd: foreignSrcIndiaUsd,
        usTaxOnUsSourceUsd: usTaxOnUsSourceUsd,
        reliefCapUsd: indiaTaxOnForeignUsd,
        reliefAllowedUsd: indiaReliefAllowed
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

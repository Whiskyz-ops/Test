"use strict";
/* ============================================================================
 * The full cross-border graph: india-full-nodes.js + us-full-nodes.js +
 * ftc-nodes.js merged into ONE node set, with every one of ftc-nodes.js's
 * twelve *_BoundaryFtc leaves redefined to in-graph values. After this
 * file, the product's headline number — net unrelieved double tax across
 * both directions — is computed end-to-end from raw Layer 1 form data:
 *
 *   raw india/us/router JSON
 *     → India income aggregation → India tax (individual OR entity, routed)
 *     → US income aggregation → US federal tax
 *     → residency (worldwide flags, derived not read)
 *     → FTC both directions → netUnrelievedDoubleTaxUsd
 *
 * Collision policy: same guard as every prior merge — any unexpected
 * duplicate node id throws at require() time. The only intentional
 * overrides are the FTC boundary ids, listed explicitly.
 *
 * Remaining ctx dependencies after this file (each already tracked):
 *   ctx.model.entity (usEntityKind — AGG-10), ctx.model.meta.baseYear
 *   (baseYearUs — AGG-10). ctx.computed: NONE. ctx.model.income: NONE.
 *
 * FX note: the 83.0 INR/USD literal matches engine/constants.js
 * (CONST.FX.INR_PER_USD) and the same literal already used by
 * aggregateindiaincome-nodes.js's own inrToUsd — covered by audit:dag's
 * numeric-drift check like every other hand-copied constant.
 * ==========================================================================*/
var indiaFullNodes = require("./india-full-nodes.js").NODES;
var usFullNodes = require("./us-full-nodes.js").NODES;
var ftcNodes = require("./ftc-nodes.js").NODES;

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
var INR_PER_USD = require("../engine/constants.js").CONST.FX.INR_PER_USD; // SYS-1: shared

var OVERRIDDEN_BOUNDARY_IDS = [
  "feieExcludedUsdBoundaryFtc", "usIsNraBoundaryFtc", "hasUsScopeBoundaryFtc",
  "indiaIncomeTotalUsdBoundaryFtc", "usTaxableIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc",
  "usTotalIncomeUsdBoundaryFtc", "usSourceIncomeUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc",
  "indiaTotalIncomeUsdBoundaryFtc", "indiaWorldwideBoundaryFtc", "usSourceTotalUsdBoundaryFtc"
];

var NODES = {};
[indiaFullNodes, usFullNodes, ftcNodes].forEach(function (src) {
  Object.keys(src).forEach(function (k) {
    if (NODES[k] && OVERRIDDEN_BOUNDARY_IDS.indexOf(k) === -1) {
      throw new Error("Unexpected node name collision on merge: '" + k + "' — resolve before combining.");
    }
    NODES[k] = src[k];
  });
});

// ---- scope leaves (mirror normalize()'s scopeHasUs, L2177-2182 — the same
// derivation us1-nodes.js already carries, re-declared here because neither
// india-full nor us-full includes us1-nodes) ------------------------------
NODES.routerJurisdictionXB = { deps: [], compute: function (d, ctx) { return safe(ctx.router, "jurisdiction", null); } };
NODES.routerUsSignalXB = {
  deps: [],
  compute: function (d, ctx) {
    return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true ||
      safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
  }
};

// ---- redefine every FTC boundary to its in-graph source ------------------
NODES.hasUsScopeBoundaryFtc = {
  deps: ["routerJurisdictionXB", "routerUsSignalXB"],
  compute: function (d) { return d.routerJurisdictionXB === "single_india" ? false : d.routerJurisdictionXB === "single_us" ? true : d.routerUsSignalXB; }
};
NODES.feieExcludedUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.feieAppliedUsd || 0; } };
// The engine boundary reads computed.usTax.isNra — the isNra flag of
// whatever branch compute()'s routing SELECTED. Entity routing (ccorp/
// scorp/partnership/trust) precedes the NRA check, so an entity never carries
// isNra even when files1040nr happens to be set. Mirror that precedence with
// the same raw inputs the engine routes on (files 1040-NR without a §6013(h)
// election) PLUS the entity gate — deliberately NOT reading usTaxResult.isNra,
// because this same boundary is reused by the monitor/report chain
// (report-batch6) where usTaxResult resolves to the individual-only path
// (isNra always false, which would wrongly un-zero a real NRA's FTC and fire
// a phantom shortfall — the india_ror_us_income fixture). The raw form is
// correct in both chains: fuzz it202 (a C-corp with a mutated files1040nr
// was wrongly treated as NRA) and india_ror_us_income (a genuine NRA) both pass.
NODES.usIsNraBoundaryFtc = {
  deps: ["files1040nr", "s6013hElection", "usEntityKind"],
  compute: function (d) {
    var isUsEntity = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) >= 0;
    return !isUsEntity && d.files1040nr && !d.s6013hElection;
  }
};
NODES.indiaIncomeTotalUsdBoundaryFtc = { deps: ["totalIndiaIncomeInr"], compute: function (d) { return d.totalIndiaIncomeInr / INR_PER_USD; } };
NODES.usTaxableIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.taxableIncomeUsd; } };
NODES.usIncomeTaxUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.incomeTaxUsd; } };
NODES.usTotalIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.totalIncomeUsd; } };
NODES.usSourceIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.usSourceIncomeUsd; } };
NODES.indiaTotalTaxUsdBoundaryFtc = { deps: ["totalTaxInrCombined"], compute: function (d) { return d.totalTaxInrCombined / INR_PER_USD; } };
// Engine's indiaTax.totalIncomeUsd: individual path = inrToUsd(totalIncomeInr)
// (computation.js L517); entity path = inrToUsd(taxableInr) (L720). Routed
// on the same isEntityTaxpayer gate india-full already resolves.
NODES.indiaTotalIncomeUsdBoundaryFtc = {
  deps: ["isEntityTaxpayer", "totalIncomeInrV3", "entityTaxableInrBoundary"],
  compute: function (d) { return (d.isEntityTaxpayer ? d.entityTaxableInrBoundary : d.totalIncomeInrV3) / INR_PER_USD; }
};
NODES.indiaWorldwideBoundaryFtc = { deps: ["residencyResult"], compute: function (d) { return !!d.residencyResult.india.worldwide; } };
NODES.usSourceTotalUsdBoundaryFtc = { deps: ["aggregateUsIncomeResult"], compute: function (d) { return d.aggregateUsIncomeResult.usSourceTotal.usd; } };

module.exports = { NODES: NODES };

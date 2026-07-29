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
 * FX note: fxRate(ctx) (fx-util.js) defaults to 83.0 INR/USD, matching
 * engine/constants.js's CONST.FX.INR_PER_USD, and is overridable via
 * ctx.fxRateOverride (the what-if FX slider) — same source every other
 * INR<->USD conversion in the graph reads, so the default (no override)
 * behavior stays covered by audit:dag's numeric-drift check unchanged.
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
var fxRate = require("./fx-util.js").fxRate; // rate overridable via ctx.fxRateOverride — see fx-util.js

var OVERRIDDEN_BOUNDARY_IDS = [
  "feieExcludedUsdBoundaryFtc", "usIsNraBoundaryFtc", "hasUsScopeBoundaryFtc",
  "indiaIncomeTotalUsdBoundaryFtc", "usTaxableIncomeUsdBoundaryFtc", "usIncomeTaxUsdBoundaryFtc",
  "usTotalIncomeUsdBoundaryFtc", "usSourceIncomeUsdBoundaryFtc", "indiaTotalTaxUsdBoundaryFtc",
  "indiaTotalIncomeUsdBoundaryFtc", "indiaWorldwideBoundaryFtc", "usSourceTotalUsdBoundaryFtc",
  // task #46 (multi-country/multi-basket FTC) additions — ftc-nodes.js's own
  // versions read ctx.model.income.*, which this composition closes (see
  // file header: "ctx.model.income: NONE" after this file) -- redefined to
  // the real in-graph nodes below, same treatment as every boundary above.
  "indiaPassiveIncomeUsdBoundaryFtc", "indiaGeneralIncomeUsdBoundaryFtc",
  "usPassiveIncomeUsdBoundaryFtc", "usGeneralIncomeUsdBoundaryFtc", "foreignWagesTaxPaidUsdBoundaryFtc"
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
  // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
  // values (docs/DAG_MIGRATION_TRACKER.md — the router.html rebuild),
  // additive synonyms for "single_india"/"single_us" — the 12 demo profiles
  // and the fuzzer only ever produce the original strings, unaffected.
  compute: function (d) {
    return (d.routerJurisdictionXB === "single_india" || d.routerJurisdictionXB === "india_only") ? false :
      (d.routerJurisdictionXB === "single_us" || d.routerJurisdictionXB === "us_only") ? true : d.routerUsSignalXB;
  }
};
NODES.feieExcludedUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.feieAppliedUsd || 0; } };
// The engine's usTax.isNra is true ONLY when compute() actually routes to
// computeNraTax — which happens after the entity check, so a taxpayer that
// is BOTH a US entity kind AND carries a 1040-NR flag routes to the ENTITY
// (isNra false). The old `files1040nr && !s6013hElection` recompute ignored
// that entity-precedence and returned true, zeroing foreignSrcGross and
// disallowing the entire India FTC for such a profile (found by run-fuzz.js,
// SYS-3, 20 Jul 2026 — the "built before TAX-7/TAX-8, never revisited" root
// cause). Recompute the ENGINE'S EXACT ROUTING CONDITION from raw facts —
// not `usTaxResult.isNra`, because this boundary is also resolved in the
// isolated us-full/xborder chain where usTaxResult is the individual-only
// node (isNra undefined) and reading it there would wrongly treat a real NRA
// as non-NRA (caught by run-monitor.js's individual-chain assertion).
NODES.usIsNraBoundaryFtc = {
  deps: ["usEntityKind", "files1040nr", "s6013hElection"],
  compute: function (d) { return ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.files1040nr && !d.s6013hElection; }
};
NODES.indiaIncomeTotalUsdBoundaryFtc = { deps: ["totalIndiaIncomeInr"], compute: function (d, ctx) { return d.totalIndiaIncomeInr / fxRate(ctx); } };
NODES.usTaxableIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.taxableIncomeUsd; } };
NODES.usIncomeTaxUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.incomeTaxUsd; } };
NODES.usTotalIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.totalIncomeUsd; } };
NODES.usSourceIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.usSourceIncomeUsd; } };
NODES.indiaTotalTaxUsdBoundaryFtc = { deps: ["totalTaxInrCombined"], compute: function (d, ctx) { return d.totalTaxInrCombined / fxRate(ctx); } };
// Engine's indiaTax.totalIncomeUsd: individual path = inrToUsd(totalIncomeInr)
// (computation.js L517); entity path = inrToUsd(taxableInr) (L720). Routed
// on the same isEntityTaxpayer gate india-full already resolves.
NODES.indiaTotalIncomeUsdBoundaryFtc = {
  deps: ["isEntityTaxpayer", "totalIncomeInrV3", "entityTaxableInrBoundary"],
  compute: function (d, ctx) { return (d.isEntityTaxpayer ? d.entityTaxableInrBoundary : d.totalIncomeInrV3) / fxRate(ctx); }
};
NODES.indiaWorldwideBoundaryFtc = { deps: ["residencyResult"], compute: function (d) { return !!d.residencyResult.india.worldwide; } };
// §904 basket split (task #46) — in-graph version of ftc-nodes.js's own
// boundary, reading indiaIncomeModelResult (already in this composition via
// india-full-nodes.js) directly instead of ctx.model.income.india.
var indiaIncomeBasketSplit = require("./aggregateindiaincome-nodes.js").indiaIncomeBasketSplit;
NODES.indiaPassiveIncomeUsdBoundaryFtc = { deps: ["indiaIncomeModelResult"], compute: function (d, ctx) { return indiaIncomeBasketSplit(d.indiaIncomeModelResult).passiveInr / fxRate(ctx); } };
NODES.indiaGeneralIncomeUsdBoundaryFtc = { deps: ["indiaIncomeModelResult"], compute: function (d, ctx) { return indiaIncomeBasketSplit(d.indiaIncomeModelResult).generalInr / fxRate(ctx); } };
NODES.usPassiveIncomeUsdBoundaryFtc = {
  deps: ["aggregateUsIncomeResult"],
  compute: function (d) {
    var u = d.aggregateUsIncomeResult;
    return u.interestUs.usd + u.ordinaryDividendsUs.usd + u.ltcgUs.usd + u.stcgUs.usd + u.rentalUs.usd;
  }
};
NODES.usGeneralIncomeUsdBoundaryFtc = {
  deps: ["aggregateUsIncomeResult"],
  compute: function (d) {
    var u = d.aggregateUsIncomeResult;
    return u.wages.usd + u.businessUs.usd + u.usRetirementIncome.usd + u.otherOrdinaryIncomeUs.usd;
  }
};
NODES.foreignWagesTaxPaidUsdBoundaryFtc = { deps: ["aggregateUsIncomeResult"], compute: function (d) { return d.aggregateUsIncomeResult.foreignWagesTaxPaidUsd || 0; } };
// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H, 21 Jul
// 2026): was aggregateUsIncomeResult.usSourceTotal.usd directly — the
// individual-shaped aggregate, $0 for a US entity taxpayer, which zeroed
// out India's own s.90 FTC relief entirely for anyone with a US business
// entity. Redirected to usTaxResult.usSourceIncomeUsd — the SAME concept
// (how much of this taxpayer's US-side income is US-source), already fixed
// entity-aware at its one source (ustax-full-nodes.js's usEntityResult) —
// so this boundary and usSourceIncomeUsdBoundaryFtc (line 97 above) can't
// silently drift back out of sync with each other the way the two
// separately-sourced originals did.
NODES.usSourceTotalUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function (d) { return d.usTaxResult.usSourceIncomeUsd; } };

module.exports = { NODES: NODES };

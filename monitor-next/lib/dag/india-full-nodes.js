"use strict";
/* ============================================================================
 * Physically wires aggregateindiaincome-nodes.js (the income/capital-gains
 * boundary closer) INTO india-tax-combined-nodes.js's chain — the wiring
 * step both prior phases explicitly deferred ("still NOT wired into the
 * tax graph's chain").
 *
 * Three subgraphs merged (aggregateindiaincome-nodes.js, in1-nodes-v3.js,
 * entitytax-nodes.js) — checked for accidental name collisions first (none
 * found, by inspection: incomeNodes' output names like businessComputation/
 * capitalGainsComputation/otherSourcesMiscComputation/totalIndiaIncomeInr
 * don't overlap anything in the other two subgraphs).
 *
 * Then every EXPLICIT BOUNDARY node in in1-nodes-v3.js and entitytax-nodes.js
 * (businessInrBoundaryV3, stcgInrBoundary, ltcgInrBoundary, ltcg197InrBoundary,
 * stcgSlabInrBoundary, vdaGainInrBoundary, chapterXiiaInvestmentIncomeInrBoundary,
 * deemedDividendBuybackInrBoundary, promoterBuybackLtcgInrBoundary,
 * promoterBuybackStcgInrBoundary, otherSourcesMiscInrBoundary,
 * businessDepreciationInrBoundary, speculativeIncomeInrBoundaryV3,
 * entityTaxableInrBoundary) is DELIBERATELY REDEFINED here — same node ID,
 * new deps/compute — to read from the merged income subgraph's own output
 * nodes instead of ctx.model.income.india. This is an intentional override,
 * not a collision: every overridden ID is listed explicitly below so it's
 * auditable which boundary reads were actually closed.
 *
 * Net effect: after this file, in1-nodes-v3.js's and entitytax-nodes.js's
 * node definitions have ZERO remaining ctx.model/ctx.computed reads in the
 * chain this file exercises — raw router/india JSON goes in, the full
 * India tax total comes out, entirely inside the graph. (holdingPeriodMismatches
 * stays a side-output of capitalGainsComputation, not fed into the total —
 * unaffected by this wiring either way.)
 *
 * Verified in run-india-full.js against all 11 real profiles, exact parity
 * on computed.indiaTax.totalTaxInr (individual/HUF + entity paths both).
 * ==========================================================================*/
var incomeNodes = require("./aggregateindiaincome-nodes.js").NODES;
var v3Nodes = require("./in1-nodes-v3.js").NODES;
var entityNodes = require("./entitytax-nodes.js").NODES;

var OVERRIDDEN_BOUNDARY_IDS = [
  "businessInrBoundaryV3", "businessDepreciationInrBoundary", "speculativeIncomeInrBoundaryV3",
  "stcgInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "stcgSlabInrBoundary", "vdaGainInrBoundary",
  "chapterXiiaInvestmentIncomeInrBoundary", "deemedDividendBuybackInrBoundary",
  "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary", "otherSourcesMiscInrBoundary",
  "entityTaxableInrBoundary"
];

var NODES = {};
[incomeNodes, v3Nodes, entityNodes].forEach(function (src) {
  Object.keys(src).forEach(function (k) {
    if (NODES[k] && OVERRIDDEN_BOUNDARY_IDS.indexOf(k) === -1) {
      throw new Error("Unexpected node name collision on merge: '" + k + "' — resolve before combining.");
    }
    NODES[k] = src[k];
  });
});

// ---- redefine the boundary nodes to read from the merged income subgraph
// instead of ctx.model.income.india --------------------------------------
NODES.businessInrBoundaryV3 = { deps: ["businessComputation"], compute: function (d) { return d.businessComputation.businessInr; } };
NODES.businessDepreciationInrBoundary = { deps: ["businessComputation"], compute: function (d) { return d.businessComputation.businessDepreciationInr; } };
NODES.speculativeIncomeInrBoundaryV3 = { deps: ["speculativeIncomeInrAgg"], compute: function (d) { return d.speculativeIncomeInrAgg; } };
NODES.stcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.stcgInr; } };
NODES.ltcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.ltcgInr; } };
NODES.ltcg197InrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.ltcg197Inr; } };
NODES.stcgSlabInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.stcgSlabInr; } };
NODES.vdaGainInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.vdaGainInr; } };
NODES.chapterXiiaInvestmentIncomeInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.chapterXiiaInvestmentIncomeInr; } };
NODES.deemedDividendBuybackInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.deemedDividendInr; } };
NODES.promoterBuybackLtcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.promoterBuybackLtcgInr; } };
NODES.promoterBuybackStcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.promoterBuybackStcgInr; } };
NODES.otherSourcesMiscInrBoundary = { deps: ["otherSourcesMiscComputation"], compute: function (d) { return d.otherSourcesMiscComputation; } };
NODES.entityTaxableInrBoundary = { deps: ["totalIndiaIncomeInr"], compute: function (d) { return d.totalIndiaIncomeInr; } };

// ---- routing gate, identical to india-tax-combined-nodes.js -------------
NODES.isEntityTaxpayer = {
  deps: ["indiaIsCompany", "indiaIsFirm"],
  compute: function (d) { return d.indiaIsCompany || d.indiaIsFirm; }
};
NODES.totalTaxInrCombined = {
  deps: ["isEntityTaxpayer", "totalTaxInrV3", "totalTaxInrEntity"],
  compute: function (d) { return d.isEntityTaxpayer ? d.totalTaxInrEntity : d.totalTaxInrV3; }
};
NODES.regimeCombined = {
  deps: ["isEntityTaxpayer", "taxRegime", "entityTaxResult"],
  compute: function (d) { return d.isEntityTaxpayer ? d.entityTaxResult.regime : d.taxRegime; }
};

module.exports = { NODES: NODES };

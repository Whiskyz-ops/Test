"use strict";
/* ============================================================================
 * Wires the routing gate into ONE graph: merges in1-nodes-v3.js's
 * individual/HUF slab path and entitytax-nodes.js's company/firm path,
 * then adds the routing decision itself — the one piece that lived only
 * in computeIndiaTax's own `if` statement and wasn't part of either
 * subgraph. Mirrors it exactly:
 *
 *   if (model.entity && (model.entity.indiaIsCompany || model.entity.indiaIsFirm))
 *     return computeIndiaEntityTax(model, inc);
 *   ... individual/HUF slab computation ...
 *
 * No node names collided when merging (v3 suffixes ambiguous names with
 * "V3", entitytax uses plain names) — verified by inspection before
 * merging, not assumed. A caller now resolves ["totalTaxInrCombined",
 * "regimeCombined"] against ANY of the 11 real profiles and gets the
 * right answer without needing to know in advance which path applies —
 * the graph decides, same as production does.
 * ==========================================================================*/
var v3Nodes = require("./in1-nodes-v3.js").NODES;
var entityNodes = require("./entitytax-nodes.js").NODES;

var NODES = {};
Object.keys(v3Nodes).forEach(function (k) { NODES[k] = v3Nodes[k]; });
Object.keys(entityNodes).forEach(function (k) {
  if (NODES[k]) throw new Error("Node name collision on merge: '" + k + "' exists in both subgraphs — resolve before combining.");
  NODES[k] = entityNodes[k];
});

// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21 Jul
// 2026): widened to include AOP/BOI and Trust/NGO/Political Party — see
// entitytax-nodes.js's file header for the full writeup. The engine's own
// routing condition (`E.indiaIsCompany || E.indiaIsFirm`) never reaches
// computeIndiaEntityTax for either, silently taxing them as a plain
// individual.
NODES.isEntityTaxpayer = {
  deps: ["indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust"],
  compute: function (d) { return d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust; }
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

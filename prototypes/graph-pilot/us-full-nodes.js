"use strict";
/* ============================================================================
 * Physically wires aggregateusincome-nodes.js INTO ustax-nodes.js's chain —
 * the US mirror of india-full-nodes.js's wiring. The ONE boundary node in
 * ustax-nodes.js, incUs (ctx.model.income.us, aggregateUsIncome's entire
 * output), is redefined here to read aggregateUsIncomeResult instead —
 * field-for-field compatible by construction (both use the same {usd: X}
 * shape and the same field names, confirmed by inspection before wiring).
 *
 * Also wires in residency-nodes.js (XBR-1, closed separately): worldwideUs
 * originally read ctx.computed.residency.us.worldwide as a boundary — now
 * reads residencyResult.us.worldwide, a genuine derivation with zero
 * remaining ctx.computed dependency.
 *
 * Everything else ustax-nodes.js reads from ctx.model/ctx.computed
 * (usEntityKind from model.entity.usKind, baseYearUs from
 * model.meta.baseYear) is NOT part of aggregateUsIncome or resolveResidency
 * — entity classification is genuinely separate machinery, left as a real,
 * currently-unclosed boundary on purpose, not silently swept in here.
 *
 * Verified in run-us-full.js against the 9 individual/resident profiles
 * (same honest scope as ustax-nodes.js itself — entity/NRA profiles
 * reported, not asserted).
 * ==========================================================================*/
var incomeNodes = require("./aggregateusincome-nodes.js").NODES;
var taxNodes = require("./ustax-nodes.js").NODES;
var residencyNodes = require("./residency-nodes.js").NODES;

var OVERRIDDEN_BOUNDARY_IDS = ["incUs", "worldwideUs"];

var NODES = {};
[incomeNodes, taxNodes, residencyNodes].forEach(function (src) {
  Object.keys(src).forEach(function (k) {
    if (NODES[k] && OVERRIDDEN_BOUNDARY_IDS.indexOf(k) === -1) {
      throw new Error("Unexpected node name collision on merge: '" + k + "' — resolve before combining.");
    }
    NODES[k] = src[k];
  });
});

// ---- redefine the two boundaries to read the merged subgraphs -----------
NODES.incUs = { deps: ["aggregateUsIncomeResult"], compute: function (d) { return d.aggregateUsIncomeResult; } };
NODES.worldwideUs = { deps: ["residencyResult"], compute: function (d) { return d.residencyResult.us.worldwide; } };

module.exports = { NODES: NODES };

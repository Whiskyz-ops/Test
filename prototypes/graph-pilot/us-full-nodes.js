"use strict";
/* ============================================================================
 * Physically wires aggregateusincome-nodes.js INTO ustax-nodes.js's chain —
 * the US mirror of india-full-nodes.js's wiring. The ONE boundary node in
 * ustax-nodes.js, incUs (ctx.model.income.us, aggregateUsIncome's entire
 * output), is redefined here to read aggregateUsIncomeResult instead —
 * field-for-field compatible by construction (both use the same {usd: X}
 * shape and the same field names, confirmed by inspection before wiring).
 *
 * Everything else ustax-nodes.js reads from ctx.model/ctx.computed
 * (usEntityKind from model.entity.usKind, worldwideUs from
 * computed.residency.us.worldwide, baseYearUs from model.meta.baseYear) is
 * NOT part of aggregateUsIncome — those are entity classification and
 * residency determination, genuinely separate machinery not touched by
 * this wiring (see the "does residency belong in the DAG" question this
 * was raised alongside — those three stay real, currently-unclosed
 * boundaries on purpose, not silently swept in here).
 *
 * Verified in run-us-full.js against the 9 individual/resident profiles
 * (same honest scope as ustax-nodes.js itself — entity/NRA profiles
 * reported, not asserted).
 * ==========================================================================*/
var incomeNodes = require("./aggregateusincome-nodes.js").NODES;
var taxNodes = require("./ustax-nodes.js").NODES;

var NODES = {};
[incomeNodes, taxNodes].forEach(function (src) {
  Object.keys(src).forEach(function (k) {
    if (NODES[k] && k !== "incUs") throw new Error("Unexpected node name collision on merge: '" + k + "' — resolve before combining.");
    NODES[k] = src[k];
  });
});

// ---- redefine the one boundary to read the merged income subgraph -------
NODES.incUs = { deps: ["aggregateUsIncomeResult"], compute: function (d) { return d.aggregateUsIncomeResult; } };

module.exports = { NODES: NODES };

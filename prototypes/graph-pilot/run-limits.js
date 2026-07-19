"use strict";
/* ============================================================================
 * Verifies limits-nodes.js — computeLimits ported in full (LIM-1..6, all
 * six gauges) — against production computed.limits on all 11 real
 * profiles, by DEEP comparison: gauge order, every numeric field
 * (value/limit/pct), and every string (id/label/unit/note) byte-for-byte,
 * since the labels and notes render directly on the Monitor's gauge cards.
 *
 * ctx carries model as {entity, meta} ONLY (the AGG-10 boundaries) — no
 * income, no accounts, no limitsRaw, no feie block, no computed: every
 * gauge input must come from raw form data or in-graph nodes.
 *
 * Plus 2 synthetic cases for gauges no real profile currently exercises:
 * an NRO-repatriation amount (LIM-4) and a claimed-but-ineligible FEIE
 * (LIM-5's reasons-note branch), each checked against the real engine on
 * the same synthetic input — not hand-computed expectations.
 *
 * Run: node prototypes/graph-pilot/run-limits.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./limits-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function ok(label) { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok(label);
    return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok(label);
    var tol = (Math.abs(b) <= 1 && Math.abs(a) <= 1) ? 1e-6 : 2;
    if (Math.abs(a - b) <= tol) return ok(label);
    return bad(label, "graph=" + a + " prod=" + b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", "graph=" + a.length + " prod=" + b.length);
    for (var i = 0; i < a.length; i++) deepCheck(label + "[" + i + "]", a[i], b[i]);
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) { deepCheck(label + "." + k, a[k], b[k]); });
    return;
  }
  if (a === b) return ok(label);
  return bad(label, "graph=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
}

function runCase(id, router, india, us) {
  var r = WISING.analyze({ router: router, india: india, us: us });
  var ctx = { router: router, india: india, us: us, model: { entity: r.model.entity, meta: r.model.meta } };
  var out = graph.resolve(["limitsResult"], ctx).values.limitsResult;
  var before = fail;
  deepCheck("limits", out, r.computed.limits);
  console.log(id + "  " + (fail === before ? "all " + out.length + " gauge(s) match deep" : "FAILURES above") +
    "  [" + out.map(function (g) { return g.id + ":" + g.status; }).join(" ") + "]");
}

console.log("computeLimits (LIM-1..6) vs production — deep gauge comparison, all " + WISING.PROFILES.length + " real profiles + 2 synthetic\n");

WISING.PROFILES.forEach(function (p) { runCase(p.id, p.router, p.india, p.us); });

// ---- synthetic: NRO repatriation in flight (no real profile has one) ------
var base = WISING.PROFILES.filter(function (p) { return p.id === "dual_resident_h1b"; })[0];
var indiaNro = JSON.parse(JSON.stringify(base.india));
indiaNro.nro_repatriation = { cumulative_repatriated_usd_this_fy: 850000 };
runCase("synthetic_nro_850k (approaching)", base.router, indiaNro, base.us);

// ---- synthetic: FEIE claimed but ineligible (reasons-note branch) ---------
var usBadFeie = JSON.parse(JSON.stringify(base.us));
usBadFeie.foreign_earned_income = {
  claims_feie: true, feie_amount_claimed_usd: 60000, foreign_earned_income_usd: 60000,
  tax_home_country: "us", bona_fide_residence: false, physical_presence: false, days_in_us_during_test_period: 200
};
runCase("synthetic_feie_ineligible (note branch)", base.router, base.india, usBadFeie);

console.log("\n" + pass + " passed, " + fail + " failed (deep field-by-field incl. label/note strings)");
process.exit(fail > 0 ? 1 : 0);

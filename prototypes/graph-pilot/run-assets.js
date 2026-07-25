"use strict";
/* ============================================================================
 * Verifies assets-nodes.js's assetsModelResult against production's real
 * model.assets, with the same bare ctx = {router, india, us} discipline
 * run-agg10.js established — no model, no computed supplied.
 *
 * Run against SAMPLE (the actual Demo-mode default monitor-next's Holdings/
 * Business tabs render from out of the box) plus all 11 PROFILES — SAMPLE
 * is the exact fixture whose omission from the first browser pass hid a
 * real gap once before (docs/DAG_MIGRATION_TRACKER.md), so it's included
 * here from the start, not added after the fact.
 *
 * Run: node prototypes/graph-pilot/run-assets.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
var resolveEngineFile = require("../../scripts/engine-frozen.js").resolveEngineFile;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(resolveEngineFile(m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./assets-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function ok() { pass++; }
function bad(label, detail) { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok();
    return bad(label, "dag=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok();
    var tol = (Math.abs(b) <= 1 && Math.abs(a) <= 1) ? 1e-6 : 2;
    if (Math.abs(a - b) <= tol) return ok();
    return bad(label, "dag=" + a + " prod=" + b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", "dag=" + a.length + " prod=" + b.length);
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
  if (a === b) return ok();
  return bad(label, "dag=" + JSON.stringify(a) + " prod=" + JSON.stringify(b));
}

// entityGraph (Phase 5, docs/BUSINESS_ENTITY_ARCHITECTURE.md §6) is
// genuinely new — no engine equivalent, since this concept didn't exist
// before the DAG became the sole compute path. Stripped before the deepCheck
// parity comparison below (which walks the UNION of both sides' keys and
// would otherwise fail on "DAG has it, prod doesn't" for every profile);
// checked separately via checkEntityGraph's own structural assertions.
function checkEntityGraph(id, graphResult) {
  var entities = graphResult.entities, edges = graphResult.edges;
  if (!Array.isArray(entities) || !entities.length) { bad(id + " entityGraph.entities", "expected at least the root entity, got " + JSON.stringify(entities)); return; }
  // Root is either a single "root" or, when the taxpayer bundle genuinely
  // contains two distinct entities (a US parent + its differently-named
  // India subsidiary, e.g. us_ccorp_indian_sub), "root_in" + "root_us".
  if (["root", "root_in"].indexOf(entities[0].id) === -1) { bad(id + " entityGraph.entities[0].id", "expected 'root' or 'root_in', got " + entities[0].id); } else { ok(); }
  var ids = {};
  entities.forEach(function (e) {
    if (ids[e.id]) bad(id + " entityGraph duplicate entity id", e.id); else { ids[e.id] = true; ok(); }
  });
  (edges || []).forEach(function (e) {
    if (!ids[e.from]) bad(id + " entityGraph edge.from references unknown entity", JSON.stringify(e));
    else if (!ids[e.to]) bad(id + " entityGraph edge.to references unknown entity", JSON.stringify(e));
    else ok();
  });
}
function checkOne(id, r) {
  var bareCtx = { router: r._router, india: r._india, us: r._us };
  var out = graph.resolve(["assetsModelResult"], bareCtx).values.assetsModelResult;
  var entityGraph = out.entityGraph;
  var outForDeepCheck = Object.assign({}, out); delete outForDeepCheck.entityGraph;
  var before = fail;
  deepCheck(id + " assets", outForDeepCheck, r.model.assets);
  checkEntityGraph(id, entityGraph);
  console.log(id + (fail === before ? "  all match" : "  FAILURES above")
    + "  (" + r.model.assets.businessEntities.length + " business entit" + (r.model.assets.businessEntities.length === 1 ? "y" : "ies") +
    ", " + entityGraph.entities.length + " graph entit" + (entityGraph.entities.length === 1 ? "y" : "ies") + ", " + entityGraph.edges.length + " edge" + (entityGraph.edges.length === 1 ? "" : "s") + ")");
}

console.log("assets-nodes.js: model.assets — BARE ctx {router, india, us}, no model, no computed. SAMPLE + all " + WISING.PROFILES.length + " profiles.\n");

var S = WISING.SAMPLE;
var rSample = WISING.analyze({ router: S.router, india: S.india, us: S.us });
rSample._router = S.router; rSample._india = S.india; rSample._us = S.us;
checkOne("SAMPLE", rSample);

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  r._router = p.router; r._india = p.india; r._us = p.us;
  checkOne(p.id, r);
});

// ---------------------------------------------------------------------
// IN-6: s.44AD(4)/(5) presumptive re-election lock-in — hand-checked
// synthetic cases for the new presumptive_lockin_active_india finding and
// the form_3cb_3cd mandatory-audit extension (report-batch1-nodes.js).
// Not diffed against the frozen engine (neither exists there); no real
// profile carries s44AD_last_exit_ay, so this can't be caught by the
// SAMPLE/PROFILES loop above either. Same DAG-only-fix shape as the farm
// depreciation and s.44BB/BBB fixes this session (docs/DAG_MIGRATION_TRACKER.md §L).
// ---------------------------------------------------------------------
console.log("\nSynthetic s.44AD(4)/(5) presumptive lock-in cases (DAG-only fix, hand-checked)\n");
(function () {
  var now = new Date();
  var currentAyStart = now.getFullYear() - (now.getMonth() < 3 ? 1 : 0);

  function findingsFor(india) {
    var ctx = { router: {}, india: india, us: {} };
    return graph.resolve(["findingsAllResult"], ctx).values.findingsAllResult;
  }
  function documentsFor(india) {
    var ctx = { router: {}, india: india, us: {} };
    var docs = graph.resolve(["buildDocumentsResult"], ctx).values.buildDocumentsResult;
    var byId = {};
    docs.forEach(function (doc) { byId[doc.id] = doc.required; });
    return byId;
  }

  console.log("2 years into a 5-year lock-in, income above basic exemption -> mandatory audit");
  (function () {
    var exitYear = currentAyStart - 2;
    var india = {
      residency_detail: { final_india_residency_status: "ROR" },
      domestic_income: { business_income: {
        s44AD_last_exit_ay: "AY " + exitYear + "-" + String(exitYear + 1).slice(-2),
        business_entries: [{ turnover_inr: 500000 }]
      } }
    };
    var f = findingsFor(india).filter(function (x) { return x.id === "presumptive_lockin_active_india"; });
    if (f.length === 1 && f[0].severity === "critical") { pass++; } else { bad("finding fires as critical (mandatory audit)", JSON.stringify(f)); }
    var docs = documentsFor(india);
    if (docs.form_3cb_3cd === true) { pass++; } else { bad("form_3cb_3cd forced true by the lock-in, even though turnover (500000) is far below the audit threshold", "form_3cb_3cd=" + docs.form_3cb_3cd); }
  })();

  console.log("6 years since exit (lock-in expired) -> no finding, no forced audit");
  (function () {
    var exitYear = currentAyStart - 6;
    var india = {
      residency_detail: { final_india_residency_status: "ROR" },
      domestic_income: { business_income: {
        s44AD_last_exit_ay: "AY " + exitYear + "-" + String(exitYear + 1).slice(-2),
        business_entries: [{ turnover_inr: 500000 }]
      } }
    };
    var f = findingsFor(india).filter(function (x) { return x.id === "presumptive_lockin_active_india"; });
    if (f.length === 0) { pass++; } else { bad("no finding once the 5-year lock-in has expired", JSON.stringify(f)); }
    var docs = documentsFor(india);
    if (docs.form_3cb_3cd !== true) { pass++; } else { bad("form_3cb_3cd NOT forced once lock-in has expired", "form_3cb_3cd=" + docs.form_3cb_3cd); }
  })();

  console.log("2 years into lock-in, income BELOW basic exemption -> disclosed but no mandatory audit");
  (function () {
    var exitYear = currentAyStart - 2;
    var india = {
      residency_detail: { final_india_residency_status: "ROR" },
      domestic_income: { business_income: {
        s44AD_last_exit_ay: "AY " + exitYear + "-" + String(exitYear + 1).slice(-2),
        business_entries: [{ turnover_inr: 100000 }]
      } }
    };
    var f = findingsFor(india).filter(function (x) { return x.id === "presumptive_lockin_active_india"; });
    if (f.length === 1 && f[0].severity === "warning") { pass++; } else { bad("finding fires as warning (disclosure only, no audit trigger)", JSON.stringify(f)); }
    var docs = documentsFor(india);
    if (docs.form_3cb_3cd !== true) { pass++; } else { bad("form_3cb_3cd NOT forced when income is below the basic exemption limit", "form_3cb_3cd=" + docs.form_3cb_3cd); }
  })();

  console.log("no s44AD_last_exit_ay at all -> no finding");
  (function () {
    var india = { residency_detail: { final_india_residency_status: "ROR" }, domestic_income: { business_income: { business_entries: [] } } };
    var f = findingsFor(india).filter(function (x) { return x.id === "presumptive_lockin_active_india"; });
    if (f.length === 0) { pass++; } else { bad("no finding when s44AD_last_exit_ay was never entered", JSON.stringify(f)); }
  })();
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

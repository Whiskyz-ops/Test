"use strict";
/* ============================================================================
 * Verifies residency-nodes.js against all 11 real profiles — full parity,
 * no boundary. Every field of residencyResult checked directly against the
 * real computed.residency object.
 *
 * ctx deliberately carries ONLY { router, india, us } — no model/computed —
 * to prove this is a genuine derivation, not a disguised boundary read.
 *
 * Also verifies residencyConsistencyFindings, the NEW status-vs-day-count
 * finding this session added on top of the port (no engine/conflicts.js
 * counterpart — see the file header). Two passes: (1) all 11 real profiles
 * must produce ZERO findings (true-negative — the demo data is internally
 * consistent, and this also proves the entity-kind gates correctly exclude
 * the 3 company/HUF profiles whose raw data has no day-count field at all);
 * (2) hand-built synthetic cases, one per direction, prove the logic
 * actually fires when it should — real profiles have no inconsistencies to
 * exercise that path.
 *
 * Run: node prototypes/graph-pilot/run-residency.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join("/home/user/Test", "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var NODES = require("./residency-nodes.js").NODES;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}

console.log("Closing XBR-1 (resolveResidency), run against all " + WISING.PROFILES.length + " real profiles\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["residencyResult"], ctx).values.residencyResult;
  var real = r.computed.residency;

  console.log(p.id);
  console.log("    graph: india=" + out.india.status + "/worldwide=" + out.india.worldwide + " us=" + out.us.status + "/worldwide=" + out.us.worldwide +
    " dual=" + out.dualResident + " tieBreak=" + out.tieBreakWinner);

  check("india.status matches", out.india.status === real.india.status, "graph=" + out.india.status + " prod=" + real.india.status);
  check("india.isResident matches", out.india.isResident === real.india.isResident);
  check("india.worldwide matches", out.india.worldwide === real.india.worldwide);
  check("india.cedesViaTreaty matches", out.india.cedesViaTreaty === real.india.cedesViaTreaty);
  check("us.status matches", out.us.status === real.us.status, "graph=" + out.us.status + " prod=" + real.us.status);
  check("us.isResident matches", out.us.isResident === real.us.isResident);
  check("us.worldwide matches", out.us.worldwide === real.us.worldwide);
  check("us.isCitizen matches", out.us.isCitizen === real.us.isCitizen);
  check("us.cedesViaTreaty matches", out.us.cedesViaTreaty === real.us.cedesViaTreaty);
  check("dualResident matches", out.dualResident === real.dualResident);
  check("tieBreakWinner matches", out.tieBreakWinner === real.tieBreakWinner, "graph=" + out.tieBreakWinner + " prod=" + real.tieBreakWinner);
  check("worldwideOverlap matches", out.worldwideOverlap === real.worldwideOverlap);

  var findings = graph.resolve(["residencyConsistencyFindings"], ctx).values.residencyConsistencyFindings;
  check("residencyConsistencyFindings is empty (real demo data is internally consistent)", findings.length === 0,
    "got: " + findings.map(function (fi) { return fi.id; }).join(", "));
  console.log("");
});

console.log("--- residencyConsistencyFindings: synthetic cases (real data has no inconsistencies to exercise these) ---\n");

function syntheticCheck(label, india, us, expectIds) {
  var ctx = { router: {}, india: india, us: us };
  var findings = graph.resolve(["residencyConsistencyFindings"], ctx).values.residencyConsistencyFindings;
  var ids = findings.map(function (f) { return f.id; });
  var ok = ids.length === expectIds.length && expectIds.every(function (id) { return ids.indexOf(id) !== -1; });
  check(label, ok, "expected [" + expectIds.join(", ") + "], got [" + ids.join(", ") + "]");
}

// India understated: 200 days present but marked NR.
syntheticCheck("India: 200 days + NR fires residency_status_understated_india",
  { residency_detail: { days_in_india_current_year: 200, final_india_residency_status: "NR" }, profile: { entity_type: "individual" } },
  {}, ["residency_status_understated_india"]);

// India overstated: 0 days present but marked ROR.
syntheticCheck("India: 0 days + ROR fires residency_status_overstated_india",
  { residency_detail: { days_in_india_current_year: 0, final_india_residency_status: "ROR" }, profile: { entity_type: "individual" } },
  {}, ["residency_status_overstated_india"]);

// India: company entity type must NOT fire even with the same 0-day/ROR shape.
syntheticCheck("India: 0 days + ROR on a COMPANY does not fire (entity-kind gate)",
  { residency_detail: { final_india_residency_status: "ROR", is_indian_company: true }, profile: { entity_type: "company" } },
  {}, []);

// US understated: 200 days present but SPT marked not met.
syntheticCheck("US: 200 days + sptMet=false fires residency_status_understated_us",
  {}, { us_residency_detail: { us_days_current_year: 200, spt_test_met: false, is_us_citizen: false, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  ["residency_status_understated_us"]);

// US overstated: 10 days present but SPT marked met.
syntheticCheck("US: 10 days + sptMet=true fires residency_status_overstated_us",
  {}, { us_residency_detail: { us_days_current_year: 10, spt_test_met: true, is_us_citizen: false, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  ["residency_status_overstated_us"]);

// US: a citizen with the same 10-day/sptMet=true shape must NOT fire (sptMet is moot for citizens).
syntheticCheck("US: 10 days + sptMet=true on a CITIZEN does not fire (citizen gate)",
  {}, { us_residency_detail: { us_days_current_year: 10, spt_test_met: true, is_us_citizen: true, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  []);

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

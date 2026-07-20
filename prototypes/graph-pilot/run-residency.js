"use strict";
/* ============================================================================
 * Verifies residency-nodes.js.
 *
 * Part 1: residencyResult (XBR-1) against all 11 real profiles — full
 * parity, no boundary. ctx deliberately carries ONLY { router, india, us } —
 * no model/computed — to prove this is a genuine derivation.
 *
 * Part 2: deriveIndiaDomesticStatus / deriveCompanyPoem — the full
 * runResidencySolver() port — verified with a synthetic case for EVERY
 * branch (18 individual incl. the no-data default, 4 company status + 8
 * POEM sub-cases, 3 firm/LLP/AOP/trust, 4 HUF = 37 cases), each checked
 * against the exact path label in layer1_india.html. Real profiles are
 * NOT a valid ground truth here (see residency-nodes.js's file header: the
 * 11 fixtures were hand-authored with a chosen final status directly,
 * without the fuller fact set — p4y/emp/visit/nr9/d7729/inc15/ltac — the
 * real wizard needs, so comparing the derivation against them would fail
 * for reasons that are fixture incompleteness, not a bug in this port) —
 * run against all 11 and REPORTED, not asserted, same "reported, not
 * asserted" discipline used for the entity/NRA profiles elsewhere in this
 * effort.
 *
 * Part 3: residencyConsistencyFindings — the India mismatch/DTAA-conflation
 * findings (synthetic, since real profiles can't exercise a real mismatch
 * either, for the same reason as Part 2) plus the unchanged US findings
 * (still checked against all 11 real profiles for the true-negative pass,
 * since the US side's ground truth isn't affected by this rewrite).
 *
 * Run: node prototypes/graph-pilot/run-residency.js
 * ==========================================================================*/
var path = require("path");
global.window = global;
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data", "profiles"].forEach(function (m) {
  require(path.join(path.join(__dirname, "..", ".."), "engine", m + ".js"));
});
var WISING = global.WISING;
var createGraph = require("./graph.js").createGraph;
var residencyModule = require("./residency-nodes.js");
var NODES = residencyModule.NODES;
var deriveIndiaDomesticStatus = residencyModule.deriveIndiaDomesticStatus;
var deriveCompanyPoem = residencyModule.deriveCompanyPoem;
var graph = createGraph(NODES);

var pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("    ok - " + label); }
  else { fail++; console.log("    FAIL - " + label + (detail ? "  (" + detail + ")" : "")); }
}

console.log("=== Part 1: residencyResult (XBR-1) against all 11 real profiles ===\n");

WISING.PROFILES.forEach(function (p) {
  var r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["residencyResult"], ctx).values.residencyResult;
  var real = r.computed.residency;

  console.log(p.id);
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
});

console.log("\n=== Part 2: deriveIndiaDomesticStatus / deriveCompanyPoem — one synthetic case per branch ===\n");

function statusCheck(label, entity, facts, expected) {
  var got = deriveIndiaDomesticStatus(entity, facts);
  check(label, got === expected, "expected " + expected + ", got " + got);
}
function poemCheck(label, cr, expected) {
  var got = deriveCompanyPoem(cr);
  check(label, got === expected, "expected " + expected + ", got " + got);
}

console.log("-- individual (17 named paths + the no-data default) --");
statusCheck("ROR-1: days=200, nr9=false, d7729=false", "individual", { days: 200, nr9: false, d7729: false }, "ROR");
statusCheck("RNOR-1: days=200, nr9=true", "individual", { days: 200, nr9: true, d7729: false }, "RNOR");
statusCheck("RNOR-2: days=200, nr9=false, d7729=true", "individual", { days: 200, nr9: false, d7729: true }, "RNOR");
statusCheck("RNOR-3: days=100, p4y=true, emp=employment, inc15=true, ltac=false", "individual", { days: 100, p4y: true, emp: "employment", inc15: true, ltac: false }, "RNOR");
statusCheck("NR-7: days=100, p4y=true, emp=employment, inc15=false", "individual", { days: 100, p4y: true, emp: "employment", inc15: false }, "NR");
statusCheck("NR-8: days=100, p4y=true, emp=employment, inc15=true, ltac=true", "individual", { days: 100, p4y: true, emp: "employment", inc15: true, ltac: true }, "NR");
statusCheck("RNOR-4: days=150, p4y=true, visit=true, inc15=true", "individual", { days: 150, p4y: true, emp: "none", visit: true, inc15: true }, "RNOR");
statusCheck("NR-5: days=150, p4y=true, visit=true, inc15=false", "individual", { days: 150, p4y: true, emp: "none", visit: true, inc15: false }, "NR");
statusCheck("RNOR-6 (visitor): days=100, p4y=true, visit=true, inc15=true, ltac=false", "individual", { days: 100, p4y: true, emp: "none", visit: true, inc15: true, ltac: false }, "RNOR");
statusCheck("NR-10: days=100, p4y=true, visit=true, inc15=false", "individual", { days: 100, p4y: true, emp: "none", visit: true, inc15: false }, "NR");
statusCheck("ROR-2: days=100, p4y=true, visit=false, nr9=false, d7729=false", "individual", { days: 100, p4y: true, emp: "none", visit: false, nr9: false, d7729: false }, "ROR");
statusCheck("RNOR-5: days=100, p4y=true, visit=false, nr9=true", "individual", { days: 100, p4y: true, emp: "none", visit: false, nr9: true }, "RNOR");
statusCheck("RNOR-6 (non-visitor): days=100, p4y=true, visit=false, nr9=false, d7729=true", "individual", { days: 100, p4y: true, emp: "none", visit: false, nr9: false, d7729: true }, "RNOR");
statusCheck("RNOR-7: days=100, p4y=false, inc15=true, ltac=false", "individual", { days: 100, p4y: false, inc15: true, ltac: false }, "RNOR");
statusCheck("NR-6: days=100, p4y=false, inc15=false", "individual", { days: 100, p4y: false, inc15: false }, "NR");
statusCheck("RNOR-8: days=30, inc15=true, ltac=false", "individual", { days: 30, inc15: true, ltac: false }, "RNOR");
statusCheck("NR-9: days=30, inc15=false", "individual", { days: 30, inc15: false }, "NR");
statusCheck("default: days unanswered", "individual", {}, "NR");

console.log("-- company (4 status branches) --");
statusCheck("RES-1: is_indian_company=true", "company", { isIndianCompany: true }, "ROR");
statusCheck("RES-2: is_indian_company=false, POEM in India", "company", { isIndianCompany: false, company: { isActiveBusiness: true, boardMeetingsOutsideIndia: false } }, "ROR");
statusCheck("NR-1: is_indian_company=false, POEM outside India", "company", { isIndianCompany: false, company: {} }, "NR");
statusCheck("RES-1 default: is_indian_company unanswered", "company", {}, "ROR");

console.log("-- company POEM \"mock rule\" (deriveCompanyPoem directly) --");
poemCheck("active business, board outside=false -> true", { isActiveBusiness: true, boardMeetingsOutsideIndia: false }, true);
poemCheck("active business, board outside=true -> false", { isActiveBusiness: true, boardMeetingsOutsideIndia: true }, false);
poemCheck("not active, key mgmt=india -> true", { isActiveBusiness: false, keyManagementLocation: "india" }, true);
poemCheck("not active, key mgmt=outside_india -> false", { isActiveBusiness: false, keyManagementLocation: "outside_india" }, false);
poemCheck("not active, mixed, majority in India -> true", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 3, directorsOutsideIndia: 1 }, true);
poemCheck("not active, mixed, majority outside -> false", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 1, directorsOutsideIndia: 3 }, false);
poemCheck("not active, mixed, tied, delegated=false -> true", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 2, directorsOutsideIndia: 2, managementDelegatedOutsideIndia: false }, true);
poemCheck("not active, mixed, tied, delegated=true -> false", { isActiveBusiness: false, keyManagementLocation: "mixed", directorsInIndia: 2, directorsOutsideIndia: 2, managementDelegatedOutsideIndia: true }, false);
poemCheck("no facts at all -> false (default)", {}, false);

console.log("-- firm / LLP / AOP / trust (control-and-management only, no RNOR sub-status) --");
statusCheck("NR-2: wholly_outside=true (firm)", "firm", { whollyOutside: true }, "NR");
statusCheck("RES-3: wholly_outside=false (llp)", "llp", { whollyOutside: false }, "ROR");
statusCheck("RES-3 default: wholly_outside unanswered (aop)", "aop", {}, "ROR");

console.log("-- HUF (control-and-management, then karta's RNOR sub-status) --");
statusCheck("NR-3: wholly_outside=true", "huf", { whollyOutside: true }, "NR");
statusCheck("RNOR-HUF: wholly_outside=false, nr9=true", "huf", { whollyOutside: false, nr9: true }, "RNOR");
statusCheck("RNOR-HUF: wholly_outside=false, d7729=true", "huf", { whollyOutside: false, d7729: true }, "RNOR");
statusCheck("ROR-HUF: wholly_outside=false, nr9=false, d7729=false", "huf", { whollyOutside: false, nr9: false, d7729: false }, "ROR");

console.log("\n-- real profiles, REPORTED not asserted (see file header: fixtures don't carry the full fact set a real wizard run needs) --");
var derivedMatchCount = 0;
WISING.PROFILES.forEach(function (p) {
  var ctx = { router: p.router, india: p.india, us: p.us };
  var out = graph.resolve(["indiaDomesticStatusDerived", "indiaStatusRaw"], ctx).values;
  var matches = out.indiaDomesticStatusDerived === out.indiaStatusRaw;
  if (matches) derivedMatchCount++;
  console.log("    " + p.id + ": derived=" + out.indiaDomesticStatusDerived + " recorded=" + out.indiaStatusRaw + (matches ? "  (match)" : "  (fixture doesn't carry the full fact set)"));
});
console.log("    " + derivedMatchCount + "/" + WISING.PROFILES.length + " real profiles happen to match — informational only, not a pass/fail signal.");

console.log("\n=== Part 3: residencyConsistencyFindings ===\n");

function findingsCheck(label, india, us, expectIds) {
  var ctx = { router: {}, india: india, us: us };
  var findings = graph.resolve(["residencyConsistencyFindings"], ctx).values.residencyConsistencyFindings;
  var ids = findings.map(function (f) { return f.id; });
  var ok = ids.length === expectIds.length && expectIds.every(function (id) { return ids.indexOf(id) !== -1; });
  check(label, ok, "expected [" + expectIds.join(", ") + "], got [" + ids.join(", ") + "]");
}

console.log("-- India: generic mismatch (no treaty involved) --");
findingsCheck("individual: derived ROR, recorded NR, no treaty -> residency_status_mismatch_india",
  { residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" }, profile: { entity_type: "individual" } },
  {}, ["residency_status_mismatch_india"]);

findingsCheck("company: is_indian_company=true, recorded NR, no treaty -> residency_status_mismatch_india_company",
  { residency_detail: { is_indian_company: true, final_india_residency_status: "NR" }, profile: { entity_type: "company" } },
  {}, ["residency_status_mismatch_india_company"]);

findingsCheck("HUF: wholly_outside=false + nr9/d7729=false (ROR), recorded NR -> residency_status_mismatch_india_entity",
  { residency_detail: { is_wholly_outside_india: false, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" }, profile: { entity_type: "huf" } },
  {}, ["residency_status_mismatch_india_entity"]);

findingsCheck("individual: derived matches recorded -> no finding",
  { residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "ROR" }, profile: { entity_type: "individual" } },
  {}, []);

console.log("-- India: DTAA/domestic-status conflation (the resolved open question) --");
findingsCheck("individual: derived ROR (200 days) but recorded NR + dtaa_treaty_residence=us -> residency_status_dtaa_conflated_india, NOT a generic mismatch",
  {
    residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" },
    profile: { entity_type: "individual" },
    dtaa: { dtaa_treaty_residence: "us" }
  },
  {}, ["residency_status_dtaa_conflated_india"]);

findingsCheck("individual: derived ROR but recorded NR + dtaa_forced_nr=true -> residency_status_dtaa_conflated_india",
  {
    residency_detail: { days_in_india_current_year: 200, nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false, final_india_residency_status: "NR" },
    profile: { entity_type: "individual" },
    dtaa: { dtaa_forced_nr: true }
  },
  {}, ["residency_status_dtaa_conflated_india"]);

findingsCheck("company: derived ROR but recorded NR + dtaa_treaty_residence=us -> residency_status_dtaa_conflated_india (applies to every entity type)",
  {
    residency_detail: { is_indian_company: true, final_india_residency_status: "NR" },
    profile: { entity_type: "company" },
    dtaa: { dtaa_treaty_residence: "us" }
  },
  {}, ["residency_status_dtaa_conflated_india"]);

console.log("-- US (unchanged from the prior phase) --");
findingsCheck("US: 200 days + sptMet=false fires residency_status_understated_us",
  {}, { us_residency_detail: { us_days_current_year: 200, spt_test_met: false, is_us_citizen: false, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  ["residency_status_understated_us"]);
findingsCheck("US: 10 days + sptMet=true fires residency_status_overstated_us",
  {}, { us_residency_detail: { us_days_current_year: 10, spt_test_met: true, is_us_citizen: false, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  ["residency_status_overstated_us"]);
findingsCheck("US: 10 days + sptMet=true on a CITIZEN does not fire (citizen gate)",
  {}, { us_residency_detail: { us_days_current_year: 10, spt_test_met: true, is_us_citizen: true, has_green_card: false }, profile: { tax_entity_type: "individual" } },
  []);
findingsCheck("US entity: incorporated_in_us=true + FOREIGN_ENTITY fires residency_status_understated_us_entity",
  {}, { profile: { tax_entity_type: "ccorp", incorporated_in_us: true }, us_residency_detail: { final_us_residency_status: "FOREIGN_ENTITY" } },
  ["residency_status_understated_us_entity"]);
findingsCheck("US entity: incorporated_in_us=false + DOMESTIC_ENTITY fires residency_status_overstated_us_entity",
  {}, { profile: { tax_entity_type: "scorp", incorporated_in_us: false }, us_residency_detail: { final_us_residency_status: "DOMESTIC_ENTITY" } },
  ["residency_status_overstated_us_entity"]);
findingsCheck("US entity: incorporated_in_us=true + DOMESTIC_ENTITY does not fire (consistent)",
  {}, { profile: { tax_entity_type: "partnership", incorporated_in_us: true }, us_residency_detail: { final_us_residency_status: "DOMESTIC_ENTITY" } },
  []);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);

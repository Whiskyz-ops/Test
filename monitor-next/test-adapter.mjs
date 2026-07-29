globalThis.window = globalThis;
await import("./lib/engine/constants.js");
await import("./lib/engine/normalize.js");
await import("./lib/engine/computation.js");
await import("./lib/engine/monitoring.js");
await import("./lib/engine/conflicts.js");
await import("./lib/engine/sample-data.js");
await import("./lib/engine/profiles.js");
const WISING = globalThis.WISING;
const { analyzeDag, allClientSummariesDag } = await import("./lib/dag-adapter.js");
const { allClientSummaries } = await import("./lib/wising.js");

// DAG-only keys with no engine equivalent — same convention as
// shadow-core.js's DAG_ONLY_KEYS (kept in sync with it; this list had
// drifted behind shadow-core.js's — caveat/trustDistributedUsd/
// trustRetainedUsd/trustBracketBreakdown/entityGraph/qbiWagesUsd/
// qbiUbiaUsd were all already DAG-only structural fields with no engine
// equivalent, just never added here — discovered incidentally during the
// entity-filings-audit round, see docs/GAP_TRACKER.md). indiaIsAop/
// indiaIsTrust (docs/GAP_TRACKER.md section H.6, 21 Jul 2026): the engine's
// model.entity never carries these — entitytax-nodes.js's file header has
// the full writeup. foreignSection988GainLoss/otherOrdinaryIncomeUs: same
// "structural, engine has no concept of it, never cascades into a dollar
// difference" reasoning as run-fuzz.js's own KNOWN_ALWAYS_DIVERGENT_PATHS
// entry for these two fields — applied here via the key-name mechanism
// this file already uses instead of a path-based list.
const DAG_ONLY_KEYS = new Set([
  "caveat", "indiaIsAop", "indiaIsTrust", "trustDistributedUsd", "trustRetainedUsd",
  "trustBracketBreakdown", "entityGraph", "qbiWagesUsd", "qbiUbiaUsd",
  "foreignSection988GainLoss", "otherOrdinaryIncomeUs",
  // §25B Saver's Credit (task #44 follow-up) — added proactively (kept in
  // sync with shadow-core.js's own DAG_ONLY_KEYS).
  "saversCreditUsd", "saversCreditDetail"
]);

let fails = 0, checks = 0;
function ok() { checks++; }
function bad(label, a, b) { checks++; fails++; console.log("FAIL " + label + "  dag=" + JSON.stringify(a) + " real=" + JSON.stringify(b)); }
function deepCheck(label, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    if ((a === null || a === undefined) && (b === null || b === undefined)) return ok();
    return bad(label, a, b);
  }
  if (typeof a === "number" && typeof b === "number") {
    if (isNaN(a) && isNaN(b)) return ok();
    if (Math.abs(a - b) <= 2) return ok();
    return bad(label, a, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return bad(label + ".length", a.length, b.length);
    for (let i = 0; i < a.length; i++) deepCheck(label + "[" + i + "]", a[i], b[i]);
    return;
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach((k) => { if (!DAG_ONLY_KEYS.has(k)) deepCheck(label + "." + k, a[k], b[k]); });
    return;
  }
  if (a === b) return ok();
  return bad(label, a, b);
}

// Section D (docs/GAP_TRACKER.md, "entity-agnostic audit", 21 Jul 2026):
// same DELIBERATE DAG/engine divergence allowlist as run-fuzz.js's
// KNOWN_US_ENTITY_DIVERGENT_PATHS — see that file's header for the full
// root-cause writeup. Gated strictly on the profile's actual taxpayer
// shape, never on profile label.
function isUsEntity(r) { return ["ccorp", "scorp", "partnership", "trust"].indexOf(r.model.entity && r.model.entity.usKind) >= 0; }
function isIndiaEntity(r) { return !!(r.model.entity && (r.model.entity.indiaIsCompany || r.model.entity.indiaIsFirm)); }
function isNra(r) { return r.computed.usTax && r.computed.usTax.isNra === true; }

// Every field the exhaustive grep survey (lib/wising.js, lib/logic.js,
// components/*, app/*) actually reads off an analyze() result — not a
// full-object dump (which would flag hundreds of fields no consumer touches).
function checkResult(id, dag, real) {
  const before = fails;
  const usEntity = isUsEntity(real), indiaEntity = isIndiaEntity(real), nra = isNra(real);
  // form_nj1040 (docs/GAP_TRACKER.md section H.7, 21 Jul 2026) and form_8858
  // (section H.13, 22 Jul 2026): new DAG-only documents, no engine
  // equivalent for either — stripped from both the documents list and the
  // calendar's bundled docIds, same convention as run-fuzz.js's assembleDag().
  // summary.requiredDocs is a DAG-computed count baked in from the
  // UN-stripped documents list (report-batch5-nodes.js) — adjusted by the
  // same amount so this known, deliberate divergence doesn't rely on
  // deepCheck's +/-2 numeric tolerance to go unnoticed.
  const DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id", "schedule_m1_m2", "k1_issuance", "form_8880"];
  const droppedRequiredCount = dag.documents.filter((x) => DAG_ONLY_DOC_IDS.includes(x.id) && x.required).length;
  const dagDocs = dag.documents.filter((x) => !DAG_ONLY_DOC_IDS.includes(x.id));
  const dagSummary = droppedRequiredCount > 0 && dag.summary && typeof dag.summary.requiredDocs === "number"
    ? { ...dag.summary, requiredDocs: dag.summary.requiredDocs - droppedRequiredCount }
    : dag.summary;
  if (usEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) summary.totalIncomeUsd/healthScore, findings ids (underpayment_2210), computed.usTax.usSourceIncomeUsd/foreignSourceIncomeUsd, computed.headline.totalIncomeUsd, computed.apportionment, monitoring.health.score");
    deepCheck(id + " summary (minus totalIncomeUsd/healthScore)", { ...dagSummary, totalIncomeUsd: 0, healthScore: 0 }, { ...real.summary, totalIncomeUsd: 0, healthScore: 0 });
    const stripEntityOnlyIds = (id) => id !== "underpayment_2210" && id !== "us_entity_state_tax" && id !== "us_entity_state_tax_not_modeled";
    deepCheck(id + " findings ids (minus underpayment_2210/us_entity_state_tax)", dag.findings.map(f => f.id).filter(stripEntityOnlyIds), real.findings.map(f => f.id).filter(stripEntityOnlyIds));
  } else {
    deepCheck(id + " summary", dagSummary, real.summary);
    deepCheck(id + " findings ids", dag.findings.map(f => f.id), real.findings.map(f => f.id));
  }
  deepCheck(id + " model.entity", dag.model.entity, real.model.entity);
  deepCheck(id + " model.meta", dag.model.meta, real.model.meta);
  deepCheck(id + " model.treaty", dag.model.treaty, real.model.treaty);
  deepCheck(id + " model.residency.india.daysCurrentYear", dag.model.residency.india.daysCurrentYear, real.model.residency.india.daysCurrentYear);
  deepCheck(id + " model.residency.us.daysCurrentYear", dag.model.residency.us.daysCurrentYear, real.model.residency.us.daysCurrentYear);
  deepCheck(id + " model.income.india", dag.model.income.india, real.model.income.india);
  deepCheck(id + " model.income.us", dag.model.income.us, real.model.income.us);
  deepCheck(id + " model.accounts.accounts", dag.model.accounts.accounts, real.model.accounts.accounts);
  deepCheck(id + " model.assets", dag.model.assets, real.model.assets);
  deepCheck(id + " documents", dagDocs, real.documents);
  deepCheck(id + " returnForms", dag.returnForms, real.returnForms);
  deepCheck(id + " withholding", dag.withholding, real.withholding);
  const stripNj1040 = (row) => Array.isArray(row.docIds) ? { ...row, docIds: row.docIds.filter((x) => !DAG_ONLY_DOC_IDS.includes(x)) } : row;
  deepCheck(id + " monitoring.calendar.all", dag.monitoring.calendar.all.map(stripNj1040), real.monitoring.calendar.all);
  deepCheck(id + " monitoring.residency", dag.monitoring.residency, real.monitoring.residency);
  deepCheck(id + " monitoring.projections", dag.monitoring.projections, real.monitoring.projections);
  deepCheck(id + " computed.indiaTax.totalTaxUsd", dag.computed.indiaTax.totalTaxUsd, real.computed.indiaTax.totalTaxUsd);
  deepCheck(id + " computed.indiaTax.s115a", dag.computed.indiaTax.s115a, real.computed.indiaTax.s115a || null);
  if (usEntity) {
    deepCheck(id + " computed.usTax (minus usSourceIncomeUsd/foreignSourceIncomeUsd)", { ...dag.computed.usTax, usSourceIncomeUsd: 0, foreignSourceIncomeUsd: 0 }, { ...real.computed.usTax, usSourceIncomeUsd: 0, foreignSourceIncomeUsd: 0 });
  } else {
    deepCheck(id + " computed.usTax", dag.computed.usTax, real.computed.usTax);
  }
  deepCheck(id + " computed.usTax.isEntity", !!dag.computed.usTax.isEntity, !!real.computed.usTax.isEntity);
  deepCheck(id + " computed.residency.india.worldwide", dag.computed.residency.india.worldwide, real.computed.residency.india.worldwide);
  deepCheck(id + " computed.residency.us.worldwide", dag.computed.residency.us.worldwide, real.computed.residency.us.worldwide);
  deepCheck(id + " computed.residency.us.isResident", dag.computed.residency.us.isResident, real.computed.residency.us.isResident);
  if (usEntity || nra) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) computed.ftc.india");
    deepCheck(id + " computed.ftc (minus .india)", { ...dag.computed.ftc, india: null }, { ...real.computed.ftc, india: null });
  } else {
    deepCheck(id + " computed.ftc", dag.computed.ftc, real.computed.ftc);
  }
  deepCheck(id + " computed.limits", dag.computed.limits, real.computed.limits);
  deepCheck(id + " computed.reconciliation", dag.computed.reconciliation, real.computed.reconciliation);
  if (!usEntity) deepCheck(id + " computed.headline", dag.computed.headline, real.computed.headline);
  if (!usEntity) deepCheck(id + " computed.apportionment", dag.computed.apportionment, real.computed.apportionment);
  if (!usEntity) deepCheck(id + " monitoring.health.score", dag.monitoring.health.score, real.monitoring.health.score);
  if (usEntity) console.log("    (DELIBERATE divergence, section D — see run-report2.js) taxComputation.us — not checked here, see run-report2.js/run-analyze.js");
  if (indiaEntity) console.log("    (DELIBERATE divergence, section D — see run-report3.js) taxComputation.india — not checked here, see run-report3.js/run-analyze.js");
  console.log(id + "  " + (fails === before ? "all match" : "FAILURES above"));
}

console.log("=== SAMPLE (the actual Demo-mode default) ===");
{
  const S = WISING.SAMPLE;
  const real = WISING.analyze({ router: S.router, india: S.india, us: S.us });
  const dag = analyzeDag({ router: S.router, india: S.india, us: S.us });
  checkResult("SAMPLE", dag, real);
}

console.log("\n=== all 11 PROFILES ===");
WISING.PROFILES.forEach((p) => {
  const real = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  const dag = analyzeDag({ router: p.router, india: p.india, us: p.us });
  checkResult(p.id, dag, real);
});

console.log("\n=== Clients tab: allClientSummariesDag() vs allClientSummaries() ===");
{
  const before = fails;
  const dagSummaries = allClientSummariesDag();
  const realSummaries = allClientSummaries();
  deepCheck("client summaries length", dagSummaries.length, realSummaries.length);
  // Section D: healthScore/totalIncomeUsd are the same US-entity divergence
  // as checkResult above (a real analyze() lookup by profile id, since the
  // summary object itself doesn't carry usKind).
  const usEntityIds = new Set(WISING.PROFILES.filter((p) => {
    const r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
    return isUsEntity(r);
  }).map((p) => p.id));
  realSummaries.forEach((real, i) => {
    const dag = dagSummaries[i];
    const skip = usEntityIds.has(real.id) ? new Set(["healthScore", "totalIncomeUsd"]) : new Set();
    if (skip.size) console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) clientSummaries[" + i + "]." + real.id + ".healthScore/totalIncomeUsd");
    ["id", "healthScore", "critical", "warning", "indiaStatus", "usStatus", "dualResident",
      "totalIncomeUsd", "netDoubleTaxUsd", "combinedTaxUsd", "requiredDocs", "isBusiness"].forEach((k) => {
      if (skip.has(k)) return;
      deepCheck("clientSummaries[" + i + "]." + real.id + "." + k, dag && dag[k], real[k]);
    });
  });
  console.log(fails === before ? "all match" : "FAILURES above");
}

console.log("\n" + checks + " checks, " + fails + " failed");
process.exit(fails > 0 ? 1 : 0);

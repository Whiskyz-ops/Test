globalThis.window = globalThis;
await import("./lib/engine/constants.js");
await import("./lib/engine/normalize.js");
await import("./lib/engine/computation.js");
await import("./lib/engine/monitoring.js");
await import("./lib/engine/conflicts.js");
await import("./lib/engine/sample-data.js");
// Sets WISING.PROFILES to the frozen 23 Jul 2026 snapshot — but this gets
// OVERWRITTEN below (not a bug): importing dag-adapter.js transitively pulls
// in lib/wising.js (for countriesFromEngine), whose own header comment
// explains it deliberately imports profiles.js from ./dag/ (the live,
// DAG-synced copy) instead of ./engine/, so the demo profile list stays
// current for both Engine and DAG mode. Both profiles.js copies assign
// WISING.PROFILES as a module-load side effect on the same global — since
// this file's own import order (engine/profiles.js, then dag-adapter.js)
// matches lib/wising.js's real production order exactly, WISING.PROFILES
// below is the SAME array the live app actually uses, on both the real and
// dag sides of every comparison — verified empirically (only one further
// write happens, confirmed by instrumenting the property setter) — see
// docs/GAP_TRACKER.md section Z's own writeup for the full trace.
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
//
// The block below (passive/general/foreignWagesTaxPaidUsd/baskets/
// otherCountries/feieHousingAppliedUsd/housingAppliedUsd) mirrors
// run-fuzz.js's OWN DAG_ONLY_KEYS object verbatim (proven safe there across
// ~70k fuzzed profiles) — never carried over here, so every real fixture
// touching the §904 basket-split FTC work (task #46) or FEIE housing
// exclusion failed this file's checks even though they're genuinely
// DAG-only structural additions, not divergences. gilti962TaxUsd/cfcDetail/
// cfcNetTaxUsd/cfcNonElectedInclusionUs/cfcElectedPool/cfcPerEntityTrace
// (Phase 7 GILTI/NCTI) and collectiblesGainUsd/collectiblesTaxUsd/
// collectiblesLtcgUsd/qsbsExcludedGainUsd/qsbsTaxableGainUsd (capital-gains
// special rates) aren't in run-fuzz.js's own DAG_ONLY_KEYS (that file uses
// its path-list mechanism for them instead), but each name is confirmed
// unique to its one feature area (grepped) — safe for blanket exclusion
// here too, same convention as shadow-core.js's own copy of this list.
const DAG_ONLY_KEYS = new Set([
  "caveat", "indiaIsAop", "indiaIsTrust", "trustDistributedUsd", "trustRetainedUsd",
  "trustBracketBreakdown", "entityGraph", "qbiWagesUsd", "qbiUbiaUsd",
  "foreignSection988GainLoss", "otherOrdinaryIncomeUs",
  // §25B Saver's Credit (task #44 follow-up) — added proactively (kept in
  // sync with shadow-core.js's own DAG_ONLY_KEYS).
  "saversCreditUsd", "saversCreditDetail",
  // Mirrors run-fuzz.js's own DAG_ONLY_KEYS — see comment above.
  "passive", "general", "foreignWagesTaxPaidUsd", "baskets", "otherCountries",
  "feieHousingAppliedUsd", "housingAppliedUsd",
  // Phase 7 GILTI/NCTI quantification — no frozen-engine equivalent at all.
  "gilti962TaxUsd", "cfcDetail", "cfcNetTaxUsd", "cfcNonElectedInclusionUs",
  "cfcElectedPool", "cfcPerEntityTrace",
  // Capital-gains special rates (§1(h)(4) 28% collectibles, §1202 QSBS).
  "collectiblesGainUsd", "collectiblesTaxUsd", "collectiblesLtcgUsd",
  "qsbsExcludedGainUsd", "qsbsTaxableGainUsd"
]);

// findings ids: ID-SET reconciliation, not a positional array compare —
// dag.findings.map(f => f.id) vs real.findings.map(f => f.id) used to go
// straight through deepCheck's generic array branch (length, then
// element-by-element BY POSITION). A single known DAG-only extra finding
// (itin_application_required, lrs_investment_tcs, s83b_election_not_filed_
// timely, hsa_excess_contribution, ...) shifts every ID after it out of
// position, so ANY one of them firing failed the WHOLE array, not just
// that one entry. The only carve-out that existed was a usEntity-gated
// strip of exactly two IDs. Replaced with the same ID-KEYED reconciliation
// prototypes/graph-pilot/run-fuzz.js's own compareFindings() uses (keep
// all three copies -- here, shadow-core.js, run-fuzz.js -- in sync).
const KNOWN_EXTRA_FINDING_IDS = new Set([
  "us_entity_state_tax", "us_entity_state_tax_not_modeled",
  "presumptive_lockin_active_india", "msme_disallowance_s43Bh_india",
  "retirement_excess_elective_deferral", "retirement_excess_ira_contribution",
  "hsa_excess_contribution", "retirement_rmd_required", "s83b_election_not_filed_timely",
  "itin_application_required", "lrs_investment_tcs",
  "nra_eci_fdap_classification_check", "treaty_rate_not_recognized",
  "ftc_gap", "ftc_available", "niit_medicare_not_creditable", "underpayment_2210",
  "cfc", "cfc_below_threshold"
]);
// `hadKnownIssue`: true iff at least one catalogued ID-level exception
// actually fired in THIS reconciliation — the same "findingsResult.known.
// length > 0" / hadKnownFindingsIssue signal run-fuzz.js/shadow-core.js gate
// their own CASCADE_ONLY_PATHS (summary.healthScore/counts, monitoring.
// health/alerts — mechanically derived from findings[], only excusable
// alongside a known findings-level issue) on. Ported here the same way.
function reconciledFindingIds(dagIds, realIds, isUsEntity) {
  const dagSet = new Set(dagIds), realSet = new Set(realIds);
  let hadKnownIssue = false;
  const keepDag = dagIds.filter((id) => {
    if (realSet.has(id)) return true;
    if (KNOWN_EXTRA_FINDING_IDS.has(id)) { hadKnownIssue = true; return false; }
    return true;
  });
  const keepReal = realIds.filter((id) => {
    if (dagSet.has(id)) return true;
    const isEntitySuppressed = id === "underpayment_2210" && isUsEntity;
    const isBasketSplit = id === "underpayment_2210" || id === "ftc_gap" || id === "ftc_available" || id === "niit_medicare_not_creditable";
    if (isEntitySuppressed || isBasketSplit) { hadKnownIssue = true; return false; }
    return true;
  });
  return { dag: keepDag.sort(), real: keepReal.sort(), hadKnownIssue };
}
// summary.healthScore/summary.counts (and monitoring.health.score, checked
// separately below) — see reconciledFindingIds's own comment.
function omitCascadeFields(summary) {
  if (!summary) return summary;
  const { healthScore, counts, ...rest } = summary;
  return rest;
}

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
// computed.usTax.nra.standardDeductionUsd/itemizedDeductionUsd/article212Eligible/
// article212AmbiguousJ1 (concurrent session's NRA Article 21(2)/ECI-FDAP
// classification work) — new DAG-only leaves with no engine equivalent, same
// KNOWN_ALWAYS_DIVERGENT_PATHS entries as run-fuzz.js/shadow-core.js. Can't
// be blanket-excluded via DAG_ONLY_KEYS (standardDeductionUsd/
// itemizedDeductionUsd collide with unrelated same-named fields elsewhere —
// findings-batch5-nodes.js's "no income tax" finding and the state-tax
// report rows), so stripped narrowly off just the .nra sub-object instead.
// Unconditional (usTax.nra is only ever populated for an actual NRA anyway).
function omitNraNewFields(usTax) {
  if (!usTax || !usTax.nra) return usTax;
  const { standardDeductionUsd, itemizedDeductionUsd, article212Eligible, article212AmbiguousJ1, ...restNra } = usTax.nra;
  return { ...usTax, nra: restNra };
}

// ---- the rest of run-fuzz.js's own allowlist apparatus (see that file's
// header for the full per-detector writeup) — ported here in the same
// "excuse a whole checkResult section" shape this file already uses for
// section D (usEntity/nra), since this file compares whole objects per
// section rather than walking a generic recursive path list the way
// shadow-core.js's diff()/compareSurface() do. ------------------------------
function isQbiWageLimitDivergent(dag) {
  const inc = dag.model.income && dag.model.income.us, usTax = dag.computed.usTax;
  if (!inc || !usTax || usTax.isEntity || usTax.isNra) return false;
  if (!(inc.qbiIncomeUsd > 0)) return false;
  const QBI_THRESHOLD = { single: 201750, mfj: 403500, mfs: 201750, hoh: 201750 };
  const thr = QBI_THRESHOLD[usTax.filingStatus] !== undefined ? QBI_THRESHOLD[usTax.filingStatus] : QBI_THRESHOLD.single;
  const taxableBeforeQbi = (usTax.taxableIncomeUsd || 0) + (usTax.qbiDeductionUsd || 0);
  return taxableBeforeQbi > thr;
}
function isSaversCreditDivergent(dag) {
  const usTax = dag.computed.usTax;
  return !!(usTax && !usTax.isEntity && !usTax.isNra && usTax.saversCreditUsd > 0);
}
function feieForeignWagesRowsTotal(us) {
  const rows = (us && us.income_foreign_source && us.income_foreign_source.foreign_wages) || [];
  let total = 0;
  rows.forEach((w) => { total += Number(w.gross_wages_usd || w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd) || 0; });
  return total;
}
function isFeieWagesDivergentProfile(profile) {
  const us = (profile && profile.us) || {};
  const feieUsd = Number(us.foreign_earned_income && us.foreign_earned_income.foreign_earned_income_usd) || 0;
  return feieUsd > feieForeignWagesRowsTotal(us);
}
function isFeieBonaFideProxyDivergentProfile(profile) {
  const f = (profile && profile.us && profile.us.foreign_earned_income) || {};
  return f.claims_feie === true && f.qualification_test === "bona_fide_residence" &&
    !!f.bona_fide_residence_start_date && f.bona_fide_residence !== true;
}
function isFeieStackingRuleDivergentProfile(dag) {
  const t = dag && dag.computed && dag.computed.usTax;
  return !!t && (((t.feie && t.feie.appliedUsd) || 0) + (t.feieHousingAppliedUsd || 0)) > 0;
}
function isFeieEntityGateMissingProfile(dag, profile) {
  const kind = dag.model.entity && dag.model.entity.usKind;
  const isIndividualPath = !kind || kind === "individual";
  const claimsFeie = !!(profile && profile.us && profile.us.foreign_earned_income && profile.us.foreign_earned_income.claims_feie);
  return !isIndividualPath && claimsFeie;
}
function isQbiWageUbiaLimitDivergentProfile(real) {
  const t = real && real.computed && real.computed.usTax;
  if (!t) return false;
  const qbiThresholdFloor = 201750;
  const taxableBeforeQbi = (t.taxableIncomeUsd || 0) + (t.qbiDeductionUsd || 0);
  return (t.qbiDeductionUsd || 0) > 0 && taxableBeforeQbi > qbiThresholdFloor;
}
function isIndiaRebateMarginalReliefDivergentProfile(dag) {
  if (!dag || !dag._debugIsIndividualV3 || dag._debugIsNRV3) return false;
  const REBATE_87A_NEW = { incomeCap: 1200000, maxRebate: 60000 };
  const REBATE_87A_OLD = { incomeCap: 500000, maxRebate: 12500 };
  const cap = dag._debugIsNew ? REBATE_87A_NEW : REBATE_87A_OLD;
  const totalNormalInr = dag._debugTotalNormalInr || 0;
  const slabTaxInr = dag._debugSlabTaxInr || 0;
  const oldRebate = totalNormalInr <= cap.incomeCap ? Math.min(slabTaxInr, cap.maxRebate) : 0;
  return Math.abs(oldRebate - (dag._debugRebateInrV3 || 0)) > 1;
}
function isIndiaSalaryExemptionProfile(dag) {
  const sd = dag.model.income && dag.model.income.india && dag.model.income.india.salaryDetail;
  if (!sd) return false;
  return sd.overridden === false || sd.taxableSalaryInr === 0;
}
// India §44BB/§44BBB foreign-company presumptive scheme (IN-26) — see
// shadow-core.js's own copy of this detector for the full writeup (not part
// of run-fuzz.js's own apparatus; surfaced by foreign_holdco_poem_india).
function isIndiaPresumptiveForeignSchemeProfile(dag) {
  const entities = dag && dag.model && dag.model.assets && dag.model.assets.businessEntities;
  if (!Array.isArray(entities)) return false;
  return entities.some((e) => {
    const f = e && e.calcTrace && e.calcTrace.formula;
    return typeof f === "string" && f.indexOf("Presumptive income under s.44BB") === 0;
  });
}
// GILTI/Subpart F inclusion reaching an individual CFC-owner's own taxable
// income (Phase 7) — see shadow-core.js's own copy for the full writeup (not
// part of run-fuzz.js's own apparatus; surfaced by founder_indian_company).
function isCfcInclusionDivergentProfile(dag) {
  const inc = dag && dag.model && dag.model.income && dag.model.income.us;
  if (!inc) return false;
  const nonElected = (inc.cfcNonElectedInclusionUs && inc.cfcNonElectedInclusionUs.usd) || 0;
  const elected = inc.cfcElectedPool || {};
  const electedAmt = (elected.taxableBaseUsd || 0) + (elected.subpartFUsd || 0);
  return nonElected > 0 || electedAmt > 0;
}
// India s.44AD(4) presumptive lock-in mandatory tax-audit trigger (IN-6) —
// see shadow-core.js's own copy for the full writeup (not part of
// run-fuzz.js's own apparatus; surfaced by india_only_ca_client, named as
// this exact gap in docs/GAP_TRACKER.md's own "next follow-up" note).
function isIndiaPresumptiveLockinActiveProfile(dag) {
  const findings = dag && dag.findings;
  return Array.isArray(findings) && findings.some((f) => f.id === "presumptive_lockin_active_india");
}

// Every field the exhaustive grep survey (lib/wising.js, lib/logic.js,
// components/*, app/*) actually reads off an analyze() result — not a
// full-object dump (which would flag hundreds of fields no consumer touches).
//
// `profile` (optional 4th arg): the raw {router,india,us} dag/real were
// computed from — needed only by the FEIE detectors (isFeieWagesDivergent
// Profile/isFeieBonaFideProxyDivergentProfile/isFeieEntityGateMissingProfile),
// which key off raw user-input fields the assembled result doesn't retain.
function checkResult(id, dag, real, profile) {
  const before = fails;
  const usEntity = isUsEntity(real), indiaEntity = isIndiaEntity(real), nra = isNra(real);

  // ---- section D + the wholesale-cascade family (run-fuzz.js's own
  // allowlist apparatus, ported here as whole-section excusals since this
  // file compares whole objects per section rather than a generic recursive
  // path walk — see the detector functions above for each one's writeup).
  const qbiWageLimitDivergent = isQbiWageLimitDivergent(dag);
  const saversCreditDivergent = isSaversCreditDivergent(dag);
  const feieWagesDivergent = isFeieWagesDivergentProfile(profile);
  const feieBonaFideProxyDivergent = isFeieBonaFideProxyDivergentProfile(profile);
  const feieStackingRuleDivergent = isFeieStackingRuleDivergentProfile(dag);
  const feieEntityGateMissing = isFeieEntityGateMissingProfile(dag, profile);
  const qbiWageUbiaDivergent = isQbiWageUbiaLimitDivergentProfile(real);
  const indiaRebateDivergent = isIndiaRebateMarginalReliefDivergentProfile(dag);
  const indiaSalaryExemption = isIndiaSalaryExemptionProfile(dag);
  const indiaPresumptiveForeignScheme = isIndiaPresumptiveForeignSchemeProfile(dag);
  const cfcInclusionDivergent = isCfcInclusionDivergentProfile(dag);
  const indiaPresumptiveLockinActive = isIndiaPresumptiveLockinActiveProfile(dag);

  // Wholesale-block detectors (same shape as KNOWN_FEIE_WAGES_DIVERGENT_
  // PATHS/KNOWN_QBI_WAGE_UBIA_DIVERGENT_PATHS/KNOWN_CFC_INCLUSION_DIVERGENT_
  // PATHS in run-fuzz.js/shadow-core.js): a real, wide amount fix whose
  // cascade is too varied to enumerate leaf-by-leaf.
  const usWholesaleDivergent = feieWagesDivergent || feieBonaFideProxyDivergent || feieStackingRuleDivergent ||
    qbiWageUbiaDivergent || cfcInclusionDivergent;
  const indiaWholesaleDivergent = indiaSalaryExemption || indiaPresumptiveForeignScheme;
  const excused = new Set();
  if (usWholesaleDivergent) {
    ["summary", "model.income.us", "computed.usTax", "computed.headline", "computed.ftc",
      "computed.reconciliation", "computed.apportionment", "computed.limits", "documents", "returnForms",
      "withholding", "monitoring.health.score", "monitoring.calendar.all", "monitoring.residency", "monitoring.projections"
    ].forEach((s) => excused.add(s));
  }
  if (indiaWholesaleDivergent) {
    ["summary", "model.income.india", "computed.indiaTax", "computed.ftc", "computed.headline",
      "computed.reconciliation", "computed.apportionment", "documents", "returnForms", "withholding",
      "monitoring.health.score", "monitoring.calendar.all", "monitoring.residency", "monitoring.projections"
    ].forEach((s) => excused.add(s));
  }
  if (qbiWageLimitDivergent || saversCreditDivergent) {
    ["computed.usTax", "computed.headline", "computed.ftc", "computed.reconciliation"].forEach((s) => excused.add(s));
  }
  if (indiaRebateDivergent) {
    ["summary", "computed.indiaTax", "computed.ftc", "computed.headline"].forEach((s) => excused.add(s));
  }
  if (feieEntityGateMissing) excused.add("documents");
  if (indiaPresumptiveLockinActive) { excused.add("documents"); excused.add("summary.requiredDocs"); excused.add("monitoring.calendar.all"); }

  // form_nj1040 (docs/GAP_TRACKER.md section H.7, 21 Jul 2026) and form_8858
  // (section H.13, 22 Jul 2026): new DAG-only documents, no engine
  // equivalent for either — stripped from both the documents list and the
  // calendar's bundled docIds, same convention as run-fuzz.js's assembleDag().
  // summary.requiredDocs is a DAG-computed count baked in from the
  // UN-stripped documents list (report-batch5-nodes.js) — adjusted by the
  // same amount so this known, deliberate divergence doesn't rely on
  // deepCheck's +/-2 numeric tolerance to go unnoticed.
  const DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id", "schedule_m1_m2", "k1_issuance", "form_8880", "form_w7", "form_27d"];
  const droppedRequiredCount = dag.documents.filter((x) => DAG_ONLY_DOC_IDS.includes(x.id) && x.required).length;
  const dagDocs = dag.documents.filter((x) => !DAG_ONLY_DOC_IDS.includes(x.id));
  const dagSummary = droppedRequiredCount > 0 && dag.summary && typeof dag.summary.requiredDocs === "number"
    ? { ...dag.summary, requiredDocs: dag.summary.requiredDocs - droppedRequiredCount }
    : dag.summary;
  const reconciled = reconciledFindingIds(dag.findings.map(f => f.id), real.findings.map(f => f.id), usEntity);
  // CASCADE_ONLY_PATHS (run-fuzz.js/shadow-core.js): healthScore/counts are
  // mechanically derived from findings[], excusable only alongside a
  // catalogued findings-level ID exception in THIS same comparison.
  const cascadeExcused = reconciled.hadKnownIssue;
  // summary.netDoubleTaxUsd: unconditional (every profile) — same
  // KNOWN_ALWAYS_DIVERGENT_PATHS entry as the computed.ftc.us/headline
  // basket-split omissions below.
  const dagSummaryC = { ...(cascadeExcused ? omitCascadeFields(dagSummary) : dagSummary), netDoubleTaxUsd: 0 };
  const realSummaryC = { ...(cascadeExcused ? omitCascadeFields(real.summary) : real.summary), netDoubleTaxUsd: 0 };
  if (excused.has("summary")) {
    console.log("    (DELIBERATE divergence — wholesale cascade, see detector comments above) summary");
  } else if (usEntity) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) summary.totalIncomeUsd/healthScore, computed.usTax.usSourceIncomeUsd/foreignSourceIncomeUsd, computed.headline.totalIncomeUsd, computed.apportionment, monitoring.health.score");
    deepCheck(id + " summary (minus totalIncomeUsd/healthScore)", { ...dagSummaryC, totalIncomeUsd: 0, healthScore: 0 }, { ...realSummaryC, totalIncomeUsd: 0, healthScore: 0 });
  } else if (excused.has("summary.requiredDocs")) {
    deepCheck(id + " summary (minus requiredDocs)", { ...dagSummaryC, requiredDocs: 0 }, { ...realSummaryC, requiredDocs: 0 });
  } else {
    if (cascadeExcused) console.log("    (DELIBERATE divergence — cascade-only, see reconciledFindingIds's own comment) summary.healthScore/counts");
    deepCheck(id + " summary", dagSummaryC, realSummaryC);
  }
  deepCheck(id + " findings ids (reconciled)", reconciled.dag, reconciled.real);
  deepCheck(id + " model.entity", dag.model.entity, real.model.entity);
  deepCheck(id + " model.meta", dag.model.meta, real.model.meta);
  deepCheck(id + " model.treaty", dag.model.treaty, real.model.treaty);
  deepCheck(id + " model.residency.india.daysCurrentYear", dag.model.residency.india.daysCurrentYear, real.model.residency.india.daysCurrentYear);
  deepCheck(id + " model.residency.us.daysCurrentYear", dag.model.residency.us.daysCurrentYear, real.model.residency.us.daysCurrentYear);
  // model.income.india.salaryDetail: pure introspection field with no engine
  // equivalent at all (like checksRegistry) — present on EVERY profile
  // regardless of whether the salary-exemption override fired, so it's
  // always known — same unconditional entry run-fuzz.js/shadow-core.js both
  // carry (KNOWN_ALWAYS_DIVERGENT_PATHS's own "model.income.india.
  // salaryDetail").
  if (!excused.has("model.income.india")) {
    const { salaryDetail: _dsd, ...dagIndiaIncome } = dag.model.income.india || {};
    const { salaryDetail: _rsd, ...realIndiaIncome } = real.model.income.india || {};
    deepCheck(id + " model.income.india", dagIndiaIncome, realIndiaIncome);
  }
  if (!excused.has("model.income.us")) deepCheck(id + " model.income.us", dag.model.income.us, real.model.income.us);
  deepCheck(id + " model.accounts.accounts", dag.model.accounts.accounts, real.model.accounts.accounts);
  // model.assets.businessEntities: unconditional whole-array exclusion (same
  // KNOWN_ALWAYS_DIVERGENT_PATHS entry as run-fuzz.js/shadow-core.js) — Phase
  // 7 GILTI/NCTI fields (gilti/calcTrace/returnForm text and amount), IN-26's
  // s.44BB/s.44BBB presumptive scheme, and item R's Schedule C trace wording
  // all live inside this array and have no byte-stable engine equivalent.
  {
    const { businessEntities: _dbe, ...dagAssets } = dag.model.assets || {};
    const { businessEntities: _rbe, ...realAssets } = real.model.assets || {};
    deepCheck(id + " model.assets (minus businessEntities)", dagAssets, realAssets);
  }
  if (!excused.has("documents")) deepCheck(id + " documents", dagDocs, real.documents);
  if (!excused.has("returnForms")) deepCheck(id + " returnForms", dag.returnForms, real.returnForms);
  if (!excused.has("withholding")) deepCheck(id + " withholding", dag.withholding, real.withholding);
  const stripNj1040 = (row) => Array.isArray(row.docIds) ? { ...row, docIds: row.docIds.filter((x) => !DAG_ONLY_DOC_IDS.includes(x)) } : row;
  if (!excused.has("monitoring.calendar.all")) deepCheck(id + " monitoring.calendar.all", dag.monitoring.calendar.all.map(stripNj1040), real.monitoring.calendar.all);
  if (!excused.has("monitoring.residency")) deepCheck(id + " monitoring.residency", dag.monitoring.residency, real.monitoring.residency);
  if (!excused.has("monitoring.projections")) deepCheck(id + " monitoring.projections", dag.monitoring.projections, real.monitoring.projections);
  if (!excused.has("computed.indiaTax")) {
    deepCheck(id + " computed.indiaTax.totalTaxUsd", dag.computed.indiaTax.totalTaxUsd, real.computed.indiaTax.totalTaxUsd);
    deepCheck(id + " computed.indiaTax.s115a", dag.computed.indiaTax.s115a, real.computed.indiaTax.s115a || null);
  } else {
    console.log("    (DELIBERATE divergence — wholesale cascade, see detector comments above) computed.indiaTax");
  }
  const dagUsTaxNorm = omitNraNewFields(dag.computed.usTax);
  const realUsTaxNorm = omitNraNewFields(real.computed.usTax);
  if (excused.has("computed.usTax")) {
    console.log("    (DELIBERATE divergence — wholesale cascade, see detector comments above) computed.usTax");
  } else if (usEntity) {
    deepCheck(id + " computed.usTax (minus usSourceIncomeUsd/foreignSourceIncomeUsd)", { ...dagUsTaxNorm, usSourceIncomeUsd: 0, foreignSourceIncomeUsd: 0 }, { ...realUsTaxNorm, usSourceIncomeUsd: 0, foreignSourceIncomeUsd: 0 });
  } else {
    deepCheck(id + " computed.usTax", dagUsTaxNorm, realUsTaxNorm);
  }
  deepCheck(id + " computed.usTax.isEntity", !!dag.computed.usTax.isEntity, !!real.computed.usTax.isEntity);
  deepCheck(id + " computed.residency.india.worldwide", dag.computed.residency.india.worldwide, real.computed.residency.india.worldwide);
  deepCheck(id + " computed.residency.us.worldwide", dag.computed.residency.us.worldwide, real.computed.residency.us.worldwide);
  deepCheck(id + " computed.residency.us.isResident", dag.computed.residency.us.isResident, real.computed.residency.us.isResident);
  // computed.ftc.us / .netUnrelievedDoubleTaxUsd: unconditional (every
  // profile) — same KNOWN_ALWAYS_DIVERGENT_PATHS entries as run-fuzz.js/
  // shadow-core.js (the §904 basket-split FTC work, task #46 — basket
  // separation has no predictable sign relative to the frozen engine's
  // single-basket formula, verified instead via run-ftc-correctness.js).
  const dagFtcC = { ...dag.computed.ftc, us: null, netUnrelievedDoubleTaxUsd: 0 };
  const realFtcC = { ...real.computed.ftc, us: null, netUnrelievedDoubleTaxUsd: 0 };
  if (excused.has("computed.ftc")) {
    console.log("    (DELIBERATE divergence — wholesale cascade, see detector comments above) computed.ftc");
  } else if (usEntity || nra) {
    console.log("    (DELIBERATE divergence, section D — see run-fuzz.js) computed.ftc.india");
    deepCheck(id + " computed.ftc (minus .india/.us/.netUnrelievedDoubleTaxUsd)", { ...dagFtcC, india: null }, { ...realFtcC, india: null });
  } else {
    deepCheck(id + " computed.ftc (minus .us/.netUnrelievedDoubleTaxUsd)", dagFtcC, realFtcC);
  }
  if (!excused.has("computed.limits")) deepCheck(id + " computed.limits", dag.computed.limits, real.computed.limits);
  // computed.reconciliation.rows: unconditional (Phase 7 GILTI/NCTI — the
  // CFC row's note/usRule text changed once a CFC fires, no engine
  // equivalent) — same KNOWN_ALWAYS_DIVERGENT_PATHS entry.
  if (!excused.has("computed.reconciliation")) {
    const { rows: _drows, ...dagReconc } = dag.computed.reconciliation || {};
    const { rows: _rrows, ...realReconc } = real.computed.reconciliation || {};
    deepCheck(id + " computed.reconciliation (minus rows)", dagReconc, realReconc);
  }
  // computed.headline.netUnrelievedDoubleTaxUsd/combinedTaxBeforeReliefUsd,
  // summary.netDoubleTaxUsd: unconditional, same basket-split cascade.
  if (!usEntity && !excused.has("computed.headline")) {
    deepCheck(id + " computed.headline (minus netUnrelievedDoubleTaxUsd/combinedTaxBeforeReliefUsd)",
      { ...dag.computed.headline, netUnrelievedDoubleTaxUsd: 0, combinedTaxBeforeReliefUsd: 0 },
      { ...real.computed.headline, netUnrelievedDoubleTaxUsd: 0, combinedTaxBeforeReliefUsd: 0 });
  }
  if (!usEntity && !excused.has("computed.apportionment")) deepCheck(id + " computed.apportionment", dag.computed.apportionment, real.computed.apportionment);
  if (!usEntity && !excused.has("monitoring.health.score")) {
    if (cascadeExcused) console.log("    (DELIBERATE divergence — cascade-only, see reconciledFindingIds's own comment) monitoring.health.score");
    else deepCheck(id + " monitoring.health.score", dag.monitoring.health.score, real.monitoring.health.score);
  }
  if (usEntity) console.log("    (DELIBERATE divergence, section D — see run-report2.js) taxComputation.us — not checked here, see run-report2.js/run-analyze.js");
  if (indiaEntity) console.log("    (DELIBERATE divergence, section D — see run-report3.js) taxComputation.india — not checked here, see run-report3.js/run-analyze.js");
  console.log(id + "  " + (fails === before ? "all match" : "FAILURES above"));
}

console.log("=== SAMPLE (the actual Demo-mode default) ===");
{
  const S = WISING.SAMPLE;
  const real = WISING.analyze({ router: S.router, india: S.india, us: S.us });
  const dag = analyzeDag({ router: S.router, india: S.india, us: S.us });
  checkResult("SAMPLE", dag, real, { router: S.router, india: S.india, us: S.us });
}

console.log("\n=== all 11 PROFILES ===");
WISING.PROFILES.forEach((p) => {
  const real = WISING.analyze({ router: p.router, india: p.india, us: p.us });
  const dag = analyzeDag({ router: p.router, india: p.india, us: p.us });
  checkResult(p.id, dag, real, { router: p.router, india: p.india, us: p.us });
});

console.log("\n=== Clients tab: allClientSummariesDag() vs allClientSummaries() ===");
{
  const before = fails;
  const dagSummaries = allClientSummariesDag();
  const realSummaries = allClientSummaries();
  deepCheck("client summaries length", dagSummaries.length, realSummaries.length);
  // Section D: healthScore/totalIncomeUsd are the same US-entity divergence
  // as checkResult above (a real analyze() lookup by profile id, since the
  // summary object itself doesn't carry usKind) — plus the same wholesale-
  // cascade detectors checkResult uses (FEIE wages/CFC-inclusion/India
  // presumptive-foreign-scheme all move the $-amount summary fields;
  // presumptive lock-in only moves healthScore/requiredDocs, via documents).
  const wholesaleIds = new Set(), lockinOnlyIds = new Set();
  WISING.PROFILES.forEach((p) => {
    const r = WISING.analyze({ router: p.router, india: p.india, us: p.us });
    const d = analyzeDag({ router: p.router, india: p.india, us: p.us });
    if (isUsEntity(r) || isFeieWagesDivergentProfile({ router: p.router, india: p.india, us: p.us }) ||
      isCfcInclusionDivergentProfile(d) || isIndiaPresumptiveForeignSchemeProfile(d)) {
      wholesaleIds.add(p.id);
    } else if (isIndiaPresumptiveLockinActiveProfile(d)) {
      lockinOnlyIds.add(p.id);
    }
  });
  realSummaries.forEach((real, i) => {
    const dag = dagSummaries[i];
    const skip = wholesaleIds.has(real.id)
      ? new Set(["healthScore", "critical", "warning", "totalIncomeUsd", "netDoubleTaxUsd", "combinedTaxUsd"])
      : lockinOnlyIds.has(real.id) ? new Set(["healthScore", "critical", "warning", "requiredDocs"]) : new Set();
    if (skip.size) console.log("    (DELIBERATE divergence, section D / wholesale cascade — see run-fuzz.js / checkResult's detector comments) clientSummaries[" + i + "]." + real.id + "." + [...skip].join("/"));
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

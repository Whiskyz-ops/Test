/* ============================================================================
 * SHADOW MODE — pure comparison core (no window / no DAG-CJS imports, so it
 * runs unchanged in the browser and under Node for test-shadow.mjs).
 *
 * The fuzzer (prototypes/graph-pilot/run-fuzz-differential.js) proved
 * engine==DAG across ~70k generated profiles, but only over a fixed MAP of
 * fields and only within the *shape* the 12 fixtures established. Shadow mode
 * closes the remaining gap: on every REAL profile the Monitor actually loads,
 * it runs both the engine (primary, shown to the user) and the DAG (silent),
 * and deep-compares the ENTIRE product surface the UI renders — recursively,
 * every field, not a hand-listed subset. Any field a real user populates that
 * the fuzzer's vocabulary never reached still gets caught here, in situ.
 *
 * compareSurface() is symmetric (union of keys on both sides) over the
 * top-level outputs both analyze() and the DAG adapter produce in identical
 * shape. `model` is compared only on the sub-objects the adapter actually
 * assembles (income/entity/meta/treaty) — the engine's model carries many
 * more internal fields no Monitor component reads, and the adapter never
 * claimed to mirror them (see lib/dag-adapter.js).
 *
 * THREE-WAY (docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 8, plan §7):
 * compareSurface()/diff() themselves needed no change to serve a second
 * pair — they already take any two analyze()-shaped results, agnostic to
 * which implementation produced them. Only `signature()` gained an explicit
 * `sourcePair` parameter (see SOURCE_PAIRS below), so an engine-vs-JS-DAG
 * divergence and an engine-vs-Python-DAG one never collapse into the same
 * deduped log entry even if they happen to look identical. lib/shadow.js is
 * where the two runners (`runShadow`/`runShadowPy`) and the persisted log
 * actually live.
 * ==========================================================================*/

// The surface shadow mode compares — every path the DAG-backed adapter
// promises to reproduce from the engine (the same contract test-adapter.mjs
// enumerates, widened to the FULL product-output objects the DAG builds
// complete via its analyzeResult node). Two groups:
//
//  SYMMETRIC — objects the DAG produces byte-for-byte the same shape as the
//  engine. Compared as a union of keys, so an extra/missing key on either side
//  is itself a divergence.
//
//  DIRECTIONAL — objects the adapter assembles from a subset of DAG nodes; the
//  engine's version carries extra internal fields no Monitor component reads.
//  Compared over only the keys the DAG produced (engine-only fields skipped —
//  they're outside the adapter's contract, not bugs).
//
// computed.indiaTax is neither: the adapter builds a small bespoke object
// (totalTaxInr/totalTaxUsd/regime/s115a + a synthetic isEntity the engine has
// no equivalent for), so it's covered by explicit engine-mirrored scalar paths
// below rather than a whole-object compare.
//
// "findings" is NOT in this list — it gets its own ID-keyed reconciliation
// (diffFindings(), below DAG_ONLY_KEYS) instead of the generic positional
// array diff every other symmetric path goes through, since finding order
// isn't a meaningful signal and a single known extra/missing ID would
// otherwise cascade into spurious mismatches for every finding after it.
export const SYMMETRIC_SURFACE = [
  "documents", "ftcReport", "taxComputation", "withholding",
  "scopeNotes", "returnForms", "monitoring", "summary",
  "model.income.india", "model.income.us", "model.entity", "model.meta", "model.treaty", "model.assets",
  "computed.usTax", "computed.residency", "computed.ftc", "computed.limits",
  "computed.reconciliation", "computed.headline", "computed.apportionment",
  "computed.indiaTax.totalTaxInr", "computed.indiaTax.totalTaxUsd",
  "computed.indiaTax.regime", "computed.indiaTax.s115a"
];

export const DIRECTIONAL_SURFACE = [];

// Leaf keys the DAG adds on top of an otherwise-symmetric object, with no
// engine equivalent by design — informational annotations, not divergences
// in the underlying computation. Same category as checksRegistry (which
// stays out of SYMMETRIC_SURFACE entirely at the top level); these live
// nested inside `taxComputation` rows, so the exclusion has to be a key
// name skipped during traversal instead. "caveat": the Chapter VI-A
// deductions row's what-if warning (report-batch3-nodes.js) — fires only
// when OLD regime is in effect and every underlying deduction section is
// empty (Layer 1 India hides that whole step under NEW regime), a
// what-if-tool-only concern the engine has no override plumbing to need.
// indiaIsAop/indiaIsTrust (docs/GAP_TRACKER.md section H.6, 21 Jul 2026):
// model.entity.* additions with no engine equivalent — entitytax-nodes.js's
// file header has the full writeup.
// trustDistributedUsd/trustRetainedUsd/trustBracketBreakdown (same H.6
// family, ustax-full-nodes.js's trust branch): the engine has no concept of
// "retained vs. distributed" trust income at all (every trust taxed at
// $0 entity-level before this field existed) — new keys on computed.usTax
// that only ever appear for a trust-kind US taxpayer, so unconditionally
// skipping the key names is safe for every other profile shape too (they
// simply never appear on either side).
// entityGraph (Phase 5, docs/BUSINESS_ENTITY_ARCHITECTURE.md §6, 25 Jul
// 2026): model.assets.entityGraph is a genuinely new Entity[]/Edge[] graph
// model with no engine equivalent at all — fires on every profile (even a
// lone individual produces a one-entity graph), so it needs the same
// blanket per-key exclusion as the trust-only keys above (kept in sync with
// prototypes/graph-pilot/run-fuzz.js's own DAG_ONLY_KEYS).
// qbiWagesUsd/qbiUbiaUsd (docs/GAP_TRACKER.md item S, §199A QBI wage/UBIA
// limitation): new model.income.us structural fields with no engine
// equivalent — that item's own verification pass missed this file, so
// real users on any profile would have seen a live "shadow mismatch"
// badge for these two keys alone (discovered incidentally during the
// entity-filings-audit round). foreignSection988GainLoss/
// otherOrdinaryIncomeUs: same "structural, engine has no concept of it,
// never cascades into a dollar difference" reasoning as run-fuzz.js's own
// KNOWN_ALWAYS_DIVERGENT_PATHS entry for these two fields, applied here via
// the key-name mechanism this file already uses instead of a path list.
//
// The block below (passive/general/foreignWagesTaxPaidUsd/baskets/
// otherCountries/feieHousingAppliedUsd/housingAppliedUsd) mirrors
// run-fuzz.js's OWN DAG_ONLY_KEYS object verbatim — those seven names were
// already proven safe there across ~70k fuzzed profiles, but had never been
// carried over here, so every real profile touching the §904 basket-split
// FTC work (task #46) or FEIE housing exclusion showed a live "shadow
// mismatch" badge for fields that are genuinely just DAG-only structural
// additions, not divergences. gilti962TaxUsd/cfcDetail/cfcNetTaxUsd/
// cfcNonElectedInclusionUs/cfcElectedPool/cfcPerEntityTrace (Phase 7, XB-14,
// GILTI/NCTI quantification) and collectiblesGainUsd/collectiblesTaxUsd/
// collectiblesLtcgUsd/qsbsExcludedGainUsd/qsbsTaxableGainUsd (capital-gains
// special rates) are NOT in run-fuzz.js's own DAG_ONLY_KEYS (that file uses
// its path-list mechanism for them instead), but each name is confirmed
// unique to its one feature area in this codebase (grepped), so blanket
// key-name exclusion is safe here too — consistent with this file's own
// established convention of preferring key-name exclusion over a path list
// wherever the name is unambiguous.
const DAG_ONLY_KEYS = new Set([
  "caveat", "indiaIsAop", "indiaIsTrust", "trustDistributedUsd", "trustRetainedUsd",
  "trustBracketBreakdown", "entityGraph", "qbiWagesUsd", "qbiUbiaUsd",
  "foreignSection988GainLoss", "otherOrdinaryIncomeUs",
  // §25B Saver's Credit (task #44 follow-up) — added proactively (kept in
  // sync with prototypes/graph-pilot/run-fuzz.js's own DAG_ONLY_KEYS).
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

// ---- findings: ID-set reconciliation, not a positional array diff --------
// "findings" used to sit in SYMMETRIC_SURFACE and go through diff()'s
// generic positional array comparison — which compares by INDEX, so one
// extra/missing finding anywhere but the very end shifts every subsequent
// finding out of alignment, cascading into a wall of spurious per-field
// mismatches for findings that actually agree. The only fix in place was a
// narrow, usEntity-gated pre-filter for exactly two IDs (underpayment_2210/
// us_entity_state_tax*) — every OTHER DAG-only finding (itin_application_
// required, lrs_investment_tcs, s83b_election_not_filed_timely,
// hsa_excess_contribution, and the rest) hit the same cascade unfiltered.
// Replaced with the same ID-KEYED reconciliation prototypes/graph-pilot/
// run-fuzz.js's own compareFindings() already uses (the two must be kept in
// sync) — findings are looked up and compared BY ID, immune to ordering
// differences between the two engines' own finding-add sequences, not just
// to presence/absence.
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
// cfc (Phase 7, XB-14, GILTI/NCTI quantification): content (not presence)
// diverges unconditionally whenever it fires on both sides — same
// KNOWN_CONTENT_DIVERGENCE_FINDING_IDS run-fuzz.js carries.
const KNOWN_CONTENT_DIVERGENCE_FINDING_IDS = new Set(["cfc"]);

// Returns true iff at least one of the catalogued ID-level exceptions
// (extra/missing DAG-only ID, entity-suppressed/basket-split missing ID, or
// a KNOWN_CONTENT_DIVERGENCE_FINDING_IDS content mismatch) actually fired in
// THIS comparison — the exact "findingsResult.known.length > 0" signal
// run-fuzz.js's own compareOne gates CASCADE_ONLY_PATHS on below. Separate
// from (and narrower than) the wholesale detector-driven findingsExcused
// flag compareSurface applies on top — mirrors run-fuzz.js's own two-tier
// distinction exactly (see that file's own compareOne).
function diffFindings(engFindings, dagFindings, isUsEntity, out) {
  const eng = Array.isArray(engFindings) ? engFindings : [];
  const dag = Array.isArray(dagFindings) ? dagFindings : [];
  const engById = new Map(eng.map((f) => [f.id, f]));
  const dagById = new Map(dag.map((f) => [f.id, f]));
  const allIds = new Set([...engById.keys(), ...dagById.keys()]);
  let hadKnownIssue = false;
  [...allIds].sort().forEach((id) => {
    const inDag = dagById.has(id), inEng = engById.has(id);
    if (inDag && !inEng) {
      if (KNOWN_EXTRA_FINDING_IDS.has(id)) hadKnownIssue = true;
      else out.push({ path: `findings[${id}]`, engine: "<missing>", dag: "<present>" });
    } else if (!inDag && inEng) {
      // Two catalogued exceptions, same as run-fuzz.js's own compareFindings:
      // underpayment_2210 for a US entity (agg10-nodes.js's us1ShouldFire
      // override — the engine cites the wrong form/statute for an entity),
      // and the §904 basket split (task #46) which can move the FTC-
      // dependent findings in EITHER direction.
      const isEntitySuppressed = id === "underpayment_2210" && isUsEntity;
      const isBasketSplit = id === "underpayment_2210" || id === "ftc_gap" || id === "ftc_available" || id === "niit_medicare_not_creditable";
      if (isEntitySuppressed || isBasketSplit) hadKnownIssue = true;
      else out.push({ path: `findings[${id}]`, engine: "<present>", dag: "<missing>" });
    } else if (inDag && inEng) {
      if (KNOWN_CONTENT_DIVERGENCE_FINDING_IDS.has(id)) hadKnownIssue = true;
      else diff(`findings[${id}]`, engById.get(id), dagById.get(id), out, false);
    }
  });
  return hadKnownIssue;
}

// Back-compat alias (the full path list).
export const SHADOW_SURFACE = SYMMETRIC_SURFACE.concat(DIRECTIONAL_SURFACE);

// Section D (docs/GAP_TRACKER.md, "entity-agnostic audit", 21 Jul 2026):
// DELIBERATE DAG/engine divergences for a US-entity, India-entity, or NRA
// taxpayer — the DAG is now the more-correct implementation on these
// specific paths, engine/*.js stays frozen and wrong there by explicit
// product direction. Same allowlist convention (and same root cause) as
// prototypes/graph-pilot/run-fuzz.js's KNOWN_US_ENTITY_DIVERGENT_PATHS —
// see that file's header for the full writeup. Gated strictly on the
// profile's actual taxpayer shape, checked against model.entity/computed.
// usTax.isNra on the engine side (the ground-truth classification both
// sides are separately asserted to agree on elsewhere).
const KNOWN_US_ENTITY_PATHS = [
  "computed.headline.totalIncomeUsd", "computed.ftc.india", "taxComputation.us", "summary.totalIncomeUsd",
  "summary.healthScore", "summary.counts", "monitoring.health.score",
  "computed.usTax.foreignSourceIncomeUsd", "computed.usTax.usSourceIncomeUsd", "computed.apportionment",
  "ftcReport.direction_india_relief"
];
const KNOWN_INDIA_ENTITY_PATHS = ["taxComputation.india"];
const KNOWN_NRA_PATHS = ["computed.ftc.india", "ftcReport.direction_india_relief"];
// India AOP/BOI and Trust/NGO/Political Party (docs/GAP_TRACKER.md section
// H.6, 21 Jul 2026) — a WIDER divergence than the company/firm case above:
// company/firm were already correctly entity-routed in the engine (only
// their trace had a display bug), but AOP/Trust were previously taxed as a
// plain INDIVIDUAL by the engine — a real amount bug whose fix cascades
// into nearly everything India-tax-derived. Same allowlist as
// prototypes/graph-pilot/run-fuzz.js's KNOWN_INDIA_AOP_TRUST_DIVERGENT_PATHS
// — keep both lists in sync. Verified empirically (a synthetic India-Trust
// and India-AOP profile each produced ~55-60 divergences across exactly
// these paths before this fix, with no engine equivalent to reconcile them
// against — this is the DAG being newly correct, not a bug to close).
const KNOWN_INDIA_AOP_TRUST_PATHS = [
  "model.entity.isBusiness", "model.entity.indiaReturnForm", "model.assets",
  "computed.indiaTax", "computed.ftc", "computed.headline", "computed.reconciliation",
  "taxComputation.india", "ftcReport", "withholding", "monitoring",
  "summary.indiaTaxUsd", "summary.netDoubleTaxUsd", "summary.healthScore", "summary.counts",
  "documents", "scopeNotes", "returnForms", "findings"
];
// US Trust (same H.6 family): computed.usTax.taxableIncomeUsd now correctly
// narrows to JUST the retained (undistributed) portion — the engine's
// version reflects the full distributed+retained total, since it has no
// concept of "retained" at all (see ustax-full-nodes.js's usEntityResult
// trust branch, and the DAG_ONLY_KEYS entries above for its 3 new detail
// fields). Cascades into computed.ftc.us.taxableIncomeUsd and the "US
// claims India" FTC direction; filingStatus also carries a new
// retained-vs-distributed qualifier the engine's static string never had.
// ADDITIVE to KNOWN_US_ENTITY_PATHS above, not a replacement — a US trust
// is also a usEntity and gets both sets excused. Same allowlist as
// run-fuzz.js's KNOWN_US_TRUST_DIVERGENT_PATHS — keep both lists in sync.
const KNOWN_US_TRUST_PATHS = [
  "computed.usTax.filingStatus", "computed.usTax.taxableIncomeUsd",
  "computed.ftc.us.taxableIncomeUsd", "ftcReport.direction_us_claims_india"
];

// ---- unconditional (applies to every profile, regardless of shape) ------
// Mirrors run-fuzz.js's own KNOWN_ALWAYS_DIVERGENT_PATHS — see that file's
// header for the full per-entry writeup (GILTI/CFC quantification the
// frozen engine never modeled at all, capital-gains special rates, NRA
// Article 21(2) fields, the §904 basket-split FTC work). Kept as a
// path-prefix list (not blanket DAG_ONLY_KEYS entries) for the entries whose
// leaf name isn't safely unique codebase-wide (nra.standardDeductionUsd/
// itemizedDeductionUsd/article212Eligible/article212AmbiguousJ1 collide with
// unrelated same-named fields elsewhere — findings-batch5-nodes.js's
// "no income tax" finding and the state-tax report rows both also carry a
// standardDeductionUsd, confirmed by grep — so excluding that NAME
// everywhere would mask a real divergence in either of those, not just the
// NRA path).
const KNOWN_ALWAYS_DIVERGENT_PATHS = [
  "computed.usTax.nra.standardDeductionUsd", "computed.usTax.nra.itemizedDeductionUsd",
  "computed.usTax.nra.article212Eligible", "computed.usTax.nra.article212AmbiguousJ1",
  "model.assets.businessEntities", "computed.reconciliation.rows",
  "computed.ftc.us", "computed.ftc.netUnrelievedDoubleTaxUsd",
  "computed.headline.netUnrelievedDoubleTaxUsd", "computed.headline.combinedTaxBeforeReliefUsd",
  "summary.netDoubleTaxUsd", "findings[ftc_gap]", "findings[ftc_available]", "findings[underpayment_2210]",
  "ftcReport.direction_us_claims_india", "ftcReport.headlineNetDoubleTaxUsd",
  // Pure introspection field (like checksRegistry) with no engine equivalent
  // at all — present on EVERY profile regardless of whether an override
  // fired, so it's always known, not gated on any detector below.
  "model.income.india.salaryDetail"
];

// India §44BB/§44BBB foreign-company presumptive-income scheme (gap tracker
// IN-26, docs/GAP_TRACKER.md, fully shipped 25 Jul 2026): the frozen engine
// silently computed a s.44BB/s.44BBB business entry as Regular Books instead
// of the correct flat 10%-of-receipts presumptive figure — a real amount fix
// whose cascade (India tax total, headline, apportionment, FTC) is too wide
// to enumerate leaf-by-leaf, same shape as the AOP/Trust and salary-
// exemption fixes above. NOT part of run-fuzz.js's own allowlist apparatus
// (the fuzzer's random profile generator never emits a presumptive_scheme:
// "s44BB"/"s44BBB" business entry), so it wasn't caught by that file's own
// ~70k-iteration run — surfaced here instead by running this same allowlist
// discipline against the real fixtures test-adapter.mjs/test-shadow.mjs
// cover, specifically foreign_holdco_poem_india. Detected off the DAG's own
// businessEntities calcTrace text (the one structural signal already exposed
// on the compared surface — see assets-nodes.js's own s.44BB/44BBB trace
// branch) rather than the raw profile, so this needs no extra profile
// plumbing the way the FEIE detectors below do.
function isIndiaPresumptiveForeignSchemeProfile(dag) {
  const entities = dag && dag.model && dag.model.assets && dag.model.assets.businessEntities;
  if (!Array.isArray(entities)) return false;
  return entities.some((e) => {
    const f = e && e.calcTrace && e.calcTrace.formula;
    return typeof f === "string" && f.indexOf("Presumptive income under s.44BB") === 0;
  });
}
const KNOWN_INDIA_PRESUMPTIVE_FOREIGN_SCHEME_PATHS = [
  "model.income.india", "computed.indiaTax", "computed.ftc", "computed.headline",
  "computed.reconciliation", "computed.apportionment", "taxComputation.india",
  "ftcReport", "withholding", "monitoring",
  "summary.indiaTaxUsd", "summary.totalIncomeUsd", "summary.netDoubleTaxUsd",
  "summary.healthScore", "summary.counts", "documents", "scopeNotes", "returnForms"
];

// Static values mirrored from prototypes/graph-pilot/constants.js's
// CONST.TAX.US.QBI_THRESHOLD / CONST.TAX.INDIA.REBATE_87A_NEW/OLD — this
// file has no import of the engine's constants module (it stays pure/
// framework-agnostic so it can run unchanged in the browser), so these are
// duplicated verbatim rather than imported. Keep in sync if either changes.
const CONST_QBI_THRESHOLD = { single: 201750, mfj: 403500, mfs: 201750, hoh: 201750 };
const CONST_REBATE_87A_NEW = { incomeCap: 1200000, maxRebate: 60000 };
const CONST_REBATE_87A_OLD = { incomeCap: 500000, maxRebate: 12500 };

// §199A QBI wage/UBIA limitation (task #42): a PERMANENT, structural
// divergence — the frozen engine never implements the wage/UBIA cap at all.
// Same detector shape as run-fuzz.js's own isQbiWageLimitDivergent, reading
// the DAG's own already-computed usTax rather than re-deriving the
// threshold test (SYS-1-class avoidance, per that file's own comment).
function isQbiWageLimitDivergent(dag) {
  const inc = dag.model.income && dag.model.income.us, usTax = dag.computed.usTax;
  if (!inc || !usTax || usTax.isEntity || usTax.isNra) return false;
  if (!(inc.qbiIncomeUsd > 0)) return false;
  const status = usTax.filingStatus;
  const thr = (CONST_QBI_THRESHOLD[status] !== undefined ? CONST_QBI_THRESHOLD[status] : CONST_QBI_THRESHOLD.single);
  const taxableBeforeQbi = (usTax.taxableIncomeUsd || 0) + (usTax.qbiDeductionUsd || 0);
  return taxableBeforeQbi > thr;
}
const KNOWN_QBI_WAGE_LIMIT_DIVERGENT_PATHS = [
  "computed.usTax.qbiDeductionUsd", "computed.usTax.taxableIncomeUsd", "computed.usTax.incomeTaxUsd",
  "computed.usTax.totalTaxBeforeFtcUsd", "computed.usTax.ordinaryTaxUsd", "computed.usTax.preferentialTaxUsd",
  "computed.usTax.ordinaryTaxableUsd", "computed.usTax.ordinaryBracketBreakdown", "computed.usTax.amtDetail",
  "computed.usTax.amtUsd", "computed.usTax.creditsUsd", "computed.usTax.ctcDetail",
  "computed.ftc.us", "computed.ftc.india", "computed.ftc.netUnrelievedDoubleTaxUsd",
  "computed.headline.combinedTaxBeforeReliefUsd", "computed.headline.usTaxUsd", "computed.headline.netUnrelievedDoubleTaxUsd",
  "taxComputation.us", "ftcReport", "summary.usTaxUsd", "summary.netDoubleTaxUsd"
];
// §25B Saver's Credit (task #44 follow-up): a nonzero credit changes
// otherCreditsUsd/creditsUsd, which cascade downstream — same shape as the
// QBI wage/UBIA limit above.
function isSaversCreditDivergent(dag) {
  const usTax = dag.computed.usTax;
  return !!(usTax && !usTax.isEntity && !usTax.isNra && usTax.saversCreditUsd > 0);
}
const KNOWN_SAVERS_CREDIT_DIVERGENT_PATHS = [
  "computed.usTax.otherCreditsUsd", "computed.usTax.creditsUsd", "computed.usTax.ctcDetail",
  "computed.usTax.totalTaxBeforeFtcUsd",
  "computed.ftc.us", "computed.ftc.netUnrelievedDoubleTaxUsd",
  "computed.headline.usTaxUsd", "computed.headline.combinedTaxBeforeReliefUsd", "computed.headline.netUnrelievedDoubleTaxUsd",
  "taxComputation.us", "ftcReport", "summary.usTaxUsd", "summary.netDoubleTaxUsd"
];

// Step 7 (FEIE) field-completeness audit: foreign_earned_income.
// foreign_earned_income_usd was never folded into model.income.us.
// foreignWages by either the frozen engine OR the DAG until aggregateus
// income-nodes.js's fix (max() against the foreign_wages[] rows total) — a
// deliberate, documented improvement beyond the frozen (buggy) reference.
// These three need the RAW profile (foreign_earned_income_usd/foreign_wages
// rows aren't retained anywhere in the assembled analyze()-shaped result),
// so compareSurface threads its own third `profile` argument down to these
// — see that function's own comment for why.
function feieForeignWagesRowsTotal(us) {
  const rows = (us && us.income_foreign_source && us.income_foreign_source.foreign_wages) || [];
  let total = 0;
  rows.forEach((w) => { total += Number(w.gross_wages_usd || w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd) || 0; });
  return total;
}
function isFeieWagesDivergentProfile(profile) {
  if (!profile) return false;
  const us = profile.us || {};
  const feieUsd = Number(us.foreign_earned_income && us.foreign_earned_income.foreign_earned_income_usd) || 0;
  return feieUsd > feieForeignWagesRowsTotal(us);
}
const KNOWN_FEIE_WAGES_DIVERGENT_PATHS = [
  "model.income.us", "computed.usTax", "computed.headline", "computed.ftc", "computed.reconciliation",
  "computed.apportionment", "computed.limits", "taxComputation", "ftcReport", "documents", "returnForms",
  "withholding", "scopeNotes", "summary", "monitoring"
];
// FEIE bona-fide-residence eligibility (docs/GAP_TRACKER.md, 29 Jul 2026):
// the frozen engine grants the test ONLY off a legacy boolean nothing in the
// live UI has ever set, denying FEIE for essentially every real bona-fide-
// residence claimant. Reuses KNOWN_FEIE_WAGES_DIVERGENT_PATHS — same
// wholesale-block cascade shape.
function isFeieBonaFideProxyDivergentProfile(profile) {
  if (!profile) return false;
  const f = (profile.us && profile.us.foreign_earned_income) || {};
  return f.claims_feie === true && f.qualification_test === "bona_fide_residence" &&
    !!f.bona_fide_residence_start_date && f.bona_fide_residence !== true;
}
// §911(d)(6) FEIE "stacking rule" + Schedule 8812 categorical ACTC bar
// (FEIE legal-correctness review, commit 8255a57): gated on the DAG's own
// already-computed feieAppliedUsd — the exact "did the exclusion actually
// apply" signal both fixes share. Also reuses KNOWN_FEIE_WAGES_DIVERGENT_
// PATHS. Unlike the two detectors above, this one only needs the DAG result
// (feieAppliedUsd/feieHousingAppliedUsd are both DAG_ONLY_KEYS-excluded
// leaves already surfaced on computed.usTax.feie/computed.usTax).
function isFeieStackingRuleDivergentProfile(dag) {
  const t = dag && dag.computed && dag.computed.usTax;
  return !!t && (((t.feie && t.feie.appliedUsd) || 0) + (t.feieHousingAppliedUsd || 0)) > 0;
}
// §199A QBI wage/UBIA limitation (item S) — a SECOND, narrower detector than
// isQbiWageLimitDivergent above: gated on the ENGINE's own already-computed
// qbiDeductionUsd/taxableIncomeUsd (a fuzzed-profile-shape proxy run-fuzz.js
// itself uses, since none of the 12 real fixtures carry K-1 QBI wage/UBIA
// data — item S's own note). Deliberately conservative (lowest QBI_THRESHOLD
// across filing statuses) — same over-excuse-rather-than-under-excuse
// tradeoff KNOWN_FEIE_WAGES_DIVERGENT_PATHS already makes.
function isQbiWageUbiaLimitDivergentProfile(real) {
  const t = real && real.computed && real.computed.usTax;
  if (!t) return false;
  const qbiThresholdFloor = 201750;
  const taxableBeforeQbi = (t.taxableIncomeUsd || 0) + (t.qbiDeductionUsd || 0);
  return (t.qbiDeductionUsd || 0) > 0 && taxableBeforeQbi > qbiThresholdFloor;
}
const KNOWN_QBI_WAGE_UBIA_DIVERGENT_PATHS = [
  "computed.usTax", "computed.headline", "computed.ftc", "computed.reconciliation",
  "computed.apportionment", "computed.indiaTax", "computed.limits", "taxComputation",
  "ftcReport", "documents", "returnForms", "withholding", "scopeNotes", "summary", "monitoring"
];
// India §87A rebate marginal relief (in1_v3.py/in1-nodes-v3.js, fixed 29 Jul
// 2026): rebateInrV3 used to test eligibility against totalNormalInr (slab
// income only) with no marginal relief at the cliff; fixed to test against
// totalIncomeInrV3 with real marginal relief. Recomputed EXACTLY from the
// DAG's own already-computed intermediates (_debug* fields — see
// dag-adapter.js's own RESOLVE_LIST addition) rather than an income-band
// approximation, same reasoning as run-fuzz.js's own comment on this
// detector.
function isIndiaRebateMarginalReliefDivergentProfile(dag) {
  if (!dag || !dag._debugIsIndividualV3 || dag._debugIsNRV3) return false;
  const cap = dag._debugIsNew ? CONST_REBATE_87A_NEW : CONST_REBATE_87A_OLD;
  const totalNormalInr = dag._debugTotalNormalInr || 0;
  const slabTaxInr = dag._debugSlabTaxInr || 0;
  const oldRebate = totalNormalInr <= cap.incomeCap ? Math.min(slabTaxInr, cap.maxRebate) : 0;
  return Math.abs(oldRebate - (dag._debugRebateInrV3 || 0)) > 1;
}
const KNOWN_INDIA_REBATE_MARGINAL_RELIEF_DIVERGENT_PATHS = [
  "computed.indiaTax", "computed.ftc", "computed.headline", "taxComputation.india", "findings",
  "summary", "monitoring", "ftcReport"
];
// limits-nodes.js's Form 8938 "abroad" threshold selection has no entity-
// type gate — a non-individual entity that happens to carry FEIE-shaped
// fields can pick up the higher living-abroad threshold. Narrow, only
// reachable via the fuzzer's cross-profile field merging in practice, kept
// here anyway for parity with run-fuzz.js.
function isFeieEntityGateMissingProfile(dag, profile) {
  const kind = dag.model.entity && dag.model.entity.usKind;
  const isIndividualPath = !kind || kind === "individual";
  const claimsFeie = !!(profile && profile.us && profile.us.foreign_earned_income && profile.us.foreign_earned_income.claims_feie);
  return !isIndividualPath && claimsFeie;
}
const KNOWN_FEIE_ENTITY_GATE_DIVERGENT_PATHS = ["documents"];
// India salary exemptions (funding-audit follow-up): the engine's
// normalize.js only ever reads salary.taxable_salary_inr or falls back to
// raw gross_salary_inr with ZERO exemptions; aggregateindiaincome-nodes.js's
// salaryIncomeComputation applies the real s.16(ia)/s.10(14)/s.10(13A) etc.
// exemptions — a real amount fix, same blast radius as the AOP/Trust fix.
function isIndiaSalaryExemptionProfile(dag) {
  const sd = dag.model.income && dag.model.income.india && dag.model.income.india.salaryDetail;
  if (!sd) return false;
  return sd.overridden === false || sd.taxableSalaryInr === 0;
}
const KNOWN_INDIA_SALARY_EXEMPTION_DIVERGENT_PATHS = [
  "model.income.india", "computed.indiaTax", "computed.ftc", "computed.headline", "computed.reconciliation",
  "computed.apportionment", "taxComputation.india", "ftcReport", "withholding", "monitoring",
  "summary.indiaTaxUsd", "summary.totalIncomeUsd", "summary.netDoubleTaxUsd", "summary.healthScore", "summary.counts",
  "documents", "scopeNotes", "returnForms"
];

// GILTI/Subpart F inclusion reaching an INDIVIDUAL CFC-owner's own taxable
// income (Phase 7, XB-14) — NOT part of run-fuzz.js's own allowlist
// apparatus (its random fuzzer profiles essentially never generate a ≥10%-
// owned foreign-corp individual with real CFC financial data in the exact
// shape that cascades this way), surfaced instead by running this same
// discipline against the real fixtures, specifically founder_indian_company
// ("US resident owning an Indian Pvt Ltd... triggers GILTI/Subpart-F").
// KNOWN_ALWAYS_DIVERGENT_PATHS above already excuses the CFC detail leaves
// themselves (gilti962TaxUsd/cfcDetail/cfcNetTaxUsd — all DAG_ONLY_KEYS now
// — plus cfcNonElectedInclusionUs/cfcElectedPool/cfcPerEntityTrace), but for
// an individual (not an entity) that inclusion also folds directly into
// ordinary taxable income (agiUsd/incomeTaxUsd/totalTaxBeforeFtcUsd itself
// differs, confirmed by direct reproduction — the frozen engine never
// modeled GILTI/Subpart F quantification for ANY taxpayer shape), so the
// cascade needs the same wholesale-block treatment as the FEIE-wages family.
function isCfcInclusionDivergentProfile(dag) {
  const inc = dag && dag.model && dag.model.income && dag.model.income.us;
  if (!inc) return false;
  const nonElected = (inc.cfcNonElectedInclusionUs && inc.cfcNonElectedInclusionUs.usd) || 0;
  const elected = inc.cfcElectedPool || {};
  const electedAmt = (elected.taxableBaseUsd || 0) + (elected.subpartFUsd || 0);
  return nonElected > 0 || electedAmt > 0;
}
const KNOWN_CFC_INCLUSION_DIVERGENT_PATHS = [
  "model.income.us", "computed.usTax", "computed.headline", "computed.ftc", "computed.reconciliation",
  "computed.apportionment", "computed.limits", "taxComputation", "ftcReport", "documents", "returnForms",
  "withholding", "scopeNotes", "summary", "monitoring"
];

// India s.44AD(4) presumptive lock-in mandatory tax-audit trigger (gap
// tracker IN-6, "lock-in depth", fully shipped 25 Jul 2026): when a
// taxpayer is locked out of re-electing s.44AD after a prior exit,
// report-batch1-nodes.js's form_3cb_3cd (tax-audit) trigger forces the
// document regardless of the usual ₹1cr/₹10cr turnover threshold — the
// frozen engine has no concept of the lock-in at all. Same "real fixture-
// only, not in run-fuzz.js's own corpus" class as the two detectors above —
// surfaced by india_only_ca_client, docs/GAP_TRACKER.md's own "next
// follow-up" note names this exact gap. Detected off the DAG's own
// presumptive_lockin_active_india finding (a KNOWN_EXTRA_FINDING_IDS
// member already) rather than re-deriving the s44AD_last_exit_ay date math
// here — same SYS-1-class avoidance as the other detectors in this file.
function isIndiaPresumptiveLockinActiveProfile(dag) {
  const findings = dag && dag.findings;
  return Array.isArray(findings) && findings.some((f) => f.id === "presumptive_lockin_active_india");
}
const KNOWN_INDIA_PRESUMPTIVE_LOCKIN_DIVERGENT_PATHS = ["documents", "summary.requiredDocs", "monitoring.calendar"];

// Fields that are MECHANICALLY DERIVED from findings[] (severity counts,
// health score, the alerts feed) — only excusable as "known" when the SAME
// comparison also has a catalogued findings-level ID exception (the
// underpayment_2210/ftc_gap/ftc_available/niit_medicare_not_creditable/
// KNOWN_CONTENT_DIVERGENCE_FINDING_IDS cases in diffFindings below); if one
// of these differs with NO accompanying catalogued findings issue, that's
// new and real. Mirrors run-fuzz.js's own CASCADE_ONLY_PATHS exactly —
// deliberately NOT gated on the wholesale detector-driven excuses above
// (feieWagesDivergent etc.), only on the narrower ID-level exceptions, same
// as that file.
const CASCADE_ONLY_PATHS = ["summary.healthScore", "summary.counts", "monitoring.health", "monitoring.alerts"];

// Schedule C trace text divergence (docs/GAP_TRACKER.md item R, home-office/
// vehicle-mileage deduction, 27 Jul 2026): both hardcoded, UNCONDITIONAL
// literals that diverge for every Schedule C business entity regardless of
// whether any mileage/home-office data is on file. Handled as a value-level
// normalization (mutating shallow copies before diffing) rather than folded
// into KNOWN_ALWAYS_DIVERGENT_PATHS's "model.assets.businessEntities" entry
// above — that entry already happens to cover it wholesale today, but this
// stays as a narrower, independent normalization for parity with
// run-fuzz.js (whose own comment explains why: a prefix broad enough to
// catch every array index would also excuse a REAL numeric bug anywhere
// else in that array, and at the time this fix landed no such wholesale
// exclusion existed yet).
const OLD_SCHED_C_TRACE = "Schedule C: gross receipts less returns/COGS, plus other income, less expenses, less asset depreciation (§179 / 100% bonus, permanent under OBBBA / MACRS — computed from each asset's own class and placed-in-service date, not Layer 1's own first-year-only preview). Home-office isn't netted yet (Phase 1).";
const NEW_SCHED_C_TRACE = "Schedule C: gross receipts less returns/COGS, plus other income, less expenses, less vehicle-mileage/home-office deductions, less asset depreciation (§179 / 100% bonus, permanent under OBBBA / MACRS — computed from each asset's own class and placed-in-service date, not Layer 1's own first-year-only preview).";
function normalizeKnownScheduleCTraceDivergence(eng, dag) {
  const re = eng && eng.model && eng.model.assets && eng.model.assets.businessEntities;
  const de = dag && dag.model && dag.model.assets && dag.model.assets.businessEntities;
  if (!Array.isArray(re) || !Array.isArray(de)) return { eng, dag };
  const n = Math.min(re.length, de.length);
  const newRe = re.slice(), newDe = de.slice();
  let changed = false;
  for (let i = 0; i < n; i++) {
    const rf = re[i] && re[i].calcTrace && re[i].calcTrace.formula;
    const df = de[i] && de[i].calcTrace && de[i].calcTrace.formula;
    if (rf === OLD_SCHED_C_TRACE && df === NEW_SCHED_C_TRACE) {
      changed = true;
      const norm = "(Schedule C trace text — see docs/GAP_TRACKER.md item R for the known engine/DAG wording difference)";
      newRe[i] = { ...re[i], calcTrace: { ...re[i].calcTrace, formula: norm } };
      newDe[i] = { ...de[i], calcTrace: { ...de[i].calcTrace, formula: norm } };
    }
  }
  if (!changed) return { eng, dag };
  return {
    eng: { ...eng, model: { ...eng.model, assets: { ...eng.model.assets, businessEntities: newRe } } },
    dag: { ...dag, model: { ...dag.model, assets: { ...dag.model.assets, businessEntities: newDe } } }
  };
}

function pathMatchesKnown(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix + ".") || path.startsWith(prefix + "["));
}

// Relative+absolute float tolerance — the engine and DAG do the same
// arithmetic but occasionally in a different associative order (e.g. summing
// a quarter-merged slice), so bit-exact equality would flag noise, not bugs.
const ABS_EPS = 1e-6;
const REL_EPS = 1e-9;

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function describe(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array[" + v.length + "]";
  if (v instanceof Date) return "Date(" + (isNaN(+v) ? "invalid" : v.toISOString()) + ")";
  if (typeof v === "object") return "object{" + Object.keys(v).length + "}";
  if (typeof v === "string") return JSON.stringify(v.length > 60 ? v.slice(0, 57) + "…" : v);
  return String(v);
}

/* Recursively collect every point where engine and DAG disagree. Each entry:
 * { path, engine, dag } with values already reduced to a compact printable.
 * directional=true compares only keys the DAG (dag) side actually carries —
 * engine-only object keys are skipped (used for the assembled model/computed;
 * see DIRECTIONAL_SURFACE). It does NOT relax array-length or value checks. */
export function diff(path, eng, dag, out, directional) {
  // Dates — compare by epoch; two both-invalid Dates agree (a degenerate
  // base year can make BOTH sides Invalid Date, which is agreement, not a bug —
  // the fuzzer hit exactly this).
  if (eng instanceof Date || dag instanceof Date) {
    const et = +new Date(eng), dt = +new Date(dag);
    if (!(isNaN(et) && isNaN(dt)) && et !== dt) out.push({ path, engine: describe(eng), dag: describe(dag) });
    return;
  }
  if (typeof eng === "number" && typeof dag === "number") {
    if (isNaN(eng) && isNaN(dag)) return;
    const tol = ABS_EPS + REL_EPS * Math.max(Math.abs(eng), Math.abs(dag));
    if (!(Math.abs(eng - dag) <= tol)) out.push({ path, engine: eng, dag: dag });
    return;
  }
  if (eng === dag) return;
  // undefined ≡ null: both mean "no value". The engine and the adapter
  // legitimately differ on which they use for an absent field (e.g. the
  // adapter coerces computed.indiaTax.s115a to null where the engine leaves it
  // undefined). This relaxes ONLY nullish-vs-nullish; null-vs-0, null-vs-object
  // and every other pairing still diverges.
  if (eng == null && dag == null) return;
  if (eng == null || dag == null || typeof eng !== "object" || typeof dag !== "object") {
    out.push({ path, engine: describe(eng), dag: describe(dag) });
    return;
  }
  const ea = Array.isArray(eng), da = Array.isArray(dag);
  if (ea || da) {
    if (!ea || !da) { out.push({ path, engine: describe(eng), dag: describe(dag) }); return; }
    if (eng.length !== dag.length) out.push({ path: path + ".length", engine: eng.length, dag: dag.length });
    const n = Math.min(eng.length, dag.length);
    for (let i = 0; i < n; i++) diff(path + "[" + i + "]", eng[i], dag[i], out, directional);
    return;
  }
  // directional: walk only keys the DAG produced; symmetric: the union.
  const keys = directional ? Object.keys(dag) : new Set([...Object.keys(eng), ...Object.keys(dag)]);
  for (const k of keys) {
    if (DAG_ONLY_KEYS.has(k)) continue;
    diff(path ? path + "." + k : k, eng[k], dag[k], out, directional);
  }
}

/* Compare the two analyze()-shaped results: symmetric over the product-surface
 * outputs, directional over the assembled model/computed. Returns [] when they
 * agree (within float tolerance).
 *
 * `profile` (optional, third arg): the raw {router,india,us} the two results
 * were computed FROM — needed only by the FEIE detectors below (isFeieWages
 * DivergentProfile/isFeieBonaFideProxyDivergentProfile/isFeieEntityGate
 * MissingProfile), which key off raw user-input fields
 * (foreign_earned_income.foreign_earned_income_usd, income_foreign_source.
 * foreign_wages[] rows, claims_feie) that aren't retained anywhere in the
 * assembled analyze()-shaped result itself. Callers that don't have the
 * profile handy (or are comparing two already-assembled results with no
 * profile in scope) can omit it — those three detectors just never fire,
 * same as before this parameter existed, at the cost of not excusing that
 * one specific cascade for such a caller. */
export function compareSurface(engineResult, dagResult, profile) {
  const entity = engineResult && engineResult.model && engineResult.model.entity;
  const usEntity = !!(entity && ["ccorp", "scorp", "partnership", "trust"].includes(entity.usKind));
  const usTrust = !!(entity && entity.usKind === "trust");
  // India company/firm: narrow divergence (only the trace's "₹NaN" display
  // bug). AOP/Trust: a WIDER divergence (a real amount bug the engine never
  // had a fix for) — kept as separate flags/allowlists, not merged, so the
  // narrow company/firm case never accidentally inherits the AOP/Trust
  // cascade's much larger excuse list.
  const indiaEntity = !!(entity && (entity.indiaIsCompany || entity.indiaIsFirm));
  // indiaIsAop/indiaIsTrust exist ONLY on the DAG's model.entity (that's
  // exactly why they're in DAG_ONLY_KEYS above) — the engine has no such
  // fields at all, so reading them off engineResult would always read
  // undefined and this gate would never fire. Read the DAG's own entity
  // classification instead; it's the one side that actually carries it.
  const dagEntity = dagResult && dagResult.model && dagResult.model.entity;
  const indiaAopOrTrust = !!(dagEntity && (dagEntity.indiaIsAop || dagEntity.indiaIsTrust));
  const nra = !!(engineResult && engineResult.computed && engineResult.computed.usTax && engineResult.computed.usTax.isNra === true);

  let eng = engineResult, dag = dagResult;

  // form_nj1040 (docs/GAP_TRACKER.md section H.7, 21 Jul 2026) and form_8858
  // (section H.13, 22 Jul 2026): new DAG-only documents, no engine
  // equivalent for either — stripped from both the documents list and the
  // calendar's bundled docIds, same convention as run-fuzz.js's assembleDag().
  const DAG_ONLY_DOC_IDS = ["form_nj1040", "form_8858", "form_3520a", "form_29b", "form_10iea", "form_10ic", "form_10id", "schedule_m1_m2", "k1_issuance", "form_8880", "form_w7", "form_27d"];
  if (Array.isArray(dag && dag.documents)) {
    const droppedRequiredCount = dag.documents.filter((x) => DAG_ONLY_DOC_IDS.includes(x.id) && x.required).length;
    dag = { ...dag, documents: dag.documents.filter((x) => !DAG_ONLY_DOC_IDS.includes(x.id)) };
    // summary.requiredDocs is a DAG-computed count baked in report-batch5-
    // nodes.js from the UN-stripped buildDocumentsResult — adjust it the
    // same amount the documents-array strip above just removed, so this
    // known, deliberate divergence doesn't also show up as a fake mismatch
    // in the derived count.
    if (droppedRequiredCount > 0 && dag.summary && typeof dag.summary.requiredDocs === "number") {
      dag = { ...dag, summary: { ...dag.summary, requiredDocs: dag.summary.requiredDocs - droppedRequiredCount } };
    }
  }
  if (dag && dag.monitoring && dag.monitoring.calendar) {
    const stripNj1040 = (row) => Array.isArray(row.docIds) ? { ...row, docIds: row.docIds.filter((id) => !DAG_ONLY_DOC_IDS.includes(id)) } : row;
    dag = {
      ...dag,
      monitoring: {
        ...dag.monitoring,
        calendar: {
          ...dag.monitoring.calendar,
          all: dag.monitoring.calendar.all.map(stripNj1040),
          upcoming: dag.monitoring.calendar.upcoming.map(stripNj1040),
          next: dag.monitoring.calendar.next ? stripNj1040(dag.monitoring.calendar.next) : dag.monitoring.calendar.next
        }
      }
    };
  }

  // Schedule C trace text (item R) — value-level normalization, applied to
  // shallow copies before any diffing starts (mostly redundant with
  // KNOWN_ALWAYS_DIVERGENT_PATHS's own "model.assets.businessEntities" whole-
  // array exclusion below, kept anyway for parity with run-fuzz.js — see
  // that function's own comment).
  ({ eng, dag } = normalizeKnownScheduleCTraceDivergence(eng, dag));

  let raw = [];
  const findingsDiffs = [];
  const hadKnownFindingsIssue = diffFindings(eng.findings, dag.findings, usEntity, findingsDiffs);
  for (const p of SYMMETRIC_SURFACE) diff(p, getPath(eng, p), getPath(dag, p), raw, false);
  for (const p of DIRECTIONAL_SURFACE) diff(p, getPath(eng, p), getPath(dag, p), raw, true);

  // Conditional divergence detectors (section D + the wholesale-cascade
  // family below it) — mirrors run-fuzz.js's own compareOne wiring exactly.
  const qbiWageLimitDivergent = isQbiWageLimitDivergent(dag);
  const saversCreditDivergent = isSaversCreditDivergent(dag);
  const feieWagesDivergent = isFeieWagesDivergentProfile(profile);
  const feieBonaFideProxyDivergent = isFeieBonaFideProxyDivergentProfile(profile);
  const feieStackingRuleDivergent = isFeieStackingRuleDivergentProfile(dag);
  const feieEntityGateMissing = isFeieEntityGateMissingProfile(dag, profile);
  const qbiWageUbiaDivergent = isQbiWageUbiaLimitDivergentProfile(eng);
  const indiaRebateDivergent = isIndiaRebateMarginalReliefDivergentProfile(dag);
  const indiaSalaryExemption = isIndiaSalaryExemptionProfile(dag);
  const indiaPresumptiveForeignScheme = isIndiaPresumptiveForeignSchemeProfile(dag);
  const cfcInclusionDivergent = isCfcInclusionDivergentProfile(dag);
  const indiaPresumptiveLockinActive = isIndiaPresumptiveLockinActiveProfile(dag);

  // Findings-level diffs cascade from the same wholesale-shaped fixes as the
  // rest of the product surface (a different QBI/FEIE/rebate/salary amount
  // changes which $-amount-bearing findings fire) — reclassify wholesale,
  // exactly like run-fuzz.js's own findingsExcused gate.
  const findingsExcused = indiaAopOrTrust || feieWagesDivergent || feieBonaFideProxyDivergent || feieStackingRuleDivergent ||
    qbiWageLimitDivergent || qbiWageUbiaDivergent || saversCreditDivergent || indiaRebateDivergent ||
    indiaSalaryExemption || indiaPresumptiveForeignScheme || cfcInclusionDivergent || indiaPresumptiveLockinActive;
  if (!findingsExcused) raw.push(...findingsDiffs);

  // CASCADE_ONLY_PATHS — summary.counts/healthScore, monitoring.health/
  // alerts — excusable only alongside a catalogued findings-level ID
  // exception in THIS same comparison (hadKnownFindingsIssue), never on the
  // wholesale findingsExcused flag alone. These sub-paths already got swept
  // up (unconditionally) by SYMMETRIC_SURFACE's own wholesale "summary"/
  // "monitoring" compare above — strip that unconditional copy back out and
  // re-diff them through the SAME gate run-fuzz.js's own CASCADE_ONLY_PATHS
  // uses, so a genuinely new cascade divergence still surfaces but a
  // findings-driven one doesn't (run-fuzz.js never has this double-diffing
  // problem in the first place: its own field list only ever names the
  // NON-cascade summary/monitoring sub-fields individually, never the whole
  // objects).
  raw = raw.filter((d) => !pathMatchesKnown(d.path, CASCADE_ONLY_PATHS));
  if (!hadKnownFindingsIssue) {
    for (const p of CASCADE_ONLY_PATHS) diff(p, getPath(eng, p), getPath(dag, p), raw, false);
  }

  const allowedPaths = []
    .concat(KNOWN_ALWAYS_DIVERGENT_PATHS)
    .concat(usEntity ? KNOWN_US_ENTITY_PATHS : [])
    .concat(usTrust ? KNOWN_US_TRUST_PATHS : [])
    .concat(indiaEntity ? KNOWN_INDIA_ENTITY_PATHS : [])
    .concat(indiaAopOrTrust ? KNOWN_INDIA_AOP_TRUST_PATHS : [])
    .concat(nra ? KNOWN_NRA_PATHS : [])
    .concat(feieWagesDivergent ? KNOWN_FEIE_WAGES_DIVERGENT_PATHS : [])
    .concat(feieBonaFideProxyDivergent ? KNOWN_FEIE_WAGES_DIVERGENT_PATHS : [])
    .concat(feieStackingRuleDivergent ? KNOWN_FEIE_WAGES_DIVERGENT_PATHS : [])
    .concat(feieEntityGateMissing ? KNOWN_FEIE_ENTITY_GATE_DIVERGENT_PATHS : [])
    .concat(qbiWageLimitDivergent ? KNOWN_QBI_WAGE_LIMIT_DIVERGENT_PATHS : [])
    .concat(qbiWageUbiaDivergent ? KNOWN_QBI_WAGE_UBIA_DIVERGENT_PATHS : [])
    .concat(saversCreditDivergent ? KNOWN_SAVERS_CREDIT_DIVERGENT_PATHS : [])
    .concat(indiaRebateDivergent ? KNOWN_INDIA_REBATE_MARGINAL_RELIEF_DIVERGENT_PATHS : [])
    .concat(indiaSalaryExemption ? KNOWN_INDIA_SALARY_EXEMPTION_DIVERGENT_PATHS : [])
    .concat(indiaPresumptiveForeignScheme ? KNOWN_INDIA_PRESUMPTIVE_FOREIGN_SCHEME_PATHS : [])
    .concat(cfcInclusionDivergent ? KNOWN_CFC_INCLUSION_DIVERGENT_PATHS : [])
    .concat(indiaPresumptiveLockinActive ? KNOWN_INDIA_PRESUMPTIVE_LOCKIN_DIVERGENT_PATHS : []);
  if (!allowedPaths.length) return raw;
  return raw.filter((d) => !pathMatchesKnown(d.path, allowedPaths));
}

// Distinguishes which two implementations a comparison ran between — plan
// §7's own "tagged source_pair: engine_vs_py_dag" language. compareSurface()
// itself needs no change to serve a second pair: it already takes any two
// analyze()-shaped results, whichever produced them (the JS DAG and the
// Python DAG are independent ports of the exact same source and share the
// exact same catalogued divergences from the engine — confirmed directly,
// prototypes/graph-pilot/run-js-dag-vs-py-dag.js — so every allowlist above
// applies unchanged to either pair).
export const SOURCE_PAIRS = {
  ENGINE_VS_JS_DAG: "engine_vs_js_dag",
  ENGINE_VS_PY_DAG: "engine_vs_py_dag"
};

// A stable signature for a set of divergences, so repeated loads of the same
// profile collapse to one logged event instead of growing the log unbounded.
// sourcePair is part of the key: an engine-vs-JS-DAG divergence and an
// otherwise-identical-looking engine-vs-Python-DAG one on the same profile
// are two distinct findings (different implementations), never collapsed
// into a single logged entry.
export function signature(sourcePair, source, divergences) {
  return sourcePair + "|" + source + "|" + divergences
    .map((d) => d.path + "=" + JSON.stringify(d.engine) + "/" + JSON.stringify(d.dag))
    .sort()
    .join(";");
}

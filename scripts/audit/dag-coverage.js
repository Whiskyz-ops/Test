"use strict";
/* ============================================================================
 * DAG coverage diff — engine/*.js  vs  prototypes/graph-pilot/*-nodes.js
 *
 * The mechanical companion to docs/DAG_MIGRATION_TRACKER.md (closes its own
 * SYS-2 row). Three independent comparisons, all derived from source, none
 * from the tracker's prose:
 *
 *   1. FIELD-PATH DIFF — every quoted safe(...) path and every snake_case
 *      property read in each engine function, checked against the token set
 *      of the DAG file(s) the tracker maps that function to. A function the
 *      tracker marks ✅ ported must have ZERO missing tokens — any hit there
 *      is an UNEXPECTED gap (either a real porting hole or a stale tracker
 *      row) and fails the run. Functions marked ❌/🔶/📝 are expected to
 *      miss; their full missing-path lists are printed as the definitive
 *      "everything in the engine but not in the DAG" inventory.
 *
 *   2. FINDING-ID DIFF — every add("id", ...) in conflicts.js vs the finding
 *      IDs the DAG actually implements.
 *
 *   3. NUMERIC-DRIFT CHECK — every significant numeric literal in the DAG's
 *      hand-copied constant tables, checked for membership in the engine's
 *      own numeric universe. The DAG does not import engine/constants.js
 *      (tracker SYS-1), so after any engine-side rate/threshold edit the
 *      DAG's stale copy stops matching and shows up here.
 *
 *   4. FUNCTION INVENTORY — any top-level engine function not present in
 *      this script's tracker mapping fails the run: new engine code cannot
 *      silently appear without the migration tracker hearing about it.
 *
 * Exit code 1 on: unexpected gaps in ✅ functions, untracked engine
 * functions, or numeric drift. Tracked gaps alone exit 0 (they're known).
 * Run: npm run audit:dag
 * ==========================================================================*/
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..", "..");
var resolveEngineFile = require("../engine-frozen.js").resolveEngineFile;

/* ---- tracker mapping: engine function -> { row, status, dagFiles } -------
 * status: "ported" (✅ — zero missing tokens expected), "boundary" (🔶),
 * "scoped-out" (📝), "missing" (❌), "util" (helpers with no tax logic).
 * dagFiles: which node files the port lives in ("*" = check against all —
 * used for non-ported rows so partial touches anywhere still count). */
var NODE_FILES = [
  "agg10-nodes.js", "aggregateindiaincome-nodes.js", "aggregateusincome-nodes.js", "apportionment-nodes.js", "assets-nodes.js",
  "crossbasis-nodes.js", "doubletax-nodes.js", "entitytax-nodes.js", "findings-nodes.js", "findings-batch2-nodes.js", "findings-batch3-nodes.js", "findings-batch4-nodes.js", "findings-batch5-nodes.js", "findings-batch6-nodes.js", "report-batch1-nodes.js", "report-batch2-nodes.js", "report-batch3-nodes.js", "report-batch4-nodes.js", "report-batch5-nodes.js", "report-batch6-nodes.js", "in1-nodes.js", "in1-nodes-v2.js", "in1-nodes-v3.js",
  "ftc-nodes.js", "india-full-nodes.js", "india-tax-combined-nodes.js", "itrform-nodes.js",
  "limits-nodes.js", "residency-nodes.js", "scope-nodes.js", "us1-nodes.js", "us5-nodes.js",
  "us-full-nodes.js", "ustax-full-nodes.js", "ustax-nodes.js", "xb7-nodes.js", "xborder-full-nodes.js"
];
function m(row, status, dagFiles, knownMissing) { return { row: row, status: status, dagFiles: dagFiles || ["*"], knownMissing: knownMissing || [] }; }
var MAP = {
  "normalize.js": {
    num: m("util", "util"), inrToUsd: m("util", "util"), usdToInr: m("util", "util"),
    moneyFromInr: m("util", "util"), moneyFromUsd: m("util", "util"), addMoney: m("util", "util"),
    zeroMoney: m("util", "util"), calc: m("util", "util"), source: m("util", "util"),
    safe: m("util", "util"), normalizeFilingStatus: m("util", "util"),
    /* Ported the OTHER direction from every other XBR-1 row here: written
     * first in residency-nodes.js (19 Jul 2026), then ported verbatim into
     * this engine (same date, same session) once the user asked for the
     * DAG's full residency derivation + consistency check in the engine
     * too. Structurally trivial 0/0 like resolveResidency/compute above —
     * both operate on already-normalized camelCase params (f.isIndianCompany,
     * f.days, cr.keyManagementLocation, etc.), no safe()/snake_case reads
     * of their own; the raw snake_case facts they ultimately depend on are
     * read separately, just above their call site in normalize(). */
    deriveCompanyPoem: m("XBR-1", "ported", ["residency-nodes.js"]),
    deriveIndiaDomesticStatus: m("XBR-1", "ported", ["residency-nodes.js"]),
    /* AGG-10 closed 19 Jul 2026: agg10-nodes.js derives model.entity/meta/
     * identity (+ the residency/companyResidency slices and computed.headline)
     * in-graph and re-points every remaining ctx.model/ctx.computed read in
     * the chain — incl. the four original finding graphs' v1-era boundaries
     * (in1/us1/us5/xb7) that report-batch5's merge had left un-repointed,
     * and a real merge-order clobber in report-batch4 that had silently
     * reverted the india-full boundary overrides for the report layers
     * (found by run-agg10.js's bare-ctx resolve — the first runner passing
     * NO model/computed at all; 1188/1188 across all 11 profiles).
     * loadRawStates itself (localStorage IO) has no graph analogue by
     * design — the graph takes raw form JSON as its input contract. */
    loadRawStates: m("AGG-10", "boundary"),
    indiaAnnualSlice: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js", "aggregateusincome-nodes.js"]),
    presumptiveCeilingInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    presumptiveResidencyEligible: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    isUnder180DaysAdditionInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeAssetBlockNormalDepreciationInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    additionalDepreciationEligibleInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeAssetBlockAdditionalDepreciationInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    aggregateEntryDepreciationInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeMsmeDisallowanceInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    aggregateEntryDisallowancesInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    usesRegularBooksInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeBusinessEntryNetProfitInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    computeGoodsVehiclePresumptiveInr: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    businessEntryIncomeTrace: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    /* AGG-1 knownMissing (found by this script's first run, 19 Jul 2026 —
     * see tracker AGG-1 Detail): originally three side-channel outputs the
     * income-total port skipped because run-aggregateindiaincome.js's 165
     * checks cover income figures, not metadata fields. holdingPeriodMismatches[]
     * closed (verified 179/179), then agricultural_income_inr closed
     * (agriculturalIncomeInrAgg, verified 200/200), then
     * unexplained_income_115BBE_inr closed same day (unexplained115bbeInrAgg,
     * verified 222/222 — s115bbe_unexplained_income's one real consumer,
     * CFL-6 batch 2). None remain. */
    aggregateIndiaIncome: m("AGG-1", "ported", ["aggregateindiaincome-nodes.js"]),
    s80eeaEeCapInr: m("AGG-2", "ported", ["in1-nodes-v3.js"]),
    aggregateIndiaDeductions: m("AGG-2", "ported", ["in1-nodes-v3.js"]),
    computeSelfEmploymentNetProfitUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    selfEmploymentNetProfitUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    selfEmploymentIncomeTrace: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    computeSelfEmploymentDepreciationPlan: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    assetRecoveryYearN: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    straightLineYear1FractionInr: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    computeAssetDepreciationUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    aggregateAssetDepreciationUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    k1PassiveIncomeUsd: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    aggregateUsIncome: m("AGG-3", "ported", ["aggregateusincome-nodes.js"]),
    aggregateUsDeductions: m("AGG-4", "ported", ["ustax-nodes.js"]),
    aggregateEquityComp: m("AGG-9", "ported", ["findings-batch5-nodes.js"]),
    /* AGG-5: batch 5 (findings-batch5-nodes.js) closed aggregatePeak only
     * (fbar_limit's own dependency); CFL-7 batch 1 (report-batch1-nodes.js)
     * closed the rest — the full per-account display array (bank name/
     * type/country), needed for buildDocuments' schedule_fa trigger. */
    aggregateAccounts: m("AGG-5", "ported", ["findings-batch5-nodes.js", "report-batch1-nodes.js"]),
    /* AGG-6 knownMissing: only the US-side total (form67_required's own
     * dependency) was ported. The India-side (advance tax by quarter,
     * TDS/TCS) and the US prior-year-tax safe-harbor figure have no DAG
     * consumer yet. */
    /* AGG-6: FULLY CLOSED 19 Jul 2026. Batch 5 (findings-batch5-nodes.js)
     * closed the US side (form67_required's own dependency); CFL-7 batch 1
     * (report-batch1-nodes.js) closed the India side (advance tax by
     * quarter, TDS/TCS — form_1116's trigger needed the India total). The
     * last recorded gap, prior_year_total_tax_usd (the Form 2210 100%/
     * 110%-of-prior-year safe-harbor figure), closed the same way —
     * additively exposed on taxesPaidUsResult, matching aggregateTaxesPaid's
     * own null-vs-0 distinction exactly. It already had a DAG consumer
     * (underpayment2210Finding, CFL-7 batch 5) via a separate raw leaf
     * (usPriorYearTaxUsdRaw, us1-nodes.js) — this closes the gap in
     * taxesPaidUsResult's own return shape, the thing AGG-6's row tracks,
     * not a new consumer. knownMissing now empty. */
    aggregateTaxesPaid: m("AGG-6", "ported", ["findings-batch5-nodes.js", "report-batch1-nodes.js"]),
    /* CFL-7 batch 4, 19 Jul 2026: report-batch4-nodes.js, built for
     * buildWithholdingSummary's LRS estimate row. Turned out genuinely
     * small and self-contained once actually read (same pattern as every
     * other "separate subsystem" AGG-1/5/9/TAX-9/LIM-1..6 turned out to be)
     * — computeLrsTcs is ~30 lines, no upstream dependency beyond
     * lrs_outbound's two raw fields. Closes AGG-8's one recorded gap
     * (lrs_purpose) too, since the full function reads it directly. */
    computeLrsTcs: m("AGG-8", "ported", ["report-batch4-nodes.js"]),
    /* CFL-7 batch 4, 19 Jul 2026: report-batch4-nodes.js. Also ~30 lines,
     * no upstream dependency — tds_already_deducted_inr/tcs_inr/property
     * TDS array/state withholding, all raw reads. */
    aggregateWithholdingDetail: m("AGG-7", "ported", ["report-batch4-nodes.js"]),
    /* normalize()'s remaining unmatched reads (of 288) after AGG-10's
     * closure:
     *  - profile.filing_status: read via normalizeFilingStatus (util) —
     *    the DAG's usFilingStatusRaw reads the same path; the token pair
     *    lands on the util helper's line here, a scanner-attribution quirk.
     * assets.pfic_holdings/real_estate.properties/retirement_accounts and
     * the businessEntities() display-name fallbacks + US-26 alias set
     * (business_name, partnership_name, corp_name, trade_name,
     * country_of_incorporation, corporation_name, ownership_pct,
     * ownership_percentage, gilti_income_usd) all closed 20 Jul 2026 by
     * assets-nodes.js's assetsModelResult — the first genuine consumer of
     * model.assets anywhere in this migration (built for monitor-next's
     * Holdings/Business tabs, which read model.assets.* directly and had
     * no DAG counterpart at all until this file). Verified in run-assets.js:
     * 801/801 across SAMPLE + all 11 profiles, bare ctx.
     * model-echo nra block (has_us_pe/form_8938_required) closed same day
     * by limits-nodes.js's hasUsPeRaw/form8938RequiredRaw — both genuinely
     * dead on the engine side too (neither is read by any downstream
     * engine computation; the real Form 8938 gauge derives from
     * model.accounts.aggregatePeak.usd, not this raw flag), mirrored only
     * so the "every engine field-read exists somewhere in the DAG" claim
     * is literally true, not because either side has a real consumer.
     * Remove entries only when a DAG node genuinely consumes the same
     * model field. */
    normalize: m("AGG-10", "ported", ["*"],
      ["profile.filing_status", "filing_status"])
  },
  "computation.js": {
    bracketTax: m("TAX-6", "ported", ["ustax-nodes.js", "in1-nodes-v3.js"]),
    computeSaltCap: m("TAX-6", "ported", ["ustax-nodes.js"]),
    computeSsTaxableUsd: m("TAX-6", "ported", ["ustax-nodes.js"]),
    bracketBreakdown: m("TAX-6", "ported", ["ustax-nodes.js", "in1-nodes-v3.js"]),
    /* computeLossSetOff extended CFL-7 batch 3, 19 Jul 2026: now also
     * returns totalUsedInr/totalUnusedInr/used{}/unused{} (previously only
     * the post-set-off head buckets) — needed by buildTaxComputation's
     * india loss-set-off trace rows. Zero new logic, verified via
     * run-in1-v3.js (8/8) and run-india-tax-combined.js (22/22). */
    computeLossSetOff: m("TAX-3", "ported", ["in1-nodes-v3.js"]),
    computeIndiaTax: m("TAX-1", "ported", ["in1-nodes-v3.js"]),
    /* CFL-7 batch 3, 19 Jul 2026: the previously-recorded knownMissing gap
     * here is now closed — computeS115aStream/computeNrInterestTreatment
     * were extended (in1-nodes-v3.js) to also build the real per-election
     * elections[] detail array (article/rates/docs facts, incl.
     * e.treaty_article), matching the engine exactly. Needed by
     * buildTaxComputation's india s.207/DTAA-interest trace rows
     * (report-batch3-nodes.js's s115aParts/nrInterestParts). Verified in
     * run-report3.js: 11/11 exact match including the elections[] detail. */
    computeS115aStream: m("TAX-1", "ported", ["in1-nodes-v3.js"]),
    computeNrInterestTreatment: m("TAX-1", "ported", ["in1-nodes-v3.js"]),
    computeIndiaEntityTax: m("TAX-2", "ported", ["entitytax-nodes.js"]),
    computeIndiaSurcharge: m("TAX-3", "ported", ["in1-nodes-v3.js"]),
    feieEligibility: m("TAX-6", "ported", ["ustax-nodes.js"]),
    computeUsTax: m("TAX-5", "ported", ["ustax-nodes.js"]),
    computeUsStateTax: m("TAX-9", "ported", ["findings-batch5-nodes.js"]),
    /* TAX-7/TAX-8 closed 19 Jul 2026: ustax-full-nodes.js ports both result
     * builders to the engine's exact output shape and REDEFINES usTaxResult
     * as the same router compute() uses (entity kinds -> entity tax;
     * 1040-NR without s.6013(h) -> NRA tax; else individual). Verified
     * 1015/1015 in run-ustax-full.js (all 11 profiles full-object for
     * entity/NRA + 6 synthetics vs the real engine), and run-agg10.js
     * dropped its entity/NRA carve-outs entirely: 1290/1290 bare-ctx. */
    computeNraTax: m("TAX-8", "ported", ["ustax-full-nodes.js"]),
    computeUsEntityTax: m("TAX-7", "ported", ["ustax-full-nodes.js"]),
    /* XBR-1 closed 19 Jul 2026: residency-nodes.js ports resolveResidency
     * in full (verified 132/132 in run-residency.js, all 11 profiles, zero
     * boundary reads). resolveResidency()'s own body has no snake_case or
     * safe() tokens of its own (it reads pre-normalized camelCase
     * model.residency and model.treaty fields) — same situation as
     * compute()/TAX-10, a legitimate but structurally-trivial 0/0 check.
     * The underlying raw fields it ultimately depends on
     * (residency_detail.final_india_residency_status, dtaa.dtaa_treaty_
     * residence, etc.) are read directly by residency-nodes.js itself and
     * so drop out of normalize()'s own AGG-10 boundary-gap list below. */
    resolveResidency: m("XBR-1", "ported", ["residency-nodes.js"]),
    /* XBR-2 closed 19 Jul 2026: ftc-nodes.js ports computeFtc line-for-line
     * (both directions + FEIE no-double-dip + the NRA/no-scope zeroing),
     * verified 176/176 standalone (all 11 profiles, every output field);
     * xborder-full-nodes.js wires all 12 of its boundary leaves in-graph,
     * verified 144/144 end-to-end with ctx.model = {entity, meta} ONLY. */
    computeFtc: m("XBR-2", "ported", ["ftc-nodes.js", "xborder-full-nodes.js"]),
    /* XBR-3 closed 19 Jul 2026: doubletax-nodes.js ports mapDoubleTaxedIncome
     * in full, built on xborder-full-nodes.js (needs both countries' income
     * plus residencyResult.us.worldwide in one place). The scoping pass's
     * "needs verifying" turned out fully positive -- aggregateUsIncomeResult
     * already exposed every foreign* field this reads, no new US-side work
     * needed. Verified 55/55 in run-doubletax.js, all 11 profiles, every
     * income head type genuinely exercised across the fixtures. */
    mapDoubleTaxedIncome: m("XBR-3", "ported", ["doubletax-nodes.js"]),
    /* LIM-1..6 fully closed 19 Jul 2026: limits-nodes.js ports computeLimits
     * IN FULL — all six gauges as one limitsResult node (exact order,
     * labels/notes byte-for-byte), reusing batch5's aggregatePeakUsdResult/
     * limitsRawExtra and adding the three previously-unbuilt gauges'
     * inputs (FORM_8938 4-way table + §911 abroad test w/ the reasons
     * array computeUsTax's feie port drops, NRO raw read, FEIE raw reads).
     * Verified 296/296 in run-limits.js: 11 profiles deep-compared against
     * computed.limits + 2 synthetic cases (NRO in flight, FEIE claimed-but-
     * ineligible) checked against the real engine on the same inputs. */
    computeLimits: m("LIM-1..6", "ported", ["limits-nodes.js", "findings-batch5-nodes.js"]),
    /* XBR-4 closed 19 Jul 2026: crossbasis-nodes.js ports crossBasis in
     * full, built on doubletax-nodes.js (superset of xborder-full-nodes.js).
     * A real bug found while porting -- computation.js:1520 compared
     * taxRegime against lowercase "old" (always false; the field is always
     * stored uppercase) -- was fixed in the engine first (GAP_TRACKER.md
     * IN-41). This DAG port never had the bug (in1-nodes-v3.js's own
     * taxRegime node already normalizes to uppercase). Verified 69/69 in
     * run-crossbasis.js, all 11 profiles plus a synthetic OLD-regime case
     * (no real profile combines OLD regime with a salary row here). */
    crossBasis: m("XBR-4", "ported", ["crossbasis-nodes.js"]),
    /* XBR-5 closed 19 Jul 2026: apportionment-nodes.js ports computeApportionment
     * in full (verified 132/132 in run-apportionment.js, all 11 profiles,
     * zero boundary reads — ctx carries only {router, india, us}). Reuses
     * the already-closed AGG-1/AGG-3 income totals rather than re-deriving
     * income classification; adds two new raw leaves (baseYear,
     * indiaQuarterlyUsd) read directly from ctx.router/ctx.us/ctx.india,
     * matching the "genuine derivation" discipline of every other
     * from-scratch phase (not a ctx.model boundary read like ustax-nodes.js's
     * separate baseYearUs node, which stays a boundary on purpose). */
    computeApportionment: m("XBR-5", "ported", ["apportionment-nodes.js"]),
    /* XBR-6 closed 19 Jul 2026: itrform-nodes.js ports computeIndiaItrForm
     * in full. The one real gap the scoping pass flagged (grossTotalIncomeInr
     * is PRE-Chapter-VI-A-deduction, distinct from the already-ported
     * totalIncomeInrV3) is closed by grossTotalIncomeInrV3 (a sibling of
     * totalIncomeInrV3, one term swapped) + grossTotalIncomeInrCombined
     * (routes to entityTaxableInrBoundary for companies/firms, whose own
     * gross figure already equals their taxable figure, no deductions).
     * Also closes AGG-1's agricultural_income_inr knownMissing item
     * (agriculturalIncomeInrAgg, aggregateindiaincome-nodes.js) — XBR-6 is
     * its one real consumer. Verified 91/91 in run-itrform.js, all 10
     * India-scoped profiles asserted (form, disqualifiers, frontend
     * cross-check fields), the one non-India-scoped profile confirmed null. */
    computeIndiaItrForm: m("XBR-6", "ported", ["itrform-nodes.js"]),
    /* TAX-10 (wiring AGG-1/AGG-3 into TAX-1/TAX-5) closed 19 Jul 2026:
     * india-full-nodes.js and us-full-nodes.js merge the income-aggregation
     * and tax-computation node sets and redefine every boundary node to
     * read the merged subgraph instead of ctx.model. compute() itself has
     * no snake_case/safe() reads of its own (this mapping is a place to
     * hang the row's status, not a real field-diff target — its own body
     * is pure camelCase orchestration, so this check is trivially 0/0). */
    compute: m("TAX-10", "ported", ["india-full-nodes.js", "us-full-nodes.js"])
  },
  "monitoring.js": {
    addDays: m("util", "util"), fmtDate: m("util", "util"),
    daysBetween: m("util", "util"), clamp: m("util", "util"),
    /* LIM-7, 19 Jul 2026: report-batch6-nodes.js. Genuinely new territory
     * for this migration — the first node file built around date/calendar
     * math rather than tax computation. Four pieces: residency day-counters
     * + a predicted "flip" date (individuals) or a qualitative fact list
     * (entities); threshold breach projections off computed.limits
     * (LIM-1..6, separately tracked, read here as a boundary like every
     * other computed.* field, not re-derived); a compliance calendar of
     * filing deadlines, entity-aware; a compliance-health score + a capped
     * alerts feed. opts.asOf and opts.findings are genuine caller-supplied
     * inputs — findings is exactly findingsAllResult (CFL-7 batch 5); asOf
     * is read as an explicit boundary (monitorAsOfBoundary) so verification
     * can pin it to a real WISING.analyze() call's own instant instead of
     * two independent new Date() calls racing a day boundary. The India
     * audit-case test and the presumptive-only s.425 test are byte-
     * identical to the same two tests conflicts.js's india_advance_tax_
     * interest finding already uses (in1-nodes.js, merged in since CFL-7
     * batch 5) — reused directly rather than re-derived a second time.
     * Surfaced and fixed one real gap in findingsAllResult itself (CFL-7
     * batch 5, report-batch5-nodes.js) along the way: detectConflicts's
     * own final step sorts its findings array by severity then amountUsd
     * descending before returning it (conflicts.js:1546-1551) — invisible
     * to every earlier CFL-6/CFL-7 verification (all ID-based, order-
     * independent), but monitor()'s alerts feed depends on that real order
     * (.filter(critical).slice(0,4)) to pick its top-4 critical alerts.
     * findingsAllResult now replicates the same sort, plus a stable
     * pre-sort by the real add()-call sequence so same-severity/same-
     * amountUsd ties (e.g. schedule_fa_inconsistent's amountUsd is always a
     * literal 0) resolve identically to production's own push order.
     * Verified in run-monitor.js: 11/11 exact structural match against
     * WISING.analyze()'s own monitoring field across all 11 real profiles —
     * no demotion needed for any profile, including the 2 US-entity/NRA
     * ones (monitor() has no usTaxResult-style dependency at all). */
    monitor: m("LIM-7", "ported", ["report-batch6-nodes.js", "in1-nodes.js"])
  },
  "conflicts.js": {
    usd: m("util", "util"), inr: m("util", "util"),
    usFtcForm: m("CFL-7", "ported", ["findings-nodes.js"]), describeTieBreak: m("CFL-7", "ported", ["findings-nodes.js"]),
    detectConflicts: m("CFL-1..6", "boundary"),
    /* CFL-7 batch 1, 19 Jul 2026: report-batch1-nodes.js. Closes
     * buildDocuments/buildScopeNotes/buildReturnFormDetermination/
     * buildFtcReport — the four the tracker's own scoping note called
     * "already unblocked" once XBR-2/XBR-6 closed. Verified in
     * run-report1.js: exact structural match against WISING.analyze()'s
     * own documents/scopeNotes/returnForms/ftcReport fields (not findings)
     * for all 11 real profiles; ftcReport reported-not-asserted for the
     * 2 US-entity/NRA profiles (same TAX-7/TAX-8 boundary as CFL-6). */
    indiaBusinessTurnoverInr: m("CFL-7", "ported", ["report-batch1-nodes.js"]),
    buildDocuments: m("CFL-7", "ported", ["report-batch1-nodes.js"]),
    calc: m("util", "util"), source: m("util", "util"), holdings: m("util", "util"),
    /* CFL-7 batch 2, 19 Jul 2026: report-batch2-nodes.js. Closes
     * buildTaxComputation's `us` and `usState` sub-objects (resident/
     * individual path + state tax) via buildTaxComputationUsResult /
     * buildTaxComputationUsStateResult, built on additive extensions to
     * the already-closed usTaxResult/usStateTaxResult nodes. Verified in
     * run-report2.js: exact structural match against WISING.analyze()'s
     * own taxComputation.us/taxComputation.usState for all 11 real
     * profiles; taxComputation.us reported-not-asserted for the 2
     * US-entity/NRA profiles (same TAX-7/TAX-8 boundary as CFL-6);
     * taxComputation.usState asserted unconditionally (usStateTaxResult
     * already self-gates to null for those profiles). bracketParts was
     * ported verbatim as part of this batch. */
    bracketParts: m("CFL-7", "ported", ["report-batch2-nodes.js"]),
    /* CFL-7 batch 3, 19 Jul 2026: report-batch3-nodes.js. Closes
     * buildTaxComputation's `india` sub-object — the last of the three —
     * built on india-tax-combined-nodes.js (TAX-1 individual/HUF slab path
     * + TAX-2 entity path, already merged there via isEntityTaxpayer).
     * Needed two additive extensions to in1-nodes-v3.js's local
     * computeS115aStream/computeNrInterestTreatment/computeLossSetOff (see
     * their own mapping entries above) to expose the elections[]/used{}/
     * unused{} trace detail the display layer needs, beyond the tax
     * figures TAX-1 already verified. s115aParts/nrInterestParts ported
     * verbatim as part of this batch. Verified in run-report3.js: 11/11
     * exact structural match against WISING.analyze()'s own
     * taxComputation.india across all 11 real profiles (individual/HUF AND
     * all 3 company/foreign-company/firm entity profiles asserted
     * unconditionally — computeIndiaEntityTax's simpler return shape needs
     * no US-entity/NRA-style demotion). With all three sub-objects (us,
     * usState, india) now closed, buildTaxComputation itself is reclassified
     * "ported" below. */
    s115aParts: m("CFL-7", "ported", ["report-batch3-nodes.js"]),
    nrInterestParts: m("CFL-7", "ported", ["report-batch3-nodes.js"]),
    buildFtcReport: m("CFL-7", "ported", ["report-batch1-nodes.js"]),
    buildTaxComputation: m("CFL-7", "ported", ["report-batch2-nodes.js", "report-batch3-nodes.js"]),
    /* CFL-7 batch 4, 19 Jul 2026: report-batch4-nodes.js, merging
     * report-batch2-nodes.js (US-side: nraFdapDetail/nraRaw,
     * aggregateUsIncomeResult's w2Employers, panAadhaarLinkedRaw,
     * taxesPaidUsResult) with report-batch3-nodes.js (India-side:
     * s115aDividend/s115aRoyalty/s115aFts/nrInterest, already carrying
     * their real elections[] detail since batch 3). Closes AGG-7
     * (aggregateWithholdingDetail) and AGG-8 (computeLrsTcs) as side
     * effects of what this function's rows need. Verified in
     * run-report4.js: 11/11 exact structural match against
     * WISING.analyze()'s own withholding field across all 11 real
     * profiles — no US-entity/NRA demotion needed (isNra determined from
     * raw treatyFiles1040nrRaw/s6013hElection facts, same pattern
     * findings-batch4/5-nodes.js already established, not from
     * usTaxResult, which doesn't cover that path). */
    buildWithholdingSummary: m("CFL-7", "ported", ["report-batch4-nodes.js"]),
    buildScopeNotes: m("CFL-7", "ported", ["report-batch1-nodes.js"]),
    buildReturnFormDetermination: m("CFL-7", "ported", ["report-batch1-nodes.js"]),
    /* CFL-7 batch 5 (LAST), 19 Jul 2026: report-batch5-nodes.js — the
     * top-level orchestration itself. Assembles findings + all six
     * buildXxx() results + a small summary derivation into the exact
     * 11-key WISING.analyze() shape. model/computed/monitoring stay
     * explicit boundary inputs (normalize/compute are AGG-10/TAX-N/XBR-N,
     * separately tracked; monitor() is LIM-7, a separate untouched
     * subsystem) — consistent with how every other node file in this
     * migration already treats them, not a new exception carved out here.
     * findingsAllResult needed 5 findings that lived entirely outside the
     * findings-batchN-nodes.js chain (india_advance_tax_interest,
     * underpayment_2210, early_withdrawal_penalty_72t,
     * black_money_act_exposure, schedule_fa_inconsistent — CFL-1..5's
     * earliest prototype work, in1/us1/us5/xb7-nodes.js, which only ever
     * built {shouldFire, amountUsd} pairs, never full finding objects) —
     * built fresh here from those already-verified pieces, with title/
     * detail/recommendation text re-read from conflicts.js. Caught a real
     * bug during merge, not by a failed test: all four of those files
     * independently name their fire-condition node "shouldFire" — a plain
     * Object.keys().forEach merge would have silently kept only the last
     * file's version, breaking the other three; fixed by aliasing each to
     * a unique per-file name before merging. Verified in run-analyze.js:
     * 139/139 — exact structural match against WISING.analyze()'s
     * complete return object across all 11 real profiles; findings/
     * ftcReport/taxComputation.us reported-not-asserted for the 2
     * US-entity/NRA profiles for the same TAX-7/TAX-8-dependent IDs/
     * fields every earlier batch already demoted (ftc_gap/ftc_available/
     * amt_applies; taxComputation.us; ftcReport) — everything else,
     * including taxComputation.india/usState, documents, withholding,
     * scopeNotes, returnForms, model, computed, monitoring, and summary,
     * asserted unconditionally for all 11. CFL-7 is now fully closed. */
    analyze: m("CFL-7", "ported", ["report-batch5-nodes.js"])
  }
};

/* Finding IDs the DAG implements today (tracker CFL-1..5, XBR-1). */
var DAG_FINDING_IDS = {
  india_advance_tax_interest: "in1-nodes*.js",
  underpayment_2210: "us1-nodes.js",
  early_withdrawal_penalty_72t: "us5-nodes.js",
  black_money_act_exposure: "xb7-nodes.js",
  schedule_fa_inconsistent: "xb7-nodes.js (shared node)",
  residency_status_mismatch_india: "residency-nodes.js",
  residency_status_mismatch_india_company: "residency-nodes.js",
  residency_status_mismatch_india_entity: "residency-nodes.js",
  residency_status_dtaa_conflated_india: "residency-nodes.js",
  residency_status_understated_us: "residency-nodes.js",
  residency_status_overstated_us: "residency-nodes.js",
  residency_status_understated_us_entity: "residency-nodes.js",
  residency_status_overstated_us_entity: "residency-nodes.js",
  /* CFL-6 batch 1, 19 Jul 2026: findings-nodes.js. */
  pan_not_linked_aadhaar: "findings-nodes.js",
  ftc_gap: "findings-nodes.js",
  ftc_available: "findings-nodes.js",
  amt_applies: "findings-nodes.js",
  entity_dual_residency_poem: "findings-nodes.js",
  dual_residency: "findings-nodes.js",
  dual_residency_resolved: "findings-nodes.js",
  /* CFL-6 batch 2, 19 Jul 2026: findings-batch2-nodes.js. */
  cross_basis_summary: "findings-batch2-nodes.js",
  india_itr_form_mismatch: "findings-batch2-nodes.js",
  special_rate_gaming_winnings: "findings-batch2-nodes.js",
  s115bbe_unexplained_income: "findings-batch2-nodes.js",
  chapter_xiia_elected_no_holdings: "findings-batch2-nodes.js",
  chapter_xiia_investment_income_missing: "findings-batch2-nodes.js",
  chapter_xiia_investment_income_computed: "findings-batch2-nodes.js",
  /* CFL-6 batch 3, 19 Jul 2026: findings-batch3-nodes.js. */
  form_10iea: "findings-batch3-nodes.js",
  form_1099da_awareness: "findings-batch3-nodes.js",
  fx_basis: "findings-batch3-nodes.js",
  tax_year_mismatch: "findings-batch3-nodes.js",
  pfic: "findings-batch3-nodes.js",
  cfc: "findings-batch3-nodes.js",
  cfc_below_threshold: "findings-batch3-nodes.js",
  transfer_pricing: "findings-batch3-nodes.js",
  no_totalization_agreement: "findings-batch3-nodes.js",
  niit_medicare_not_creditable: "findings-batch3-nodes.js",
  pe_article7: "findings-batch3-nodes.js",
  retirement_mismatch: "findings-batch3-nodes.js",
  deemed_dividend_buyback_mismatch: "findings-batch3-nodes.js",
  promoter_buyback_additional_tax: "findings-batch3-nodes.js",
  foreign_gift_3520: "findings-batch3-nodes.js",
  covered_expat_gift_tax: "findings-batch3-nodes.js",
  state_treaty_not_binding: "findings-batch3-nodes.js",
  nra_w8ben_missing: "findings-batch3-nodes.js",
  firpta: "findings-batch3-nodes.js",
  /* CFL-6 batch 4, 19 Jul 2026: findings-batch4-nodes.js. */
  treaty_docs_missing: "findings-batch4-nodes.js",
  dtaa_treaty_elections: "findings-batch4-nodes.js",
  withholding_documentation_gap: "findings-batch4-nodes.js",
  carry_forward_losses_not_applied: "findings-batch4-nodes.js",
  feie_ineligible: "findings-batch4-nodes.js",
  feie_applied: "findings-batch4-nodes.js",
  nra_fdap_flat_rate: "findings-batch4-nodes.js",
  /* CFL-6 batch 5, 19 Jul 2026: findings-batch5-nodes.js. */
  equity_comp_sourcing: "findings-batch5-nodes.js",
  iso_3921: "findings-batch5-nodes.js",
  state_income_tax: "findings-batch5-nodes.js",
  form67_required: "findings-batch5-nodes.js",
  fbar_limit: "findings-batch5-nodes.js",
  lrs_limit: "findings-batch5-nodes.js",
  trump_account_contribution_limit: "findings-batch5-nodes.js",
  /* CFL-6 batch 6, 19 Jul 2026: findings-batch6-nodes.js. CFL-6's 48th and
   * last finding — dynamically ID'd (add("holding_period_mismatch_" + mi,
   * ...)), so the scanner's literal-string regex captures the ID with its
   * trailing underscore, same shape as the raw conflicts.js source. */
  "holding_period_mismatch_": "findings-batch6-nodes.js"
};

/* ---- comment-aware line reader ------------------------------------------ */
function codeLines(file) {
  var raw = fs.readFileSync(file, "utf8").split("\n");
  var out = [], inBlock = false;
  for (var i = 0; i < raw.length; i++) {
    var line = raw[i];
    if (inBlock) {
      var end = line.indexOf("*/");
      if (end === -1) { out.push(""); continue; }
      line = line.slice(end + 2); inBlock = false;
    }
    var start;
    while ((start = line.indexOf("/*")) !== -1) {
      var close = line.indexOf("*/", start + 2);
      if (close === -1) { line = line.slice(0, start); inBlock = true; break; }
      line = line.slice(0, start) + line.slice(close + 2);
    }
    var slash = line.indexOf("//");
    if (slash !== -1) line = line.slice(0, slash);
    out.push(line);
  }
  return out;
}

/* ---- DAG token sets ------------------------------------------------------ */
var dagTokens = {};       // file -> Set of word tokens
var dagAll = new Set();
NODE_FILES.forEach(function (f) {
  var set = new Set();
  codeLines(path.join(ROOT, "prototypes", "graph-pilot", f)).forEach(function (line) {
    (line.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).forEach(function (t) { set.add(t); dagAll.add(t); });
    // Quoted safe() paths too: identifier tokenizing alone can't represent a
    // segment that starts with a digit (the real "401k_distributions_usd"
    // false-positive this fixed) — add every dot-segment of every string.
    (line.match(/"([^"]+)"/g) || []).forEach(function (q) {
      q.slice(1, -1).split(".").forEach(function (s) { if (s) { set.add(s); dagAll.add(s); } });
    });
  });
  dagTokens[f] = set;
});
function tokenSetFor(dagFiles) {
  if (dagFiles.length === 1 && dagFiles[0] === "*") return dagAll;
  var set = new Set();
  dagFiles.forEach(function (f) { dagTokens[f].forEach(function (t) { set.add(t); }); });
  return set;
}

/* ---- engine scan: per-function path + field-token extraction ------------- */
var unexpected = [];   // gaps in "ported" functions
var untracked = [];    // engine functions absent from MAP
var inventory = [];    // { file, fn, row, status, missing: [...] }

["normalize.js", "computation.js", "monitoring.js", "conflicts.js"].forEach(function (engFile) {
  var lines = codeLines(resolveEngineFile(engFile));
  var fnMap = MAP[engFile];
  var current = null;                 // { name, paths: Map(display -> line) }
  var perFn = {};                     // name -> { paths: Map }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var top = line.match(/^ {2}function ([A-Za-z_$][\w$]*)\s*\(/);
    if (top) {
      current = top[1];
      if (!perFn[current]) perFn[current] = { paths: new Map() };
      if (!fnMap[current] && untracked.indexOf(engFile + ":" + current) === -1) {
        untracked.push(engFile + ":" + current);
      }
    }
    if (!current) continue;
    var bucket = perFn[current].paths;
    // quoted safe(obj, "a.b.c") paths
    var re = /safe\(\s*[^,()]+,\s*"([^"]+)"/g, hit;
    while ((hit = re.exec(line)) !== null) {
      if (!bucket.has(hit[1])) bucket.set(hit[1], i + 1);
    }
    // bare snake_case property reads (form-field shaped: contains "_")
    var pre = /\.([a-z][a-z0-9]*_[a-z0-9_]*)\b/g;
    while ((hit = pre.exec(line)) !== null) {
      var tok = hit[1];
      if (!bucket.has(tok)) bucket.set(tok, i + 1);
    }
  }

  Object.keys(perFn).forEach(function (fn) {
    var meta = fnMap[fn] || { row: "UNTRACKED", status: "untracked", dagFiles: ["*"], knownMissing: [] };
    var tokens = tokenSetFor(meta.dagFiles);
    var missing = [], known = [];
    perFn[fn].paths.forEach(function (lineNo, p) {
      var segs = p.split(".");
      var allPresent = segs.every(function (s) { return tokens.has(s); });
      if (!allPresent) {
        var leaf = segs[segs.length - 1];
        if (meta.knownMissing.indexOf(p) !== -1 || meta.knownMissing.indexOf(leaf) !== -1) known.push(p + "  (L" + lineNo + ")");
        else missing.push(p + "  (L" + lineNo + ")");
      }
    });
    var rec = { file: engFile, fn: fn, row: meta.row, status: meta.status, total: perFn[fn].paths.size, missing: missing, known: known };
    inventory.push(rec);
    if (meta.status === "ported" && missing.length > 0) unexpected.push(rec);
  });
});

/* ---- finding-ID diff ----------------------------------------------------- */
var conflictLines = codeLines(resolveEngineFile("conflicts.js"));
var findingIds = [];
conflictLines.forEach(function (line, i) {
  var re = /add\("([A-Za-z0-9_]+)"/g, hit;
  while ((hit = re.exec(line)) !== null) {
    if (findingIds.map(function (f) { return f.id; }).indexOf(hit[1]) === -1) {
      findingIds.push({ id: hit[1], line: i + 1 });
    }
  }
});
var findingsMissing = findingIds.filter(function (f) { return !DAG_FINDING_IDS[f.id]; });

/* ---- numeric drift ------------------------------------------------------- */
var engineNums = new Set();
["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js"].forEach(function (f) {
  codeLines(resolveEngineFile(f)).forEach(function (line) {
    (line.match(/\b\d+(?:\.\d+)?\b/g) || []).forEach(function (n) { engineNums.add(Number(n)); });
  });
});
// Quoted string contents (finding titles/detail/refs prose — e.g. a legal
// citation like "IRC 7701(b)(3)") are excluded from the drift scan below.
// This check exists for "the DAG's hand-copied constant tables" (see file
// header) — actual rates/caps/thresholds used in arithmetic, which never
// live inside a quoted string in this codebase's style (every real
// constant table here is a bare numeric literal in an object/array). A
// citation number in prose isn't a hand-copied constant and has nothing to
// drift against; scanning it only produces false positives. Left
// unstripped on the engine side (engineNums, above) is intentionally safe
// either way — more inclusion there can only reduce false positives, never
// hide a real one.
function stripStringLiterals(line) {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, "\"\"").replace(/'(?:[^'\\]|\\.)*'/g, "''");
}
// KNOWN-DAG-ONLY: numeric literals from new, deliberately DAG-only feature
// work (docs/DAG_MIGRATION_TRACKER.md's tracker-direction note, 20 Jul
// 2026 — "new product features now land DAG-only... engine/*.js untouched
// by this file or anything it depends on") that will NEVER have an
// engine-side match by design. Distinct from the original SYS-1 problem
// this check exists to catch (a value hand-copied on BOTH sides that
// later drifted apart) — these are one-sided from the start, not drifted.
// Scoped to file+value, mirroring this script's own knownMissing
// convention (see section 1b), so an unrelated, genuinely accidental new
// duplication elsewhere still fails loudly.
var KNOWN_DAG_ONLY = {
  // NJ individual state-tax brackets (single/mfj) + dependent exemption —
  // GAP_TRACKER.md H.7, "Business-entity Phase 2: US state income tax"
  "findings-batch5-nodes.js": [20000, 0.014, 35000, 0.0175, 0.035, 0.05525, 0.0637, 0.0897, 0.1075, 70000, 0.0245, 1500],
  // US trust IRC S.1(e) brackets (H.6) + entity CA/NY/NJ corporate rates (H.7);
  // §877A covered-expatriate thresholds (2026, Rev. Proc. 2025-32 — XB-6);
  // isLeapYear/daysInYear day-count helpers for the dual-status split-year
  // computation (XB-25) — the frozen engine has no dual-status day-count math.
  "ustax-full-nodes.js": [3150, 11450, 15650, 0.0884, 0.0725, 0.09, 211000, 910000, 400, 366],
  // Task #41 (self-employment home-office/vehicle-mileage deduction): 2026
  // standard mileage rate (0.68/mi) and §280A simplified-method home-office
  // cap (300 sqft) — the frozen engine never modeled either deduction.
  "aggregateusincome-nodes.js": [0.68, 300, 365.25],
  // Same task #41 constant (300 sqft cap), reused in this file's own
  // Schedule C trace-text formula.
  "assets-nodes.js": [300],
  // Step 11 audit (retirement §402(g) elective-deferral + §219(b)(5) IRA
  // combined-contribution excess) and task #40 (§223(b) HSA excess
  // contribution) — 2026 IRS limits (Notice 2025-67, Rev. Proc. 2025-19).
  // The frozen engine never modeled any of these three excess-contribution
  // checks at all.
  "us5-nodes.js": [24500, 35750, 32500, 8600, 8750, 4400],
  // FEIE legal-correctness fixes (§911(d)(6) stacking rule, commit 8255a57):
  // isLeapYear's Gregorian-calendar constant (400) and the leap-year day
  // count (366) for the FEIE proration day-count math. Task #42 (§199A QBI
  // wage/UBIA limitation): the 2.5% UBIA rate in IRC §199A(b)(2)(B)(ii)'s
  // wage/UBIA limit formula (0.25*wages + 0.025*UBIA) — the frozen engine
  // has no wage/UBIA cap at all.
  "ustax-nodes.js": [400, 366, 0.025]
};
function isKnownDagOnly(f, v) { return (KNOWN_DAG_ONLY[f] || []).indexOf(v) !== -1; }

var drifted = [];
NODE_FILES.forEach(function (f) {
  codeLines(path.join(ROOT, "prototypes", "graph-pilot", f)).forEach(function (line, i) {
    (stripStringLiterals(line).match(/\b\d+(?:\.\d+)?\b/g) || []).forEach(function (n) {
      var v = Number(n);
      var significant = Math.abs(v) >= 100 || (v > 0 && v < 1 && n.indexOf(".") !== -1);
      if (significant && !engineNums.has(v) && !drifted.some(function (d) { return d.v === v && d.f === f; })) {
        drifted.push({ f: f, v: v, line: i + 1, known: isKnownDagOnly(f, v) });
      }
    });
  });
});

/* ---- report -------------------------------------------------------------- */
var BAR = "==============================================================================";
console.log(BAR + "\nDAG coverage diff — engine/*.js vs prototypes/graph-pilot/ (see docs/DAG_MIGRATION_TRACKER.md)\n" + BAR);

console.log("\n--- 1. UNEXPECTED GAPS: functions the tracker marks PORTED with engine reads absent from their DAG file(s) ---");
if (unexpected.length === 0) console.log("  none — every ✅/🟡 row's engine field reads are either present in its mapped DAG file(s) or on its recorded knownMissing list.");
unexpected.forEach(function (r) {
  console.log("  " + r.file + " :: " + r.fn + "()  [" + r.row + "]  " + r.missing.length + "/" + r.total + " reads missing:");
  r.missing.forEach(function (p) { console.log("      " + p); });
});

console.log("\n--- 1b. KNOWN-PARTIAL: recorded gaps in otherwise-ported functions (tracked in the mapping's knownMissing lists) ---");
var partial = inventory.filter(function (r) { return r.known && r.known.length > 0; });
if (partial.length === 0) console.log("  none.");
partial.forEach(function (r) {
  console.log("  " + r.file + " :: " + r.fn + "()  [" + r.row + "]  " + r.known.length + " recorded:");
  r.known.forEach(function (p) { console.log("      " + p); });
});

console.log("\n--- 2. TRACKED GAPS: the definitive engine-not-in-DAG inventory (rows already ❌/🔶/📝 in the tracker) ---");
var tracked = inventory.filter(function (r) {
  return (r.status === "missing" || r.status === "boundary" || r.status === "scoped-out") && r.missing.length > 0;
});
tracked.sort(function (a, b) { return b.missing.length - a.missing.length; });
tracked.forEach(function (r) {
  console.log("\n  " + r.file + " :: " + r.fn + "()  [" + r.row + ", " + r.status + "]  " + r.missing.length + "/" + r.total + " engine reads with no DAG counterpart anywhere:");
  r.missing.forEach(function (p) { console.log("      " + p); });
});

console.log("\n--- 3. FINDING-ID DIFF: conflicts.js add() IDs vs DAG-implemented findings ---");
console.log("  engine finding IDs: " + findingIds.length + "   implemented in DAG: " + (findingIds.length - findingsMissing.length));
findingsMissing.forEach(function (f) { console.log("      MISSING  " + f.id + "  (conflicts.js L" + f.line + ")"); });

console.log("\n--- 4. NUMERIC DRIFT: DAG constant values with no matching literal anywhere in engine/*.js ---");
var newDrift = drifted.filter(function (d) { return !d.known; });
if (newDrift.length === 0) console.log("  none — every significant DAG numeric literal also exists engine-side, or is on the known-DAG-only list below (no unexplained drift; see tracker SYS-1).");
newDrift.forEach(function (d) { console.log("      " + d.f + " L" + d.line + "  " + d.v); });

console.log("\n--- 4b. KNOWN DAG-ONLY: accepted constants from deliberately DAG-only feature work (tracker-direction note, 20 Jul 2026) ---");
var knownDrift = drifted.filter(function (d) { return d.known; });
if (knownDrift.length === 0) console.log("  none.");
knownDrift.forEach(function (d) { console.log("      " + d.f + " L" + d.line + "  " + d.v); });

console.log("\n--- 5. ENGINE FUNCTIONS NOT IN THE TRACKER MAPPING (new code the tracker hasn't heard of) ---");
if (untracked.length === 0) console.log("  none — every top-level engine function is accounted for in the tracker mapping.");
untracked.forEach(function (u) { console.log("      " + u); });

var fail = unexpected.length > 0 || untracked.length > 0 || newDrift.length > 0;
console.log("\n" + BAR);
console.log("Result: " + (fail
  ? "ATTENTION REQUIRED — unexpected gaps / untracked functions / numeric drift above."
  : "no unexpected gaps: every ✅ tracker row verifies mechanically; sections 2-3 are the complete known engine-not-in-DAG inventory."));
process.exit(fail ? 1 : 0);

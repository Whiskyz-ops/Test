"use strict";
/* ============================================================================
 * Closes AGG-10: normalize()'s top-level orchestration — the model.entity /
 * model.meta / model.identity (+ the model.residency and companyResidency
 * slices the monitor layer reads) are now DERIVED in-graph from raw form
 * data, not read off ctx.model. After this file, the entire computational
 * chain — both incomes, both taxes, residency, FTC, all findings, all
 * report builders, the monitor layer, and the summary — resolves from
 * ctx = { router, india, us } with NO model and NO computed at all.
 *
 * Block ports (each mirroring normalize()'s own construction, read
 * side-by-side from source — normalize.js L2219-2261 (meta/identity),
 * L2262-2353 (entity), L2354-2411 (residency slice), L2435-2442
 * (companyResidency), computation.js L1827-1838 (computed.headline)):
 *   identityResult, metaResult, entityResult, residencyModelSliceResult,
 *   companyResidencyResult, headlineResult.
 *
 * Override pattern — SYNTHETIC CTX WRAPPING, not body duplication: each
 * overridden node keeps the ORIGINAL compute function from the base chain
 * and passes it a synthetic ctx assembled from in-graph deps. One source
 * of logic; only the boundary moves. (Body-copying would fork the logic —
 * the exact drift risk SYS-1 documents for constants, avoided here.)
 *
 * Explicitly OUT of scope, documented not hidden: analyzeResult's `model`
 * and `computed` keys. The engine's analyze() literally returns its
 * internal model/computed objects for the frontend to render from;
 * echoing them requires HAVING them, and reconstructing every last field
 * (full computeIndiaTax/computeUsTax result objects with bracket
 * breakdowns, every normalize block incl. _raw) is the whole-engine
 * mirror, not an orchestration boundary. They are now read via two
 * explicitly-named echo nodes that return null when the caller supplies
 * no engine output — every OTHER key of analyzeResult (findings, docs,
 * reports, monitoring, summary) is computed in-graph regardless.
 * ==========================================================================*/
var baseNodes = require("./limits-nodes.js").NODES;

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
var INR_PER_USD = require("../engine/constants.js").CONST.FX.INR_PER_USD; // SYS-1: shared

var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

/* ---- identity (normalize L2251-2261) ------------------------------------ */
NODES.identityResult = {
  deps: ["usFilingStatusRaw"],
  compute: function (d, ctx) {
    var india = ctx.india, us = ctx.us, router = ctx.router;
    return {
      name: safe(router, "full_name", safe(india, "profile.full_name", safe(us, "profile.full_name", "Unnamed Taxpayer"))),
      dob: safe(router, "date_of_birth", safe(india, "profile.date_of_birth", safe(us, "profile.date_of_birth", null))),
      usFilingStatus: d.usFilingStatusRaw,
      indiaEntityType: safe(india, "profile.entity_type", "individual"),
      panAadhaarLinked: safe(india, "profile.pan_aadhaar_linked", null)
    };
  }
};

/* ---- meta (normalize L2220-2234; scope booleans reuse the already-
 * verified in-graph derivations of the same normalize L2177-2187 logic) --- */
NODES.metaResult = {
  deps: ["hasUsScopeBoundaryFtc", "hasIndiaScopeXbr"],
  compute: function (d, ctx) {
    var india = ctx.india, us = ctx.us, router = ctx.router;
    var scopeHasUs = d.hasUsScopeBoundaryFtc, scopeHasIndia = d.hasIndiaScopeXbr;
    return {
      hasIndia: !!ctx.india && Object.keys(ctx.india || {}).length > 0,
      hasUs: !!ctx.us && Object.keys(ctx.us || {}).length > 0,
      hasRouter: !!ctx.router && Object.keys(ctx.router || {}).length > 0,
      hasIndiaScope: scopeHasIndia,
      hasUsScope: scopeHasUs,
      jurisdiction: scopeHasIndia && scopeHasUs ? "dual" : scopeHasUs ? "single_us" : "single_india",
      baseYear: num(safe(router, "base_tax_year", safe(us, "metadata.us_calendar_year", 2025))) || 2025,
      fxRate: INR_PER_USD,
      indiaSchemaVersion: safe(india, "metadata.schema_version", null),
      usSchemaVersion: safe(us, "metadata.schema_version", null),
      indiaQuarterly: !!safe(india, "quarters", null)
    };
  }
};

/* ---- entity (normalize L2262-2353 incl. the L2141-2148 precursors) ------ */
NODES.entityResult = {
  deps: [],
  compute: function (d, ctx) {
    var india = ctx.india, us = ctx.us;
    var indiaEntityKind = safe(india, "profile.entity_type", "individual");
    var indiaIsCompany = indiaEntityKind === "company";
    var indiaIsFirm = ["firm", "llp", "local"].indexOf(indiaEntityKind) >= 0;
    var indiaLayer1Itr = safe(india, "itr_recommendation.form", null);
    if (indiaLayer1Itr === "Unknown") indiaLayer1Itr = null;
    var indiaReturnFormCrude = indiaIsCompany ? "ITR-6" : (indiaIsFirm ? "ITR-5" : "ITR-2/3");
    var indiaReturnForm = indiaLayer1Itr || indiaReturnFormCrude;

    var usT = safe(us, "profile.tax_entity_type", "individual");
    if (usT === "llc") usT = safe(us, "profile.llc_tax_election", "individual");
    var usIsBusiness = ["ccorp", "scorp", "partnership", "trust"].indexOf(usT) >= 0;
    var usIsCorpOrPartnership = ["ccorp", "scorp", "partnership"].indexOf(usT) >= 0;
    var m1 = safe(us, "corporate_financials.schedule_m1", null);
    var m1HasData = usIsCorpOrPartnership && m1 && [
      "net_income_per_books", "federal_tax_expense", "tax_exempt_interest",
      "tax_depreciation_over_book", "meals_disallowed_50", "foreign_taxes_credited",
      "interest_expense_limitation", "other_additions", "other_subtractions"
    ].some(function (k) { return num(m1[k]) !== 0; });
    var usScheduleM1TaxableIncomeUsd = m1HasData
      ? num(m1.net_income_per_books) + num(m1.federal_tax_expense) + num(m1.meals_disallowed_50) +
        num(m1.foreign_taxes_credited) + num(m1.interest_expense_limitation) + num(m1.other_additions) -
        num(m1.tax_exempt_interest) - num(m1.tax_depreciation_over_book) - num(m1.other_subtractions)
      : null;
    return {
      indiaKind: indiaEntityKind, usKind: usT,
      indiaIsCompany: indiaIsCompany, indiaIsFirm: indiaIsFirm,
      indiaOpt115baa: safe(india, "profile.opt_115baa", false) === true,
      indiaOpt115bab: safe(india, "profile.opt_115bab", false) === true,
      indiaOpt115ba: safe(india, "profile.opt_115ba", false) === true,
      indiaTurnoverLte400cr: safe(india, "profile.turnover_lte_400cr", false) === true,
      indiaMatBookProfitInr: safe(india, "profile.mat_book_profit", null),
      indiaIsSection8: safe(india, "profile.is_section_8", false) === true,
      isCompanyDirector: safe(india, "profile.is_company_director", false) === true,
      usIsBusiness: usIsBusiness,
      usScheduleM1TaxableIncomeUsd: usScheduleM1TaxableIncomeUsd,
      usIncorporatedInUs: usIsBusiness ? safe(us, "profile.incorporated_in_us", null) : null,
      usIncorporationState: usIsBusiness ? safe(us, "profile.incorporation_state", null) : null,
      isBusiness: indiaIsCompany || indiaIsFirm || usIsBusiness,
      indiaReturnForm: indiaReturnForm,
      indiaReturnFormIsRecommendation: !!indiaLayer1Itr,
      indiaReturnFormExplanation: indiaLayer1Itr ? safe(india, "itr_recommendation.explanation", null) : null,
      usReturnForm: usT === "ccorp" ? "1120" : usT === "scorp" ? "1120-S" : usT === "partnership" ? "1065" : usT === "trust" ? "1041" :
        (safe(us, "nra_specific.files_form_1040nr", false) === true ? "1040-NR" : "1040")
    };
  }
};

/* ---- the model.residency fields the monitor layer consumes -------------- */
NODES.residencyModelSliceResult = {
  // Found by run-fuzz.js (randomized differential testing, 20 Jul 2026):
  // this node only ever carried the 4 fields the DAG's own computation
  // reads (status/daysCurrentYear/isIndianCompanyFact/
  // indiaWhollyOutsideIndiaFact) — no fixed fixture's run-agg10.js/
  // test-adapter.mjs check ever deep-compared model.residency.india's FULL
  // shape, so the other 9 raw pass-through fields (normalize.js:2354,
  // 2380-2394 — taxRegime, the individual s.6(1)/s.6(1A) residency-solver
  // facts, dtaaWorldwideCeded) plus domesticStatusDerived went unnoticed as
  // missing. All raw reads, same style as the 4 already here; only
  // domesticStatusDerived is an actual re-derivation, already ported
  // (residency-nodes.js's indiaDomesticStatusDerived, XBR-1) — reused, not
  // duplicated.
  deps: ["indiaDomesticStatusDerived"],
  compute: function (d, ctx) {
    var india = ctx.india, us = ctx.us;
    return {
      india: {
        status: safe(india, "residency_detail.final_india_residency_status", null),
        daysCurrentYear: num(safe(india, "residency_detail.days_in_india_current_year", 0)),
        taxRegime: safe(india, "profile.tax_regime", "NEW"),
        isIndianCompanyFact: safe(india, "residency_detail.is_indian_company", null),
        indiaWhollyOutsideIndiaFact: safe(india, "residency_detail.is_wholly_outside_india", null),
        daysPreceding4YearsGte365: safe(india, "residency_detail.days_in_india_preceding_4_years_gte_365", null),
        employmentOrCrewStatus: safe(india, "residency_detail.employment_or_crew_status", null),
        cameOnVisitPioCitizen: safe(india, "residency_detail.came_on_visit_to_india_pio_citizen", null),
        nrYearsLast10Gte9: safe(india, "residency_detail.nr_years_last_10_gte_9", null),
        daysLast7YearsLte729: safe(india, "residency_detail.days_in_india_last_7_years_lte_729", null),
        indiaSourceIncomeAbove15L: safe(india, "residency_detail.india_source_income_above_15l", null),
        liableToTaxElsewhereAsIndianCitizen: safe(india, "residency_detail.liable_to_tax_in_another_country_being_indian_citizen", false) === true,
        dtaaWorldwideCeded: safe(india, "residency_detail.dtaa_worldwide_ceded", false) === true,
        domesticStatusDerived: d.indiaDomesticStatusDerived
      },
      us: {
        status: safe(us, "us_residency_detail.final_us_residency_status", null),
        isCitizen: safe(us, "us_residency_detail.is_us_citizen", false) === true,
        hasGreenCard: safe(us, "us_residency_detail.has_green_card", false) === true,
        sptMet: safe(us, "us_residency_detail.spt_test_met", false) === true,
        daysCurrentYear: num(safe(us, "us_residency_detail.us_days_current_year", 0))
      }
    };
  }
};
NODES.companyResidencyResult = {
  deps: [],
  compute: function (d, ctx) {
    var india = ctx.india;
    return {
      isActiveBusiness: safe(india, "company_residency.is_active_business", false) === true,
      boardMeetingsOutsideIndia: safe(india, "company_residency.board_meetings_primarily_outside_india", false) === true,
      keyManagementLocation: safe(india, "company_residency.key_management_location", null),
      managementDelegatedOutsideIndia: safe(india, "company_residency.management_delegated_outside_india", false) === true,
      directorsInIndia: num(safe(india, "company_residency.directors_in_india_count", 0)),
      directorsOutsideIndia: num(safe(india, "company_residency.directors_outside_india_count", 0))
    };
  }
};

/* Built for the monitor-next integration: normalize L2439-2463's treaty
 * block — pure raw reads, no upstream deps. Views.jsx's ResidencyView reads
 * files1040nr/form10fFiled/hasPE/trcStatus/treatyResidence/
 * usTreatyResidence directly off model.treaty. */
NODES.treatyModelResult = {
  deps: [],
  compute: function (d, ctx) {
    var india = ctx.india, us = ctx.us;
    return {
      trcStatus: safe(india, "dtaa.trc_status", false) === true ||
                 safe(india, "compliance_docs.trc.document_uploaded", false) === true,
      form10fFiled: safe(india, "compliance_docs.form_10f.is_filed", false) === true,
      treatyResidence: safe(india, "dtaa.dtaa_treaty_residence", "none"),
      dtaaForcedNr: safe(india, "dtaa.dtaa_forced_nr", false) === true,
      hasPE: safe(india, "dtaa.has_permanent_establishment_in_india", false) === true,
      usTreatyResidence: safe(us, "us_residency_detail.dtaa_treaty_residence", "none"),
      files1040nr: safe(us, "nra_specific.files_form_1040nr", false) === true,
      form8833Implied: safe(us, "us_residency_detail.dtaa_treaty_residence", "none") !== "none",
      chapterXiiaElected: safe(india, "compliance_docs.chapter_xiia_elected", false) === true,
      tieBreakHome: safe(india, "dtaa.tb_home", null),
      tieBreakCvi: safe(india, "dtaa.tb_cvi", null),
      tieBreakAbode: safe(india, "dtaa.tb_abode", null),
      tieBreakNationality: safe(india, "dtaa.tb_nationality", null),
      treatyElections: safe(india, "dtaa.treaty_elections", []) || []
    };
  }
};

/* ---- computed.headline (computation.js L1827-1838) ---------------------- */
NODES.headlineResult = {
  deps: ["identityResult", "metaResult", "totalIndiaIncomeInr", "aggregateUsIncomeResult",
    "totalTaxInrCombined", "usTaxResult", "residencyResult", "ftcResult"],
  compute: function (d) {
    return {
      name: d.identityResult.name,
      baseYear: d.metaResult.baseYear,
      jurisdiction: d.metaResult.jurisdiction,
      totalIncomeUsd: d.aggregateUsIncomeResult.total.usd + d.totalIndiaIncomeInr / INR_PER_USD,
      indiaTaxUsd: d.totalTaxInrCombined / INR_PER_USD,
      usTaxUsd: d.usTaxResult.totalTaxBeforeFtcUsd,
      combinedTaxBeforeReliefUsd: d.totalTaxInrCombined / INR_PER_USD + d.usTaxResult.totalTaxBeforeFtcUsd,
      worldwideOverlap: d.residencyResult.worldwideOverlap,
      netUnrelievedDoubleTaxUsd: d.ftcResult.netUnrelievedDoubleTaxUsd
    };
  }
};

/* ---- direct one-line redefinitions -------------------------------------- */
NODES.usEntityKind = { deps: ["entityResult"], compute: function (d) { return d.entityResult.usKind; } };
NODES.baseYearUs = { deps: ["metaResult"], compute: function (d) { return d.metaResult.baseYear; } };
NODES.vdaSaleConsiderationInrBoundary = { deps: ["capitalGainsComputation"], compute: function (d) { return d.capitalGainsComputation.vdaSaleConsiderationInr; } };

/* ---- synthetic-ctx overrides: original compute, boundary swapped -------- */
function withSyntheticCtx(orig, extraDeps, buildCtx) {
  return {
    deps: orig.deps.concat(extraDeps),
    scopeGate: orig.scopeGate, outOfScopeValue: orig.outOfScopeValue,
    compute: function (d, ctx) { return orig.compute(d, buildCtx(d, ctx)); }
  };
}

NODES.monitorProgressResult = withSyntheticCtx(baseNodes.monitorProgressResult, ["metaResult"], function (d, ctx) {
  return { model: { meta: d.metaResult }, monitorAsOfBoundary: ctx.monitorAsOfBoundary };
});
NODES.residencyMonitorResult = withSyntheticCtx(baseNodes.residencyMonitorResult,
  ["entityResult", "metaResult", "residencyModelSliceResult", "companyResidencyResult", "residencyResult"],
  function (d) {
    return {
      model: { entity: d.entityResult, meta: d.metaResult, residency: d.residencyModelSliceResult, companyResidency: d.companyResidencyResult },
      computed: { residency: d.residencyResult }
    };
  });
NODES.projectionsMonitorResult = withSyntheticCtx(baseNodes.projectionsMonitorResult, ["limitsResult"], function (d) {
  return { computed: { limits: d.limitsResult } };
});
NODES.calendarMonitorResult = withSyntheticCtx(baseNodes.calendarMonitorResult, ["metaResult"], function (d) {
  return { model: { meta: d.metaResult } };
});
// healthAlertsMonitorResult and monitorResult read NO ctx at all (pure
// functions of their deps, verified by grep) — no override needed: they
// automatically consume the overridden upstream monitor nodes by id.
NODES.summaryResult = withSyntheticCtx(baseNodes.summaryResult,
  ["identityResult", "metaResult", "residencyResult", "headlineResult", "monitorResult"],
  function (d) {
    return {
      model: { identity: d.identityResult, meta: d.metaResult },
      computed: { residency: d.residencyResult, headline: d.headlineResult },
      monitoringBoundary: d.monitorResult
    };
  });

/* ---- the four original finding graphs' v1-era boundaries ----------------
 * in1/us1/us5/xb7-nodes.js were the effort's FIRST graphs — their leaves
 * still read ctx.computed/ctx.model from before any of the closures
 * existed. report-batch5 merged them for findingsAllResult without
 * re-pointing those leaves (invisible until the bare-ctx runner, since
 * every earlier runner supplied a full model/computed). All 16 closed
 * here against the now-existing in-graph equivalents. */
NODES.baseYear = { deps: ["metaResult"], compute: function (d) { return d.metaResult.baseYear; } }; // shared id: in1-nodes + us5-nodes
NODES.assessedTaxInrBoundary = { deps: ["totalTaxInrCombined"], compute: function (d) { return num(d.totalTaxInrCombined); } };
NODES.hasValidPresumptiveEntryBoundary = { deps: ["businessComputation"], compute: function (d) { return !!d.businessComputation.indiaHasValidPresumptiveEntry; } };
NODES.hasRegularBooksEntryBoundary = { deps: ["businessComputation"], compute: function (d) { return !!d.businessComputation.indiaHasRegularBooksEntry; } };
NODES.hasPartnerFirmIncomeBoundary = { deps: ["businessComputation"], compute: function (d) { return !!d.businessComputation.indiaHasPartnerFirmIncome; } };
NODES.businessInrBoundary = { deps: ["businessComputation"], compute: function (d) { return num(d.businessComputation.businessInr); } };
NODES.speculativeIncomeInrBoundary = { deps: ["speculativeIncomeInrAgg"], compute: function (d) { return num(d.speculativeIncomeInrAgg); } };
// normalize L2551: assets.indianBusinesses = annual.domestic_income.business_income.business_entries
NODES.indianBusinessesBoundary = { deps: ["annualSliceAgg"], compute: function (d) { return safe(d.annualSliceAgg.domestic_income || {}, "business_income.business_entries", []); } };
NODES.usTotalTaxBeforeFtcUsdBoundary = { deps: ["usTaxResult"], compute: function (d) { return num(d.usTaxResult.totalTaxBeforeFtcUsd); } };
NODES.usAgiUsdBoundary = { deps: ["usTaxResult"], compute: function (d) { return num(d.usTaxResult.agiUsd); } };
NODES.usFtcAllowedUsdBoundary = { deps: ["ftcResult"], compute: function (d) { return num(d.ftcResult.us.ftcAllowedUsd); } };
// aggregateAccounts' account LIST (normalize L1997-2008) — batch5's
// aggregatePeakUsdResult ports only the peak; XB-7 needs the per-account
// rows. Same source raw node, same construction:
NODES.accountsBoundary = {
  deps: ["bankAccountsRaw"],
  compute: function (d) {
    var indianAccounts = d.bankAccountsRaw.india.map(function (b) {
      return { bank: b.bank_name || "Indian Bank", type: b.account_type || "savings",
               peak: { inr: num(b.peak_balance_inr), usd: num(b.peak_balance_inr) / INR_PER_USD }, country: "India" };
    });
    var usDisclosed = d.bankAccountsRaw.us.map(function (b) {
      return { bank: b.bank_name || "Bank", type: b.account_type || "savings",
               peak: b.peak_balance_usd !== undefined
                 ? { usd: num(b.peak_balance_usd), inr: num(b.peak_balance_usd) * INR_PER_USD }
                 : { inr: num(b.peak_balance_inr), usd: num(b.peak_balance_inr) / INR_PER_USD },
               country: b.country || "India" };
    });
    return indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
  }
};
NODES.usSourceTotalUsdBoundary = { deps: ["aggregateUsIncomeResult"], compute: function (d) { return num(d.aggregateUsIncomeResult.usSourceTotal.usd); } };
NODES.usSecuritiesBoundary = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "financial_holdings", []) || []; } };

/* ---- analyzeResult: monitoring now in-graph; model/computed are echoes -- */
NODES.modelEchoBoundary = { deps: [], compute: function (d, ctx) { return ctx.model || null; } };
NODES.computedEchoBoundary = { deps: [], compute: function (d, ctx) { return ctx.computed || null; } };
NODES.analyzeResult = withSyntheticCtx(baseNodes.analyzeResult,
  ["modelEchoBoundary", "computedEchoBoundary", "monitorResult"],
  function (d) {
    return { model: d.modelEchoBoundary, computed: d.computedEchoBoundary, monitoringBoundary: d.monitorResult };
  });

module.exports = { NODES: NODES };

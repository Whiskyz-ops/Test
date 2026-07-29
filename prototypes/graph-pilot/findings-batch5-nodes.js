"use strict";
/* ============================================================================
 * CFL-6 batch 5: equity_comp_sourcing, iso_3921, state_income_tax,
 * form67_required, fbar_limit, lrs_limit, trump_account_contribution_limit.
 *
 * Every one of these was previously scoped as blocked on a genuinely
 * separate subsystem (AGG-9, TAX-9, AGG-6, LIM-1..6) — re-reading each
 * source function in full this batch shows every one of those "subsystems"
 * is actually a small, self-contained function, not a large port:
 *
 *   - aggregateEquityComp (normalize.js:1964-1984, AGG-9): ~20 lines, one
 *     new node closes BOTH equity_comp_sourcing and iso_3921.
 *   - computeUsStateTax (computation.js:1133-1182, TAX-9): ~50 lines, a
 *     flat CA/NY bracket table (the only two states this engine models —
 *     same table state_treaty_not_binding's own detail already
 *     references) applied to usTaxResult.agiUsd, already exposed.
 *   - aggregateTaxesPaid (normalize.js:2017-2052, AGG-6): ~35 lines, pure
 *     raw-fact summation — form67_required only reads .us.total.usd, not
 *     the india side or any withholding-detail machinery.
 *   - computeLimits' fbar/lrs/trump_account gauges (computation.js:1449-
 *     1502): each one is a raw-fact comparison against a CONST.LIMITS
 *     threshold — fbar needs aggregateAccounts() (normalize.js:1997-2014,
 *     also small, self-contained), lrs/trump_account need only
 *     model.limitsRaw fields already read elsewhere in this same file
 *     for feie_ineligible/feie_applied (batch 4). Did NOT need AGG-8
 *     (computeLrsTcs) at all — the lrs gauge reads limitsRaw.lrsRemittedInr
 *     directly, a raw fact, never that function's output.
 *
 * Deliberately NOT in this batch: holding_period_mismatch_, the one
 * remaining finding that genuinely needs new architecture (a second
 * computeUsTax pass with modified foreign-capital-gains inputs) rather
 * than a new derivation from already-available facts — a materially
 * different kind of work from everything else closed this session.
 *
 * Verified in run-findings5.js: exact finding-ID-set match against
 * detectConflicts()'s real findings array for all 11 real profiles, plus
 * full detail-text comparison for every finding that DOES fire.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(v, ctx) { return Number(v) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js
function moneyFromInr(inr, ctx) { return { inr: inr, usd: inrToUsd(inr, ctx) }; }
function moneyFromUsd(v, ctx) { return { usd: v, inr: v * fxRate(ctx) }; }
function addMoney(a, b) { return { usd: a.usd + b.usd, inr: a.inr + b.inr }; }
function zeroMoney() { return { usd: 0, inr: 0 }; }
function bracketTax(amount, slabs) {
  var t = Math.max(0, amount), tax = 0, prev = 0;
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; } else break; }
  return tax;
}
// Added for CFL-7 (buildTaxComputation's usState.rows trace) — same
// bracket-walk as bracketTax above, but returns one row per bracket
// actually reached instead of just the total.
function bracketBreakdown(amount, slabs) {
  var t = Math.max(0, amount), prev = 0, rows = [];
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { var taxable = Math.min(t, cap) - prev; rows.push({ from: prev, to: cap, rate: rate, taxable: taxable, tax: taxable * rate }); prev = cap; } else break; }
  return rows;
}

var findingsBatch4Nodes = require("./findings-batch4-nodes.js").NODES;
var NODES = {};
Object.keys(findingsBatch4Nodes).forEach(function (k) { NODES[k] = findingsBatch4Nodes[k]; });

// ---- AGG-9: aggregateEquityComp, ported in full (normalize.js:1964-1984) --
NODES.equityCompRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "equity_compensation", {}) || {}; } };
NODES.esopEventsRaw = { deps: ["diAgg"], compute: function (d) { return safe(d.diAgg, "salary.esop_perquisite_events", []) || []; } };
NODES.esopPerquisiteInrRaw = { deps: ["diAgg"], compute: function (d) { return num(safe(d.diAgg, "salary.esop_perquisite_inr", 0)); } };
NODES.equityCompResult = {
  deps: ["equityCompRaw", "esopEventsRaw", "esopPerquisiteInrRaw"],
  compute: function (d) {
    var ec = d.equityCompRaw;
    var rsuIncomeUsd = 0, nsoIncomeUsd = 0;
    (safe(ec, "rsu_vestings", []) || []).forEach(function (r) { rsuIncomeUsd += num(r.gross_income_usd != null ? r.gross_income_usd : num(r.fmv_at_vest_usd) * num(r.shares_vested)); });
    (safe(ec, "nso_exercises", []) || []).forEach(function (n) { nsoIncomeUsd += num(n.ordinary_income_recognized_usd != null ? n.ordinary_income_recognized_usd : Math.max(0, (num(n.fmv_at_exercise_usd) - num(n.strike_price_usd)) * num(n.shares_exercised))); });
    var isoCount = (safe(ec, "iso_exercises", []) || []).length;
    var esopEvents = d.esopEventsRaw;
    var esopFromEvents = esopEvents.reduce(function (s, e) { return s + num(e.perquisite_value_inr); }, 0);
    var esopPerquisiteInr = esopEvents.length > 0 ? esopFromEvents : d.esopPerquisiteInrRaw;
    return {
      hasUsEquityComp: safe(ec, "has_equity_comp", false) === true || rsuIncomeUsd > 0 || nsoIncomeUsd > 0 || isoCount > 0,
      rsuIncomeUsd: rsuIncomeUsd, nsoIncomeUsd: nsoIncomeUsd, isoExerciseCount: isoCount,
      esopPerquisiteInr: esopPerquisiteInr, esopGrantEvents: esopEvents
    };
  }
};

// ---- TAX-9: computeUsStateTax, ported in full (computation.js:1133-1182) --
/* SYS-1: verified-identical copy of CONST.TAX.US_STATES (CA/NY brackets,
 * std deductions, AGI thresholds) replaced by the shared import. */
var CONST_B5 = require("./constants.js").CONST;
var US_STATES = CONST_B5.TAX.US_STATES;

// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.7 —
// "US state income tax, Phase 2", 21 Jul 2026): the engine models only
// CA/NY (this file's own header comment already says so). Extended here,
// DAG-only, with the two remaining "top-5 NRI state" gaps the tracker's
// own US-12 row named:
//   - NJ: a real bracket table, structured the same shape as CA/NY so the
//     existing report-layer trace (report-batch2-nodes.js's
//     buildTaxComputationUsStateResult) needs no changes to render it. NJ's
//     own "personal exemption" ($1,000 filer + $1,000 spouse if MFJ, $1,500/
//     dependent) is modeled as STD_DEDUCTION/DEPENDENT_EXEMPTION_USD — same
//     dollar effect, different NJ-specific label wired through
//     STD_DEDUCTION_LABEL/DEPENDENT_EXEMPTION_LABEL so the trace text still
//     reads correctly (NJ doesn't literally have a "standard deduction").
//     TY2025 brackets (NJ hasn't changed these in several years) — best-
//     available figures, not independently re-verified for the exact
//     TY2026 vintage, same "confirm before filing" discipline as every
//     other estimated figure in this codebase.
//   - AK/FL/NV/SD/TN/TX/WA/WY: states with NO individual income tax at all.
//     Previously indistinguishable from an unmodeled state — both silently
//     returned null, so a TX/WA resident saw no state card at all, reading
//     as "not computed" rather than "genuinely zero." Now returns an
//     explicit confirmed-zero result instead of silence.
var US_STATES_NJ_NY_SHAPE_EXT = {
  NJ: {
    NAME: "New Jersey",
    FORM_NAME: "Form NJ-1040",
    // NJ Div. of Taxation, TY2024 schedule (unchanged for several years) —
    // best-available figures, see file comment above.
    BRACKETS: {
      single: [[20000, 0.014], [35000, 0.0175], [40000, 0.035], [75000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [Infinity, 0.1075]],
      mfj: [[20000, 0.014], [50000, 0.0175], [70000, 0.0245], [80000, 0.035], [150000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [Infinity, 0.1075]]
    },
    // NJ has no standard deduction — a $1,000 personal exemption (filer),
    // another $1,000 if MFJ (spouse), modeled here as the STD_DEDUCTION
    // slot since the dollar effect (subtracted from AGI before bracket tax)
    // is identical; STD_DEDUCTION_LABEL corrects the trace wording.
    STD_DEDUCTION: { single: 1000, mfj: 2000 },
    STD_DEDUCTION_LABEL: "personal exemption",
    DEPENDENT_EXEMPTION_USD: 1500,
    DEPENDENT_EXEMPTION_LABEL: "NJ dependent exemption ($1,500/dependent)",
    // 529 state tax deduction (task #45 follow-up), NJ College Affordability
    // Act (effective TY2022): up to $10,000/year for contributions to
    // NJBEST (NJ's own 529 plan) -- a FLAT cap regardless of filing status
    // (unlike NY's status-split cap), gated on NJ gross income <= $200,000.
    // Verified via web search, cross-checked against two independent
    // sources.
    FIVE29_DEDUCTION_MAX_USD: { single: 10000, mfj: 10000 },
    FIVE29_DEDUCTION_INCOME_CAP_USD: 200000
  }
};
var NO_INDIVIDUAL_INCOME_TAX_STATES = { AK: 1, FL: 1, NV: 1, SD: 1, TN: 1, TX: 1, WA: 1, WY: 1 };
var STATE_NAMES = {
  AK: "Alaska", FL: "Florida", NV: "Nevada", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", WA: "Washington", WY: "Wyoming"
};
var US_STATES_EXT = Object.assign({}, US_STATES, US_STATES_NJ_NY_SHAPE_EXT);

NODES.usStateTaxResult = {
  deps: ["usEntityKind", "treatyFiles1040nrRaw", "s6013hElection", "stateResidencyRaw", "usFilingStatusRaw", "dedUs", "usTaxResult"],
  compute: function (d) {
    var isNra = d.treatyFiles1040nrRaw && !d.s6013hElection;
    if (d.usEntityKind !== "individual" || isNra) return null;
    var sr = d.stateResidencyRaw;
    var stateCode = sr.domicileDec31 || sr.primaryState || sr.domicileJan1;
    if (!stateCode) return null;
    if (NO_INDIVIDUAL_INCOME_TAX_STATES[stateCode]) {
      return {
        state: stateCode, stateName: STATE_NAMES[stateCode] || stateCode, formName: null, filingStatus: d.usFilingStatusRaw === "mfj" ? "mfj" : "single",
        noIncomeTax: true, agiUsd: d.usTaxResult.agiUsd, standardDeductionUsd: 0, dependentExemptionUsd: 0, five29DeductionUsd: 0,
        taxableIncomeUsd: 0, bracketTaxUsd: 0, bracketBreakdown: [], surchargeUsd: 0, surchargeLabel: null,
        exemptionCreditUsd: 0, dependentCreditUsd: 0, totalTaxUsd: 0, effectiveRate: 0,
        basis: (STATE_NAMES[stateCode] || stateCode) + " has no individual income tax."
      };
    }
    var T = US_STATES_EXT[stateCode];
    if (!T) return null;
    var status = d.usFilingStatusRaw === "mfj" ? "mfj" : "single";
    var brackets = T.BRACKETS[status];
    var standardDeductionUsd = T.STD_DEDUCTION[status];
    var dependents = d.dedUs.dependents || 0;
    var dependentExemptionUsd = (T.DEPENDENT_EXEMPTION_USD || 0) * dependents;
    // 529 state tax deduction (task #45 follow-up): only the RESIDENT
    // state's own plan qualifies (NY/NJ both restrict the deduction to
    // contributions to their own 529 program, not another state's) --
    // compared against the state the taxpayer actually funded, not assumed
    // to match residency. NJ additionally gates on a gross-income cap (CA
    // has no FIVE29_DEDUCTION_MAX_USD key at all -- no deduction exists).
    var five29StateMatches = d.dedUs.funded529Plan && d.dedUs.five29StateDeductionState &&
      String(d.dedUs.five29StateDeductionState).toUpperCase() === stateCode;
    var five29IncomeOk = T.FIVE29_DEDUCTION_INCOME_CAP_USD == null || d.usTaxResult.agiUsd <= T.FIVE29_DEDUCTION_INCOME_CAP_USD;
    var five29CapUsd = T.FIVE29_DEDUCTION_MAX_USD ? (T.FIVE29_DEDUCTION_MAX_USD[status] || T.FIVE29_DEDUCTION_MAX_USD.single) : 0;
    var five29DeductionUsd = (five29StateMatches && five29IncomeOk) ? Math.min(d.dedUs.five29ContributionsUsd || 0, five29CapUsd) : 0;
    var taxableIncomeUsd = Math.max(0, d.usTaxResult.agiUsd - standardDeductionUsd - dependentExemptionUsd - five29DeductionUsd);
    var bracketTaxUsd = bracketTax(taxableIncomeUsd, brackets);
    var bracketBreakdownRows = bracketBreakdown(taxableIncomeUsd, brackets);
    var surchargeUsd = 0;
    if (T.SURCHARGE_THRESHOLD_USD != null && taxableIncomeUsd > T.SURCHARGE_THRESHOLD_USD) {
      surchargeUsd = (taxableIncomeUsd - T.SURCHARGE_THRESHOLD_USD) * T.SURCHARGE_RATE;
    }
    var exemptionCreditUsd = (T.EXEMPTION_CREDIT_USD && T.EXEMPTION_CREDIT_USD[status]) || 0;
    var dependentCreditUsd = (T.DEPENDENT_CREDIT_USD || 0) * dependents;
    var totalTaxUsd = Math.max(0, Math.round(bracketTaxUsd + surchargeUsd - exemptionCreditUsd - dependentCreditUsd));
    return {
      state: stateCode, stateName: T.NAME, formName: T.FORM_NAME, filingStatus: status,
      noIncomeTax: false,
      agiUsd: d.usTaxResult.agiUsd, standardDeductionUsd: standardDeductionUsd, dependentExemptionUsd: dependentExemptionUsd,
      standardDeductionLabel: T.STD_DEDUCTION_LABEL || "standard deduction",
      dependentExemptionLabel: T.DEPENDENT_EXEMPTION_LABEL || (T.NAME + " dependent exemption"),
      five29DeductionUsd: five29DeductionUsd,
      taxableIncomeUsd: taxableIncomeUsd, bracketTaxUsd: bracketTaxUsd, bracketBreakdown: bracketBreakdownRows,
      surchargeUsd: surchargeUsd, surchargeLabel: T.SURCHARGE_LABEL || null,
      exemptionCreditUsd: exemptionCreditUsd, dependentCreditUsd: dependentCreditUsd,
      totalTaxUsd: totalTaxUsd, effectiveRate: d.usTaxResult.agiUsd > 0 ? totalTaxUsd / d.usTaxResult.agiUsd : 0,
      basis: "TY2025 rates (returns filed 2026); full-year resident, worldwide income via federal AGI, no foreign tax credit against state tax."
    };
  }
};

// ---- AGG-6: aggregateTaxesPaid, ported in full (normalize.js:2017-2052) --
NODES.taxesPaidUsResult = {
  deps: [], compute: function (d, ctx) {
    var we = safe(ctx.us, "withholding_and_estimated", {});
    var usWithholding = num(safe(we, "federal_withholding_total_usd", 0));
    var usEstimated = num(safe(we, "estimated_tax_q1_apr15_usd", 0)) + num(safe(we, "estimated_tax_q2_jun15_usd", 0)) +
      num(safe(we, "estimated_tax_q3_sep15_usd", 0)) + num(safe(we, "estimated_tax_q4_jan15_usd", 0));
    // Form 2210 100%/110%-of-prior-year safe-harbor figure — null (not 0)
    // when never entered, matching aggregateTaxesPaid's own null-vs-0
    // distinction (normalize.js:2038/2048) so a real "prior year had zero
    // tax" answer is never confused with "the preparer didn't say."
    var priorYearTotalTaxUsdRaw = safe(we, "prior_year_total_tax_usd", null);
    return {
      total: moneyFromUsd(usWithholding + usEstimated, ctx), withholding: moneyFromUsd(usWithholding, ctx),
      priorYearTotalTaxUsd: priorYearTotalTaxUsdRaw === null ? null : num(priorYearTotalTaxUsdRaw)
    };
  }
};

// ---- AGG-5: aggregateAccounts, ported in full (normalize.js:1997-2014) ---
NODES.bankAccountsRaw = {
  deps: [], compute: function (d, ctx) {
    return {
      india: safe(ctx.india, "bank_accounts", []) || [], us: safe(ctx.us, "bank_accounts", []) || [], usFormFbar: num(safe(ctx.us, "fbar_aggregate_peak_usd", 0)),
      // layer1_us.html's Step 8 screen ("Comprehensive Foreign Assets (FBAR
      // & 8938)") is ONE screen covering both bank_accounts AND this
      // financial_holdings list (securities, life insurance, etc., via
      // addHoldingRow()/syncHoldingsState()) -- the live UI's own recalc
      // folds both into fbar_aggregate_peak_usd (fbarSum, line ~9707-9716),
      // gated on is_fbar_reportable !== false per row (default true for
      // legacy entries). Read here so the last-day-of-year aggregate below
      // (which has no equivalent persisted override field -- the live UI
      // never saves its own fatcaLastDaySum anywhere) can mirror that same
      // scope; no double-count risk since aggregatePeakUsdResult's own
      // usFormFbar override replaces (not adds to) its from-scratch peak.
      usFinancialHoldings: safe(ctx.us, "financial_holdings", []) || []
    };
  }
};
NODES.aggregatePeakUsdResult = {
  deps: ["bankAccountsRaw", "hasUsScopeBoundaryFtc"],
  compute: function (d, ctx) {
    var indianAccounts = d.bankAccountsRaw.india.map(function (b) { return { peak: moneyFromInr(b.peak_balance_inr || 0, ctx) }; });
    var usDisclosed = d.bankAccountsRaw.us.map(function (b) { return { peak: b.peak_balance_usd !== undefined ? moneyFromUsd(b.peak_balance_usd, ctx) : moneyFromInr(b.peak_balance_inr || 0, ctx) }; });
    var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
    var formFbar = d.bankAccountsRaw.usFormFbar;
    if (formFbar > 0) return moneyFromUsd(formFbar, ctx);
    if (!d.hasUsScopeBoundaryFtc) return zeroMoney();
    return accounts.reduce(function (acc, a) { return addMoney(acc, a.peak); }, zeroMoney());
  }
};
// Form 8938's reporting threshold is actually TWO independent tests — value
// on the LAST DAY of the tax year, and the HIGHEST value at any time during
// the year (CONST.LIMITS.FORM_8938's lastDay/anyTime keys) — exceeding
// EITHER one triggers the filing requirement. layer1_us.html's Step 8
// ("Foreign Banks/FBAR") collects last_day_balance_usd on every account
// row specifically for this, but nothing ever read it: only the peak/
// anyTime test was ever checked (form8938GaugeResult below, and limits-
// nodes.js's parallel gauge), so a taxpayer whose balance never spiked but
// ended the year between the lastDay and anyTime thresholds was incorrectly
// told Form 8938 wasn't required. India's own bank_accounts[] has no
// last-day-balance concept at all (out of this Layer 1 US audit's scope),
// so this can only reflect what Layer 1 US itself collects.
NODES.aggregateLastDayUsdResult = {
  deps: ["bankAccountsRaw", "hasUsScopeBoundaryFtc"],
  compute: function (d, ctx) {
    if (!d.hasUsScopeBoundaryFtc) return zeroMoney();
    var usDisclosed = d.bankAccountsRaw.us.map(function (b) { return { lastDay: moneyFromUsd(b.last_day_balance_usd || 0, ctx) }; });
    // financial_holdings (securities/other assets, same Step 8 screen as
    // bank_accounts) feed the live UI's own fatcaLastDaySum the same way
    // bank accounts do, gated on is_fbar_reportable !== false — mirrored
    // here since there is no persisted override field for the last-day
    // aggregate the way fbar_aggregate_peak_usd overrides the peak one.
    var holdings = d.bankAccountsRaw.usFinancialHoldings
      .filter(function (h) { return h.is_fbar_reportable !== false; })
      .map(function (h) { return { lastDay: moneyFromUsd(h.last_day_balance_usd || 0, ctx) }; });
    return usDisclosed.concat(holdings).reduce(function (acc, a) { return addMoney(acc, a.lastDay); }, zeroMoney());
  }
};

// ---- limitsRaw fields not read by any earlier-closed phase ---------------
NODES.limitsRawExtra = {
  deps: ["annualSliceAgg"], compute: function (d, ctx) {
    // 26 U.S.C. 530A's $5,000/year cap applies PER CHILD, not as a family
    // total -- when a per-child breakdown is on file, derive the aggregate
    // fields from it (for the legacy family-wide gauge/display) AND surface
    // the single largest child contribution so the finding below can catch
    // an individual over-contribution that a family-wide total can hide.
    // Falls back to the old flat fields for data saved before this array
    // existed.
    var trumpChildrenRaw = safe(ctx.us, "profile.trump_accounts_children", null);
    var trumpChildren = Array.isArray(trumpChildrenRaw) ? trumpChildrenRaw : null;
    return {
      lrsRemittedInr: num(safe(d.annualSliceAgg, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)) ||
                      num(safe(ctx.india, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)),
      trumpAccountsOpened: safe(ctx.us, "profile.trump_accounts_opened", false) === true,
      trumpAccountsNumChildren: trumpChildren ? trumpChildren.length : num(safe(ctx.us, "profile.trump_accounts_num_children", 0)),
      trumpAccountsSeedEligibleChildren: trumpChildren
        ? trumpChildren.filter(function (c) { return c && c.born_2025_2028 === true; }).length
        : num(safe(ctx.us, "profile.trump_accounts_children_born_2025_2028", 0)),
      trumpAccountsContributionsUsd: trumpChildren
        ? trumpChildren.reduce(function (sum, c) { return sum + num(c && c.contribution_usd); }, 0)
        : num(safe(ctx.us, "profile.trump_accounts_total_contributions_usd", 0)),
      trumpAccountsMaxChildContributionUsd: trumpChildren
        ? trumpChildren.reduce(function (max, c) { return Math.max(max, num(c && c.contribution_usd)); }, 0)
        : null,
      trumpAccountsHasPerChildData: !!trumpChildren
    };
  }
};

var LIM = CONST_B5.LIMITS; // SYS-1: shared (superset of the four keys read here)
function gauge(id, valueUsd, limitUsd) {
  var pct = limitUsd > 0 ? (valueUsd / limitUsd) : 0;
  var status = pct >= 1 ? "breached" : (pct >= 0.8 ? "approaching" : "ok");
  return { id: id, value: valueUsd, limit: limitUsd, pct: pct, status: status };
}

// ---- findings, ported in full ----------------------------------------------
NODES.findingsBatch5Result = {
  deps: ["equityCompResult", "usStateTaxResult", "taxesPaidUsResult", "aggregateUsIncomeResult",
    "aggregatePeakUsdResult", "hasUsScopeBoundaryFtc", "hasIndiaScopeXbr", "limitsRawExtra"],
  compute: function (d, ctx) {
    var findings = [];
    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      findings.push({ id: id, severity: severity, category: category, title: title, detail: detail, recommendation: recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
    }

    // -- 12b. EQUITY COMPENSATION — CROSS-BORDER SOURCING (conflicts.js:1506-1528) --
    var eq = d.equityCompResult;
    if (eq.hasUsEquityComp && eq.esopPerquisiteInr > 0) {
      add("equity_comp_sourcing", "warning", "income",
        "Equity compensation taxed on both sides — cross-border sourcing not applied",
        "Both an India ESOP/perquisite event and a US equity-compensation event (RSU vest / NSO exercise) are on file " +
        "for this year. India taxes the ESOP perquisite in full at exercise/allotment (s.17(1)(vi)); the US taxes RSU " +
        "vesting / NSO exercise in full as ordinary income in the vesting/exercise year. Absent a workday-based " +
        "allocation, the same equity award can be fully taxed by BOTH countries rather than apportioned to where the " +
        "services were actually performed during the vesting period.",
        "Reconstruct the vesting-period workday split between India and the US (DTAA Art. 15/16 dependent-personal-" +
        "services sourcing) so each country only taxes its proportionate share, then claim FTC/§159 relief on the " +
        "genuinely overlapping portion rather than the full award twice.",
        0, ["DTAA Art. 15", "s.17(1)(vi)", "RSU vesting", "NSO exercise"]);
    }

    // -- 4c3. FORM 3921 — ISO INFORMATION RETURN (conflicts.js:561-571) -----
    if (eq.isoExerciseCount > 0) {
      add("iso_3921", "info", "document",
        "ISO exercise(s) on file — employer owes you Form 3921",
        eq.isoExerciseCount + " incentive stock option exercise(s) recorded this year. The employer is " +
        "required to furnish Form 3921 (one per exercise) by January 31 of the following year, reporting the grant/exercise " +
        "dates, exercise price, and FMV at exercise — the same figures already driving the AMT preference computed above.",
        "Confirm Form 3921 was received from the employer for each exercise and that its FMV/exercise-price figures match " +
        "what's on file here before relying on the AMT number.",
        0, ["Form 3921", "§6039"]);
    }

    // -- 4c6. STATE INCOME TAX (conflicts.js:607-631) ------------------------
    var st = d.usStateTaxResult;
    if (st && st.totalTaxUsd > 0) {
      add("state_income_tax", "warning", "credit",
        st.stateName + " state income tax: " + usd(st.totalTaxUsd) + " (" + st.formName + ")",
        st.stateName + " taxes a full-year resident's WORLDWIDE income, including Indian-source income already reported " +
        "on the federal and Indian returns — computed here as " + usd(st.taxableIncomeUsd) + " of state taxable income " +
        "(federal AGI " + usd(st.agiUsd) + " less the " + st.stateName + " standard deduction" +
        (st.dependentExemptionUsd > 0 ? " and dependent exemption" : "") + ") at " + st.stateName + "'s own bracket rates" +
        (st.surchargeUsd > 0 ? ", plus " + usd(st.surchargeUsd) + " (" + st.surchargeLabel + ")" : "") +
        (st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? ", less " + usd(st.exemptionCreditUsd + st.dependentCreditUsd) + " of personal/dependent credits" : "") +
        ". Neither the Foreign Tax Credit computed above nor any DTAA relief applies here — " + st.stateName +
        " is not a party to the India-US treaty and " + (st.state === "CA" ? "grants no credit for tax paid to a foreign country at all." : "does not treat Indian tax as a creditable state-level offset."),
        "File " + st.formName + " alongside the federal return. This is a full-year-resident, TY2025-rates estimate — it does not " +
        "split state-source income for a part-year or nonresident allocation, does not model " + st.stateName +
        "'s own AGI addition/subtraction adjustments beyond the standard deduction" +
        (st.dependentExemptionUsd > 0 ? "/dependent exemption" : "") + ", and (for California) does not include the local-jurisdiction " +
        "SDI/VPDI payroll tax. Treat as directional, not filing-ready.",
        st.totalTaxUsd, [st.formName, st.stateName + " residency"]);
    }

    // -- 5. FORM 67 TIMING (conflicts.js:1062-1079) --------------------------
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && (d.aggregateUsIncomeResult.foreignSourceTotal.usd > 0 || d.taxesPaidUsResult.total.usd > 0)) {
      add("form67_required", "info", "document",
        "Form 44 — required for the Indian FTC claim",
        "Foreign income / foreign tax is present, so India requires Form 44 (with Schedule FSI and TR) on or before the ITR due date to allow FTC u/s 90/91.",
        "WISING flags Form 44 (with Schedule FSI/TR) as required on the filing checklist, using the FSI/TR figures already computed above — actually preparing and e-filing it on the income-tax portal ahead of the ITR due date is still a manual step.",
        0, ["Form 44", "Rule 128", "Schedule FSI", "Schedule TR"]);
    }

    // -- 12. FBAR LIMIT BREACH (conflicts.js:1459-1468) ----------------------
    if (d.hasUsScopeBoundaryFtc) {
      var fbar = gauge("fbar", d.aggregatePeakUsdResult.usd, LIM.FBAR_AGGREGATE_USD);
      if (fbar.status === "breached") {
        add("fbar_limit", "critical", "limit",
          "FBAR threshold breached",
          "Aggregate peak balance across foreign accounts is " + usd(fbar.value) +
          ", above the USD 10,000 reporting cliff. EVERY foreign account must be reported, not just those over the limit.",
          "File FinCEN Form 114 by the due date (auto-extended to Oct 15). Non-willful penalties start at ~$10,000 per violation; willful penalties are far higher.",
          0, ["FinCEN 114", "FBAR"]);
      }
    }

    // -- 11. LRS LIMIT MONITORING (conflicts.js:1446-1457) -------------------
    if (d.hasIndiaScopeXbr) {
      var lrs = gauge("lrs", inrToUsd(d.limitsRawExtra.lrsRemittedInr, ctx), LIM.LRS_ANNUAL_USD);
      if (lrs.status !== "ok") {
        add("lrs_limit", lrs.status === "breached" ? "critical" : "warning", "limit",
          "LRS remittance " + (lrs.status === "breached" ? "limit breached" : "approaching limit"),
          "Outbound LRS remittances of " + usd(lrs.value) + " are at " + Math.round(lrs.pct * 100) +
          "% of the USD 250,000 RBI annual cap.",
          lrs.status === "breached"
            ? "A breach can attract RBI scrutiny and AD-bank refusal. Verify remittances across all banks (the cap is per-PAN, not per-account) and document the source of funds."
            : "Monitor remaining headroom for the rest of the financial year; TCS at 20% applies above ₹10 lakh.",
          0, ["RBI LRS", "TCS u/s 394(1)"]);
      }
    }

    // -- 12a. TRUMP ACCOUNT (§530A) MONITORING (conflicts.js:1470-1504) -----
    var lr = d.limitsRawExtra;
    if (lr.trumpAccountsOpened) {
      var taChildren = Math.max(1, lr.trumpAccountsNumChildren || 1);
      var trumpAcct = gauge("trump_account", lr.trumpAccountsContributionsUsd, LIM.TRUMP_ACCOUNT_ANNUAL_CAP_USD * taChildren);
      var taSeedEligible = lr.trumpAccountsSeedEligibleChildren || 0;
      var taSeedUsd = LIM.TRUMP_ACCOUNT_FEDERAL_SEED_USD;
      var seedNote = taSeedEligible > 0
        ? "A $" + taSeedUsd.toLocaleString("en-US") + " one-time federal seed contribution applies to the " + taSeedEligible +
          " child(ren) born 2025-2028 — separate from, and not counted against, the $5,000/year cap."
        : "No federal seed applies — that one-time $1,000 contribution is only for children born 2025-2028.";
      // With a real per-child breakdown, check each child's own contribution
      // against the cap directly -- a family total can stay under N x $5,000
      // while one specific child's account is individually over the limit
      // (e.g. two kids, $6,000 total split $5,500/$500: the $6,000 aggregate
      // is under the $10,000 family-wide check, but the first child alone
      // already breached their own $5,000 cap).
      var perChildBreach = lr.trumpAccountsHasPerChildData && lr.trumpAccountsMaxChildContributionUsd > LIM.TRUMP_ACCOUNT_ANNUAL_CAP_USD;
      if (perChildBreach) {
        add("trump_account_contribution_limit", "warning", "limit",
          "Trump Account (§530A) contribution cap exceeded for at least one child",
          "At least one child's account received " + usd(lr.trumpAccountsMaxChildContributionUsd) + " this year, which on its own " +
          "exceeds the $5,000/child/year cap (combined across all contributors — parents, family, employer all draw from the same " +
          "limit), independent of the family-wide total of " + usd(trumpAcct.value) + " across " + taChildren + " child(ren). " + seedNote,
          "Excess contributions are not automatically rejected by the custodian in every case — verify that specific child's account " +
          "against all contributors and consider a corrective withdrawal before the account's growth compounds on an over-contribution.",
          0, ["§530A", "Trump Account"]);
      } else if (trumpAcct.status === "breached") {
        add("trump_account_contribution_limit", "warning", "limit",
          "Trump Account (§530A) contribution cap exceeded",
          "Contributions of " + usd(trumpAcct.value) + " across " + taChildren +
          " child(ren) exceed the $5,000/child/year cap (combined across all contributors — parents, family, employer all draw " +
          "from the same limit). " + seedNote,
          "Excess contributions are not automatically rejected by the custodian in every case — verify the aggregate against " +
          "all contributors and consider a corrective withdrawal before the account's growth compounds on an over-contribution.",
          0, ["§530A", "Trump Account"]);
      } else {
        add("trump_account_contribution_limit", "info", "limit",
          "Trump Account (§530A) in use",
          "Contributions of " + usd(trumpAcct.value) + " this year are within the $5,000/child/year cap. " + seedNote +
          " Contributions are nondeductible; account growth is tax-deferred until withdrawal, and the account converts to a " +
          "Traditional IRA when the beneficiary turns 18.",
          "No action needed while under the cap — just confirm contributions are tracked in aggregate across every contributor, " +
          "not just this taxpayer's own deposits.",
          0, ["§530A", "Trump Account"]);
      }
    }

    return findings;
  }
};

module.exports = { NODES: NODES };

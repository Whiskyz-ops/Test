"use strict";
/* ============================================================================
 * CFL-7 batch 5 (last): analyze() — the top-level orchestration.
 *
 * Scope, read directly from source before writing anything (conflicts.js:
 * 2593-2657): analyze() calls normalize()+compute() (AGG-10, TAX-N, XBR-N —
 * separately tracked, largely boundary — NOT this row's job to re-derive),
 * detectConflicts() (CFL-1..6, closed) and the six buildXxx() report
 * functions (CFL-7 batches 1-4, all now closed), then assembles the final
 * 11-key return object plus a small `summary` derivation. What's genuinely
 * left to port HERE is exactly that assembly — not normalize/compute
 * themselves (model/computed stay explicit boundary inputs, exactly as
 * every other node file in this migration already treats them) and not
 * monitor() (LIM-7, a separate, untouched, genuinely large subsystem —
 * `monitoring` is read as an explicit boundary the same way, not "ported").
 *
 * findings needed concatenating all six findings-batchN-nodes.js result
 * arrays — there was never a single combined node for this since each
 * batch runner only ever needed its own batch's IDs. Verified via an
 * ID-sorted comparison (not positional array deepEqual) in run-analyze.js,
 * matching how every CFL-6 batch runner already compared findings (by ID
 * against WISING.analyze()'s own findings[], never by array position —
 * detectConflicts's internal call order was never a contract).
 *
 * taxComputation needed one new node (buildTaxComputationResult) combining
 * the three sub-objects batches 2-3 built separately — never assembled
 * into one object before since run-report2.js/run-report3.js each verified
 * their own sub-object independently.
 *
 * findingsAllResult also turned out to need FIVE findings that live
 * entirely outside the findings-batchN-nodes.js chain: `india_advance_tax_
 * interest`/`underpayment_2210`/`early_withdrawal_penalty_72t`/
 * `black_money_act_exposure`/`schedule_fa_inconsistent` — CFL-1..5's
 * earliest prototype findings (in1-nodes.js, us1-nodes.js, us5-nodes.js,
 * xb7-nodes.js), from before the "full finding object" convention existed.
 * Those files only ever built {shouldFire, amountUsd}-shaped nodes,
 * verified against production by run-batch2.js — never the full
 * {id,severity,category,title,detail,recommendation,amountUsd,refs} object
 * `analyzeResult`'s findings[] actually needs. Built here from those
 * already-verified numeric/boolean pieces, with the exact title/detail/
 * recommendation text re-read fresh from conflicts.js (not from memory).
 * The 8 residency_status_* findings needed no such work —
 * residencyConsistencyFindings (residency-nodes.js) already builds full
 * objects and was already reachable from this chain.
 * ==========================================================================*/
var reportBatch4Nodes = require("./report-batch4-nodes.js").NODES;
var xb7Nodes = require("./xb7-nodes.js").NODES;
var us1Nodes = require("./us1-nodes.js").NODES;
var us5Nodes = require("./us5-nodes.js").NODES;
var in1Nodes = require("./in1-nodes.js").NODES;
var NODES = {};
Object.keys(reportBatch4Nodes).forEach(function (k) { NODES[k] = reportBatch4Nodes[k]; });
// These four small files share several raw-leaf names with each other
// (routerJurisdiction, routerUsSignal, hasIndiaScope, hasUsScope, dobRaw,
// baseYear, indiaResidencyStatusRaw) and with the big chain
// (indiaForeignAssetsDeclaredRaw, indiaEntityTypeRaw, indiaIsCompany) —
// verified by diffing every shared key's compute-function source across
// all four files: every one of those is a behaviorally identical
// single-line read, just formatted differently in each file, so "last
// merge wins" is safe. shouldFire is the one genuine, dangerous exception —
// each file's shouldFire is a DIFFERENT finding's fire condition — so it's
// aliased to a unique per-file name BEFORE the generic merge, instead of
// being silently overwritten three times down to just in1's version.
NODES.xb7ShouldFire = xb7Nodes.shouldFire;
NODES.us1ShouldFire = us1Nodes.shouldFire;
NODES.us5ShouldFire = us5Nodes.shouldFire;
NODES.in1ShouldFire = in1Nodes.shouldFire;
[xb7Nodes, us1Nodes, us5Nodes, in1Nodes].forEach(function (nodes) {
  Object.keys(nodes).forEach(function (k) { if (k !== "shouldFire") NODES[k] = nodes[k]; });
});

function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function inrToUsd(v) { return Number(v) / 83.0; }

/* india_advance_tax_interest — conflicts.js:452-463, ss.424/425. */
NODES.indiaAdvanceTaxInterestFinding = {
  deps: ["in1ShouldFire", "totalInterestInr", "advancePaidInr", "assessedTaxInr", "s424Inr", "inS424Months", "inIsAuditCase", "s425Inr", "inPurelyPresumptive"],
  compute: function (d) {
    if (!d.in1ShouldFire) return [];
    var inAdvInterestInr = d.totalInterestInr;
    return [{
      id: "india_advance_tax_interest", severity: "warning", category: "credit",
      title: "Advance-tax interest exposure — ss.424/425 (" + inr(inAdvInterestInr) + ")",
      detail: "Advance tax paid (" + inr(d.advancePaidInr) + ") falls short of the assessed tax (" + inr(d.assessedTaxInr) +
        ") this year. At 1%/month simple interest: " + inr(d.s424Inr) + " under s.424 (shortfall below the 90% floor, " +
        d.inS424Months + " months to the " + (d.inIsAuditCase ? "audit-case (31 Oct)" : "non-audit (31 Jul)") +
        " due date) + " + inr(d.s425Inr) + " under s.425 (" +
        (d.inPurelyPresumptive ? "single 15-Mar installment shortfall — presumptive-scheme filers owe 100% in one installment, s.425 proviso"
          : "quarter-by-quarter installment shortfalls") + "). Both keep " +
        "accruing past the due date until actually paid — this is the exposure AS OF the due date, not a final number.",
      recommendation: "Pay the shortfall before filing to stop s.424 interest accruing further; s.425's quarter-by-quarter amount is " +
        "fixed once the year ends and doesn't grow. If the year isn't over yet, revise the remaining installment(s) upward.",
      amountUsd: inrToUsd(inAdvInterestInr), refs: ["s.424", "s.425", "1%/month simple interest"]
    }];
  }
};

/* underpayment_2210 — conflicts.js:511-521, Form 2210. */
NODES.underpayment2210Finding = {
  deps: ["us1ShouldFire", "us2210PenaltyUsd", "usPaidTotalUsd", "usCurrentHarborUsd", "usPriorHarborUsd", "usPriorHarborPct"],
  compute: function (d) {
    if (!d.us1ShouldFire) return [];
    var penaltyUsd = d.us2210PenaltyUsd;
    return [{
      id: "underpayment_2210", severity: "warning", category: "credit",
      title: "US estimated-tax underpayment penalty — Form 2210 (" + usd(penaltyUsd) + " estimated)",
      detail: "Withholding + estimated payments (" + usd(d.usPaidTotalUsd) + ") fall short of both safe harbors: 90% of this year's " +
        "tax (" + usd(d.usCurrentHarborUsd) + ") and " + (d.usPriorHarborUsd != null
          ? Math.round(d.usPriorHarborPct * 100) + "% of last year's tax (" + usd(d.usPriorHarborUsd) + ")"
          : "the prior-year safe harbor (last year's total tax was never entered, so only the current-year harbor could be checked)") +
        ", with a balance due over the $1,000 de-minimis. Estimated penalty (simplified regular method, equal quarterly " +
        "installments, withholding spread evenly, no cross-quarter netting): " + usd(penaltyUsd) + ".",
      recommendation: "Confirm against the real Form 2210 (it can use the Annualized Income Installment Method for uneven income, which " +
        "this estimate does not model, and could produce a lower number). Paying the shortfall now stops further accrual.",
      amountUsd: Math.max(0, penaltyUsd), refs: ["Form 2210", "§6654"]
    }];
  }
};

/* early_withdrawal_penalty_72t — conflicts.js:549-557. */
NODES.earlyWithdrawalPenalty72tFinding = {
  deps: ["us5ShouldFire", "penalty72tUsd", "earlyDistUsd", "ageAtYearEndUs"],
  compute: function (d) {
    if (!d.us5ShouldFire) return [];
    return [{
      id: "early_withdrawal_penalty_72t", severity: "warning", category: "credit",
      title: "§72(t) 10% early-withdrawal penalty on IRA/401(k) distributions (" + usd(d.penalty72tUsd) + ")",
      detail: usd(d.earlyDistUsd) + " of IRA/401(k) distributions are on file for a taxpayer age " + d.ageAtYearEndUs +
        " at year-end — under the 59½ threshold. Absent a statutory exception, §72(t) adds a flat 10% additional tax (" +
        usd(d.penalty72tUsd) + ") on top of ordinary income tax already computed on this same income.",
      recommendation: "Confirm whether a real exception applies (death, disability, SEPP under §72(t)(2)(A)(iv), first $10,000 for a " +
        "first-time home purchase, higher education, medical expenses over 7.5% of AGI, qualified birth/adoption up to " +
        "$5,000) — none of these are captured by Layer 1 today, so this assumes the full 10% applies until confirmed otherwise.",
      amountUsd: d.penalty72tUsd, refs: ["§72(t)", "Form 5329"]
    }];
  }
};

/* schedule_fa_inconsistent — conflicts.js:1338-1346. */
NODES.scheduleFaInconsistentFinding = {
  deps: ["scheduleFaInconsistentTrigger"],
  compute: function (d) {
    if (!d.scheduleFaInconsistentTrigger) return [];
    return [{
      id: "schedule_fa_inconsistent", severity: "critical", category: "document",
      title: "Layer 1 forms disagree: India form says 'no foreign assets', US form shows foreign holdings",
      detail: "The India intake form explicitly records NO foreign assets, but the US intake form shows US-source income and/or " +
        "non-Indian accounts for the same taxpayer — who is an Indian ROR this year and therefore subject to worldwide " +
        "Schedule FA disclosure. This is a direct contradiction between the two forms, not just a missing field.",
      recommendation: "Reconcile the two forms before filing: either the India form's 'no foreign assets' answer needs correcting, or the " +
        "US-side accounts/income need to be re-checked. Schedule FA penalties for non-disclosure are severe and independent " +
        "of whether any tax is actually due on the asset.",
      amountUsd: 0, refs: ["Schedule FA", "Black Money Act"]
    }];
  }
};

/* black_money_act_exposure — conflicts.js:1375-1385, XB-7. */
NODES.blackMoneyActExposureFinding = {
  deps: ["scheduleFaInconsistentTrigger", "xb7ShouldFire", "bmaAssetValueUsd", "bmaMaxTotalUsd"],
  compute: function (d) {
    if (!d.scheduleFaInconsistentTrigger || !d.xb7ShouldFire) return [];
    var bmaTaxUsd = d.bmaAssetValueUsd * 0.30;
    var bmaMaxPenaltyUsd = bmaTaxUsd * 3;
    return [{
      id: "black_money_act_exposure", severity: "critical", category: "document",
      title: "Black Money Act 2015 exposure on undisclosed foreign assets — up to " + usd(d.bmaMaxTotalUsd) + " at stake",
      detail: usd(d.bmaAssetValueUsd) + " of foreign asset value is undisclosed on Schedule FA (same forms-disagree fact as " +
        "above). The Black Money Act imposes a flat 30% tax (" + usd(bmaTaxUsd) + ") on the asset value PLUS a penalty " +
        "of up to 3x that tax (up to " + usd(bmaMaxPenaltyUsd) + ") — up to " + usd(d.bmaMaxTotalUsd) +
        " total (120% of the asset's value) — PLUS possible prosecution (up to 10 years' rigorous imprisonment for " +
        "willful evasion), independent of and in addition to the monetary exposure.",
      recommendation: "Correct the Schedule FA disclosure before this compounds further. FAST-DS 2026 (a one-time amnesty window, gap " +
        "tracker XB-21) offers a much cheaper cure — 30% tax + 30% penalty (60% total) if the asset/income was never " +
        "taxed, or a flat ₹1,00,000 fee if it was bought from already-taxed income or acquired while genuinely NRI.",
      amountUsd: d.bmaMaxTotalUsd, refs: ["Black Money Act 2015", "s.10", "s.41", "s.51", "Schedule FA"]
    }];
  }
};

NODES.buildTaxComputationResult = {
  deps: ["buildTaxComputationIndiaResult", "buildTaxComputationUsResult", "buildTaxComputationUsStateResult"],
  compute: function (d) {
    return { india: d.buildTaxComputationIndiaResult, us: d.buildTaxComputationUsResult, usState: d.buildTaxComputationUsStateResult };
  }
};

NODES.findingsAllResult = {
  deps: ["findingsBatch1Result", "findingsBatch2Result", "findingsBatch3Result", "findingsBatch4Result",
    "findingsBatch5Result", "holdingPeriodMismatchFindingsResult", "residencyConsistencyFindings",
    "indiaAdvanceTaxInterestFinding", "underpayment2210Finding", "earlyWithdrawalPenalty72tFinding",
    "scheduleFaInconsistentFinding", "blackMoneyActExposureFinding"],
  compute: function (d) {
    return [].concat(d.findingsBatch1Result, d.findingsBatch2Result, d.findingsBatch3Result,
      d.findingsBatch4Result, d.findingsBatch5Result, d.holdingPeriodMismatchFindingsResult,
      d.residencyConsistencyFindings, d.indiaAdvanceTaxInterestFinding, d.underpayment2210Finding,
      d.earlyWithdrawalPenalty72tFinding, d.scheduleFaInconsistentFinding, d.blackMoneyActExposureFinding);
  }
};

NODES.summaryResult = {
  deps: ["findingsAllResult", "buildDocumentsResult"],
  compute: function (d, ctx) {
    var model = ctx.model, computed = ctx.computed;
    var counts = { critical: 0, warning: 0, info: 0 };
    d.findingsAllResult.forEach(function (x) { counts[x.severity]++; });
    var monitoring = ctx.monitoringBoundary;
    return {
      name: model.identity.name,
      baseYear: model.meta.baseYear,
      jurisdiction: model.meta.jurisdiction,
      hasIndia: model.meta.hasIndia,
      hasUs: model.meta.hasUs,
      indiaQuarterly: model.meta.indiaQuarterly,
      indiaStatus: computed.residency.india.status,
      usStatus: computed.residency.us.status,
      dualResident: computed.residency.dualResident,
      totalIncomeUsd: computed.headline.totalIncomeUsd,
      indiaTaxUsd: computed.headline.indiaTaxUsd,
      usTaxUsd: computed.headline.usTaxUsd,
      netDoubleTaxUsd: computed.headline.netUnrelievedDoubleTaxUsd,
      counts: counts,
      requiredDocs: d.buildDocumentsResult.filter(function (doc) { return doc.required; }).length,
      healthScore: monitoring ? monitoring.health.score : null,
      nextDeadline: monitoring && monitoring.calendar.next ? monitoring.calendar.next.dateLabel : null
    };
  }
};

NODES.analyzeResult = {
  deps: ["findingsAllResult", "buildDocumentsResult", "buildFtcReportResult", "buildTaxComputationResult",
    "buildWithholdingSummaryResult", "buildScopeNotesResult", "buildReturnFormDeterminationResult", "summaryResult"],
  compute: function (d, ctx) {
    return {
      model: ctx.model,
      computed: ctx.computed,
      findings: d.findingsAllResult,
      documents: d.buildDocumentsResult,
      ftcReport: d.buildFtcReportResult,
      taxComputation: d.buildTaxComputationResult,
      withholding: d.buildWithholdingSummaryResult,
      scopeNotes: d.buildScopeNotesResult,
      returnForms: d.buildReturnFormDeterminationResult,
      monitoring: ctx.monitoringBoundary,
      summary: d.summaryResult
    };
  }
};

module.exports = { NODES: NODES };

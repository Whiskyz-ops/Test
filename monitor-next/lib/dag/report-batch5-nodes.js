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
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(v, ctx) { return Number(v) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js

/* india_advance_tax_interest — conflicts.js:452-463, ss.424/425. */
NODES.indiaAdvanceTaxInterestFinding = {
  deps: ["in1ShouldFire", "totalInterestInr", "advancePaidInr", "assessedTaxInr", "s424Inr", "inS424Months", "inIsAuditCase", "s425Inr", "inPurelyPresumptive"],
  compute: function (d, ctx) {
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
      amountUsd: inrToUsd(inAdvInterestInr, ctx), refs: ["s.424", "s.425", "1%/month simple interest"]
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

// ---- retirement_excess_elective_deferral / retirement_excess_ira_
// contribution / retirement_rmd_required (Step 11 audit, new findings not
// in the frozen engine -- Layer 1 US's own Retirement screen and Step 5's
// W-2 Box 12 codes fed NOTHING downstream at all before this. See
// us5-nodes.js's electiveDeferralExcessUsd/iraContributionExcessUsd/
// rmdRequired for the underlying computation and 2026 figures.
NODES.retirementExcessElectiveDeferralFinding = {
  deps: ["hasUsScope", "electiveDeferralExcessUsd", "electiveDeferralAggregateUsd", "electiveDeferralLimitUsd"],
  compute: function (d) {
    if (!d.hasUsScope || d.electiveDeferralExcessUsd <= 0) return [];
    return [{
      id: "retirement_excess_elective_deferral", severity: "warning", category: "credit",
      title: "§402(g) excess elective deferral (" + usd(d.electiveDeferralExcessUsd) + " over the limit)",
      detail: usd(d.electiveDeferralAggregateUsd) + " of combined 401(k)/403(b)/Solo-401(k) elective deferrals (traditional " +
        "and Roth, across every plan and every W-2 Box 12 code D/E/AA/BB on file) exceeds the §402(g) annual aggregate limit " +
        "of " + usd(d.electiveDeferralLimitUsd) + " for this taxpayer's age this year, by " + usd(d.electiveDeferralExcessUsd) + ".",
      recommendation: "Excess deferrals must be withdrawn (with earnings) by the following April 15 to avoid double taxation — once as " +
        "a 2026 excess deferral and again as ordinary income when eventually distributed. Confirm whether prior-year W-2 wages " +
        "exceeded $150,000, which would require any age-60-63 catch-up doses to have gone into a Roth 401(k) specifically " +
        "(SECURE 2.0's mandatory Roth catch-up) — not modeled here.",
      amountUsd: d.electiveDeferralExcessUsd, refs: ["§402(g)", "Form 5329"]
    }];
  }
};
NODES.retirementExcessIraContributionFinding = {
  deps: ["hasUsScope", "iraContributionExcessUsd", "iraContributionAggregateUsd", "iraContributionLimitUsd", "retirementAccountsRaw"],
  compute: function (d) {
    if (!d.hasUsScope || d.iraContributionExcessUsd <= 0) return [];
    var backdoor = d.retirementAccountsRaw.backdoor_roth_executed === true;
    return [{
      id: "retirement_excess_ira_contribution", severity: "warning", category: "credit",
      title: "§219(b)(5) excess IRA contribution (" + usd(d.iraContributionExcessUsd) + " over the limit)",
      detail: usd(d.iraContributionAggregateUsd) + " of combined traditional + Roth IRA contributions exceeds the §219(b)(5) " +
        "annual combined limit of " + usd(d.iraContributionLimitUsd) + " for this taxpayer's age this year, by " +
        usd(d.iraContributionExcessUsd) + "." + (backdoor ? " A backdoor Roth conversion is on file — confirm the excess isn't " +
        "simply the nondeductible traditional contribution awaiting conversion (not double-counted as its own excess)." : ""),
      recommendation: "A 6% excise tax (§4973) applies to the excess each year it remains in the account. Withdraw the excess (with " +
        "earnings) by the filing deadline (including extensions) to avoid the excise tax, or apply it as next year's contribution " +
        "if otherwise eligible.",
      amountUsd: d.iraContributionExcessUsd, refs: ["§219(b)(5)", "§4973", "Form 5329"]
    }];
  }
};
// ---- hsa_excess_contribution (task #40 follow-up, closing the HSA gap
// the §402(g) block above deliberately deferred). See us5-nodes.js's
// hsaContributionExcessUsd/hsaContributionAggregateUsd/hsaContributionLimitUsd
// for the underlying computation and 2026 figures.
NODES.hsaExcessContributionFinding = {
  deps: ["hasUsScope", "hsaContributionExcessUsd", "hsaContributionAggregateUsd", "hsaContributionLimitUsd", "hsaCoverageType"],
  compute: function (d) {
    if (!d.hasUsScope || d.hsaContributionExcessUsd <= 0) return [];
    return [{
      id: "hsa_excess_contribution", severity: "warning", category: "credit",
      title: "§223 excess HSA contribution (" + usd(d.hsaContributionExcessUsd) + " over the limit)",
      detail: usd(d.hsaContributionAggregateUsd) + " of combined HSA contributions (individual/payroll after-tax plus " +
        "employer/cafeteria-plan amounts under W-2 Box 12 code W) exceeds the §223(b) annual limit of " +
        usd(d.hsaContributionLimitUsd) + " for this taxpayer's " + (d.hsaCoverageType === "family" ? "family" : "self-only") +
        " HDHP coverage and age this year, by " + usd(d.hsaContributionExcessUsd) + ".",
      recommendation: "Excess HSA contributions are subject to a 6% excise tax (§4973) each year they remain in the account, " +
        "and are also included in gross income unless withdrawn (with earnings) by the filing deadline including extensions. " +
        "Confirm whether the coverage-type change happened mid-year (a common cause of an apparent excess that a last-month-" +
        "rule or testing-period calculation would actually cure) — not modeled here.",
      amountUsd: d.hsaContributionExcessUsd, refs: ["§223(b)", "§4973", "Form 5329", "Form 8889"]
    }];
  }
};
NODES.retirementRmdRequiredFinding = {
  deps: ["rmdRequired", "ageAtYearEndUs"],
  compute: function (d) {
    if (!d.rmdRequired) return [];
    return [{
      id: "retirement_rmd_required", severity: "info", category: "credit",
      title: "Required Minimum Distribution (RMD) likely required at age " + d.ageAtYearEndUs,
      detail: "This taxpayer is age " + d.ageAtYearEndUs + " at year-end, at or above the SECURE 2.0 RMD-start age of 73. " +
        "Layer 1 does not collect traditional IRA/401(k) account BALANCES (only contribution amounts), so the actual RMD " +
        "dollar amount cannot be computed here — it depends on the prior year-end balance across all traditional accounts " +
        "and the IRS Uniform Lifetime Table divisor for this age.",
      recommendation: "Confirm the prior year-end balance of every traditional IRA/401(k)/403(b) account and compute the RMD " +
        "using the IRS Uniform Lifetime Table before the year-end deadline (April 1 of the year after turning 73 for the " +
        "first RMD only). A missed or shortfall RMD carries a 25% excise tax (10% if corrected within 2 years) under §4974.",
      amountUsd: 0, refs: ["§401(a)(9)", "§4974", "Form 5329"]
    }];
  }
};

// ---- s83b_election_not_filed_timely (Step 16 Layer 1 US field-
// completeness audit, 27 Jul 2026 — new DAG-only finding, no engine
// equivalent). layer1_us.html's "Founder Section 83(b) elections" card
// (addS83bRow()/syncS83bState(), equity_compensation.
// unvested_restricted_stock_awards) collects filed_within_30_days per
// election but it was never read anywhere -- one of the most consequential,
// easy-to-miss startup-equity deadlines in the whole product went
// completely unmonitored. A missed SS83(b) election means every future
// vesting date is taxed as ordinary income on the FULL FMV at that vest
// (not the one-time, usually near-zero, grant-date spread) -- often a
// difference of hundreds of thousands of dollars for an early employee/
// founder whose stock appreciates significantly before fully vesting.
NODES.s83bElectionNotFiledTimelyFinding = {
  deps: ["equityCompRaw"],
  compute: function (d) {
    var awards = (d.equityCompRaw.unvested_restricted_stock_awards || []).filter(function (a) { return a && a.filed_within_30_days === false; });
    if (awards.length === 0) return [];
    var names = awards.map(function (a) { return a.company_name || "unnamed company"; }).join(", ");
    return [{
      id: "s83b_election_not_filed_timely", severity: "critical", category: "income",
      title: awards.length + " §83(b) election" + (awards.length === 1 ? "" : "s") + " NOT filed within the 30-day deadline",
      detail: "For " + names + ", the §83(b) election is recorded as NOT filed within the mandatory 30-day window from the " +
        "grant date. §83(b)(2) makes this deadline absolute — there is no extension, no reasonable-cause exception, and no " +
        "way to file late. Without a timely election, the grant-date spread is never locked in; instead, the FULL fair " +
        "market value of each tranche is taxed as ordinary income on its OWN vesting date, capturing all appreciation " +
        "between grant and vest as compensation income rather than future capital gain.",
      recommendation: "If the 30-day window has already closed, the election cannot be filed late — confirm this is accurate " +
        "before assuming an error, and model the ordinary-income exposure at each future vesting date instead of relying on " +
        "the grant-date spread.",
      amountUsd: 0, refs: ["§83(b)", "Treas. Reg. §1.83-2"]
    }];
  }
};

// ---- itin_application_required (task #47, ITIN-filing gate — new DAG-only
// finding, no engine equivalent). Both raw signals this reads (ssnOrItinTypeRaw,
// nraRaw.w7ItinApplicationFiled) were collected by layer1_us.html but never
// read by anything downstream: a filer with "None" selected as their
// Taxpayer ID Type got no warning that they cannot actually file a 1040/
// 1040-NR without either an SSN or an ITIN — every person listed on the
// return needs one (IRC §6109; Form W-7 instructions) — the primary
// taxpayer, a spouse electing §6013(g)/(h) treatment, and any dependent
// claimed for the Child Tax Credit alike (a dependent with an ITIN instead
// of an SSN is downgraded from the $2,000 CTC to the $500 ODC under TCJA/
// the PATH Act, per ustax-nodes.js's own existing §24(h)(4) comment).
NODES.itinApplicationRequiredFinding = {
  deps: ["hasUsScope", "usEntityKind", "ssnOrItinTypeRaw", "nraRaw"],
  compute: function (d) {
    // ssn_or_itin_type is an individual-taxpayer-only field (layer1_us.html's
    // Step 2 profile screen) -- a US entity return (1120/1120-S/1065/1041)
    // files under an EIN, not an SSN/ITIN, so the field's "none" default
    // must NOT be read as a gap for those profiles.
    if (!d.hasUsScope || d.usEntityKind !== "individual" || d.ssnOrItinTypeRaw !== "none" || d.nraRaw.w7ItinApplicationFiled) return [];
    return [{
      id: "itin_application_required", severity: "critical", category: "document",
      title: "No SSN, ITIN, or ATIN on file — a US return cannot be filed without one",
      detail: "The Taxpayer ID Type on file is \"None,\" and no Form W-7 ITIN application is recorded as filed. Every person " +
        "listed on a Form 1040 or 1040-NR — the primary taxpayer, a spouse electing to be treated as a US resident under " +
        "§6013(g)/(h), and any dependent claimed for the Child Tax Credit — must have a valid SSN or ITIN (IRC §6109). A " +
        "dependent with an ITIN instead of an SSN still qualifies for the $500 Credit for Other Dependents, but is " +
        "downgraded out of the $2,000 Child Tax Credit.",
      recommendation: "If eligible for an SSN, apply through the SSA. Otherwise file Form W-7 to apply for an ITIN — it can be " +
        "submitted together with the tax return itself, but the return cannot actually be filed until an SSN or ITIN is on " +
        "file (or, for a pending adoption, an ATIN via Form W-7A).",
      amountUsd: 0, refs: ["§6109", "Form W-7", "§24(h)(4)"]
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

// ---- lrs_investment_tcs (task #48, LRS-investor flag — new DAG-only
// finding, no engine equivalent). computeLrsTcs() (report-batch4-nodes.js,
// AGG-8, already ported and verified) was previously report-only, feeding
// nothing but the Withholding tab's summary row -- a taxpayer remitting
// funds abroad under the LRS specifically to invest (or as a gift/
// donation, the same 20%-above-₹10L bracket under s.206C(1G)) got no loud
// signal at all, even though this is the LRS schedule's highest TCS rate
// and a real hint that the taxpayer now holds a foreign asset that may
// need its own Schedule FA/FBAR/Form 8621 follow-up (each already its own
// separate, independently-triggered signal elsewhere in this codebase --
// not inferred FROM this finding, just flagged for the filer to check).
// Scoped to purpose "investment"/"gift_donation" only (not every purpose
// computeLrsTcs prices, e.g. travel/education/medical) -- those carry no
// comparable "may now hold a reportable foreign asset" implication.
NODES.lrsInvestmentTcsFinding = {
  deps: ["withholdingDetailIndiaRaw"],
  compute: function (d, ctx) {
    var lrs = d.withholdingDetailIndiaRaw.lrsTcs;
    if (!lrs || !(lrs.tcsInr > 0) || (lrs.purpose !== "investment" && lrs.purpose !== "gift_donation")) return [];
    return [{
      id: "lrs_investment_tcs", severity: "info", category: "credit",
      title: "TCS collected on LRS " + (lrs.purpose === "investment" ? "investment" : "gift/donation") +
        " remittance (" + inr(lrs.tcsInr) + ")",
      detail: inr(lrs.totalRemittedInr) + " remitted abroad this year under the Liberalised Remittance Scheme for " +
        lrs.purposeLabel.toLowerCase() + ". s.206C(1G) collects Tax Collected at Source at " + lrs.ratePctLabel +
        " (" + lrs.note + "), totalling " + inr(lrs.tcsInr) + ".",
      recommendation: "TCS collected here is available as a credit against the final India tax liability (or refundable if it " +
        "exceeds it) — reconcile the amount against Form 26AS/AIS before filing. An LRS remittance for investment purposes " +
        "often means a new foreign asset is now on file — confirm whether it also triggers its own Schedule FA, FBAR, or " +
        "Form 8621 (PFIC) disclosure, each a separate requirement from this TCS credit.",
      amountUsd: inrToUsd(lrs.tcsInr, ctx), refs: ["s.206C(1G)", "LRS"]
    }];
  }
};

NODES.buildTaxComputationResult = {
  deps: ["buildTaxComputationIndiaResult", "buildTaxComputationUsResult", "buildTaxComputationUsStateResult"],
  compute: function (d) {
    return { india: d.buildTaxComputationIndiaResult, us: d.buildTaxComputationUsResult, usState: d.buildTaxComputationUsStateResult };
  }
};

/* The exact order detectConflicts calls add() in (conflicts.js:97-1544) —
 * needed only as a stable-sort TIE-BREAK, matching JS's guaranteed-stable
 * Array.sort: when two findings share both severity and amountUsd (e.g.
 * schedule_fa_inconsistent's amountUsd is always a literal 0, so it ties
 * with anything else that's also 0 at "info"/that severity), the engine's
 * final order still reflects whichever was pushed first, which this
 * merged array's own concatenation order doesn't naturally reproduce. */
var FINDING_ADD_ORDER = ["dual_residency", "dual_residency_resolved", "treaty_docs_missing", "dtaa_treaty_elections",
  "withholding_documentation_gap", "pan_not_linked_aadhaar", "ftc_gap", "ftc_available", "feie_ineligible", "feie_applied",
  "amt_applies", "india_advance_tax_interest", "underpayment_2210", "early_withdrawal_penalty_72t",
  "retirement_excess_elective_deferral", "retirement_excess_ira_contribution", "hsa_excess_contribution", "retirement_rmd_required", "iso_3921", "form_10iea",
  "form_1099da_awareness", "state_income_tax", "niit_medicare_not_creditable", "no_totalization_agreement", "pe_article7",
  "entity_dual_residency_poem", "residency_status_dtaa_conflated_india", "residency_status_mismatch_india_company",
  "residency_status_mismatch_india", "residency_status_mismatch_india_entity", "residency_status_understated_us",
  "residency_status_overstated_us", "residency_status_understated_us_entity", "residency_status_overstated_us_entity",
  "chapter_xiia_elected_no_holdings", "chapter_xiia_investment_income_missing", "chapter_xiia_investment_income_computed",
  "special_rate_gaming_winnings", "s115bbe_unexplained_income", "carry_forward_losses_not_applied", "nra_fdap_flat_rate",
  "nra_w8ben_missing", "firpta", "form67_required", "tax_year_mismatch", "fx_basis", "state_treaty_not_binding", "pfic",
  "cfc", "cfc_below_threshold", "transfer_pricing", "retirement_mismatch", "deemed_dividend_buyback_mismatch",
  "promoter_buyback_additional_tax", "holding_period_mismatch_", "schedule_fa_inconsistent", "black_money_act_exposure",
  // itin_application_required (task #47): not part of the real, frozen
  // detectConflicts add() order (no engine equivalent at all — see the
  // finding's own comment) but given an EXPLICIT, shared position here
  // anyway (matching JS and Python identically) rather than falling
  // through to the dynamic "holding_period_mismatch_" tie-break bucket
  // like s83b_election_not_filed_timely does -- a real fuzz-corpus case
  // (seed1-00147) ties it against fbar_limit (both severity:"critical",
  // amountUsd:0), and without a shared explicit position the two languages'
  // differing pre-sort concatenation order broke tie-break parity between
  // them (run-js-dag-vs-py-dag.js).
  "itin_application_required",
  "india_itr_form_mismatch", "foreign_gift_3520", "covered_expat_gift_tax", "lrs_limit", "fbar_limit",
  "trump_account_contribution_limit", "equity_comp_sourcing", "cross_basis_summary"];
function findingAddOrderIndex(id) {
  var i = FINDING_ADD_ORDER.indexOf(id);
  if (i >= 0) return i;
  return FINDING_ADD_ORDER.indexOf("holding_period_mismatch_"); // dynamic "holding_period_mismatch_N" suffix
}

NODES.findingsAllResult = {
  deps: ["findingsBatch1Result", "findingsBatch2Result", "findingsBatch3Result", "findingsBatch4Result",
    "findingsBatch5Result", "holdingPeriodMismatchFindingsResult", "residencyConsistencyFindings",
    "indiaAdvanceTaxInterestFinding", "underpayment2210Finding", "earlyWithdrawalPenalty72tFinding",
    "retirementExcessElectiveDeferralFinding", "retirementExcessIraContributionFinding", "hsaExcessContributionFinding", "retirementRmdRequiredFinding",
    "s83bElectionNotFiledTimelyFinding", "itinApplicationRequiredFinding", "lrsInvestmentTcsFinding", "scheduleFaInconsistentFinding", "blackMoneyActExposureFinding"],
  compute: function (d) {
    var all = [].concat(d.findingsBatch1Result, d.findingsBatch2Result, d.findingsBatch3Result,
      d.findingsBatch4Result, d.findingsBatch5Result, d.holdingPeriodMismatchFindingsResult,
      d.residencyConsistencyFindings, d.indiaAdvanceTaxInterestFinding, d.underpayment2210Finding,
      d.earlyWithdrawalPenalty72tFinding, d.retirementExcessElectiveDeferralFinding, d.retirementExcessIraContributionFinding,
      d.hsaExcessContributionFinding, d.retirementRmdRequiredFinding, d.s83bElectionNotFiledTimelyFinding, d.itinApplicationRequiredFinding, d.lrsInvestmentTcsFinding, d.scheduleFaInconsistentFinding, d.blackMoneyActExposureFinding);
    // detectConflicts's own final step (conflicts.js:1546-1551) — not just a
    // convenience, LIM-7's alerts feed (monitor()) depends on findings[]
    // actually being in this order (.filter(critical).slice(0,4)) to pick
    // its top-4 critical alerts. Each batch's own internal push order was
    // only ever verified for CONTENT (ID-based comparison, every earlier
    // CFL-6 runner), never for matching this final sort — added here,
    // once, on the merged array, rather than reordering any already-shipped
    // batch file's own internal sequence. A pre-sort by FINDING_ADD_ORDER
    // comes first so that Array.sort's guaranteed stability (ES2019+, true
    // in Node) reproduces the engine's real tie-break for same-severity/
    // same-amountUsd findings (e.g. schedule_fa_inconsistent's amountUsd is
    // always a literal 0) exactly as if they'd been pushed in add()-call
    // order to begin with, without needing this merged array's own
    // concatenation order to already match that sequence.
    all.sort(function (a, b) { return findingAddOrderIndex(a.id) - findingAddOrderIndex(b.id); });
    var weight = { critical: 0, warning: 1, info: 2 };
    all.sort(function (a, b) {
      if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
      return b.amountUsd - a.amountUsd;
    });
    return all;
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

"use strict";
/* ============================================================================
 * CFL-7 batch 2: starts buildTaxComputation (conflicts.js:1839-2231, the
 * biggest single function in the report-assembly layer) — the US
 * resident/individual section (`us`) and the state-tax section
 * (`usState`), NOT the India section (a separate, larger port — deferred
 * to a later batch, since it needs assembling many currently-scattered
 * in1-nodes-v3.js nodes into one unified result object, individual AND
 * entity paths both).
 *
 * Needed two more additive changes to already-closed nodes, same
 * "expose what's already computed, change no logic" discipline as CFL-7
 * batch 1's ordinaryTaxUsd/preferentialTaxUsd addition:
 *
 *   - ustax-nodes.js's usTaxResult (TAX-5): every field buildTaxComputation's
 *     `us` section reads (ordinaryIncomeUsd, saltCapUsd, socialSecurityDetail,
 *     seniorDetail, tipsOvertimeDetail, ordinaryBracketBreakdown, amtDetail,
 *     ctcDetail, foreignSourceIncomeUsd, retirementEpfInterestUsd/
 *     retirementNpsWithdrawalUsd, niitDetail, feie) was already computed
 *     internally there since TAX-5 closed — none of it needed a new raw
 *     fact, just exposing local variables that were never returned.
 *     Verified field-for-field against computeUsTax's own return shape
 *     (computation.js:1043-1116).
 *   - findings-batch5-nodes.js's usStateTaxResult (TAX-9): added
 *     bracketBreakdown (a new bracketBreakdown() call, mirroring the
 *     bracketTax() already there) and the static basis string — both
 *     needed for the usState.rows trace detail.
 *
 * Verified in run-report2.js: exact structural match against
 * WISING.analyze()'s taxComputation.us / taxComputation.usState fields
 * for all 11 real profiles; the `us` section reported-not-asserted for
 * the 2 US-entity/NRA profiles (same TAX-7/TAX-8 boundary as every prior
 * batch — the DAG's usTaxResult only computes the resident/individual
 * path).
 * ==========================================================================*/
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
function source(detail, citation) { return { kind: "source", detail: detail, citation: citation || null }; }
function holdings(section, note) { return { kind: "holdings", section: section, note: note || null }; }

/* Turns a bracketBreakdown() array into trace `parts` — ported verbatim
 * (conflicts.js:1695-1708). */
function bracketParts(breakdown, fmt) {
  function pctLabel(rate) { return (parseFloat((rate * 100).toFixed(2))) + "%"; }
  return (breakdown || []).map(function (b) {
    var label = b.to === Infinity
      ? pctLabel(b.rate) + " above " + fmt(b.from)
      : pctLabel(b.rate) + " on " + fmt(b.from) + "–" + fmt(b.to);
    return { label: label, amount: b.tax };
  });
}

var reportBatch1Nodes = require("./report-batch1-nodes.js").NODES;
var NODES = {};
Object.keys(reportBatch1Nodes).forEach(function (k) { NODES[k] = reportBatch1Nodes[k]; });

// ============================================================================
// buildTaxComputation's `us` section, resident/individual path only
// (conflicts.js:2014-2184)
// ============================================================================
NODES.buildTaxComputationUsResult = {
  deps: ["usTaxResult", "aggregateUsIncomeResult"],
  compute: function (d) {
    var u = d.usTaxResult;
    // Ported verbatim (conflicts.js:2015-2029): Holdings' own gross total
    // (model.income.us.total.usd — NOT gated by worldwide, unlike
    // u.totalIncomeUsd) usually differs from u.totalIncomeUsd by exactly the
    // §911 FEIE-excluded amount; when that's the whole explanation, link
    // straight to Holdings instead of re-deriving the same numbers.
    // Otherwise (e.g. not worldwide, so Holdings' gross includes foreign
    // income u.totalIncomeUsd zeroed out entirely) fall back to a plain
    // formula so a click never lands on an unexplainably different figure.
    var usHoldingsTotalUsd = d.aggregateUsIncomeResult.total.usd;
    var feieAppliedUsd = (u.feie && u.feie.appliedUsd) || 0;
    var usGapExplainedByFeie = Math.abs((usHoldingsTotalUsd - u.totalIncomeUsd) - feieAppliedUsd) < 1;
    var totalIncomeTrace = usGapExplainedByFeie
      ? holdings("us", feieAppliedUsd > 0 ? ("Holdings shows gross foreign wages before the §911 FEIE exclusion (" + usd(feieAppliedUsd) + " excluded here), so this figure is that much lower.") : null)
      : calc("Ordinary income (wages + business/self-employment + interest + non-qualified dividends + STCG + rental + pension" + (u.worldwide ? ", foreign amounts included since this is worldwide taxation" : "") + ") + preferential income (LTCG + qualified dividends)", [
          { label: "Ordinary income", amount: u.ordinaryIncomeUsd },
          { label: "Preferential income (LTCG/QDI)", amount: u.preferentialIncomeUsd }
        ]);

    return {
      title: "US federal income tax (" + u.filingStatus.toUpperCase() + ")",
      currency: "USD",
      rows: [
        { label: "Total income" + (u.worldwide ? " (worldwide)" : " (US-source)"), usd: u.totalIncomeUsd, trace: totalIncomeTrace }
      ]
        .concat((u.retirementEpfInterestUsd > 0) ? [{ label: "  — of which taxable EPF interest (India retirement a/c, worldwide taxation)", usd: u.retirementEpfInterestUsd,
          trace: source("Entered directly on Layer 1 India → Other Sources → \"Taxable EPF interest\". Included here because worldwide taxation applies to this taxpayer.") }] : [])
        .concat((u.retirementNpsWithdrawalUsd > 0) ? [{ label: "  — of which taxable NPS withdrawal (India retirement a/c, worldwide taxation)", usd: u.retirementNpsWithdrawalUsd,
          trace: source("Entered directly on Layer 1 India → Other Sources → \"Taxable NPS withdrawal\". Included here because worldwide taxation applies to this taxpayer.") }] : [])
        .concat([
          { label: "Adjusted gross income", usd: u.agiUsd,
            trace: calc("Total income less above-the-line adjustments (student-loan interest, capped at $2,500, + half of self-employment tax)", [
              { label: "Total income", amount: u.totalIncomeUsd },
              { label: "Less adjustments", amount: -(u.totalIncomeUsd - u.agiUsd) }
            ]) },
          { label: "Less " + u.deductionMode + " deduction", usd: -u.deductionUsd,
            trace: calc(u.deductionMode === "standard"
              ? "Standard deduction for filing status " + u.filingStatus.toUpperCase() + " — used because it exceeds (or the taxpayer elected) itemizing"
              : "Itemized: SALT (capped at " + usd(u.saltCapUsd) + " — OBBBA's $40,000 cap, phased down 30¢/$1 of AGI over $500,000, floored at the old $10,000) + mortgage interest + charitable + medical expenses over 7.5% of AGI — used because it exceeds (or the taxpayer elected) the standard deduction", [
              { label: "Deduction used", amount: u.deductionUsd }
            ]) }
        ])
        .concat(u.seniorDeductionUsd > 0 ? [{ label: "Less senior deduction (OBBBA §70103, age 65+)", usd: -u.seniorDeductionUsd,
          trace: calc("$6,000 for a taxpayer age 65+ by year end (TY2025-2028, temporary), on top of the standard/itemized deduction either way, phased out 6¢/$1 of AGI over " + usd(u.seniorDetail.phaseoutThresholdUsd) + ". Only the primary taxpayer's age is known — Layer 1 collects no spouse DOB, so a second $6,000 for an also-65+ spouse isn't modeled.", [
            { label: "Taxpayer age", display: u.seniorDetail.age + " years" },
            { label: "Full amount before phase-out", amount: u.seniorDetail.fullAmountUsd },
            { label: "Senior deduction after phase-out", amount: u.seniorDeductionUsd }
          ]) }] : [])
        .concat(u.tipsDeductionUsd > 0 ? [{ label: "Less \"no tax on tips\" deduction (OBBBA, 2025-2028)", usd: -u.tipsDeductionUsd,
          trace: calc("Lesser of qualified tip income (already included in Box 1 wages above) or the $" + Math.round(u.tipsOvertimeDetail.tipsMaxUsd).toLocaleString("en-US") + " flat cap, less $100 per $1,000 of AGI over " + usd(u.tipsOvertimeDetail.phaseoutThresholdUsd) + ". Not available at all to MFS filers.", [
            { label: "Qualified tip income (Box 1 subset)", amount: u.tipsOvertimeDetail.qualifiedTipsUsd },
            { label: "Flat cap", amount: u.tipsOvertimeDetail.tipsMaxUsd },
            { label: "Less phase-out reduction", amount: -u.tipsOvertimeDetail.phaseoutReductionUsd },
            { label: "Tips deduction after phase-out", amount: u.tipsDeductionUsd }
          ]) }] : [])
        .concat(u.overtimeDeductionUsd > 0 ? [{ label: "Less \"no tax on overtime\" deduction (OBBBA, 2025-2028)", usd: -u.overtimeDeductionUsd,
          trace: calc("Lesser of qualified FLSA §7 overtime premium pay (already included in Box 1 wages above) or the $" + Math.round(u.tipsOvertimeDetail.overtimeMaxUsd).toLocaleString("en-US") + " cap (filing status " + u.filingStatus.toUpperCase() + "), less $100 per $1,000 of AGI over " + usd(u.tipsOvertimeDetail.phaseoutThresholdUsd) + ". Not available at all to MFS filers.", [
            { label: "Qualified overtime premium (Box 1 subset)", amount: u.tipsOvertimeDetail.qualifiedOvertimeUsd },
            { label: "Cap for this filing status", amount: u.tipsOvertimeDetail.overtimeMaxUsd },
            { label: "Less phase-out reduction", amount: -u.tipsOvertimeDetail.phaseoutReductionUsd },
            { label: "Overtime deduction after phase-out", amount: u.overtimeDeductionUsd }
          ]) }] : [])
        .concat(u.qbiDeductionUsd > 0 ? [{ label: "Less §199A QBI deduction", usd: -u.qbiDeductionUsd,
          trace: calc("20% of qualified business income (Sch C/S-corp/partnership pass-through), capped at 20% of (taxable income less net capital gains); phased out for specified service trades above the SSTB income threshold", [
            { label: "QBI deduction", amount: u.qbiDeductionUsd }
          ]) }] : [])
        .concat([
          { label: "Taxable income", usd: u.taxableIncomeUsd,
            trace: calc("AGI less deduction" + (u.seniorDeductionUsd > 0 ? " less senior deduction" : "") + (u.tipsDeductionUsd > 0 ? " less tips deduction" : "") + (u.overtimeDeductionUsd > 0 ? " less overtime deduction" : "") + (u.qbiDeductionUsd > 0 ? " less §199A QBI deduction" : ""), [
              { label: "AGI", amount: u.agiUsd },
              { label: "Less deduction", amount: -u.deductionUsd }
            ].concat(u.seniorDeductionUsd > 0 ? [{ label: "Less senior deduction", amount: -u.seniorDeductionUsd }] : [])
              .concat(u.tipsDeductionUsd > 0 ? [{ label: "Less tips deduction", amount: -u.tipsDeductionUsd }] : [])
              .concat(u.overtimeDeductionUsd > 0 ? [{ label: "Less overtime deduction", amount: -u.overtimeDeductionUsd }] : [])
              .concat(u.qbiDeductionUsd > 0 ? [{ label: "Less QBI deduction", amount: -u.qbiDeductionUsd }] : [])) },
          { label: "Ordinary-rate tax", usd: u.ordinaryTaxUsd,
            trace: calc("Progressive federal brackets (10%-37%, filing status " + u.filingStatus.toUpperCase() + ") applied to $" + Math.round(u.ordinaryTaxableUsd).toLocaleString("en-US") + " of ordinary taxable income (taxable income less the LTCG/QDI portion, which is taxed separately below)",
              bracketParts(u.ordinaryBracketBreakdown, usd)) },
          { label: "Preferential LTCG/QDI tax", usd: u.preferentialTaxUsd,
            trace: calc("0%/15%/20% long-term capital gains brackets, stacked on top of ordinary taxable income", [
              { label: "Preferential LTCG/QDI tax", amount: u.preferentialTaxUsd }
            ]) },
          { label: "Net investment income tax (NIIT, §1411)", usd: u.niitUsd,
            trace: u.niitUsd > 0 && u.niitDetail
              ? calc("3.8% × NIIT base (see breakdown below)", [
                  { label: "NIIT base", amount: u.niitDetail.excessUsd },
                  { label: "Rate", display: "3.8%" }
                ])
              : calc("Zero — either no net investment income, or MAGI doesn't exceed the filing-status threshold", []) }
        ])
        .concat(u.niitUsd > 0 && u.niitDetail ? [
          { label: "  — net investment income (interest/div/cap gains/rental)", usd: u.niitDetail.netInvestmentIncomeUsd,
            trace: source("Interest + dividends + capital gains + rental income (foreign-source included when worldwide taxation applies) — from the income already itemized on Layer 1 India/US.") },
          { label: "  — MAGI", usd: u.niitDetail.magiUsd,
            trace: calc("Equal to AGI in this engine's model (no foreign-earned-income-exclusion add-back scenario is modeled)", [
              { label: "AGI", amount: u.agiUsd }
            ]) },
          { label: "  — less filing-status threshold", usd: -u.niitDetail.thresholdUsd,
            trace: source("Statutory NIIT threshold by filing status (§1411(b)) — $200,000 single/HoH, $250,000 MFJ, $125,000 MFS. Not indexed for inflation.") },
          { label: "  — NIIT base (lesser of NII and MAGI-over-threshold) @ " + (u.niitDetail.rate * 100).toFixed(1) + "%", usd: u.niitDetail.excessUsd,
            trace: calc("Lesser of net investment income and (MAGI − threshold)", [
              { label: "Net investment income", amount: u.niitDetail.netInvestmentIncomeUsd },
              { label: "MAGI over threshold", amount: Math.max(0, u.niitDetail.magiUsd - u.niitDetail.thresholdUsd) }
            ]) }
        ] : [])
        .concat([
          { label: "Additional Medicare tax", usd: u.additionalMedicareUsd,
            trace: source("Computed directly on Layer 1 US (Form 8959) and taken as-is — the engine does not recompute it.") }
        ])
        .concat(u.seTaxUsd > 0 ? [{ label: "Self-employment tax (Schedule SE)", usd: u.seTaxUsd,
          trace: calc("92.35% of net SE earnings × (12.4% Social Security, capped by the wage base less W-2 SS wages already taxed, + 2.9% Medicare, uncapped); half of this is an above-the-line deduction", [
            { label: "Self-employment tax", amount: u.seTaxUsd }
          ]) }] : [])
        .concat(u.amtUsd > 0 && u.amtDetail ? [
          { label: "Alternative Minimum Tax (§55)", usd: u.amtUsd,
            trace: calc("Tentative minimum tax minus regular tax, when positive (see breakdown below)", [
              { label: "Tentative minimum tax", amount: u.amtDetail.tmtUsd },
              { label: "Less regular tax", amount: -u.amtDetail.regularTaxUsd }
            ]) },
          { label: "  — AMTI (taxable income + standard/SALT addback + preference items)", usd: u.amtDetail.amtiUsd,
            trace: calc("Taxable income + disallowed-deduction addback (the full standard deduction, or just the SALT slice if itemized) + AMT preference items (e.g. the ISO exercise bargain-element spread, §56(b)(3))", [
              { label: "Taxable income", amount: u.taxableIncomeUsd },
              { label: "Addback (standard deduction or SALT)", amount: u.amtDetail.addbackUsd },
              { label: "AMT preference items", amount: u.amtDetail.amtiUsd - u.taxableIncomeUsd - u.amtDetail.addbackUsd }
            ]) },
          { label: "  — less AMT exemption (phased out above threshold)", usd: -u.amtDetail.exemptionUsd,
            trace: calc("Full statutory exemption reduced 25¢ for every $1 of AMTI above the phase-out threshold", [
              { label: "Full exemption", amount: u.amtDetail.exemptionFullUsd },
              { label: "AMTI", amount: u.amtDetail.amtiUsd },
              { label: "Exemption after phase-out", amount: u.amtDetail.exemptionUsd }
            ]) },
          { label: "  — AMT base", usd: u.amtDetail.amtBaseUsd,
            trace: calc("AMTI less the (phased-out) exemption", [
              { label: "AMTI", amount: u.amtDetail.amtiUsd },
              { label: "Less exemption", amount: -u.amtDetail.exemptionUsd }
            ]) },
          { label: "  — tentative minimum tax (26%/28% ordinary + LTCG/QDI at preferential rates)", usd: u.amtDetail.tmtUsd,
            trace: calc("26% (28% above the AMT rate breakpoint) on the ordinary AMT base (AMT base less any LTCG/QDI, which keep their preferential rates) + preferential-rate tax on the LTCG/QDI portion", [
              { label: "Ordinary AMT base", amount: u.amtDetail.ordinaryAmtBaseUsd },
              { label: "Tax on ordinary AMT base", amount: u.amtDetail.tmtOrdUsd },
              { label: "Preferential-rate tax (LTCG/QDI, same as above)", amount: u.preferentialTaxUsd }
            ]) },
          { label: "  — less regular tax (AMT owed = excess of TMT over this)", usd: -u.amtDetail.regularTaxUsd,
            trace: calc("Same as ordinary-rate tax + preferential LTCG/QDI tax shown above", [
              { label: "Ordinary-rate tax", amount: u.ordinaryTaxUsd },
              { label: "Preferential LTCG/QDI tax", amount: u.preferentialTaxUsd }
            ]) }
        ] : [])
        .concat(u.otherCreditsUsd > 0 ? [{ label: "Less other non-refundable credits (care/AOTC/LLC)", usd: -u.otherCreditsUsd,
          trace: calc("Child/dependent care credit (20% of qualifying expenses, capped) + American Opportunity + Lifetime Learning education credits (both phased out by MAGI) — capped at the tax otherwise due", [
            { label: "Credits", amount: u.otherCreditsUsd }
          ]) }] : [])
        .concat(u.ctcDetail && u.ctcDetail.availableUsd > 0 ? [{ label: "Less Child Tax Credit (§24)", usd: -(u.ctcDetail.nonRefundableUsd + u.ctcDetail.refundableUsd),
          trace: calc("$2,200/child (TY2025-2028, OBBBA), phased out $50 per $1,000 of AGI over the threshold. The portion that doesn't fit against tax owed is refundable (Additional CTC) up to $1,700/child, capped at 15% of earned income over $2,500. \"Children\" here reuses the same dependents count as the care/AOTC credits above — Layer 1 doesn't separately track qualifying-child ages.", [
            { label: "Number of children (Layer 1 dependents count)", display: String(u.ctcDetail.numChildren) },
            { label: "Max CTC before phase-out", amount: u.ctcDetail.maxTotalUsd },
            { label: "Phase-out reduction", amount: -u.ctcDetail.phaseoutReductionUsd },
            { label: "Non-refundable (offsets tax)", amount: u.ctcDetail.nonRefundableUsd },
            { label: "Refundable (Additional CTC)", amount: u.ctcDetail.refundableUsd }
          ]) }] : [])
        .concat([{ label: "Total US tax (pre-FTC)", usd: u.totalTaxBeforeFtcUsd, emphasis: true,
          trace: calc("Income tax (ordinary + preferential) + NIIT + Additional Medicare tax + SE tax + AMT − non-refundable credits", [
            { label: "Income tax (ordinary + preferential)", amount: u.incomeTaxUsd },
            { label: "NIIT", amount: u.niitUsd },
            { label: "Additional Medicare tax", amount: u.additionalMedicareUsd },
            { label: "SE tax", amount: u.seTaxUsd },
            { label: "AMT", amount: u.amtUsd },
            { label: "Less credits", amount: -u.creditsUsd }
          ]) }]),
      totalUsd: u.totalTaxBeforeFtcUsd,
      effectiveRate: u.effectiveRate
    };
  }
};

// ============================================================================
// buildTaxComputation's `usState` section (conflicts.js:2185-2229)
// ============================================================================
NODES.buildTaxComputationUsStateResult = {
  deps: ["usStateTaxResult"],
  compute: function (d) {
    var st = d.usStateTaxResult;
    if (!st) return null;
    return {
      title: st.stateName + " state income tax (" + st.formName + ", " + st.filingStatus.toUpperCase() + ")",
      currency: "USD",
      rows: [
        { label: "Federal AGI (starting point)", usd: st.agiUsd,
          trace: source("Same federal AGI computed above — " + st.stateName + " taxes a full-year resident's worldwide income, so no separate state-source recomputation is done.") },
        { label: "Less " + st.stateName + " standard deduction", usd: -st.standardDeductionUsd,
          trace: source(st.stateName + "'s own standard deduction for " + st.filingStatus.toUpperCase() + " — separate from, and smaller than, the federal one.") }
      ].concat(st.dependentExemptionUsd > 0 ? [
        { label: "Less NY dependent exemption ($1,000/dependent)", usd: -st.dependentExemptionUsd,
          trace: source("NY dropped the personal exemption for filer/spouse decades ago; only the $1,000-per-dependent exemption survives.") }
      ] : []).concat([
        { label: "State taxable income", usd: st.taxableIncomeUsd,
          trace: calc("Federal AGI less the state standard deduction" + (st.dependentExemptionUsd > 0 ? " and dependent exemption" : ""), [
            { label: "Federal AGI", amount: st.agiUsd },
            { label: "Less standard deduction", amount: -st.standardDeductionUsd }
          ].concat(st.dependentExemptionUsd > 0 ? [{ label: "Less dependent exemption", amount: -st.dependentExemptionUsd }] : [])) },
        { label: "Tax at " + st.stateName + " bracket rates", usd: st.bracketTaxUsd,
          trace: calc("Progressive " + st.stateName + " brackets applied to $" + Math.round(st.taxableIncomeUsd).toLocaleString("en-US") + " of state taxable income",
            bracketParts(st.bracketBreakdown, usd)) }
      ]).concat(st.surchargeUsd > 0 ? [
        { label: st.surchargeLabel, usd: st.surchargeUsd,
          trace: calc("1% of state taxable income over $1,000,000 — this threshold is NOT doubled for MFJ", [
            { label: "State taxable income over $1,000,000", amount: Math.max(0, st.taxableIncomeUsd - 1000000) },
            { label: "Surcharge @ 1%", amount: st.surchargeUsd }
          ]) }
      ] : []).concat((st.exemptionCreditUsd + st.dependentCreditUsd) > 0 ? [
        { label: "Less personal/dependent exemption credit", usd: -(st.exemptionCreditUsd + st.dependentCreditUsd),
          trace: source("California's personal exemption credit ($153 single/MFS/HOH, $307 MFJ) plus $475 per dependent — a credit against tax, not a deduction from income.") }
      ] : []).concat([
        { label: "Total " + st.stateName + " tax", usd: st.totalTaxUsd, emphasis: true,
          trace: calc("Bracket tax" + (st.surchargeUsd > 0 ? " + surcharge" : "") + (st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? " − exemption/dependent credits" : ""), [
            { label: "Bracket tax", amount: st.bracketTaxUsd },
            { label: "Surcharge", amount: st.surchargeUsd },
            { label: "Less credits", amount: -(st.exemptionCreditUsd + st.dependentCreditUsd) }
          ]) }
      ]),
      totalUsd: st.totalTaxUsd,
      effectiveRate: st.effectiveRate,
      basis: st.basis
    };
  }
};

module.exports = { NODES: NODES };

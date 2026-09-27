"use strict";
/* ============================================================================
 * Starts closing CFL-6 ("the remaining 48 findings" in engine/conflicts.js's
 * detectConflicts()) — batch 1 of an ongoing effort, not the whole row.
 *
 * Picked for this first batch: the findings whose dependencies were ALREADY
 * fully closed by the XBR-2..6 cluster (finished same session) with ZERO
 * new "detail" gaps — every field read here already exists in the DAG or is
 * a single new trivial raw leaf. Per GAP_TRACKER.md's own priority
 * discipline ("a finding is only worth porting once the computation it
 * depends on exists in the DAG"), this batch was the natural next slice:
 *
 *   - pan_not_linked_aadhaar    — zero computed deps, one raw fact
 *   - amt_applies               — usTaxResult.amtUsd (TAX-5/6, closed)
 *   - entity_dual_residency_poem — residency + company POEM facts (XBR-1,
 *                                  closed; company POEM raw leaves already
 *                                  added to residency-nodes.js for
 *                                  deriveCompanyPoem)
 *   - ftc_gap / ftc_available   — ftcResult (XBR-2, closed same session)
 *   - dual_residency /
 *     dual_residency_resolved   — residencyResult (XBR-1) + doubleTax
 *                                 (XBR-3, closed same session) + 4 new
 *                                 tie-break raw leaves (tb_home/cvi/abode/
 *                                 nationality — normalize.js:2460-2463,
 *                                 previously read nowhere in the DAG) +
 *                                 describeTieBreak(), ported verbatim
 *                                 (conflicts.js:46-61, pure function of
 *                                 those same 4 facts)
 *
 * Deliberately NOT in this batch (real, separate blockers, not covered
 * here): feie_ineligible/feie_applied (the DAG's feieEligibility() is
 * missing the engine's `reasons[]` detail field — a small but real gap,
 * not yet closed); state_income_tax (TAX-9); withholding_documentation_gap
 * (AGG-6/7); s115bbe_unexplained_income (AGG-1's one remaining
 * knownMissing item); holding_period_mismatch_ (needs a second
 * computeUsTax pass to price the dollar impact, not just the array AGG-1
 * already exposes); equity_comp_sourcing (AGG-9). See
 * DAG_MIGRATION_TRACKER.md's CFL-6 row for the running list.
 *
 * Built on crossbasis-nodes.js (the largest existing merge — reuses
 * ftcResult/residencyResult/usTaxResult/doubleTax/company-POEM raw leaves
 * rather than redefining any of them).
 *
 * Verified in run-findings.js: exact finding-ID-set match against
 * detectConflicts()'s real findings array for all 11 real profiles, plus
 * full detail-text comparison for every finding that DOES fire.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

/* describeTieBreak, ported verbatim (conflicts.js:46-61) */
function describeTieBreak(t) {
  var home = t.tieBreakHome, cvi = t.tieBreakCvi, abode = t.tieBreakAbode, nat = t.tieBreakNationality;
  if (home === "india") return { article: "Art. 4(2)(a)", reason: "permanent home is only in India" };
  if (home === "us") return { article: "Art. 4(2)(a)", reason: "permanent home is only in the US" };
  if (home !== "both" && home !== "neither") return null;
  if (cvi === "india") return { article: "Art. 4(2)(a)", reason: "centre of vital interests is closer to India" };
  if (cvi === "us") return { article: "Art. 4(2)(a)", reason: "centre of vital interests is closer to the US" };
  if (cvi !== "tie") return null;
  if (abode === "india") return { article: "Art. 4(2)(b)", reason: "habitual abode is in India" };
  if (abode === "us") return { article: "Art. 4(2)(b)", reason: "habitual abode is in the US" };
  if (abode !== "tie") return null;
  if (nat === "india") return { article: "Art. 4(2)(c)", reason: "Indian national" };
  if (nat === "us") return { article: "Art. 4(2)(c)", reason: "US national" };
  if (nat === "tie") return { article: "Art. 4(3)", reason: "neither permanent home, vital interests, abode nor nationality broke the tie", mapRequired: true };
  return null;
}

var crossBasisNodes = require("./crossbasis-nodes.js").NODES;

var NODES = {};
Object.keys(crossBasisNodes).forEach(function (k) { NODES[k] = crossBasisNodes[k]; });

// ---- raw leaves not read by any earlier-closed phase -----------------------
NODES.panAadhaarLinkedRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.pan_aadhaar_linked", null); } };
NODES.tieBreakHomeRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.tb_home", null); } };
NODES.tieBreakCviRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.tb_cvi", null); } };
NODES.tieBreakAbodeRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.tb_abode", null); } };
NODES.tieBreakNationalityRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.tb_nationality", null); } };
// usFtcForm(model) simplifies to this: "Form 1118" only when usReturnForm
// would be "1120", which only happens when usEntityKind === "ccorp"
// (conflicts.js:35-37, computation.js's usReturnForm derivation) — traced,
// not assumed, before simplifying.
NODES.usFtcFormXbr = { deps: ["usEntityKind"], compute: function (d) { return d.usEntityKind === "ccorp" ? "Form 1118" : "Form 1116"; } };
// "us_only" is the new Layer 0 router's synonym for "single_us" (additive,
// see hasUsScopeBoundaryFtc in xborder-full-nodes.js for the full note).
NODES.hasIndiaScopeXbr = { deps: ["routerJurisdictionXB"], compute: function (d) { return d.routerJurisdictionXB !== "single_us" && d.routerJurisdictionXB !== "us_only"; } };

// ---- findings, ported in full ----------------------------------------------
NODES.findingsBatch1Result = {
  deps: ["panAadhaarLinkedRaw", "usTaxResult", "indiaIsCompany", "indiaIsIndianCompanyRaw", "residencyResult",
    "companyBoardOutsideIndiaRaw", "companyKeyManagementLocationRaw", "companyDirectorsInIndiaRaw", "companyDirectorsOutsideIndiaRaw",
    "ftcResult", "hasIndiaScopeXbr", "hasUsScopeBoundaryFtc", "usFtcFormXbr",
    "tieBreakHomeRaw", "tieBreakCviRaw", "tieBreakAbodeRaw", "tieBreakNationalityRaw",
    "treatyIndiaResidenceRaw", "treatyUsResidenceRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "mapDoubleTaxedIncomeResult",
    "usDaysCurrentYearRaw", "indiaDaysCurrentYearRaw", "aggregateUsIncomeResult"],
  compute: function (d) {
    var findings = [];
    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      findings.push({ id: id, severity: severity, category: category, title: title, detail: detail, recommendation: recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
    }

    // -- 3c. PAN NOT LINKED TO AADHAAR (conflicts.js:254-273) --------------
    if (d.panAadhaarLinkedRaw === false) {
      add("pan_not_linked_aadhaar", "critical", "document",
        "PAN not linked to Aadhaar — PAN is inoperative, higher TDS/TCS applies",
        "Layer 1 records the PAN as NOT linked to Aadhaar. Under Rule 114AAA an unlinked PAN is treated as inoperative — " +
        "every payer must withhold TDS/TCS at the higher default rate u/s 397(2) (generally 20%, or double the " +
        "normal TCS rate, whichever is higher) as if no PAN had been furnished at all, REGARDLESS of any lower slab, " +
        "special, or DTAA treaty rate that would otherwise apply — including the treaty elections above, if any. " +
        "Refunds are also withheld while the PAN remains inoperative, and interest keeps accruing for that period.",
        "Link PAN to Aadhaar (paying the applicable late fee) before relying on any withholding-rate, refund, or treaty-" +
        "election figure on this page — every number computed here assumes a valid, operative PAN.",
        0, ["s.397(2)", "Rule 114AAA", "PAN inoperative"]);
    }

    // -- 4. FTC RECONCILIATION GAP (conflicts.js:275-301) -------------------
    var ftc = d.ftcResult;
    // residualDoubleTaxUsd (the §904 carryover), not netUnrelievedDoubleTaxUsd:
    // the latter also carries salary_us_work_india_tax's amount now, which
    // has its own finding below (same condition dag_py already used).
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.us.residualDoubleTaxUsd > 1) {
      add("ftc_gap", "critical", "credit",
        "Foreign Tax Credit shortfall — residual double taxation",
        "Indian tax paid (" + usd(ftc.us.indiaTaxPaidUsd) + ") exceeds the US FTC limitation (" +
        usd(ftc.us.ftcLimitUsd) + ") for this year. " + usd(ftc.us.residualDoubleTaxUsd) +
        " of Indian tax cannot be credited currently and would otherwise be double-taxed.",
        usd(ftc.us.carryoverUsd) + " is eligible to carry over under §904(c) (back 1 year / forward 10), but WISING is a " +
        "single-year snapshot — it does NOT persist this carryover across tax years or track it for you. Record " +
        usd(ftc.us.carryoverUsd) + " on " + d.usFtcFormXbr + " Schedule B this year, and re-enter it as prior-year carryover when you " +
        "run next year's numbers. Also check whether treaty re-sourcing (Art. 25) could reclassify some income to lift " +
        "the limitation — WISING does not test this automatically.",
        ftc.us.residualDoubleTaxUsd, [d.usFtcFormXbr, "§904(c)"]);
    } else if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.us.indiaTaxPaidUsd > 0 && ftc.us.ftcAllowedUsd > 0) {
      add("ftc_available", "info", "credit",
        "Foreign Tax Credit available and within limit",
        "Indian tax of " + usd(ftc.us.indiaTaxPaidUsd) + " is fully creditable against US tax this year (" +
        usd(ftc.us.ftcAllowedUsd) + " within a " + usd(ftc.us.ftcLimitUsd) + " limitation).",
        "Claim on " + d.usFtcFormXbr + " (US) and file Form 44 (India) before the ITR due date to preserve symmetric relief.",
        ftc.us.ftcAllowedUsd, [d.usFtcFormXbr, "Form 44"]);
    }

    // -- 4a. INDIA TAX ON SALARY FOR US-PERFORMED WORK ----------------------
    // (salary work-location sourcing, ftc-nodes.js's ftcUsDirection): India
    // salary earned while working in the US is US-source (IRC 861(a)(3)), so
    // the Indian tax on it is excluded from the US credit above — relief, if
    // any, is an India refund under DTAA Art. 16 (salary taxable only in the
    // residence state unless the employment is exercised in India).
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.us.indiaTaxOnUsWorkSalaryUsd > 1) {
      // Who owes the relief turns on treaty residence (Art. 4): US treaty
      // resident (or not an Indian resident at all) => Art. 16 keeps the
      // salary out of India's reach, so India refunds; India treaty resident
      // => the US taxes it first as the work-place state and India gives
      // credit for the US tax (s.90 / Art. 25, Form 67); tie-break not run
      // yet => say both.
      var swTbWinner = d.treatyIndiaResidenceRaw !== "none" ? d.treatyIndiaResidenceRaw
        : (d.treatyUsResidenceRaw !== "none" ? d.treatyUsResidenceRaw : null);
      var swRefund = "Claim the Indian tax back (revise the ITR / refund claim, with Form 41 (formerly Form 10F) and a US residency certificate, " +
        "Form 6166) and ask the employer to stop deducting TDS on that portion.";
      var swIndiaCredit = "Claim credit in India for the US tax on this salary (s.159, formerly s.90 / DTAA Art. 25 — Form 44, formerly Form 67, with the US return) " +
        "instead of expecting a US credit for the Indian tax.";
      var swAdvice;
      if (d.residencyResult.dualResident && swTbWinner === "india") {
        swAdvice = "India is the treaty residence (Art. 4), so the US — where the work was done — taxes this salary first " +
          "under DTAA Art. 16, and India must give relief. " + swIndiaCredit;
      } else if (d.residencyResult.dualResident && !swTbWinner) {
        swAdvice = "Who gives relief depends on the Art. 4 tie-breaker, which isn't completed yet. If the US wins, India " +
          "generally shouldn't tax pay for US-performed work (DTAA Art. 16(1), claimed on the Art. 4(2) tie-breaker): " + swRefund + " If India wins: " + swIndiaCredit;
      } else {
        swAdvice = "Under India–US DTAA Art. 16, salary is taxable only in the country of residence unless the work is done " +
          "in the other country — so India generally should not tax pay for US-performed work of a US resident. " + swRefund;
      }
      add("salary_us_work_india_tax", "critical", "credit",
        "Indian tax on salary for work done in the US — not creditable in the US",
        usd(ftc.us.usWorkSalaryUsd) + " of Indian salary was earned for work performed in the US, which makes it US-source " +
        "income (IRC §861(a)(3)). The Indian tax on it, about " + usd(ftc.us.indiaTaxOnUsWorkSalaryUsd) + ", can't be claimed " +
        "as a Foreign Tax Credit on " + d.usFtcFormXbr + " and is left out of the credit above, so as things stand it is taxed twice.",
        swAdvice + " " + (ftc.us.salaryWorkBasis === "estimated_days_present" ? "The split between India and US work is estimated from days present (India days ÷ India + US days) because the workday question on Layer 1 India's salary screen was left blank — enter the client's actual workdays to confirm this amount." : "Check the workday split on Layer 1 India's salary screen first — this figure is only as good as those days."),
        ftc.us.indiaTaxOnUsWorkSalaryUsd, ["§861(a)(3)", "DTAA Art. 16", d.usFtcFormXbr, "Form 41", "Form 6166", "Form 44"]);
    }

    // -- 4b. INDIAN TDS ON SALARY INDIA CAN'T TAX -----------------------------
    // (in1-nodes-v3.js's salaryNotChargeableInr): an India non-resident /
    // RNOR, or a resident the treaty hands to the US, isn't taxed in India on
    // salary for work done outside India, so India's tax leaves it out — but
    // an Indian employer that treats the employee as taxable deducts TDS on
    // it anyway. That TDS isn't tax India is owed, so it isn't creditable on
    // Form 1116 either: the conflict is cash stuck in India until the
    // deduction is stopped or refunded. The amount is an estimate (the tax
    // the salary would carry), since Layer 1 India records TDS as one total.
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.us.indiaNotChargeableSalaryUsd > 1) {
      var ncTreaty = d.residencyResult.india.status === "ROR";
      var ncWhy = ncTreaty
        ? "The treaty tie-breaker (DTAA Art. 4(2)) makes the US the client's residence country, so under Art. 16(1) India can't tax pay for work done outside India"
        : "As an India " + (d.residencyResult.india.status === "RNOR" ? "RNOR" : "non-resident") + ", the client is taxed in India only on " +
          "India-source income, and salary is India-source only for work physically done in India";
      // Which ground carries the claim: domestic law for a non-resident /
      // RNOR (treaty recommended; needed if paid into an Indian account),
      // the treaty alone for a resident the tie-breaker hands to the US
      // (must cite Art. 4(2) + Art. 16(1)). The action is structured text:
      // "## " headings, "- " bullets, "  - " sub-bullets (FindingRow renders it).
      var ncGround = ncTreaty
        ? ["- The treaty is the only basis, so the claim must cite it: DTAA Art. 4(2) (tie-breaker residence in the US) and Art. 16(1), backed by Form 6166 (US residency certificate) and Form 41 (formerly Form 10F), and disclosed as a treaty claim in the return."]
        : ["- Which ground to claim depends on where the salary is paid:",
          "  - Paid outside India: Indian domestic law alone excludes it, so no treaty claim is required. Claiming DTAA Art. 16 as well (Form 6166 US residency certificate + Form 41, formerly Form 10F) is still recommended, so the employer and the Department have both grounds.",
          "  - Paid into an Indian bank account: claim Art. 16(1) with Form 6166 and Form 41. The Department may argue the salary is taxable on receipt in India (s.5(2)(a) of the 1961 Act); the treaty, which allocates salary by where the work is done, is the main defence."];
      var ncSplit = ftc.us.salaryWorkBasis === "estimated_days_present"
        ? "- The India / US work split is estimated from days present (India days ÷ India + US days) because the workday question on Layer 1 India's salary screen was left blank. Enter the client's actual workdays to confirm it."
        : "- Check the workday split on Layer 1 India's salary screen: this figure is only as good as those days.";
      var ncAction = ["## Stop the deduction",
        "- Give the employer a written declaration: the client's residential status, US work location and address, and expected days in India (and which are workdays), backed by travel records."]
        .concat(ncGround).concat(["- If the employer still deducts, apply for a nil / lower-deduction certificate.",
        "- Salary for days actually worked in India stays taxable and keeps its TDS.",
        "## Recover what's already deducted",
        "- Same year: the employer can reduce TDS in later months.",
        "- After year-end: file ITR-2 showing this salary as not taxable in India, and claim the full TDS credit from Form 26AS / AIS.",
        "- Expect a mismatch query (Form 16 shows the full salary) and answer it with the declaration and travel records. Tribunal rulings (e.g. Hyderabad ITAT, 28 Feb 2023) hold that salary for work done outside India isn't taxable merely because it is credited in India.",
        "- File by the original or belated due date: an updated return (ITR-U) can't claim a refund.",
        "## Before relying on this amount", ncSplit]).join("\n");
      add("salary_not_taxable_india_tds", "critical", "credit",
        "Indian TDS on salary India can't tax — about " + usd(ftc.us.indiaNotChargeableSalaryTaxUsd) + " to stop or recover",
        usd(ftc.us.indiaNotChargeableSalaryUsd) + " of Indian salary was earned for work done outside India (taken to be the US). " +
        ncWhy + ", so India's tax here leaves it out. An Indian employer that treats the client as taxable in India would still deduct " +
        "about " + usd(ftc.us.indiaNotChargeableSalaryTaxUsd) + " of TDS on it (estimate: the Indian tax this salary would carry — " +
        "Layer 1 India records TDS as one total). The US taxes this salary, and that TDS is not a creditable foreign tax on " +
        d.usFtcFormXbr + " because India isn't owed it — so until it's stopped or refunded, the same salary is taxed twice.",
        ncAction,
        ftc.us.indiaNotChargeableSalaryTaxUsd, (ncTreaty ? ["DTAA Art. 4(2)"] : []).concat(["DTAA Art. 16", "Form 41", "Form 6166", "ITR-2", "Form 26AS"]));
    }

    // -- 4b2. SHORT WORK TRIPS: DTAA ART. 16(2) --------------------------------
    // Salary for work done in the other country is taxable there under its own
    // law, but Art. 16(2) keeps it taxable only in the residence country when
    // (a) the employee is present there 183 days or fewer in the taxable year,
    // (b) the employer isn't resident there, and (c) the pay isn't borne by the
    // employer's branch (PE / fixed base) there. (c) isn't collected, so it's
    // left for the preparer to confirm. Direction 1: an India treaty resident
    // with Indian salary for work done in the US (salaryWorkLocation, taken to
    // be the US). Direction 2: a US treaty resident with US-employer (W-2)
    // wages who spent days in India — pay for any work done there.
    var tbWinner16 = d.treatyIndiaResidenceRaw !== "none" ? d.treatyIndiaResidenceRaw
      : (d.treatyUsResidenceRaw !== "none" ? d.treatyUsResidenceRaw : null);
    var res16 = d.residencyResult;
    var indiaTreatyRes = res16.india.isResident && !res16.india.cedesViaTreaty && (!res16.us.worldwide || tbWinner16 === "india");
    var usTreatyRes = res16.us.worldwide && (!res16.india.isResident || res16.india.cedesViaTreaty || tbWinner16 === "us");
    var salUsWorkUsd = ftc.us.indiaSalaryOutsideIndiaUsd || 0;
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && indiaTreatyRes && salUsWorkUsd > 1 &&
        d.usDaysCurrentYearRaw > 0 && d.usDaysCurrentYearRaw <= 183) {
      add("dtaa_16_2_short_stay_us", "warning", "treaty",
        "Salary for US work may be exempt from US tax — DTAA Art. 16(2) short stay (" + d.usDaysCurrentYearRaw + " US days)",
        usd(salUsWorkUsd) + " of Indian salary was earned for work done in the US (taken as the work outside India). US law taxes pay for " +
        "work done in the US even for a non-resident — its own exemption stops at 90 days and $3,000 (IRC §861(a)(3)). Under DTAA Art. 16(2) " +
        "it's taxable only in India when all three hold: (a) present in the US 183 days or fewer in the taxable year — " + d.usDaysCurrentYearRaw +
        " days on file, met; (b) paid by an employer that isn't a US resident — the salary is on Layer 1 India, so taken as an Indian employer; " +
        "(c) not charged to a US branch or fixed base of the employer — not collected, confirm.",
        "If all three hold: no US tax on this pay. If a US return is required, claim the exemption on Form 1040-NR (Schedule OI, treaty " +
        "Art. 16(2)); if the employer runs US payroll for the trip, give it Form 8233 so it doesn't withhold. India taxes the salary as the " +
        "residence country, with no s.159 credit to claim. If any condition fails — more than 183 days, a US employer, or the cost recharged " +
        "to a US branch or subsidiary — the US taxes this pay as the work country and India must credit that US tax (s.159 / Art. 25, Form 44).",
        0, ["DTAA Art. 16(2)", "IRC §861(a)(3)", "Form 1040-NR", "Form 8233", "Form 44"]);
    }
    var w2Us16 = ((d.aggregateUsIncomeResult && d.aggregateUsIncomeResult.w2Employers) || []).reduce(function (t, e) { return t + (e.wagesUsd || 0); }, 0);
    // India non-residents only: a resident who moved mid-year (Aarav) spent
    // those India days living there, before the US job — not a work trip.
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && usTreatyRes && res16.india.status === "NR" && w2Us16 > 1 &&
        d.indiaDaysCurrentYearRaw > 0 && d.indiaDaysCurrentYearRaw <= 183) {
      add("dtaa_16_2_short_stay_india", "info", "treaty",
        "Work done during " + d.indiaDaysCurrentYearRaw + " days in India — check DTAA Art. 16(2) before India taxes it",
        "The client has " + usd(w2Us16) + " of US-employer (W-2) wages and spent " + d.indiaDaysCurrentYearRaw + " days in India. If they worked " +
        "while in India, Indian law treats pay for those days as India-source salary. Under DTAA Art. 16(2) it stays taxable only in the US when " +
        "(a) present in India 183 days or fewer in the taxable year — met; (b) paid by an employer that isn't an Indian resident — a US employer on " +
        "the W-2, met; (c) not charged to an Indian branch, subsidiary or fixed base of the employer — not collected, confirm.",
        "If all three hold, no Indian tax or TDS applies to that pay; keep travel records and the employer's confirmation that the cost wasn't " +
        "recharged to an Indian entity. If it was recharged (or the days exceed 183), India taxes the pay for India workdays — the Indian entity " +
        "may need to deduct TDS, the client may need an Indian return — and the US credits that Indian tax on " + d.usFtcFormXbr + ". If the client " +
        "didn't work while in India, this doesn't apply.",
        0, ["DTAA Art. 16(2)", d.usFtcFormXbr]);
    }

    // -- 4c. AMT BITES (conflicts.js:325-334) -------------------------------
    if (d.usTaxResult.amtUsd > 0) {
      add("amt_applies", "warning", "credit",
        "US Alternative Minimum Tax applies (+" + usd(d.usTaxResult.amtUsd) + ")",
        "This is a US-only tax (IRC §55) — India has no AMT-equivalent regime. The US tentative minimum tax exceeds the " +
        "regular US tax, so an additional " + usd(d.usTaxResult.amtUsd) +
        " is added to the US liability. Common drivers: a large standard-deduction / SALT add-back, private-activity-bond interest, or an ISO exercise.",
        "WISING computes the parallel AMT (Form 6251) and includes it in the US tax total above. Review ISO exercise timing and the state-tax add-back; AMT paid on deferral items can generate a Minimum Tax Credit (Form 8801) usable in later years.",
        d.usTaxResult.amtUsd, ["§55", "Form 6251", "Form 8801"]);
    }

    // -- 4f2. ENTITY-LEVEL DUAL RESIDENCY (conflicts.js:701-736) ------------
    if (d.indiaIsCompany && d.indiaIsIndianCompanyRaw === false && d.residencyResult.india.status === "ROR") {
      var poemFactors = [];
      if (d.companyBoardOutsideIndiaRaw) poemFactors.push("board meets primarily outside India");
      if (d.companyKeyManagementLocationRaw) poemFactors.push("key management location: " + d.companyKeyManagementLocationRaw);
      if (d.companyDirectorsInIndiaRaw || d.companyDirectorsOutsideIndiaRaw) poemFactors.push(d.companyDirectorsInIndiaRaw + " director(s) in India vs " + d.companyDirectorsOutsideIndiaRaw + " outside");
      add("entity_dual_residency_poem", "warning", "treaty",
        "Foreign-incorporated company with POEM in India — entity-level dual residency",
        "This company is on file as NOT incorporated in India, yet its Place of Effective Management facts" +
        (poemFactors.length ? " (" + poemFactors.join("; ") + ")" : "") +
        " resolve it to an Indian tax resident (worldwide income in scope) under s.6(3). Being incorporated elsewhere " +
        "means it doesn't stop being resident there either (most countries, including the US, use place-of-incorporation " +
        "as their own company-residency test) — so this entity is very likely resident in BOTH countries at once, with no " +
        "individual-style Article 4 hierarchy to mechanically resolve it.",
        "Confirm the other country's own company-residency test independently (place of incorporation alone is often " +
        "sufficient there) — if it also claims residency, this needs the treaty's company tie-breaker (competent-authority " +
        "mutual agreement under Article 4(3)), not a self-service test. Revisit the POEM facts too: 'mostly outside India' " +
        "board meetings alone isn't dispositive if commercial decisions are substantively made elsewhere.",
        0, ["DTAA Art. 4(3)", "s.6(3)", "POEM", "Mutual Agreement Procedure"]);
    }

    // -- 1. DUAL RESIDENCY + ARTICLE 4 TIE-BREAKER (conflicts.js:81-125) ---
    var res = d.residencyResult;
    if (res.dualResident) {
      var tbWinner = d.treatyIndiaResidenceRaw !== "none" ? d.treatyIndiaResidenceRaw
        : (d.treatyUsResidenceRaw !== "none" ? d.treatyUsResidenceRaw : null);
      var usTag = res.us.isCitizen ? "citizen" : d.usHasGreenCardRaw ? "green card" : "SPT met";
      var tb = describeTieBreak({ tieBreakHome: d.tieBreakHomeRaw, tieBreakCvi: d.tieBreakCviRaw, tieBreakAbode: d.tieBreakAbodeRaw, tieBreakNationality: d.tieBreakNationalityRaw });
      if (!tbWinner) {
        if (tb && tb.mapRequired) {
          add("dual_residency", "critical", "treaty",
            "Dual tax residency — Article 4(3) Mutual Agreement Procedure required",
            "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag +
            "). The Layer 1 tie-breaker wizard was completed through all four tests — permanent home, centre of vital " +
            "interests, habitual abode, and nationality — and " + tb.reason + ". Article 4(3) hands this to the " +
            "competent authorities (CBDT and the IRS) for a Mutual Agreement Procedure; it cannot be self-resolved.",
            "File a MAP request (competent authority assistance) with the IRS and/or CBDT rather than re-running the " +
            "wizard — the mechanical tie-breaker has already been exhausted. Both countries continue asserting worldwide " +
            "taxing rights and only partial FTC relief is available until MAP concludes.",
            d.mapDoubleTaxedIncomeResult.totalDoublyTaxedUsd, ["DTAA Art. 4(3)", "MAP", "Form 8833", "TRC", "Form 41"]);
        } else {
          add("dual_residency", "critical", "treaty",
            "Dual tax residency — Article 4 tie-breaker not yet run",
            "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag +
            ") for an overlapping period, and the Layer 1 Article 4 tie-breaker has not been completed. Until it is, both countries assert worldwide taxing rights and only partial FTC relief is available.",
            "Complete the Layer 1 tie-breaker wizard (permanent home → centre of vital interests → habitual abode → nationality). WISING will then flag Form 8833 (US) and the TRC / Form 41 requirement (India) on the filing checklist for the loser side — actually preparing and filing those remains a manual step.",
            d.mapDoubleTaxedIncomeResult.totalDoublyTaxedUsd, ["DTAA Art. 4", "Form 8833", "TRC", "Form 41"]);
        }
      } else {
        add("dual_residency_resolved", "info", "treaty",
          "Dual residency resolved under DTAA Article 4 → " + String(tbWinner).toUpperCase(),
          "Both India and the US met residency, and the Layer 1 Article 4 tie-breaker resolves treaty residence to " +
          String(tbWinner).toUpperCase() + " for the overlapping period" +
          (tb ? " (" + tb.article + ": " + tb.reason + ")" : "") +
          ". WISING has applied this to the tax and FTC computation below; the loser jurisdiction is taxed on a source basis.",
          "Keep " + (tbWinner === "india" ? "TRC + Form 41 (India) and Form 8833 (US)" : "Form 8833 (US) and TRC + Form 41 (India)") + " on file to support the position.",
          0, ["DTAA Art. 4", tbWinner === "india" ? "Form 41" : "Form 8833"]);
      }
    }

    return findings;
  }
};

module.exports = { NODES: NODES };

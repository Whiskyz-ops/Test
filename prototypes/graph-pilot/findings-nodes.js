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
    "treatyIndiaResidenceRaw", "treatyUsResidenceRaw", "usIsCitizenRaw", "usHasGreenCardRaw", "mapDoubleTaxedIncomeResult"],
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
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.netUnrelievedDoubleTaxUsd > 1) {
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

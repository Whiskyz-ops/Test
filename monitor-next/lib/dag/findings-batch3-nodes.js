"use strict";
/* ============================================================================
 * CFL-6 batch 3: 19 more findings — form_10iea, form_1099da_awareness,
 * fx_basis, tax_year_mismatch, pfic, cfc, cfc_below_threshold,
 * transfer_pricing, no_totalization_agreement, niit_medicare_not_creditable,
 * pe_article7, retirement_mismatch, deemed_dividend_buyback_mismatch,
 * promoter_buyback_additional_tax, foreign_gift_3520, covered_expat_gift_tax,
 * state_treaty_not_binding, nra_w8ben_missing, firpta.
 *
 * Scoped by reading conflicts.js:561-1445 in full and tracing each finding's
 * actual data dependencies (not assuming from name similarity — batch 1's
 * scoping lumped nra_w8ben_missing/firpta under "TAX-8 scoped out" alongside
 * nra_fdap_flat_rate, but re-reading the source shows they only read raw
 * model.nra facts, zero computed.usTax.nra dependency; same correction for
 * state_treaty_not_binding, previously lumped with state_income_tax under
 * "TAX-9" even though it only reads raw model.stateResidency/treaty facts,
 * never computed.stateTax). Every finding in this batch is either pure raw
 * facts, or built on computations already closed in prior sessions
 * (apportionmentResult/XBR-5, usTaxResult's niitUsd/additionalMedicareUsd/
 * seTaxUsd fields, ftcResult, in1-nodes-v3.js's promoter-buyback machinery).
 *
 * Still genuinely blocked, NOT in this batch (re-confirmed while scoping):
 * carry_forward_losses_not_applied (the DAG's local computeLossSetOff in
 * in1-nodes-v3.js returns post-set-off bucket totals only, not the engine's
 * {used:{...}, unused:{...}, totalUsedInr, totalUnusedInr} breakdown shape
 * this finding needs — a real new derivation, not just an exposure fix);
 * form67_required (needs model.taxesPaid.us.total.usd, AGG-6, unported);
 * iso_3921/equity_comp_sourcing (AGG-9); nra_fdap_flat_rate (still needs
 * computed.usTax.nra.fdapRate for the rate% in the title, TAX-8 scoped out);
 * state_income_tax (computed.stateTax, TAX-9); treaty_docs_missing (needs
 * new treatyElections/trcStatus/form10fFiled-shaped raw leaves, moderate
 * effort); dtaa_treaty_elections (TAX-1's own recorded elections[] gap);
 * withholding_documentation_gap (AGG-6/7); holding_period_mismatch_ (needs
 * a second computeUsTax pass); lrs_limit/fbar_limit/trump_account_contribution_limit
 * (LIM-1..6, boundary-only, unported gauges).
 *
 * Built by merging findings-batch2-nodes.js and apportionment-nodes.js — two
 * more independently-diverged branches off the same aggregateindiaincome-
 * nodes.js/aggregateusincome-nodes.js ancestors — with the same reference-
 * equality-aware collision check as before (verified empirically first: 33
 * shared keys, 0 true collisions).
 *
 * Verified in run-findings3.js: exact finding-ID-set match against
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
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
var fxRate = require("./fx-util.js").fxRate;
function inrToUsd(v, ctx) { return Number(v) / fxRate(ctx); } // rate overridable via ctx.fxRateOverride — see fx-util.js

var findingsBatch2Nodes = require("./findings-batch2-nodes.js").NODES;
var apportionmentNodes = require("./apportionment-nodes.js").NODES;

var NODES = {};
Object.keys(findingsBatch2Nodes).forEach(function (k) { NODES[k] = findingsBatch2Nodes[k]; });
Object.keys(apportionmentNodes).forEach(function (k) {
  if (NODES[k] && NODES[k] !== apportionmentNodes[k]) throw new Error("true collision merging apportionment-nodes.js: " + k);
  NODES[k] = apportionmentNodes[k];
});

// ---- raw leaves not read by any earlier-closed phase -----------------------
NODES.indiaFinancialHoldingsTxRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "financial_holdings.transactions", []) || []; } };
NODES.hasPERaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "dtaa.has_permanent_establishment_in_india", false) === true; } };
NODES.epfInrRaw = { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80C.epf_employee_inr", 0)); } };
NODES.ppfInrRaw = { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80C.ppf_inr", 0)); } };
NODES.npsInrRaw = { deps: [], compute: function (d, ctx) { return num(safe(ctx.india, "deductions.s80CCC_80CCD1.nps_employee_contribution_inr", 0)); } };
NODES.foreignGiftsRaw = {
  deps: [], compute: function (d, ctx) {
    return {
      receivedAbove100k: safe(ctx.us, "foreign_gifts_and_trusts.received_foreign_gifts_above_100k", false) === true,
      isTrustBeneficiary: safe(ctx.us, "foreign_gifts_and_trusts.is_us_beneficiary_of_foreign_trust", false) === true,
      receivedFromCoveredExpatriate: safe(ctx.us, "foreign_gifts_and_trusts.received_gift_from_covered_expatriate", false) === true
    };
  }
};
NODES.stateResidencyRaw = {
  deps: [], compute: function (d, ctx) {
    return {
      domicileJan1: safe(ctx.us, "state_residency.jan_1_domicile_state", null),
      domicileDec31: safe(ctx.us, "state_residency.dec_31_domicile_state", null),
      primaryState: safe(ctx.us, "state_residency.primary_state_of_residence", null),
      footprint: safe(ctx.us, "state_residency.total_states_footprint", []) || [],
      movedStates: safe(ctx.us, "state_residency.moved_states_this_year", false) === true,
      caSafeHarbor: safe(ctx.us, "state_residency.ca_safe_harbor_employment_contract", false) === true,
      caRetainsTies: safe(ctx.us, "state_residency.ca_retains_property_or_voter_reg", false) === true,
      nyDaysPresent: num(safe(ctx.us, "state_residency.ny_actual_days_present", 0)),
      nyPermanentAbode: safe(ctx.us, "state_residency.ny_permanent_place_of_abode", false) === true,
      ny548DayRule: safe(ctx.us, "state_residency.ny_548_day_rule", false) === true
    };
  }
};
NODES.nraRaw = {
  deps: [], compute: function (d, ctx) {
    return {
      treatyRateClaims: safe(ctx.us, "nra_specific.treaty_rate_claims", []) || [],
      submittedW8ben: safe(ctx.us, "nra_specific.submitted_w8ben", false) === true,
      usRealPropertyDisposed: safe(ctx.us, "nra_specific.us_real_property_disposed", false) === true,
      firptaWithholdingUsd: num(safe(ctx.us, "nra_specific.firpta_withholding_usd", 0))
    };
  }
};

// ---- AGG-1 side-channel exposures (mirrors unexplained115bbeInrAgg) -------
NODES.taxableEpfInterestInrAgg = { deps: ["osAgg"], compute: function (d) { return num(safe(d.osAgg, "taxable_epf_interest_inr", 0)); } };
NODES.taxableNpsWithdrawalInrAgg = { deps: ["osAgg"], compute: function (d) { return num(safe(d.osAgg, "taxable_nps_withdrawal_inr", 0)); } };

// ---- promoterBuybackDetail: sibling of in1-nodes-v3.js's promoterBuybackExtraTaxInr,
// same math, full breakdown object instead of just the summed total (computation.js:472-514).
// SYS-1: shared — short local names aliased to CONST.TAX.INDIA's own keys
// (values verified equal before the swap: 0.30/0.22/0.12/0.125/0.20/0.04).
var CONST_IN_B3 = require("../engine/constants.js").CONST.TAX.INDIA;
var PROMOTER = {
  TARGET_NON_CORP: CONST_IN_B3.PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE,
  TARGET_CORP: CONST_IN_B3.PROMOTER_BUYBACK_TARGET_RATE_CORPORATE,
  SURCHARGE_ON_ADDL: CONST_IN_B3.PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE,
  LTCG_RATE: CONST_IN_B3.LTCG_112_RATE,
  STCG_RATE: CONST_IN_B3.STCG_111A_RATE,
  CESS_RATE: CONST_IN_B3.CESS_RATE
};
NODES.promoterBuybackDetail = {
  deps: ["indiaEntityTypeRawV3", "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary"],
  compute: function (d) {
    var isCorporatePromoter = d.indiaEntityTypeRawV3 === "company";
    var targetRate = isCorporatePromoter ? PROMOTER.TARGET_CORP : PROMOTER.TARGET_NON_CORP;
    var ltcgGainInr = d.promoterBuybackLtcgInrBoundary || 0, stcgGainInr = d.promoterBuybackStcgInrBoundary || 0;
    var ltcgAdditionalInr = Math.max(0, ltcgGainInr) * Math.max(0, targetRate - PROMOTER.LTCG_RATE);
    var stcgAdditionalInr = Math.max(0, stcgGainInr) * Math.max(0, targetRate - PROMOTER.STCG_RATE);
    var additionalTaxInr = ltcgAdditionalInr + stcgAdditionalInr;
    if (additionalTaxInr <= 0) return null;
    var surchargeInr = additionalTaxInr * PROMOTER.SURCHARGE_ON_ADDL;
    var cessInr = (additionalTaxInr + surchargeInr) * PROMOTER.CESS_RATE;
    return {
      isCorporatePromoter: isCorporatePromoter, targetRate: targetRate, ltcgGainInr: ltcgGainInr, stcgGainInr: stcgGainInr,
      additionalTaxInr: additionalTaxInr, surchargeInr: surchargeInr, cessInr: cessInr, totalExtraTaxInr: additionalTaxInr + surchargeInr + cessInr
    };
  }
};

// ---- findings, ported in full ----------------------------------------------
NODES.findingsBatch3Result = {
  deps: ["taxRegime", "businessComputation", "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust",
    "capitalGainsComputation", "hasUsScopeBoundaryFtc", "hasIndiaScopeXbr",
    "residencyResult", "apportionmentResult", "usFtcFormXbr",
    "indiaFinancialHoldingsTxRaw", "viaForeignCorpXbr4", "bizEntriesAgg",
    "usTaxResult", "salaryInr", "ftcResult", "hasPERaw",
    "epfInrRaw", "ppfInrRaw", "npsInrRaw", "taxableEpfInterestInrAgg", "taxableNpsWithdrawalInrAgg",
    "promoterBuybackDetail", "foreignGiftsRaw", "stateResidencyRaw",
    "treatyIndiaResidenceRaw", "treatyUsResidenceRaw", "treatyDtaaForcedNrRaw", "nraRaw"],
  compute: function (d, ctx) {
    var findings = [];
    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      findings.push({ id: id, severity: severity, category: category, title: title, detail: detail, recommendation: recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
    }
    var res = d.residencyResult;

    // -- 4c4. FORM 10-IEA (conflicts.js:573-588) -----------------------------
    // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21
    // Jul 2026): widened to also exclude AOP/Trust — see checks-registry-
    // nodes.js's matching pass()-gate widening (must stay in sync — the
    // fuzzer asserts no finding ID is ever both fired and passed).
    if (d.taxRegime === "OLD" && (d.businessComputation.businessInr || 0) > 0 && !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust) {
      add("form_10iea", "warning", "document",
        "Form 10-IEA required to elect the old regime with business/professional income",
        "The old tax regime is selected and business/professional (PGBP) income is on file. Unlike a salary-only filer, an " +
        "assessee with PGBP income can't just choose the old regime on the ITR itself — Form 10-IEA must be filed by the " +
        "s.139(1) due date, and once withdrawn from the old regime this way, old-regime eligibility is gone for good " +
        "except for those without PGBP income.",
        "File Form 10-IEA before the ITR due date. Confirm this taxpayer hasn't already exercised and withdrawn the " +
        "election in a prior year, which would make the old regime unavailable regardless of what's chosen this year.",
        0, ["Form 10-IEA", "s.115BAC(6)"]);
    }

    // -- 4c5. FORM 1099-DA AWARENESS (conflicts.js:590-605) ------------------
    if ((d.capitalGainsComputation.vdaSaleConsiderationInr || 0) > 0 && d.hasUsScopeBoundaryFtc) {
      add("form_1099da_awareness", "info", "document",
        "Crypto/VDA activity on file — check for US Form 1099-DA broker reporting",
        "Virtual digital asset transactions are recorded on the India side this year. If any of this activity (or other " +
        "crypto activity not entered here) ran through a US-regulated broker or exchange, that broker owes the taxpayer " +
        "Form 1099-DA — gross-proceeds reporting is mandatory for 2025 transactions, and basis reporting becomes mandatory " +
        "for covered assets from 1 Jan 2026. Indian-exchange-only activity has no US 1099-DA angle at all.",
        "Ask whether any crypto activity this year touched a US-based broker/exchange; if so, reconcile against the " +
        "1099-DA received before relying on the capital-gains figures shown elsewhere.",
        0, ["Form 1099-DA"]);
    }

    // -- 6. TAX-YEAR / APPORTIONMENT MISMATCH (conflicts.js:1081-1096) ------
    if (res.dualResident || (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc)) {
      var ap = d.apportionmentResult;
      add("tax_year_mismatch", "info", "credit",
        "Tax-year apportionment: Indian FY ↔ US CY (computed)",
        "India taxes Apr–Mar; the US taxes Jan–Dec. WISING splits the Indian FY across US calendar years — " +
        usd(ap.indiaToCyPrimaryUsd) + " into CY" + ap.cyPrimary + " and " + usd(ap.indiaToCyNextUsd) + " into CY" + ap.cyNext +
        " (" + ap.basis + ") — and apportions the US calendar year into the Indian FY (9/12 + 3/12).",
        "See the FY ↔ CY Apportionment panel on the Filings tab for the period-matched figures behind Form 44 (India) and " + d.usFtcFormXbr + " (US). Planning-grade — refine with per-transaction dates at filing.",
        0, ["Apr 1 – Mar 31 (Tax Year)", "Jan 1 – Dec 31 (Calendar Year)"]);
    }

    // -- 7. FX BASIS MISMATCH (conflicts.js:1098-1108) -----------------------
    if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc) {
      add("fx_basis", "info", "credit",
        "FX conversion basis is an approximation",
        "Cross-border amounts are normalized at a flat 83 INR/USD. Statutory FTC computations require the telegraphic-transfer buying rate on the relevant date (Rule 115 / SBI TTBR).",
        "Re-price each foreign income and tax item at the correct per-transaction rate before filing; the flat rate is for planning visibility only.",
        0, ["Rule 115", "SBI TTBR"]);
    }

    // -- 7b. STATE RESIDENCY — TREATY DOES NOT BIND STATES (conflicts.js:1110-1139) --
    var sr = d.stateResidencyRaw;
    var hasStateTies = !!(sr.primaryState || sr.domicileDec31 || sr.domicileJan1 || (sr.footprint || []).length > 0);
    var hasFederalTreatyPosture = res.dualResident || d.treatyIndiaResidenceRaw !== "none" ||
                                   d.treatyUsResidenceRaw !== "none" || d.treatyDtaaForcedNrRaw;
    if (hasStateTies && hasFederalTreatyPosture) {
      var stateNote = [];
      var flagState = sr.domicileDec31 || sr.primaryState || sr.domicileJan1;
      if (sr.caSafeHarbor || sr.caRetainsTies) stateNote.push("California safe-harbor/retained-ties facts are on file — CA is aggressive about domicile and does not allow a credit for foreign tax paid.");
      if (sr.ny548DayRule || sr.nyPermanentAbode || sr.nyDaysPresent > 0) stateNote.push("New York statutory-residency facts are on file (183-day + permanent-abode / 548-day rule) — NY residency is tested independently of the federal position.");
      if (sr.movedStates) stateNote.push("A mid-year state move is on file — part-year returns may be due in two states.");
      add("state_treaty_not_binding", "warning", "treaty",
        "State tax residency is not resolved by the DTAA / federal treaty position" + (flagState ? " (" + flagState + ")" : ""),
        "The India-US treaty and the federal residency determination above bind FEDERAL tax only. " +
        (flagState ? flagState + " " : "The state on file ") + "applies its own domicile or statutory-day residency test, " +
        "independent of the Article 4 tie-breaker or any §911/1040NR position. A taxpayer can be a federal treaty " +
        "non-resident while remaining a full worldwide-income STATE resident with Indian income fully taxable and " +
        (stateNote.length ? "no matching relief in some states." : "little or no state-level foreign tax credit."),
        "Run the state's own residency test (domicile intent + day count) separately from the federal/treaty analysis. " +
        (stateNote.length ? stateNote.join(" ") : "Check whether the state allows any credit for foreign tax paid — several do not.") +
        " Do not assume the federal treaty position carries over.",
        0, ["State residency", flagState || "State domicile"]);
    }

    // -- 8. PFIC EXPOSURE (conflicts.js:1141-1149) ---------------------------
    var mfCount = d.indiaFinancialHoldingsTxRaw.filter(function (t) { return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0; }).length;
    if (mfCount > 0 && res.us.isResident) {
      add("pfic", "critical", "entity",
        "PFIC exposure: Indian mutual funds",
        mfCount + " Indian mutual fund / ETF holding(s) detected. For a US person these are Passive Foreign Investment Companies — taxed under the punitive §1291 excess-distribution regime by default, with a separate Form 8621 per fund.",
        "Evaluate a QEF or Mark-to-Market election (must be timely). Many Indian AMCs cannot supply a PFIC Annual Information Statement, which can force the §1291 default — consider restructuring holdings to US-domiciled funds.",
        0, ["Form 8621", "§1291", "QEF / MTM"]);
    }

    // -- 9. CFC / FORM 5471 (conflicts.js:1151-1172) -------------------------
    var bizCount = d.bizEntriesAgg.length;
    if (d.viaForeignCorpXbr4 && res.us.isResident) {
      add("cfc", "warning", "entity",
        "Controlled Foreign Corporation — Form 5471 required (GILTI/Subpart F not yet quantified)",
        "Layer 1 records the US person owning ≥10% of a foreign corporation" + (bizCount > 0 ? " (Indian company on file)" : "") +
        ", so Form 5471 applies and GILTI / Subpart F can accelerate US tax on undistributed Indian profits before any dividend is paid. " +
        "WISING flags the exposure from the ownership data but does NOT yet compute a GILTI/Subpart F inclusion amount — that requires the " +
        "entity's tested income, E&P and qualified business asset investment (QBAI), which Layer 1 doesn't collect today.",
        "File Form 5471 regardless. To quantify GILTI/Subpart F (and evaluate the §962 election against India's MAT/credit), collect the " +
        "Indian company's tested income, E&P and QBAI — until then, treat this as a required-filing flag, not a computed liability.",
        0, ["Form 5471", "GILTI §951A", "Subpart F", "§962 election"]);
    } else if (bizCount > 0 && res.us.isResident) {
      add("cfc_below_threshold", "info", "entity",
        "Indian company held below the 10% CFC threshold",
        bizCount + " Indian business interest(s) on file, but Layer 1 shows US ownership below 10% — so Form 5471 Category 5 / GILTI do not apply this year.",
        "No 5471 action needed at current ownership. WISING recomputes this every time you re-run the numbers, so update the ownership percentage in Layer 1 as soon as a purchase or reorganization changes it — this isn't monitored in the background.",
        0, ["Form 5471", "10% threshold"]);
    }

    // -- 9b. TRANSFER PRICING (conflicts.js:1174-1194) -----------------------
    if (d.viaForeignCorpXbr4) {
      add("transfer_pricing", "warning", "document",
        "Related-party cross-border transactions — transfer pricing documentation may apply",
        "Layer 1 records a related-party cross-border ownership link (US person owning ≥10% of a foreign/Indian corporation). " +
        "Any transactions between you and that related entity this year — service fees, cost allocations, loans, guarantees, " +
        "IP licensing — must be priced at arm's length under India's s.92-92F and the US's parallel §482 regime. WISING does " +
        "NOT evaluate whether pricing is arm's-length; it only flags that the relationship exists.",
        "If related-party cross-border transactions occurred this year, confirm Form 3CEB certification and Rule 10D " +
        "documentation requirements (India side) and §482 documentation (US side) with a transfer-pricing specialist — " +
        "penalties for missing documentation run 2% of transaction value, up to 200% for concealment.",
        0, ["s.92-92F", "Form 3CEB", "Rule 10D", "§482"]);
    }

    // -- 10. RETIREMENT ACCOUNT TREATMENT MISMATCH (conflicts.js:1196-1217) -
    if ((d.epfInrRaw > 0 || d.ppfInrRaw > 0 || d.npsInrRaw > 0) && res.us.isResident) {
      var epfInterestUsd = inrToUsd(d.taxableEpfInterestInrAgg || 0, ctx);
      var npsWithdrawalUsd = inrToUsd(d.taxableNpsWithdrawalInrAgg || 0, ctx);
      var hasQuantified = epfInterestUsd > 1 || npsWithdrawalUsd > 1;
      var quantifiedParts = [];
      if (epfInterestUsd > 1) quantifiedParts.push(usd(epfInterestUsd) + " of EPF interest");
      if (npsWithdrawalUsd > 1) quantifiedParts.push(usd(npsWithdrawalUsd) + " of NPS withdrawal");
      add("retirement_mismatch", "warning", "retirement",
        "Indian retirement accounts (EPF / PPF / NPS) are taxed differently by the US",
        "India treats EPF, PPF and NPS as tax-free (or lightly taxed). The US does not automatically agree: the IRS can tax " +
        "the interest these accounts earn every year, and may treat PPF like a trust that needs extra forms." +
        (hasQuantified ? " Layer 1 already records " + quantifiedParts.join(" and ") + " as taxable this year — WISING " +
          "has added that amount to the US taxable income and tax figures shown elsewhere on this page (as ordinary " +
          "foreign-source interest/pension), so it isn't just displayed here without effect." : ""),
        "WISING does NOT determine whether a specific account is a treaty-protected pension under DTAA Art. 20, or " +
        "whether PPF should be treated as a foreign trust requiring Form 3520/3520-A — those are legal/factual " +
        "determinations you need to make yourself; Form 3520 only appears on the filing checklist when the separate " +
        "PPF/EPF-plus-US-residency trigger fires, not because this specific check ran. Confirm the treaty-protection " +
        "question and trust classification before relying on the totals above.",
        epfInterestUsd + npsWithdrawalUsd, ["DTAA Art. 20", "Form 3520/3520-A", "FBAR"]);
    }

    // -- 10b. DEEMED DIVIDEND ON BUYBACK (conflicts.js:1219-1246) -----------
    var deemedDivUsd = inrToUsd(d.capitalGainsComputation.deemedDividendInr || 0, ctx);
    if (deemedDivUsd > 1 && res.us.worldwide) {
      add("deemed_dividend_buyback_mismatch", "warning", "income",
        usd(deemedDivUsd) + " share buyback (Oct 2024 - Mar 2026 window) — India taxed it as dividend, the US likely as capital gain",
        "Under s.2(40)(f), buy-backs between 1-Oct-2024 and 31-Mar-2026 were taxed by India as the FULL consideration as " +
        "a deemed dividend at slab rates, with the shares' cost basis becoming a capital LOSS rather than reducing the " +
        "dividend. The US, by contrast, ordinarily treats a share buyback as a capital transaction — gain or loss " +
        "against the shares' cost basis, not dividend income. The same cash is very likely characterized differently " +
        "by each country, which can distort both the FTC basket (passive/dividend vs. capital gain) and the true " +
        "amount of relief available. (Budget 2026 reversed this for buy-backs on/after 1-Apr-2026 — see s.69 instead.)",
        "Don't assume the general FTC computation resolves this cleanly — confirm how the US side actually reports the " +
        "buyback (capital transaction vs. dividend) and reconcile the mismatch explicitly, including the capital loss " +
        "India allows on the extinguished shares, which the US computation won't mirror the same way.",
        deemedDivUsd, ["s.2(40)(f)", "Share buyback", "FTC basket"]);
    }

    // -- 10b2. PROMOTER ADDITIONAL TAX ON BUYBACK GAINS (conflicts.js:1248-1269) --
    // Engine reads computed.indiaTax.promoterBuyback — omitted by
    // computeIndiaEntityTax, so this never fires for an India company/firm.
    // Mirror the undefined-for-entity (found by run-fuzz.js, SYS-3, 20 Jul 2026).
    // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21
    // Jul 2026): widened to also exclude AOP/Trust, whose entityTaxResult
    // similarly omits promoterBuyback detail (entitytax-nodes.js).
    var pb = (d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust) ? null : d.promoterBuybackDetail;
    if (pb && pb.totalExtraTaxInr > 1) {
      add("promoter_buyback_additional_tax", "warning", "income",
        "Promoter additional tax on buy-back gains — " + inr(pb.additionalTaxInr + pb.surchargeInr + pb.cessInr) + " on top of ordinary capital-gains tax",
        "As a promoter (s.69(2)(b)) on this buy-back, the ordinary " + (pb.ltcgGainInr > 0 ? "12.5% LTCG" : "20% STCG") +
        " tax on the gain is not the end of it: an additional tax brings the combined rate to " +
        Math.round(pb.targetRate * 100) + "% (" + (pb.isCorporatePromoter ? "corporate promoter" : "non-corporate promoter") +
        "), and a further 12% surcharge applies on that additional tax specifically — irrespective of total income. " +
        "Additional tax: " + inr(pb.additionalTaxInr) + "; surcharge: " + inr(pb.surchargeInr) + "; cess: " + inr(pb.cessInr) + ".",
        "Confirm promoter status (direct/indirect >10% shareholding, or Companies Act/SEBI promoter designation) is " +
        "correct before relying on this — the additional tax and surcharge do not apply to non-promoter shareholders " +
        "in the same buy-back at all.",
        inrToUsd(pb.totalExtraTaxInr, ctx), ["s.69(2)(b)", "Promoter additional tax", "Share buyback"]);
    }

    // -- 10b. FOREIGN GIFTS / TRUSTS — FORM 3520 (conflicts.js:1413-1444) ---
    var fg = d.foreignGiftsRaw;
    if (fg.receivedAbove100k || fg.isTrustBeneficiary) {
      var giftReasons = [];
      if (fg.receivedAbove100k) giftReasons.push("gift(s) from a foreign person exceeding $100,000 this year");
      if (fg.isTrustBeneficiary) giftReasons.push("US beneficiary of a foreign trust");
      add("foreign_gift_3520", "warning", "document",
        "Form 3520 required — foreign gift / trust reporting (no tax due, but real penalty exposure)",
        "Layer 1 records " + giftReasons.join(" and ") + ". Form 3520 is an INFORMATION return — there is no tax on a bona " +
        "fide gift — but the failure-to-file penalty is up to 25% of the unreported amount, and it is one of the most " +
        "commonly missed filings precisely because no tax is owed to prompt it.",
        "File Form 3520 (and 3520-A if a foreign trust with a US owner) by the return due date, even where no tax results. " +
        "Confirm the gift is genuinely a gift and not disguised compensation or a loan, and aggregate gifts from related donors.",
        0, ["Form 3520", "Form 3520-A"]);
    }
    if (fg.receivedFromCoveredExpatriate) {
      add("covered_expat_gift_tax", "critical", "credit",
        "§2801 covered-expatriate gift/bequest tax may apply",
        "A gift or bequest was received from someone Layer 1 flags as a covered expatriate. Unlike an ordinary foreign gift, " +
        "§2801 imposes a special transfer tax on the US RECIPIENT, at the highest gift/estate tax rate, on the value received " +
        "from a covered expatriate — this is a real tax liability, not just an information filing.",
        "Confirm the donor's covered-expatriate status and compute the §2801 tax on Form 708, finalized January 2026 (TD 10027) " +
        "with the first return due 15 Jul 2027 for gifts/bequests received in calendar 2025; this is separate from and in " +
        "addition to the Form 3520 reporting above.",
        0, ["§2801", "Form 708", "Covered expatriate"]);
    }

    // -- 4i. NRA TREATY RATE CLAIMED WITHOUT W-8BEN (conflicts.js:1037-1047) --
    var nra = d.nraRaw;
    if ((nra.treatyRateClaims || []).length > 0 && !nra.submittedW8ben) {
      add("nra_w8ben_missing", "critical", "treaty",
        "Treaty withholding rate claimed without Form W-8BEN on file",
        (nra.treatyRateClaims.length) + " treaty-rate claim(s) are recorded for US-source FDAP income, but Form W-8BEN " +
        "(certifying foreign status and the treaty claim to the withholding agent) is not on file. Without it, the payer " +
        "must withhold at the default 30% rather than the claimed treaty rate.",
        "File Form W-8BEN with each withholding agent to support the claimed treaty rate; without it, expect 30% " +
        "withholding and a refund claim on the 1040-NR instead of correct withholding at source.",
        0, ["Form W-8BEN", "Treaty rate claim"]);
    }

    // -- 4j. FIRPTA (conflicts.js:1049-1060) ---------------------------------
    if (nra.usRealPropertyDisposed) {
      add("firpta", "warning", "document",
        "FIRPTA withholding on US real property disposition",
        "A disposition of US real property by a foreign person is on file" +
        (nra.firptaWithholdingUsd > 0 ? " with " + usd(nra.firptaWithholdingUsd) + " withheld at closing" : "") +
        ". FIRPTA generally requires the buyer to withhold 15% of the gross sale price (not the gain) at closing, " +
        "regardless of the seller's actual tax liability on the transaction.",
        "File Form 8288-A/8288-B as applicable; if 15% of the gross price materially overstates the actual tax on the " +
        "gain, apply for a withholding certificate (Form 8288-B) BEFORE closing to reduce it, and reconcile the balance on the 1040-NR.",
        nra.firptaWithholdingUsd || 0, ["FIRPTA", "Form 8288-A", "Form 8288-B"]);
    }

    // -- 4f. PERMANENT ESTABLISHMENT — ARTICLE 7 (conflicts.js:681-699) -----
    var businessUsd = inrToUsd(d.businessComputation.businessInr || 0, ctx);
    if (d.hasPERaw && businessUsd > 0) {
      add("pe_article7", "warning", "treaty",
        "Permanent establishment in India — Article 7 business profits survive the tie-breaker",
        "A permanent establishment in India is on file alongside " + usd(businessUsd) +
        " of Indian business/professional income. Even where the DTAA Article 4 tie-breaker resolves general treaty " +
        "residence away from India, Article 7 still gives India the right to tax profits ATTRIBUTABLE to that PE — the " +
        "tie-breaker result doesn't exempt PE profits the way it can exempt other income categories.",
        "Confirm profit attribution to the PE (functions/assets/risks, arm's-length pricing) separately from the general " +
        "residency analysis, and don't assume a 'ceded' India residence removes India's claim on PE-sourced business profits.",
        0, ["DTAA Art. 7", "Permanent establishment"]);
    }

    // -- 4e. NO US-INDIA TOTALIZATION AGREEMENT (conflicts.js:657-679) ------
    var seTaxUsd = d.usTaxResult.seTaxUsd || 0;
    var salaryUsd = inrToUsd(d.salaryInr || 0, ctx);
    var hasIndiaNexus = res.india.isResident || businessUsd > 0 || salaryUsd > 0;
    if (seTaxUsd > 1 && hasIndiaNexus) {
      add("no_totalization_agreement", "warning", "credit",
        "No US–India Totalization Agreement — self-employment tax has no double-coverage relief",
        usd(seTaxUsd) + " of US self-employment tax (Schedule SE) is owed in full. Unlike ~30 countries with a US " +
        "Totalization Agreement, India has none — there is no Certificate of Coverage to exempt a self-employed or " +
        "seconded worker from social-security-style contributions in both countries, and no credit mechanism folds " +
        "Indian PF/social contributions into the US SE tax computation.",
        "Confirm whether Indian-side EPF/social contributions are also being made on the same work; if so this is " +
        "uncoordinated double coverage by design (not a filing error) — the only mitigants are entity structuring " +
        "(e.g., routing through a foreign corporation to convert SE income to a dividend/salary mix) or accepting the cost.",
        0, ["SE tax", "Schedule SE", "No US-India Totalization Agreement"]);
    }

    // -- 4d. NIIT / ADDITIONAL MEDICARE — NOT OFFSET BY THE FTC (conflicts.js:633-655) --
    var niitUsd = d.usTaxResult.niitUsd || 0;
    var addlMedUsd = d.usTaxResult.additionalMedicareUsd || 0;
    if ((niitUsd > 1 || addlMedUsd > 1) && d.ftcResult.us.indiaTaxPaidUsd > 0) {
      var surtaxParts = [];
      if (niitUsd > 1) surtaxParts.push("NIIT " + usd(niitUsd) + " (§1411, 3.8%)");
      if (addlMedUsd > 1) surtaxParts.push("Additional Medicare " + usd(addlMedUsd) + " (§3101(b)(2), 0.9%)");
      add("niit_medicare_not_creditable", "warning", "credit",
        "NIIT / Additional Medicare surtaxes are not offset by the Foreign Tax Credit",
        surtaxParts.join(" and ") + " applies on top of regular US income tax. Indian income tax can only credit the " +
        "REGULAR US income tax (§901/§904) — these two surtaxes are outside the FTC mechanism entirely, so they stand " +
        "as double taxation even when the rest of the Indian tax is fully credited.",
        "There is no credit path for this residue — the only levers are reducing MAGI/net investment income (retirement " +
        "contributions, timing) or, for Additional Medicare, W-4 withholding planning. Make sure the client understands " +
        "the FTC reconciliation above does not clear this amount.",
        niitUsd + addlMedUsd, ["§1411", "§3101(b)(2)", "Form 8960", "Form 8959"]);
    }

    return findings;
  }
};

module.exports = { NODES: NODES };

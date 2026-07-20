"use strict";
/* ============================================================================
 * Closes XBR-6: computeIndiaItrForm (India's 7-form ITR eligibility solver)
 * — scoped in detail 19 Jul 2026 (docs/DAG_MIGRATION_TRACKER.md, section C):
 * "small, rule-table-shaped function... every input already ported except
 * one to verify."
 *
 * That one field turned out to be a real gap, not a rename: the DAG's
 * totalIncomeInrV3 (in1-nodes-v3.js) is POST-Chapter-VI-A-deduction income
 * (totalNormalInr + special-rate heads) — computeIndiaItrForm actually reads
 * computed.indiaTax.grossTotalIncomeInr, the PRE-deduction figure
 * (normalSlabInr + the same special-rate heads, computation.js:489). Traced
 * both formulas term-by-term from source: identical except the first term
 * (totalNormalInr vs normalSlabInr) — ported here as grossTotalIncomeInrV3,
 * a sibling of totalIncomeInrV3 with that one term swapped, same deps
 * otherwise. For an entity (company/firm), the engine's grossTotalIncomeInr
 * IS entityTaxableInrBoundary already (computation.js:718, computeIndiaEntityTax's
 * own taxableInr, no Chapter VI-A deductions ever apply to companies) — no
 * new derivation needed there, just routing (grossTotalIncomeInrCombined,
 * same isEntityTaxpayer gate india-full-nodes.js already built for
 * totalTaxInrCombined/regimeCombined).
 *
 * Also closes AGG-1's last recorded knownMissing side-channel
 * (agricultural_income_inr, normalize.js L731) — see
 * aggregateindiaincome-nodes.js's agriculturalIncomeInrAgg, added
 * alongside this file specifically because this is its one real consumer
 * (the >Rs5,000 ITR-1/4 disqualifier below).
 *
 * Five more small raw leaves round out the fact set: foreign income/assets
 * declared, brought-forward losses, company-director flag, s.115BAA-style
 * profile facts already read elsewhere for entities but not yet for this
 * check, and Layer 1's OWN persisted ITR recommendation (read for the
 * cross-check fields only, never as the primary answer — same discipline
 * as the real engine).
 *
 * Verified in run-itrform.js: exact match against computed.indiaItrForm
 * for all 11 real profiles, ctx carrying only {router, india, us} — no
 * model/computed at all.
 * ==========================================================================*/
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}

var indiaFullNodes = require("./india-full-nodes.js").NODES;

var NODES = {};
Object.keys(indiaFullNodes).forEach(function (k) { NODES[k] = indiaFullNodes[k]; });

// ---- the one real gap: gross (pre-Chapter-VI-A-deduction) total income --
// Sibling of totalIncomeInrV3 (in1-nodes-v3.js:365) — identical formula,
// normalSlabInr substituted for totalNormalInr (the only term that differs
// between computation.js's grossTotalIncomeInr and totalIncomeInr, L489 vs
// L440 — traced term-by-term, not assumed).
NODES.grossTotalIncomeInrV3 = {
  deps: ["normalSlabInr", "stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "specialRate115bbInr", "vdaGainInrBoundary",
    "chapterXiiaInvestmentIncomeInrBoundary", "nrInterest", "s115aDividend", "s115aRoyalty", "s115aFts"],
  compute: function (d) {
    return d.normalSlabInr + d.stcgTaxableInr + d.ltcgTaxableInr + d.ltcg197TaxableInr + d.specialRate115bbInr + d.vdaGainInrBoundary +
      d.chapterXiiaInvestmentIncomeInrBoundary + (d.nrInterest ? d.nrInterest.carvedOutInr : 0) +
      (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) + (d.s115aFts ? d.s115aFts.totalInr : 0);
  }
};
// Entity path: computeIndiaEntityTax's own grossTotalIncomeInr IS its
// taxableInr (computation.js:718) — no Chapter VI-A deductions ever apply
// to a company/firm, so entityTaxableInrBoundary (already closed, TAX-2)
// is already the right figure, just needs routing.
NODES.grossTotalIncomeInrCombined = {
  deps: ["isEntityTaxpayer", "grossTotalIncomeInrV3", "entityTaxableInrBoundary"],
  compute: function (d) { return d.isEntityTaxpayer ? d.entityTaxableInrBoundary : d.grossTotalIncomeInrV3; }
};

// ---- raw leaves not read by any earlier-closed phase ----------------------
NODES.indiaForeignIncomeDeclaredRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "foreign_income.has_foreign_income", null); } };
NODES.indiaForeignAssetsDeclaredRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "foreign_assets.has_foreign_assets", null); } };
NODES.indiaHasBroughtForwardLossesRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "carry_forward_losses.has_brought_forward_losses", null); } };
NODES.indiaIsCompanyDirectorRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.is_company_director", false) === true; } };
NODES.indiaIsSection8Raw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "profile.is_section_8", false) === true; } };
// Layer 1's OWN persisted recommendation (itr_recommendation.form), when it
// ran — for the cross-check fields only (frontendForm/frontendExplanation/
// matchesFrontend below), never the primary answer. "Unknown" collapses to
// null, matching normalize.js L2159-2160 exactly.
NODES.indiaLayer1ItrRaw = {
  deps: [],
  compute: function (d, ctx) {
    var v = safe(ctx.india, "itr_recommendation.form", null);
    return v === "Unknown" ? null : v;
  }
};
NODES.indiaReturnFormExplanationRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "itr_recommendation.explanation", null); } };

// ---- computeIndiaItrForm, ported in full -----------------------------------
NODES.indiaItrFormResult = {
  deps: ["indiaEntityTypeRaw", "indiaResidencyStatusRawAgg", "grossTotalIncomeInrCombined",
    "stcgInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "stcgSlabInrBoundary",
    "indiaForeignIncomeDeclaredRaw", "indiaForeignAssetsDeclaredRaw",
    "vdaGainInrBoundary", "capitalGainsComputation", "totalIndiaIncomeInr",
    "agriculturalIncomeInrAgg", "specialRate115bbInr", "indiaHasBroughtForwardLossesRaw",
    "speculativeIncomeInrAgg", "fnoIncomeInrAgg", "indiaIsCompanyDirectorRaw",
    "businessComputation", "indiaIncomeModelResult", "indiaIsSection8Raw",
    "indiaLayer1ItrRaw", "indiaReturnFormExplanationRaw"],
  compute: function (d) {
    var entity = d.indiaEntityTypeRaw;
    var isInd = entity === "individual", isHuf = entity === "huf";
    var isROR = d.indiaResidencyStatusRawAgg === "ROR";
    var totalIncomeInr = d.grossTotalIncomeInrCombined || 0;

    var stcg111A = d.stcgInrBoundary || 0;
    var ltcg112A = d.ltcgInrBoundary || 0;
    var ltcg112 = d.ltcg197InrBoundary || 0;
    var stcgOther = d.stcgSlabInrBoundary || 0;
    var otherCapitalGains = stcg111A + ltcg112 + stcgOther;
    var hasDisqualifyingCapitalGains = otherCapitalGains > 0 || ltcg112A > 125000;

    var hasForeignIncome = (isInd || isHuf) && d.indiaForeignIncomeDeclaredRaw === true;
    var hasForeignAssets = (isInd || isHuf) && d.indiaForeignAssetsDeclaredRaw === true;
    var hasCrypto = (isInd || isHuf) && ((d.vdaGainInrBoundary || 0) > 0 || (d.capitalGainsComputation.vdaSaleConsiderationInr || 0) > 0);
    // Found by run-fuzz.js (randomized differential testing, 20 Jul 2026):
    // businessComputation has no housePropertyCount field at all (it only
    // ever returns businessInr/businessDepreciationInr/indiaHasRegular-
    // BooksEntry/indiaHasValidPresumptiveEntry/indiaHasPartnerFirmIncome) —
    // this read was always undefined, so the "more than 2 house properties"
    // ITR disqualifier could never fire, on any profile. The correct count
    // already exists on indiaIncomeModelResult (built for the monitor-next
    // integration, same file), just never wired here. None of the 11 real
    // profiles has >2 house properties, which is why no earlier fixture-
    // based check ever exercised this branch.
    var multipleHP = (d.indiaIncomeModelResult.housePropertyCount || 0) > 2;
    var hasHighAgriIncome = (d.agriculturalIncomeInrAgg || 0) > 5000;
    var hasLotteryOrGaming = (d.specialRate115bbInr || 0) > 0;
    var hasBFLosses = d.indiaHasBroughtForwardLossesRaw === true;
    var hasSpeculativeOrFNO = (d.speculativeIncomeInrAgg || 0) !== 0 || (d.fnoIncomeInrAgg || 0) !== 0;
    var isDirector = isInd && d.indiaIsCompanyDirectorRaw === true;
    var directorUnknown = isInd && !isDirector;

    var disqualifiers = [];
    if (totalIncomeInr > 5000000) disqualifiers.push("Total income exceeds ₹50,00,000 (₹" + Math.round(totalIncomeInr).toLocaleString("en-IN") + ")");
    if (!isROR) disqualifiers.push("Not Resident & Ordinarily Resident (status: " + (d.indiaResidencyStatusRawAgg || "unknown") + ")");
    if (hasDisqualifyingCapitalGains) {
      disqualifiers.push(otherCapitalGains > 0
        ? "Capital gains beyond the s.198-only allowance (STCG and/or non-s.198 LTCG present)"
        : "LTCG under s.198 exceeds the ₹1,25,000 threshold (₹" + Math.round(ltcg112A).toLocaleString("en-IN") + ")");
    }
    if (hasForeignIncome) disqualifiers.push("Foreign income declared (foreign_income.has_foreign_income)");
    if (hasForeignAssets) disqualifiers.push("Foreign assets declared (Schedule FA)");
    if (hasCrypto) disqualifiers.push("Crypto/VDA gains or sale activity on file");
    if (multipleHP) disqualifiers.push("More than 2 house properties (" + d.indiaIncomeModelResult.housePropertyCount + ")");
    if (hasHighAgriIncome) disqualifiers.push("Agricultural income exceeds ₹5,000 (₹" + Math.round(d.agriculturalIncomeInrAgg).toLocaleString("en-IN") + ")");
    if (hasLotteryOrGaming) disqualifiers.push("Lottery/betting/online-gaming winnings on file (s.128/194)");
    if (hasBFLosses) disqualifiers.push("Brought-forward losses on file");
    if (hasSpeculativeOrFNO) disqualifiers.push("Speculative or F&O business income on file");
    if (isDirector) disqualifiers.push("Company director (profile.is_company_director)");

    var isDisqualified = disqualifiers.length > 0;

    var hasBusiness = !!(d.businessComputation.indiaHasRegularBooksEntry || d.businessComputation.indiaHasValidPresumptiveEntry ||
      (d.fnoIncomeInrAgg || 0) !== 0 || (d.speculativeIncomeInrAgg || 0) !== 0);
    var hasPartnerIncome = !!d.businessComputation.indiaHasPartnerFirmIncome;
    var presumptiveOnly = d.businessComputation.indiaHasValidPresumptiveEntry === true && !d.businessComputation.indiaHasRegularBooksEntry &&
      !hasPartnerIncome && (d.fnoIncomeInrAgg || 0) === 0 && (d.speculativeIncomeInrAgg || 0) === 0;

    var form, explanation;

    if (entity === "company") {
      if (d.indiaIsSection8Raw) { form = "ITR-7"; explanation = "For NGOs, Public Charitable Trusts, registered Societies, and Section 8 Companies claiming tax exemptions."; }
      else { form = "ITR-6"; explanation = "For Corporate Companies (Private Limited, Public Limited, OPCs) not claiming charitable exemptions."; }
    } else if (["trust", "ngo", "society", "political_party"].indexOf(entity) >= 0) {
      form = "ITR-7"; explanation = "For NGOs, Public Charitable Trusts, registered Societies, and Political Parties claiming tax exemptions under Trust & NGO Tax Exemptions.";
    } else if (["firm", "aop", "boi", "ajp", "local"].indexOf(entity) >= 0) {
      if (entity === "firm" && !isDisqualified && presumptiveOnly) {
        form = "ITR-4 (SUGAM)"; explanation = "For Resident Partnership Firms (excluding LLPs) with total income up to ₹50 Lakhs opting for Presumptive Taxation (44AD, 44ADA, 44AE).";
      } else {
        form = "ITR-5"; explanation = "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities.";
      }
    } else if (entity === "llp") {
      form = "ITR-5"; explanation = "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities.";
    } else if (isInd || isHuf) {
      if (hasBusiness || hasPartnerIncome) {
        if (!isDisqualified && presumptiveOnly && !hasPartnerIncome) {
          form = "ITR-4 (SUGAM)"; explanation = "For Resident Individuals and HUFs with total income up to ₹50 Lakhs who opt exclusively for the Presumptive Taxation Scheme (44AD/44ADA/44AE).";
        } else {
          form = "ITR-3"; explanation = "For Individuals and HUFs with Business or Professional Income maintaining books, or receiving remuneration/interest as a partner in a firm. Mandatory if disqualified from ITR-4.";
        }
      } else if (isInd && !isDisqualified) {
        form = "ITR-1 (SAHAJ)"; explanation = "For Resident Salaried Individuals with total income up to ₹50 Lakhs (Salary, up to 2 house properties, basic other sources). Restrictions: no foreign assets/income, no capital gains beyond the s.198-only allowance, no directorships.";
      } else {
        form = "ITR-2"; explanation = "For Individuals and HUFs not having business/profession income but having Capital Gains, Foreign Income/Assets, multiple properties, or otherwise not qualifying for ITR-1." +
          (disqualifiers.length ? " Disqualified from ITR-1 due to: " + disqualifiers.join("; ") + "." : "");
      }
    } else {
      form = "ITR-2"; explanation = "Entity type not otherwise classified — defaulting to ITR-2 pending a proper Layer 1 entity-type read.";
    }

    return {
      form: form,
      explanation: explanation,
      disqualified: isDisqualified,
      disqualifiers: disqualifiers,
      totalIncomeInr: totalIncomeInr,
      directorUnknown: directorUnknown,
      frontendForm: d.indiaLayer1ItrRaw,
      frontendExplanation: d.indiaLayer1ItrRaw ? d.indiaReturnFormExplanationRaw : null,
      matchesFrontend: d.indiaLayer1ItrRaw ? (d.indiaLayer1ItrRaw === form) : null
    };
  }
};

module.exports = { NODES: NODES };

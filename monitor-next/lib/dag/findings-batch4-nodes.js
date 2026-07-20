"use strict";
/* ============================================================================
 * CFL-6 batch 4: treaty_docs_missing, dtaa_treaty_elections,
 * withholding_documentation_gap, carry_forward_losses_not_applied,
 * feie_ineligible, feie_applied, nra_fdap_flat_rate.
 *
 * Unlike batches 1-3 (mostly wiring already-computed values to new finding
 * logic), every item here needed a genuine new derivation — a DAG node
 * that computes something the existing chain didn't yet expose, ported
 * from the engine's real source rather than approximated:
 *
 *   - treaty_docs_missing: turned out to need ZERO new work once actually
 *     traced — every raw fact it reads (treatyElections/trcStatus/
 *     form10fFiled/treatyResidence/usTreatyResidence/dtaaForcedNr/
 *     files1040nr) was already a raw leaf in in1-nodes-v3.js/residency-
 *     nodes.js (built for TAX-1's s115a/nrInterest machinery), just never
 *     wired to a finding. Previously mis-scoped as "moderate effort."
 *
 *   - dtaa_treaty_elections: needs the per-election outcome detail
 *     (article/rates/docs/outcome tag) that computeS115aStream/
 *     computeNrInterestTreatment build in the engine (computation.js:547-
 *     640) but the DAG's existing in1-nodes-v3.js versions of those same
 *     functions don't (TAX-1's own recorded knownMissing gap — tax FIGURES
 *     match, the elections[] metadata didn't exist DAG-side). Ported here
 *     as computeS115aStreamDetailed/computeNrInterestTreatmentDetailed —
 *     same algorithm, sibling nodes (s115aDividendDetailed/s115aRoyalty
 *     Detailed/s115aFtsDetailed/nrInterestDetailed) alongside the existing
 *     closed ones rather than modifying them, same "promoterBuybackDetail"
 *     pattern batch 3 already established.
 *
 *   - withholding_documentation_gap: turned out to need much less than its
 *     batch-1 "AGG-6/7" mis-scoping assumed. Read buildWithholdingSummary()
 *     (conflicts.js:2246-2470) in full: the India-side "general" TDS/TCS
 *     aggregate rows it also builds (needing AGG-6/7) all set gapInr: 0 —
 *     they display in the row-by-row breakdown but contribute NOTHING to
 *     wh.totalGapInr/totalGapUsd, which is the only thing this finding
 *     actually reads. The real total is just indiaTotalGapInr (from the
 *     SAME s115a/nrInterest detailed elections dtaa_treaty_elections needs)
 *     plus usTotalGapUsd (the FDAP treaty-rate-denial gap, computed below).
 *
 *   - carry_forward_losses_not_applied: needs the engine's full
 *     computeLossSetOff (computation.js:101-216) used/unused breakdown —
 *     the DAG's own in1-nodes-v3.js computeLossSetOff (TAX-3, closed) is
 *     algorithmically identical but only returns post-set-off bucket
 *     totals, not the per-category used/unused amounts this finding
 *     narrates. Ported as a full sibling, lossSetOffDetailed, same inputs
 *     as the existing lossSetOffV3 node.
 *
 *   - feie_ineligible/feie_applied: needs feieEligibility()'s reasons[]
 *     array (computation.js:758-784) — the DAG's ustax-nodes.js version
 *     (TAX-6, closed) returns every OTHER field but reasons[], which turns
 *     out to be a pure function of the same feieRaw facts already read —
 *     no new raw leaf needed, just the extra derivation.
 *
 *   - nra_fdap_flat_rate: re-reading computeNraTax (computation.js:1195-
 *     1217) shows fdapRate itself needs only nra.submittedW8ben and
 *     nra.treatyRateClaims[0].rate — both already in batch 3's nraRaw —
 *     NOT the rest of computeNraTax's ECI/bracket machinery (TAX-8 stays
 *     genuinely scoped out for the liability figures; only this one small,
 *     self-contained rate derivation was needed). Same mis-scoping
 *     correction pattern as batch 3's nra_w8ben_missing/firpta.
 *
 * Verified in run-findings4.js: exact finding-ID-set match against
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
function inrToUsd(v) { return Number(v) / 83.0; }

var findingsBatch3Nodes = require("./findings-batch3-nodes.js").NODES;
var NODES = {};
Object.keys(findingsBatch3Nodes).forEach(function (k) { NODES[k] = findingsBatch3Nodes[k]; });

var S115A_RATES = require("../engine/constants.js").CONST.TAX.INDIA.S115A_RATES; // SYS-1: shared

/* ---- computeS115aStreamDetailed: sibling of in1-nodes-v3.js's
 * computeS115aStream, same math (computation.js:547-585), plus the
 * per-election elections[] detail array. ------------------------------- */
function computeS115aStreamDetailed(treaty, incomeType, aggregateTotalInr) {
  var domestic = S115A_RATES[incomeType];
  var docsOk = treaty.trcStatus && treaty.form10fFiled;
  var hasAggregate = aggregateTotalInr != null;
  var remainingInr = hasAggregate ? aggregateTotalInr : 0;
  var claimedInr = 0, taxInr = 0;
  var elections = [];
  (treaty.treatyElections || []).forEach(function (e) {
    if (!e || e.income_type !== incomeType) return;
    var raw = num(e.amount_inr);
    var amt = hasAggregate ? Math.min(raw, Math.max(0, remainingInr)) : raw;
    var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
    var rate = (docsOk && electedRate != null) ? Math.min(domestic, electedRate) : domestic;
    var electionTaxInr = amt * rate;
    claimedInr += amt;
    taxInr += electionTaxInr;
    elections.push({
      article: e.treaty_article || null, requestedAmountInr: raw, appliedAmountInr: amt,
      electedRate: electedRate, domesticRate: domestic, rateApplied: rate, taxInr: electionTaxInr,
      outcome: !docsOk ? "denied_no_docs" : (electedRate != null && electedRate < domestic ? "elected_rate_applied" : "domestic_rate_wins")
    });
    if (hasAggregate) remainingInr -= amt;
  });
  var uncapturedInr = hasAggregate ? Math.max(0, remainingInr) : 0;
  var uncapturedTaxInr = uncapturedInr * domestic;
  taxInr += uncapturedTaxInr;
  var totalInr = hasAggregate ? aggregateTotalInr : claimedInr;
  return {
    totalInr: totalInr, taxInr: taxInr, claimedInr: claimedInr, uncapturedInr: uncapturedInr,
    uncapturedTaxInr: uncapturedTaxInr, elections: elections,
    domesticRate: domestic, effectiveRate: totalInr > 0 ? taxInr / totalInr : domestic
  };
}
/* ---- computeNrInterestTreatmentDetailed: sibling of computeNrInterestTreatment,
 * same math (computation.js:607-640), plus elections[] detail. --------- */
function computeNrInterestTreatmentDetailed(treaty, slabs, otherSlabIncomeInr, interestAggregateInr, bracketTax) {
  var docsOk = treaty.trcStatus && treaty.form10fFiled;
  var remainingInr = interestAggregateInr;
  var elections = [];
  var carvedOutInr = 0, carvedOutTaxInr = 0;
  (treaty.treatyElections || []).forEach(function (e) {
    if (!e || e.income_type !== "interest") return;
    var raw = num(e.amount_inr);
    var amt = Math.min(raw, Math.max(0, remainingInr));
    if (amt <= 0) return;
    remainingInr -= amt;
    var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
    var canElect = docsOk && electedRate != null;
    var marginalSlabTaxInr = bracketTax(otherSlabIncomeInr + interestAggregateInr, slabs) -
                              bracketTax(otherSlabIncomeInr + interestAggregateInr - amt, slabs);
    var treatyTaxInr = canElect ? amt * electedRate : null;
    var carvedOut = canElect && treatyTaxInr < marginalSlabTaxInr;
    if (carvedOut) { carvedOutInr += amt; carvedOutTaxInr += treatyTaxInr; }
    elections.push({
      article: e.treaty_article || null, requestedAmountInr: raw, appliedAmountInr: amt,
      electedRate: electedRate, marginalSlabTaxInr: marginalSlabTaxInr, treatyTaxInr: treatyTaxInr,
      carvedOut: carvedOut,
      outcome: !docsOk ? "denied_no_docs" : (electedRate == null ? "no_rate" : (carvedOut ? "treaty_beats_slab" : "slab_beats_treaty"))
    });
  });
  var uncapturedInr = Math.max(0, remainingInr);
  return {
    totalInr: interestAggregateInr, slabEligibleInr: interestAggregateInr - carvedOutInr,
    carvedOutInr: carvedOutInr, carvedOutTaxInr: carvedOutTaxInr,
    uncapturedInr: uncapturedInr, elections: elections
  };
}
// Matches in1-nodes-v3.js's own bracketTax exactly — slabs is an array of
// [cap, rate] pairs (T.SLABS_NEW/SLABS_OLD), not {upto, rate} objects.
function bracketTax(amount, slabs) {
  var t = Math.max(0, amount), tax = 0, prev = 0;
  for (var i = 0; i < slabs.length; i++) {
    var cap = slabs[i][0], rate = slabs[i][1];
    if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; } else break;
  }
  return tax;
}

/* ---- computeLossSetOffDetailed: sibling of in1-nodes-v3.js's
 * computeLossSetOff (TAX-3, closed), same math (computation.js:101-216),
 * plus the used/unused per-category breakdown. -------------------------- */
function computeLossSetOffDetailed(cfl, buckets) {
  var businessInr = buckets.businessInr, housePropertyInr = buckets.housePropertyInr;
  var otherNormalInr = buckets.otherNormalInr, stcgInr = buckets.stcgInr, ltcgGrossInr = buckets.ltcgGrossInr;
  var speculativeInr = Math.max(0, buckets.speculativeInr || 0);
  var stcgSlabInr = buckets.stcgSlabInr || 0;
  var ltcg197Inr = buckets.ltcg197Inr || 0;

  var businessLossUsed = Math.min(cfl.businessLossAvailableInr || 0, businessInr);
  businessInr -= businessLossUsed;
  var businessLossUnused = (cfl.businessLossAvailableInr || 0) - businessLossUsed;

  var hpLossUsed = Math.min(cfl.housePropertyLossAvailableInr || 0, housePropertyInr);
  housePropertyInr -= hpLossUsed;
  var hpLossUnused = (cfl.housePropertyLossAvailableInr || 0) - hpLossUsed;

  var stcgLossAvail = cfl.stcgLossAvailableInr || 0;
  var stcgLossUsedVsStcgSlab = Math.min(stcgLossAvail, stcgSlabInr);
  stcgSlabInr -= stcgLossUsedVsStcgSlab;
  var stcgLossAfterSlab = stcgLossAvail - stcgLossUsedVsStcgSlab;
  var stcgLossUsedVsStcg = Math.min(stcgLossAfterSlab, stcgInr);
  stcgInr -= stcgLossUsedVsStcg;
  var stcgLossAfterFlat = stcgLossAfterSlab - stcgLossUsedVsStcg;
  var stcgLossUsedVsLtcg197 = Math.min(stcgLossAfterFlat, ltcg197Inr);
  ltcg197Inr -= stcgLossUsedVsLtcg197;
  var stcgLossAfterLtcg197 = stcgLossAfterFlat - stcgLossUsedVsLtcg197;
  var stcgLossUsedVsLtcg198 = Math.min(stcgLossAfterLtcg197, ltcgGrossInr);
  ltcgGrossInr -= stcgLossUsedVsLtcg198;
  var stcgLossUnused = stcgLossAfterLtcg197 - stcgLossUsedVsLtcg198;
  var stcgLossUsedVsLtcg = stcgLossUsedVsLtcg197 + stcgLossUsedVsLtcg198;

  var ltcgLossAvail = cfl.ltcgLossAvailableInr || 0;
  var ltcgLossUsedVs197 = Math.min(ltcgLossAvail, ltcg197Inr);
  ltcg197Inr -= ltcgLossUsedVs197;
  var ltcgLossAfter197 = ltcgLossAvail - ltcgLossUsedVs197;
  var ltcgLossUsedVs198 = Math.min(ltcgLossAfter197, ltcgGrossInr);
  ltcgGrossInr -= ltcgLossUsedVs198;
  var ltcgLossUnused = ltcgLossAfter197 - ltcgLossUsedVs198;
  var ltcgLossUsed = ltcgLossUsedVs197 + ltcgLossUsedVs198;

  var speculativeLossAvail = cfl.speculativeLossAvailableInr || 0;
  var speculativeLossUsed = Math.min(speculativeLossAvail, speculativeInr);
  speculativeInr -= speculativeLossUsed;
  var speculativeLossUnused = speculativeLossAvail - speculativeLossUsed;

  var depRemaining = cfl.unabsorbedDepreciationCf || 0;
  var used;
  used = Math.min(depRemaining, businessInr); businessInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, housePropertyInr); housePropertyInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, stcgSlabInr); stcgSlabInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, stcgInr); stcgInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, ltcg197Inr); ltcg197Inr -= used; depRemaining -= used;
  used = Math.min(depRemaining, ltcgGrossInr); ltcgGrossInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, otherNormalInr); otherNormalInr -= used; depRemaining -= used;
  used = Math.min(depRemaining, speculativeInr); speculativeInr -= used; depRemaining -= used;
  var depUsed = (cfl.unabsorbedDepreciationCf || 0) - depRemaining;

  var totalUsedInr = businessLossUsed + hpLossUsed + stcgLossUsedVsStcgSlab + stcgLossUsedVsStcg + stcgLossUsedVsLtcg + ltcgLossUsed + speculativeLossUsed + depUsed;
  var totalUnusedInr = businessLossUnused + hpLossUnused + stcgLossUnused + ltcgLossUnused + speculativeLossUnused + depRemaining;

  return {
    totalUsedInr: totalUsedInr, totalUnusedInr: totalUnusedInr,
    unused: {
      businessInr: businessLossUnused, housePropertyInr: hpLossUnused,
      stcgInr: stcgLossUnused, ltcgInr: ltcgLossUnused,
      speculativeInr: speculativeLossUnused, unabsorbedDepreciationInr: depRemaining
    },
    used: {
      businessInr: businessLossUsed, housePropertyInr: hpLossUsed,
      stcgSlabInr: stcgLossUsedVsStcgSlab, stcgInr: stcgLossUsedVsStcg, ltcgFromStcgLossInr: stcgLossUsedVsLtcg, ltcgInr: ltcgLossUsed,
      speculativeInr: speculativeLossUsed, unabsorbedDepreciationInr: depUsed
    }
  };
}

// ---- raw leaves not read by any earlier-closed phase -----------------------
NODES.carryForwardLossesMetaRaw = {
  deps: [], compute: function (d, ctx) {
    return {
      hasBroughtForwardLosses: safe(ctx.india, "carry_forward_losses.has_brought_forward_losses", null),
      businessLossCfCount: (safe(ctx.india, "carry_forward_losses.business_loss_cf", []) || []).length,
      speculativeLossCfCount: (safe(ctx.india, "carry_forward_losses.speculative_loss_cf", []) || []).length,
      stcgLossCfCount: (safe(ctx.india, "carry_forward_losses.stcg_loss_cf", []) || []).length,
      ltcgLossCfCount: (safe(ctx.india, "carry_forward_losses.ltcg_loss_cf", []) || []).length,
      housePropertyLossCfCount: (safe(ctx.india, "carry_forward_losses.house_property_loss_cf", []) || []).length,
      unabsorbedDepreciationCf: num(safe(ctx.india, "carry_forward_losses.unabsorbed_depreciation_cf", 0))
    };
  }
};

// ---- detailed sibling nodes (same inputs as the already-closed ones) ------
// Entity-gated to match computeIndiaTax's own routing (computation.js:221-227):
// a company/firm short-circuits to computeIndiaEntityTax BEFORE
// computeS115aStream/computeNrInterestTreatment ever run, so computed.indiaTax.s115a
// doesn't exist at all for an entity taxpayer — not "empty", genuinely absent.
// isNRV3 alone (raw individual residency status) isn't sufficient: an entity
// can carry an NR-shaped raw residency status without ever routing through
// the individual computation. Found via run-fuzz.js, SYS-3, 20 Jul 2026 —
// dtaa_treaty_elections' detail text disagreed with the engine specifically
// on India-entity fuzz profiles (the finding kept computing real per-election
// outcomes the engine's entity path never produces, since it never reaches
// this code at all).
NODES.s115aDividendDetailed = {
  deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"],
  compute: function (d) { return (d.isNRV3 && !d.isEntityTaxpayer) ? computeS115aStreamDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "dividend", d.dividendInr) : null; }
};
NODES.s115aRoyaltyDetailed = {
  deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
  compute: function (d) { return (d.isNRV3 && !d.isEntityTaxpayer) ? computeS115aStreamDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "royalty", null) : null; }
};
NODES.s115aFtsDetailed = {
  deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
  compute: function (d) { return (d.isNRV3 && !d.isEntityTaxpayer) ? computeS115aStreamDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "fts", null) : null; }
};
NODES.nrInterestDetailed = {
  deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "slabs", "salaryInr", "businessInrBoundaryV3",
    "housePropertyInr", "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr"],
  compute: function (d) {
    if (!d.isNRV3 || d.isEntityTaxpayer) return null;
    var otherSlabIncomeInr = d.salaryInr + d.businessInrBoundaryV3 + d.housePropertyInr + d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary;
    return computeNrInterestTreatmentDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, d.slabs, otherSlabIncomeInr, d.interestInr, bracketTax);
  }
};
NODES.lossSetOffDetailed = {
  deps: ["businessInrBoundaryV3", "businessDepreciationInrBoundary", "cflBusinessInr", "cflSpeculativeInr", "cflStcgInr", "cflLtcgInr",
    "cflHousePropertyInr", "cflUnabsorbedDepreciationInr", "housePropertyInr", "isNRV3", "nrInterest",
    "deemedDividendBuybackInrBoundary", "otherSourcesMiscInrBoundary", "interestInr", "dividendInr",
    "stcgInrBoundary", "stcgSlabInrBoundary", "ltcgInrBoundary", "ltcg197InrBoundary", "speculativeIncomeInrBoundaryV3"],
  compute: function (d) {
    var businessInrRaw = d.businessInrBoundaryV3;
    var unabsorbedDepThisYearInr = businessInrRaw < 0 ? Math.min(d.businessDepreciationInrBoundary, -businessInrRaw) : 0;
    var cflForSetOff = {
      businessLossAvailableInr: d.cflBusinessInr, speculativeLossAvailableInr: d.cflSpeculativeInr,
      stcgLossAvailableInr: d.cflStcgInr, ltcgLossAvailableInr: d.cflLtcgInr,
      housePropertyLossAvailableInr: d.cflHousePropertyInr,
      unabsorbedDepreciationCf: d.cflUnabsorbedDepreciationInr + unabsorbedDepThisYearInr
    };
    var nrInterestSlabEligibleInr = d.nrInterest ? d.nrInterest.slabEligibleInr : 0;
    return computeLossSetOffDetailed(cflForSetOff, {
      businessInr: Math.max(0, businessInrRaw),
      housePropertyInr: d.housePropertyInr,
      otherNormalInr: d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary + (d.isNRV3 ? nrInterestSlabEligibleInr : d.interestInr + d.dividendInr),
      stcgInr: d.stcgInrBoundary, stcgSlabInr: d.stcgSlabInrBoundary, ltcgGrossInr: d.ltcgInrBoundary, ltcg197Inr: d.ltcg197InrBoundary,
      speculativeInr: Math.max(0, d.speculativeIncomeInrBoundaryV3)
    });
  }
};
NODES.feieDetailed = {
  deps: ["feieRaw", "feie", "usTaxResult"],
  compute: function (d) {
    var f = d.feieRaw;
    var home = String(f.taxHomeCountry || "").trim().toLowerCase();
    var taxHomeAbroad = d.feie.taxHomeAbroad;
    var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
    var ppMet = !!f.physicalPresence && ppDaysOk;
    var bfMet = !!f.bonaFide;
    var reasons = [];
    if (d.feie.claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
    if (d.feie.claimed && !bfMet && !ppMet) {
      reasons.push(!f.physicalPresence && !f.bonaFide
        ? "neither the bona-fide-residence nor the physical-presence test is met"
        : (f.physicalPresence && !ppDaysOk
          ? (f.daysInUsTestPeriod + " US days in the test period — over the ~35-day allowance (330 full days abroad required)")
          : "bona-fide-residence test not met"));
    }
    return {
      claimed: d.feie.claimed, amountClaimedUsd: d.feie.amountClaimedUsd, taxHomeAbroad: taxHomeAbroad,
      testMet: d.feie.testMet, eligible: d.feie.eligible, reasons: reasons, appliedUsd: d.usTaxResult.feieAppliedUsd
    };
  }
};
// nra_fdap_flat_rate/withholding_documentation_gap's FDAP slice needs only
// nra.submittedW8ben + nra.treatyRateClaims[0].rate (computation.js:1204-
// 1217) — NOT the rest of computeNraTax's ECI/bracket machinery, which
// stays genuinely scoped out (TAX-8).
NODES.nraFdapIncomeUsdRaw = { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "nra_specific.us_fdap_income_usd", 0)); } };
NODES.nraEciIncomeUsdRaw = { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "nra_specific.us_eci_income_usd", 0)); } };
NODES.nraFdapDetail = {
  deps: ["nraRaw", "nraFdapIncomeUsdRaw"],
  compute: function (d) {
    var claim = (d.nraRaw.treatyRateClaims || [])[0];
    // Two distinct "claimed rate" readings, matching the engine's own two
    // separate variables of the same name in different scopes: the RAW
    // Layer 1 value (e.g. 15, for display — conflicts.js's own claimedRate)
    // vs. the NORMALIZED 0-1 fraction computeNraTax actually computes with
    // (computation.js:1205, claim.rate / 100).
    var rawClaimedRatePct = (claim && claim.rate != null) ? claim.rate : null;
    var claimedRateFraction = (claim && claim.rate != null) ? Math.max(0, Math.min(1, Number(claim.rate) / 100)) : null;
    var w8benOnFile = d.nraRaw.submittedW8ben === true;
    var fdapRate = (w8benOnFile && claimedRateFraction != null) ? claimedRateFraction : 0.30;
    var fdapUsd = d.nraFdapIncomeUsdRaw;
    var gapUsd = (!w8benOnFile && claimedRateFraction != null && claimedRateFraction < 0.30) ? fdapUsd * (0.30 - claimedRateFraction) : 0;
    return {
      fdapUsd: fdapUsd, fdapRate: fdapRate, claimedRate: rawClaimedRatePct, w8benOnFile: w8benOnFile, fdapTaxUsd: fdapUsd * fdapRate, gapUsd: gapUsd,
      // Clamped percentage (computed.usTax.nra.claimedRate * 100, the
      // ROUTED value buildWithholdingSummary's treatyRatePct actually reads,
      // conflicts.js:2413) — DIFFERENT from claimedRate above, which is the
      // raw unclamped Layer 1 value the nra_fdap_flat_rate FINDING's own
      // detail text reads instead (conflicts.js:1025's separate local
      // `claimedRate` var, never clamped there either — both are faithful
      // ports of two genuinely different engine variables with the same
      // name in different scopes, not a duplicate). A garbage/out-of-range
      // claim.rate (e.g. 395) previously passed through unclamped into
      // treatyRatePct — found by run-fuzz.js, SYS-3, 20 Jul 2026.
      claimedRatePctClamped: claimedRateFraction != null ? claimedRateFraction * 100 : null,
      incomeType: (claim && claim.income_type) || null
    };
  }
};

// ---- findings, ported in full ----------------------------------------------
NODES.findingsBatch4Result = {
  deps: ["treatyElectionsRaw", "treatyIndiaResidenceRaw", "treatyUsResidenceRaw", "treatyDtaaForcedNrRaw", "treatyFiles1040nrRaw",
    "treatyTrcStatus", "treatyForm10fFiled", "residencyResult",
    "s115aDividendDetailed", "s115aRoyaltyDetailed", "s115aFtsDetailed", "nrInterestDetailed",
    "s6013hElection", "nraFdapDetail", "nraEciIncomeUsdRaw",
    "lossSetOffDetailed", "carryForwardLossesMetaRaw",
    "feieDetailed", "usTaxResult", "isEntityTaxpayer", "usEntityKind"],
  compute: function (d) {
    var findings = [];
    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      findings.push({ id: id, severity: severity, category: category, title: title, detail: detail, recommendation: recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
    }
    var res = d.residencyResult;
    var treatyElections = d.treatyElectionsRaw;

    // -- 3. TREATY BENEFIT CLAIMED WITHOUT TRC / FORM 10F (conflicts.js:127-143) --
    var claimsTreaty = d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none" ||
      d.treatyDtaaForcedNrRaw || d.treatyFiles1040nrRaw || treatyElections.length > 0;
    if (claimsTreaty && (!d.treatyTrcStatus || !d.treatyForm10fFiled)) {
      var missing = [];
      if (!d.treatyTrcStatus) missing.push("TRC (IRS Form 6166)");
      if (!d.treatyForm10fFiled) missing.push("Form 41");
      add("treaty_docs_missing", "critical", "treaty",
        "Treaty relief claimed without supporting documents",
        "A treaty position / DTAA rate is being relied upon, but " + missing.join(" and ") +
        " is not on file. Indian tax authorities will deny treaty relief u/s 159(8) without a valid TRC, and Form 41 is mandatory u/r 75.",
        "Obtain " + missing.join(" and ") + " before filing. For US residents, request Form 6166 from the IRS (Form 8802 application) well in advance — it can take 6–8 weeks.",
        0, ["s.159(8)", "Rule 75 (Income-tax Rules, 2026)", "Form 6166"]);
    }

    // -- 3b. DTAA TREATY RATE ELECTIONS ON FILE (conflicts.js:145-224) ------
    if (treatyElections.length > 0) {
      var isNrForS115a = res.india.status === "NR";
      var docsShortfall = [];
      if (!d.treatyTrcStatus) docsShortfall.push("TRC (IRS Form 6166)");
      if (!d.treatyForm10fFiled) docsShortfall.push("Form 41");
      var s115aByType = { dividend: d.s115aDividendDetailed, royalty: d.s115aRoyaltyDetailed, fts: d.s115aFtsDetailed };
      var nrInterestElections = (d.nrInterestDetailed && d.nrInterestDetailed.elections) || [];
      var interestSeen = 0;
      var typeSeen = { dividend: 0, royalty: 0, fts: 0 };
      var COMPUTED_S115A_TYPES = { dividend: true, royalty: true, fts: true };
      var electionParts = treatyElections
        .filter(function (e) { return e && e.income_type; })
        .map(function (e) {
          var pct = e.elected_rate != null ? Math.round(e.elected_rate * 100) + "%" : "unset rate";
          var amtInr = num(e.amount_inr);
          var amtStr = amtInr > 1 ? " on " + inr(amtInr) : " (no amount entered)";
          var computedTag;
          if (!isNrForS115a) {
            computedTag = " [not applied — taxpayer is not NR, see below]";
          } else if (e.income_type === "capital_gains") {
            computedTag = " [not applied — no special treaty rate under Art. 13 for capital gains]";
          } else if (amtInr <= 1) {
            computedTag = " [not applied — no amount entered against this election]";
          } else if (e.income_type === "interest") {
            var ie = nrInterestElections[interestSeen++];
            if (!ie) computedTag = " [not applied]";
            else if (ie.outcome === "denied_no_docs") computedTag = " [election denied — TRC/Form 41 missing, ordinary slab rates apply to this slice instead]";
            else if (ie.outcome === "treaty_beats_slab") computedTag = " [elected rate applied — beats the marginal slab rate this slice would otherwise cost]";
            else computedTag = " [not applied — the marginal slab rate on this slice is already cheaper than the elected treaty rate]";
          } else if (COMPUTED_S115A_TYPES[e.income_type]) {
            var stream = s115aByType[e.income_type];
            var se = stream && stream.elections && stream.elections[typeSeen[e.income_type]++];
            var domestic = S115A_RATES[e.income_type];
            var compareDom = domestic != null ? " (vs " + Math.round(domestic * 100) + "% domestic s.207 rate)" : "";
            if (!se) computedTag = " [not applied]" + compareDom;
            else if (se.outcome === "denied_no_docs") computedTag = " [election denied — domestic " + Math.round(domestic * 100) + "% rate applied instead, TRC/Form 41 missing]";
            else if (se.outcome === "elected_rate_applied") computedTag = " [elected rate applied to the India tax above" + compareDom + "]";
            else computedTag = " [domestic " + Math.round(domestic * 100) + "% rate applied instead — it's more beneficial than the elected rate]";
          } else {
            computedTag = " [not applied]";
          }
          return e.income_type + " @ " + pct + (e.treaty_article ? " (" + e.treaty_article + ")" : "") + amtStr + computedTag;
        });
      add("dtaa_treaty_elections", docsShortfall.length > 0 ? "warning" : "info", "treaty",
        electionParts.length + " DTAA treaty rate election(s) on file",
        "Layer 1 records a claimed treaty rate on the following India-source income stream(s): " + electionParts.join("; ") + "." +
        (!isNrForS115a
          ? " This taxpayer is resident (not NR) under India's own domestic law, so s.207 and every election above " +
            "has NO effect regardless of income type; residents are taxed on this income at slab rates instead. If the " +
            "taxpayer is genuinely meant to be NR, check the residency determination; if not, these elections are moot."
          : " Dividend, royalty and FTS elections are compared against the flat domestic s.207 rate (s.159, whichever " +
            "is lower). Interest is different — ordinary NRO interest isn't actually s.207 income (that concessional " +
            "rate is narrow, foreign-currency-borrowing interest only), so it's slab-rate income by default, and an " +
            "election only helps when the flat treaty rate beats the marginal slab rate on that specific slice. Capital-" +
            "gains elections are NOT applied — Art. 13 itself provides no special treaty rate, domestic law governs " +
            "regardless (see Part H).") +
        (docsShortfall.length > 0
          ? " Layer 1 does NOT show " + docsShortfall.join(" or ") + " on file — every one of these elections is at risk of " +
            "being denied and defaulting back to slab/domestic rates without it."
          : ""),
        docsShortfall.length > 0
          ? "Obtain " + docsShortfall.join(" and ") + " before relying on any of these elected rates — without it, the payer/" +
            "assessing officer can withhold or assess at the full domestic rate shown above instead."
          : "Confirm each elected rate against the current India-US DTAA text for that article — TRC and Form 41 are on file, " +
            "but that alone doesn't verify the specific article/rate claimed is correct for this income stream.",
        0, ["DTAA treaty election", "s.207", "s.159", "s.159(8)"]);
    }

    // -- 3c2. WITHHOLDING DOCUMENTATION GAP (conflicts.js:226-252) ----------
    // The engine derives this from buildWithholdingSummary, whose India rows
    // read computed.indiaTax.s115a/.nrInterest (absent on the entity path) and
    // whose US FDAP gap reads computed.usTax.isNra (routed). Mirror BOTH
    // gates: no India treaty gap for an India company/firm, and the US NRA
    // gap keyed off the engine's exact routing condition — usTax.isNra is
    // true only when NOT routed to a US entity first (entity precedence).
    // Recomputed from raw facts (not read off usTaxResult.isNra) so it's
    // correct in the isolated report-batch5 chain too, where usTaxResult is
    // the individual-only node (found by run-fuzz.js, SYS-3, 20 Jul 2026:
    // a US entity that also carries a 1040-NR flag was wrongly treated as
    // NRA by the old `files1040nr && !s6013h` recompute, which ignored the
    // entity-wins routing).
    var indiaTotalGapInr = 0;
    if (!d.isEntityTaxpayer) {
      [d.s115aDividendDetailed, d.s115aRoyaltyDetailed, d.s115aFtsDetailed].forEach(function (stream) {
        if (!stream) return;
        (stream.elections || []).forEach(function (e) {
          var docsOk = e.outcome !== "denied_no_docs";
          if (!docsOk && e.electedRate != null && e.electedRate < e.domesticRate) indiaTotalGapInr += e.appliedAmountInr * (e.domesticRate - e.electedRate);
        });
      });
      if (d.nrInterestDetailed) {
        (d.nrInterestDetailed.elections || []).forEach(function (e) {
          var docsOk = e.outcome !== "denied_no_docs";
          var counterfactualTreatyTaxInr = e.electedRate != null ? e.appliedAmountInr * e.electedRate : null;
          if (!docsOk && counterfactualTreatyTaxInr != null && counterfactualTreatyTaxInr < e.marginalSlabTaxInr) indiaTotalGapInr += e.marginalSlabTaxInr - counterfactualTreatyTaxInr;
        });
      }
    }
    var isNraForWh = (["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0) && d.treatyFiles1040nrRaw && !d.s6013hElection;
    var usTotalGapUsd = (isNraForWh && d.nraFdapDetail.fdapUsd > 0) ? d.nraFdapDetail.gapUsd : 0;
    var totalGapUsd = inrToUsd(indiaTotalGapInr) + usTotalGapUsd;
    if (totalGapUsd > 1) {
      var whParts = [];
      if (indiaTotalGapInr > 1) whParts.push(inr(indiaTotalGapInr) + " in India (TRC/Form 41)");
      if (usTotalGapUsd > 1) whParts.push(usd(usTotalGapUsd) + " in the US (Form W-8BEN)");
      add("withholding_documentation_gap", "critical", "document",
        "Missing documentation is costing " + usd(totalGapUsd) + " in avoidable withholding tax this year",
        "Adding up every income stream where a treaty-reduced rate was claimed but denied for lack of supporting " +
        "documentation: " + whParts.join(" + ") + " — " + usd(totalGapUsd) + " total, computed directly from the " +
        "same rate/amount figures used elsewhere on this page, not estimated. See the Withholding Taxes page for the " +
        "full row-by-row breakdown of which income and which document.",
        "File the missing documentation (TRC + Form 41 for India s.159 elections; Form W-8BEN with the US withholding " +
        "agent for FDAP) as soon as possible — none of this is lost once filed for a FUTURE payment, but the tax " +
        "already withheld/assessed on past payments this year may require a separate refund claim to recover.",
        totalGapUsd, ["Withholding tax", "TRC", "Form 41", "Form W-8BEN"]);
    }

    // -- 4b. FEIE CLAIMED BUT NOT ELIGIBLE (conflicts.js:303-323) -----------
    // Gate on the ROUTED usTaxResult.feie, exactly as the engine reads
    // `computed.usTax.feie` — NOT the raw-derived feieDetailed. For an entity
    // usTaxResult.feie is undefined (computeUsEntityTax has no feie); for an
    // NRA it's {claimed:false} (computeNraTax); only the individual path
    // carries a real claim. feieDetailed reads the raw form regardless of
    // routing, so a US-entity/NRA profile that also has claims_feie set in
    // the raw US form wrongly fired feie_ineligible (found by run-fuzz.js,
    // SYS-3, 20 Jul 2026 — the same "report/finding node predates TAX-7/
    // TAX-8 routing" root cause as buildTaxComputationUsResult / the FTC
    // isNra boundary). amountClaimedUsd stays sourced from feieDetailed —
    // the engine's own amount is model.limitsRaw.feieAmountUsd, which reads
    // the identical foreign_earned_income.feie_amount_claimed_usd field.
    var feieRes = d.usTaxResult.feie;
    if (feieRes && feieRes.claimed && !feieRes.eligible) {
      add("feie_ineligible", "critical", "credit",
        "FEIE claimed but the taxpayer does not qualify",
        "Form 2555 exclusion was claimed in Layer 1, but the §911 tests fail: " + feieRes.reasons.join("; ") +
        ". FEIE is only available to someone living abroad — a US-based taxpayer with foreign income must use the Foreign Tax Credit instead. The engine has computed US tax WITHOUT the exclusion.",
        "Remove the FEIE claim and rely on Form 1116 FTC for the Indian taxes (usually better anyway when Indian rates exceed US rates). If the taxpayer genuinely lives abroad, complete the tax-home and presence-test fields in the US Layer 1 so the exclusion can be applied.",
        d.feieDetailed.amountClaimedUsd || 0, ["§911", "Form 2555", "Form 1116"]);
    } else if (feieRes && feieRes.claimed && feieRes.eligible && feieRes.appliedUsd > 0) {
      add("feie_applied", "info", "credit",
        "FEIE applied — " + usd(feieRes.appliedUsd) + " of foreign wages excluded",
        "The §911 tests are met (foreign tax home + " + (feieRes.testMet ? "presence test" : "") +
        "), so " + usd(feieRes.appliedUsd) + " of foreign earned income is excluded from US tax. The excluded income and its share of Indian tax were removed from the FTC computation (no-double-dip).",
        "Compare FEIE vs full FTC annually — for high-tax countries like India, revoking FEIE in favour of FTC can save tax, but a revocation locks you out of FEIE for 5 years.",
        0, ["Form 2555", "§911(d)(6)"]);
    }

    // -- 4h. NRA (1040-NR): FDAP SHOULD BE FLAT-RATE (conflicts.js:1015-1035) --
    // The engine's title conditionally shows "(XX%)" only when
    // computed.usTax.nra exists — which is set ONLY by computeNraTax, so it's
    // truthy exactly when routed to NRA (entity routing wins over NRA, same
    // precedence as everywhere else in this family). The outer `if` gating
    // whether the finding fires AT ALL uses raw facts and does NOT check
    // entity — so a US entity that also carries a 1040-NR flag still fires
    // this finding, just with the rate suffix omitted (a genuine engine
    // quirk, reproduced here rather than "fixed"). nraFdapDetail is a raw
    // node with no entity awareness, so it was showing the suffix
    // unconditionally (found by run-fuzz.js, SYS-3, 20 Jul 2026). Recomputed
    // from raw routing facts, not usTaxResult.nra — the isolated findings-
    // batch4 chain's usTaxResult is the individual-only node (no .nra field
    // ever), so reading usTaxResult.nra there would wrongly omit the suffix
    // even for the real NRA fixture (same trap as the FTC isNra boundary).
    var isRoutedToNraForFdap = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.treatyFiles1040nrRaw && !d.s6013hElection;
    if (d.treatyFiles1040nrRaw && !d.s6013hElection && d.nraFdapDetail.fdapUsd > 0) {
      var nraDetail = d.nraFdapDetail;
      add("nra_fdap_flat_rate", "info", "credit",
        "1040-NR: FDAP taxed flat" + (isRoutedToNraForFdap ? " (" + Math.round(nraDetail.fdapRate * 100) + "%)" : "") + ", ECI at graduated rates",
        usd(nraDetail.fdapUsd) + " of FDAP income (interest/dividends/rents not effectively connected with a US trade or " +
        "business) is taxed flat" + (nraDetail.claimedRate ? " at the claimed " + nraDetail.claimedRate + "% treaty rate" : " at the 30% statutory rate (no treaty rate on file)") +
        " with no deductions (Schedule NEC), separate from " + usd(d.nraEciIncomeUsdRaw) + " of ECI taxed at graduated brackets" +
        " with itemized deductions only (NRAs generally can't claim the standard deduction).",
        "Confirm the treaty rate claimed on Form W-8BEN/1040-NR matches the rate used here" +
        (nraDetail.claimedRate ? "" : " — no treaty rate is on file, so the default 30% was applied; check whether Article 11/12 of the DTAA reduces it") + ".",
        0, ["Form 1040-NR", "Schedule NEC", "FDAP", "ECI"]);
    }

    // -- 4g4. CARRY-FORWARD LOSSES — NOW ACTUALLY SET OFF (conflicts.js:958-1013) --
    var cfl = d.carryForwardLossesMetaRaw;
    var cflCount = cfl.businessLossCfCount + cfl.speculativeLossCfCount + cfl.stcgLossCfCount + cfl.ltcgLossCfCount + cfl.housePropertyLossCfCount;
    // Engine reads computed.indiaTax.lossSetOff — which computeIndiaEntityTax
    // omits, so this finding never fires for an India company/firm. Mirror the
    // undefined-for-entity here (found by run-fuzz.js, SYS-3, 20 Jul 2026).
    var lso = d.isEntityTaxpayer ? null : d.lossSetOffDetailed;
    if (lso && (cfl.hasBroughtForwardLosses === true || cflCount > 0 || cfl.unabsorbedDepreciationCf > 0)) {
      var appliedParts = [];
      if (lso.used.businessInr > 1) appliedParts.push(inr(lso.used.businessInr) + " business loss vs. business income");
      if (lso.used.stcgSlabInr > 1) appliedParts.push(inr(lso.used.stcgSlabInr) + " STCG loss vs. slab-rate STCG (s.69 unlisted buy-back)");
      if (lso.used.stcgInr > 1) appliedParts.push(inr(lso.used.stcgInr) + " STCG loss vs. STCG");
      if (lso.used.ltcgFromStcgLossInr > 1) appliedParts.push(inr(lso.used.ltcgFromStcgLossInr) + " STCG loss vs. LTCG");
      if (lso.used.ltcgInr > 1) appliedParts.push(inr(lso.used.ltcgInr) + " LTCG loss vs. LTCG");
      if (lso.used.housePropertyInr > 1) appliedParts.push(inr(lso.used.housePropertyInr) + " house-property loss vs. house-property income");
      if (lso.used.unabsorbedDepreciationInr > 1) appliedParts.push(inr(lso.used.unabsorbedDepreciationInr) + " unabsorbed depreciation");

      var unusedParts = [];
      if (lso.unused.businessInr > 1) unusedParts.push(inr(lso.unused.businessInr) + " business loss (no business income left to absorb it)");
      if (lso.unused.stcgInr > 1) unusedParts.push(inr(lso.unused.stcgInr) + " STCG loss");
      if (lso.unused.ltcgInr > 1) unusedParts.push(inr(lso.unused.ltcgInr) + " LTCG loss");
      if (lso.unused.housePropertyInr > 1) unusedParts.push(inr(lso.unused.housePropertyInr) + " house-property loss");
      if (lso.unused.speculativeInr > 1) unusedParts.push(inr(lso.unused.speculativeInr) + " speculative loss (not modeled — see note)");
      if (lso.unused.unabsorbedDepreciationInr > 1) unusedParts.push(inr(lso.unused.unabsorbedDepreciationInr) + " unabsorbed depreciation");

      if (lso.totalUsedInr > 1 && lso.totalUnusedInr <= 1) {
        add("carry_forward_losses_not_applied", "info", "credit",
          "Brought-forward losses fully set off this year",
          "All eligible prior-year losses were absorbed against this year's income: " + appliedParts.join("; ") +
          ". The India tax computed above already reflects this — no residual carry-forward remains.",
          "Confirm the set-off is reported correctly on Schedule CFL/BFLA of the ITR, matching the ordering above.",
          0, ["Loss carry-forward", "s.110", "s.112", "s.111"]);
      } else if (lso.totalUsedInr > 1) {
        add("carry_forward_losses_not_applied", "warning", "credit",
          "Brought-forward losses partially set off — some still carrying forward",
          "Applied this year: " + appliedParts.join("; ") + ". Still carrying forward (no matching current-year income " +
          "to absorb it, or — for speculative loss — not modeled at all): " + unusedParts.join("; ") + ".",
          "Track the unused amounts on Schedule CFL for future years (subject to the 8-year limit, indefinite for " +
          "unabsorbed depreciation), and confirm speculative-income figures separately since WISING doesn't model that bucket.",
          0, ["Loss carry-forward", "s.110", "s.112", "s.111"]);
      } else {
        add("carry_forward_losses_not_applied", "warning", "credit",
          "Brought-forward losses on file — none could be set off against this year's income",
          "Prior-year losses are recorded (" + unusedParts.join("; ") + "), but there is no matching current-year income " +
          "in the same head(s) to absorb any of it — the India tax computed above is correct as-is; these losses simply " +
          "carry forward untouched.",
          "Track these on Schedule CFL for a future year with matching income (subject to the 8-year limit for capital/" +
          "business losses, indefinite for unabsorbed depreciation).",
          0, ["Loss carry-forward", "s.110", "s.112", "s.111"]);
      }
    }

    return findings;
  }
};

module.exports = { NODES: NODES };

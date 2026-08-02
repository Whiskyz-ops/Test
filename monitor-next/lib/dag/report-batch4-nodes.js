"use strict";
/* ============================================================================
 * CFL-7 batch 4: buildWithholdingSummary — the second-to-last function.
 * Merges report-batch2-nodes.js (US-side chain: nraFdapDetail/nraRaw,
 * aggregateUsIncomeResult's w2Employers, panAadhaarLinkedRaw,
 * taxesPaidUsResult) with report-batch3-nodes.js (India-side chain:
 * s115aDividend/s115aRoyalty/s115aFts/nrInterest, now carrying their real
 * elections[] detail since batch 3's additive extension). Batch 3's version
 * wins on the ~17 keys the two chains define differently (raw "boundary"
 * leaf readers duplicated across india-tax-combined-nodes.js and
 * india-full-nodes.js/itrform-nodes.js's own independent merge of the same
 * underlying files) — verified by inspection that nothing this file reads
 * from report-batch2's chain (nraFdapDetail, nraRaw, aggregateUsIncomeResult,
 * panAadhaarLinkedRaw, taxesPaidUsResult) depends on any of those 17 keys,
 * so the override is inert for everything actually used here.
 *
 * Two additive extensions were needed first (committed alongside this
 * file): findings-batch4-nodes.js's nraFdapDetail gained `incomeType`
 * (already read internally via nraRaw.treatyRateClaims[0].income_type, just
 * not returned); findings-batch5-nodes.js's taxesPaidUsResult gained a
 * `withholding` field alongside its existing combined `total` (the real
 * engine's aggregateTaxesPaid returns withholding and estimated
 * separately — buildWithholdingSummary's W-2-aggregate fallback row needs
 * withholding alone, not the combined figure `total` already exposed).
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

var reportBatch2Nodes = require("./report-batch2-nodes.js").NODES;
var reportBatch3Nodes = require("./report-batch3-nodes.js").NODES;
var NODES = {};
/* MERGE ORDER MATTERS — batch3 FIRST, batch2's chain SECOND. batch3 builds
 * its standalone set from india-tax-combined-nodes.js, whose boundary nodes
 * (businessInrBoundaryV3, stcgInrBoundary, …, entityTaxableInrBoundary)
 * still read ctx.model.income.india raw. batch2's lineage carries
 * india-full-nodes.js's IN-GRAPH overrides of those same ids. The original
 * batch2-then-batch3 order silently reverted the TAX-10 wiring for every
 * report node from here up — undetected because every runner passed a full
 * model in ctx, so the raw reads still worked. Found by run-agg10.js's
 * bare-ctx resolve (the first runner with NO model at all), 19 Jul 2026.
 * batch3's own NEW nodes (slabBreakdownV3, the buildTaxComputation india
 * parts) have unique ids and survive either order. */
Object.keys(reportBatch3Nodes).forEach(function (k) { NODES[k] = reportBatch3Nodes[k]; });
Object.keys(reportBatch2Nodes).forEach(function (k) { NODES[k] = reportBatch2Nodes[k]; });

/* ---- LRS TCS (AGG-8, computeLrsTcs, normalize.js:2062-2104), ported in
 * full — genuinely small and self-contained once actually read, same as
 * every other "separate subsystem" this whole effort has found isn't.
 *
 * Rate/threshold fact-check (task #48 follow-up, flagged by earlier research
 * as possibly stale — confirmed via independent web search against multiple
 * sources, Aug 2026): every figure below is CURRENT for TY2026-27, this
 * codebase's own target year, under s.206C(1G):
 *   - ₹10L base threshold: Finance Act 2025 raised it from the original
 *     ₹7L, effective 1 Apr 2025 (still in force).
 *   - Overseas tour packages: flat 2% from the first rupee, no threshold —
 *     Budget 2026 collapsed the prior 5%/20% split (5% up to ₹7L, 20% above)
 *     into one flat 2% rate, effective 1 Apr 2026.
 *   - Self-funded education / medical treatment: 2% on the excess over
 *     ₹10L — Budget 2026 cut this from 5%, effective 1 Apr 2026.
 *   - Investment / gift-or-donation ("other purposes"): unchanged, 20% on
 *     the excess over ₹10L.
 *   - Education funded via a loan from a specified financial institution:
 *     unchanged, NIL (0%) regardless of amount.
 * Superseded any earlier 0.5%/5%/₹7L recollection — those are the
 * pre-Finance-Act-2025/pre-Budget-2026 figures. */
var LRS_PURPOSE_LABELS = {
  investment: "Investment (Equity/Property)", education_own_funds: "Overseas Education (Own Funds)",
  education_loan: "Overseas Education (Loan-Funded)", medical: "Medical Treatment Abroad",
  travel: "International Travel (Overseas Tour Package)", gift_donation: "Gift or Donation to Non-Resident"
};
var LRS_TCS_THRESHOLD_INR = 1000000;
function computeLrsTcs(lrsOutbound) {
  var total = num(safe(lrsOutbound, "total_lrs_remitted_this_fy_inr", 0));
  var purpose = safe(lrsOutbound, "lrs_purpose", null);
  if (!(total > 0) || !purpose) return null;
  var tcsInr = 0, ratePctLabel = "NIL", note;
  if (purpose === "travel") {
    tcsInr = Math.round(total * 0.02);
    ratePctLabel = "2% flat";
    note = "2% flat TCS on overseas tour packages from the first rupee";
  } else if (total > LRS_TCS_THRESHOLD_INR) {
    var excess = total - LRS_TCS_THRESHOLD_INR;
    if (purpose === "investment" || purpose === "gift_donation") {
      tcsInr = Math.round(excess * 0.20); ratePctLabel = "20% on excess";
      note = "20% TCS on general/investment LRS exceeding ₹10L";
    } else if (purpose === "education_own_funds" || purpose === "medical") {
      tcsInr = Math.round(excess * 0.02); ratePctLabel = "2% on excess";
      note = "2% TCS on self-funded education/medical exceeding ₹10L";
    } else if (purpose === "education_loan") {
      tcsInr = 0; ratePctLabel = "0%";
      note = "NIL TCS on education remittance funded via loan";
    }
  } else {
    note = "Remittance is below the ₹10L base threshold";
  }
  return {
    totalRemittedInr: total, purpose: purpose, purposeLabel: LRS_PURPOSE_LABELS[purpose] || purpose,
    tcsInr: tcsInr, ratePctLabel: ratePctLabel, note: note
  };
}

/* ---- raw leaves: aggregateWithholdingDetail (AGG-7, normalize.js:2106-
 * 2135), ported in full. */
NODES.withholdingDetailIndiaRaw = {
  deps: [],
  compute: function (d, ctx) {
    var tc = safe(ctx.india, "tax_credits", {});
    var props = safe(ctx.india, "property.properties", []) || [];
    var propertyTds = props.filter(function (p) { return num(p.buyer_tds_deducted_inr) > 0; }).map(function (p) {
      return {
        propertyType: p.property_type || "Property", saleDate: p.sale_date || null,
        saleConsiderationInr: num(p.sale_consideration), tdsInr: num(p.buyer_tds_deducted_inr)
      };
    });
    return {
      tdsAggregateInr: num(safe(tc, "tds_already_deducted_inr", 0)) + num(safe(tc, "tds_inr", 0)),
      tcsAggregateInr: num(safe(tc, "tcs_inr", 0)),
      lrsTcs: computeLrsTcs(safe(ctx.india, "lrs_outbound", {})),
      propertyTds: propertyTds
    };
  }
};
NODES.withholdingDetailUsRaw = {
  deps: [],
  compute: function (d, ctx) { return { stateWithholdingUsd: num(safe(ctx.us, "withholding_and_estimated.state_withholding_total_usd", 0)) }; }
};
/* Explicit boundary input — same "capital-gains classification is a
 * separate, already-scoped-out 800-line subsystem" boundary
 * vdaGainInrBoundary already uses (in1-nodes-v3.js), computed in the SAME
 * aggregateIndiaIncome loop as vdaGainInr. */
NODES.vdaSaleConsiderationInrBoundary = { deps: [], compute: function (d, ctx) { return num(ctx.model.income.india.vdaSaleConsiderationInr); } };

NODES.buildWithholdingSummaryResult = {
  deps: [
    "s115aDividend", "s115aRoyalty", "s115aFts", "nrInterest", "isNRV3", "isEntityTaxpayer",
    "withholdingDetailIndiaRaw", "withholdingDetailUsRaw", "vdaSaleConsiderationInrBoundary", "specialRate115bbInr",
    "panAadhaarLinkedRaw",
    "treatyFiles1040nrRaw", "s6013hElection", "nraRaw", "nraFdapDetail",
    "aggregateUsIncomeResult", "taxesPaidUsResult", "usEntityKind"
  ],
  compute: function (d, ctx) {
    var indiaRows = [];
    var indiaTotalGapInr = 0;

    function pushS115aRows(streamKey, label, citation, stream) {
      if (!stream) return;
      (stream.elections || []).forEach(function (e, idx) {
        var docsOk = e.outcome !== "denied_no_docs";
        var gapInr = (!docsOk && e.electedRate != null && e.electedRate < e.domesticRate)
          ? e.appliedAmountInr * (e.domesticRate - e.electedRate) : 0;
        indiaTotalGapInr += gapInr;
        indiaRows.push({
          id: streamKey + "_election_" + idx, jurisdiction: "IN", category: "treaty_gap", label: label + (e.article ? " (" + e.article + ")" : ""),
          grossInr: e.appliedAmountInr, domesticRatePct: e.domesticRate * 100,
          treatyRatePct: e.electedRate != null ? e.electedRate * 100 : null,
          docsOk: docsOk, rateAppliedPct: e.rateApplied * 100, taxInr: e.taxInr, gapInr: gapInr,
          note: docsOk ? null : "TRC/Form 41 missing — treaty rate denied, domestic rate applied instead",
          citation: citation
        });
      });
      if ((stream.uncapturedInr || 0) > 1) {
        indiaRows.push({
          id: streamKey + "_unclaimed", jurisdiction: "IN", category: "treaty_gap", label: label + " — unclaimed (no treaty election on file)",
          grossInr: stream.uncapturedInr, domesticRatePct: stream.domesticRate * 100, treatyRatePct: null,
          docsOk: null, rateAppliedPct: stream.domesticRate * 100, taxInr: stream.uncapturedTaxInr, gapInr: 0,
          note: "Not a documentation gap — no treaty rate was ever claimed for this slice, so there's nothing to deny",
          citation: citation
        });
      }
    }
    // The s115a / NRO-interest treaty rows read computed.indiaTax.s115a /
    // .nrInterest, which computeIndiaEntityTax omits entirely — so for an
    // India company/firm entity the engine builds NONE of these rows. The DAG
    // reads the individual computeIndiaTax stream nodes directly, which stay
    // populated even for an entity that also carries NR-flagged raw data, so
    // gate the whole block on !isEntityTaxpayer to match (found by run-fuzz.js,
    // SYS-3, 20 Jul 2026 — same TAX-7/TAX-8-era boundary as the s115a adapter
    // gate and the feie finding). Individual (resident OR NR) behaviour is
    // unchanged: d.s115aDividend etc. are already null for a non-NR individual,
    // so pushS115aRows early-returns exactly as the engine's `i.s115a` null does.
    if (!d.isEntityTaxpayer) {
      pushS115aRows("dividend", "Dividend", "s.207 / s.159", d.s115aDividend);
      pushS115aRows("royalty", "Royalty", "s.207 / s.159", d.s115aRoyalty);
      pushS115aRows("fts", "Fees for Technical Services", "s.207 / s.159", d.s115aFts);

      if (d.nrInterest) {
        (d.nrInterest.elections || []).forEach(function (e, idx) {
          var docsOk = e.outcome !== "denied_no_docs";
          var counterfactualTreatyTaxInr = e.electedRate != null ? e.appliedAmountInr * e.electedRate : null;
          var gapInr = (!docsOk && counterfactualTreatyTaxInr != null && counterfactualTreatyTaxInr < e.marginalSlabTaxInr)
            ? e.marginalSlabTaxInr - counterfactualTreatyTaxInr : 0;
          indiaTotalGapInr += gapInr;
          var actualTaxInr = docsOk && e.carvedOut ? e.treatyTaxInr : e.marginalSlabTaxInr;
          indiaRows.push({
            id: "nrInterest_election_" + idx, jurisdiction: "IN", category: "treaty_gap", label: "NRO Interest" + (e.article ? " (" + e.article + ")" : ""),
            grossInr: e.appliedAmountInr, domesticRatePct: null,
            treatyRatePct: e.electedRate != null ? e.electedRate * 100 : null,
            docsOk: docsOk, rateAppliedPct: e.appliedAmountInr > 0 ? (actualTaxInr / e.appliedAmountInr) * 100 : null,
            taxInr: actualTaxInr, gapInr: gapInr,
            note: docsOk ? null : "TRC/Form 41 missing — treaty carve-out denied, taxed at marginal slab rate instead",
            citation: "Art 11(2)(b), s.159"
          });
        });
      }
    }

    var wd = { india: d.withholdingDetailIndiaRaw, us: d.withholdingDetailUsRaw };

    if ((wd.india.tdsAggregateInr || 0) > 1) {
      indiaRows.push({
        id: "tds_aggregate", jurisdiction: "IN", category: "general", label: "TDS Already Deducted (Aggregate — Form 26AS)",
        grossInr: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxInr: wd.india.tdsAggregateInr, gapInr: 0,
        note: "Single aggregate figure — Layer 1 doesn't capture a per-source breakdown of income type or rate for this amount",
        citation: "s.199"
      });
    }
    var isNrSellerForPropertyTds = d.isNRV3;
    (wd.india.propertyTds || []).forEach(function (p, idx) {
      var rateAppliedPct = p.saleConsiderationInr > 0 ? (p.tdsInr / p.saleConsiderationInr) * 100 : null;
      indiaRows.push({
        id: "property_tds_" + idx, jurisdiction: "IN", category: "general",
        label: "Property Sale TDS — " + p.propertyType + (p.saleDate ? " (" + p.saleDate + ")" : ""),
        grossInr: p.saleConsiderationInr || null, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: rateAppliedPct, taxInr: p.tdsInr, gapInr: 0,
        note: isNrSellerForPropertyTds ? "Buyer-withheld on sale proceeds from an NR seller" : "Buyer-withheld on sale proceeds from a resident seller",
        citation: isNrSellerForPropertyTds ? "s.195" : "s.194-IA"
      });
    });

    if ((wd.india.tcsAggregateInr || 0) > 1) {
      indiaRows.push({
        id: "tcs_aggregate", jurisdiction: "IN", category: "general", label: "TCS Already Collected (Aggregate — Form 26AS)",
        grossInr: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxInr: wd.india.tcsAggregateInr, gapInr: 0,
        note: "Tax Collected at Source on outbound payments (not income) — creditable against final tax liability the same as TDS",
        citation: "s.206C"
      });
    }

    var estimateRows = { india: [], us: [] };
    if (wd.india.lrsTcs) {
      var lrs = wd.india.lrsTcs;
      estimateRows.india.push({
        id: "lrs_tcs_estimate", jurisdiction: "IN", category: "estimate",
        label: "Expected TCS on LRS Remittance — " + lrs.purposeLabel,
        grossInr: lrs.totalRemittedInr, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: null, taxInr: lrs.tcsInr, gapInr: 0,
        note: lrs.note + " — cross-check against the TCS aggregate above, not a confirmed collection receipt (excluded from totals)",
        citation: "s.206C(1G)"
      });
    }
    var vdaSaleInr = d.vdaSaleConsiderationInrBoundary || 0;
    if (vdaSaleInr > 10000) {
      estimateRows.india.push({
        id: "vda_194s_estimate", jurisdiction: "IN", category: "estimate",
        label: "Expected TDS on Crypto/VDA Transfers (s.194S)",
        grossInr: vdaSaleInr, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: 1, taxInr: Math.round(vdaSaleInr * 0.01), gapInr: 0,
        note: "1% of total transfer consideration (₹10,000 floor for most taxpayers, ₹50,000 for \"specified persons\" under s.44AB — not distinguishable from available data) — not confirmed as actually withheld, may already be inside the aggregate TDS credit above (excluded from totals)",
        citation: "s.194S"
      });
    }
    var winningsInr = d.specialRate115bbInr || 0;
    if (winningsInr > 0) {
      estimateRows.india.push({
        id: "winnings_tds_estimate", jurisdiction: "IN", category: "estimate",
        label: "Expected TDS on Lottery/Gaming Winnings (s.194B/194BA)",
        grossInr: winningsInr, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: 30, taxInr: Math.round(winningsInr * 0.30), gapInr: 0,
        note: "30% flat, no basic exemption (s.194B lottery/betting has a ₹10,000 per-transaction floor; s.194BA online gaming has none — not distinguishable from this annual aggregate) — not confirmed as actually withheld, may already be inside the aggregate TDS credit above (excluded from totals)",
        citation: "s.194B / s.194BA"
      });
    }

    var panAadhaarInoperative = d.panAadhaarLinkedRaw === false;

    var usRows = [];
    var usTotalGapUsd = 0;
    // The engine gates this row on `u.isNra && u.nra` — the ROUTED result,
    // where entity routing wins over NRA (a US entity that also carries a
    // 1040-NR flag routes to computeUsEntityTax, isNra false, no FDAP row
    // built at all). The old `files1040nr && !s6013h` recompute ignored that
    // precedence and built the row anyway (found by run-fuzz.js, SYS-3,
    // 20 Jul 2026 — the same family as the FTC isNra boundary and
    // withholding_documentation_gap). Recomputed from raw routing facts, not
    // usTaxResult.isNra — this node also resolves in isolation (report-
    // batch4 built on report-batch3, individual-only usTaxResult), where
    // reading usTaxResult.isNra would silently be wrong for a real NRA
    // profile (same trap documented on findings-batch4's nra_fdap_flat_rate).
    var isNra = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.treatyFiles1040nrRaw && !d.s6013hElection;
    if (isNra && d.nraFdapDetail.fdapUsd > 0) {
      var n = d.nraFdapDetail;
      var gapUsd = n.gapUsd;
      usTotalGapUsd += gapUsd;
      usRows.push({
        id: "fdap", jurisdiction: "US", category: "treaty_gap", label: "FDAP" + (n.incomeType ? " (" + n.incomeType + ")" : "") + " — Schedule NEC",
        grossUsd: n.fdapUsd, domesticRatePct: 30, treatyRatePct: n.claimedRatePctClamped,
        docsOk: n.w8benOnFile, rateAppliedPct: n.fdapRate * 100, taxUsd: n.fdapTaxUsd, gapUsd: gapUsd,
        note: n.w8benOnFile ? null : "Form W-8BEN missing — treaty rate denied, 30% statutory default withheld instead",
        citation: "IRC §1441 / Treas. Reg. §1.1441-6"
      });
    }
    var firptaUsd = d.nraRaw.usRealPropertyDisposed ? (d.nraRaw.firptaWithholdingUsd || 0) : 0;
    if (firptaUsd > 1) {
      usRows.push({
        id: "firpta", jurisdiction: "US", category: "treaty_gap", label: "FIRPTA — US real property disposition",
        grossUsd: null, domesticRatePct: 15, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxUsd: firptaUsd, gapUsd: 0,
        note: "Mandatory withholding on gross proceeds regardless of documentation — not treaty-rate-dependent",
        citation: "IRC §1445"
      });
    }

    var w2Employers = d.aggregateUsIncomeResult.w2Employers || [];
    if (w2Employers.length > 0) {
      w2Employers.forEach(function (w, idx) {
        if (!(w.federalWithheldUsd > 1) && !(w.wagesUsd > 1)) return;
        var rateAppliedPct = w.wagesUsd > 0 ? (w.federalWithheldUsd / w.wagesUsd) * 100 : null;
        usRows.push({
          id: "w2_" + idx, jurisdiction: "US", category: "general",
          label: "W-2 Withholding — " + (w.employerName || "Unnamed Employer"),
          grossUsd: w.wagesUsd || null, domesticRatePct: null, treatyRatePct: null, docsOk: null,
          rateAppliedPct: rateAppliedPct, taxUsd: w.federalWithheldUsd, gapUsd: 0,
          note: w.stateWithheldUsd > 1 ? ("+ " + usd(w.stateWithheldUsd) + " state tax withheld") : null,
          citation: "IRC §3402 / Form W-2"
        });
      });
    } else if (d.taxesPaidUsResult.withholding.usd > 1) {
      usRows.push({
        id: "w2_aggregate", jurisdiction: "US", category: "general", label: "Federal Withholding (Aggregate — Form W-2)",
        grossUsd: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxUsd: d.taxesPaidUsResult.withholding.usd, gapUsd: 0,
        note: "Single aggregate figure — no per-employer breakdown on file",
        citation: "IRC §3402 / Form W-2"
      });
    }
    var stateWithUsd = d.withholdingDetailUsRaw.stateWithholdingUsd || 0;
    if (stateWithUsd > 1 && w2Employers.length === 0) {
      usRows.push({
        id: "state_withholding_aggregate", jurisdiction: "US", category: "general", label: "State Withholding (Aggregate — Form W-2 Box 17)",
        grossUsd: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxUsd: stateWithUsd, gapUsd: 0, note: null, citation: "Form W-2 Box 17"
      });
    }

    return {
      india: { rows: indiaRows, estimateRows: estimateRows.india, totalGapInr: indiaTotalGapInr, totalGapUsd: indiaTotalGapInr / fxRate(ctx), panAadhaarInoperative: panAadhaarInoperative },
      us: { rows: usRows, estimateRows: estimateRows.us, totalGapUsd: usTotalGapUsd },
      totalGapUsd: (indiaTotalGapInr / fxRate(ctx)) + usTotalGapUsd
    };
  }
};

module.exports = { NODES: NODES };

"use strict";
/* ============================================================================
 * CFL-6 batch 2: cross_basis_summary, india_itr_form_mismatch,
 * special_rate_gaming_winnings, s115bbe_unexplained_income, and the three
 * chapter_xiia_* findings (elected_no_holdings / investment_income_missing /
 * investment_income_computed).
 *
 * Picked for this batch because every dependency is now closed: XBR-4
 * (crossBasisResult), XBR-6 (indiaItrFormResult), and two small new AGG-1
 * leaves (chapterXiiaSfeaHoldingCount, exposed on capitalGainsComputation;
 * unexplained115bbeInrAgg, AGG-1's LAST recorded knownMissing item — see
 * aggregateindiaincome-nodes.js). One more new raw leaf, chapterXiiaElected
 * (model.treaty.chapterXiiaElected, normalize.js:2453 — a plain re-read of
 * compliance_docs.chapter_xiia_elected, same source path as the local
 * variable capitalGainsComputation already reads internally).
 *
 * itrform-nodes.js and findings-nodes.js are two independently-diverged
 * branches off the same india-full-nodes.js ancestor (one via
 * xborder-full-nodes.js -> doubletax-nodes.js -> crossbasis-nodes.js, the
 * other via itrform-nodes.js directly) — merged here with a reference-
 * equality-aware collision check (NODES[k] !== src[k], not just NODES[k])
 * since Node's require() cache guarantees any shared key is the SAME
 * function reference on both branches; verified empirically before relying
 * on it (106 shared keys between the two files, 0 true collisions).
 *
 * Verified in run-findings2.js: exact finding-ID-set match against
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
function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function inrToUsd(v) { return Number(v) / 83.0; } // engine-wide rate, matches normalize.js's own inrToUsd

var itrformNodes = require("./itrform-nodes.js").NODES;
var findingsNodes = require("./findings-nodes.js").NODES;

var NODES = {};
Object.keys(itrformNodes).forEach(function (k) { NODES[k] = itrformNodes[k]; });
Object.keys(findingsNodes).forEach(function (k) {
  if (NODES[k] && NODES[k] !== findingsNodes[k]) throw new Error("true collision merging findings-nodes.js: " + k);
  NODES[k] = findingsNodes[k];
});

// ---- raw leaves not read by any earlier-closed phase -----------------------
NODES.chapterXiiaElectedRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.india, "compliance_docs.chapter_xiia_elected", false) === true; } };

// ---- findings, ported in full ----------------------------------------------
NODES.findingsBatch2Result = {
  deps: ["crossBasisResult", "usFtcFormXbr", "indiaItrFormResult",
    "specialRate115bbInr", "residencyResult",
    "unexplained115bbeInrAgg",
    "chapterXiiaElectedRaw", "capitalGainsComputation"],
  compute: function (d) {
    var findings = [];
    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      findings.push({ id: id, severity: severity, category: category, title: title, detail: detail, recommendation: recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
    }

    // -- cross_basis_summary (conflicts.js:1505-1524) -----------------------
    var recon = d.crossBasisResult;
    var dtRows = (recon && recon.rows || []).filter(function (r) { return r.doublyTaxed; });
    if (dtRows.length > 0) {
      add("cross_basis_summary", "info", "income",
        dtRows.length + " income head(s) taxed under both codes — see reconciliation",
        "The same income is taxed in India (its own Act) and the US (the IRC): " +
        dtRows.map(function (r) { return r.label; }).join(", ") + ". Overlapping exposure of " +
        usd(recon.overlapUsd) + " is what the FTC / §159 relief resolves." +
        (recon.anyEstimate ? " Some heads are planning-grade estimates pending line-item inputs." : ""),
        "Open the Cross-Basis Reconciliation on the Filings tab to see each head on both bases, then relieve the overlap via " + d.usFtcFormXbr + " (US) / Form 44 (India).",
        recon.overlapUsd, ["DTAA", d.usFtcFormXbr, "Form 44"]);
    }

    // -- india_itr_form_mismatch (conflicts.js:1389-1411) --------------------
    var itrM = d.indiaItrFormResult;
    if (itrM && itrM.matchesFrontend === false) {
      add("india_itr_form_mismatch", "warning", "document",
        "ITR form disagreement: WISING computes " + itrM.form + ", Layer 1 says " + itrM.frontendForm,
        "WISING's own independent eligibility check (income thresholds, residency, capital gains, foreign assets/income, " +
        "crypto, house-property count, brought-forward losses, speculative/F&O income) computes " + itrM.form +
        ". Layer 1 India's own recommendation, last computed client-side, was " + itrM.frontendForm +
        " (\"" + (itrM.frontendExplanation || "no explanation on file") + "\"). Common causes: Layer 1's client-side check ran " +
        "before a later edit (its recommendation is only recomputed when the eligibility function re-runs, not on every " +
        "field change), or a genuine difference in what each side reads (see computeIndiaItrForm's header comment for three " +
        "confirmed Layer 1 field bugs this backend check deliberately doesn't inherit).",
        "Trust WISING's " + itrM.form + " unless you can identify a specific reason Layer 1's client-side check is right and " +
        "this backend computation is wrong — re-running Layer 1's eligibility check (revisit the Review/Summary step) after " +
        "any income or residency edit is the most common fix.",
        0, ["ITR eligibility", itrM.form, itrM.frontendForm]);
    }

    // -- special_rate_gaming_winnings (conflicts.js:914-934) -----------------
    var specialBBUsd = inrToUsd(d.specialRate115bbInr || 0);
    if (specialBBUsd > 1) {
      add("special_rate_gaming_winnings", d.residencyResult.us.worldwide ? "warning" : "info", "income",
        usd(specialBBUsd) + " of lottery/gaming winnings — flat 30% (s.128/194), no exemptions",
        "This income is taxed at a flat 30% with no basic exemption threshold, no Chapter VI-A deduction and no §156 " +
        "rebate — it's now included in the India tax total and the FTC/double-tax figures above." +
        (d.residencyResult.us.worldwide ? " Because the US taxes worldwide income, the same winnings are very likely also US-taxable " +
          "as ordinary income — a real double-tax exposure that the general FTC computation only approximates, since it " +
          "doesn't specifically match this flat 30% Indian rate against whatever ordinary rate the US applies to it." : ""),
        "Confirm US-side treatment of the same winnings separately from the general FTC computation — a flat-rate/" +
        "graduated-rate mismatch on the same income can leave a residual gap the average-rate FTC approximation misses.",
        specialBBUsd, ["s.128", "s.194"]);
    }

    // -- s115bbe_unexplained_income (conflicts.js:936-956) --------------------
    if ((d.unexplained115bbeInrAgg || 0) > 0) {
      add("s115bbe_unexplained_income", "critical", "income",
        "Unexplained income on file (s.195) — not reflected in the India tax computed above",
        "₹" + Math.round(d.unexplained115bbeInrAgg).toLocaleString("en-IN") + " is recorded as unexplained " +
        "income under s.195. This carries a flat ~39% effective rate (30% tax + 25% surcharge + 4% cess, per Finance " +
        "Act 2026) and — unlike any other provision — denies every deduction, exemption, and loss set-off with no " +
        "exceptions. The India tax figure above does not include this; it needs to be added separately.",
        "Compute the s.195 addition separately at the full ~39% effective rate before relying on the India tax total " +
        "above, and confirm the source of these funds is genuinely unexplained rather than misclassified income that " +
        "belongs under a normal head.",
        0, ["s.195"]);
    }

    // -- 4g. CHAPTER XII-A elected — investment income check (conflicts.js:856-912) --
    var xiiaHoldingCount = d.capitalGainsComputation.chapterXiiaSfeaHoldingCount || 0;
    var xiiaInvIncomeInr = d.capitalGainsComputation.chapterXiiaInvestmentIncomeInr || 0;
    if (d.chapterXiiaElectedRaw && xiiaHoldingCount === 0) {
      add("chapter_xiia_elected_no_holdings", "warning", "credit",
        "Chapter XII-A elected, but no Financial Holdings transaction is marked as a specified foreign-exchange asset",
        "The Layer 1 Chapter XII-A election is on, but none of the Financial Holdings transactions on file are flagged " +
        "as \"Specified Foreign Exchange Asset (NRI)\" — s.217/212's flat-rate regime only applies to shares/debentures/" +
        "deposits/government securities actually purchased in convertible foreign exchange. Either a specified holding " +
        "exists but wasn't flagged (so its capital gains and investment income are being computed under ordinary rules " +
        "instead), or the election isn't actually needed this year.",
        "If a specified holding exists, mark it \"Specified Foreign Exchange Asset\" on its Financial Holdings entry so " +
        "it gets the correct s.217/212 treatment. If none exists, consider whether the election is still needed.",
        0, ["s.217", "s.212", "Chapter XII-A"]);
    } else if (d.chapterXiiaElectedRaw && xiiaHoldingCount > 0 && xiiaInvIncomeInr < 1) {
      add("chapter_xiia_investment_income_missing", "warning", "credit",
        "Chapter XII-A elected, " + xiiaHoldingCount + " specified holding(s) on file — but no investment income entered for any of them",
        "The Layer 1 Chapter XII-A election is on, and " + xiiaHoldingCount + " Financial Holdings transaction(s) are marked as a " +
        "specified foreign-exchange asset — but none of them has an \"Investment Income This Year\" figure entered. A specified " +
        "debenture or deposit almost always earns some interest, and specified shares may pay dividends; if any of these holdings " +
        "did, that income is taxed at a flat 20% under s.217/212 (s.115E(1)(a)) — separate from, and in addition to, any capital " +
        "gains already reflected below.",
        "Check each specified holding for interest/dividend actually received this year and enter it in the \"Investment Income " +
        "This Year\" field — if genuinely none was received (e.g. a zero-coupon instrument still accruing, or shares that paid no " +
        "dividend), no action needed.",
        0, ["s.217", "s.212", "Chapter XII-A", "s.115E"]);
    } else if (d.chapterXiiaElectedRaw && xiiaInvIncomeInr > 0) {
      add("chapter_xiia_investment_income_computed", "info", "credit",
        "Chapter XII-A investment income of " + inr(xiiaInvIncomeInr) + " included at the flat 20% rate",
        "Interest/dividend entered against your Chapter XII-A specified holdings (" + inr(xiiaInvIncomeInr) + " total) is taxed " +
        "at the flat 20% s.217/212 (s.115E(1)(a)) rate in the India tax computed below — no Chapter VI-A deductions or basic " +
        "exemption apply to this slice, per Chapter XII-A's own rules.",
        "Confirm this figure covers ALL specified holdings' interest/dividend for the year, not just some of them.",
        0, ["s.217", "s.212", "Chapter XII-A", "s.115E"]);
    }

    return findings;
  }
};

module.exports = { NODES: NODES };

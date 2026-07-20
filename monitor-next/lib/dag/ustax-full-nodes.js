"use strict";
/* ============================================================================
 * Closes TAX-7 + TAX-8 — the last two scoped-out rows: computeUsEntityTax
 * (computation.js L1246-1279) and computeNraTax (L1195-1243), ported
 * line-for-line, plus computeUsTax's own routing (L793-801):
 *
 *   usKind in {ccorp, scorp, partnership, trust}  -> entity tax
 *   files 1040-NR without a §6013(h) election     -> NRA tax
 *   otherwise                                     -> the individual path
 *
 * The routing lives where the engine's lives — usTaxResult itself is
 * REDEFINED as the router (mirroring how computed.usTax is whatever branch
 * compute() returned), with the original individual-path node re-registered
 * as usTaxIndividualResult. Every existing consumer (FTC boundaries,
 * findings, headline, reports) resolves usTaxResult by id, so under this
 * file's merged set they automatically get the entity/NRA-correct figures —
 * which is what finally lets the full-chain runner assert ALL 11 profiles
 * with no carve-outs.
 *
 * Both result builders ported to the engine's EXACT output shape (every
 * field, including the nra{} detail block and bracket breakdown, the
 * feie stub, and effectiveRate) — the runner deep-compares the full object
 * for entity/NRA profiles, not a field subset.
 *
 * NRA notes preserved from the engine:
 *   - W-8BEN gate (Treas. Reg. §1.1441-6): a treaty-reduced FDAP rate
 *     applies ONLY when submittedW8ben — else the 30% statutory default,
 *     matching the nra_w8ben_missing finding's warning.
 *   - NRAs generally can't file MFJ absent §6013 — status collapses to
 *     single unless mfj.
 *   - No standard deduction; itemized only, with the SALT cap applied at
 *     ECI-level AGI.
 * ==========================================================================*/
var baseNodes = require("./agg10-nodes.js").NODES;
var CONST = require("../engine/constants.js").CONST;
var T = CONST.TAX.US;

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function bracketTax(amount, slabs) {
  var t = Math.max(0, amount), tax = 0, prev = 0;
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; } else break; }
  return tax;
}
function bracketBreakdown(amount, slabs) {
  var t = Math.max(0, amount), prev = 0, rows = [];
  for (var i = 0; i < slabs.length; i++) { var cap = slabs[i][0], rate = slabs[i][1]; if (t > prev) { var taxable = Math.min(t, cap) - prev; rows.push({ from: prev, to: cap, rate: rate, taxable: taxable, tax: taxable * rate }); prev = cap; } else break; }
  return rows;
}
function computeSaltCap(agi, status) {
  var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
  var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
  var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
  return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
}

var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

/* ---- model.nra mirror (normalize.js L2470-2479), raw ---------------------- */
NODES.nraRaw = {
  deps: [],
  compute: function (d, ctx) {
    var us = ctx.us;
    return {
      hasUsPe: safe(us, "nra_specific.has_us_pe", false) === true,
      submittedW8ben: safe(us, "nra_specific.submitted_w8ben", false) === true,
      eciIncomeUsd: num(safe(us, "nra_specific.us_eci_income_usd", 0)),
      fdapIncomeUsd: num(safe(us, "nra_specific.us_fdap_income_usd", 0)),
      treatyRateClaims: safe(us, "nra_specific.treaty_rate_claims", []) || [],
      usRealPropertyDisposed: safe(us, "nra_specific.us_real_property_disposed", false) === true,
      firptaWithholdingUsd: num(safe(us, "nra_specific.firpta_withholding_usd", 0)),
      s6013hElection: safe(us, "nra_specific.s6013h_joint_election", false) === true
    };
  }
};

/* ---- TAX-7: computeUsEntityTax ------------------------------------------- */
NODES.usEntityTaxResult = {
  deps: ["usEntityKind", "entityResult", "aggregateUsIncomeResult"],
  compute: function (d) {
    var kind = d.usEntityKind;
    var m1Taxable = d.entityResult.usScheduleM1TaxableIncomeUsd;
    var taxable = m1Taxable != null ? m1Taxable : d.aggregateUsIncomeResult.total.usd;
    function usEntityResult(taxableUsd, tax, label, passthrough) {
      return {
        filingStatus: label, isEntity: true, passthrough: passthrough, worldwide: true,
        totalIncomeUsd: taxableUsd, agiUsd: taxableUsd, deductionUsd: 0, deductionMode: "n/a",
        taxableIncomeUsd: taxableUsd, ordinaryTaxUsd: tax, preferentialTaxUsd: 0,
        incomeTaxUsd: tax, niitUsd: 0, additionalMedicareUsd: 0,
        seTaxUsd: 0, qbiDeductionUsd: 0, amtUsd: 0, creditsUsd: 0,
        totalTaxBeforeFtcUsd: tax,
        foreignSourceIncomeUsd: d.aggregateUsIncomeResult.foreignSourceTotal.usd,
        usSourceIncomeUsd: d.aggregateUsIncomeResult.usSourceTotal.usd,
        effectiveRate: taxableUsd > 0 ? tax / taxableUsd : 0
      };
    }
    if (kind === "ccorp") {
      var tax = taxable * T.C_CORP_RATE;
      return usEntityResult(taxable, tax, "C-Corp (1120, 21%)", false);
    }
    return usEntityResult(taxable, 0, (kind === "scorp" ? "S-Corp (1120-S)" : kind === "partnership" ? "Partnership (1065)" : "Trust/Estate (1041)") + " · pass-through", true);
  }
};

/* ---- TAX-8: computeNraTax ------------------------------------------------- */
NODES.nraTaxResult = {
  deps: ["nraRaw", "usFilingStatusRaw", "dedUs", "additionalMedicareOwedBoundary"],
  compute: function (d) {
    var nra = d.nraRaw;
    var status = d.usFilingStatusRaw === "mfj" ? "mfj" : "single";
    var brackets = T.BRACKETS[status] || T.BRACKETS.single;
    var ded = d.dedUs;

    var eciUsd = nra.eciIncomeUsd || 0;
    var fdapUsd = nra.fdapIncomeUsd || 0;
    var claim = (nra.treatyRateClaims || [])[0];
    var claimedRate = (claim && claim.rate != null) ? Math.max(0, Math.min(1, Number(claim.rate) / 100)) : null;
    var w8benOnFile = nra.submittedW8ben === true;
    var fdapRate = (w8benOnFile && claimedRate != null) ? claimedRate : 0.30;

    var itemized = Math.min(ded.salt, computeSaltCap(eciUsd, status)) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * eciUsd);
    var taxableEciUsd = Math.max(0, eciUsd - itemized);
    var eciTaxUsd = bracketTax(taxableEciUsd, brackets);
    var eciBracketBreakdown = bracketBreakdown(taxableEciUsd, brackets);
    var fdapTaxUsd = fdapUsd * fdapRate;
    var addlMedicare = d.additionalMedicareOwedBoundary || 0;
    var totalTax = eciTaxUsd + fdapTaxUsd + addlMedicare;

    return {
      filingStatus: status, worldwide: false, isNra: true,
      totalIncomeUsd: eciUsd + fdapUsd,
      agiUsd: eciUsd, deductionUsd: itemized, deductionMode: "itemized (NRA — no standard deduction)",
      taxableIncomeUsd: taxableEciUsd,
      ordinaryTaxUsd: eciTaxUsd, preferentialTaxUsd: 0, incomeTaxUsd: eciTaxUsd + fdapTaxUsd,
      niitUsd: 0, additionalMedicareUsd: addlMedicare, seTaxUsd: 0, qbiDeductionUsd: 0, amtUsd: 0, creditsUsd: 0,
      totalTaxBeforeFtcUsd: totalTax,
      foreignSourceIncomeUsd: 0,
      usSourceIncomeUsd: eciUsd + fdapUsd,
      nra: { eciUsd: eciUsd, fdapUsd: fdapUsd, fdapRate: fdapRate, eciTaxUsd: eciTaxUsd, fdapTaxUsd: fdapTaxUsd, taxableEciUsd: taxableEciUsd, eciBracketBreakdown: eciBracketBreakdown,
        claimedRate: claimedRate, w8benOnFile: w8benOnFile, incomeType: (claim && claim.income_type) || null },
      feie: { claimed: false, eligible: false, taxHomeAbroad: false, testMet: false, reasons: [], appliedUsd: 0 },
      effectiveRate: (eciUsd + fdapUsd) > 0 ? totalTax / (eciUsd + fdapUsd) : 0
    };
  }
};

/* ---- the routing, exactly where the engine's lives ------------------------ */
NODES.usTaxIndividualResult = baseNodes.usTaxResult;
NODES.usTaxResult = {
  deps: ["usEntityKind", "files1040nr", "s6013hElection", "usEntityTaxResult", "nraTaxResult", "usTaxIndividualResult"],
  compute: function (d) {
    var ek = d.usEntityKind;
    if (ek === "ccorp" || ek === "scorp" || ek === "partnership" || ek === "trust") return d.usEntityTaxResult;
    if (d.files1040nr && !d.s6013hElection) return d.nraTaxResult;
    return d.usTaxIndividualResult;
  }
};

module.exports = { NODES: NODES };

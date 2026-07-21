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
var CONST = require("./constants.js").CONST;
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
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function computeSaltCap(agi, status) {
  var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
  var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
  var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
  return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
}

var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

// Trust/estate ordinary-income brackets (IRC §1(e)) — highly compressed
// relative to the individual brackets above (37% starts around $15,650,
// vs. $640,600+ for a single individual). TY2025 figures (Rev. Proc.
// 2024-40) — the most recent CONFIRMED figures at hand; TY2026's Rev.
// Proc. 2025-32 almost certainly nudges these up slightly for inflation
// (single-digit-percent, same as the individual brackets above), but that
// specific trust/estate table hasn't been independently verified here, so
// these are stated as the best-available figures, not asserted as the
// final TY2026 numbers — same "confirm before filing" discipline as every
// other estimated figure in this codebase.
var TRUST_ESTATE_BRACKETS = [[3150, 0.10], [11450, 0.24], [15650, 0.35], [Infinity, 0.37]];

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

// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6, 21 Jul
// 2026): new raw field, no engine equivalent — a trust taxpayer previously
// had no way to report retained (undistributed) income at all, so
// computeUsEntityTax's blanket "trust = pass-through, $0 entity tax" was
// silently wrong for any REAL retaining trust (only correct for one that
// genuinely distributes everything, a "simple trust" under §651). Layer 1
// US now collects this on the trust profile step; see usEntityTaxResult
// below for how it's used.
NODES.trustRetainedIncomeUsdRaw = { deps: [], compute: function (d, ctx) { return num(safe(ctx.us, "profile.trust_retained_income_usd", 0)); } };

/* ---- TAX-7: computeUsEntityTax ------------------------------------------- */
NODES.usEntityTaxResult = {
  deps: ["usEntityKind", "entityResult", "aggregateUsIncomeResult", "trustRetainedIncomeUsdRaw"],
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
        // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H —
        // "entity-agnostic audit", 21 Jul 2026): the engine reads
        // model.income.us.foreignSourceTotal/usSourceTotal here — the
        // INDIVIDUAL-shaped aggregate (wages+interest+dividends+...), which
        // is always $0 for an entity, since an entity's own income is
        // Schedule M-1 book-to-tax reconciled (taxableUsd, above), a
        // completely separate figure Layer 1 never folds into that
        // individual aggregate. That $0 cascades into real wrong numbers,
        // not just display: India's own s.90 FTC relief for US tax paid
        // zeroes out entirely (ftc-nodes.js's usSourceTotalUsdBoundaryFtc
        // reads the same field), and the FY<->CY apportionment card shows
        // $0 for the whole US side. Fixed here at the source: this engine
        // model has no data splitting an entity's OWN M-1 income into
        // US-source vs foreign-source pieces (that's a distinct, separately-
        // tracked GILTI/CFC inclusion on model.assets.businessEntities, not
        // part of this entity's own return) — worldwide:true already three
        // lines up encodes the same "tax the whole M-1 figure, no further
        // split" assumption this model already makes for entity taxpayers,
        // so treating the full taxableUsd as US-source (zero foreign-source)
        // is the same assumption stated consistently, not a new one.
        foreignSourceIncomeUsd: 0,
        usSourceIncomeUsd: taxableUsd,
        effectiveRate: taxableUsd > 0 ? tax / taxableUsd : 0
      };
    }
    if (kind === "ccorp") {
      var tax = taxable * T.C_CORP_RATE;
      return usEntityResult(taxable, tax, "C-Corp (1120, 21%)", false);
    }
    if (kind === "trust") {
      // "taxable" here (from aggregateUsIncomeResult, since Schedule M-1
      // isn't collected for a trust) is effectively the SUM of what Layer 1
      // labels "Beneficiaries' Share of Income" for a trust filer — i.e.
      // income the distribution deduction offsets, taxed on the
      // beneficiaries' own returns instead, not here. Only the NEW
      // trustRetainedIncomeUsdRaw field (income the trust actually kept)
      // is subject to real entity-level tax, at the compressed §1(e)
      // brackets — not the flat $0 every trust got before this field
      // existed to say otherwise. totalIncomeUsd/usSourceIncomeUsd still
      // report the FULL economic total (distributed + retained) — the
      // cross-border FTC/apportionment consumers of this result want "how
      // much did this entity earn," not "how much is taxed at its level."
      var retainedUsd = d.trustRetainedIncomeUsdRaw;
      var distributedUsd = taxable;
      var totalTrustIncomeUsd = distributedUsd + retainedUsd;
      var trustTax = bracketTax(retainedUsd, TRUST_ESTATE_BRACKETS);
      var r = usEntityResult(totalTrustIncomeUsd, trustTax, "Trust/Estate (1041)" + (retainedUsd > 0 ? " — retained income at compressed §1(e) rates" : " · pass-through (fully distributed)"), retainedUsd <= 0);
      r.taxableIncomeUsd = retainedUsd;
      r.trustDistributedUsd = distributedUsd;
      r.trustRetainedUsd = retainedUsd;
      r.trustBracketBreakdown = bracketBreakdown(retainedUsd, TRUST_ESTATE_BRACKETS);
      return r;
    }
    return usEntityResult(taxable, 0, (kind === "scorp" ? "S-Corp (1120-S)" : "Partnership (1065)") + " · pass-through", true);
  }
};

// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.7 —
// "US state income tax, Phase 2", 21 Jul 2026): computeUsStateTax excludes
// ALL business entities entirely (computation.js:1129-1132's own comment:
// "Business entities... file separate state franchise/entity-level returns,
// an unrelated and unmodeled regime, so this function only fires for
// individual filers") — a real gap this closes for the one case that's
// genuinely tractable at the same "planning-grade, single-state, no
// apportionment" fidelity as the individual brackets above, with everything
// else honestly flagged as unmodeled rather than silently treated as $0:
//
//   - C-Corp in CA/NY/NJ: a real (simplified — top-bracket flat rate, no
//     apportionment/minimum-tax/surtax) entity-level income tax.
//   - S-Corp/Partnership (any state): pass-through at the state level too,
//     same as federal above — no entity-level income tax by default, but a
//     state PTET (pass-through entity tax) election can shift liability
//     onto the entity as a federal-SALT-cap workaround; not modeled.
//   - Trust: state fiduciary income tax has its own throwback/accumulation-
//     distribution rules, a materially different computation from the
//     federal §1(e) brackets above; not modeled.
//   - TX/WA (any entity kind): NOT no-tax states for a business, unlike for
//     an individual — Texas's Franchise (Margin) Tax and Washington's B&O
//     tax are real, gross-receipts/margin-based taxes with no income-tax
//     analog to reuse the bracket model for. Deliberately NOT given the
//     same "$0, confirmed no tax" treatment individuals get in these two
//     states (usStateTaxResult's own NO_INDIVIDUAL_INCOME_TAX_STATES,
//     findings-batch5-nodes.js) — that would be actively misleading here.
//   - every other state: genuinely not modeled.
//
// Surfaced as a finding only (see the findingsAllResult override below), not
// a new taxComputation/document card — avoids a frontend schema change for
// a first cut; Views.jsx already renders arbitrary findings generically.
var ENTITY_STATE_CCORP_RATES = {
  CA: { rate: 0.0884, name: "California", label: "California's flat 8.84% corporate franchise tax rate — excludes the $800 minimum franchise tax and the 10.84% financial-corporation rate" },
  NY: { rate: 0.0725, name: "New York", label: "New York's 7.25% Article 9-A top-bracket business income base rate — excludes the lower 6.5% bracket (ENI ≤ $5M), the fixed-dollar-minimum tax based on NY receipts, and the MTA surcharge" },
  NJ: { rate: 0.09, name: "New Jersey", label: "New Jersey's 9% Corporation Business Tax top-bracket rate — excludes the lower 6.5%/7.5% brackets and the temporary 2.5% surtax on income over $1M" }
};
var ENTITY_NO_INCOME_TAX_REAL_REGIME = {
  TX: "Texas has no corporate income tax, but levies its own Franchise (Margin) Tax — a gross-receipts/margin-based tax, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure.",
  WA: "Washington has no corporate income tax, but levies its own Business & Occupation (B&O) Tax — a gross-receipts tax on most business activity, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure."
};

NODES.usEntityStateOfDomicileRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "profile.state_of_domicile", null); } };

NODES.usEntityStateTaxResult = {
  deps: ["usEntityKind", "usEntityStateOfDomicileRaw", "usEntityTaxResult"],
  compute: function (d) {
    if (d.usEntityKind === "individual") return null;
    var stateCode = d.usEntityStateOfDomicileRaw;
    if (!stateCode) return null;
    var kind = d.usEntityKind;
    var base = { state: stateCode, kind: kind };

    if (ENTITY_NO_INCOME_TAX_REAL_REGIME[stateCode]) {
      return Object.assign({}, base, {
        modeled: false, stateName: stateCode === "TX" ? "Texas" : "Washington",
        reason: ENTITY_NO_INCOME_TAX_REAL_REGIME[stateCode]
      });
    }
    if (kind === "scorp" || kind === "partnership") {
      return Object.assign({}, base, {
        modeled: false, stateName: null,
        reason: "Pass-through at the state level too, same as federal — no entity-level state income tax by default. Not checked here: whether " +
          stateCode + " offers a PTET (pass-through entity tax) election, which shifts state tax liability onto the entity as a federal-SALT-cap workaround."
      });
    }
    if (kind === "trust") {
      return Object.assign({}, base, {
        modeled: false, stateName: null,
        reason: "State fiduciary income tax has its own throwback/accumulation-distribution rules, materially different from the federal §1(e) brackets computed above — not modeled."
      });
    }
    // kind === "ccorp" from here
    var T = ENTITY_STATE_CCORP_RATES[stateCode];
    if (!T) {
      return Object.assign({}, base, {
        modeled: false, stateName: null,
        reason: "State-level C-Corp income tax is not modeled for " + stateCode + " — do not assume $0 exposure."
      });
    }
    var taxableUsd = Math.max(0, d.usEntityTaxResult.taxableIncomeUsd);
    var totalTaxUsd = Math.round(taxableUsd * T.rate);
    return Object.assign({}, base, {
      modeled: true, stateName: T.name, rate: T.rate, rateLabel: T.label,
      taxableIncomeUsd: taxableUsd, totalTaxUsd: totalTaxUsd,
      basis: "TY2025 rates (returns filed 2026); " + T.label + ". Single-state, no apportionment (assumes 100% of federal taxable income is allocated to " + T.name + ")."
    });
  }
};

// Appends the new entity-state-tax finding to the existing merged findings
// array — the same "concat + re-sort" shape the base array is already built
// with (report-batch5-nodes.js's findingsAllResult), so the new entry lands
// in its correct severity/amountUsd position rather than always at the end.
// Stable-sorting an already-sorted array with the same comparator (V8's
// Array.sort is stable, ES2019+) leaves every pre-existing element's
// relative order untouched — only the new element gets placed.
NODES.findingsAllResult = {
  deps: baseNodes.findingsAllResult.deps.concat(["usEntityStateTaxResult"]),
  compute: function (d, ctx) {
    var all = baseNodes.findingsAllResult.compute(d, ctx).slice();
    var est = d.usEntityStateTaxResult;
    if (est) {
      if (est.modeled) {
        all.push({
          id: "us_entity_state_tax", severity: "warning", category: "credit",
          title: est.stateName + " state entity-level tax: " + usd(est.totalTaxUsd) + " (C-Corp)",
          detail: est.stateName + " taxes this entity's own net income at the entity level, separate from and in addition to the 21% federal corporate rate — computed here as " +
            usd(est.totalTaxUsd) + " on " + usd(est.taxableIncomeUsd) + " of federal taxable income at " + est.rateLabel + ".",
          recommendation: "File the entity's " + est.stateName + " corporate return (in addition to Form 1120) alongside the federal return. This is a simplified top-bracket-rate, single-state estimate — confirm the exact minimum-tax/surtax/apportionment figures with a preparer before relying on it.",
          amountUsd: est.totalTaxUsd, refs: [est.stateName + " corporate income tax", "Form 1120"]
        });
      } else {
        all.push({
          id: "us_entity_state_tax_not_modeled", severity: "info", category: "credit",
          title: (est.stateName || est.state) + " entity-level state tax exposure — not modeled",
          detail: est.reason,
          recommendation: "Confirm this entity's actual state-level tax exposure in " + (est.stateName || est.state) +
            " with a preparer — WISING does not compute it here, and this is NOT a confirmed-zero result.",
          amountUsd: 0, refs: [est.stateName || est.state]
        });
      }
      var weight = { critical: 0, warning: 1, info: 2 };
      all.sort(function (a, b) {
        if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
        return b.amountUsd - a.amountUsd;
      });
    }
    return all;
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

// DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H, 21 Jul
// 2026): apportionment-nodes.js's own apportionmentResult reads
// aggregateUsIncomeResult.usSourceTotal.usd directly for usCyTotalUsd — the
// same individual-shaped aggregate usEntityResult's own fix above addresses,
// $0 for a US business entity, so the FY<->CY Apportionment card showed $0
// for the entire US side of a real C-Corp's income. Overridden here (not in
// apportionment-nodes.js itself) because usTaxResult — the routed, now
// entity-aware total — only exists once this file's routing above has run;
// apportionment-nodes.js stays independently resolvable with just
// {router, india, us} (run-apportionment.js's own standalone harness), this
// override only takes effect once it's folded into the full chain.
//
// ENTITY-ONLY: gated on isEntity, not swapped in unconditionally. usTaxResult.
// usSourceIncomeUsd legitimately NARROWS below the raw aggregate for an NRA
// (ECI+FDAP only) or an FEIE-electing individual (net of the §911 exclusion)
// — both correct, pre-existing divergences from the gross figure, not bugs.
// Apportionment is a "how much of this calendar year's ACTUAL income falls
// in which fiscal year" concept, which wants the gross figure for those two
// cases (same one Holdings shows), same as the un-overridden engine — only
// the entity case (aggregate always $0, a data-modeling gap, not a real
// narrowing) needs the swap. Found by run-fuzz.js after this override first
// shipped unconditionally: FEIE/NRA profiles started showing a real new
// apportionment divergence with no entity involved at all.
NODES.apportionmentResult = {
  deps: ["apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "usTaxResult", "aggregateUsIncomeResult"],
  compute: function (d) {
    var baseYear = d.apportionmentBaseYearRaw;
    var q = d.apportionmentIndiaQuarterlyUsdRaw;
    var hasQ = !!(q && q.some(function (x) { return x > 0; }));
    var indiaFyTotal = d.indiaTotalIncomeUsdForApportionment;
    var primaryShare, nextShare;
    if (hasQ) {
      var qTot = (q[0] + q[1] + q[2] + q[3]) || indiaFyTotal || 1;
      primaryShare = (q[0] + q[1] + q[2]) / qTot;
      nextShare = q[3] / qTot;
    } else {
      primaryShare = 0.75; nextShare = 0.25; // 9 months (Apr-Dec) vs 3 (Jan-Mar)
    }
    var usCyTotal = d.usTaxResult.isEntity ? d.usTaxResult.usSourceIncomeUsd : d.aggregateUsIncomeResult.usSourceTotal.usd;
    return {
      basis: hasQ ? "Indian quarterly data" : "even-earning assumption (Apr–Dec vs Jan–Mar)",
      fyLabel: "FY " + baseYear + "–" + String(baseYear + 1).slice(2),
      cyPrimary: baseYear, cyNext: baseYear + 1,
      indiaFyTotalUsd: indiaFyTotal,
      indiaToCyPrimaryUsd: Math.round(indiaFyTotal * primaryShare),
      indiaToCyNextUsd: Math.round(indiaFyTotal * nextShare),
      primaryShare: primaryShare, nextShare: nextShare,
      usCyTotalUsd: usCyTotal,
      usCyToFyPrimaryUsd: Math.round(usCyTotal * 9 / 12),
      usCyToFyNextUsd: Math.round(usCyTotal * 3 / 12)
    };
  }
};

module.exports = { NODES: NODES };

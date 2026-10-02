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
var computeUsTaxCore = require("./ustax-nodes.js").computeUsTaxCore;
var nraFdapBreakdown = require("./nra-fdap-util.js").nraFdapBreakdown;
var nraExemptInterestUsd = require("./nra-fdap-util.js").nraExemptInterestUsd;
var nraInterestSplitRecorded = require("./nra-fdap-util.js").nraInterestSplitRecorded;

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
  // Separate filers (IRS 2025 Schedule A, line 5e worksheet): the joint
  // cap is phased down 30% over the halved threshold, floored at $10,000,
  // and then halved — an effective 15% phase-down and a $5,000 floor.
  if (status === "mfs") base = T.SALT_CAP_BASE_USD.single;
  var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
  var cap = Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
  return status === "mfs" ? cap / 2 : cap;
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
// SYS-1-class gotcha, found while wiring the §6013(h) spouse-ITIN field:
// this file's own NODES is built by copying agg10-nodes.js's entire chain
// (which already includes findings-batch3-nodes.js's OWN, differently-
// shaped nraRaw) into `baseNodes` above, then OVERWRITING nraRaw with this
// separate definition -- silently dropping w7ItinApplicationFiled (task
// #47) from every consumer that resolves through THIS file's chain
// (checks-registry-nodes.js -> assets-nodes.js -> here -- i.e. the REAL
// production analyze() pipeline and run-fuzz.js, NOT run-report1.js/
// run-analyze.js, which resolve report-batch5-nodes.js directly and never
// hit this override at all). Went undetected because `undefined` and
// `false` are indistinguishable to `!d.nraRaw.w7ItinApplicationFiled` --
// harmless for the pre-existing primary-only gate, but would have silently
// broken the new spouse-ITIN gate below the same way. Fixed by making this
// copy the superset of both files' fields (this file's own
// hasUsPe/eciIncomeUsd/fdapIncomeUsd, needed for TAX-7/TAX-8 NRA tax
// routing, plus findings-batch3-nodes.js's w7ItinApplicationFiled/
// spouseSsnOrItinType, needed for the findings layer) rather than trying
// to eliminate the duplicate node id, which would be a much larger
// refactor of the merge chain itself.
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
      s6013hElection: safe(us, "nra_specific.s6013h_joint_election", false) === true,
      w7ItinApplicationFiled: safe(us, "nra_specific.form_w7_itin_application_filed", false) === true,
      spouseSsnOrItinType: safe(us, "nra_specific.spouse_ssn_or_itin_type", "none")
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
// ENTITY-ROUTING FIX (29 Jul 2026, post-Phase-7/XB-14 review): the comment
// three lines below this one (inside usEntityResult) previously stated that
// GILTI/CFC inclusion is "a distinct, separately-tracked... inclusion on
// model.assets.businessEntities, not part of this entity's own return" —
// true for an S-corp/partnership (the inclusion passes through to the
// OWNERS' own returns, never taxed at the entity level), but NOT true for a
// C-corp or a trust that is itself the CFC's direct US shareholder: §951A
// inclusion is real gross income to THAT shareholder, taxed on ITS OWN
// return. Before this fix, cfcInclusionResult (aggregateusincome-nodes.js,
// Phase 7/XB-14) computed real dollar figures but this function never read
// them for any entity kind — so a C-corp's or trust's actual computed CFC
// tax silently never reached usEntityTaxResult.taxableIncomeUsd/tax,
// regardless of how much GILTI/NCTI/Subpart F was on file. Fixed below for
// ccorp (§951A inclusion is automatic and taxed with the entity's own M-1
// income at the flat 21% corporate rate via cfcElectedPool, which
// aggregateusincome-nodes.js now force-routes through the corporate-style
// §250/FTC pool for any ccorp shareholder) and trust (adds the CFC
// inclusion to the trust's own recognized income, taxed alongside its other
// retained income — see the trust branch below for the stated assumption).
// S-corp/partnership are intentionally left untouched: a real pass-through
// entity owes no federal entity-level tax on its CFC inclusion either way —
// it flows to the partners'/shareholders' own 1040s, which this model
// doesn't allocate — so $0 here remains correct, not a gap this fix closes.
NODES.usEntityTaxResult = {
  deps: ["usEntityKind", "entityResult", "aggregateUsIncomeResult", "trustRetainedIncomeUsdRaw"],
  compute: function (d) {
    var kind = d.usEntityKind;
    var m1Taxable = d.entityResult.usScheduleM1TaxableIncomeUsd;
    var taxable = m1Taxable != null ? m1Taxable : d.aggregateUsIncomeResult.total.usd;
    var cfc = d.aggregateUsIncomeResult.cfcElectedPool || null;
    var cfcNetTaxUsd = cfc ? cfc.netTaxUsd : 0;
    function usEntityResult(taxableUsd, tax, label, passthrough) {
      return {
        filingStatus: label, isEntity: true, passthrough: passthrough, worldwide: true,
        totalIncomeUsd: taxableUsd, agiUsd: taxableUsd, deductionUsd: 0, deductionMode: "n/a",
        taxableIncomeUsd: taxableUsd, ordinaryTaxUsd: tax, preferentialTaxUsd: 0,
        incomeTaxUsd: tax, niitUsd: 0, additionalMedicareUsd: 0,
        seTaxUsd: 0, qbiDeductionUsd: 0, amtUsd: 0, creditsUsd: 0,
        collectiblesGainUsd: 0, collectiblesTaxUsd: 0, qsbsExcludedGainUsd: 0, qsbsTaxableGainUsd: 0,
        saversCreditUsd: 0,
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
        // US-source vs foreign-source pieces (a separate concern from
        // whether a GILTI/CFC inclusion is ALSO taxed on this same return —
        // for a ccorp/trust it now is, see cfcNetTaxUsd above; this field is
        // specifically about the M-1 figure's own sourcing, not about
        // whether CFC tax appears on the return at all) — worldwide:true already three
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
      // A domestic C-corp's own §951A inclusion (aggregateusincome-nodes.js
      // force-routes every CFC into cfcElectedPool for a ccorp shareholder,
      // since real corporations don't need a §962 election) is taxed with
      // the entity's own income, not folded into the 21%-of-M1 base itself
      // (the pool already applied its own 40% §250 deduction / flat-21% /
      // deemed-paid-FTC math) — added as a separate line, same "flat add-on,
      // not blended into the bracket base" pattern computeUsTaxCore uses for
      // an individual's §962-elected gilti962TaxUsd.
      var tax = taxable * T.C_CORP_RATE + cfcNetTaxUsd;
      var rCcorp = usEntityResult(taxable, tax, "C-Corp (1120, 21%)" + (cfcNetTaxUsd > 0 ? " + CFC (§951A/NCTI) inclusion" : ""), false);
      rCcorp.cfcNetTaxUsd = cfcNetTaxUsd;
      return rCcorp;
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
      //
      // CFC inclusion (a trust holding CFC stock directly, unlike an
      // S-corp/partnership, IS itself a §951A "United States shareholder"):
      // Layer 1 has no field splitting a GILTI/Subpart F inclusion into a
      // distributed-vs-retained share the way it does for the trust's other
      // income, so — stated simplification, same "explicit boundary, not
      // guessed" discipline as everywhere else in this file — the
      // non-elected inclusion is assumed RETAINED (added to retainedUsd
      // before the §1(e) bracket tax) rather than assumed distributed to a
      // beneficiary's own 1040, since a non-grantor trust holding CFC stock
      // as its own investment is the more common real-world shape. A §962
      // election (per-CFC, same as an individual) adds its own flat add-on
      // tax, same pattern as the ccorp branch above.
      var cfcNonElectedUsd = (d.aggregateUsIncomeResult.cfcNonElectedInclusionUs && d.aggregateUsIncomeResult.cfcNonElectedInclusionUs.usd) || 0;
      var retainedUsd = d.trustRetainedIncomeUsdRaw + cfcNonElectedUsd;
      var distributedUsd = taxable;
      var totalTrustIncomeUsd = distributedUsd + retainedUsd;
      var trustTax = bracketTax(retainedUsd, TRUST_ESTATE_BRACKETS) + cfcNetTaxUsd;
      var r = usEntityResult(totalTrustIncomeUsd, trustTax, "Trust/Estate (1041)" + (retainedUsd > 0 ? " — retained income at compressed §1(e) rates" : " · pass-through (fully distributed)"), retainedUsd <= 0);
      r.taxableIncomeUsd = retainedUsd;
      r.trustDistributedUsd = distributedUsd;
      r.trustRetainedUsd = retainedUsd;
      r.cfcNetTaxUsd = cfcNetTaxUsd;
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
  TX: { name: "Texas", reason: "Texas has no corporate income tax, but levies its own Franchise (Margin) Tax — a gross-receipts/margin-based tax, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure." },
  WA: { name: "Washington", reason: "Washington has no corporate income tax, but levies its own Business & Occupation (B&O) Tax — a gross-receipts tax on most business activity, structurally different from an income tax. Not modeled here — do not assume $0 state tax exposure." },
  WY: { name: "Wyoming", reason: "Wyoming has no corporate income tax, but requires an annual license/report fee based on in-state assets — structurally different from an income tax and not modeled here. Do not assume $0 state cost." }
};
// Delaware is NOT a no-income-tax state (flat 8.7% on DE-apportioned taxable
// income) -- but the single most common Delaware-incorporated shape here is
// a company incorporated in DE while operating (and apportioning income)
// entirely elsewhere, which typically owes $0 DE corporate INCOME tax.
// Separately, EVERY DE corporation owes DE's annual FRANCHISE TAX regardless
// of income or apportionment (Authorized Shares Method or Assumed Par Value
// Capital Method, whichever is lower; $175-$200,000+/year) -- not modeled
// here (would need authorized/issued share counts and gross assets, fields
// this form doesn't collect), and easy to mistake for the income tax this
// note is about, so called out explicitly rather than silently omitted.
var ENTITY_DE_INCOME_TAX_NOTE = "Delaware has an 8.7% corporate income tax, but only on income apportioned to Delaware — a company incorporated in DE but operating elsewhere typically owes little to no DE corporate INCOME tax (not modeled here — do not assume $0 without confirming DE-source apportionment). Separately, and NOT covered by this note: every Delaware corporation owes Delaware's annual franchise tax regardless of income (Authorized Shares or Assumed Par Value method, $175 minimum) — track this as its own always-due line item.";

/* ---- XB-6: §877A covered-expatriate determination (Rev. Proc. 2025-32,
 * tax year 2026 figures) -----------------------------------------------------
 * A Long-Term Resident (green card held 8+ of the last 15 years, IRC
 * 7701(b)(6)) who surrenders the green card is a "covered expatriate" if
 * ANY ONE of three tests is met: net worth >= $2,000,000 (fixed, not
 * inflation-adjusted since 2008); average annual net income tax for the 5
 * years before expatriation > $211,000 (2025 was $206,000); or failure to
 * certify 5 years of federal tax compliance on Form 8854. This node only
 * determines COVERED-EXPATRIATE STATUS — it deliberately does NOT compute
 * the actual §877A mark-to-market exit tax, since that requires a full
 * worldwide asset/basis schedule Layer 1 doesn't collect (same judgment as
 * the Delaware franchise-tax note above: disclose what we can't compute
 * rather than fabricate a number). */
var EXPATRIATION_LTR_YEARS_THRESHOLD = 8;
var EXPATRIATION_NET_WORTH_THRESHOLD_USD = 2000000;
var EXPATRIATION_AVG_NET_INCOME_TAX_THRESHOLD_USD = 211000; // 2026, Rev. Proc. 2025-32 (2025 was $206,000)
var EXPATRIATION_MTM_EXCLUSION_USD = 910000; // 2026, Rev. Proc. 2025-32 (2025 was $890,000)

NODES.usGreenCardYearsHeldRaw = { deps: [], compute: function (d, ctx) { return Number(safe(ctx.us, "us_residency_detail.green_card_years_held", 0)) || 0; } };
NODES.usExpatriationNetWorthRaw = { deps: [], compute: function (d, ctx) { return Number(safe(ctx.us, "us_residency_detail.expatriation_net_worth_usd", 0)) || 0; } };
NODES.usExpatriationAvgNetIncomeTaxRaw = { deps: [], compute: function (d, ctx) { return Number(safe(ctx.us, "us_residency_detail.expatriation_avg_net_income_tax_usd", 0)) || 0; } };
NODES.usForm8854CompliantRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.form_8854_5yr_compliance_certified", false) === true; } };

NODES.usExpatriationResult = {
  deps: ["usHasGreenCardRaw", "usGreenCardYearsHeldRaw", "usExpatriationNetWorthRaw", "usExpatriationAvgNetIncomeTaxRaw", "usForm8854CompliantRaw"],
  compute: function (d, ctx) {
    var surrenderedDate = safe(ctx.us, "us_residency_detail.i407_surrendered_date", null);
    var isLtrExpatriating = !!(d.usHasGreenCardRaw && surrenderedDate && d.usGreenCardYearsHeldRaw >= EXPATRIATION_LTR_YEARS_THRESHOLD);
    if (!isLtrExpatriating) return { isLtrExpatriating: false };

    var reasonsMet = [];
    var netWorthTest = d.usExpatriationNetWorthRaw >= EXPATRIATION_NET_WORTH_THRESHOLD_USD;
    if (netWorthTest) reasonsMet.push("net worth of " + usd(d.usExpatriationNetWorthRaw) + " meets the $" + EXPATRIATION_NET_WORTH_THRESHOLD_USD.toLocaleString("en-US") + " threshold");
    var avgTaxTest = d.usExpatriationAvgNetIncomeTaxRaw > EXPATRIATION_AVG_NET_INCOME_TAX_THRESHOLD_USD;
    if (avgTaxTest) reasonsMet.push("average annual net income tax of " + usd(d.usExpatriationAvgNetIncomeTaxRaw) + " exceeds the $" + EXPATRIATION_AVG_NET_INCOME_TAX_THRESHOLD_USD.toLocaleString("en-US") + " threshold");
    var certTest = !d.usForm8854CompliantRaw;
    if (certTest) reasonsMet.push("Form 8854 5-year tax compliance is not certified");

    return {
      isLtrExpatriating: true, yearsHeld: d.usGreenCardYearsHeldRaw,
      isCoveredExpatriate: netWorthTest || avgTaxTest || certTest,
      netWorthTest: netWorthTest, avgTaxTest: avgTaxTest, certTest: certTest, reasonsMet: reasonsMet,
      exclusionUsd: EXPATRIATION_MTM_EXCLUSION_USD
    };
  }
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
        modeled: false, stateName: ENTITY_NO_INCOME_TAX_REAL_REGIME[stateCode].name,
        reason: ENTITY_NO_INCOME_TAX_REAL_REGIME[stateCode].reason
      });
    }
    if (stateCode === "DE" && kind === "ccorp") {
      return Object.assign({}, base, {
        modeled: false, stateName: "Delaware",
        reason: ENTITY_DE_INCOME_TAX_NOTE
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
/* India-US treaty checks (DAG-only; GAP_TRACKER IN-49). Mirrors
 * dag_py/src/wising_dag/us/ustax_full.py's _treaty_findings.
 *  - us_pension_withholding_no_w8ben  DTAA Art. 20(1)
 *  - us_social_security_india_exempt  DTAA Art. 20(2)
 *  - treaty_saving_clause_citizen     DTAA Art. 1(3)
 *  - greencard_treaty_nonresident     DTAA Art. 4 / IRC §7701(b)(6)
 *  - nra_art15_services_exempt        DTAA Art. 15 / Art. 7
 *  - nra_us_interest_exempt           IRC §871(h)/(i) (not a treaty rule)
 *  - joint_return_spouse_income_india interim, until spouse profiles are linked
 *                                     (docs/HOUSEHOLD_DESIGN.md; audit row G1) */
function treatyFindings(d, ctx, isNra) {
  var out = [];
  var u = d.usTaxResult || {};
  var n = (isNra && u.nra) || {};
  var agg = d.aggregateUsIncomeResult || {};
  var res = d.residencyResult || { india: {}, us: {} };
  var indiaStatus = safe(ctx.india, "residency_detail.final_india_residency_status", null);

  if (isNra && (n.pensionTreatyExemptUsd || 0) > 0 && !(d.nraRaw && d.nraRaw.submittedW8ben)) {
    var withheldUsd = 0.30 * n.pensionTreatyExemptUsd;
    out.push({
      id: "us_pension_withholding_no_w8ben", severity: "warning", category: "treaty",
      title: "US pension / IRA payments: about " + usd(withheldUsd) + " withheld at 30% although exempt under DTAA Art. 20(1)",
      detail: usd(n.pensionTreatyExemptUsd) + " of US pension, annuity and IRA payments is on file for a non-resident alien. Periodic pensions paid to a " +
        "resident of India are taxable only in India (DTAA Art. 20(1)), so no US tax is computed on them. But without Form W-8BEN claiming the treaty, the " +
        "payer must withhold 30% (IRC §1441) — about " + usd(withheldUsd) + " a year held by the IRS until refunded.",
      recommendation: "Give each plan administrator / IRA custodian Form W-8BEN claiming DTAA Art. 20(1), so future payments are paid without withholding. " +
        "Recover what was already withheld by filing Form 1040-NR with the exemption on Schedule OI. Lump-sum distributions aren't \"pensions\" under the " +
        "treaty (Art. 20(3) requires periodic payments) and can be taxed by the US — confirm each distribution is periodic.",
      amountUsd: withheldUsd, refs: ["DTAA Art. 20(1)", "Form W-8BEN", "IRC §1441", "Form 1040-NR"]
    });
  }

  // A joint US return holds both spouses' income on this client's US intake,
  // and for an Indian resident taxed on worldwide income that US income flows
  // into the Indian computation. India taxes each spouse separately, and
  // nothing yet says which US items are the spouse's, so the Indian tax,
  // Form 44 relief and double-tax figures may include the spouse's income.
  var usSourceUsd = (agg.usSourceTotal && agg.usSourceTotal.usd) || 0;
  var spouseLinked = !!safe(ctx.us, "profile.spouse_client_id", null);
  // Linked to the spouse's own profile (docs/HOUSEHOLD_DESIGN.md): the joint
  // return, the split of its tax and the Form 44 relief come from the
  // household calculation, not from this client's figures alone.
  if (spouseLinked && safe(ctx.us, "profile.filing_status", null) === "mfj" && res.india && res.india.worldwide && usSourceUsd > 0) {
    out.push({
      id: "joint_return_household_linked", severity: "info", category: "residency",
      title: "Joint US return: use the household figures for US tax and Form 44 relief",
      detail: "This client is linked to their spouse's profile. The Indian income here is this client's own. The US tax and Form 44 relief " +
        "shown on this client alone use joint-return rates on only this client's income, so they understate both. The household " +
        "calculation computes the joint US return from both profiles, splits its tax in proportion to what each spouse would owe filing " +
        "separately, and gives this client's relief from their share.",
      recommendation: "Use the household figures for the Form 44 claim. Keep each spouse's income in their own profile.",
      amountUsd: 0, refs: ["Rule 76", "Form 44", "Form 1040 (joint)"]
    });
  } else if (safe(ctx.us, "profile.spouse_has_income_or_filings", null) !== "no" &&
      safe(ctx.us, "profile.filing_status", null) === "mfj" && res.india && res.india.worldwide && usSourceUsd > 0) {
    var w2Count = (agg.w2Employers || []).length;
    var twoEarnerSigns = w2Count >= 2 || (w2Count >= 1 && (agg.seEarningsUsd || 0) > 0);
    out.push({
      id: "joint_return_spouse_income_india", severity: twoEarnerSigns ? "critical" : "warning", category: "residency",
      title: "Joint US return: spouse's income is included in this client's Indian computation",
      detail: "The US intake is a married-filing-jointly return, so it holds both spouses' US income (" + usd(usSourceUsd) + " in total" +
        (twoEarnerSigns ? ", from " + (w2Count >= 2 ? w2Count + " W-2s" : "a W-2 and self-employment") + " — likely both spouses" : "") +
        "). India taxes each spouse separately, but WISING can't yet tell which of these items are the spouse's, so all of it is in this " +
        "client's Indian income. The Indian tax, the Form 44 relief for US tax and the double-tax figures here may be overstated by the " +
        "spouse's share.",
      recommendation: "Treat the Indian figures as provisional until spouse profiles can be linked. If every US item on this intake is the " +
        "client's own (the spouse has no US income), mark this Not applicable. Otherwise compute the Indian return on the client's own US " +
        "income, and claim Form 44 relief only for the US tax on that income.",
      amountUsd: 0, refs: ["Income-tax Act — individual assessment", "Form 44", "Form 1040 (joint)"]
    });
  }

  // What is known about the spouse on a joint return (docs/HOUSEHOLD_DESIGN.md
  // section 1): a spouse with nothing to report is entered inline on this
  // client's form ("No"); any other spouse needs their own linked profile ("Yes").
  var entityType = safe(ctx.us, "profile.tax_entity_type", "individual") || "individual";
  if (safe(ctx.us, "profile.filing_status", null) === "mfj" && entityType === "individual" && !spouseLinked) {
    var spouseAnswer = safe(ctx.us, "profile.spouse_has_income_or_filings", null);
    var w2n = (agg.w2Employers || []).length;
    if (spouseAnswer === "yes") {
      out.push({
        id: "joint_return_spouse_profile_missing", severity: "critical", category: "residency",
        title: "Joint US return: the spouse's profile isn't linked",
        detail: "The spouse has income, foreign accounts or an Indian return, but no spouse profile is linked. The joint return, the split of " +
          "its tax, the Social Security cap per person and each spouse's Indian return can't be computed from this profile alone.",
        recommendation: "Link the spouse's profile (or create one with + New spouse profile) and enter the spouse's own income there.",
        amountUsd: 0, refs: ["Form 1040 (joint)", "IRC §6013"]
      });
    } else if (spouseAnswer === "no") {
      if (w2n >= 2) {
        out.push({
          id: "joint_return_spouse_two_earner_signs", severity: "warning", category: "residency",
          title: "Joint US return: " + w2n + " W-2s on a profile whose spouse has no income",
          detail: "The spouse is recorded as having no income, but this profile has " + w2n + " W-2s. If any of them is the spouse's, the joint " +
            "return pools both people's wages: the Social Security cap, 401(k) limit and Indian return are then computed as if all of it were this client's.",
          recommendation: "Confirm every W-2 is this client's. If one is the spouse's, answer Yes to the spouse question and move it to the spouse's own profile.",
          amountUsd: 0, refs: ["Form 1040 (joint)", "IRC §1402(b)"]
        });
      }
      var spRes = safe(ctx.us, "profile.spouse_residency_status", null);
      var hasElection = safe(ctx.us, "nra_specific.s6013h_joint_election", false) === true || safe(ctx.us, "us_residency_detail.s6013g_joint_election", false) === true;
      if (spRes === "nonresident_alien" && !hasElection) {
        out.push({
          id: "joint_return_nra_spouse_no_election", severity: "critical", category: "residency",
          title: "Joint US return with a non-resident-alien spouse needs the §6013(g)/(h) election",
          detail: "A joint return isn't allowed when either spouse is a non-resident alien at any time in the year (IRC §6013(a)(1)), unless the " +
            "couple elects to treat the spouse as a US resident. The election brings the spouse's worldwide income, and their foreign accounts, onto the US return.",
          recommendation: "Make the §6013(g) (or §6013(h), first year) election with the joint return, or file married filing separately.",
          amountUsd: 0, refs: ["IRC §6013(a)(1)", "IRC §6013(g)", "IRC §6013(h)"]
        });
      }
      if (safe(ctx.us, "profile.spouse_ssn_or_itin_type", null) === "none") {
        out.push({
          id: "joint_return_spouse_id_missing", severity: "warning", category: "residency",
          title: "Joint US return: the spouse has no SSN or ITIN",
          detail: "Every person listed on the return needs a taxpayer identification number (IRC §6109). Without one the joint return can't be e-filed, " +
            "and the senior, tips and overtime deductions need the spouse's SSN.",
          recommendation: "Apply for an ITIN with Form W-7, attached to the joint return, if the spouse can't get an SSN.",
          amountUsd: 0, refs: ["IRC §6109", "Form W-7"]
        });
      }
    } else {
      out.push({
        id: "joint_return_spouse_unknown", severity: "warning", category: "residency",
        title: "Joint US return: the spouse's situation isn't recorded",
        detail: "It isn't recorded whether the spouse has income, foreign accounts or an Indian return. If they do and it's entered on this profile, " +
          "the joint return pools both people (the Social Security cap, 401(k) limit and Indian return are then wrong); if they don't, the spouse's " +
          "date of birth and SSN are still needed on the return.",
        recommendation: "Answer the spouse question on the US form: No — enter the spouse's details inline; Yes — link the spouse's own profile.",
        amountUsd: 0, refs: ["Form 1040 (joint)"]
      });
    }
  }

  var ssUsd = (agg.socialSecurityUs && agg.socialSecurityUs.usd) || 0;
  var indiaResident = !!(res.india && res.india.isResident) || (isNra && indiaStatus !== "NR");
  if (ssUsd > 0 && indiaResident) {
    var usSide = isNra
      ? "As a non-resident alien, 85% of it is taxed by the US at a flat 30% (" + usd(n.socialSecurityTaxUsd || 0) + "; the SSA withholds 25.5%)."
      : "It is taxed on the US return like any US recipient's benefits (up to 85% taxable, IRC §86).";
    out.push({
      id: "us_social_security_india_exempt", severity: "info", category: "treaty",
      title: "US Social Security (" + usd(ssUsd) + "): taxable only in the US — exempt in India under DTAA Art. 20(2)",
      detail: "US Social Security paid to a resident of India (or to a US citizen) is taxable only in the US (DTAA Art. 20(2)). " + usSide +
        " India must not tax it, so there is no Indian tax against which to credit the US tax either.",
      recommendation: "In the Indian return, show these benefits as exempt income under the DTAA (the exempt-income schedule, Schedule EI), and claim no " +
        "Form 44 foreign tax credit for the US tax on them.",
      amountUsd: 0, refs: ["DTAA Art. 20(2)", "Schedule EI", "Form 44"]
    });
  }

  if (safe(ctx.us, "us_residency_detail.is_us_citizen", false) === true) {
    var blocked = [];
    if (safe(ctx.us, "nra_specific.files_form_1040nr", false) === true) blocked.push("a Form 1040-NR filing");
    if (d.treatyUsResidenceRaw === "india") blocked.push("an Article 4 tie-break to India on the US side");
    if (d.nraRaw && (d.nraRaw.treatyRateClaims || []).length > 0) blocked.push("treaty withholding rates on US income");
    if (blocked.length) {
      out.push({
        id: "treaty_saving_clause_citizen", severity: "critical", category: "residency",
        title: "US citizen: treaty position blocked by the saving clause (DTAA Art. 1(3))",
        detail: "The client is a US citizen, yet the US intake records " + blocked.join(", ") + ". Under the saving clause (Art. 1(3)) the US taxes its " +
          "citizens as if the treaty didn't exist, except for the benefits listed in Art. 1(4) — mainly the foreign tax credit (Art. 25) and US Social " +
          "Security being taxable only in the US (Art. 20(2)). WISING has computed US tax on a citizen's Form 1040 basis, ignoring these entries.",
        recommendation: "File Form 1040 on worldwide income and relieve Indian tax with Form 1116. Remove the 1040-NR / treaty-rate entries, and give US payers " +
          "Form W-9, not W-8BEN — a citizen can't certify foreign status.",
        amountUsd: 0, refs: ["DTAA Art. 1(3)", "DTAA Art. 1(4)", "Form 1040", "Form 1116", "Form W-9"]
      });
    }
  } else if (d.usHasGreenCardRaw && (d.treatyUsResidenceRaw === "india" || d.treatyFiles1040nrRaw ||
             (res.dualResident && d.treatyIndiaResidenceRaw === "india"))) {
    out.push({
      id: "greencard_treaty_nonresident", severity: "warning", category: "residency",
      title: "Green-card holder taking treaty non-residence — Form 8833 and expatriation consequences",
      detail: "A green-card holder who is also resident in India may be treated as a US non-resident when the Article 4 tie-breaker favours India " +
        "(Treas. Reg. §301.7701(b)-7): Form 1040-NR with Form 8833. For a long-term resident (green card in at least 8 of the last 15 years), taking " +
        "that position is an expatriation (IRC §7701(b)(6)): the exit tax applies if the client is a covered expatriate (IRC §877A, Form 8854). " +
        "Immigration authorities may also treat it as evidence of abandoning permanent residence.",
      recommendation: "Confirm the years the green card has been held before filing as a treaty non-resident. If 8 or more of the last 15, run the covered-" +
        "expatriate tests (the Monitor's expatriation checks) and file Form 8854; otherwise file Form 1040-NR with Form 8833. Take immigration advice first.",
      amountUsd: 0, refs: ["DTAA Art. 4", "Treas. Reg. §301.7701(b)-7", "IRC §7701(b)(6)", "IRC §877A", "Form 8833", "Form 8854"]
    });
  }

  // DTAA Art. 22 teacher / researcher exemption and the saving clause
  // (treaty-art22.js): applied, blocked for a citizen / green-card holder,
  // or past the two years from arrival.
  var a22 = require("./treaty-art22.js").art22(ctx.us, require("./treaty-art22.js").baseYearOf(ctx.router, ctx.us));
  if (a22 && a22.claimedUsd > 0) {
    var a22Window = a22.arrivalDate ? " (arrived " + a22.arrivalDate + "; the two years end " + a22.windowEnd + ")" : "";
    if (a22.blockedBy) {
      out.push({
        id: "treaty_article_22_teacher", severity: "warning", category: "residency",
        title: "DTAA Art. 22 teaching / research exemption blocked by the saving clause (Art. 1(3))",
        detail: "The client claims the India–US treaty's teacher and researcher exemption on " + usd(a22.claimedUsd) + " of pay, but is a " +
          (a22.blockedBy === "citizen" ? "US citizen" : "green-card holder") + ". The saving clause lets the US tax its citizens and residents as if the " +
          "treaty didn't exist; its exception for Art. 22 (Art. 1(4)(b)) covers only US residents who are neither citizens nor green-card holders. " +
          "WISING taxes this pay in full.",
        recommendation: a22.blockedBy === "citizen"
          ? "Remove the Art. 22 claim, and any Form 8233 given to the payer; the pay is taxable on Form 1040."
          : "Remove the Art. 22 claim and Form 8233. The only route to it is treaty residence in India under Art. 4 (Form 1040-NR with Form 8833) — for a long-term green-card holder that is an expatriation, so take that advice first.",
        amountUsd: 0, refs: ["DTAA Art. 1(3)", "DTAA Art. 1(4)(b)", "DTAA Art. 22"]
      });
    } else if (a22.exemptUsd > 0) {
      out.push({
        id: "treaty_article_22_teacher", severity: "info", category: "residency",
        title: "DTAA Art. 22: " + usd(a22.exemptUsd) + " of teaching / research pay exempt from US tax",
        detail: "The client claims the India–US treaty's teacher and researcher exemption on " + usd(a22.claimedUsd) + " of pay" + a22Window +
          (a22.fraction < 1 ? "; " + usd(a22.exemptUsd) + " of it falls within the two years" : "") + ". " +
          (isNra ? "As a non-resident alien the client claims it directly. "
            : "As a US resident alien who is neither a citizen nor a green-card holder, the client keeps it under the saving clause's exception (DTAA Art. 1(4)(b)). ") +
          "WISING leaves " + usd(a22.exemptUsd) + " out of US " + (isNra ? "income." : "wages."),
        recommendation: "Attach Form 8833 (treaty-based return position) and give the payer Form 8233 to stop withholding. The exemption needs the client to " +
          "have been resident in India immediately before arriving, and the pay to be for teaching or research at a university or other recognised educational " +
          "institution; it ends two years after arrival." + (a22.arrivalDate ? "" : " Enter the arrival date on Layer 1 US so WISING can apply the two-year limit."),
        amountUsd: 0, refs: ["DTAA Art. 22", "DTAA Art. 1(4)(b)", "Form 8833", "Form 8233"]
      });
    } else {
      out.push({
        id: "treaty_article_22_teacher", severity: "warning", category: "residency",
        title: "DTAA Art. 22 no longer applies — the two years from arrival ended " + a22.windowEnd,
        detail: "The client claims the India–US treaty's teacher and researcher exemption on " + usd(a22.claimedUsd) + " of pay" + a22Window +
          ", but none of this tax year falls within the two years Art. 22 allows. WISING taxes this pay in full.",
        recommendation: "Remove the Art. 22 claim and any Form 8233 with the payer, and check that the employer withholds US tax from now on.",
        amountUsd: 0, refs: ["DTAA Art. 22"]
      });
    }
  }

  // DTAA Art. 21(1) student / business-apprentice payments from outside the
  // US (treaty-art21.js): applied, blocked for a citizen / green-card
  // holder, or not needed for a non-resident alien.
  var a21 = require("./treaty-art21.js").art21(ctx.us);
  if (a21 && a21.paymentsUsd > 0) {
    out.push(a21.blockedBy ? {
      id: "treaty_article_21_student", severity: "warning", category: "residency",
      title: "DTAA Art. 21(1) student exemption blocked by the saving clause (Art. 1(3))",
      detail: "The client claims the India–US treaty's student and business-apprentice exemption on " + usd(a21.paymentsUsd) + " of payments from " +
        "outside the US, but is a " + (a21.blockedBy === "citizen" ? "US citizen" : "green-card holder") + ". The saving clause's exception for Art. 21 " +
        "(Art. 1(4)(b)) covers only US residents who are neither citizens nor green-card holders. WISING taxes these payments as foreign income.",
      recommendation: "Remove the Art. 21(1) claim; report the payments as foreign income. A foreign tax credit applies to any Indian tax on them.",
      amountUsd: 0, refs: ["DTAA Art. 1(3)", "DTAA Art. 1(4)(b)", "DTAA Art. 21(1)"]
    } : isNra ? {
      id: "treaty_article_21_student", severity: "info", category: "residency",
      title: "DTAA Art. 21(1) not needed: payments from outside the US aren't US income for a non-resident alien",
      detail: "The client claims the student exemption on " + usd(a21.paymentsUsd) + " of payments from outside the US. As a non-resident alien the " +
        "client is taxed only on US-source income, so these payments are outside US tax already, treaty or not.",
      recommendation: "No treaty claim or Form 8833 is needed for them this year. Keep the claim on file: it matters once the client becomes a US " +
        "resident (usually after five calendar years on an F or J visa).",
      amountUsd: 0, refs: ["DTAA Art. 21(1)", "IRC §872(a)"]
    } : {
      id: "treaty_article_21_student", severity: "info", category: "residency",
      title: "DTAA Art. 21(1): " + usd(a21.exemptUsd) + " of student payments from outside the US exempt from US tax",
      detail: "The client claims the India–US treaty's student and business-apprentice exemption on " + usd(a21.paymentsUsd) + " of payments from " +
        "outside the US for maintenance, education or training. As a US resident alien who is neither a citizen nor a green-card holder, the client keeps " +
        "it under the saving clause's exception (DTAA Art. 1(4)(b)). WISING leaves these payments out of US income.",
      recommendation: "Attach Form 8833 (treaty-based return position). The exemption needs the client to have been resident in India immediately " +
        "before arriving and to be in the US solely for education or training; it doesn't cover pay for work done in the US.",
      amountUsd: 0, refs: ["DTAA Art. 21(1)", "DTAA Art. 1(4)(b)", "Form 8833"]
    });
  }

  if (isNra) {
    var rows = n.fdapBreakdown || [];
    var exRow = rows.filter(function (r) { return r.type === "interest_exempt"; })[0];
    var taxedRow = rows.filter(function (r) { return r.type === "interest"; })[0];
    var ui = (ctx.us && ctx.us.income_us_source) || {};
    var directIntUsd = num(ui.interest_us_source_usd);
    var otherIntUsd = num(ui.interest_us_oid_usd) + num(ui.interest_us_private_usd);
    var intRate = taxedRow ? taxedRow.rate : 0.30;
    if (exRow && exRow.baseUsd > 0) {
      out.push({
        id: "nra_us_interest_exempt", severity: "info", category: "income",
        title: usd(exRow.baseUsd) + " of US bank and Treasury interest is exempt for a non-resident alien",
        detail: "Interest on US bank deposits (IRC §871(i)(2)(A)) and portfolio interest — US Treasuries and registered bonds held at a broker " +
          "(§871(h)) — is not taxed for a non-resident alien, so WISING computes no US tax on " + usd(exRow.baseUsd) + " (about " + usd(exRow.baseUsd * intRate) +
          " at the " + Math.round(intRate * 100) + "% it would otherwise carry)." +
          (otherIntUsd > 0 ? " The " + usd(otherIntUsd) + " of private / OID / seller-financed interest is still taxed: it's portfolio interest only if the debt is " +
            "in registered form and the client doesn't own 10% or more of the borrower." : ""),
        recommendation: "Give each bank and broker Form W-8BEN so they don't apply 24% backup withholding; if they did, claim it back on Form 1040-NR. " +
          "Brokerage interest from a company the client owns 10% or more of, or contingent interest, isn't portfolio interest — move it to the private line." +
          (otherIntUsd > 0 ? " Confirm whether the private / OID interest qualifies as portfolio interest." : ""),
        amountUsd: exRow.baseUsd * intRate, refs: ["IRC §871(i)(2)(A)", "IRC §871(h)", "Form W-8BEN", "Form 1040-NR"]
      });
    } else if (directIntUsd > 0 && !nraInterestSplitRecorded(ctx.us)) {
      out.push({
        id: "nra_us_interest_exempt", severity: "warning", category: "income",
        title: "US interest of " + usd(directIntUsd) + " taxed at " + Math.round(intRate * 100) + "% — its type isn't recorded, and bank or Treasury interest would be exempt",
        detail: "A non-resident alien pays no US tax on bank-deposit interest (IRC §871(i)(2)(A)) or portfolio interest such as US Treasuries (§871(h)). " +
          "The US intake has only a total for US interest, not the Banks & Brokerages / Treasuries / Private split, so WISING has taxed all " +
          usd(directIntUsd) + " — up to " + usd(directIntUsd * intRate) + " of US tax that may not be owed.",
        recommendation: "Enter the US interest by type on the US intake (Banks & Brokerages, US Treasuries, Private / OID, Private / Seller Fin.).",
        amountUsd: directIntUsd * intRate, refs: ["IRC §871(i)(2)(A)", "IRC §871(h)", "Form 1040-NR"]
      });
    }
  }

  if (isNra && (n.art15ExemptUsd || 0) > 0) {
    out.push({
      id: "nra_art15_services_exempt", severity: "warning", category: "treaty",
      title: "US self-employment income of " + usd(n.art15ExemptUsd) + " treated as exempt — DTAA Art. 15 (" + n.art15UsDays + " US days, no US fixed base)",
      detail: "An Indian resident's income from professional or other independent services is taxable in the US only if they have a fixed base regularly " +
        "available there or stay 90 days or more in the year (DTAA Art. 15; business profits likewise need a US permanent establishment, Art. 7). " +
        "With " + n.art15UsDays + " US days and no US fixed base / PE on file, WISING has left " + usd(n.art15ExemptUsd) + " of self-employment " +
        "income out of US tax, saving about " + usd(n.art15TaxSavedUsd || 0) + ". India taxes it as the residence country.",
      recommendation: "Confirm there was no office or other fixed place regularly available in the US and that US days are under 90. Claim the exemption " +
        "on Form 1040-NR (Schedule OI) with Form 8833. If either test fails, the income is US-taxable and India gives credit for the US tax (Form 44).",
      amountUsd: n.art15TaxSavedUsd || 0, refs: ["DTAA Art. 15", "DTAA Art. 7", "Form 8833", "Form 1040-NR"]
    });
  }
  return out;
}

NODES.findingsAllResult = {
  deps: baseNodes.findingsAllResult.deps.concat(["usEntityStateTaxResult", "usDualStatusResult", "usExpatriationResult",
    "usEntityKind", "treatyFiles1040nrRaw", "s6013hElection", "usTaxResult",
    "nraDerivedEciFdapResult", "nraEciIncomeUsdRaw", "nraFdapIncomeUsdRaw", "nraRaw", "aggregateUsIncomeResult", "nraSplitDeclaredRaw",
    "residencyResult", "usHasGreenCardRaw", "treatyUsResidenceRaw", "treatyIndiaResidenceRaw"])
    .filter(function (id, i, arr) { return arr.indexOf(id) === i; }),
  compute: function (d, ctx) {
    var all = baseNodes.findingsAllResult.compute(d, ctx).slice();
    var est = d.usEntityStateTaxResult;
    var ds = d.usDualStatusResult;
    if (ds && ds.isDualStatusYear) {
      var periodNote = ds.hasDates
        ? "Resident from " + (ds.residencyStartDate || "the start of the year") + " through " + (ds.residencyEndDate || "year-end") +
          " (" + Math.round(ds.residentFraction * 100) + "% of the year)."
        : "No residency start/end date was on file, so this defaulted to treating the full year as the resident period — enter the actual date for an accurate split.";
      all.push({
        id: "us_dual_status_split_year", severity: "warning", category: "residency",
        title: "Dual-status year — worldwide income taxed only for part of the year, no standard deduction",
        detail: "This is a dual-status year: nonresident (US-source income only) for part of the year, resident (worldwide income) for the rest. " + periodNote +
          " Combined tax across both sub-periods: " + usd(ds.combined.totalTaxBeforeFtcUsd) + ". Per IRS Pub 519, a dual-status alien cannot take the " +
          "standard deduction for either sub-period (itemized only, applied here), and most personal credits (child/dependent care, education credits) are " +
          "only available for the resident-period portion. Layer 1 collects annual income totals, not date-stamped transactions, so each sub-period's income " +
          "is apportioned by day-count against the residency start/end date — the same even-earning assumption already used elsewhere in this engine for " +
          "the India FY/US CY calendar-year split." +
          (ds.passiveUsSourceDuringNrUsd > 0
            ? " Note: " + usd(ds.passiveUsSourceDuringNrUsd) + " of US-source interest/dividends/capital gains falls in the nonresident sub-period and is " +
              "NOT included in the total above — classifying it as FDAP (flat 30%/treaty rate), ECI, or exempt requires trade-or-business/treaty facts this " +
              "engine doesn't collect for this scenario; confirm its treatment with a preparer."
            : ""),
        recommendation: "File a dual-status return (Form 1040 + Form 1040-NR as a statement, or vice versa per Pub 519's ordering rules) reflecting the " +
          "resident/nonresident split above, and confirm the exact residency start/end date and any uncomputed nonresident-period passive US-source income with a preparer.",
        amountUsd: ds.combined.totalTaxBeforeFtcUsd, refs: ["Pub 519", "IRC 7701(b)", "Form 1040-NR"]
      });
    }
    var expat = d.usExpatriationResult;
    if (expat && expat.isLtrExpatriating) {
      if (expat.isCoveredExpatriate) {
        all.push({
          id: "us_covered_expatriate_exit_tax", severity: "critical", category: "residency",
          title: "§877A covered expatriate — mark-to-market exit tax applies",
          detail: "As a Long-Term Resident (green card held " + expat.yearsHeld + " of the last 15 years) who surrendered the green card, this taxpayer " +
            "meets at least one of the three covered-expatriate tests: " + expat.reasonsMet.join("; ") + ". Under §877A, a covered expatriate is treated as " +
            "having sold all worldwide assets for fair market value the day before expatriation, with gain taxed at capital-gains rates after a " +
            usd(expat.exclusionUsd) + " exclusion (2026, Rev. Proc. 2025-32).",
          recommendation: "File Form 8854 and compute the actual mark-to-market gain from a full asset/basis schedule with a preparer — WISING does not " +
            "collect worldwide asset FMV/basis data and cannot compute the actual exit-tax liability here; this finding only confirms covered-expatriate status applies.",
          amountUsd: 0, refs: ["§877A", "Form 8854", "Rev. Proc. 2025-32"]
        });
      } else {
        all.push({
          id: "us_ltr_expatriation_not_covered", severity: "info", category: "residency",
          title: "Long-Term Resident expatriation — not a covered expatriate",
          detail: "This taxpayer held a green card for " + expat.yearsHeld + " of the last 15 years and surrendered it, but none of the three §877A " +
            "covered-expatriate tests appear to be met on the figures entered (net worth, average annual net income tax, Form 8854 certification).",
          recommendation: "Confirm all three figures are accurate and current as of the expatriation date before relying on this — a covered-expatriate " +
            "determination has significant consequences if missed.",
          amountUsd: 0, refs: ["§877A", "Form 8854"]
        });
      }
    }
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
    }

    // US withholding on a non-resident alien's W-2 wages for work done
    // outside the US (aggregateusincome-nodes.js's w2WorkLocation) — the
    // common "India resident on a US company's payroll" case. Those wages
    // aren't US income, so the federal income tax and Social Security /
    // Medicare withheld on them aren't owed. DAG-only (no engine source).
    var w2loc = d.aggregateUsIncomeResult && d.aggregateUsIncomeResult.w2WorkLocation;
    if (w2loc && w2loc.isNra && w2loc.outsideUsWagesUsd > 1 && w2loc.federalWithheldOutsideUsUsd + w2loc.ficaWithheldOutsideUsUsd > 1) {
      var w2WithheldUsd = w2loc.federalWithheldOutsideUsUsd + w2loc.ficaWithheldOutsideUsUsd;
      // Where the split came from — shown under "Before relying on this amount".
      var w2Basis = w2loc.estimated
        ? "- The split is estimated from US days present (" + w2loc.usDays + " ÷ 365) because the W-2's workday fields are blank. Enter the client's actual workdays to confirm it."
        : (w2loc.usDays === 0 ? "- Based on 0 US days this year. If the client did work while in the US, enter the days on the W-2." : null);
      all.push({
        id: "us_withholding_outside_us_wages", severity: "critical", category: "credit",
        title: "US withholding on wages for work outside the US — " + usd(w2WithheldUsd) + " to stop and recover",
        detail: usd(w2loc.outsideUsWagesUsd) + " of W-2 wages were earned for work done outside the US (taken to be India). For a US non-resident alien " +
          "that isn't US income (IRC §862(a)(3)), yet the employer withheld " + usd(w2loc.federalWithheldOutsideUsUsd) + " of federal tax and " +
          usd(w2loc.ficaWithheldOutsideUsUsd) + " of Social Security / Medicare on it. India taxes the same salary and won't credit US tax that wasn't owed, " +
          "so it's taxed twice until recovered.",
        recommendation: ["## Stop the withholding",
          "- Tell the employer's payroll the client is a non-resident alien working outside the US, so this pay isn't US wages for income-tax withholding or Social Security / Medicare.",
          "- If the employer can't run non-US payroll, move the client to an Indian entity or an Employer of Record.",
          "## Recover what's already withheld",
          "- Same calendar year: the employer can correct and repay over-withheld tax through payroll (Form 941-X for Social Security / Medicare).",
          "- Federal income tax: file Form 1040-NR showing the wages as foreign-source (an ITIN is needed if the client has no SSN).",
          "- Social Security / Medicare: claim it from the employer, or from the IRS on Form 843 with the employer's statement if the employer won't repay.",
          "- No treaty claim is needed: the exemption is the US source rule itself."].concat(w2Basis ? ["## Before relying on this amount", w2Basis] : []).join("\n"),
        amountUsd: w2WithheldUsd, refs: ["IRC §862(a)(3)", "Form 1040-NR", "Form 843", "Form 941-X"]
      });
    }

    // DAG-only additions (no JS-source equivalent to port FROM — these were
    // built Python-first by a concurrent session; ported back here to
    // restore JS/Python parity, task #43 follow-up). Deliberately kept OUT
    // of any frozen finding-ID inventory list, same precedent as
    // retirement_excess_elective_deferral etc.
    var isNra = d.usEntityKind !== "ccorp" && d.usEntityKind !== "scorp" && d.usEntityKind !== "partnership" && d.usEntityKind !== "trust" &&
      d.treatyFiles1040nrRaw && !d.s6013hElection;
    if (isNra) {
      // NRA ECI/FDAP classification cross-check: layer1_us.html's own
      // client-side derivation (updateNraFields()) -- what
      // nraEciIncomeUsdRaw/nraFdapIncomeUsdRaw actually carry into the tax
      // computed above -- only sums W-2 wages + self-employment for ECI and
      // direct interest/dividends/rental for FDAP. Re-derived here from the
      // fuller aggregateUsIncomeResult (K-1 passthrough, C-corp business
      // income, direct-source royalties) purely as a sanity check; does NOT
      // change the tax already computed.
      var derived = d.nraDerivedEciFdapResult;
      var declaredEciUsd = d.nraEciIncomeUsdRaw || 0, declaredFdapUsd = d.nraFdapIncomeUsdRaw || 0;
      var declaredTotalUsd = declaredEciUsd + declaredFdapUsd;
      var deltaUsd = derived.derivedTotalUsd - declaredTotalUsd;
      var materialityUsd = Math.max(100, 0.01 * derived.derivedTotalUsd);
      // Only when Layer 1 saved a split: without one the tax above already uses the re-derivation.
      if (d.nraSplitDeclaredRaw && Math.abs(deltaUsd) > materialityUsd) {
        var eciDeltaUsd = derived.derivedEciUsd - declaredEciUsd;
        var fdapDeltaUsd = derived.derivedFdapUsd - declaredFdapUsd;
        all.push({
          id: "nra_eci_fdap_classification_check", severity: "warning", category: "credit",
          title: "NRA ECI/FDAP split may be incomplete — " + usd(Math.abs(deltaUsd)) + (deltaUsd > 0 ? " not yet classified" : " over-counted") + " vs. a full income re-derivation",
          detail: "Layer 1's own ECI/FDAP classification totals " + usd(declaredTotalUsd) + " (" + usd(declaredEciUsd) + " ECI + " + usd(declaredFdapUsd) + " FDAP), computed there " +
            "from W-2 wages + self-employment (ECI) and direct interest/dividends/rental (FDAP) only. Re-deriving from the fuller income aggregation used elsewhere in " +
            "this engine (which additionally folds in K-1 partnership/S-corp/trust passthrough income, C-corp business income, and direct-source royalties) gives " +
            usd(derived.derivedTotalUsd) + " (" + usd(derived.derivedEciUsd) + " ECI + " + usd(derived.derivedFdapUsd) + " FDAP) — a difference of " + usd(eciDeltaUsd) +
            " in ECI and " + usd(fdapDeltaUsd) + " in FDAP. The tax computed above still uses Layer 1's own figures, not this re-derivation.",
          recommendation: "Reconcile the two totals with a preparer before relying on the NRA tax computed above — check especially for K-1s, C-corp/partnership income, or " +
            "direct-source royalties that Layer 1's own ECI/FDAP screen may not be picking up.",
          amountUsd: Math.abs(deltaUsd), refs: ["Form 1040-NR", "Schedule NEC", "FDAP", "ECI"]
        });
      }

      // India-US DTAA FDAP treaty-rate sanity check against
      // constants.js's INDIA_US_TREATY_FDAP_RATES. Field is elected_rate,
      // not rate — see findings-batch4-nodes.js's nraFdapDetail comment.
      (d.nraRaw.treatyRateClaims || []).forEach(function (treatyClaim) {
        if (!treatyClaim || treatyClaim.elected_rate == null) return;
        var incomeType = treatyClaim.income_type;
        var tableEntry = incomeType ? T.INDIA_US_TREATY_FDAP_RATES[incomeType] : null;
        if (!tableEntry) return;
        var claimedRateFrac = Math.max(0, Math.min(1, Number(treatyClaim.elected_rate) / 100));
        if (tableEntry.rates.some(function (r) { return Math.abs(claimedRateFrac - r) <= T.TREATY_RATE_TOLERANCE; })) return;
        var validRatesPct = tableEntry.rates.map(function (r) { return Math.round(r * 100) + "%"; }).join(" / ");
        all.push({
          id: "treaty_rate_not_recognized", severity: "warning", category: "treaty",
          title: "Claimed treaty rate (" + Math.round(claimedRateFrac * 100) + "%) doesn't match a recognized India-US DTAA rate for " + incomeType,
          detail: "A " + Math.round(claimedRateFrac * 100) + "% rate is claimed for " + incomeType + " income, but " + tableEntry.article + " of the India-US DTAA only provides for " +
            validRatesPct + " (" + tableEntry.note + "). This doesn't automatically mean the claim is wrong — it may reflect a sub-category this engine doesn't " +
            "distinguish — but a rate outside the treaty's own range will not be honored by the IRS as claimed.",
          recommendation: "Confirm the " + incomeType + " claim against " + tableEntry.article + " of the treaty (and the current IRS Publication 901) with a preparer before relying " +
            "on the FDAP tax computed above.",
          amountUsd: 0, refs: [tableEntry.article, "Form W-8BEN", "Pub. 901"]
        });
      });

      // DTAA Art. 21(2) — Indian student/business-apprentice standard
      // deduction, computed in NODES.nraTaxResult above.
      var nraDetail = (d.usTaxResult && d.usTaxResult.nra) || {};
      if (nraDetail.article212Eligible) {
        var usesStandard = nraDetail.standardDeductionUsd >= nraDetail.itemizedDeductionUsd;
        var benefitUsd = Math.max(0, nraDetail.standardDeductionUsd - nraDetail.itemizedDeductionUsd);
        all.push({
          id: "nra_article_21_2_standard_deduction", severity: "info", category: "credit",
          title: "Art. 21(2) applied — " + (usesStandard ? "standard" : "itemized") + " deduction used on ECI",
          detail: "As an Indian student/business apprentice on an F-1 visa, Article 21(2) of the India-US DTAA lets this taxpayer use the same deductions a US " +
            "resident could — including the " + usd(nraDetail.standardDeductionUsd) + " standard deduction — instead of the itemized-only rule that otherwise " +
            "applies to NRAs. Itemized deductions here total " + usd(nraDetail.itemizedDeductionUsd) + ", so the " +
            (usesStandard ? "standard deduction was used" : "itemized deductions were used since they exceed the standard deduction") +
            (benefitUsd > 0 ? ", saving " + usd(benefitUsd) + " of ECI from tax versus the itemized-only default." : "."),
          recommendation: "File Form 8833 to disclose the treaty-based return position (Article 21(2)) alongside Form 1040-NR.",
          amountUsd: benefitUsd, refs: ["Art. 21(2)", "Form 8833", "Form 1040-NR"]
        });
      } else if (nraDetail.article212AmbiguousJ1) {
        all.push({
          id: "nra_j1_article_21_2_review", severity: "info", category: "credit",
          title: "J-1 visa on file — confirm whether Art. 21(2)'s standard-deduction treaty benefit applies",
          detail: "This taxpayer's visa is recorded as J-1, which covers several sub-categories (students, business apprentices, trainees, scholars, professors, " +
            "and research scholars). Article 21(2) of the India-US DTAA — which allows the standard deduction instead of the usual NRA itemized-only rule — " +
            "applies only to students and business apprentices, not to scholars/professors/researchers (who fall under Article 22 instead, a different, " +
            "time-limited exemption). This engine has not assumed eligibility and has computed tax on an itemized-only basis.",
          recommendation: "Confirm the specific J-1 sub-category with the taxpayer; if student or business apprentice, Article 21(2) may allow the standard deduction " +
            "(Form 8833 disclosure required) and could reduce the ECI tax computed above.",
          amountUsd: 0, refs: ["Art. 21(2)", "Art. 22", "Form 8833"]
        });
      }
    }

    Array.prototype.push.apply(all, treatyFindings(d, ctx, isNra));

    var weight = { critical: 0, warning: 1, info: 2 };
    all.sort(function (a, b) {
      if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
      return b.amountUsd - a.amountUsd;
    });
    return all;
  }
};

/* ---- TAX-8: computeNraTax ---------------------------------------------------
 * US-India DTAA Art. 21(2): a student or business apprentice who is (or
 * immediately before visiting the US was) a resident of India may compute US
 * tax using the same deductions available to a US citizen/resident,
 * including the standard deduction -- the one carve-out from the general
 * "NRAs get itemized deductions only" rule (IRC 873(b)). layer1_us.html's
 * "US Visa / Immigration Status" field (#prof-visa-type) distinguishes F-1
 * (unambiguously "Student") from J-1 ("Exchange Visitor", which also covers
 * scholars/professors/researchers/trainees under Article 22, NOT eligible
 * under Article 21(2)) -- so only F-1 is auto-applied; J-1 is surfaced as a
 * finding for the preparer to confirm the sub-category rather than guessed.
 * Mirrors dag_py/src/wising_dag/us/ustax_full.py's _nra_tax_result exactly. */
var ARTICLE_21_2_AUTO_VISA = "f1";
var ARTICLE_21_2_AMBIGUOUS_VISA = "j1";

// The ECI/FDAP split an NRA is taxed on. Layer 1 US saves its own split
// (nra_specific.us_eci_income_usd / us_fdap_income_usd); when neither was
// saved (data that never went through that screen) a missing split used to
// mean $0 of income and $0 of tax. Then the engine's own re-derivation is
// used instead, with US rent moved to ECI under a §871(d) net-basis election,
// as the form does.
NODES.nraSplitDeclaredRaw = {
  deps: [],
  compute: function (d, ctx) {
    var e = safe(ctx.us, "nra_specific.us_eci_income_usd", null), f = safe(ctx.us, "nra_specific.us_fdap_income_usd", null);
    return (e !== null && e !== "") || (f !== null && f !== "");
  }
};
NODES.nraEffectiveEciFdap = {
  deps: ["nraSplitDeclaredRaw", "nraRaw", "nraDerivedEciFdapResult", "aggregateUsIncomeResult"],
  compute: function (d, ctx) {
    if (d.nraSplitDeclaredRaw) return { eciUsd: d.nraRaw.eciIncomeUsd || 0, fdapUsd: d.nraRaw.fdapIncomeUsd || 0, source: "layer1" };
    var dv = d.nraDerivedEciFdapResult;
    var rental = safe(ctx.us, "nra_specific.rental_net_basis_election", false) === true ? num(d.aggregateUsIncomeResult.rentalUs.usd) : 0;
    return { eciUsd: dv.derivedEciUsd + rental, fdapUsd: dv.derivedFdapUsd - rental, source: "derived" };
  }
};

// §72(t) on a 1040-NR: the 10% on early distributions the US taxes — a
// periodic payment the treaty leaves to India (DTAA Art. 20) carries none;
// a broken SEPP's recapture is added (retirement-dist.js additionalTax72tUsd).
NODES.nraAdditionalTax72tUsd = {
  deps: ["taxpayerDobRaw", "baseYearUs"],
  compute: function (d, ctx) { return require("./retirement-dist.js").additionalTax72tUsd(ctx.us, ctx.india, d.taxpayerDobRaw, d.baseYearUs || 2026); }
};

NODES.nraTaxResult = {
  deps: ["nraRaw", "usFilingStatusRaw", "dedUs", "additionalMedicareOwedBoundary", "usVisaTypeRaw", "nraEffectiveEciFdap", "aggregateUsIncomeResult", "royaltiesDirectUsSourceUsdRaw", "nraAdditionalTax72tUsd"],
  compute: function (d, ctx) {
    var nra = d.nraRaw;
    var split = d.nraEffectiveEciFdap;
    // A married NRA files 1040-NR at married-filing-separately rates (joint
    // rates need a §6013(g)/(h) election, which routes to the resident
    // computation instead); anyone else uses single rates.
    var status = d.usFilingStatusRaw === "mfj" || d.usFilingStatusRaw === "mfs" ? "mfs" : "single";
    var brackets = T.BRACKETS[status] || T.BRACKETS.single;
    var ded = d.dedUs;

    var eciUsd = split.eciUsd || 0;
    var fdapUsd = split.fdapUsd || 0;
    // India-US treaty benefits need Indian residence: withheld only when
    // Layer 1 India records the client as a non-resident of India.
    var treatyResident = safe(ctx.india, "residency_detail.final_india_residency_status", null) !== "NR";
    // DTAA Art. 15 (independent personal services) / Art. 7 (business
    // profits): an Indian resident's self-employment income is exempt from
    // US tax with no fixed base / PE in the US and fewer than 90 US days in
    // the year (the Art. 5(2)(l) service-PE threshold too).
    var usDaysArt15 = num(safe(ctx.us, "us_residency_detail.us_days_current_year", 0));
    var seUsd = num(d.aggregateUsIncomeResult && d.aggregateUsIncomeResult.seEarningsUsd);
    var art15ExemptUsd = treatyResident && safe(ctx.us, "nra_specific.has_us_pe", false) !== true && usDaysArt15 < 90 && seUsd > 0
      ? Math.min(seUsd, eciUsd) : 0;
    var eciBeforeArt15Usd = eciUsd;
    eciUsd -= art15ExemptUsd;
    // DTAA Art. 22 teaching / research pay: already out of the wages when the
    // ECI was derived from them; taken out here when Layer 1 typed the ECI.
    var art22Nra = require("./treaty-art22.js").art22(ctx.us, require("./treaty-art22.js").baseYearOf(ctx.router, ctx.us));
    if (art22Nra && split.source === "layer1") eciUsd -= Math.min(Math.max(0, eciUsd), art22Nra.exemptUsd);
    var claim = (nra.treatyRateClaims || [])[0];
    var claimedRate = (claim && claim.elected_rate != null) ? Math.max(0, Math.min(1, Number(claim.elected_rate) / 100)) : null;
    var w8benOnFile = nra.submittedW8ben === true;
    var fdapDetail = nraFdapBreakdown(fdapUsd, d.aggregateUsIncomeResult, d.royaltiesDirectUsSourceUsdRaw, safe(ctx.us, "nra_specific.rental_net_basis_election", false) === true, nra.treatyRateClaims, w8benOnFile, treatyResident, nraExemptInterestUsd(ctx.us));
    var fdapRate = fdapDetail.effectiveRate != null ? fdapDetail.effectiveRate : ((w8benOnFile && claimedRate != null) ? claimedRate : 0.30);

    var itemizedUsd = Math.min(ded.salt, computeSaltCap(eciUsd, status)) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * eciUsd);
    var visaType = d.usVisaTypeRaw;
    var article212Eligible = visaType === ARTICLE_21_2_AUTO_VISA;
    var article212AmbiguousJ1 = visaType === ARTICLE_21_2_AMBIGUOUS_VISA;
    var stdDeductionUsd = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
    var deductionUsd, deductionMode;
    if (article212Eligible) {
      deductionUsd = Math.max(itemizedUsd, stdDeductionUsd);
      deductionMode = deductionUsd === stdDeductionUsd
        ? "standard (Art. 21(2) — Indian student/business apprentice, " + usd(stdDeductionUsd) + ")"
        : "itemized (Art. 21(2) — Indian student/business apprentice; itemized exceeds the standard deduction)";
    } else {
      deductionUsd = itemizedUsd;
      deductionMode = "itemized (NRA — no standard deduction)";
    }

    var taxableEciUsd = Math.max(0, eciUsd - deductionUsd);
    var eciTaxUsd = bracketTax(taxableEciUsd, brackets);
    var eciBracketBreakdown = bracketBreakdown(taxableEciUsd, brackets);
    var fdapTaxUsd = fdapDetail.fdapTaxUsd;
    var addlMedicare = d.additionalMedicareOwedBoundary || 0;
    var art15TaxSavedUsd = art15ExemptUsd > 0
      ? bracketTax(Math.max(0, eciBeforeArt15Usd - deductionUsd), brackets) - eciTaxUsd : 0;
    var add72tUsd = d.nraAdditionalTax72tUsd || 0;
    var totalTax = eciTaxUsd + fdapTaxUsd + fdapDetail.socialSecurityTaxUsd + fdapDetail.pensionTaxUsd + addlMedicare + add72tUsd;
    var nraIncomeUsd = eciUsd + fdapUsd + fdapDetail.socialSecurityTaxableUsd + fdapDetail.pensionTaxableUsd;

    return Object.assign(add72tUsd > 0 ? { additionalTax72tUsd: add72tUsd } : {}, {
      filingStatus: status, worldwide: false, isNra: true,
      totalIncomeUsd: nraIncomeUsd,
      agiUsd: eciUsd, deductionUsd: deductionUsd, deductionMode: deductionMode,
      taxableIncomeUsd: taxableEciUsd,
      ordinaryTaxUsd: eciTaxUsd, preferentialTaxUsd: 0, incomeTaxUsd: eciTaxUsd + fdapTaxUsd + fdapDetail.socialSecurityTaxUsd + fdapDetail.pensionTaxUsd,
      niitUsd: 0, additionalMedicareUsd: addlMedicare, seTaxUsd: 0, qbiDeductionUsd: 0, amtUsd: 0, creditsUsd: 0,
        collectiblesGainUsd: 0, collectiblesTaxUsd: 0, qsbsExcludedGainUsd: 0, qsbsTaxableGainUsd: 0,
        saversCreditUsd: 0,
      totalTaxBeforeFtcUsd: totalTax,
      foreignSourceIncomeUsd: 0,
      usSourceIncomeUsd: nraIncomeUsd,
      nra: { fdapBreakdown: fdapDetail.rows, socialSecurityTaxableUsd: fdapDetail.socialSecurityTaxableUsd, socialSecurityTaxUsd: fdapDetail.socialSecurityTaxUsd,
        pensionTreatyExemptUsd: fdapDetail.pensionUsd, pensionTaxUsd: fdapDetail.pensionTaxUsd, treatyResident: treatyResident,
        art15ExemptUsd: art15ExemptUsd, art15TaxSavedUsd: art15TaxSavedUsd, art15UsDays: usDaysArt15,
        eciUsd: eciUsd, fdapUsd: fdapUsd, splitSource: split.source, fdapRate: fdapRate, eciTaxUsd: eciTaxUsd, fdapTaxUsd: fdapTaxUsd, taxableEciUsd: taxableEciUsd, eciBracketBreakdown: eciBracketBreakdown,
        claimedRate: claimedRate, w8benOnFile: w8benOnFile, incomeType: (claim && claim.income_type) || null,
        itemizedDeductionUsd: itemizedUsd, standardDeductionUsd: stdDeductionUsd,
        article212Eligible: article212Eligible, article212AmbiguousJ1: article212AmbiguousJ1, visaType: visaType },
      feie: { claimed: false, eligible: false, taxHomeAbroad: false, testMet: false, reasons: [], appliedUsd: 0 },
      effectiveRate: nraIncomeUsd > 0 ? totalTax / nraIncomeUsd : 0
    });
  }
};

/* ---- XB-25: dual-status split-year computation ----------------------------
 * layer1_us.html's evaluateUSResidencyLock() (fixed alongside this build —
 * see the Step 2 field-completeness audit) now correctly derives
 * final_us_residency_status = "DUAL_STATUS" plus a real residency_start_date/
 * residency_end_date for all three real-world triggers: a green-card grant
 * mid-year, a First-Year-Choice election (§7701(b)(4)), and a plain
 * SPT-based arrival/departure (the most common case — any new arrival who
 * meets the SPT purely from this year's physical presence has a residency
 * starting date of their FIRST day of presence, not Jan 1, per IRC
 * 7701(b)(2)(A)). Previously the DAG only ever produced a full-year status;
 * "DUAL_STATUS" fell through to whatever usIsCitizenRaw/usHasGreenCardRaw/
 * usSptMetRaw happened to say, silently treating a move-year filer as either
 * a full-year resident (over-inclusive) or full-year nonresident
 * (under-inclusive) — the exact gap GAP_TRACKER.md tracks as XB-25.
 *
 * Methodology (disclosed in the finding text, not silently assumed): Layer 1
 * collects ANNUAL income totals, not date-stamped transactions, so the two
 * sub-periods' income is apportioned by day-count against the residency
 * start/end date — the same "even-earning assumption" already used
 * elsewhere in this engine for the India FY/US CY calendar-year split.
 *
 * Resident-period sub-computation: ALL income (US + foreign), scaled by the
 * resident-day fraction, taxed via computeUsTaxCore with worldwide=true and
 * deduction mode forced to itemized (Pub 519: a dual-status alien cannot
 * take the standard deduction). Personal credits (dependents, child/dep
 * care, education) apply in FULL here, not pro-rated — real-law eligibility
 * for these is status-based, not a day-count.
 *
 * Nonresident-period sub-computation: only the plainly-ECI-like US-source
 * categories (wages, US self-employment/business, US rental), scaled by the
 * nonresident-day fraction, taxed at graduated rates with itemized-only
 * deductions and personal credits zeroed out (Pub 519: most personal
 * credits aren't available for the NR portion). Passive US-source income
 * during the NR sub-period (interest/dividends/capital gains) is
 * deliberately NOT computed here — correctly classifying it as FDAP
 * (flat 30%/treaty rate) vs. ECI vs. exempt requires facts (trade-or-
 * business connection, treaty claims, the 183-day capital-gains rule) that
 * Layer 1's general income screens don't collect for this scenario — it is
 * surfaced as a disclosed, uncomputed amount instead of a fabricated
 * number, the same judgment already applied to Delaware's franchise tax
 * (GAP_TRACKER.md H.7) and the §877A exit-tax mark-to-market figure below.
 * NIIT is force-zeroed for the NR sub-period (Treas. Reg. 1.1411-2(a)(2)(i):
 * NIIT never applies to a nonresident alien) since computeUsTaxCore has no
 * NRA-awareness flag of its own.
 * ---------------------------------------------------------------------- */
NODES.usResidencyStartDateRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.residency_start_date", null); } };
NODES.usResidencyEndDateRaw = { deps: [], compute: function (d, ctx) { return safe(ctx.us, "us_residency_detail.residency_end_date", null); } };

function usdOf(v) { return (v && typeof v.usd === "number") ? v.usd : 0; }
function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function daysInYear(y) { return isLeapYear(y) ? 366 : 365; }
function daysBetweenInclusiveIso(startIso, endIso) {
  var start = new Date(startIso + "T00:00:00Z"), end = new Date(endIso + "T00:00:00Z");
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
function scaleResidentInc(inc, frac) {
  function s(v) { return { usd: usdOf(v) * frac }; }
  return {
    wages: s(inc.wages), businessUs: s(inc.businessUs), foreignWages: s(inc.foreignWages), foreignSelfEmployment: s(inc.foreignSelfEmployment),
    interestUs: s(inc.interestUs), ordinaryDividendsUs: s(inc.ordinaryDividendsUs), qualifiedDividendsUs: s(inc.qualifiedDividendsUs),
    stcgUs: s(inc.stcgUs), ltcgUs: s(inc.ltcgUs), capitalGainsUs: s(inc.capitalGainsUs), rentalUs: s(inc.rentalUs),
    foreignInterest: s(inc.foreignInterest), foreignDividends: s(inc.foreignDividends), foreignRental: s(inc.foreignRental),
    foreignPension: s(inc.foreignPension), foreignStcg: s(inc.foreignStcg), foreignLtcg: s(inc.foreignLtcg),
    foreignSection988GainLoss: s(inc.foreignSection988GainLoss), foreignOtherIncome: s(inc.foreignOtherIncome),
    usRetirementIncome: s(inc.usRetirementIncome), usRetirementIncomeExclSs: s(inc.usRetirementIncomeExclSs),
    socialSecurityUs: s(inc.socialSecurityUs), taxExemptInterestUs: s(inc.taxExemptInterestUs),
    seEarningsUsd: (inc.seEarningsUsd || 0) * frac, seEarningsFromIndiaUsd: (inc.seEarningsFromIndiaUsd || 0) * frac,
    medicareWages: (inc.medicareWages || 0) * frac,
    qualifiedTipsUsd: (inc.qualifiedTipsUsd || 0) * frac, qualifiedOvertimeUsd: (inc.qualifiedOvertimeUsd || 0) * frac,
    qbiIncomeUsd: (inc.qbiIncomeUsd || 0) * frac, qbiIsSSTB: inc.qbiIsSSTB,
    qbiWagesUsd: (inc.qbiWagesUsd || 0) * frac, qbiUbiaUsd: (inc.qbiUbiaUsd || 0) * frac,
    collectiblesLtcgUsd: (inc.collectiblesLtcgUsd || 0) * frac,
    qsbsExcludedGainUsd: (inc.qsbsExcludedGainUsd || 0) * frac, qsbsTaxableGainUsd: (inc.qsbsTaxableGainUsd || 0) * frac,
    retirementEpfInterestUsd: (inc.retirementEpfInterestUsd || 0) * frac, retirementNpsWithdrawalUsd: (inc.retirementNpsWithdrawalUsd || 0) * frac,
    usSourceTotal: s(inc.usSourceTotal),
    // Phase 7 (XB-14): the full CFC-year inclusion is applied entirely to
    // the resident sub-period, NOT day-count apportioned like the income
    // items above — a CFC's own tax year is a discrete inclusion event
    // (virtually always closing within the resident period in a real
    // dual-status case), not a continuously-accruing amount. Documented
    // simplification, same disclosure style as passiveUsSourceDuringNrUsd.
    cfcNonElectedInclusionUs: { usd: usdOf(inc.cfcNonElectedInclusionUs) },
    cfcElectedPool: inc.cfcElectedPool || null
  };
}
function scaleNonresidentInc(inc, frac) {
  function s(v) { return { usd: usdOf(v) * frac }; }
  var zero = { usd: 0 };
  var eciUsd = s(inc.wages).usd + s(inc.businessUs).usd + s(inc.rentalUs).usd;
  return {
    wages: s(inc.wages), businessUs: s(inc.businessUs), rentalUs: s(inc.rentalUs),
    foreignWages: zero, foreignSelfEmployment: zero, interestUs: zero, ordinaryDividendsUs: zero, qualifiedDividendsUs: zero,
    stcgUs: zero, ltcgUs: zero, capitalGainsUs: zero, foreignInterest: zero, foreignDividends: zero, foreignRental: zero,
    foreignPension: zero, foreignStcg: zero, foreignLtcg: zero, foreignSection988GainLoss: zero, foreignOtherIncome: zero, usRetirementIncome: zero, usRetirementIncomeExclSs: zero,
    socialSecurityUs: zero, taxExemptInterestUs: zero,
    seEarningsUsd: (inc.seEarningsUsd || 0) * frac, seEarningsFromIndiaUsd: 0, medicareWages: (inc.medicareWages || 0) * frac,
    qualifiedTipsUsd: 0, qualifiedOvertimeUsd: 0, qbiIncomeUsd: 0, qbiIsSSTB: false, qbiWagesUsd: 0, qbiUbiaUsd: 0,
    collectiblesLtcgUsd: 0, qsbsExcludedGainUsd: 0, qsbsTaxableGainUsd: 0,
    retirementEpfInterestUsd: 0, retirementNpsWithdrawalUsd: 0,
    usSourceTotal: { usd: eciUsd },
    cfcNonElectedInclusionUs: zero, cfcElectedPool: null
  };
}
function scaleDedForDualStatus(ded, frac, dropPersonalCredits) {
  return {
    mode: "itemized",
    salt: (ded.salt || 0) * frac, mortgageInterest: (ded.mortgageInterest || 0) * frac, charitable: (ded.charitable || 0) * frac,
    medical: (ded.medical || 0) * frac, studentLoanInterest: (ded.studentLoanInterest || 0) * frac,
    isoAmtPrefUsd: (ded.isoAmtPrefUsd || 0) * frac, amtPrefs: (ded.amtPrefs || 0) * frac,
    careExpenses: dropPersonalCredits ? 0 : ded.careExpenses,
    aotc: dropPersonalCredits ? 0 : ded.aotc, lifetimeLearning: dropPersonalCredits ? 0 : ded.lifetimeLearning,
    dependents: dropPersonalCredits ? 0 : ded.dependents,
    seHealthInsuranceDeductionUsd: (ded.seHealthInsuranceDeductionUsd || 0) * frac,
    seRetirementDeductionUsd: (ded.seRetirementDeductionUsd || 0) * frac
  };
}
var NO_FEIE = { claimed: false, eligible: false, taxHomeAbroad: false, testMet: false, reasons: [], amountClaimedUsd: 0 };

NODES.usDualStatusInfo = {
  deps: ["usStatusRaw", "usResidencyStartDateRaw", "usResidencyEndDateRaw", "baseYearUs"],
  compute: function (d) {
    if (d.usStatusRaw !== "DUAL_STATUS") return { isDualStatusYear: false };
    var year = d.baseYearUs || 2026;
    var startDate = d.usResidencyStartDateRaw, endDate = d.usResidencyEndDateRaw;
    var hasDates = !!(startDate || endDate);
    var totalDays = daysInYear(year);
    var residentDays = totalDays;
    if (hasDates) {
      var effStart = startDate || (year + "-01-01"), effEnd = endDate || (year + "-12-31");
      residentDays = Math.max(0, Math.min(totalDays, daysBetweenInclusiveIso(effStart, effEnd)));
    }
    var residentFraction = totalDays > 0 ? residentDays / totalDays : 1;
    return {
      isDualStatusYear: true, hasDates: hasDates, residencyStartDate: startDate, residencyEndDate: endDate,
      residentDays: residentDays, totalDaysInYear: totalDays,
      residentFraction: residentFraction, nonresidentFraction: 1 - residentFraction
    };
  }
};

NODES.usDualStatusResult = {
  deps: ["usDualStatusInfo", "incUs", "dedUs", "usFilingStatusRaw", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs",
    "electiveDeferralAggregateUsd", "iraContributionAggregateUsd"],
  compute: function (d) {
    var info = d.usDualStatusInfo;
    if (!info.isDualStatusYear) return null;
    var frac = info.residentFraction, nrFrac = info.nonresidentFraction;
    // Saver's Credit (§25B) is a personal, nonrefundable credit — same
    // resident-period-only treatment as careExpenses/aotc/lifetimeLearning/
    // dependents just above (scaleDedForDualStatus's dropPersonalCredits).
    // Full-year contribution amount applied entirely to the resident
    // sub-period call, 0 to the nonresident one — this was previously
    // omitted from BOTH computeUsTaxCore calls entirely (neither passed a
    // 9th argument at all), which silently dropped the Saver's Credit to
    // $0 for every dual-status-year filer regardless of real contributions.
    var saversCreditContributionUsd = d.electiveDeferralAggregateUsd + d.iraContributionAggregateUsd;

    var rp = computeUsTaxCore(
      scaleResidentInc(d.incUs, frac), scaleDedForDualStatus(d.dedUs, frac, false),
      d.usFilingStatusRaw, true, d.feie, d.additionalMedicareOwedBoundary, d.taxpayerDobRaw, d.baseYearUs, saversCreditContributionUsd
    );
    var nrRaw = computeUsTaxCore(
      scaleNonresidentInc(d.incUs, nrFrac), scaleDedForDualStatus(d.dedUs, nrFrac, true),
      d.usFilingStatusRaw, false, NO_FEIE, 0, d.taxpayerDobRaw, d.baseYearUs, 0
    );
    var nr = Object.assign({}, nrRaw, { niitUsd: 0, totalTaxBeforeFtcUsd: nrRaw.totalTaxBeforeFtcUsd - nrRaw.niitUsd });

    var passiveUsSourceDuringNrUsd = (usdOf(d.incUs.interestUs) + usdOf(d.incUs.ordinaryDividendsUs) + usdOf(d.incUs.capitalGainsUs)) * nrFrac;

    var combined = {
      agiUsd: rp.agiUsd + nr.agiUsd, taxableIncomeUsd: rp.taxableIncomeUsd + nr.taxableIncomeUsd,
      incomeTaxUsd: rp.incomeTaxUsd + nr.incomeTaxUsd, niitUsd: rp.niitUsd + nr.niitUsd,
      additionalMedicareUsd: rp.additionalMedicareUsd + nr.additionalMedicareUsd, seTaxUsd: rp.seTaxUsd + nr.seTaxUsd,
      qbiDeductionUsd: rp.qbiDeductionUsd + nr.qbiDeductionUsd, amtUsd: rp.amtUsd + nr.amtUsd,
      creditsUsd: rp.creditsUsd + nr.creditsUsd, totalTaxBeforeFtcUsd: rp.totalTaxBeforeFtcUsd + nr.totalTaxBeforeFtcUsd,
      deductionUsd: rp.deductionUsd + nr.deductionUsd, deductionMode: "itemized (dual-status — standard deduction not allowed)",
      totalIncomeUsd: rp.totalIncomeUsd + nr.totalIncomeUsd, usSourceIncomeUsd: rp.usSourceIncomeUsd + nr.usSourceIncomeUsd,
      feieAppliedUsd: rp.feieAppliedUsd, worldwide: true,
      ordinaryTaxUsd: rp.ordinaryTaxUsd + nr.ordinaryTaxUsd, preferentialTaxUsd: rp.preferentialTaxUsd + nr.preferentialTaxUsd,
      filingStatus: rp.filingStatus, ordinaryIncomeUsd: rp.ordinaryIncomeUsd + nr.ordinaryIncomeUsd,
      preferentialIncomeUsd: rp.preferentialIncomeUsd + nr.preferentialIncomeUsd, saltCapUsd: rp.saltCapUsd,
      socialSecurityDetail: rp.socialSecurityDetail,
      seniorDeductionUsd: rp.seniorDeductionUsd, seniorDetail: rp.seniorDetail,
      tipsDeductionUsd: rp.tipsDeductionUsd, overtimeDeductionUsd: rp.overtimeDeductionUsd, tipsOvertimeDetail: rp.tipsOvertimeDetail,
      ordinaryTaxableUsd: rp.ordinaryTaxableUsd + nr.ordinaryTaxableUsd, ordinaryBracketBreakdown: rp.ordinaryBracketBreakdown,
      amtDetail: rp.amtDetail, otherCreditsUsd: rp.otherCreditsUsd + nr.otherCreditsUsd, ctcDetail: rp.ctcDetail,
      // Saver's Credit is resident-period-only (see the dropPersonalCredits
      // comment above) — nr.saversCreditUsd is always 0, so the sum is just
      // rp's own figure, kept as an explicit sum for the same reason
      // otherCreditsUsd above is a sum rather than a bare rp reference.
      saversCreditUsd: (rp.saversCreditUsd || 0) + (nr.saversCreditUsd || 0), saversCreditDetail: rp.saversCreditDetail,
      foreignSourceIncomeUsd: rp.foreignSourceIncomeUsd,
      retirementEpfInterestUsd: rp.retirementEpfInterestUsd, retirementNpsWithdrawalUsd: rp.retirementNpsWithdrawalUsd,
      niitDetail: rp.niitDetail, feie: rp.feie,
      effectiveRate: (rp.totalIncomeUsd + nr.totalIncomeUsd) > 0 ? (rp.totalTaxBeforeFtcUsd + nr.totalTaxBeforeFtcUsd) / (rp.totalIncomeUsd + nr.totalIncomeUsd) : 0
    };

    return {
      isDualStatusYear: true, residentFraction: frac, nonresidentFraction: nrFrac,
      residencyStartDate: info.residencyStartDate, residencyEndDate: info.residencyEndDate, hasDates: info.hasDates,
      residentPeriod: rp, nonresidentPeriod: nr, passiveUsSourceDuringNrUsd: passiveUsSourceDuringNrUsd,
      combined: combined
    };
  }
};

/* ---- the routing, exactly where the engine's lives ------------------------ */
NODES.usTaxIndividualResult = baseNodes.usTaxResult;
NODES.usTaxResult = {
  deps: ["usEntityKind", "files1040nr", "s6013hElection", "usEntityTaxResult", "nraTaxResult", "usTaxIndividualResult", "usDualStatusResult"],
  compute: function (d) {
    var ek = d.usEntityKind;
    if (ek === "ccorp" || ek === "scorp" || ek === "partnership" || ek === "trust") return d.usEntityTaxResult;
    if (d.files1040nr && !d.s6013hElection) return d.nraTaxResult;
    if (d.usDualStatusResult && d.usDualStatusResult.isDualStatusYear) {
      return Object.assign({}, d.usDualStatusResult.combined, { dualStatusDetail: d.usDualStatusResult });
    }
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

"use strict";
/* ============================================================================
 * Closes LIM-2/4/5 by porting computeLimits (computation.js L1449-1512) IN
 * FULL — all six gauges as one limitsResult node producing the exact array
 * computed.limits carries: same conditional pushes, same order (fbar,
 * form8938, lrs, nro_repatriation, feie, trump_account), same {id, label,
 * value, limit, pct, status, unit, note} shape, labels and notes
 * byte-for-byte (they render directly on the Monitor's gauge cards).
 *
 * Extends report-batch6-nodes.js (the top of the chain) so it reuses the
 * already-verified pieces instead of re-deriving them:
 *   - aggregatePeakUsdResult (batch5's AGG-5 port) for fbar/form8938 value
 *   - limitsRawExtra (batch5) for lrs + trump raw fields
 *   - hasUsScopeBoundaryFtc / hasIndiaScopeXbr for the scope gates
 *   - usFilingStatusRaw (ustax-nodes) for the 8938 MFJ split — identical
 *     normalization to normalize.js's normalizeFilingStatus, verified by
 *     side-by-side read before reuse
 *
 * NEW here (the three previously-unbuilt gauges' own inputs):
 *   - form8938: the 4-way status × residence threshold table (constants.js
 *     LIMITS.FORM_8938, copied exact) and the §911-facts "abroad" test —
 *     which needs feieEligibility WITH its reasons array (the engine's
 *     ustax-side port dropped `reasons` because computeUsTax never reads
 *     it; the feie gauge's note text does, so it's ported here in full,
 *     line-for-line from computation.js L758-785).
 *   - nro_repatriation: cumulative_repatriated_usd_this_fy raw read
 *     (normalize.js limitsRaw — deliberately top-level off india, not the
 *     quarterly slice, matching the engine's own comment).
 *   - feie: feieAmountUsd/foreignEarnedIncomeUsd raw reads + the
 *     eligible/claimed three-way note.
 * ==========================================================================*/
var baseNodes = require("./report-batch6-nodes.js").NODES;

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function safe(obj, path, dflt) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
var INR_PER_USD = require("../../engine/constants.js").CONST.FX.INR_PER_USD; // SYS-1: shared

// SYS-1 closed 19 Jul 2026: the L table below was a verified-identical
// copy of CONST.LIMITS — now the same object, imported.
var L = require("../../engine/constants.js").CONST.LIMITS;

// computation.js L758-785, verbatim — including the reasons array the
// ustax-nodes copy drops (the feie gauge note is built from it).
function feieEligibilityFull(f) {
  f = f || {};
  var claimed = !!f.claimed || (f.amountClaimedUsd || 0) > 0;
  var home = String(f.taxHomeCountry || "").trim().toLowerCase();
  var taxHomeAbroad = home !== "" && home !== "us" && home !== "usa" &&
                      home !== "united states" && home !== "united states of america";
  var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
  var ppMet = !!f.physicalPresence && ppDaysOk;
  var bfMet = !!f.bonaFide;
  var reasons = [];
  if (claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
  if (claimed && !bfMet && !ppMet) {
    reasons.push(!f.physicalPresence && !f.bonaFide
      ? "neither the bona-fide-residence nor the physical-presence test is met"
      : (f.physicalPresence && !ppDaysOk
        ? (f.daysInUsTestPeriod + " US days in the test period — over the ~35-day allowance (330 full days abroad required)")
        : "bona-fide-residence test not met"));
  }
  return {
    claimed: claimed,
    amountClaimedUsd: f.amountClaimedUsd || 0,
    taxHomeAbroad: taxHomeAbroad,
    testMet: bfMet || ppMet,
    eligible: taxHomeAbroad && (bfMet || ppMet),
    reasons: reasons
  };
}

var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

// model.feie mirror (normalize.js L2741-2749), raw:
NODES.feieLimitsRaw = {
  deps: [],
  compute: function (d, ctx) {
    var us = ctx.us;
    return {
      claimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
      amountClaimedUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
      foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
      taxHomeCountry: safe(us, "foreign_earned_income.tax_home_country", ""),
      bonaFide: safe(us, "foreign_earned_income.bona_fide_residence", false) === true,
      physicalPresence: safe(us, "foreign_earned_income.physical_presence", false) === true,
      daysInUsTestPeriod: num(safe(us, "foreign_earned_income.days_in_us_during_test_period", 0))
    };
  }
};
// normalize.js limitsRaw.nroCumulativeRepatriatedUsd — top-level off india
// by design (the engine's own comment: does NOT flow through the quarterly
// merge), so this raw read mirrors it exactly:
NODES.nroCumulativeRepatriatedUsdRaw = {
  deps: [],
  compute: function (d, ctx) { return num(safe(ctx.india, "nro_repatriation.cumulative_repatriated_usd_this_fy", 0)); }
};

NODES.limitsResult = {
  deps: ["hasUsScopeBoundaryFtc", "hasIndiaScopeXbr", "aggregatePeakUsdResult", "usFilingStatusRaw",
    "feieLimitsRaw", "limitsRawExtra", "nroCumulativeRepatriatedUsdRaw"],
  compute: function (d) {
    var gauges = [];
    function gauge(id, label, valueUsd, limitUsd, unit, note) {
      var pct = limitUsd > 0 ? (valueUsd / limitUsd) : 0;
      var status = pct >= 1 ? "breached" : (pct >= 0.8 ? "approaching" : "ok");
      gauges.push({ id: id, label: label, value: valueUsd, limit: limitUsd, pct: pct, status: status, unit: unit || "USD", note: note || "" });
    }
    var scopeHasUs = d.hasUsScopeBoundaryFtc;
    var scopeHasIndia = d.hasIndiaScopeXbr;
    var aggregatePeakUsd = d.aggregatePeakUsdResult.usd;

    if (scopeHasUs) {
      gauge("fbar", "FBAR (FinCEN 114) aggregate", aggregatePeakUsd, L.FBAR_AGGREGATE_USD, "USD",
        "Threshold is a cliff: any breach = full reporting of every foreign account.");
    }
    var isMfj = d.usFilingStatusRaw === "mfj";
    var feieEl = feieEligibilityFull(d.feieLimitsRaw);
    var abroad = feieEl.taxHomeAbroad && feieEl.testMet;
    var tbl = L.FORM_8938[abroad ? (isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE") : (isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE")];
    if (scopeHasUs) {
      gauge("form8938", "Form 8938 (FATCA) any-time", aggregatePeakUsd, tbl.anyTime, "USD",
        "Threshold shown is the 'any time during year' figure for your status/residence.");
    }
    if (scopeHasIndia) {
      gauge("lrs", "LRS outbound remittance", d.limitsRawExtra.lrsRemittedInr / INR_PER_USD, L.LRS_ANNUAL_USD, "USD",
        "RBI cap is per individual per financial year; TCS applies above ₹10L.");
    }
    if (scopeHasIndia && d.nroCumulativeRepatriatedUsdRaw > 0) {
      gauge("nro_repatriation", "NRO repatriation (this FY)", d.nroCumulativeRepatriatedUsdRaw, L.NRO_REPATRIATION_ANNUAL_USD, "USD",
        "RBI ceiling on NRO-account repatriation abroad, separate from and in addition to the LRS cap above — each repatriation needs its own Form 15CA/15CB (Form 145/146 from TY2026-27).");
    }
    if (feieEl.claimed || d.feieLimitsRaw.foreignEarnedIncomeUsd > 0) {
      var feieUsed = feieEl.eligible
        ? Math.min(d.feieLimitsRaw.amountClaimedUsd || d.feieLimitsRaw.foreignEarnedIncomeUsd, L.FEIE_MAX_USD)
        : 0;
      gauge("feie", "FEIE exclusion used", feieUsed, L.FEIE_MAX_USD, "USD",
        feieEl.eligible
          ? "Excluded foreign earned income cannot also generate FTC — §911 no-double-dip applied."
          : (feieEl.claimed ? "FEIE claimed but NOT eligible (" + feieEl.reasons.join("; ") + ") — exclusion set to $0."
                            : "Not claimed."));
    }
    if (d.limitsRawExtra.trumpAccountsOpened) {
      var taChildren = Math.max(1, d.limitsRawExtra.trumpAccountsNumChildren || 1);
      gauge("trump_account", "Trump Account (§530A) annual contributions", d.limitsRawExtra.trumpAccountsContributionsUsd,
        L.TRUMP_ACCOUNT_ANNUAL_CAP_USD * taChildren, "USD",
        "Cap is " + L.TRUMP_ACCOUNT_ANNUAL_CAP_USD.toLocaleString("en-US") + "/child/year, combined across all contributors (parents, family, employer) — shown here as the aggregate across " + taChildren + " child(ren).");
    }
    return gauges;
  }
};

module.exports = { NODES: NODES };

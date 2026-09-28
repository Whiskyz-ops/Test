"use strict";
/* ============================================================================
 * CL-2 (docs/GAP_TRACKER.md, section F): forward-looking calendar amounts.
 *
 * The Compliance Calendar's advance-tax/estimated-tax rows carry statutory
 * percentages and dates but no ₹/$ figure — a pro has to go compute "how
 * much do I actually need to pay by 15 Dec" by hand. IN-1/US-1 (in1-nodes.js
 * / us1-nodes.js, already verified — s424Inr/s425Inr and us2210PenaltyUsd)
 * already compute this exact math RETROSPECTIVELY, at year-end, to size the
 * interest/penalty on a shortfall. This is the SAME per-quarter model —
 * required slice of assessed tax tested against what that quarter's own
 * field carries — read PROSPECTIVELY instead: not "how much interest did
 * the shortfall cost", but "how much is still needed this quarter."
 *
 * India uses the same cumulative instalment schedule as the s.425 interest
 * (india-compliance.js's advanceTaxShortfalls: by 15 Jun 15%, 15 Sep 45%,
 * 15 Dec 75%, 15 Mar 100% of the year's tax, less everything paid by that
 * date), so this number never disagrees with the retrospective finding once
 * the year ends. US uses us1-nodes.js's §6654 running balance (four equal
 * 25% instalments, withholding spread evenly, payments applied to the
 * earliest unpaid instalment).
 *
 * India is gated on inAdvTaxObliged (the s.404 ₹10,000 floor + s.207(2)
 * senior carve-out) — below that floor there is no advance-tax obligation
 * at all, so showing a $ figure would assert an obligation that doesn't
 * exist; installments is [] in that case, not a list of zeros. US has no
 * equivalent blanket exemption in the existing model, so its installments
 * are always populated (a genuinely fully-covered quarter simply shows $0
 * still needed, which is itself the correct "you're covered" signal) —
 * EXCEPT for a US entity taxpayer (added DELIBERATE DAG/engine divergence,
 * docs/GAP_TRACKER.md section H — "entity-agnostic audit", 21 Jul 2026):
 * us.installments' underlying math is us1-nodes.js's §6654 individual
 * estimated-tax structure (same one underpayment_2210 uses, now suppressed
 * for entities in agg10-nodes.js for the same reason) — four equal 25%
 * slices, a 90%-of-current/100-or-110%-of-prior harbor test keyed to an
 * individual's AGI. A corporation's estimated tax is §6655, its own
 * distinct safe-harbor and installment structure this engine does not
 * model. Same "no obligation shown is more correct than the wrong
 * regime's number" choice as India's inAdvTaxObliged gate above:
 * installments is [] for a US entity, not four §6654 figures mislabeled
 * as if they were §6655.
 *
 * DAG-only, same precedent as CL-1: no engine equivalent, so
 * lib/wising.js's return shape never carries this field — only DAG mode
 * shows it in monitor-next.
 *
 * Verified in run-calendaramounts.js: hand-checked against in1-nodes.js's
 * own s425Inr/us1-nodes.js's own us2210PenaltyUsd per-quarter shortfall
 * terms (same installments, same shortfall formula, sum-of-installments
 * equals the retrospective total) across all 11 real profiles + SAMPLE.
 * ==========================================================================*/
var baseNodes = require("./checks-registry-nodes.js").NODES;
var NODES = {};
Object.keys(baseNodes).forEach(function (k) { NODES[k] = baseNodes[k]; });

NODES.calendarAmountsResult = {
  deps: [
    "hasIndiaScope", "hasUsScope", "inAdvTaxObliged", "inPurelyPresumptive", "assessedTaxInr",
    "advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr",
    "usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd", "usTaxResult"
  ],
  compute: function (d) {
    var india = { obliged: false, purelyPresumptive: !!d.inPurelyPresumptive, installments: [] };
    if (d.hasIndiaScope && d.inAdvTaxObliged) {
      india.obliged = true;
      if (d.inPurelyPresumptive) {
        var paidTotal = d.advQ1Inr + d.advQ2Inr + d.advQ3Inr + d.advQ4Inr;
        india.installments = [{
          quarter: "single", requiredPct: 1.00, paidInr: paidTotal,
          amountDueInr: Math.max(0, d.assessedTaxInr * 1.00 - paidTotal)
        }];
      } else {
        // cumulative: by each date, requiredPct of the year's tax less everything paid by then
        var paidQ = [d.advQ1Inr, d.advQ2Inr, d.advQ3Inr, d.advQ4Inr];
        india.installments = require("./india-compliance.js").advanceTaxShortfalls(d.assessedTaxInr, paidQ, false).map(function (q, i) {
          return { quarter: q.quarter, requiredPct: q.requiredPct, paidInr: paidQ[i], amountDueInr: Math.max(0, d.assessedTaxInr * q.requiredPct - q.cumPaidInr) };
        });
      }
    }

    var us = { requiredUsd: 0, installments: [] };
    if (d.hasUsScope && !d.usTaxResult.isEntity) {
      us.requiredUsd = d.usRequiredUsd;
      var perQWithholdingUsd = d.usWithholdingTotalUsd / 4;
      var estByQ = { 1: d.usEstQ1Usd, 2: d.usEstQ2Usd, 3: d.usEstQ3Usd, 4: d.usEstQ4Usd };
      // running balance, same as the §6654 penalty (us1-nodes.js): what's
      // still owed by each date after everything paid so far
      var cumRequiredUsd = 0, cumPaidUsd = 0;
      us.installments = [1, 2, 3, 4].map(function (q) {
        var requiredUsd = d.usRequiredUsd / 4;
        var paidUsd = perQWithholdingUsd + estByQ[q];
        cumRequiredUsd += requiredUsd; cumPaidUsd += paidUsd;
        return { quarter: q, requiredUsd: requiredUsd, paidUsd: paidUsd, amountDueUsd: Math.max(0, cumRequiredUsd - cumPaidUsd) };
      });
    }

    return { india: india, us: us };
  }
};

module.exports = { NODES: NODES };

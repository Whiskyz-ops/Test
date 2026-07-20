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
 * Deliberately reuses in1-nodes.js's s425Inr installment structure (15/30/
 * 30/25% India quarterly slices, or the single 100% presumptive-scheme
 * installment) and us1-nodes.js's us2210PenaltyUsd structure (four equal
 * 25% US slices, withholding spread evenly) rather than inventing a
 * "cumulative percentage paid to date" variant — the calendar's own row
 * LABELS use cumulative language ("Q3 (75%)"), but the verified interest
 * math tests each quarter's OWN slice against that quarter's OWN payment
 * field independently (no cross-quarter netting — see in1-nodes.js's own
 * s425Inr comment). Matching that exactly means this number never disagrees
 * with the retrospective finding's own arithmetic once the year ends.
 *
 * India is gated on inAdvTaxObliged (the s.404 ₹10,000 floor + s.207(2)
 * senior carve-out) — below that floor there is no advance-tax obligation
 * at all, so showing a $ figure would assert an obligation that doesn't
 * exist; installments is [] in that case, not a list of zeros. US has no
 * equivalent blanket exemption in the existing model, so its installments
 * are always populated (a genuinely fully-covered quarter simply shows $0
 * still needed, which is itself the correct "you're covered" signal).
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
    "usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"
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
        india.installments = [
          { quarter: 1, requiredPct: 0.15, paidInr: d.advQ1Inr },
          { quarter: 2, requiredPct: 0.30, paidInr: d.advQ2Inr },
          { quarter: 3, requiredPct: 0.30, paidInr: d.advQ3Inr },
          { quarter: 4, requiredPct: 0.25, paidInr: d.advQ4Inr }
        ].map(function (q) {
          return Object.assign({}, q, { amountDueInr: Math.max(0, d.assessedTaxInr * q.requiredPct - q.paidInr) });
        });
      }
    }

    var us = { requiredUsd: 0, installments: [] };
    if (d.hasUsScope) {
      us.requiredUsd = d.usRequiredUsd;
      var perQWithholdingUsd = d.usWithholdingTotalUsd / 4;
      var estByQ = { 1: d.usEstQ1Usd, 2: d.usEstQ2Usd, 3: d.usEstQ3Usd, 4: d.usEstQ4Usd };
      us.installments = [1, 2, 3, 4].map(function (q) {
        var requiredUsd = d.usRequiredUsd / 4;
        var paidUsd = perQWithholdingUsd + estByQ[q];
        return { quarter: q, requiredUsd: requiredUsd, paidUsd: paidUsd, amountDueUsd: Math.max(0, requiredUsd - paidUsd) };
      });
    }

    return { india: india, us: us };
  }
};

module.exports = { NODES: NODES };

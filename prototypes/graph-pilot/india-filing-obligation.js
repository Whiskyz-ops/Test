"use strict";
/* ============================================================================
 * indiaFilingObligationResult — is an Indian income-tax return compulsory
 * for this tax year, and why. Python port: dag_py/src/wising_dag/india/
 * filing_obligation.py (keep the two identical — npm run compare:js-vs-py-dag
 * and monitor-next/test-map-parity.mjs check it).
 *
 * Tax year 2026-27 on: Income-tax Act 2025 s.263(1)(a) and Income-tax Rules
 * 2026 r.163. Earlier years: Income-tax Act 1961 s.139(1) and r.12AB. Same
 * tests, same thresholds:
 *  - company / firm / LLP: always.
 *  - income before Chapter VI-A deductions (grossTotalIncomeInrCombined)
 *    above the basic exemption — new regime ₹4,00,000 (the engine's own
 *    first slab); old regime ₹2,50,000, a resident aged 60-79 ₹3,00,000,
 *    80+ ₹5,00,000.
 *  - resident and ordinarily resident with an asset outside India (or
 *    signing authority over a foreign account), whatever the income.
 *  - r.163 / r.12AB, for anyone else not already required (other than a
 *    company or firm): TDS + TCS of ₹25,000 or more (₹50,000 for a resident
 *    aged 60+); business turnover above ₹60 lakh; professional receipts
 *    above ₹10 lakh.
 * Non-resident whose only Indian income is dividend / interest / royalty /
 * fees for technical services taxed at the flat s.115A rates, with TDS
 * covering the tax: the income test doesn't apply (s.115A(5); the 2025 Act
 * keeps it). The TDS test is still applied — whether s.115A(5) overrides
 * r.12AB is unsettled, so the safer answer is flagged for the CA.
 *
 * Not modelled (no Layer 1 field): savings deposits of ₹50 lakh+, current
 * account deposits above ₹1 crore, foreign travel above ₹2 lakh,
 * electricity above ₹1 lakh. Capital-gains exemptions (s.54 family) aren't
 * added back to the income figure.
 *
 * DAG-only, same precedent as checksRegistry / calendarAmounts: no engine
 * equivalent; monitor-next reads it as result.indiaFilingObligation for the
 * map's India row.
 * ==========================================================================*/
var T = require("./constants.js").CONST.TAX.INDIA;

var fmt = function (n) { return Math.round(n).toLocaleString("en-IN"); };
var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

var ALWAYS = ["company", "firm", "llp"];
var NOT_MODELLED = [
  "Savings-account deposits of ₹50 lakh or more, current-account deposits above ₹1 crore, foreign travel above ₹2 lakh and electricity above ₹1 lakh also make a return compulsory — not collected on the forms"
];

// Business receipts split into business turnover and professional receipts.
// An entry is professional when it uses s.44ADA, or when the client's only
// nature of business is "professional" and the entry isn't under s.44AD.
function receiptsSplit(entries, natures) {
  var professionalOnly = natures.indexOf("professional") >= 0 &&
    !natures.some(function (n) { return n !== "professional" && n !== "partner_in_firm" && n !== "fno_trader" && n !== "intraday_trader"; });
  var out = { businessInr: 0, professionInr: 0 };
  (entries || []).forEach(function (b) {
    var digital = num(b.digital_receipts_inr) + num(b.ada_digital_receipts_inr);
    var cash = num(b.cash_receipts_inr) + num(b.ada_cash_receipts_inr);
    var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || (digital + cash);
    var professional = b.presumptive_scheme === "s44ADA" || (professionalOnly && b.presumptive_scheme !== "s44AD");
    if (professional) out.professionInr += receipts; else out.businessInr += receipts;
  });
  return out;
}

function compute(d, ctx) {
  var entity = d.indiaEntityTypeRaw || "individual";
  var status = d.indiaResidencyStatusRawAgg;
  var resident = status === "ROR" || status === "RNOR";
  var age = d.ageAtFyEnd;
  var year = d.baseYear;
  var newAct = year >= 2026;
  var section = newAct ? "s.263(1)(a)" : "s.139(1)";
  var rule = newAct ? "Rule 163" : "Rule 12AB";
  var gross = num(d.grossTotalIncomeInrCombined);
  var tdsTcs = num(d.taxesPaidIndiaResult.tds.inr) + num(d.taxesPaidIndiaResult.tcs.inr);
  // Age concessions are for a resident individual only (not an HUF).
  var senior = entity === "individual" && resident && age !== null && age >= 60;

  var basic = d.isNew ? T.SLABS_NEW[0][0] : (senior && age >= 80 ? 500000 : senior ? 300000 : T.SLABS_OLD[0][0]);
  var tdsThreshold = senior ? 50000 : 25000;

  var out = {
    required: false, reasons: [], notes: [], notModelled: NOT_MODELLED.slice(),
    section: section, rule: rule, grossTotalIncomeInr: gross, basicExemptionInr: basic,
    tdsTcsInr: tdsTcs, tdsTcsThresholdInr: tdsThreshold
  };
  if (!d.hasIndiaScope) return out;
  var add = function (code, text) { out.reasons.push({ code: code, text: text }); };

  if (ALWAYS.indexOf(entity) >= 0) {
    add("entity", "Every company and firm must file (" + section + "), whatever its income");
  } else {
    // s.115A(5): NR whose whole income is flat-rate dividend / interest /
    // royalty / FTS, with TDS covering the tax.
    var flat = (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) +
      (d.s115aFts ? d.s115aFts.totalInr : 0) + (d.nrInterest ? d.nrInterest.carvedOutInr : 0);
    var flatOnly = d.isNRV3 && flat > 0 && gross - flat <= 1 && tdsTcs >= num(d.totalTaxInrCombined);
    if (flatOnly) {
      out.notes.push("Only flat-rate dividend / interest / royalty / technical-fee income with tax fully deducted: the income test doesn't apply to a non-resident (s.115A(5))");
    } else if (gross > basic) {
      add("income", "Income before deductions ₹" + fmt(gross) + " is above the ₹" + fmt(basic) + " basic exemption (" + section + ")");
    }
    if (status === "ROR" && d.indiaForeignAssetsDeclaredRaw === true) {
      add("foreign_assets", "Resident and ordinarily resident with assets outside India — a return (with Schedule FA) is compulsory whatever the income (" + section + ")");
    }
    if (!out.reasons.length) {
      if (tdsTcs >= tdsThreshold) {
        add("tds_tcs", "TDS + TCS of ₹" + fmt(tdsTcs) + " is ₹" + fmt(tdsThreshold) + " or more (" + rule + ")");
        if (flatOnly) out.notes.push("Whether s.115A(5) overrides the TDS test is unsettled — CA to confirm");
      }
      var r = receiptsSplit(d.indianBusinessesBoundary, ctx && ctx.india && ctx.india.domestic_income && ctx.india.domestic_income.business_income &&
        ctx.india.domestic_income.business_income.nature_of_business || []);
      if (r.businessInr > 6000000) add("business_turnover", "Business turnover ₹" + fmt(r.businessInr) + " is above ₹60,00,000 (" + rule + ")");
      if (r.professionInr > 1000000) add("professional_receipts", "Professional receipts ₹" + fmt(r.professionInr) + " are above ₹10,00,000 (" + rule + ")");
    }
  }
  out.required = out.reasons.length > 0;
  return out;
}

var NODE = {
  deps: ["hasIndiaScope", "indiaEntityTypeRaw", "indiaResidencyStatusRawAgg", "isNRV3", "ageAtFyEnd", "baseYear", "isNew",
    "grossTotalIncomeInrCombined", "taxesPaidIndiaResult", "totalTaxInrCombined", "indiaForeignAssetsDeclaredRaw",
    "s115aDividend", "s115aRoyalty", "s115aFts", "nrInterest", "indianBusinessesBoundary"],
  compute: compute
};

module.exports = { NODE: NODE, compute: compute };

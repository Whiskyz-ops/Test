"use strict";
/* Income from house property (India, ss.22-24 + s.71(3A)), per property as
 * Layer 1 India records it:
 *   - Let-out / deemed let-out (LOP/DLOP): net annual value = gross annual
 *     value - municipal taxes paid; less the 30% standard deduction
 *     (s.24(a)) and interest on borrowed capital (s.24(b), incl. this year's
 *     1/5th pre-construction instalment).
 *   - Self-occupied (SOP): annual value nil; home-loan interest up to
 *     Rs 2,00,000 in total across SOPs (s.24(b) second proviso). Not
 *     available under the s.115BAC new regime.
 *   - Co-ownership: amounts entered for the whole property are scaled to
 *     the owner's share.
 * A net loss under the head is set off against other income only up to
 * Rs 2,00,000 (s.71(3A)); under the new regime an individual/HUF cannot set
 * it off against other heads at all (s.115BAC(2)). The rest carries forward.
 *
 * Older/demo data may carry annual_value_inr (the s.23 "annual value", i.e.
 * already net of municipal taxes), gross_rent_received_inr (used as GAV) or
 * net_income_inr (a finished figure, taken as-is). Previously every one of
 * these was summed raw as income, with no deduction at all. */
var HP_SOP_INTEREST_CAP_INR = 200000;
var HP_LOSS_SETOFF_CAP_INR = 200000;
var HP_STANDARD_DEDUCTION_RATE = 0.30;

function hpNum(v) { var n = Number(v); return v == null || isNaN(n) ? 0 : n; }
function hpHas(v) { return v !== null && v !== undefined && v !== "" && !isNaN(Number(v)); }

function computeHouseProperty(props, opts) {
  opts = opts || {};
  var noNewRegimeBenefits = opts.isNewRegime === true && opts.isIndividualOrHuf !== false;
  var sopInterestInr = 0, otherInr = 0;
  (props || []).forEach(function (p) {
    if (!p || typeof p !== "object") return;
    var hasGav = hpHas(p.gross_annual_value_inr) || hpHas(p.annual_value_inr) || hpHas(p.gross_rent_received_inr);
    if (!hasGav && hpHas(p.net_income_inr)) { otherInr += hpNum(p.net_income_inr); return; }
    var share = p.financial_values_represent === "TOTAL_PROPERTY" && hpHas(p.co_owner_share_percent)
      ? Math.min(100, Math.max(0, hpNum(p.co_owner_share_percent))) / 100 : 1;
    var interestInr = (hpNum(p.interest_on_borrowed_capital_inr) + hpNum(p.pre_construction_interest_inr)) * share;
    var use = p.property_use || (hasGav ? "LOP" : "SOP");
    if (use === "SOP") { sopInterestInr += interestInr; return; }
    var navInr;
    if (hpHas(p.gross_annual_value_inr) || !hpHas(p.annual_value_inr)) {
      var gavInr = hpHas(p.gross_annual_value_inr) ? hpNum(p.gross_annual_value_inr) : hpNum(p.gross_rent_received_inr);
      navInr = gavInr - hpNum(p.municipal_taxes_paid_inr);
    } else navInr = hpNum(p.annual_value_inr);
    navInr = Math.max(0, navInr) * share;
    otherInr += navInr - HP_STANDARD_DEDUCTION_RATE * navInr - interestInr;
  });
  var sopDeductionInr = noNewRegimeBenefits ? 0 : Math.min(sopInterestInr, HP_SOP_INTEREST_CAP_INR);
  var headInr = otherInr - sopDeductionInr;
  var setOffCapInr = noNewRegimeBenefits ? 0 : HP_LOSS_SETOFF_CAP_INR;
  var incomeInr = headInr < 0 ? Math.max(headInr, -setOffCapInr) : headInr;
  return { incomeInr: incomeInr || 0, headInr: headInr || 0, lossCarriedForwardInr: (incomeInr - headInr) || 0 };
}

// opts from Layer 1 India's own state: regime + entity.
function housePropertyOpts(india) {
  var profile = (india && india.profile) || {};
  var entity = profile.entity_type || "individual";
  return {
    isNewRegime: String(profile.tax_regime || "NEW").toUpperCase() !== "OLD",
    isIndividualOrHuf: entity === "individual" || entity === "huf"
  };
}

module.exports = { computeHouseProperty: computeHouseProperty, housePropertyOpts: housePropertyOpts };

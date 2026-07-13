/* ============================================================================
 * WISING — engine regression fixtures
 * ----------------------------------------------------------------------------
 * Synthetic Layer 1 India / US raw states shaped exactly like what
 * layer1_india.html / layer1_us.html actually persist to localStorage (field
 * names and nesting verified against the live form source, not guessed).
 * Every value is a distinct, hand-traceable number chosen so a missing or
 * mis-wired field shows up as a wrong total in tests/engine/run.js, not a
 * coincidental match.
 * ==========================================================================*/
"use strict";

// ---- India ------------------------------------------------------------
// Chosen to exercise every field this session found silently unread by the
// engine (commodities, unlisted_equity, several "Other Sources" residuals,
// and 6 Chapter VI-A deduction sections) plus a light regression check on
// the pre-existing financial_holdings classification logic.
var india = {
  profile: {
    full_name: "Fixture Taxpayer",
    entity_type: "individual",
    tax_regime: "OLD" // deductions below (other than employer-NPS) only apply in OLD regime
  },
  residency_detail: {
    final_india_residency_status: "ROR",
    days_in_india_current_year: 300
  },
  domestic_income: {
    salary: {
      taxable_salary_inr: 1000000,
      employer_nps_contribution_inr: 60000
    },
    business_income: {
      entity_type: "individual",
      business_entries: [{ net_profit_inr: 200000 }],
      goods_vehicles: []
    },
    house_property: {
      properties: [{ gross_annual_value_inr: 100000 }]
    },
    other_sources: { interest_inr: 500 },
    capital_gains: { short_term_15_pct: 20000 }
  },
  other_sources: {
    interest_savings_inr: 1000,
    interest_fd_rd_inr: 2000,
    interest_bonds_inr: 3000,
    interest_on_it_refund_inr: 500,
    dividend_inr: 5000,
    winnings_lottery_gaming_inr: 7000,
    online_gaming_winnings_inr: 3000,
    gifts_above_50k_inr: 60000,
    family_pension_gross_inr: 90000,
    spousal_clubbing_s64_inr: 20000,
    minor_child_exemption_inr: 1500,
    lic_maturity_inr: 8000,
    angel_tax_premium_inr: 0,
    local_authority_s10_20_inr: 0,
    miscellaneous_income_inr: 12000,
    taxable_epf_interest_inr: 4000,
    taxable_nps_withdrawal_inr: 2500
  },
  capital_gains: { ltcg_112a_inr: 0, stcg_111a_inr: 0 },
  financial_holdings: {
    transactions: [
      // GROUP_A: listed equity, STT paid, >12mo -> s.198 LTCG (₹1,25,000 exempt bucket)
      { asset_class: "listed_equity", stt_paid: true, acquisition_date: "2024-01-01", sale_date: "2026-06-01",
        purchase_value: 200000, purchase_currency: "INR", sale_value: 350000, sale_currency: "INR", transfer_expenses: 0 },
      // GROUP_D: debt MF acquired post-1-Apr-2023 -> always short-term/slab
      { asset_class: "debt_mutual_fund_post_apr23", acquisition_date: "2025-01-01", sale_date: "2026-06-01",
        purchase_value: 80000, purchase_currency: "INR", sale_value: 95000, sale_currency: "INR", transfer_expenses: 0 }
    ]
  },
  // Previously read nowhere in the engine (this session's audit finding).
  commodities: {
    transactions: [
      // physical_gold, >24mo -> GROUP_C -> ltcg197
      { commodity_type: "physical_gold", acquisition_date: "2023-01-01", sale_date: "2026-06-01",
        purchase_value: 100000, purchase_currency: "INR", sale_value: 150000, sale_currency: "INR" },
      // silver, <=24mo -> GROUP_C -> stcgSlab
      { commodity_type: "silver", acquisition_date: "2025-06-01", sale_date: "2026-06-01",
        purchase_value: 20000, purchase_currency: "INR", sale_value: 25000, sale_currency: "INR" },
      // SGB secondary market, >12mo -> GROUP_E -> ltcg197
      { commodity_type: "sovereign_gold_bond_secondary", acquisition_date: "2024-01-01", sale_date: "2026-06-01",
        purchase_value: 40000, purchase_currency: "INR", sale_value: 55000, sale_currency: "INR" },
      // SGB original, redeemed AT MATURITY -> exempt, must be excluded entirely
      { commodity_type: "sovereign_gold_bond_original", is_maturity_redemption: true, acquisition_date: "2018-01-01",
        sale_date: "2026-06-01", purchase_value: 30000, purchase_currency: "INR", sale_value: 70000, sale_currency: "INR" },
      // gold ETF -> GROUP_D -> always short-term/slab regardless of holding period
      { commodity_type: "gold_etf", acquisition_date: "2023-06-01", sale_date: "2026-06-01",
        purchase_value: 50000, purchase_currency: "INR", sale_value: 62000, sale_currency: "INR" }
    ]
  },
  // Previously read nowhere in the engine (this session's audit finding).
  unlisted_equity: {
    transactions: [
      // >24mo -> ltcg197
      { company_name: "Acme Pvt Ltd", acquisition_date: "2023-01-01", sale_date: "2026-06-01",
        number_of_shares: 100, cost_per_share: 500, cost_per_share_currency: "INR",
        sale_price_per_share: 900, sale_price_per_share_currency: "INR" },
      // <=24mo -> stcgSlab
      { company_name: "Beta Pvt Ltd", acquisition_date: "2025-06-01", sale_date: "2026-06-01",
        number_of_shares: 50, cost_per_share: 200, cost_per_share_currency: "INR",
        sale_price_per_share: 300, sale_price_per_share_currency: "INR" },
      // still holding (no sale_date) -> must be excluded entirely
      { company_name: "Gamma Pvt Ltd", acquisition_date: "2024-01-01",
        number_of_shares: 10, cost_per_share: 1000, cost_per_share_currency: "INR" }
    ]
  },
  deductions: {
    s80C: { epf_employee_inr: 80000, ppf_inr: 40000 },
    s80CCD_1B: { nps_additional_inr: 40000 },
    s80D: { self_family_premium_inr: 20000, parents_premium_inr: 15000 },
    s80TTA_TTB: { savings_interest_inr: 15000 }, // above the ₹10,000 cap, on purpose
    s80DD: { has_disabled_dependents: true, disability_percentage: "standard" }, // flat ₹75,000
    s80DDB: { has_specified_diseases_treatment: true, patient_category: "senior", medical_expenses_inr: 150000 }, // capped ₹1,00,000
    s80U: { has_self_disability: true, disability_percentage: "severe" }, // flat ₹1,25,000
    s80E: { education_loan_interest_inr: 45000 }, // uncapped
    s80EEA_EE: { affordable_home_loan_interest_inr: 200000, loan_sanction_date: "2020-06-01" }, // s.80EEA window, capped ₹1,50,000
    s80ggb_ggc_political_donation_inr: 10000,
    s80GG: { has_rent_paid_no_hra: true, rent_paid_inr: 150000 }
  }
};

// ---- US -----------------------------------------------------------------
// Exercises: the child-care-credit field-name fix, SE health/retirement
// above-the-line deductions, and the AMT private-activity-bond-interest
// path fix.
var us = {
  profile: { tax_entity_type: "individual", filing_status: "single", dependents_count: 0 },
  us_residency_detail: { is_us_citizen: true, final_us_residency_status: "RESIDENT_ALIEN" },
  income_us_source: {
    wages_w2: [{ wages_box1_usd: 120000, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 18000 } }],
    self_employment: [{ business_name: "Fixture Consulting", self_employment_earnings_usd: 40000 }],
    se_health_insurance_deduction_usd: 6000,
    se_retirement_deduction_usd: 9000,
    interest_us_source_usd: 1000,
    ordinary_dividends_us_source_usd: 2000,
    qualified_dividends_us_source_usd: 1500
  },
  equity_compensation: {},
  itemized_deductions_and_credits: {
    use_standard_or_itemized: "standard",
    child_and_dependent_care_expenses_usd: 6000 // the real field the form writes
  },
  amt_inputs: {
    private_activity_bond_interest_usd: 5000 // real path (amt_inputs.*, not amt.* or itemized_deductions_and_credits.*)
  },
  // The real "Add Foreign Corporation" UI (syncCorpState()) writes these
  // field names, NOT corp_name/country/ownership_pct — gap tracker US-26.
  foreign_entities: {
    foreign_corporations: [
      { corporation_name: "Fixture Foreign Co", country_of_incorporation: "SG", ownership_percentage: 60, cfc_status: "controlled_foreign_corporation" }
    ]
  }
};

var router = { jurisdiction: "dual", base_tax_year: 2026, full_name: "Fixture Taxpayer" };

module.exports = { india: india, us: us, router: router };

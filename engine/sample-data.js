/* ============================================================================
 * WISING — Layer 2 Engine :: sample-data.js
 * ----------------------------------------------------------------------------
 * A realistic DUAL-RESIDENT demo scenario so the dashboard tells its story even
 * before the Layer 1 forms have been filled in. Shapes mirror the actual
 * `state` (India) and `usState` (US) objects defined in the Layer 1 forms, so
 * loading these is indistinguishable from a real intake.
 *
 * Persona: "Aarav Sharma" — Indian citizen on H-1B in the US, ROR in India,
 * SPT met + green-card pending in the US. Holds Indian salary, Indian MFs,
 * an Indian flat on rent, and an Indian company stake. The textbook conflict.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};

  var ROUTER = {
    jurisdiction: "dual",
    base_tax_year: 2025,
    full_name: "Aarav Sharma",
    date_of_birth: "1988-07-15",
    is_us_citizen: false,
    has_green_card: false,
    us_days: 330,
    has_us_source_income_or_assets: true
  };

  var INDIA = {
    profile: {
      full_name: "Aarav Sharma",
      entity_type: "individual",
      date_of_birth: "1988-07-15",
      pan: "ABCPS1234K",
      tax_regime: "NEW"
    },
    residency_detail: {
      days_in_india_current_year: 210,
      final_india_residency_status: "ROR"
    },
    dtaa: {
      tax_residency_country: "US",
      is_us_resident_for_dtaa: true,
      dtaa_treaty_residence: "none",   // <-- tie-breaker NOT yet applied
      trc_status: false,               // <-- TRC missing
      has_permanent_establishment_in_india: false,
      treaty_elections: [],
      dtaa_forced_nr: false
    },
    compliance_docs: {
      trc: { document_uploaded: false },
      form_10f: { is_filed: false },   // <-- Form 10F missing
      chapter_xiia_elected: false
    },
    bank_accounts: [
      { bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 3200000 },
      { bank_name: "ICICI Bank", account_type: "nro", peak_balance_inr: 1500000 }
    ],
    property: {
      has_indian_property_transaction: true,
      properties: [
        { address: "Flat 12B, Pune", property_type: "Residential", gross_rent_received_inr: 600000, municipal_taxes_paid_inr: 30000 }
      ]
    },
    financial_holdings: {
      has_financial_transactions: true,
      transactions: [
        { asset_type: "equity_mutual_fund", asset_name: "Axis Bluechip Fund", value_inr: 2500000 },
        { asset_type: "debt_mutual_fund", asset_name: "HDFC Corporate Bond Fund", value_inr: 1200000 }
      ]
    },
    domestic_income: {
      salary: { has_salary_income: true, taxable_salary_inr: 4200000, gross_salary_inr: 4500000 },
      house_property: {
        has_house_property_income: true,
        properties: [{ annual_value_inr: 420000, gross_rent_received_inr: 600000 }]
      },
      business_income: {
        has_business_or_fo_income: true,
        business_entries: [
          { trade_name: "Sharma Consulting Pvt Ltd", net_profit_inr: 1800000 }
        ]
      },
      capital_gains: { short_term_15_pct: 250000 },
      other_sources: { interest_inr: 0 }
    },
    other_sources: {
      has_other_sources_income: true,
      interest_savings_inr: 80000,
      interest_fd_rd_inr: 220000,
      dividend_inr: 150000
    },
    deductions: {
      s80C: { epf_employee_inr: 150000, ppf_inr: 150000 },
      s80CCC_80CCD1: { nps_employee_contribution_inr: 50000 }
    },
    lrs_outbound: {
      total_lrs_remitted_this_fy_inr: 17000000,  // ~$205k -> approaching $250k LRS cap
      lrs_purpose: "investment"
    },
    tax_credits: {
      advance_tax_q1_15jun_inr: 400000,
      advance_tax_q2_15sep_inr: 400000,
      advance_tax_q3_15dec_inr: 400000,
      advance_tax_q4_15mar_inr: 300000,
      tds_already_deducted_inr: 350000,
      tds_inr: 0,
      tcs_inr: 0
    },
    metadata: { schema_version: "layer1_india_v5_1", financial_year: "FY2025-26" }
  };

  var US = {
    profile: {
      tax_entity_type: "individual",
      full_name: "Aarav Sharma",
      date_of_birth: "1988-07-15",
      filing_status: "married_filing_jointly",
      ssn_or_itin_type: "ssn"
    },
    us_residency_detail: {
      is_us_citizen: false,
      has_green_card: false,
      us_days_current_year: 330,
      spt_test_met: true,                          // <-- US resident via SPT
      final_us_residency_status: "RESIDENT_ALIEN",
      dtaa_treaty_residence: "none"
    },
    income_us_source: {
      has_employment_income: true,
      wages_w2: [
        { employer_name: "Cloudscale Inc", wages_tips_compensation_usd: 165000, federal_income_tax_withheld_usd: 31000 }
      ],
      interest_us_source_usd: 3200,
      ordinary_dividends_us_source_usd: 4100,
      ltcg_us_source_usd: 9000,
      stcg_us_source_usd: 0
    },
    income_foreign_source: {
      foreign_wages: [{ employer_name: "India Salary", wages_usd: 50602 }], // ₹42L taxable / 83
      foreign_interest_usd: 3614,        // ₹3L / 83
      foreign_dividends_usd: 1807,       // ₹1.5L / 83
      foreign_rental_income_usd: 5060,   // ₹4.2L annual value / 83
      foreign_stcg_usd: 3012,
      foreign_ltcg_usd: 0
    },
    foreign_earned_income: {
      claims_feie: false,
      foreign_earned_income_usd: 50602,
      feie_amount_claimed_usd: 0
    },
    bank_accounts: [
      { bank_name: "HDFC Bank", account_type: "savings", country: "India", peak_balance_usd: 38554 },
      { bank_name: "ICICI Bank", account_type: "nro", country: "India", peak_balance_usd: 18072 }
    ],
    fbar_aggregate_peak_usd: 56626,
    form_8938_required: false,
    foreign_entities: {
      owns_10_percent_foreign_corp: true,
      foreign_corporations: [
        { corp_name: "Sharma Consulting Pvt Ltd", country: "IN", gilti_income_usd: 21687 }
      ],
      pfic_holdings: [
        { asset_name: "Axis Bluechip Fund", holding_value_usd: 30120 },
        { asset_name: "HDFC Corporate Bond Fund", holding_value_usd: 14458 }
      ],
      has_pfics: true
    },
    retirement_accounts: {
      indian_epf_balance_usd: 1807,
      indian_ppf_balance_usd: 1807
    },
    ftc_inputs: {
      claims_ftc: true,
      ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 22289, foreign_income_usd: 0 }]
    },
    withholding_and_estimated: {
      federal_withholding_total_usd: 31000,
      estimated_tax_q1_apr15_usd: 0,
      estimated_tax_q2_jun15_usd: 0,
      estimated_tax_q3_sep15_usd: 0,
      estimated_tax_q4_jan15_usd: 0
    },
    nra_specific: { files_form_1040nr: false },
    metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2025 }
  };

  WISING.SAMPLE = { router: ROUTER, india: INDIA, us: US };

  // Convenience: write the sample into localStorage so the actual Layer 1 forms
  // also pick it up (lets a demo flow Router -> L1 -> Dashboard with real data).
  WISING.loadSampleIntoStorage = function () {
    try {
      var K = WISING.CONST.STORAGE_KEYS;
      root.localStorage.setItem(K.ROUTER, JSON.stringify(ROUTER));
      root.localStorage.setItem(K.INDIA, JSON.stringify(INDIA));
      root.localStorage.setItem(K.US, JSON.stringify(US));
      return true;
    } catch (e) { return false; }
  };
})(typeof window !== "undefined" ? window : globalThis);

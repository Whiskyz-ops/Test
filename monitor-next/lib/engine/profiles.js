/* ============================================================================
 * WISING — Demo Test Profiles
 * ----------------------------------------------------------------------------
 * Named, coherent India⇄US taxpayers. Each profile is a complete
 * { router, india, us } bundle in the exact shapes the Layer 1 forms persist,
 * so `loadProfile(id)` seeds all three localStorage keys and every surface
 * (both Layer 1 forms, the dashboard, the Monitor) populates from it at once —
 * no manual typing during a demo.
 *
 * Self-contained: defines the storage keys itself (falls back to WISING.CONST
 * when present) so it can be loaded by pages that don't include constants.js.
 * ==========================================================================*/
(function (root) {
  "use strict";
  var WISING = root.WISING = root.WISING || {};

  var KEYS = (WISING.CONST && WISING.CONST.STORAGE_KEYS) || {
    ROUTER: "wising_router_state",
    INDIA: "wising_layer1_india_state",
    US: "wising_us_state"
  };
  var ACTIVE_KEY = "wising_active_profile";

  // ---- helpers to keep the bundles terse ----
  function router(name, extra) {
    return Object.assign({
      jurisdiction: "dual", base_tax_year: 2026, full_name: name,
      date_of_birth: "1988-01-01", is_us_citizen: false, has_green_card: false,
      us_days: 0, has_us_source_income_or_assets: true
    }, extra || {});
  }
  function meta(schema, fy) { return { schema_version: schema, financial_year: fy }; }

  /* ======================================================================
   * PROFILE 1 — Dual resident (India ROR + US SPT). The flagship FTC/tie-break case.
   * ====================================================================*/
  var P1 = {
    id: "dual_resident_h1b",
    label: "Dual Resident — H-1B",
    story: "India ROR + US SPT, senior tech hire in California. Both tax worldwide income → DTAA tie-breaker + FTC shortfall; ISO exercise triggers AMT and mirrors an ESOP grant from his prior Indian employer (equity-comp sourcing); NIIT, a carried-forward capital loss, and a Schedule FA slip round it out.",
    tags: ["dual residency", "FTC", "PFIC", "AMT", "equity comp"],
    router: router("Aarav Sharma", { us_days: 330, date_of_birth: "1988-07-15" }),
    india: {
      profile: { full_name: "Aarav Sharma", entity_type: "individual", date_of_birth: "1988-07-15", pan: "ABCPS1234K", tax_regime: "NEW" },
      residency_detail: { days_in_india_current_year: 183, final_india_residency_status: "ROR" },
      // Tie-break wizard walked through: permanent home was ambiguous (kept a
      // place in both countries), so it fell to centre of vital interests,
      // which landed on the US — the actual reasoning behind "us" winning,
      // not just the bare verdict. No treaty_elections here on purpose: he's
      // domestically ROR, and s.207 (what a treaty election overrides) only
      // applies to a genuine domestic NR — see Rohan (us_resident_indian_income)
      // for that case instead.
      dtaa: { tax_residency_country: "US", is_us_resident_for_dtaa: true, dtaa_treaty_residence: "us", trc_status: true, has_permanent_establishment_in_india: false, dtaa_forced_nr: false, tb_home: "both", tb_cvi: "us" },
      compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true }, chapter_xiia_elected: false },
      bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 3200000 }, { bank_name: "ICICI Bank", account_type: "nro", peak_balance_inr: 1500000 }],
      property: { has_indian_property_transaction: true, properties: [{ address: "Flat 12B, Pune", property_type: "Residential", annual_value_inr: 420000, gross_rent_received_inr: 600000, municipal_taxes_paid_inr: 30000 }] },
      financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "Axis Bluechip Fund", value_inr: 2500000 }, { asset_type: "debt_mutual_fund", asset_name: "HDFC Corporate Bond Fund", value_inr: 1200000 }] },
      // Preparer left this unchecked despite the US brokerage/401(k)/bank
      // accounts shown on his US form below — as ROR he must disclose them on
      // Schedule FA; the two forms flatly disagree (schedule_fa_inconsistent).
      foreign_assets: { has_foreign_assets: false, assets: [] },
      // ESOP grant from his prior Indian employer (Infosys, see the US-side
      // foreign_wages entry below for the same Apr–Aug stint) — carried an
      // equity grant across the move, exercised the same year as the US-side
      // ISO grant → equity_comp_sourcing (both countries taxing the same
      // multi-year award independently, no day-count allocation).
      domestic_income: { salary: { has_salary_income: true, taxable_salary_inr: 1800000, esop_perquisite_events: [{ employer_name: "Infosys Ltd", grant_date: "2021-06-01", vesting_or_exercise_date: "2026-06-01", shares: 400, fmv_per_share_inr: 1800, exercise_price_per_share_inr: 300, perquisite_value_inr: 600000 }] }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 420000 }] }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: { short_term_15_pct: 250000 } },
      // taxable_epf_interest_inr now actually lands in the US income
      // computation (folded into foreign-source interest), not just this
      // finding's display text.
      other_sources: { has_other_sources_income: true, interest_savings_inr: 40000, interest_fd_rd_inr: 120000, dividend_inr: 90000, taxable_epf_interest_inr: 45000 },
      deductions: { s80C: { epf_employee_inr: 150000, ppf_inr: 150000 }, s80CCC_80CCD1: { nps_employee_contribution_inr: 50000 } },
      // A prior-year capital-market loss carried forward, not yet set off
      // against this year's capital gains above.
      carry_forward_losses: { has_brought_forward_losses: true, stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 180000 }] },
      lrs_outbound: { total_lrs_remitted_this_fy_inr: 17000000 },
      tax_credits: { advance_tax_q1_15jun_inr: 400000, advance_tax_q2_15sep_inr: 400000, advance_tax_q3_15dec_inr: 400000, advance_tax_q4_15mar_inr: 300000, tds_already_deducted_inr: 350000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Aarav Sharma", date_of_birth: "1988-07-15", filing_status: "mfj", ssn_or_itin_type: "ssn" },
      us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 185, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "us" },
      income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Cloudscale Inc (US)", wages_box1_usd: 200000, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 38000, medicare_wages_box5_usd: 200000 } }], interest_us_source_usd: 3200, ordinary_dividends_us_source_usd: 6200, qualified_dividends_us_source_usd: 4200, ltcg_us_source_usd: 14000 },
      income_foreign_source: { foreign_wages: [{ employer_name: "Infosys (India, Apr–Aug)", wages_usd: 21687 }], foreign_interest_usd: 1928, foreign_dividends_usd: 1084, foreign_rental_income_usd: 5060, foreign_stcg_usd: 3012 },
      foreign_earned_income: { claims_feie: false, foreign_earned_income_usd: 21687, feie_amount_claimed_usd: 0 },
      // ISO exercise the same year as the Infosys ESOP event above → the AMT
      // preference item (bargain element) plus the equity-comp sourcing
      // conflict. Common combination for a relocated tech employee.
      equity_compensation: { iso_exercises: [{ shares_exercised: 3000, fmv_at_exercise_usd: 65, strike_price_usd: 12 }] },
      // California is the single most common H-1B/relocated-tech-worker state;
      // the federal DTAA tie-breaker above doesn't bind it (state_treaty_not_binding).
      state_residency: { primary_state_of_residence: "California", ca_retains_property_or_voter_reg: true },
      bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", country: "India", peak_balance_usd: 38554 }, { bank_name: "ICICI Bank", account_type: "nro", country: "India", peak_balance_usd: 18072 }],
      fbar_aggregate_peak_usd: 56626,
      foreign_entities: { owns_10_percent_foreign_corp: false, foreign_corporations: [], pfic_holdings: [{ asset_name: "Axis Bluechip Fund", holding_value_usd: 30120 }, { asset_name: "HDFC Corporate Bond Fund", holding_value_usd: 14458 }], has_pfics: true },
      retirement_accounts: { "401k_employee_contribution_usd": 20500, "401k_employer_match_usd": 9000, roth_ira_contribution_usd: 7000, indian_epf_balance_usd: 1807 },
      financial_holdings: [{ asset_name: "Schwab — Taxable Brokerage (US equities)", account_type: "taxable_brokerage", peak_balance_usd: 168000, country: "US" }, { asset_name: "Fidelity 401(k) — US index funds", account_type: "retirement_brokerage", peak_balance_usd: 92000, country: "US" }],
      real_estate: { has_real_estate_transaction: false, properties: [] },
      ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 22289 }] },
      withholding_and_estimated: { federal_withholding_total_usd: 31000 },
      nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 2 — US RESIDENT with INDIAN income.
   * Green-card holder living in the US; India-source rent/dividends/interest +
   * Indian mutual funds. India taxes only India-source (NR); US taxes worldwide
   * → Form 1116 FTC for Indian TDS, PFIC on Indian MFs, FBAR/8938.
   * ====================================================================*/
  var P2 = {
    id: "us_resident_indian_income",
    label: "US Resident · Indian income",
    story: "US green-card holder with Indian rent, dividends, mutual funds, a small India consulting stake and a US-side consulting side gig. US taxes worldwide → FTC (Form 1116) for Indian TDS; PFIC; a below-threshold Indian business stake; no US-India Totalization Agreement on his US self-employment tax; plus occasional online-gaming winnings and an unexplained cash deposit back home. His W-2 job also reports qualified tip income and overtime premium pay — the first demo of the (OBBBA, TY2025-2028) \"no tax on tips\"/\"no tax on overtime\" deductions, both intact here since his AGI sits just under the $300,000 MFJ phase-out threshold.",
    tags: ["FTC 1116", "PFIC", "FBAR", "NR in India", "self-employment", "tips/overtime"],
    router: router("Rohan Mehta", { is_us_citizen: false, has_green_card: true, us_days: 365, date_of_birth: "1985-03-22" }),
    india: {
      profile: { full_name: "Rohan Mehta", entity_type: "individual", date_of_birth: "1985-03-22", pan: "AAAPM5678Q", tax_regime: "NEW" },
      residency_detail: { days_in_india_current_year: 20, final_india_residency_status: "NR" },
      // A genuinely beneficial treaty rate on ₹1.5L of his ₹2.6L NRO interest
      // (15% vs the 20% domestic s.207 default — the other ₹1.1L isn't
      // claimed under treaty at all, so it's taxed at the plain domestic
      // rate regardless) plus a royalty stream (India has no other_sources
      // field for royalty at all — this election table is the only place
      // it's ever recorded, exercising that for the first time). But TRC/
      // Form 41 are missing (see compliance_docs below), so BOTH elections
      // are denied and the computation correctly falls back to the domestic
      // rate for each.
      dtaa: { tax_residency_country: "US", is_us_resident_for_dtaa: true, dtaa_treaty_residence: "US", trc_status: false, form_10f: false, treaty_elections: [
        { income_type: "interest", amount_inr: 150000, elected_rate: 0.15, treaty_article: "Art 11(2)(b)" },
        { income_type: "royalty", amount_inr: 400000, elected_rate: 0.15, treaty_article: "Art 12(2)(a)(ii)" }
      ] },
      compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
      bank_accounts: [{ bank_name: "SBI (NRO)", account_type: "nro", peak_balance_inr: 2600000 }, { bank_name: "Axis (NRE)", account_type: "nre", peak_balance_inr: 1900000 }],
      property: { has_indian_property_transaction: true, properties: [{ address: "Villa 4, Bengaluru", property_type: "Residential", annual_value_inr: 840000, gross_rent_received_inr: 1200000, municipal_taxes_paid_inr: 60000 }] },
      financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "SBI Bluechip Fund", value_inr: 4200000 }, { asset_type: "equity_mutual_fund", asset_name: "Mirae Asset Large Cap", value_inr: 2600000 }] },
      // Small India-side consulting stake, held below the 10% US CFC threshold
      // (see the matching foreign_entities block on the US side below) →
      // triggers cfc_below_threshold instead of the full CFC/Form 5471 finding.
      domestic_income: { salary: { has_salary_income: false }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 840000 }] }, business_income: { has_business_or_fo_income: true, business_entries: [{ trade_name: "Mehta Advisory Services", nature: "consulting", net_profit_inr: 900000, holding_pct: 5 }] }, capital_gains: { short_term_15_pct: 180000 } },
      // Occasional fantasy-sports/online-gaming winnings (very common alongside
      // NRI rental/dividend income today) plus an unexplained cash deposit the
      // client can't source-document (a routine real-world s.195/115BBE flag, not a
      // fabricated edge case).
      other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 260000, dividend_inr: 220000, online_gaming_winnings_inr: 180000, unexplained_income_115BBE_inr: 250000 },
      deductions: {},
      lrs_outbound: {},
      tax_credits: { tds_already_deducted_inr: 430000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Rohan Mehta", date_of_birth: "1985-03-22", filing_status: "mfj", ssn_or_itin_type: "ssn" },
      us_residency_detail: { is_us_citizen: false, has_green_card: true, us_days_current_year: 345, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "none" },
      income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Northwind Labs", wages_box1_usd: 158000, qualified_tip_income_usd: 2400, qualified_overtime_premium_usd: 5800, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 30000, medicare_wages_box5_usd: 158000 } }], self_employment: [{ business_name: "Mehta Analytics (consulting)", self_employment_earnings_usd: 62000 }], interest_us_source_usd: 5200, ordinary_dividends_us_source_usd: 6400, qualified_dividends_us_source_usd: 4000, ltcg_us_source_usd: 12000, rental_income_us_source_usd: 27000 },
      income_foreign_source: { foreign_rental_income_usd: 14458, foreign_dividends_usd: 2651, foreign_interest_usd: 3133, foreign_stcg_usd: 2169 },
      retirement_accounts: { "401k_employee_contribution_usd": 23000, "401k_employer_match_usd": 9500, roth_ira_contribution_usd: 7000, hsa_contribution_usd: 4150 },
      financial_holdings: [{ asset_name: "Fidelity — Taxable Brokerage", account_type: "taxable_brokerage", peak_balance_usd: 224000, country: "US" }, { asset_name: "Vanguard — VTSAX / VTI", account_type: "taxable_brokerage", peak_balance_usd: 141000, country: "US" }],
      real_estate: { has_real_estate_transaction: true, properties: [{ name: "Rental condo — Jersey City, NJ", property_type: "Residential rental", gross_rent_usd: 36000, expenses_usd: 9000 }] },
      // Deliberate demo error: a US-based green-card holder (365 US days) cannot
      // claim FEIE — no foreign tax home, no presence test. The engine must zero
      // the exclusion and raise the "FEIE claimed but not eligible" conflict.
      foreign_earned_income: { claims_feie: true, feie_amount_claimed_usd: 14458, tax_home_country: "United States", bona_fide_residence: false, physical_presence: false, days_in_us_during_test_period: 365 },
      bank_accounts: [{ bank_name: "SBI (NRO)", account_type: "nro", country: "India", peak_balance_usd: 31325 }, { bank_name: "Axis (NRE)", account_type: "nre", country: "India", peak_balance_usd: 22892 }],
      fbar_aggregate_peak_usd: 54217,
      foreign_entities: { owns_10_percent_foreign_corp: false, foreign_corporations: [], pfic_holdings: [{ asset_name: "SBI Bluechip Fund", holding_value_usd: 50602 }, { asset_name: "Mirae Asset Large Cap", holding_value_usd: 31325 }], has_pfics: true },
      ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "Passive", foreign_taxes_usd: 5180 }] },
      withholding_and_estimated: { federal_withholding_total_usd: 30000 },
      nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 3 — Indian ROR with US income.
   * Lives in India (ROR, worldwide), earns US rent/dividends/brokerage; files a
   * US 1040-NR on US-source income. India taxes worldwide → Form 44/§159 relief
   * for US tax; Schedule FA for US assets.
   * ====================================================================*/
  var P3 = {
    id: "india_ror_us_income",
    label: "India ROR · US income",
    story: "Resident of India (ROR), formerly NRI, with US rental, dividends & brokerage. India taxes worldwide → Form 44/§159 credit for US tax; Schedule FA for US assets; files 1040-NR on US-source income with a treaty rate claimed but no W-8BEN on file, plus FIRPTA withholding on a US property sale; kept her Chapter XII-A election on specified assets after becoming ROR.",
    tags: ["Form 44", "Schedule FA", "1040-NR", "FIRPTA"],
    router: router("Anita Desai", { is_us_citizen: false, has_green_card: false, us_days: 35, date_of_birth: "1982-11-09" }),
    india: {
      profile: { full_name: "Anita Desai", entity_type: "individual", date_of_birth: "1982-11-09", pan: "AADPD9012R", tax_regime: "OLD" },
      residency_detail: { days_in_india_current_year: 320, final_india_residency_status: "ROR" },
      dtaa: { tax_residency_country: "IN", is_us_resident_for_dtaa: false, dtaa_treaty_residence: "none", trc_status: true, form_10f: true },
      // Was NRI for years before moving back; kept the Chapter XII-A election
      // on her specified foreign-exchange assets even after becoming ROR
      // (s.217 permits this by re-filing annually) — a real, easy-to-miss
      // retained-concession scenario, not just a first-time NRI election.
      compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true }, chapter_xiia_elected: true },
      bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 1800000 }],
      property: { has_indian_property_transaction: false, properties: [] },
      financial_holdings: { has_financial_transactions: false, transactions: [] },
      foreign_assets: { has_foreign_assets: true, assets: [{ country: "US", type: "brokerage", value_inr: 6800000 }, { country: "US", type: "real_estate", value_inr: 12000000 }] },
      domestic_income: { salary: { has_salary_income: true, taxable_salary_inr: 3600000 }, house_property: { has_house_property_income: false, properties: [] }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: {} },
      // LTCG well above the s.198 exemption threshold — exercises the fix
      // where totalIncomeInr now correctly excludes the exempt slice instead
      // of counting the full gross gain.
      capital_gains: { ltcg_112a_inr: 300000 },
      other_sources: { has_other_sources_income: true, interest_savings_inr: 60000, interest_fd_rd_inr: 140000 },
      deductions: { s80C: { epf_employee_inr: 150000 }, s80D: { self_family_premium_inr: 25000 } },
      lrs_outbound: {},
      tax_credits: { advance_tax_q1_15jun_inr: 200000, advance_tax_q2_15sep_inr: 200000, tds_already_deducted_inr: 150000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Anita Desai", date_of_birth: "1982-11-09", filing_status: "single", ssn_or_itin_type: "itin" },
      us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 35, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN", dtaa_treaty_residence: "IN" },
      income_us_source: { has_real_estate: true, interest_us_source_usd: 1800, ordinary_dividends_us_source_usd: 9600, qualified_dividends_us_source_usd: 7000, ltcg_us_source_usd: 22000, rental_income_us_source_usd: 30000 },
      income_foreign_source: {},
      foreign_earned_income: { claims_feie: false },
      bank_accounts: [{ bank_name: "Chase", account_type: "checking", country: "US", peak_balance_usd: 42000 }],
      fbar_aggregate_peak_usd: 0,
      foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
      retirement_accounts: {},
      ftc_inputs: { claims_ftc: false },
      withholding_and_estimated: { federal_withholding_total_usd: 9800 },
      // Treaty rate claimed on FDAP but no W-8BEN on file (nra_w8ben_missing),
      // plus a US real-property disposition subject to FIRPTA withholding.
      nra_specific: {
        files_form_1040nr: true, us_eci_income_usd: 30000, us_fdap_income_usd: 11400,
        treaty_rate_claims: [{ income_type: "dividends", rate: 15 }], submitted_w8ben: false,
        us_real_property_disposed: true, firpta_withholding_usd: 45000
      },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 4 — Founder with an INDIAN COMPANY (CFC / GILTI / 5471).
   * US resident owning ≥10% of an Indian Pvt Ltd. Exercises the entity/CFC path
   * (fully separated once multi-entity Phase 1 lands).
   * ====================================================================*/
  var P4 = {
    id: "founder_indian_company",
    label: "Founder · Indian company",
    story: "US resident owning an Indian Pvt Ltd (≥10%). Triggers Form 5471 + GILTI/Subpart-F on the US side while the company is taxed in India, plus a partial share buyback from his own company — India taxes it as a deemed dividend, the US likely as a capital gain. Two kids — the first demo of the (OBBBA, TY2025-2028) $2,200/child Child Tax Credit, and (both grandparents having pitched in) the first demo of a Trump Account (§530A) contribution cap breach — $11,000 across 2 children against the $10,000 combined annual cap. (Full entity separation arrives with multi-entity Phase 1.)",
    tags: ["Form 5471", "GILTI", "CFC", "entity", "buyback", "CTC", "Trump Account"],
    router: router("Vikram Rao", { is_us_citizen: false, has_green_card: true, us_days: 340, date_of_birth: "1986-05-30" }),
    india: {
      profile: { full_name: "Vikram Rao", entity_type: "individual", date_of_birth: "1986-05-30", pan: "AAVPR3456S", tax_regime: "NEW" },
      residency_detail: { days_in_india_current_year: 25, final_india_residency_status: "NR" },
      // A dividend treaty election on his full ₹5L dividend at 25% (Art
      // 10(2)(b), the generic portfolio rate) — but the domestic s.207
      // dividend rate (20%) is actually LOWER. TRC/Form 41 are on file this
      // time, but s.159 still guarantees him whichever is more beneficial,
      // so this mistaken election has zero effect (still taxed at 20%) even
      // though it's sitting on file claiming 25%. Contrast: an interest
      // election on ₹2L of NRO interest at 15% (Art 11(2)(b)) genuinely
      // beats the 20% domestic rate, and docs are present, so THIS one
      // actually lowers his tax — the success case neither Rohan (docs
      // missing) nor his own dividend election (worse rate) demonstrates.
      dtaa: { tax_residency_country: "US", is_us_resident_for_dtaa: true, dtaa_treaty_residence: "US", trc_status: true, form_10f: true, treaty_elections: [
        { income_type: "dividend", amount_inr: 500000, elected_rate: 0.25, treaty_article: "Art 10(2)(b)" },
        { income_type: "interest", amount_inr: 200000, elected_rate: 0.15, treaty_article: "Art 11(2)(b)" }
      ] },
      compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true } },
      bank_accounts: [{ bank_name: "Kotak (Company)", account_type: "current", peak_balance_inr: 5400000 }],
      property: { properties: [] },
      financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "unlisted_equity", asset_name: "Nova Systems Pvt Ltd (100%)", value_inr: 45000000 }] },
      unlisted_equity: { has_unlisted_equity_transaction: true, transactions: [{ company: "Nova Systems Pvt Ltd", holding_pct: 100 }] },
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: { short_term_15_pct: 100000 } },
      // A partial share buyback by his own company — a routine founder
      // liquidity event, and exactly the s.2(40)(f) vs. capital-gain
      // characterization mismatch the US side will book differently.
      other_sources: { has_other_sources_income: true, dividend_inr: 500000, interest_fd_rd_inr: 200000, deemed_dividend_from_buyback_inr: 3500000 },
      // A brought-forward STCG loss bigger than this year's STCG gain — only
      // partly absorbed, the rest keeps carrying forward. The third state of
      // the loss set-off computation, distinct from Aarav's full absorption
      // and the HUF's total non-absorption.
      carry_forward_losses: { has_brought_forward_losses: true, stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 250000 }] },
      deductions: {},
      lrs_outbound: {},
      tax_credits: { advance_tax_q1_15jun_inr: 600000, advance_tax_q2_15sep_inr: 700000, advance_tax_q3_15dec_inr: 700000, advance_tax_q4_15mar_inr: 500000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      // Two kids — well under the $400k MFJ Child Tax Credit phase-out, so
      // this demonstrates the full $2,200/child CTC (§24, TY2025-2028 OBBBA
      // amount) with no phase-out reduction.
      profile: { tax_entity_type: "individual", full_name: "Vikram Rao", date_of_birth: "1986-05-30", filing_status: "mfj", ssn_or_itin_type: "ssn", incorporated_in_us: false, dependents_count: 2, trump_accounts_opened: true, trump_accounts_num_children: 2, trump_accounts_children_born_2025_2028: 1, trump_accounts_total_contributions_usd: 11000 },
      us_residency_detail: { is_us_citizen: false, has_green_card: true, us_days_current_year: 340, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "none" },
      income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Nova Systems USA Inc", wages_box1_usd: 165000, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 31000, medicare_wages_box5_usd: 165000 } }], interest_us_source_usd: 3400, ordinary_dividends_us_source_usd: 5200, qualified_dividends_us_source_usd: 3600, ltcg_us_source_usd: 18000 },
      income_foreign_source: { foreign_dividends_usd: 6024 },
      foreign_earned_income: { claims_feie: false },
      bank_accounts: [{ bank_name: "Kotak (Company)", account_type: "current", country: "India", peak_balance_usd: 65060 }],
      fbar_aggregate_peak_usd: 65060,
      foreign_entities: { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corp_name: "Nova Systems Pvt Ltd", country: "IN", ownership_pct: 100, gilti_income_usd: 108433, subpart_f_income_usd: 0, section_962_election_active: false }], pfic_holdings: [], has_pfics: false },
      retirement_accounts: { "401k_employee_contribution_usd": 23000, "401k_employer_match_usd": 8000 },
      financial_holdings: [{ asset_name: "Fidelity — Taxable Brokerage (US equities)", account_type: "taxable_brokerage", peak_balance_usd: 240000, country: "US" }],
      real_estate: { has_real_estate_transaction: true, properties: [{ name: "Primary home — Austin, TX", property_type: "Residential (own use)", gross_rent_usd: 0, expenses_usd: 0 }] },
      ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 30120 }] },
      withholding_and_estimated: { federal_withholding_total_usd: 22000 },
      nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 5 — US citizen expat in India (FEIE + PFIC).
   * ====================================================================*/
  var P5 = {
    id: "us_citizen_expat_india",
    label: "US Citizen expat in India",
    story: "US citizen living/working in India, past traditional retirement age but still consulting. FEIE on foreign earned income, PFIC on Indian MFs, FBAR — US citizenship-based taxation always applies. A gift from her father, a long-term green-card holder who formally relinquished it and was found to be a covered expatriate, brings Form 3520 reporting plus the §2801 recipient-side transfer tax. At 67, the first demo of the (OBBBA, TY2025-2028) $6,000 senior deduction.",
    tags: ["FEIE", "PFIC", "citizen", "covered expatriate", "senior deduction"],
    router: router("Grace Thomas", { is_us_citizen: true, has_green_card: false, us_days: 20, date_of_birth: "1958-09-12" }),
    india: {
      profile: { full_name: "Grace Thomas", entity_type: "individual", date_of_birth: "1958-09-12", pan: "AGTPT7890T", tax_regime: "NEW" },
      residency_detail: { days_in_india_current_year: 330, final_india_residency_status: "ROR" },
      dtaa: { tax_residency_country: "IN", dtaa_treaty_residence: "none", trc_status: false, form_10f: false },
      compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
      bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 2100000 }],
      property: { properties: [] },
      financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "Parag Parikh Flexi Cap", value_inr: 1800000 }] },
      domestic_income: { salary: { has_salary_income: true, taxable_salary_inr: 5000000 }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: {} },
      // NPS withdrawal Layer 1 records as taxable this year — exercises the
      // fix where this now actually raises US taxable income (folded into
      // foreign-source pension), distinct from Aarav's EPF-interest case.
      other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 120000, taxable_nps_withdrawal_inr: 30000 },
      deductions: { s80C: { ppf_inr: 150000 } },
      lrs_outbound: {},
      tax_credits: { tds_already_deducted_inr: 900000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Grace Thomas", date_of_birth: "1958-09-12", filing_status: "single", ssn_or_itin_type: "ssn" },
      us_residency_detail: { is_us_citizen: true, has_green_card: false, us_days_current_year: 20, spt_test_met: false, final_us_residency_status: "US_CITIZEN", dtaa_treaty_residence: "none" },
      income_us_source: { interest_us_source_usd: 2400, ordinary_dividends_us_source_usd: 5200, qualified_dividends_us_source_usd: 4100, ltcg_us_source_usd: 9000 },
      income_foreign_source: { foreign_wages: [{ employer_name: "Freshworks (India)", wages_usd: 60241 }], foreign_interest_usd: 1446 },
      foreign_earned_income: { claims_feie: true, foreign_earned_income_usd: 60241, feie_amount_claimed_usd: 60241, qualification_test: "bona_fide_residence", tax_home_country: "India", bona_fide_residence: true, bona_fide_residence_start_date: "2022-06-01", physical_presence: false, days_in_us_during_test_period: 20 },
      bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", country: "India", peak_balance_usd: 25301 }],
      fbar_aggregate_peak_usd: 25301,
      foreign_entities: { foreign_corporations: [], pfic_holdings: [{ asset_name: "Parag Parikh Flexi Cap", holding_value_usd: 21687 }], has_pfics: true },
      financial_holdings: [{ asset_name: "Vanguard — Taxable Brokerage (US, pre-move)", account_type: "taxable_brokerage", peak_balance_usd: 118000, country: "US" }],
      retirement_accounts: { indian_epf_balance_usd: 3600 },
      ftc_inputs: { claims_ftc: false },
      withholding_and_estimated: { federal_withholding_total_usd: 0 },
      nra_specific: { files_form_1040nr: false },
      // Her father, a decades-long US green-card holder, formally relinquished
      // it after retiring back to India and was determined a "covered
      // expatriate" on net worth — the gift he sent her this year carries the
      // §2801 recipient-side transfer tax on top of the ordinary Form 3520 gift
      // reporting (no income tax on the gift itself, but real penalty/tax exposure).
      foreign_gifts_and_trusts: { received_foreign_gifts_above_100k: true, received_gift_from_covered_expatriate: true },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 6 — BUSINESS POV: Indian Pvt Ltd (domestic company).
   * The entity itself is the taxpayer (ITR-6): business profits, corporate
   * tax (§200 22%), advance tax — no salary/retirement.
   * ====================================================================*/
  var B1 = {
    id: "india_pvt_ltd",
    label: "Indian Pvt Ltd (company)",
    story: "Business POV: an Indian domestic company (SaaS exporter). Corporate tax under §200 (22%), MAT check, ITR-6 — business profits, not salary.",
    tags: ["company", "ITR-6", "200", "corporate"],
    router: router("Nimbus Analytics Pvt Ltd", { us_days: 0, has_us_source_income_or_assets: false }),
    india: {
      profile: { full_name: "Nimbus Analytics Pvt Ltd", entity_type: "company", tax_regime: "NEW", turnover_lte_400cr: true, opt_115baa: true, mat_book_profit: 62000000 },
      residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR", is_poem_in_india: true, is_indian_company: true },
      dtaa: { dtaa_treaty_residence: "none", trc_status: false, has_permanent_establishment_in_india: false },
      compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
      bank_accounts: [{ bank_name: "Kotak (Current)", account_type: "current", peak_balance_inr: 42000000 }],
      property: { properties: [] },
      financial_holdings: { has_financial_transactions: false, transactions: [] },
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [{ trade_name: "Nimbus Analytics Pvt Ltd", nature: "software", net_profit_inr: 60000000 }] }, capital_gains: {} },
      other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 900000 },
      deductions: {},
      lrs_outbound: {},
      tax_credits: { advance_tax_q1_15jun_inr: 3000000, advance_tax_q2_15sep_inr: 3500000, advance_tax_q3_15dec_inr: 3500000, advance_tax_q4_15mar_inr: 3000000, tds_already_deducted_inr: 400000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Nimbus Analytics Pvt Ltd", filing_status: "single" },
      us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
      income_us_source: {}, income_foreign_source: {}, foreign_earned_income: { claims_feie: false },
      bank_accounts: [], fbar_aggregate_peak_usd: 0,
      foreign_entities: { foreign_corporations: [], pfic_holdings: [] }, retirement_accounts: {},
      ftc_inputs: { claims_ftc: false }, withholding_and_estimated: {}, nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 7 — BUSINESS POV: US C-Corp with an Indian subsidiary.
   * US C-corp (Form 1120, 21%) + an Indian Pvt Ltd subsidiary (ITR-6);
   * cross-border corporate structure → transfer pricing / CFC territory.
   * ====================================================================*/
  var B2 = {
    id: "us_ccorp_indian_sub",
    label: "US C-Corp + Indian sub",
    story: "Business POV: a Delaware C-Corp (Form 1120, 21%) with an Indian Pvt Ltd subsidiary (ITR-6, 25%). Two corporate taxpayers + cross-border structure.",
    tags: ["C-Corp", "1120", "subsidiary", "corporate"],
    router: router("Cloudspire Inc", { us_days: 365, has_us_source_income_or_assets: true }),
    india: {
      profile: { full_name: "Cloudspire India Pvt Ltd", entity_type: "company", tax_regime: "NEW", turnover_lte_400cr: true, opt_115baa: false },
      residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR", is_poem_in_india: true, is_indian_company: true },
      dtaa: { dtaa_treaty_residence: "none", trc_status: true, has_permanent_establishment_in_india: true },
      compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true } },
      bank_accounts: [{ bank_name: "HSBC (Current)", account_type: "current", peak_balance_inr: 30000000 }],
      property: { properties: [] },
      financial_holdings: { has_financial_transactions: false, transactions: [] },
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [{ trade_name: "Cloudspire India Pvt Ltd", nature: "software", net_profit_inr: 80000000 }] }, capital_gains: {} },
      other_sources: {},
      deductions: {}, lrs_outbound: {},
      tax_credits: { advance_tax_q1_15jun_inr: 4000000, advance_tax_q2_15sep_inr: 5000000, advance_tax_q3_15dec_inr: 5000000, advance_tax_q4_15mar_inr: 4000000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "ccorp", full_name: "Cloudspire Inc", incorporation_state: "DE", incorporated_in_us: true, filing_status: "single" },
      us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 365, spt_test_met: false, final_us_residency_status: "DOMESTIC_ENTITY" },
      income_us_source: { business_income_usd: 4200000, interest_us_source_usd: 60000, c_corporations_1120: [] },
      income_foreign_source: {}, foreign_earned_income: { claims_feie: false },
      bank_accounts: [{ bank_name: "SVB", account_type: "current", country: "US", peak_balance_usd: 1800000 }],
      fbar_aggregate_peak_usd: 0,
      foreign_entities: { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corp_name: "Cloudspire India Pvt Ltd", country: "IN", ownership_pct: 100, gilti_income_usd: 963855, subpart_f_income_usd: 0 }], pfic_holdings: [] },
      retirement_accounts: {},
      ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 240964 }] },
      withholding_and_estimated: { estimated_tax_q1_apr15_usd: 200000, estimated_tax_q2_jun15_usd: 220000 },
      nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 8 — BUSINESS POV: foreign-incorporated holding company with its
   * Place of Effective Management in India (entity-level dual residency).
   * Not incorporated in India, so India's own s.6(3) test hinges entirely on
   * POEM — and this one's POEM facts point straight at Mumbai.
   * ====================================================================*/
  var B3 = {
    id: "foreign_holdco_poem_india",
    label: "Foreign Holdco · POEM in India",
    story: "Business POV: a Singapore-incorporated holding company whose real commercial decisions are made from Mumbai. Not incorporated in India, but its Place of Effective Management facts resolve it to an Indian tax resident anyway — entity-level dual residency with no individual-style tie-breaker to resolve it.",
    tags: ["company", "POEM", "s.6(3)", "entity"],
    router: router("Meridian Holdings Pte Ltd", { us_days: 0, has_us_source_income_or_assets: false }),
    india: {
      profile: { full_name: "Meridian Holdings Pte Ltd", entity_type: "company", tax_regime: "NEW", turnover_lte_400cr: true, opt_115baa: false },
      residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR", is_indian_company: false },
      company_residency: {
        is_active_business: true, board_meetings_primarily_outside_india: true,
        key_management_location: "Mumbai, India", management_delegated_outside_india: false,
        directors_in_india_count: 3, directors_outside_india_count: 2
      },
      dtaa: { dtaa_treaty_residence: "none", trc_status: false, has_permanent_establishment_in_india: false },
      compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
      bank_accounts: [{ bank_name: "DBS (Current)", account_type: "current", peak_balance_inr: 18000000 }],
      property: { properties: [] },
      financial_holdings: { has_financial_transactions: false, transactions: [] },
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [{ trade_name: "Meridian Holdings Pte Ltd", nature: "investment holding", net_profit_inr: 22000000 }] }, capital_gains: {} },
      other_sources: {},
      deductions: {}, lrs_outbound: {},
      tax_credits: { advance_tax_q1_15jun_inr: 1200000, advance_tax_q2_15sep_inr: 1400000, advance_tax_q3_15dec_inr: 1400000, advance_tax_q4_15mar_inr: 1200000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Meridian Holdings Pte Ltd", filing_status: "single" },
      us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
      income_us_source: {}, income_foreign_source: {}, foreign_earned_income: { claims_feie: false },
      bank_accounts: [], fbar_aggregate_peak_usd: 0,
      foreign_entities: { foreign_corporations: [], pfic_holdings: [] }, retirement_accounts: {},
      ftc_inputs: { claims_ftc: false }, withholding_and_estimated: {}, nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  /* ======================================================================
   * PROFILE 9 — BUSINESS POV: an HUF (Hindu Undivided Family).
   * Control-and-management residency test (not day-count, not POEM) —
   * demonstrates the entity-aware fix that HUF is NOT entitled to the
   * individual-only §157 rebate, plus an unlinked PAN/Aadhaar (s.397(2)).
   * ====================================================================*/
  var B4 = {
    id: "sharma_huf",
    label: "Sharma HUF (family investment vehicle)",
    story: "Business POV: an HUF managing ancestral property and FD investments in India. Control & management is NOT wholly outside India, so it stays resident — a different test than the individual day-count. At ~₹6.5L income it sits right at the §157 rebate threshold, demonstrating the entity-aware fix (HUF isn't entitled to the individual-only rebate). PAN also isn't linked to Aadhaar, so every TDS figure here understates the higher rate actually being withheld.",
    tags: ["HUF", "entity", "157", "control and management", "PAN-Aadhaar"],
    router: router("Sharma HUF", { us_days: 0, has_us_source_income_or_assets: false }),
    india: {
      profile: { full_name: "Sharma HUF", entity_type: "huf", tax_regime: "NEW", pan_aadhaar_linked: false },
      residency_detail: { is_wholly_outside_india: false, final_india_residency_status: "ROR" },
      dtaa: {},
      compliance_docs: {},
      bank_accounts: [{ bank_name: "SBI", account_type: "current", peak_balance_inr: 900000 }],
      property: { has_indian_property_transaction: true, properties: [{ address: "Ancestral home, Jaipur", property_type: "Residential", annual_value_inr: 300000, gross_rent_received_inr: 360000, municipal_taxes_paid_inr: 12000 }] },
      financial_holdings: { has_financial_transactions: false, transactions: [] },
      domestic_income: { salary: { has_salary_income: false }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 300000 }] }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: {} },
      other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 350000 },
      deductions: {},
      // A prior-year business loss and STCG loss on file, but the HUF has no
      // business income or capital gains THIS year to absorb either against
      // — demonstrates the "correctly stays fully carried forward, nothing
      // to set off" branch of the loss set-off computation.
      carry_forward_losses: { has_brought_forward_losses: true, business_loss_cf: [{ assessment_year: "AY2023-24", amount_inr: 500000 }], stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 200000 }] },
      lrs_outbound: {},
      tax_credits: { tds_already_deducted_inr: 15000 },
      metadata: meta("layer1_india_v5_1", "TY2026-27")
    },
    us: {
      profile: { tax_entity_type: "individual", full_name: "Sharma HUF", filing_status: "single" },
      us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
      income_us_source: {}, income_foreign_source: {}, foreign_earned_income: { claims_feie: false },
      bank_accounts: [], fbar_aggregate_peak_usd: 0,
      foreign_entities: { foreign_corporations: [], pfic_holdings: [] }, retirement_accounts: {},
      ftc_inputs: { claims_ftc: false }, withholding_and_estimated: {}, nra_specific: { files_form_1040nr: false },
      metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
    }
  };

  var PROFILES = [P1, P2, P3, P4, P5, B1, B2, B3, B4];

  function listProfiles() {
    return PROFILES.map(function (p) { return { id: p.id, label: p.label, story: p.story, tags: p.tags }; });
  }
  function getProfile(id) {
    for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === id) return PROFILES[i];
    return null;
  }
  // Seed all three localStorage keys and notify open pages.
  function loadProfile(id) {
    var p = getProfile(id);
    if (!p) return false;
    try {
      // Clean slate: wipe ALL wising_* keys first so no field from a previously
      // loaded profile (or a manually-edited Layer 1 form) can bleed through.
      try {
        for (var i = root.localStorage.length - 1; i >= 0; i--) {
          var k = root.localStorage.key(i);
          if (k && k.indexOf("wising_") === 0) root.localStorage.removeItem(k);
        }
      } catch (e) {}
      root.localStorage.setItem(KEYS.ROUTER, JSON.stringify(p.router));
      root.localStorage.setItem(KEYS.INDIA, JSON.stringify(p.india));
      root.localStorage.setItem(KEYS.US, JSON.stringify(p.us));
      root.localStorage.setItem(ACTIVE_KEY, id);
      // notify same-tab listeners (storage event only fires cross-tab)
      try { root.dispatchEvent(new StorageEvent("storage", { key: KEYS.INDIA })); } catch (e) {}
      try { root.dispatchEvent(new CustomEvent("wising:profile", { detail: { id: id } })); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }
  function activeProfileId() {
    try { return root.localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; }
  }

  WISING.PROFILES = PROFILES;
  WISING.listProfiles = listProfiles;
  WISING.getProfile = getProfile;
  WISING.loadProfile = loadProfile;
  WISING.activeProfileId = activeProfileId;
})(typeof window !== "undefined" ? window : globalThis);

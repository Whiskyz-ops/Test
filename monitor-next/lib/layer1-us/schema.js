// Canonical US Layer 1 intake schema.
//
// This is a verbatim port of the `usState` default-value literal from
// layer1_us.html:4069-4381 (the vanilla-JS wizard). That file is the real
// schema source of truth for this product: dag_py's node definitions cite
// these exact dotted field paths in their own `layer1_fields` tuples (e.g.
// ustax.py's `"amt_inputs.minimum_tax_credit_carryforward_usd"`), and
// lib/dag-adapter.js reads the serialized result of this shape back out of
// localStorage under the same key every existing compute path already uses.
//
// Deliberately NOT reconciled against layer1_us.html's second, separate
// SUPERSET_SCHEMA_TEMPLATE object (~1,450 lines, used there only to
// guarantee a stable export shape via a deep-merge). That reconciliation
// is flagged as a known follow-up, not attempted here — see the migration
// gap report.

export function createDefaultUsState() {
  return {
    profile: {
      tax_entity_type: "individual",
      llc_tax_election: "individual",
      incorporation_state: null,
      incorporated_in_us: null,
      full_name: null,
      date_of_birth: null,
      filing_status: "single",
      ssn_or_itin: null,
      ssn_or_itin_type: "none",
      dependents_count: 0,
      spouse_is_us_person: null,
      // Added (chrome/structure verification pass): layer1_us.html:737,
      // "Sharing dependents with an ex-spouse?" (Form 8332 release/claim).
      // No dag_py/JS-DAG node reads this yet — same status as the original,
      // which collects it but doesn't feed it into any CTC computation
      // either. Added for field-parity with the real onboarding screen.
      form_8332_active: false,
      // Bug fix (real HTML-export comparison): missing entirely.
      // layer1_us.html:704 (`prof-hoh-override` select) lets a taxpayer
      // override their computed filing-status eligibility to force/deny
      // Head of Household treatment.
      hoh_marital_override: null,
      // Bug fix: was missing entirely from this schema and from
      // ProfileStep.jsx's UI, even though lib/dag/ustax-nodes.js's
      // usVisaTypeRaw node reads "profile.visa_type" to drive Article 21(2)
      // treaty-benefit eligibility (F-1/J-1) in nraTaxResult. Ported from
      // layer1_us.html:1130-1140 (`prof-visa-type` select, default option
      // value "none").
      visa_type: "none",
      // Bug fix (verification pass): dag_py's ustax_full.py:734 and
      // lib/dag/ustax-full-nodes.js:333 both read "profile.state_of_domicile"
      // as the sole authoritative source for usEntityStateOfDomicileRaw (the
      // state-tax nexus determination for entity filers). The React port had
      // 3 write sites all targeting corporate_profile.state_of_domicile
      // instead — a path no DAG node reads — so this value never reached
      // state-tax computation for any corporate filer. Consolidated to this
      // single path; corporate_profile's copy removed below rather than kept
      // as a second owner (the exact "two paths, one field" bug class found
      // repeatedly elsewhere in this port).
      state_of_domicile: null,
      // Bug fix (real HTML-export comparison): a real buildSupersetSchema()
      // export confirms the source's own usState literal duplicates these 6
      // corporate identity fields onto BOTH `profile` and `corporate_profile`
      // independently (both objects carry entity_name/ein/
      // date_of_incorporation/naics_code/is_foreign_owned_25_pct/
      // is_foreign_corporation). No DAG node reads the profile.* copies —
      // restored here purely for shape-parity with the source, same
      // dead-field-kept-for-fidelity treatment as corporate_profile.
      // state_of_domicile below.
      entity_name: null,
      ein: null,
      date_of_incorporation: null,
      naics_code: null,
      is_foreign_corporation: false,
      is_foreign_owned_25_pct: false,
      trump_accounts_opened: false,
      trump_accounts_children: [],
      trump_accounts_num_children: 0,
      trump_accounts_children_born_2025_2028: 0,
      trump_accounts_total_contributions_usd: 0,
      trust_retained_income_usd: 0,
    },
    corporate_profile: {
      entity_name: null,
      ein: null,
      date_of_incorporation: null,
      naics_code: null,
      fiscal_year_end: "12-31",
      is_foreign_owned_25_pct: false,
      is_foreign_corporation: false,
      // Bug fix: previously dropped entirely when state_of_domicile was
      // consolidated onto profile.state_of_domicile (the sole DAG-read
      // path — dag_py's ustax_full.py:734, ustax-full-nodes.js:333). A real
      // HTML export shows the source itself keeps BOTH copies (both null by
      // default) — restored for field-parity. Stays dead/back-compat here
      // exactly as in the source: nothing should write to it as a second
      // source of truth.
      state_of_domicile: null,
    },
    corporate_international: {
      fdii_eligible_income: null,
      ncti_tested_income: null,
      form_5472_related_parties: [],
    },
    corporate_financials: {
      schedule_l: {
        assets_beginning: 0,
        assets_ending: 0,
        liabilities_beginning: 0,
        liabilities_ending: 0,
        equity_beginning: 0,
        equity_ending: 0,
      },
      schedule_m1: {
        net_income_per_books: 0,
        federal_tax_expense: 0,
        meals_disallowed_50: 0,
        tax_depreciation_over_book: 0,
        taxable_income: 0,
        // Bug fix (real HTML-export comparison): schema.js previously had
        // only 5 of the 9 Schedule M-1 (Reconciliation of Income) fields the
        // source declares (layer1_us.html's usState literal + a real
        // buildSupersetSchema() export both confirm all 9).
        tax_exempt_interest: 0,
        other_additions: 0,
        other_subtractions: 0,
        interest_expense_limitation: 0,
        foreign_taxes_credited: 0,
      },
      schedule_m2: {
        retained_earnings_beginning: 0,
        distributions_dividends_paid: 0,
        retained_earnings_ending: 0,
      },
    },
    us_residency_detail: {
      is_us_citizen: false,
      has_green_card: false,
      green_card_grant_date: null,
      i407_surrendered_date: null,
      green_card_years_held: 0,
      expatriation_net_worth_usd: 0,
      expatriation_avg_net_income_tax_usd: 0,
      form_8854_5yr_compliance_certified: false,
      us_days_current_year: 0,
      us_days_minus_1_year: 0,
      us_days_minus_2_years: 0,
      exempt_individual_status: "none",
      exempt_first_year: null,
      exempt_prior_years_count: 0,
      exempt_student_closer_conn_exception: false,
      exempt_scholar_lookback_exception: false,
      closer_connection_claim: null,
      first_year_choice_election: false,
      first_year_choice_entry_date: null,
      s6013g_joint_election: false,
      spt_day_count_weighted: 0,
      spt_test_met: false,
      final_us_residency_status: "NON_RESIDENT_ALIEN",
      dtaa_treaty_residence: "none",
      residency_start_date: null,
      residency_end_date: null,
      // Bug fix (real HTML-export comparison): missing entirely — the
      // dual-status year's arrival/departure dates (used alongside
      // final_us_residency_status === "DUAL_STATUS") and the SPT
      // day-exclusion detail fields (exempt-individual/medical-condition
      // excluded days per lookback year, plus the reason code) that
      // spt_day_count_weighted's calculation depends on.
      dual_status_arrival_date: null,
      dual_status_departure_date: null,
      us_days_excluded_current: 0,
      us_days_excluded_minus_1: 0,
      us_days_excluded_minus_2: 0,
      us_days_excluded_reason: null,
    },
    corp_state_nexus: {
      physical_states: [],
      economic_states: [],
      needs_apportionment: false,
      apportionment_factors: {},
      has_remote_workers: false,
    },
    state_residency: {
      jan_1_domicile_state: "",
      dec_31_domicile_state: "",
      total_states_footprint: [],
      primary_state_of_residence: "",
      moved_states_this_year: false,
      previous_state: "",
      move_date: null,
      state_days_in_current_state: null,
      dependents_school_state: "",
      primary_bank_and_medical_nexus_state: "",
      vehicles_registered_state: "",
      has_remote_worker: false,
      remote_worker_employer_state: "",
      active_duty_military_or_spouse: false,
      military_home_state_of_record: "",
      military_duty_station_state: "",
      ca_planning_departure: false,
      ca_retains_property_or_voter_reg: false,
      // Bug fix (real HTML-export comparison): missing entirely — New
      // York's own state-specific statutory-residency test fields (the
      // 548-day rule for nonresidents working abroad, actual days
      // physically present, and whether a permanent place of abode is
      // maintained), plus two generic tracking objects the source keeps
      // (footprint_details keyed by state for the multi-state day-count
      // detail behind total_states_footprint, and sticky_exceptions for
      // per-state "sticky residency" rule overrides).
      ny_548_day_rule: false,
      ny_actual_days_present: null,
      ny_permanent_place_of_abode: false,
      footprint_details: {},
      sticky_exceptions: {},
    },
    income_us_source: {
      has_employment_income: false,
      has_capital_gains: false,
      has_crypto: false,
      stocks_needs_wash_sale_reconciliation: false,
      crypto_needs_wash_sale: false,
      has_sec_1256: false,
      has_qof_rollover: false,
      has_qsbs: false,
      has_real_estate: false,
      has_1031_exchange: false,
      has_installment_sale: false,
      has_collectibles: false,
      has_capital_loss_carryovers: false,
      st_loss_carryover_usd: null,
      lt_loss_carryover_usd: null,
      self_employment: [],
      partnerships_k1: [],
      s_corporations_k1: [],
      c_corporations_1120: [],
      farming_schedule_f: [],
      trusts_estates_k1: [],
      // Added post-port (not present in layer1_us.html's usState literal):
      // IncomeUsStep.jsx's W-2 repeatable line items need a home; the
      // original vanilla-JS wizard writes these via full-DOM-rescrape sync
      // functions instead of a schema-declared array, so there was nothing
      // to port verbatim.
      //
      // NAMING FIX (verification pass): this array MUST be named `wages_w2`,
      // not `w2_wages`. Confirmed against both DAG consumers, which hardcode
      // the dotted path `income_us_source.wages_w2[]` and read sub-fields
      // like `wages_box1_usd`/`tax_details_collapsed_by_default.*` off it:
      //   - dag_py/src/wising_dag/us/aggregate_us_income.py:174,605-612
      //   - dag_py/src/wising_dag/us/us5_penalty_72t.py:87,90,135,138
      //   - monitor-next/lib/dag/us5-nodes.js:87,159
      //   - monitor-next/lib/dag/aggregateusincome-nodes.js:398
      // The array was previously named `w2_wages` here and in
      // IncomeUsStep.jsx, which meant every W-2 a user entered was silently
      // invisible to both DAG engines (wages, withholding, everything W-2
      // derives) — the worst class of bug for a tax intake tool. Renamed;
      // this resolves the "naming decision" flagged in the migration gap
      // report (item 1) definitively rather than leaving it open.
      wages_w2: [],
      se_health_insurance_deduction_usd: null,
      se_retirement_deduction_usd: null,
      interest_us_bank_usd: null,
      interest_us_treasury_usd: null,
      interest_us_oid_usd: null,
      interest_us_private_usd: null,
      interest_us_exempt_usd: null,
      interest_us_source_usd: null,
      ordinary_dividends_us_source_usd: null,
      qualified_dividends_us_source_usd: null,
      stcg_us_source_usd: null,
      ltcg_us_source_usd: null,
      rental_income_us_source_usd: null,
      royalty_income_us_source_usd: null,
      // Added post-port: the DAG's actual royalty reader
      // (aggregate_us_income.py:399, aggregateusincome-nodes.js:605,
      // findings.py:248) reads `royalties_direct_us_source_usd`, NOT
      // `royalty_income_us_source_usd` above. Both names exist because the
      // *original* layer1_us.html itself never reconciled them (its usState
      // literal declares royalty_income_us_source_usd, but its DOM handler
      // at layer1_us.html:2196 writes royalties_direct_us_source_usd — see
      // PassiveStep.jsx's file-header note, which found this independently).
      // royalty_income_us_source_usd is kept here for back-compat with
      // anything already reading it, but it is DEAD as far as the DAG is
      // concerned; IncomeUsStep.jsx now writes the field the DAG reads.
      royalties_direct_us_source_usd: null,
      k1_passthrough_income_usd: null,
      ira_distributions_usd: null,
      "401k_distributions_usd": null,
      social_security_benefits_usd: null,
      crypto_transactions: [],
      // Bug fix (real HTML-export comparison): a dozen scalar income lines
      // and 4 line-item arrays were missing entirely — has_business_income
      // is the Schedule C/self-employment gate flag (parallel to
      // has_employment_income above); rental_expenses_us_source_usd pairs
      // with rental_income_us_source_usd; state_local_tax_refund_usd,
      // unemployment_compensation_usd, alimony_received_usd,
      // cancellation_of_debt_usd, hsa_msa_distributions_usd, and
      // misc_other_income_usd are "Other Income" (Schedule 1) lines with no
      // prior home anywhere in this schema; qsbs_transactions,
      // collectibles_transactions, and real_estate_transactions are
      // per-category capital-transaction arrays distinct from the generic
      // crypto_transactions/capital_gains_transactions arrays already here
      // (same acquisition_date/asset_name/cost_basis_usd/sale_date/
      // sale_proceeds_usd/realized_gain_loss_usd row shape).
      has_business_income: false,
      rental_expenses_us_source_usd: null,
      state_local_tax_refund_usd: null,
      unemployment_compensation_usd: null,
      alimony_received_usd: null,
      cancellation_of_debt_usd: null,
      hsa_msa_distributions_usd: null,
      misc_other_income_usd: null,
      qsbs_transactions: [],
      collectibles_transactions: [],
      real_estate_transactions: [],
      // NAMING FIX (real HTML-export comparison): CapGainsStep.jsx had
      // already self-flagged this as a schema gap (see its own file-header
      // comment) — the vanilla source's manual capital-gains line-item
      // array is `income_us_source.cg_transactions`, and its aggregated
      // proceeds/basis/gain totals are the 6 `cg_manual_*` scalars below
      // (layer1_us.html:5417,5457-5462, recalculateCapitalGainsAggregate()
      // @ 6123-6128). This schema previously declared a same-purpose but
      // differently-named `capital_gains_transactions` array instead, which
      // no DAG node or cross-step aggregator reads — renamed/added to match
      // the source exactly. CapGainsStep.jsx must be updated to read/write
      // these paths instead of capital_gains_transactions.
      cg_transactions: [],
      cg_manual_st_proceeds_usd: null,
      cg_manual_st_basis_usd: null,
      cg_manual_lt_proceeds_usd: null,
      cg_manual_lt_basis_usd: null,
      cg_manual_stcg_usd: null,
      cg_manual_ltcg_usd: null,
    },
    income_foreign_source: {
      foreign_wages: [],
      foreign_interest_usd: null,
      foreign_dividends_usd: null,
      foreign_stcg_usd: null,
      foreign_ltcg_usd: null,
      foreign_rental_income_usd: null,
      foreign_pension_income_usd: null,
      section_988_gains_losses: [],
    },
    foreign_tax_credit_other: {
      entries: [],
    },
    equity_compensation: {
      has_equity_comp: false,
      iso_exercises: [],
      nso_exercises: [],
      rsu_vestings: [],
      espp_purchases: [],
      unvested_restricted_stock_awards: [],
    },
    foreign_earned_income: {
      claims_feie: false,
      qualification_test: "physical_presence",
      tax_home_country: "",
      physical_presence_start_date: null,
      physical_presence_end_date: null,
      days_in_us_during_test_period: 0,
      us_business_days: 0,
      bona_fide_residence_start_date: null,
      foreign_earned_income_usd: null,
      feie_amount_claimed_usd: 0,
      foreign_housing_expenses_usd: null,
      housing_exclusion_base_usd: 21264,
      housing_exclusion_cap_usd: 39870,
      foreign_housing_exclusion_usd: 0,
      // Bug fix (real HTML-export comparison): missing entirely —
      // physical_presence/bona_fide_residence are the two qualification-test
      // met/not-met boolean flags qualification_test's radio choice actually
      // drives (as distinct from the two *_start_date fields above, which
      // just record the elected test's window); bona_fide_visa_type and
      // employer_type feed FEIE eligibility narrowing; us_abode is the
      // "abode in the US" disqualifier the source checks independently of
      // the day-count tests; revoked_past_5_years is the FEIE-revocation
      // lookback the source gates re-election eligibility on.
      physical_presence: false,
      bona_fide_residence: false,
      bona_fide_visa_type: null,
      employer_type: null,
      us_abode: false,
      revoked_past_5_years: false,
    },
    bank_accounts: [],
    fbar_aggregate_peak_usd: 0,
    form_8938_required: false,
    financial_holdings: [],
    real_estate: {
      has_real_estate_transaction: false,
      properties: [],
    },
    retirement_accounts: {
      traditional_ira_contribution_usd: null,
      roth_ira_contribution_usd: null,
      backdoor_roth_executed: false,
      "401k_employee_contribution_usd": null,
      "401k_employer_match_usd": null,
      roth_401k_contribution_usd: null,
      hsa_contribution_usd: null,
      hsa_coverage_type: null,
      solo_401k_contribution_usd: null,
      sep_ira_contribution_usd: null,
      rmd_required: false,
      rmd_amount_usd: 0,
      indian_epf_balance_usd: null,
      indian_ppf_balance_usd: null,
      indian_nps_balance_usd: null,
    },
    foreign_entities: {
      owns_10_percent_foreign_corp: false,
      foreign_corporations: [],
      owns_10_percent_foreign_partnership: false,
      foreign_partnerships: [],
      owns_foreign_disregarded_entity: false,
      foreign_de_details: [],
      // Bug fix (real HTML-export comparison): missing entirely —
      // has_pfics gates the PFIC (Passive Foreign Investment Company,
      // Form 8621) sub-flow, and pfic_holdings is its line-item array. A
      // real export shows rows carry asset_name/holding_value_usd/
      // pfic_election/qef_election_active plus a `_hydratedFromIndia` flag
      // (India Layer 1 prefill marker for holdings ported across from the
      // India intake — leave that flag alone if/when this array is wired
      // up; it is read by the India/US handoff, not by any US DAG node).
      has_pfics: false,
      pfic_holdings: [],
    },
    foreign_gifts_and_trusts: {
      received_foreign_gifts_above_100k: false,
      foreign_gifts: [],
      is_us_beneficiary_of_foreign_trust: false,
      foreign_trust_details: [],
      received_gift_from_covered_expatriate: false,
    },
    itemized_deductions_and_credits: {
      use_standard_or_itemized: "auto",
      state_and_local_taxes_paid_usd: null,
      mortgage_interest_paid_usd: null,
      mortgage_acquisition_date: null,
      charitable_contributions_cash_usd: null,
      charitable_contributions_appreciated_usd: null,
      medical_expenses_usd: null,
      casualty_loss_federal_disaster_usd: null,
      hsa_contributions_usd: null,
      student_loan_interest_usd: null,
      educator_expenses_usd: null,
      child_tax_credit_dependents: null,
      credit_for_other_dependents: null,
      child_and_dependent_care_expenses_usd: null,
      education_credits_aotc_usd: null,
      education_credits_llc_usd: null,
      saver_credit_eligible: false,
      funded_529_plan: false,
      "529_contributions_usd": null,
      "529_state_deduction_state": "",
      qbi_deduction_eligible: false,
      qbi_deduction_usd: 0,
    },
    amt_inputs: {
      iso_preference_total_usd: 0,
      salt_addback_usd: 0,
      private_activity_bond_interest_usd: null,
      amt_exemption_usd: 0,
      amti_usd: 0,
      tentative_minimum_tax_usd: 0,
      amt_due_usd: 0,
      minimum_tax_credit_carryforward_usd: null,
    },
    niit_inputs: {
      modified_agi_usd: 0,
      niit_threshold_usd: 200000,
      net_investment_income_usd: 0,
      niit_due_usd: 0,
    },
    ftc_inputs: {
      claims_ftc: false,
      claims_ftc_simplified_under_300: false,
      elect_accrued_method: false,
      prior_year_carryovers_usd: 0,
      ftc_baskets: [],
    },
    withholding_and_estimated: {
      federal_withholding_total_usd: 0,
      state_withholding_total_usd: 0,
      estimated_tax_q1_apr15_usd: null,
      estimated_tax_q2_jun15_usd: null,
      estimated_tax_q3_sep15_usd: null,
      estimated_tax_q4_jan15_usd: null,
      prior_year_total_tax_usd: null,
      additional_medicare_tax_owed_usd: 0,
    },
    nra_specific: {
      files_form_1040nr: false,
      s6013h_joint_election: false,
      form_w7_itin_application_filed: false,
      spouse_ssn_or_itin_type: "none",
      us_eci_income_usd: 0,
      us_fdap_income_usd: 0,
      treaty_rate_claims: [],
      us_real_property_disposed: false,
      firpta_withholding_usd: null,
      is_lrs_investor: false,
      // Bug fix (real HTML-export comparison, confirms NRA audit finding):
      // has_us_pe (effectively-connected-income depends on whether a US
      // permanent establishment exists under an applicable treaty) and
      // submitted_w8ben (the real, DAG-read W-8BEN-on-file flag) were
      // missing entirely. w8ben_aggregate_status (a status enum this
      // schema previously declared) was removed — it never had a matching
      // control in the source HTML (confirmed dead there too) and nothing
      // downstream, in either DAG engine, ever read it.
      has_us_pe: false,
      submitted_w8ben: false,
    },
    metadata: {
      us_calendar_year: 2026,
      request_id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "us-l1-" + Date.now(),
      source: "onboarding",
      input_completeness: "provisional",
      schema_version: "layer1_us_v1",
      obbba_threshold_table_version: "rev_proc_2025_32",
      created_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      intake_completed: false,
      // Bug fix (real HTML-export comparison): missing entirely. The source
      // persists a SNAPSHOT of the 7 top-level onboarding setup checkboxes
      // here on every setup-flag change (layer1_us.html:6244-6249,
      // updateSidebarVisibility()) purely so a page reload can restore
      // which phases were unlocked without re-deriving from anything else.
      // Field names intentionally do NOT match useOnboardingSetup's live
      // `setupPassiveAny`/`setupForeignAny` — the source's own snapshot
      // object shortens them to `setupPassive`/`setupForeign`
      // (layer1_us.html:6246). setupEntities is hardcoded false in the
      // source (line 6229 — vestigial, no matching UI control), kept here
      // for shape-parity only. NOTE: store.js does not yet write this
      // snapshot on setup-flag changes or read it back on hydrate — schema
      // shape only, the restore-on-reload behavior itself is a follow-up.
      intake_setup: {
        setupW2: false,
        setupBiz: false,
        setupPassive: false,
        setupProp: false,
        setupEntities: false,
        setupForeign: false,
        setupRetirement: false,
        setupEquity: false,
      },
    },
    // Bug fix (real HTML-export comparison): missing entirely — a top-level
    // section (layer1_us.html's usState literal) carrying the tax year the
    // whole intake's threshold tables/brackets are pinned to, distinct from
    // metadata.us_calendar_year (which tracks the intake year itself).
    config: {
      base_year: 2026,
    },
  };
}

// BUG FIX (chrome/structure verification pass): this list previously used
// an invented flat order with the wrong step-3 label/position. The real
// order, numbering, and grouping come directly from layer1_us.html's
// sidebar markup (layer1_us.html:423-620, the `nav-group-*` /
// `phase-accordion-content` blocks) — read verbatim, not reconstructed
// from switchStep()/isStepLocked() alone (those only encode *whether* a
// step is reachable, not where it sits in the visible list). 'step-k1' is
// still dropped — it's a dead reference with no matching panel/button
// anywhere in the source.
export const STEP_IDS = [
  "step-onboarding",
  "step-profile",
  "step-state",
  "step-bank-sync",
  "step-income-us",
  "step-income-foreign",
  "step-feie",
  "step-banks",
  "step-entities",
  "step-gifts",
  "step-retirement",
  "step-business",
  "step-real-estate",
  "step-capgains",
  "step-passive",
  "step-equity",
  "step-deductions",
  "step-amt-niit",
  "step-ftc",
  "step-withholding",
  "step-nra",
  "step-output",
];

// PHASES mirrors layer1_us.html's 11 collapsible `nav-group-*` sidebar
// sections exactly (id, label, member step ids, in source order).
//
// `gateFlag`: BUG FIX (visibility pass) — layer1_us.html doesn't just
// grey out or collapse the 7 setup-card-gated phase groups, it hides the
// entire group (`group.style.display = 'none'`, toggleGroup() @
// layer1_us.html:6251-6285) until the matching onboarding setup card is
// checked, then force-expands it. Phase 0/1/2/10 have no such gate — they
// have no `style="display:none"` and no toggleGroup() call at all, because
// they're essential regardless of what the taxpayer's scope selections
// are. `gateFlag: null` marks those. machine.js's isPhaseVisible(gateFlag,
// ctx) reads ctx.setup[gateFlag] live off the same store isStepLocked
// already reads — single source of truth, not a second copy.
//
// `defaultOpen`: whether the phase renders expanded the first time it's
// visible (Phase 0/1/2/10 always were; gated phases auto-expand the
// instant they become visible per toggleGroup()'s "Auto-expand accordion
// so cards are visible" — approximated here by defaulting every phase's
// open state to true, since a hidden phase's collapse state is moot until
// shown, and once shown it should read as expanded on first appearance).
export const PHASES = [
  { id: "setup", label: "Phase 0: Setup", steps: ["step-onboarding"], gateFlag: null, defaultOpen: true },
  { id: "core", label: "Phase 1: Core Profile", steps: ["step-profile", "step-state"], gateFlag: null, defaultOpen: true },
  { id: "data", label: "Phase 2: Data Integration", steps: ["step-bank-sync"], gateFlag: null, defaultOpen: true },
  { id: "employment", label: "Phase 3: Employment", steps: ["step-income-us"], gateFlag: "setupW2", defaultOpen: true },
  {
    id: "international",
    label: "Phase 4: International",
    steps: ["step-income-foreign", "step-feie", "step-banks", "step-entities", "step-gifts"],
    gateFlag: "setupForeignAny",
    defaultOpen: true,
  },
  { id: "retirement", label: "Phase 5: Retirement", steps: ["step-retirement"], gateFlag: "setupRetirement", defaultOpen: true },
  { id: "business", label: "Phase 6: Business Ops & K-1s", steps: ["step-business"], gateFlag: "setupBiz", defaultOpen: true },
  { id: "realestate", label: "Phase 7: Real Estate", steps: ["step-real-estate"], gateFlag: "setupProp", defaultOpen: true },
  { id: "investments", label: "Phase 8: Investments", steps: ["step-capgains", "step-passive"], gateFlag: "setupPassiveAny", defaultOpen: true },
  { id: "equity", label: "Phase 9: Equity & Cap Table", steps: ["step-equity"], gateFlag: "setupEquity", defaultOpen: true },
  {
    id: "wrapup",
    label: "Phase 10: Wrap-up & Taxes",
    steps: ["step-deductions", "step-amt-niit", "step-ftc", "step-withholding", "step-nra", "step-output"],
    gateFlag: null,
    defaultOpen: true,
  },
];

// STEP_NUMBERS mirrors the source's literal numbering (layer1_us.html:431
// "1. Financial Life Snapshot" ... :612 "21. Form 1040-NR Adjustments").
// step-output is deliberately unnumbered in the source too — it renders as
// a plain "Generate Output" CTA button, not a numbered nav item
// (layer1_us.html:615-617).
export const STEP_NUMBERS = {
  "step-onboarding": 1,
  "step-profile": 2,
  "step-state": 3,
  "step-bank-sync": 4,
  "step-income-us": 5,
  "step-income-foreign": 6,
  "step-feie": 7,
  "step-banks": 8,
  "step-entities": 9,
  "step-gifts": 10,
  "step-retirement": 11,
  "step-business": 12,
  "step-real-estate": 13,
  "step-capgains": 14,
  "step-passive": 15,
  "step-equity": 16,
  "step-deductions": 17,
  "step-amt-niit": 18,
  "step-ftc": 19,
  "step-withholding": 20,
  "step-nra": 21,
};

export const STEP_LABELS = {
  "step-onboarding": "Financial Life Snapshot",
  "step-profile": "Residency",
  "step-state": "State Nexus",
  "step-bank-sync": "Bank Sync & Statements",
  "step-income-us": "Employment Income",
  "step-income-foreign": "Foreign Income",
  "step-feie": "FEIE (Form 2555)",
  "step-banks": "Foreign Assets (FBAR/FATCA)",
  "step-entities": "Foreign Entities",
  "step-gifts": "Foreign Gifts & Trusts",
  "step-retirement": "Retirement Accounts",
  "step-business": "Business Ops & K-1s",
  "step-real-estate": "Real Estate",
  "step-capgains": "Capital Gains & Crypto",
  "step-passive": "Passive & Other",
  "step-equity": "Equity & Cap Table",
  "step-deductions": "Deductions & Credits",
  "step-amt-niit": "AMT & NIIT",
  "step-ftc": "Foreign Tax Credit",
  "step-withholding": "Withholding & Estimates",
  "step-nra": "Form 1040-NR Adjustments",
  // Unnumbered in the source too — renders as a standalone "Generate
  // Output" CTA button (layer1_us.html:615-617), not a numbered nav item.
  "step-output": "Generate Output",
};

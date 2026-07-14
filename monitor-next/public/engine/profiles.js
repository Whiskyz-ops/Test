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

  // ---- quarterly income split ----
  // Profiles previously only carried ANNUAL india.domestic_income / other_sources
  // / capital_gains / lrs_outbound. Layer 1 India's own "no quarters saved yet"
  // migration path (see layer1_india.html _initWindowOnLoad) then dumped the
  // WHOLE annual figure into Q1 and left Q2-Q4 at zero — misrepresenting every
  // profile as "100% earned Apr-Jun" — and it also meant normalize.js's real
  // India-FY/US-CY apportionment logic (computeApportionment in computation.js)
  // never saw quarterly data and always fell back to its documented 75/25
  // even-earning assumption instead of the sharper quarterly basis.
  //
  // buildQuarters() spreads recurring flows evenly across the 4 India-FY
  // quarters (Apr-Jun / Jul-Sep / Oct-Dec / Jan-Mar) so every quarter shows a
  // realistic slice instead of one lump sum. A small set of numeric fields are
  // NOT flows — a % stake, a per-share price, a share count — and are kept
  // whole in Q1 (null elsewhere) rather than divided into meaningless
  // fractions. One-off dated events (e.g. an ESOP exercise) are placed whole
  // in the quarter matching their real date instead of being smeared evenly.
  var QUARTERLY_STATIC_NUMERIC_KEYS = {
    holding_pct: true, shares: true, shares_acquired: true,
    fmv_per_share_inr: true, exercise_price_per_share_inr: true
  };
  function fyQuarterOf(dateStr, baseYear) {
    if (!dateStr) return "Q1";
    var d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "Q1";
    var y = d.getFullYear(), m = d.getMonth(); // 0 = Jan
    if (y === baseYear && m >= 3 && m <= 5) return "Q1";        // Apr-Jun
    if (y === baseYear && m >= 6 && m <= 8) return "Q2";        // Jul-Sep
    if (y === baseYear && m >= 9 && m <= 11) return "Q3";       // Oct-Dec
    if (y === baseYear + 1 && m >= 0 && m <= 2) return "Q4";    // Jan-Mar
    return "Q1";
  }
  // Returns [q1,q2,q3,q4] clones of `node` — flow numbers divided by 4 (any
  // remainder folded into Q4 so the 4 parts always sum back to the original),
  // static numeric keys kept only in Q1 (null elsewhere so they're skipped
  // rather than summed by the quarter-merge), booleans/strings repeated
  // identically (safe: OR-merge / last-value-wins both reproduce the same
  // value), objects/arrays recursed the same way.
  function splitFlow(node) {
    if (node === null || node === undefined) return [null, null, null, null];
    if (Array.isArray(node)) {
      var outA = [[], [], [], []];
      node.forEach(function (el) {
        var parts = splitFlow(el);
        for (var i = 0; i < 4; i++) outA[i].push(parts[i]);
      });
      return outA;
    }
    if (typeof node === "object") {
      var outO = [{}, {}, {}, {}];
      for (var k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        var v = node[k];
        if (typeof v === "number") {
          if (QUARTERLY_STATIC_NUMERIC_KEYS[k]) {
            outO[0][k] = v; outO[1][k] = null; outO[2][k] = null; outO[3][k] = null;
          } else {
            var base = Math.floor(v / 4), rem = v - base * 3;
            outO[0][k] = base; outO[1][k] = base; outO[2][k] = base; outO[3][k] = rem;
          }
        } else if (typeof v === "boolean" || typeof v === "string") {
          outO[0][k] = outO[1][k] = outO[2][k] = outO[3][k] = v;
        } else {
          var parts = splitFlow(v);
          for (var i = 0; i < 4; i++) outO[i][k] = parts[i];
        }
      }
      return outO;
    }
    return [node, node, node, node];
  }
  function buildQuarters(india, baseYear) {
    var di = india.domestic_income || {};
    var os = india.other_sources || {};
    var cg = india.capital_gains || {};
    var lrs = india.lrs_outbound || {};

    // Carve out one-off dated ESOP events before the generic split so they
    // land whole in a single quarter rather than fractionally in all 4.
    var esopEvents = (di.salary && di.salary.esop_perquisite_events) || [];
    var diForSplit = di;
    if (esopEvents.length) {
      diForSplit = JSON.parse(JSON.stringify(di));
      diForSplit.salary.esop_perquisite_events = [];
    }

    var diQ = splitFlow(diForSplit), osQ = splitFlow(os), cgQ = splitFlow(cg), lrsQ = splitFlow(lrs);

    esopEvents.forEach(function (ev) {
      var q = fyQuarterOf(ev.vesting_or_exercise_date || ev.grant_date, baseYear);
      var idx = ["Q1", "Q2", "Q3", "Q4"].indexOf(q);
      diQ[idx].salary.esop_perquisite_events = (diQ[idx].salary.esop_perquisite_events || []).concat([ev]);
    });

    var quarters = {};
    ["Q1", "Q2", "Q3", "Q4"].forEach(function (q, i) {
      quarters[q] = { domestic_income: diQ[i], other_sources: osQ[i], capital_gains: cgQ[i], lrs_outbound: lrsQ[i] };
    });
    // financial_holdings/commodities/unlisted_equity/property/nro_repatriation
    // are NOT summed across quarters by the engine (indiaAnnualSlice never
    // reads them from india.quarters — they stay top-level for tax
    // computation) — but Layer 1 India's own switchQuarter()/
    // aggregateAnnualState() DO treat all 9 categories as quarter-scoped
    // internally, always reading financial_holdings etc from
    // state.quarters[activeQuarter]. Leaving them out of Q1 here meant the
    // form's own quarter-tab machinery would overwrite the real top-level
    // transaction data with an empty per-quarter default the moment it
    // touched Q1 — a real data-loss bug, not just a display gap. Whole
    // discrete-transaction categories go in Q1 only (matching the pre-existing
    // "migration from annual" path's own behavior for nro_repatriation),
    // not split like recurring flows — a single BTC sale or property sale
    // belongs in the quarter it happened in, not divided into meaningless
    // quarter-fractions.
    ["financial_holdings", "commodities", "unlisted_equity", "property", "nro_repatriation"].forEach(function (cat) {
      if (india[cat]) quarters.Q1[cat] = JSON.parse(JSON.stringify(india[cat]));
    });
    return quarters;
  }

  /* ======================================================================
   * PROFILE 1 — Dual resident (India ROR + US SPT). The flagship FTC/tie-break case.
   * ====================================================================*/
  var P1 = {
    id: "dual_resident_h1b",
    label: "Dual Resident — H-1B",
    story: "India ROR + US SPT, senior tech hire in California. Both tax worldwide income → DTAA tie-breaker + FTC shortfall; ISO exercise triggers AMT and mirrors an ESOP grant from his prior Indian employer (equity-comp sourcing); NIIT, a carried-forward capital loss, and a Schedule FA slip round it out. Also sold some Schwab-held AMZN stock after 18 months — India treats a foreign stock as an unlisted security (24mo LTCG threshold, no s.198 exemption) so it's STCG at his slab rate there, but the US calls the same gain LTCG (12mo threshold) — and since he's worldwide-taxed by BOTH countries this year, that's a genuine characterization mismatch with real dollars at stake on both sides, not just a paperwork gap.",
    tags: ["dual residency", "FTC", "PFIC", "AMT", "equity comp", "Foreign equity"],
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
      // AMZN held 18 months (Nov 2024 - May 2026) via his US Schwab brokerage
      // (see the matching account on the US side below): >12mo so LTCG for
      // the US, but <=24mo so STCG-at-slab-rate for India (foreign shares
      // are "unlisted foreign securities" under Indian law — 24mo threshold,
      // not 12) — triggers the holding-period characterization mismatch,
      // and since he's ROR + US worldwide-taxed, it actually fires (unlike
      // a similar holding for a US non-resident-alien, where the US simply
      // doesn't tax the gain at all and there's nothing to mismatch).
      financial_holdings: { has_financial_transactions: true, transactions: [
        { asset_type: "equity_mutual_fund", asset_name: "Axis Bluechip Fund", value_inr: 2500000 },
        { asset_type: "debt_mutual_fund", asset_name: "HDFC Corporate Bond Fund", value_inr: 1200000 },
        {
          asset_class: "foreign_equity_unlisted", asset_name_or_ticker: "AMZN",
          acquisition_date: "2024-11-01", purchase_value: 10000, purchase_currency: "USD",
          sale_date: "2026-05-01", sale_value: 18000, sale_currency: "USD",
          stt_paid: false, transfer_expenses: 0, is_specified_foreign_exchange_asset: false
        }
      ] },
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
      state_residency: { primary_state_of_residence: "CA", ca_retains_property_or_voter_reg: true },
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
    story: "US green-card holder with Indian rent, dividends, mutual funds, a small India consulting stake and a US-side consulting side gig. US taxes worldwide → FTC (Form 1116) for Indian TDS; PFIC; a below-threshold Indian business stake; no US-India Totalization Agreement on his US self-employment tax; plus occasional online-gaming winnings and an unexplained cash deposit back home. His W-2 job also reports qualified tip income and overtime premium pay — the first demo of the (OBBBA, TY2025-2028) \"no tax on tips\"/\"no tax on overtime\" deductions, both intact here since his AGI sits just under the $300,000 MFJ phase-out threshold. Also a general partner in a small consulting LLC — the first demo of partnership K-1 guaranteed payments (previously dropped from income entirely) and Box 14A self-employment earnings (previously unread, so partnership SE tax was always $0).",
    tags: ["FTC 1116", "PFIC", "FBAR", "NR in India", "self-employment", "tips/overtime", "K-1"],
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
      // Computed via s.58/44ADA presumptive (50% of gross receipts) from real
      // Layer 1-shaped fields (gross_receipts_inr, presumptive_scheme) — the
      // first demo profile that DOESN'T inject a hand-authored net_profit_inr,
      // proving the real computation now works (₹18,00,000 x 50% = ₹9,00,000,
      // deliberately matching the old injected figure so nothing else in his
      // profile needed to change).
      domestic_income: { salary: { has_salary_income: false }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 840000 }] }, business_income: { has_business_or_fo_income: true, business_entries: [{ business_name: "Mehta Advisory Services", nature: "consulting", presumptive_scheme: "s44ADA", gross_receipts_inr: 1800000, holding_pct: 5 }] }, capital_gains: { short_term_15_pct: 180000 } },
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
      income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Northwind Labs", wages_box1_usd: 158000, qualified_tip_income_usd: 2400, qualified_overtime_premium_usd: 5800, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 30000, medicare_wages_box5_usd: 158000 } }], self_employment: [{ business_name: "Mehta Analytics (consulting)", self_employment_earnings_usd: 62000 }],
        // A general-partner stake in a small consulting partnership — Box 4
        // guaranteed payments (previously dropped from income entirely) plus
        // Box 1 ordinary income; Box 14A (self_employment_earnings_usd) is the
        // K-1's own combined SE-tax figure, exercising the fix that
        // partnership SE tax was unconditionally $0 before (Box 14A was never
        // read). QBI only picks up the $18,000 ordinary slice, correctly
        // excluding the $12,000 guaranteed payments.
        partnerships_k1: [{ partnership_name: "Meridian Consulting Partners LLC", partner_type: "general", ordinary_business_income_usd: 18000, guaranteed_payments_usd: 12000, self_employment_earnings_usd: 30000 }],
        interest_us_source_usd: 5200, ordinary_dividends_us_source_usd: 6400, qualified_dividends_us_source_usd: 4000, ltcg_us_source_usd: 12000, rental_income_us_source_usd: 27000 },
      income_foreign_source: { foreign_rental_income_usd: 14458, foreign_dividends_usd: 2651, foreign_interest_usd: 3133, foreign_stcg_usd: 2169 },
      retirement_accounts: { "401k_employee_contribution_usd": 23000, "401k_employer_match_usd": 9500, roth_ira_contribution_usd: 7000, hsa_contribution_usd: 4150 },
      financial_holdings: [{ asset_name: "Fidelity — Taxable Brokerage", account_type: "taxable_brokerage", peak_balance_usd: 224000, country: "US" }, { asset_name: "Vanguard — VTSAX / VTI", account_type: "taxable_brokerage", peak_balance_usd: 141000, country: "US" }],
      real_estate: { has_real_estate_transaction: true, properties: [{ name: "Rental condo — Jersey City, NJ", property_type: "Residential rental", gross_rent_usd: 36000, expenses_usd: 9000 }] },
      // Works in Manhattan, lives across the river — NY statutory-residency
      // facts (permanent abode + 184+ days present) put NY state tax in play
      // even though the rental property itself is in NJ (unmodeled — no NJ
      // bracket data exists in this engine).
      state_residency: { primary_state_of_residence: "NY", ny_actual_days_present: 240, ny_permanent_place_of_abode: true },
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
    story: "Resident of India (ROR), formerly NRI, with US rental, dividends & brokerage. India taxes worldwide → Form 44/§159 credit for US tax; Schedule FA for US assets; files 1040-NR on US-source income with a treaty rate claimed but no W-8BEN on file, plus FIRPTA withholding on a US property sale; kept her Chapter XII-A election on specified assets after becoming ROR. Also sold NVDA (held directly in her US brokerage) after 18 months — India treats it as an unlisted foreign security (24mo LTCG threshold, no s.198 exemption) so it's STCG at her slab rate there, but the US calls the same gain LTCG (12mo threshold) — a holding-period characterization mismatch. As an India resident, she also remitted ₹15L to top up that brokerage under LRS — the first demo of s.206C(1G) TCS (20% on the ₹5L over the ₹10L base threshold), a mechanism entirely separate from TDS since it's collected on money leaving India, not income arriving.",
    tags: ["Form 44", "Schedule FA", "1040-NR", "FIRPTA", "Foreign equity"],
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
      // NVDA held 18 months (Feb 2025 - Aug 2026): >12mo so LTCG for the US,
      // but <=24mo so STCG-at-slab-rate for India (foreign shares are
      // "unlisted foreign securities" under Indian law — 24mo threshold,
      // not 12) — triggers the holding-period characterization mismatch.
      financial_holdings: { has_financial_transactions: true, transactions: [
        {
          asset_class: "foreign_equity_unlisted", asset_name_or_ticker: "NVDA",
          acquisition_date: "2025-02-01", purchase_value: 8000, purchase_currency: "USD",
          sale_date: "2026-08-01", sale_value: 15000, sale_currency: "USD",
          stt_paid: false, transfer_expenses: 0, is_specified_foreign_exchange_asset: false
        }
      ] },
      foreign_assets: { has_foreign_assets: true, assets: [{ country: "US", type: "brokerage", value_inr: 6800000 }, { country: "US", type: "real_estate", value_inr: 12000000 }] },
      domestic_income: { salary: { has_salary_income: true, taxable_salary_inr: 3600000 }, house_property: { has_house_property_income: false, properties: [] }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: {} },
      // LTCG well above the s.198 exemption threshold — exercises the fix
      // where totalIncomeInr now correctly excludes the exempt slice instead
      // of counting the full gross gain.
      capital_gains: { ltcg_112a_inr: 300000 },
      other_sources: { has_other_sources_income: true, interest_savings_inr: 60000, interest_fd_rd_inr: 140000 },
      deductions: { s80C: { epf_employee_inr: 150000 }, s80D: { self_family_premium_inr: 25000 } },
      // Remitted funds to top up her US brokerage this year — as an India
      // ROR, LRS (s.206C(1G)) applies: 20% TCS on the ₹5L excess over the
      // ₹10L base threshold, since "investment" isn't one of the
      // concessional-rate purposes (education/medical).
      lrs_outbound: { total_lrs_remitted_this_fy_inr: 1500000, lrs_purpose: "investment" },
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
    story: "US resident owning an Indian Pvt Ltd (≥10%). Triggers Form 5471 + GILTI/Subpart-F on the US side while the company is taxed in India, plus a two-tranche share buyback from his own company. The founder-era tranche — since Budget 2026 (Tax Year 2026-27, s.69) — is unlisted-share LTCG at 12.5%, not the pre-2026 deemed-dividend-at-slab-rates treatment; as a 100%-owner he's also a \"promoter\" under s.69(2)(b), so an additional tax plus a 12% surcharge layers on top of that ordinary LTCG tax. A second, more recent tranche (~17 months held) demonstrates the holding-period characterization mismatch: India's unlisted-share threshold is 24 months (so this is short-term, slab-rate, there) while the US's uniform 12-month threshold makes the SAME gain long-term — the first demo of that cross-border conflict, with a real recomputed US-dollar figure showing what's at stake if the wrong classification is used on the US return. Two kids — the first demo of the (OBBBA, TY2025-2028) $2,200/child Child Tax Credit, and (both grandparents having pitched in) the first demo of a Trump Account (§530A) contribution cap breach — $11,000 across 2 children against the $10,000 combined annual cap. (Full entity separation arrives with multi-entity Phase 1.)",
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
      // Two partial buybacks by his own company, same round of corporate
      // action, two different share tranches:
      //
      // 1. Founder-era shares held since incorporation (>24 months,
      //    unlisted) — Budget 2026 (s.69, ITA 2025) taxes buy-backs on/after
      //    1-Apr-2026 as LTCG @12.5%, not the pre-Apr-2026 full-consideration
      //    deemed dividend at slab rates. Cost basis is nominal founder-share
      //    value: Rs35L consideration less a Rs50k cost basis = Rs34.5L LTCG
      //    (unlisted, no indexation, s.198). As a 100%-owner he's also a
      //    "promoter" (s.69(2)(b)) — modeled via is_promoter, demonstrating
      //    the additional-tax-plus-surcharge layer (30% non-corporate target
      //    rate) on top of the ordinary 12.5% LTCG.
      // 2. A later tranche (a secondary sale of shares from a follow-on
      //    round, acquired 2025-01-15) tendered in the SAME buyback,  held
      //    ~17 months — squarely in the 12-24 month gap where India's
      //    unlisted-share threshold (24mo) and the US's uniform threshold
      //    (12mo) DISAGREE: short-term (slab rate) in India, long-term
      //    (preferential rate) in the US. Demonstrates the holding-period
      //    characterization mismatch finding — same company, same buyback
      //    event, deliberately different holding period from tranche 1 so
      //    the profile shows both the clean case and the mismatch case
      //    side by side.
      //
      // Uses the full per-transaction shape (not the aggregated shortcut)
      // specifically so this profile also exercises normalize.js's
      // transaction-array aggregation path, not just the demo-shortcut one.
      share_buyback: { transactions: [
        {
          company_name: "Nova Systems Pvt Ltd", is_listed: false, is_promoter: true,
          buyback_date: "2026-06-15", original_acquisition_date: "2018-04-01",
          consideration_received_inr: 3500000, original_cost_inr: 50000,
          capital_gain_or_loss: 3450000, gain_classification: "ltcg",
          buyback_pre_or_post_oct2024: "capital_gains_era"
        },
        {
          company_name: "Nova Systems Pvt Ltd", is_listed: false, is_promoter: true,
          buyback_date: "2026-06-15", original_acquisition_date: "2025-01-15",
          consideration_received_inr: 1500000, original_cost_inr: 200000,
          capital_gain_or_loss: 1300000, gain_classification: "stcg_slab",
          buyback_pre_or_post_oct2024: "capital_gains_era"
        }
      ] },
      other_sources: { has_other_sources_income: true, dividend_inr: 500000, interest_fd_rd_inr: 200000 },
      // A brought-forward STCG loss bigger than this year's STCG gain — set
      // off first against current STCG, then the spillover offsets his new
      // buyback LTCG too (s.111/s.198's ordering), fully absorbing it. (Was
      // "only partly absorbed" before the LTCG existed to soak up the
      // spillover — now demonstrates full absorption across two gain types
      // in one year, distinct from the HUF's total non-absorption.)
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
      // Shaped like the real "Add Foreign Corporation" UI (syncCorpState())
      // actually writes — corporation_name/country_of_incorporation/
      // ownership_percentage, not corp_name/country/ownership_pct — so this
      // profile exercises the gap tracker US-26 alias fix instead of the
      // short internal names the engine used to require. gilti_income_usd
      // stays a hand-entered estimate (the real card has no GILTI input at
      // all — that's the separate, larger XB-14 quantification gap), same
      // convention as every other "demo profile injects a figure the real
      // form can't yet produce" shortcut elsewhere in this file.
      foreign_entities: { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corporation_name: "Nova Systems Pvt Ltd", country_of_incorporation: "IN", ownership_percentage: 100, gilti_income_usd: 108433, subpart_f_income_usd: 0, section_962_election_active: false }], pfic_holdings: [], has_pfics: false },
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
      // At 67 she's collecting Social Security while still consulting —
      // exercises the gap tracker US-2 fix (IRC §86 provisional-income
      // worksheet). Her US-source investment income plus half her benefit
      // lands provisional income just above the $25,000 single-filer base
      // threshold, so only a small tier-1 slice (~11%, not 0% and not the
      // old-wrong 100%) of the $24,000 benefit ends up taxable — most of
      // her income is FEIE-excluded foreign wages, which this worksheet
      // correctly leaves out of provisional income.
      income_us_source: { interest_us_source_usd: 2400, ordinary_dividends_us_source_usd: 5200, qualified_dividends_us_source_usd: 4100, ltcg_us_source_usd: 9000, social_security_benefits_usd: 24000 },
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
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [{ business_name: "Nimbus Analytics Pvt Ltd", nature: "software", net_profit_inr: 60000000 }] }, capital_gains: {} },
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
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [{ business_name: "Cloudspire India Pvt Ltd", nature: "software", net_profit_inr: 80000000 }] }, capital_gains: {} },
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
      domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [{ business_name: "Meridian Holdings Pte Ltd", nature: "investment holding", net_profit_inr: 22000000 }] }, capital_gains: {} },
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
   * individual-only §156 rebate, plus an unlinked PAN/Aadhaar (s.397(2)).
   * ====================================================================*/
  var B4 = {
    id: "sharma_huf",
    label: "Sharma HUF (family investment vehicle)",
    story: "Business POV: an HUF managing ancestral property and FD investments in India. Control & management is NOT wholly outside India, so it stays resident — a different test than the individual day-count. At ~₹6.5L income it sits right at the §156 rebate threshold, demonstrating the entity-aware fix (HUF isn't entitled to the individual-only rebate). PAN also isn't linked to Aadhaar, so every TDS figure here understates the higher rate actually being withheld. Also sold some Bitcoin this year for a gain — taxed flat 30% under s.115BBH regardless of how long held, and the family's ₹2,00,000 brought-forward STCG loss can't touch it at all (VDA gains are never loss-set-off eligible, not even against another VDA's loss in the same year) — a common, costly misconception this demo makes concrete. Also sold a plot this year for ₹68L — a purely domestic transaction where the RESIDENT buyer withholds 1% under s.194-IA, the first demo of resident-side (non-NRI) property TDS.",
    tags: ["HUF", "entity", "156", "control and management", "PAN-Aadhaar", "VDA/crypto"],
    router: router("Sharma HUF", { us_days: 0, has_us_source_income_or_assets: false }),
    india: {
      profile: { full_name: "Sharma HUF", entity_type: "huf", tax_regime: "NEW", pan_aadhaar_linked: false },
      residency_detail: { is_wholly_outside_india: false, final_india_residency_status: "ROR" },
      dtaa: {},
      compliance_docs: {},
      bank_accounts: [{ bank_name: "SBI", account_type: "current", peak_balance_inr: 900000 }],
      // Also sold a plot this year — a RESIDENT seller, so the buyer withholds
      // 1% under s.194-IA (not s.195, which is NR-only) on the ₹68L sale
      // consideration. Layer 1 previously only ever collected buyer-TDS
      // detail for NR sellers; this demonstrates it now capturing the same
      // withholding for a domestic resident too.
      property: { has_indian_property_transaction: true, properties: [
        { address: "Ancestral home, Jaipur", property_type: "Residential", annual_value_inr: 300000, gross_rent_received_inr: 360000, municipal_taxes_paid_inr: 12000 },
        { address: "Plot 7, Vasant Vihar, Jaipur", property_type: "Land (non-agricultural)", sale_date: "2026-09-15", sale_consideration: 6800000, sale_consideration_currency: "INR", buyer_tan: "JPRS12345K", buyer_tds_deducted_inr: 68000, buyer_tds_challan_number: "CHLN99182" }
      ] },
      // Bitcoin sold this year for a ₹300,000 gain — s.115BBH flat 30%, no
      // holding-period threshold, no set-off against the ₹200,000 STCG loss
      // carryforward below (loss set-off is a Capital Gains head mechanism;
      // VDA gains sit entirely outside that head).
      financial_holdings: { has_financial_transactions: true, transactions: [
        {
          asset_class: "vda_crypto", asset_name_or_ticker: "BTC", quantity: 0.5,
          acquisition_date: "2023-06-01", purchase_value: 900000, purchase_currency: "INR",
          sale_date: "2026-08-01", sale_value: 1200000, sale_currency: "INR", transfer_expenses: 0
        }
      ] },
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

  // Attach a realistic Q1-Q4 breakdown to every profile (see buildQuarters
  // above) so Layer 1 India's quarter tabs show a genuine spread instead of
  // the whole year dumped into Q1, and so the engine's real quarterly
  // apportionment path (vs. its 75/25 fallback) is actually exercised.
  PROFILES.forEach(function (p) {
    p.india.quarters = buildQuarters(p.india, p.router.base_tax_year || 2026);
  });

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

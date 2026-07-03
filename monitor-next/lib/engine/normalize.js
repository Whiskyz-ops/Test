/* ============================================================================
 * WISING — Layer 2 Engine :: normalize.js
 * ----------------------------------------------------------------------------
 * Reads the two Layer 1 intake states (India + US) plus the Layer 0 router
 * state, and folds them into ONE currency-normalized "unified taxpayer model"
 * that the computation and conflict engines consume.
 *
 * Field paths here are matched to what the Layer 1 forms ACTUALLY persist:
 *   - India income is stored per-quarter under state.quarters.Q1..Q4; the
 *     top-level domestic_income is only the active quarter. We aggregate the
 *     four quarters into an annual figure (mirrors the form's
 *     aggregateAnnualState()).
 *   - US wages live in income_us_source.wages_w2[] as { wages_box1_usd,
 *     tax_details_collapsed_by_default: { federal_tax_withheld_usd, ... } }.
 *   - Filing status is 'single' | 'mfj' | 'mfs' | 'hoh'.
 *
 * We never mutate the Layer 1 states — we project them into a flat, predictable
 * shape and attach both INR and USD to every monetary node.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};
  var CONST = WISING.CONST;

  // -- small helpers ---------------------------------------------------------
  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function inrToUsd(inr) { return num(inr) / CONST.FX.INR_PER_USD; }
  function usdToInr(usd) { return num(usd) * CONST.FX.INR_PER_USD; }
  function moneyFromInr(inr) { var i = num(inr); return { inr: i, usd: inrToUsd(i) }; }
  function moneyFromUsd(usd) { var u = num(usd); return { usd: u, inr: usdToInr(u) }; }
  function addMoney(a, b) { return { usd: a.usd + b.usd, inr: a.inr + b.inr }; }
  function zeroMoney() { return { usd: 0, inr: 0 }; }

  function safe(obj, path, dflt) {
    var cur = obj, parts = path.split("."), i;
    for (i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return dflt;
      cur = cur[parts[i]];
    }
    return (cur === undefined || cur === null) ? dflt : cur;
  }

  function normalizeFilingStatus(s) {
    s = (s || "single").toLowerCase();
    if (s === "married_filing_jointly" || s === "mfj") return "mfj";
    if (s === "married_filing_separately" || s === "mfs") return "mfs";
    if (s === "head_of_household" || s === "hoh") return "hoh";
    return "single";
  }

  /* ------------------------------------------------------------------------
   * loadRawStates — pull the three states out of localStorage (or accept
   * explicitly-passed objects, used for sample data / tests).
   * ----------------------------------------------------------------------*/
  function loadRawStates(opts) {
    opts = opts || {};
    function read(key, override) {
      if (override !== undefined) return override;
      try {
        var raw = root.localStorage && root.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    return {
      router: read(CONST.STORAGE_KEYS.ROUTER, opts.router),
      india: read(CONST.STORAGE_KEYS.INDIA, opts.india),
      us: read(CONST.STORAGE_KEYS.US, opts.us)
    };
  }

  /* ------------------------------------------------------------------------
   * indiaAnnualSlice — return the annual {domestic_income, other_sources,
   * capital_gains, lrs_outbound} by summing the four quarters. Falls back to
   * the top-level objects when no quarterly structure is present.
   * ----------------------------------------------------------------------*/
  function indiaAnnualSlice(india) {
    var quarters = safe(india, "quarters", null);
    if (!quarters) {
      return {
        domestic_income: safe(india, "domestic_income", {}),
        other_sources: safe(india, "other_sources", {}),
        capital_gains: safe(india, "capital_gains", {}),
        lrs_outbound: safe(india, "lrs_outbound", {})
      };
    }
    // Deep-sum numbers across quarters; OR booleans; index-merge arrays.
    function merge(target, source) {
      for (var k in source) {
        if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
        var sv = source[k];
        if (sv === null || sv === undefined) continue;
        if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
        else if (typeof sv === "boolean") target[k] = target[k] || sv;
        else if (Array.isArray(sv)) {
          if (!Array.isArray(target[k])) target[k] = [];
          sv.forEach(function (el, i) {
            if (el && typeof el === "object") {
              target[k][i] = target[k][i] || {};
              merge(target[k][i], el);
            } else if (target[k].indexOf(el) < 0) {
              target[k].push(el);
            }
          });
        } else if (typeof sv === "object") {
          target[k] = target[k] || {};
          merge(target[k], sv);
        } else {
          target[k] = sv;
        }
      }
      return target;
    }
    var out = { domestic_income: {}, other_sources: {}, capital_gains: {}, lrs_outbound: {} };
    ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) {
      var qs = quarters[q]; if (!qs) return;
      if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income);
      if (qs.other_sources) merge(out.other_sources, qs.other_sources);
      if (qs.capital_gains) merge(out.capital_gains, qs.capital_gains);
      if (qs.lrs_outbound) merge(out.lrs_outbound, qs.lrs_outbound);
    });
    return out;
  }

  /* ------------------------------------------------------------------------
   * India income aggregation (annual), normalized to {inr, usd} per head.
   * ----------------------------------------------------------------------*/
  function aggregateIndiaIncome(india, annual) {
    var di = annual.domestic_income || {};
    var os = annual.other_sources || {};

    var salaryTaxable = num(safe(di, "salary.taxable_salary_inr", null)) ||
                        num(safe(di, "salary.gross_salary_inr", 0));
    var salary = moneyFromInr(salaryTaxable);

    var bizEntries = safe(di, "business_income.business_entries", []);
    var business = zeroMoney();
    (bizEntries || []).forEach(function (b) {
      business = addMoney(business, moneyFromInr(b.net_profit_inr || b.net_profit || 0));
    });

    var hpProps = safe(di, "house_property.properties", []);
    var houseProperty = zeroMoney();
    (hpProps || []).forEach(function (p) {
      houseProperty = addMoney(houseProperty, moneyFromInr(
        p.annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0
      ));
    });

    var interest = moneyFromInr(
      num(safe(os, "interest_savings_inr", 0)) +
      num(safe(os, "interest_fd_rd_inr", 0)) +
      num(safe(os, "interest_bonds_inr", 0)) +
      num(safe(os, "interest_on_it_refund_inr", 0)) +
      num(safe(di, "other_sources.interest_inr", 0))
    );
    var dividend = moneyFromInr(num(safe(os, "dividend_inr", 0)));

    // Capital gains — Layer 1 stores transaction data; surface the simple
    // short-term figure the form exposes, plus any annual capital_gains slice.
    var stcg = moneyFromInr(num(safe(di, "capital_gains.short_term_15_pct", 0)) +
                            num(safe(annual.capital_gains, "stcg_111a_inr", 0)));
    var ltcg = moneyFromInr(num(safe(annual.capital_gains, "ltcg_112a_inr", 0)));

    var total = [salary, business, houseProperty, interest, dividend, stcg, ltcg].reduce(addMoney, zeroMoney());

    return {
      salary: salary, business: business, houseProperty: houseProperty,
      interest: interest, dividend: dividend,
      stcg: stcg, ltcg: ltcg,
      capitalGains: addMoney(stcg, ltcg),
      total: total
    };
  }

  /* India deduction inputs (Chapter VI-A) for the tax engine. */
  function aggregateIndiaDeductions(india) {
    var d = safe(india, "deductions", {});
    return {
      s80C: num(safe(d, "s80C.epf_employee_inr", 0)) + num(safe(d, "s80C.ppf_inr", 0)) +
            num(safe(d, "s80C.elss_inr", 0)) + num(safe(d, "s80C.life_insurance_premium_inr", 0)) +
            num(safe(d, "s80C.principal_home_loan_inr", 0)) + num(safe(d, "s80C.tuition_fees_inr", 0)) +
            num(safe(d, "s80C.nsc_inr", 0)) + num(safe(d, "s80C.tax_saving_fd_inr", 0)) +
            num(safe(d, "s80C.sukanya_samriddhi_inr", 0)),
      s80CCD1B: num(safe(d, "s80CCD_1B.nps_additional_inr", 0)),
      s80CCD2_employer: num(safe(india, "domestic_income.salary.employer_nps_contribution_inr", 0)),
      s80D: num(safe(d, "s80D.self_family_premium_inr", 0)) + num(safe(d, "s80D.parents_premium_inr", 0)),
      s80TTA_TTB: num(safe(d, "s80TTA_TTB.savings_interest_inr", 0))
    };
  }

  /* ------------------------------------------------------------------------
   * US income aggregation — keeps the us-source / foreign-source split that
   * drives the FTC limitation, and a qualified/ordinary dividend split that
   * drives the preferential-rate computation.
   * ----------------------------------------------------------------------*/
  function aggregateUsIncome(us) {
    var ui = safe(us, "income_us_source", {});
    var fi = safe(us, "income_foreign_source", {});

    // Wages: wages_w2[].wages_box1_usd  (+ fallbacks for older shapes)
    var wages = zeroMoney(), w2with = 0, medicareWages = 0;
    var w2 = safe(ui, "wages_w2", null);
    if (Array.isArray(w2)) {
      w2.forEach(function (w) {
        wages = addMoney(wages, moneyFromUsd(w.wages_box1_usd || w.wages_tips_compensation_usd || 0));
        var adv = w.tax_details_collapsed_by_default || w;
        w2with += num(adv.federal_tax_withheld_usd || adv.federal_income_tax_withheld_usd || 0);
        medicareWages += num(adv.medicare_wages_box5_usd || w.wages_box1_usd || 0);
      });
    }

    var foreignWages = zeroMoney();
    (safe(fi, "foreign_wages", []) || []).forEach(function (w) {
      foreignWages = addMoney(foreignWages, moneyFromUsd(
        w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd || 0
      ));
    });

    // Corporate / pass-through business income (for business-POV entities).
    var businessUs = moneyFromUsd(num(safe(ui, "business_income_usd", 0)));
    (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) {
      businessUs = addMoney(businessUs, moneyFromUsd(c.taxable_income_usd || c.net_income_usd || 0));
    });
    (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
      businessUs = addMoney(businessUs, moneyFromUsd(k.ordinary_business_income_usd || k.ordinary_income_usd || 0));
    });
    (safe(ui, "self_employment", []) || []).forEach(function (s) {
      businessUs = addMoney(businessUs, moneyFromUsd(s.self_employment_earnings_usd || s.net_profit_usd || 0));
    });
    (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) {
      businessUs = addMoney(businessUs, moneyFromUsd(s.scorp_income_usd || s.ordinary_business_income_usd || 0));
    });

    // Self-employment-TAX-subject earnings (Sch C + Sch F + general-partner SE):
    // NOT S-corp/C-corp wages/distributions. Drives Schedule SE.
    var seEarnings = 0;
    (safe(ui, "self_employment", []) || []).forEach(function (s) { seEarnings += num(s.self_employment_earnings_usd || s.net_profit_usd || 0); });
    (safe(ui, "schedule_c_businesses", []) || []).forEach(function (s) { seEarnings += num(s.net_profit_usd || s.net_earnings_usd || 0); });
    (safe(ui, "farming_schedule_f", []) || []).forEach(function (s) { seEarnings += num(s.net_profit_usd || 0); });
    // QBI-eligible pass-through business income (§199A): SE + S-corp + partnership
    // ordinary (excludes C-corp and wages). SSTB flag if any business is flagged.
    var qbiIncome = seEarnings, sstb = false;
    (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { qbiIncome += num(s.scorp_income_usd || s.ordinary_business_income_usd || 0); });
    (safe(ui, "partnerships_k1", []) || []).forEach(function (k) { qbiIncome += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0); });
    [].concat(safe(ui, "self_employment", []) || [], safe(ui, "schedule_c_businesses", []) || [], safe(ui, "s_corporations_k1", []) || [], safe(ui, "partnerships_k1", []) || [])
      .forEach(function (x) { if (x && (x.is_sstb === true || x.sstb === true)) sstb = true; });

    // US retirement / pension income (US-source, ordinary): IRA & 401(k)
    // distributions, Social Security, and pension.
    var usRetirementIncome = moneyFromUsd(
      num(safe(ui, "ira_distributions_usd", 0)) +
      num(safe(ui, "401k_distributions_usd", 0)) +
      num(safe(ui, "social_security_benefits_usd", 0)) +
      num(safe(ui, "pension_income_usd", 0))
    );

    var interestUs = moneyFromUsd(safe(ui, "interest_us_source_usd", 0));
    var ordDivUs = moneyFromUsd(safe(ui, "ordinary_dividends_us_source_usd", 0));
    var qualDivUs = moneyFromUsd(safe(ui, "qualified_dividends_us_source_usd", 0));
    var ltcgUs = moneyFromUsd(safe(ui, "ltcg_us_source_usd", 0));
    var stcgUs = moneyFromUsd(safe(ui, "stcg_us_source_usd", 0));
    var rentalUs = moneyFromUsd(safe(ui, "rental_income_us_source_usd", 0));

    var foreignInterest = moneyFromUsd(safe(fi, "foreign_interest_usd", 0));
    var foreignDividends = moneyFromUsd(safe(fi, "foreign_dividends_usd", 0));
    var foreignRental = moneyFromUsd(safe(fi, "foreign_rental_income_usd", 0));
    var foreignPension = moneyFromUsd(safe(fi, "foreign_pension_income_usd", 0));
    var foreignStcg = moneyFromUsd(safe(fi, "foreign_stcg_usd", 0));
    var foreignLtcg = moneyFromUsd(safe(fi, "foreign_ltcg_usd", 0));

    var usSourceTotal = [wages, businessUs, interestUs, ordDivUs, ltcgUs, stcgUs, rentalUs, usRetirementIncome].reduce(addMoney, zeroMoney());
    var foreignSourceTotal = [foreignWages, foreignInterest, foreignDividends, foreignRental, foreignPension, foreignStcg, foreignLtcg].reduce(addMoney, zeroMoney());

    return {
      wages: wages, businessUs: businessUs, w2Withholding: w2with, medicareWages: medicareWages,
      seEarningsUsd: seEarnings, qbiIncomeUsd: Math.max(0, qbiIncome), qbiIsSSTB: sstb,
      usRetirementIncome: usRetirementIncome,
      interestUs: interestUs, ordinaryDividendsUs: ordDivUs, qualifiedDividendsUs: qualDivUs,
      ltcgUs: ltcgUs, stcgUs: stcgUs, capitalGainsUs: addMoney(ltcgUs, stcgUs), rentalUs: rentalUs,
      foreignWages: foreignWages, foreignInterest: foreignInterest, foreignDividends: foreignDividends,
      foreignRental: foreignRental, foreignPension: foreignPension,
      foreignStcg: foreignStcg, foreignLtcg: foreignLtcg,
      foreignCapitalGains: addMoney(foreignStcg, foreignLtcg),
      usSourceTotal: usSourceTotal, foreignSourceTotal: foreignSourceTotal,
      total: addMoney(usSourceTotal, foreignSourceTotal)
    };
  }

  /* US deduction inputs for the tax engine. */
  function aggregateUsDeductions(us) {
    var it = safe(us, "itemized_deductions_and_credits", {});
    return {
      mode: safe(it, "use_standard_or_itemized", "auto"),
      salt: num(safe(it, "state_and_local_taxes_paid_usd", 0)),
      mortgageInterest: num(safe(it, "mortgage_interest_paid_usd", 0)),
      charitable: num(safe(it, "charitable_contributions_cash_usd", 0)) + num(safe(it, "charitable_contributions_appreciated_usd", 0)),
      medical: num(safe(it, "medical_expenses_usd", 0)),
      studentLoanInterest: num(safe(it, "student_loan_interest_usd", 0)),
      // AMT preference / adjustment items (§57): private-activity-bond interest,
      // ISO bargain element / other preference spread.
      amtPrefs: num(safe(it, "private_activity_bond_interest_usd", 0)) +
                num(safe(it, "amt_preference_spread_usd", 0)) +
                num(safe(us, "amt.private_activity_bond_interest_usd", 0)) +
                num(safe(us, "amt.amt_preference_spread_usd", 0)) +
                num(safe(us, "amt_items_usd", 0)),
      // Non-refundable personal credits
      careExpenses: num(safe(it, "dependent_care_expenses_usd", 0)),
      aotc: num(safe(it, "education_credits_aotc_usd", 0)),
      lifetimeLearning: num(safe(it, "education_credits_llc_usd", 0)),
      dependents: num(safe(us, "profile.dependents_count", 0)) || num(safe(it, "dependents_count", 0))
    };
  }

  /* Foreign accounts (FBAR / 8938 / Schedule FA). */
  function aggregateAccounts(india, us) {
    var indianAccounts = (safe(india, "bank_accounts", []) || []).map(function (b) {
      return { bank: b.bank_name || "Indian Bank", type: b.account_type || "savings",
               peak: moneyFromInr(b.peak_balance_inr || 0), country: "India" };
    });
    var usDisclosed = (safe(us, "bank_accounts", []) || []).map(function (b) {
      return { bank: b.bank_name || "Bank", type: b.account_type || "savings",
               peak: b.peak_balance_usd !== undefined ? moneyFromUsd(b.peak_balance_usd) : moneyFromInr(b.peak_balance_inr || 0),
               country: b.country || "India" };
    });
    var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
    // Prefer the US-form computed FBAR peak if present (it filters US accounts).
    var formFbar = num(safe(us, "fbar_aggregate_peak_usd", 0));
    var aggregatePeak = formFbar > 0
      ? moneyFromUsd(formFbar)
      : accounts.reduce(function (acc, a) { return addMoney(acc, a.peak); }, zeroMoney());
    return { accounts: accounts, aggregatePeak: aggregatePeak };
  }

  /* Taxes already paid (raw material for FTC; distinct from computed tax). */
  function aggregateTaxesPaid(india, us) {
    var tc = safe(india, "tax_credits", {});
    var indiaAdvance =
      num(safe(tc, "advance_tax_q1_15jun_inr", 0)) + num(safe(tc, "advance_tax_q2_15sep_inr", 0)) +
      num(safe(tc, "advance_tax_q3_15dec_inr", 0)) + num(safe(tc, "advance_tax_q4_15mar_inr", 0));
    var indiaTds = num(safe(tc, "tds_already_deducted_inr", 0)) + num(safe(tc, "tds_inr", 0));
    var indiaTcs = num(safe(tc, "tcs_inr", 0));
    var indiaPaid = moneyFromInr(indiaAdvance + indiaTds + indiaTcs);

    var we = safe(us, "withholding_and_estimated", {});
    var usWithholding = num(safe(we, "federal_withholding_total_usd", 0));
    var usEstimated =
      num(safe(we, "estimated_tax_q1_apr15_usd", 0)) + num(safe(we, "estimated_tax_q2_jun15_usd", 0)) +
      num(safe(we, "estimated_tax_q3_sep15_usd", 0)) + num(safe(we, "estimated_tax_q4_jan15_usd", 0));
    var usPaid = moneyFromUsd(usWithholding + usEstimated);

    return {
      india: { advance: moneyFromInr(indiaAdvance), tds: moneyFromInr(indiaTds), total: indiaPaid },
      us: { withholding: moneyFromUsd(usWithholding), estimated: moneyFromUsd(usEstimated), total: usPaid }
    };
  }

  /* ------------------------------------------------------------------------
   * normalize — the public entry point.
   * ----------------------------------------------------------------------*/
  function normalize(opts) {
    var raw = loadRawStates(opts);
    var india = raw.india || {};
    var us = raw.us || {};
    var router = raw.router || {};
    var annual = indiaAnnualSlice(india);

    return {
      meta: {
        hasIndia: !!raw.india,
        hasUs: !!raw.us,
        hasRouter: !!raw.router,
        jurisdiction: safe(router, "jurisdiction", (raw.india && raw.us) ? "dual" : (raw.india ? "single_india" : "single_us")),
        baseYear: num(safe(router, "base_tax_year", safe(us, "metadata.us_calendar_year", 2025))) || 2025,
        fxRate: CONST.FX.INR_PER_USD,
        indiaSchemaVersion: safe(india, "metadata.schema_version", null),
        usSchemaVersion: safe(us, "metadata.schema_version", null),
        indiaQuarterly: !!safe(india, "quarters", null)
      },
      periods: {
        // India FY quarters in USD (Q1=Apr-Jun … Q4=Jan-Mar); null when the form
        // has no quarterly data (apportionment then assumes even earning).
        indiaQuarterlyUsd: (function () {
          var q = safe(india, "quarters", null);
          if (!q) return null;
          return ["Q1", "Q2", "Q3", "Q4"].map(function (k) {
            var qd = q[k] || {}, di = qd.domestic_income || {}, os = qd.other_sources || {}, cg = qd.capital_gains || {};
            return inrToUsd(
              num(safe(di, "salary.taxable_salary_inr", 0)) + num(safe(di, "salary.gross_salary_inr", 0)) +
              num(safe(os, "interest_inr", 0)) + num(safe(os, "dividend_inr", 0)) +
              num(safe(cg, "stcg_111a_inr", 0)) + num(safe(cg, "ltcg_112a_inr", 0))
            );
          });
        })()
      },
      identity: {
        name: safe(router, "full_name", safe(india, "profile.full_name", safe(us, "profile.full_name", "Unnamed Taxpayer"))),
        dob: safe(router, "date_of_birth", safe(india, "profile.date_of_birth", safe(us, "profile.date_of_birth", null))),
        usFilingStatus: normalizeFilingStatus(safe(us, "profile.filing_status", "single")),
        indiaEntityType: safe(india, "profile.entity_type", "individual")
      },
      entity: (function () {
        var inK = safe(india, "profile.entity_type", "individual");
        var usT = safe(us, "profile.tax_entity_type", "individual");
        if (usT === "llc") usT = safe(us, "profile.llc_tax_election", "individual");
        var indiaIsCompany = inK === "company";
        var indiaIsFirm = ["firm", "llp", "local"].indexOf(inK) >= 0;
        var usIsBusiness = ["ccorp", "scorp", "partnership", "trust"].indexOf(usT) >= 0;
        // A profile is "business POV" when either side is a non-individual entity.
        return {
          indiaKind: inK, usKind: usT,
          indiaIsCompany: indiaIsCompany, indiaIsFirm: indiaIsFirm,
          indiaOpt115baa: safe(india, "profile.opt_115baa", false) === true,
          indiaTurnoverLte400cr: safe(india, "profile.turnover_lte_400cr", false) === true,
          usIsBusiness: usIsBusiness,
          isBusiness: indiaIsCompany || indiaIsFirm || usIsBusiness,
          indiaReturnForm: indiaIsCompany ? "ITR-6" : (indiaIsFirm ? "ITR-5" : "ITR-2/3"),
          usReturnForm: usT === "ccorp" ? "1120" : usT === "scorp" ? "1120-S" : usT === "partnership" ? "1065" : usT === "trust" ? "1041" : "1040"
        };
      })(),
      residency: {
        india: {
          status: safe(india, "residency_detail.final_india_residency_status", null),
          daysCurrentYear: num(safe(india, "residency_detail.days_in_india_current_year", 0)),
          taxRegime: safe(india, "profile.tax_regime", "NEW")
        },
        us: {
          status: safe(us, "us_residency_detail.final_us_residency_status", null),
          isCitizen: safe(us, "us_residency_detail.is_us_citizen", false) === true,
          hasGreenCard: safe(us, "us_residency_detail.has_green_card", false) === true,
          sptMet: safe(us, "us_residency_detail.spt_test_met", false) === true,
          daysCurrentYear: num(safe(us, "us_residency_detail.us_days_current_year", 0))
        }
      },
      treaty: {
        trcStatus: safe(india, "dtaa.trc_status", false) === true ||
                   safe(india, "compliance_docs.trc.document_uploaded", false) === true,
        form10fFiled: safe(india, "compliance_docs.form_10f.is_filed", false) === true,
        treatyResidence: safe(india, "dtaa.dtaa_treaty_residence", "none"),
        dtaaForcedNr: safe(india, "dtaa.dtaa_forced_nr", false) === true,
        hasPE: safe(india, "dtaa.has_permanent_establishment_in_india", false) === true,
        usTreatyResidence: safe(us, "us_residency_detail.dtaa_treaty_residence", "none"),
        files1040nr: safe(us, "nra_specific.files_form_1040nr", false) === true,
        form8833Implied: safe(us, "us_residency_detail.dtaa_treaty_residence", "none") !== "none"
      },
      income: {
        india: aggregateIndiaIncome(india, annual),
        us: aggregateUsIncome(us)
      },
      deductions: {
        india: aggregateIndiaDeductions(india),
        us: aggregateUsDeductions(us)
      },
      accounts: aggregateAccounts(india, us),
      taxesPaid: aggregateTaxesPaid(india, us),
      assets: {
        indianMutualFunds: (safe(india, "financial_holdings.transactions", []) || []).filter(function (t) {
          return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0;
        }),
        indianSecurities: safe(india, "financial_holdings.transactions", []) || [],
        usPficHoldings: safe(us, "foreign_entities.pfic_holdings", []),
        indianBusinesses: safe(annual.domestic_income, "business_income.business_entries", []),
        usForeignCorps: safe(us, "foreign_entities.foreign_corporations", []),
        usOwns10PctForeignCorp: safe(us, "foreign_entities.owns_10_percent_foreign_corp", false) === true,
        indianProperties: safe(india, "property.properties", []),
        epfInr: num(safe(india, "deductions.s80C.epf_employee_inr", 0)),
        ppfInr: num(safe(india, "deductions.s80C.ppf_inr", 0)),
        npsInr: num(safe(india, "deductions.s80CCC_80CCD1.nps_employee_contribution_inr", 0)),
        // US-side holdings the Layer 1 US form captures
        usSecurities: safe(us, "financial_holdings", []) || [],
        usProperties: safe(us, "real_estate.properties", []) || [],
        usRetirement: safe(us, "retirement_accounts", {}) || {},
        // Per-entity business breakdown (for the Business tab). One row per real
        // entity: a company the taxpayer merely OWNS is a foreign corp (CFC),
        // not their personal PGBP income, so same-named entries are merged
        // (income counted once) and CFC/GILTI attach as flags — no double count.
        businessEntities: (function () {
          var list = [], ui = safe(us, "income_us_source", {});
          var entityKind = safe(us, "profile.tax_entity_type", "individual");
          // The US entity's OWN return income (e.g. a C-Corp's 1120 income).
          if (entityKind === "ccorp" || safe(us, "profile.incorporated_in_us", false) === true) {
            var selfInc = num(safe(ui, "business_income_usd", 0));
            if (selfInc > 0) list.push({ country: "US", type: "C-Corp (Form 1120)", name: safe(us, "profile.full_name", "US C-Corp"), incomeUsd: selfInc, corp: true });
          }
          (safe(ui, "self_employment", []) || []).forEach(function (s) { list.push({ country: "US", type: "Self-employment (Sch C)", name: s.business_name || s.name || "Self-employment", incomeUsd: num(s.self_employment_earnings_usd || s.net_profit_usd || 0), se: true, qbi: true }); });
          (safe(ui, "schedule_c_businesses", []) || []).forEach(function (s) { list.push({ country: "US", type: "Schedule C", name: s.business_name || s.name || "Sole proprietorship", incomeUsd: num(s.net_profit_usd || s.net_earnings_usd || 0), se: true, qbi: true }); });
          (safe(ui, "farming_schedule_f", []) || []).forEach(function (s) { list.push({ country: "US", type: "Farm (Sch F)", name: s.name || "Farm", incomeUsd: num(s.net_profit_usd || 0), se: true, qbi: true }); });
          (safe(ui, "partnerships_k1", []) || []).forEach(function (k) { list.push({ country: "US", type: "Partnership K-1 (1065)", name: k.partnership_name || k.name || "Partnership", incomeUsd: num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0), se: true, qbi: true }); });
          (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { list.push({ country: "US", type: "S-Corp K-1 (1120-S)", name: s.corp_name || s.name || "S-Corporation", incomeUsd: num(s.scorp_income_usd || s.ordinary_business_income_usd || 0), se: false, qbi: true }); });
          (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) { list.push({ country: "US", type: "C-Corp (Form 1120)", name: c.corp_name || c.name || "C-Corporation", incomeUsd: num(c.taxable_income_usd || c.net_income_usd || 0), corp: true }); });
          (safe(annual.domestic_income, "business_income.business_entries", []) || []).forEach(function (b) { list.push({ country: "IN", type: "Business / Profession (PGBP)", name: b.trade_name || b.name || "Indian business", incomeUsd: inrToUsd(num(b.net_profit_inr || b.net_profit || 0)), inr: num(b.net_profit_inr || b.net_profit || 0) }); });
          (safe(us, "foreign_entities.foreign_corporations", []) || []).forEach(function (c) { list.push({ country: c.country === "IN" ? "IN" : "US", type: "Foreign corporation (CFC)", name: c.corp_name || "Foreign corporation", incomeUsd: num(c.gilti_income_usd || 0), cfc: true, gilti: num(c.gilti_income_usd || 0), ownershipPct: num(c.ownership_pct || 0) }); });
          // Merge same-named entities so income is counted once; CFC/GILTI flags
          // fold onto the entity's real income row.
          var byName = {}, order = [];
          list.forEach(function (e) {
            var key = String(e.name || "").toLowerCase().replace(/\s+/g, " ").trim();
            if (!byName[key]) { byName[key] = e; order.push(key); return; }
            var ex = byName[key];
            if (e.cfc) { ex.cfc = true; ex.gilti = Math.max(ex.gilti || 0, e.gilti || 0); ex.ownershipPct = ex.ownershipPct || e.ownershipPct; if (!ex.incomeUsd) ex.incomeUsd = e.incomeUsd; }
            else if (ex.cfc) { e.cfc = ex.cfc; e.gilti = ex.gilti; e.ownershipPct = ex.ownershipPct; byName[key] = e; }
            else { ex.incomeUsd = Math.max(ex.incomeUsd || 0, e.incomeUsd || 0); }
          });
          return order.map(function (k) { return byName[k]; });
        })()
      },
      limitsRaw: {
        lrsRemittedInr: num(safe(annual.lrs_outbound, "total_lrs_remitted_this_fy_inr", 0)) ||
                        num(safe(india, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)),
        feieClaimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
        feieAmountUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
        fbarFormFlag: num(safe(us, "fbar_aggregate_peak_usd", 0)),
        form8938Flag: safe(us, "form_8938_required", false) === true,
        additionalMedicareOwed: num(safe(us, "withholding_and_estimated.additional_medicare_tax_owed_usd", 0))
      },
      // FEIE (Form 2555) eligibility inputs — the exclusion is only available to a
      // taxpayer whose TAX HOME is abroad AND who meets the bona-fide-residence or
      // physical-presence (>=330 days abroad, i.e. <=35 US days) test. Someone
      // living in the US cannot claim it, so we capture the qualification facts.
      feie: {
        claimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
        amountClaimedUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
        taxHomeCountry: safe(us, "foreign_earned_income.tax_home_country", ""),
        bonaFide: safe(us, "foreign_earned_income.bona_fide_residence", false) === true,
        physicalPresence: safe(us, "foreign_earned_income.physical_presence", false) === true,
        daysInUsTestPeriod: num(safe(us, "foreign_earned_income.days_in_us_during_test_period", 0))
      },
      _raw: raw
    };
  }

  WISING.normalize = normalize;
  WISING.util = {
    num: num, inrToUsd: inrToUsd, usdToInr: usdToInr,
    moneyFromInr: moneyFromInr, moneyFromUsd: moneyFromUsd,
    addMoney: addMoney, zeroMoney: zeroMoney, safe: safe,
    normalizeFilingStatus: normalizeFilingStatus
  };
})(typeof window !== "undefined" ? window : globalThis);

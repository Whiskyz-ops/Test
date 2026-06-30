/* ============================================================================
 * WISING — Layer 2 Engine :: normalize.js
 * ----------------------------------------------------------------------------
 * Reads the two Layer 1 intake states (India + US) plus the Layer 0 router
 * state, and folds them into ONE currency-normalized "unified taxpayer model"
 * that the computation and conflict engines consume.
 *
 * Design principle: the Layer 1 forms are the source of truth. We never mutate
 * them — we project them into a flat, predictable shape and attach both INR and
 * USD figures to every monetary node so downstream code never has to guess a
 * currency or re-run an FX conversion.
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

  // Build a {usd, inr} money pair from whichever side we have.
  function moneyFromInr(inr) { var i = num(inr); return { inr: i, usd: inrToUsd(i) }; }
  function moneyFromUsd(usd) { var u = num(usd); return { usd: u, inr: usdToInr(u) }; }
  function addMoney(a, b) { return { usd: a.usd + b.usd, inr: a.inr + b.inr }; }
  function zeroMoney() { return { usd: 0, inr: 0 }; }

  function safe(obj, path, dflt) {
    var cur = obj;
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return dflt;
      cur = cur[parts[i]];
    }
    return (cur === undefined || cur === null) ? dflt : cur;
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
      } catch (e) {
        return null;
      }
    }
    return {
      router: read(CONST.STORAGE_KEYS.ROUTER, opts.router),
      india: read(CONST.STORAGE_KEYS.INDIA, opts.india),
      us: read(CONST.STORAGE_KEYS.US, opts.us)
    };
  }

  /* ------------------------------------------------------------------------
   * India income aggregation. The Layer 1 India form holds income across
   * quarters and several heads; for the conflict layer we only need the
   * annualized totals per head, normalized to {inr, usd}.
   * ----------------------------------------------------------------------*/
  function aggregateIndiaIncome(india) {
    var di = safe(india, "domestic_income", {});
    var os = safe(india, "other_sources", {});

    var salary = moneyFromInr(
      safe(di, "salary.taxable_salary_inr", null) ||
      safe(di, "salary.gross_salary_inr", 0)
    );

    // business: sum net_profit across entries if present, else single field.
    var bizEntries = safe(di, "business_income.business_entries", []);
    var business = zeroMoney();
    (bizEntries || []).forEach(function (b) {
      business = addMoney(business, moneyFromInr(b.net_profit_inr || b.net_profit || 0));
    });

    // house property rent
    var hpProps = safe(di, "house_property.properties", []);
    var houseProperty = zeroMoney();
    (hpProps || []).forEach(function (p) {
      houseProperty = addMoney(houseProperty, moneyFromInr(p.annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0));
    });

    var interest = moneyFromInr(
      num(safe(os, "interest_savings_inr", 0)) +
      num(safe(os, "interest_fd_rd_inr", 0)) +
      num(safe(os, "interest_bonds_inr", 0)) +
      num(safe(di, "other_sources.interest_inr", 0))
    );
    var dividend = moneyFromInr(safe(os, "dividend_inr", 0));

    var capGains = moneyFromInr(
      num(safe(di, "capital_gains.short_term_15_pct", 0))
    );

    var total = [salary, business, houseProperty, interest, dividend, capGains]
      .reduce(addMoney, zeroMoney());

    return {
      salary: salary,
      business: business,
      houseProperty: houseProperty,
      interest: interest,
      dividend: dividend,
      capitalGains: capGains,
      total: total
    };
  }

  /* ------------------------------------------------------------------------
   * US income aggregation. The Layer 1 US form splits into us-source and
   * foreign-source; we keep that split because it drives the FTC limitation.
   * ----------------------------------------------------------------------*/
  function aggregateUsIncome(us) {
    var ui = safe(us, "income_us_source", {});
    var fi = safe(us, "income_foreign_source", {});

    // wages can be a flat field or an array (w2 list) depending on form version
    var wages = zeroMoney();
    var w2 = safe(ui, "wages_w2", null);
    if (Array.isArray(w2)) {
      w2.forEach(function (w) { wages = addMoney(wages, moneyFromUsd(w.wages_tips_compensation_usd || 0)); });
    }

    var foreignWages = zeroMoney();
    (safe(fi, "foreign_wages", []) || []).forEach(function (w) {
      foreignWages = addMoney(foreignWages, moneyFromUsd(w.wages_usd || w.amount_usd || w.wages_tips_compensation_usd || 0));
    });

    var interestUs = moneyFromUsd(safe(ui, "interest_us_source_usd", 0));
    var dividendsUs = moneyFromUsd(safe(ui, "ordinary_dividends_us_source_usd", 0));
    var ltcgUs = moneyFromUsd(safe(ui, "ltcg_us_source_usd", 0));
    var stcgUs = moneyFromUsd(safe(ui, "stcg_us_source_usd", 0));
    var rentalUs = moneyFromUsd(safe(ui, "rental_income_us_source_usd", 0));

    var foreignInterest = moneyFromUsd(safe(fi, "foreign_interest_usd", 0));
    var foreignDividends = moneyFromUsd(safe(fi, "foreign_dividends_usd", 0));
    var foreignRental = moneyFromUsd(safe(fi, "foreign_rental_income_usd", 0));
    var foreignPension = moneyFromUsd(safe(fi, "foreign_pension_income_usd", 0));
    var foreignStcg = moneyFromUsd(safe(fi, "foreign_stcg_usd", 0));
    var foreignLtcg = moneyFromUsd(safe(fi, "foreign_ltcg_usd", 0));

    var usSourceTotal = [wages, interestUs, dividendsUs, ltcgUs, stcgUs, rentalUs].reduce(addMoney, zeroMoney());
    var foreignSourceTotal = [foreignWages, foreignInterest, foreignDividends, foreignRental, foreignPension, foreignStcg, foreignLtcg].reduce(addMoney, zeroMoney());

    return {
      wages: wages,
      interestUs: interestUs,
      dividendsUs: dividendsUs,
      capitalGainsUs: addMoney(ltcgUs, stcgUs),
      rentalUs: rentalUs,
      foreignWages: foreignWages,
      foreignInterest: foreignInterest,
      foreignDividends: foreignDividends,
      foreignRental: foreignRental,
      foreignPension: foreignPension,
      foreignCapitalGains: addMoney(foreignStcg, foreignLtcg),
      usSourceTotal: usSourceTotal,
      foreignSourceTotal: foreignSourceTotal,
      total: addMoney(usSourceTotal, foreignSourceTotal)
    };
  }

  /* ------------------------------------------------------------------------
   * Foreign accounts (drives FBAR / 8938 / Schedule FA). We pull the Indian
   * bank accounts (peak INR) and any US accounts disclosed on the India side.
   * ----------------------------------------------------------------------*/
  function aggregateAccounts(india, us) {
    var indianAccounts = (safe(india, "bank_accounts", []) || []).map(function (b) {
      return {
        bank: b.bank_name || "Indian Bank",
        type: b.account_type || "savings",
        peak: moneyFromInr(b.peak_balance_inr || 0),
        country: "India"
      };
    });
    // US form may also carry hydrated/native foreign accounts
    var usDisclosed = (safe(us, "bank_accounts", []) || []).map(function (b) {
      return {
        bank: b.bank_name || "Bank",
        type: b.account_type || "savings",
        peak: b.peak_balance_usd !== undefined ? moneyFromUsd(b.peak_balance_usd) : moneyFromInr(b.peak_balance_inr || 0),
        country: b.country || "India"
      };
    });

    // Prefer the richer list; avoid double counting by taking the max length set.
    var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
    var aggregatePeak = accounts.reduce(function (acc, a) { return addMoney(acc, a.peak); }, zeroMoney());

    return { accounts: accounts, aggregatePeak: aggregatePeak };
  }

  /* ------------------------------------------------------------------------
   * Taxes already paid in each jurisdiction (the FTC raw material).
   * ----------------------------------------------------------------------*/
  function aggregateTaxesPaid(india, us) {
    var tc = safe(india, "tax_credits", {});
    var indiaAdvance =
      num(safe(tc, "advance_tax_q1_15jun_inr", 0)) +
      num(safe(tc, "advance_tax_q2_15sep_inr", 0)) +
      num(safe(tc, "advance_tax_q3_15dec_inr", 0)) +
      num(safe(tc, "advance_tax_q4_15mar_inr", 0));
    var indiaTds = num(safe(tc, "tds_already_deducted_inr", 0)) + num(safe(tc, "tds_inr", 0));
    var indiaTcs = num(safe(tc, "tcs_inr", 0));
    var indiaPaid = moneyFromInr(indiaAdvance + indiaTds + indiaTcs);

    var we = safe(us, "withholding_and_estimated", {});
    var usWithholding = num(safe(we, "federal_withholding_total_usd", 0));
    var usEstimated =
      num(safe(we, "estimated_tax_q1_apr15_usd", 0)) +
      num(safe(we, "estimated_tax_q2_jun15_usd", 0)) +
      num(safe(we, "estimated_tax_q3_sep15_usd", 0)) +
      num(safe(we, "estimated_tax_q4_jan15_usd", 0));
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

    var model = {
      meta: {
        hasIndia: !!raw.india,
        hasUs: !!raw.us,
        hasRouter: !!raw.router,
        jurisdiction: safe(router, "jurisdiction", (raw.india && raw.us) ? "dual" : (raw.india ? "single_india" : "single_us")),
        baseYear: num(safe(router, "base_tax_year", safe(us, "metadata.us_calendar_year", 2025))) || 2025,
        fxRate: CONST.FX.INR_PER_USD,
        indiaSchemaVersion: safe(india, "metadata.schema_version", null),
        usSchemaVersion: safe(us, "metadata.schema_version", null)
      },
      identity: {
        name: safe(router, "full_name", safe(india, "profile.full_name", safe(us, "profile.full_name", "Unnamed Taxpayer"))),
        dob: safe(router, "date_of_birth", safe(india, "profile.date_of_birth", safe(us, "profile.date_of_birth", null))),
        usFilingStatus: safe(us, "profile.filing_status", "single"),
        indiaEntityType: safe(india, "profile.entity_type", "individual")
      },
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
        // India-side DTAA inputs
        trcStatus: safe(india, "dtaa.trc_status", false) === true ||
                   safe(india, "compliance_docs.trc.document_uploaded", false) === true,
        form10fFiled: safe(india, "compliance_docs.form_10f.is_filed", false) === true,
        treatyResidence: safe(india, "dtaa.dtaa_treaty_residence", "none"),
        dtaaForcedNr: safe(india, "dtaa.dtaa_forced_nr", false) === true,
        hasPE: safe(india, "dtaa.has_permanent_establishment_in_india", false) === true,
        // US-side treaty inputs
        usTreatyResidence: safe(us, "us_residency_detail.dtaa_treaty_residence", "none"),
        files1040nr: safe(us, "nra_specific.files_form_1040nr", false) === true,
        form8833Implied: safe(us, "us_residency_detail.dtaa_treaty_residence", "none") !== "none"
      },
      income: {
        india: aggregateIndiaIncome(india),
        us: aggregateUsIncome(us)
      },
      accounts: aggregateAccounts(india, us),
      taxesPaid: aggregateTaxesPaid(india, us),
      assets: {
        // PFIC: Indian mutual funds
        indianMutualFunds: (safe(india, "financial_holdings.transactions", []) || []).filter(function (t) {
          return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0;
        }),
        usPficHoldings: safe(us, "foreign_entities.pfic_holdings", []),
        // CFC: Indian businesses
        indianBusinesses: safe(india, "domestic_income.business_income.business_entries", []),
        usForeignCorps: safe(us, "foreign_entities.foreign_corporations", []),
        // Indian property
        indianProperties: safe(india, "property.properties", []),
        // Retirement
        epfInr: num(safe(india, "deductions.s80C.epf_employee_inr", 0)),
        ppfInr: num(safe(india, "deductions.s80C.ppf_inr", 0)),
        npsInr: num(safe(india, "deductions.s80CCC_80CCD1.nps_employee_contribution_inr", 0))
      },
      limitsRaw: {
        lrsRemittedInr: num(safe(india, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)),
        feieClaimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
        feieAmountUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
        fbarFormFlag: num(safe(us, "fbar_aggregate_peak_usd", 0)),
        form8938Flag: safe(us, "form_8938_required", false) === true
      },
      _raw: raw
    };

    return model;
  }

  WISING.normalize = normalize;
  WISING.util = {
    num: num, inrToUsd: inrToUsd, usdToInr: usdToInr,
    moneyFromInr: moneyFromInr, moneyFromUsd: moneyFromUsd,
    addMoney: addMoney, zeroMoney: zeroMoney, safe: safe
  };
})(typeof window !== "undefined" ? window : globalThis);

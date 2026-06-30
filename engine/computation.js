/* ============================================================================
 * WISING — Layer 2 Engine :: computation.js
 * ----------------------------------------------------------------------------
 * The "computation engine". Takes the normalized unified model and derives the
 * quantitative cross-border picture that the dashboard and the conflict engine
 * both depend on:
 *
 *   1. Effective residency on each side (resident / non-resident / dual).
 *   2. A simplified tax-liability estimate per jurisdiction (to SIZE exposure —
 *      this is a planning estimate, not a return computation).
 *   3. The set of income items that are taxed by BOTH jurisdictions.
 *   4. The Foreign Tax Credit (FTC) pool & limitation on each side.
 *   5. Limit-monitoring gauges (FBAR / 8938 / LRS / FEIE / NIIT).
 *
 * Everything here is deterministic and side-effect free.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};
  var CONST = WISING.CONST;
  var U = WISING.util;

  // ---- simplified slab/bracket tax estimators -----------------------------
  // India: New regime FY2025-26 slabs (individual). Planning estimate only.
  function estimateIndiaTaxInr(taxableInr) {
    var t = Math.max(0, taxableInr);
    var slabs = [
      [400000, 0.00],
      [800000, 0.05],
      [1200000, 0.10],
      [1600000, 0.15],
      [2000000, 0.20],
      [2400000, 0.25],
      [Infinity, 0.30]
    ];
    var tax = 0, prev = 0;
    for (var i = 0; i < slabs.length; i++) {
      var cap = slabs[i][0], rate = slabs[i][1];
      if (t > prev) {
        tax += (Math.min(t, cap) - prev) * rate;
        prev = cap;
      } else break;
    }
    // 4% health & education cess
    return tax * 1.04;
  }

  // US: 2025 federal ordinary brackets (single / mfj). Planning estimate only.
  function estimateUsTaxUsd(taxableUsd, filingStatus) {
    var t = Math.max(0, taxableUsd);
    var brackets = (filingStatus === "married_filing_jointly" || filingStatus === "mfj") ? [
      [23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24],
      [501050, 0.32], [751600, 0.35], [Infinity, 0.37]
    ] : [
      [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
      [250525, 0.32], [626350, 0.35], [Infinity, 0.37]
    ];
    var tax = 0, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      var cap = brackets[i][0], rate = brackets[i][1];
      if (t > prev) {
        tax += (Math.min(t, cap) - prev) * rate;
        prev = cap;
      } else break;
    }
    return tax;
  }

  /* ------------------------------------------------------------------------
   * resolveResidency — classify each side and the COMBINED status, which is
   * what makes a person a cross-border conflict case.
   * ----------------------------------------------------------------------*/
  function resolveResidency(model) {
    var IN = CONST.INDIA_STATUS, US = CONST.US_STATUS;
    var inStatus = model.residency.india.status;
    var usStatus = model.residency.us.status;

    var indiaResident = (inStatus === IN.ROR || inStatus === IN.RNOR);
    // ROR is taxed on worldwide income; RNOR only on India-source + India-controlled.
    var indiaWorldwide = (inStatus === IN.ROR);

    var usResident = model.residency.us.isCitizen ||
                     model.residency.us.hasGreenCard ||
                     usStatus === US.RESIDENT_ALIEN ||
                     model.residency.us.sptMet;
    var usWorldwide = usResident; // US taxes residents/citizens on worldwide income

    var dualResident = indiaResident && usResident;

    return {
      india: { status: inStatus, isResident: indiaResident, worldwide: indiaWorldwide },
      us: { status: usStatus, isResident: usResident, worldwide: usWorldwide, isCitizen: model.residency.us.isCitizen },
      dualResident: dualResident,
      // both jurisdictions reaching for worldwide income = the core conflict
      worldwideOverlap: indiaWorldwide && usWorldwide
    };
  }

  /* ------------------------------------------------------------------------
   * mapDoubleTaxedIncome — identify income heads present on BOTH sides (the
   * mismatch surface). We pair India income with the US "foreign source"
   * bucket (US sees Indian income as foreign) and US-source income with the
   * India foreign-income equivalent.
   * ----------------------------------------------------------------------*/
  function mapDoubleTaxedIncome(model, residency) {
    var items = [];
    var inc = model.income;

    function pair(label, indiaMoney, usMoney, note) {
      var inExposed = indiaMoney && indiaMoney.usd > 0;
      var usExposed = usMoney && usMoney.usd > 0;
      // Double taxation only bites when both jurisdictions tax worldwide income
      var doublyTaxed = inExposed && (residency.us.worldwide || usExposed);
      if (inExposed || usExposed) {
        items.push({
          label: label,
          indiaUsd: indiaMoney ? indiaMoney.usd : 0,
          usUsd: usMoney ? usMoney.usd : 0,
          doublyTaxed: doublyTaxed,
          note: note || ""
        });
      }
    }

    // Indian salary -> typically appears as US foreign wages for a US resident.
    pair("Salary / Wages (India-source)", inc.india.salary, inc.us.foreignWages,
      "Indian employment income is foreign-source for the US; creditable via Form 1116 general basket.");
    pair("Business / Professional income", inc.india.business, U.zeroMoney(),
      "Indian business profits may also flow through GILTI/Subpart F if held via a corp (Form 5471).");
    pair("House property / Rental (India)", inc.india.houseProperty, inc.us.foreignRental,
      "Indian rent: net-of-expense basis differs between IN (30% standard deduction) and US (actual + depreciation).");
    pair("Interest income", inc.india.interest, inc.us.foreignInterest,
      "Passive basket for US FTC; India taxes at slab rate.");
    pair("Dividend income", inc.india.dividend, inc.us.foreignDividends,
      "Indian dividends are now taxable in shareholder's hands; US qualified-dividend rate may differ.");
    pair("Capital gains", inc.india.capitalGains, inc.us.foreignCapitalGains,
      "STCG/LTCG holding-period and rate definitions differ between IN and US.");

    var totalDoublyTaxedUsd = items.reduce(function (s, it) { return s + (it.doublyTaxed ? Math.max(it.indiaUsd, it.usUsd) : 0); }, 0);

    return { items: items, totalDoublyTaxedUsd: totalDoublyTaxedUsd };
  }

  /* ------------------------------------------------------------------------
   * computeFtc — the FTC reconciliation core.
   * For a US resident with Indian income & Indian tax paid:
   *   - Creditable foreign tax  = Indian tax paid (USD)
   *   - FTC limitation          = US tax * (foreign-source income / total income)
   *   - Allowed credit          = min(creditable, limitation)
   *   - Carryover               = creditable - allowed  (back 1 / forward 10)
   * Symmetrically, India grants relief u/s 90 on US tax paid on doubly-taxed
   * income, capped at the Indian tax on that income.
   * ----------------------------------------------------------------------*/
  function computeFtc(model, residency, taxEst) {
    var inc = model.income;
    var paid = model.taxesPaid;

    // ---- US claims FTC for Indian taxes ----
    var foreignSrcUsd = inc.us.foreignSourceTotal.usd ||
                        // fall back to Indian total if US foreign bucket empty
                        inc.india.total.usd;
    var usTotalIncomeUsd = inc.us.total.usd || (inc.us.usSourceTotal.usd + inc.india.total.usd);
    var indiaTaxPaidUsd = paid.india.total.usd;

    var usLimitFraction = usTotalIncomeUsd > 0 ? Math.min(1, foreignSrcUsd / usTotalIncomeUsd) : 0;
    var usFtcLimit = taxEst.us.estTaxUsd * usLimitFraction;
    var usFtcAllowed = Math.min(indiaTaxPaidUsd, usFtcLimit);
    var usFtcCarryover = Math.max(0, indiaTaxPaidUsd - usFtcAllowed);
    var usResidualDoubleTax = Math.max(0, indiaTaxPaidUsd - usFtcAllowed); // unrelieved this year

    // ---- India grants relief u/s 90 for US taxes on doubly-taxed income ----
    var usTaxPaidUsd = paid.us.total.usd;
    var indiaTaxOnForeignUsd = taxEst.india.estTaxUsd * (
      usTotalIncomeUsd > 0 ? Math.min(1, (inc.us.usSourceTotal.usd) / (usTotalIncomeUsd || 1)) : 0
    );
    var indiaFtcAllowed = Math.min(usTaxPaidUsd, indiaTaxOnForeignUsd);

    return {
      us: {
        foreignSourceIncomeUsd: foreignSrcUsd,
        totalIncomeUsd: usTotalIncomeUsd,
        indiaTaxPaidUsd: indiaTaxPaidUsd,
        limitFraction: usLimitFraction,
        ftcLimitUsd: usFtcLimit,
        ftcAllowedUsd: usFtcAllowed,
        carryoverUsd: usFtcCarryover,
        residualDoubleTaxUsd: usResidualDoubleTax
      },
      india: {
        usTaxPaidUsd: usTaxPaidUsd,
        reliefCapUsd: indiaTaxOnForeignUsd,
        reliefAllowedUsd: indiaFtcAllowed
      },
      // headline number for the dashboard: tax that ends up double-paid
      netUnrelievedDoubleTaxUsd: usResidualDoubleTax
    };
  }

  /* ------------------------------------------------------------------------
   * computeLimits — limit-monitoring gauges.
   * ----------------------------------------------------------------------*/
  function computeLimits(model) {
    var L = CONST.LIMITS;
    var gauges = [];

    function gauge(id, label, valueUsd, limitUsd, unit, note) {
      var pct = limitUsd > 0 ? (valueUsd / limitUsd) : 0;
      var status = pct >= 1 ? "breached" : (pct >= 0.8 ? "approaching" : "ok");
      gauges.push({
        id: id, label: label, value: valueUsd, limit: limitUsd,
        pct: pct, status: status, unit: unit || "USD", note: note || ""
      });
    }

    // FBAR — aggregate peak of foreign accounts
    gauge("fbar", "FBAR (FinCEN 114) aggregate", model.accounts.aggregatePeak.usd, L.FBAR_AGGREGATE_USD, "USD",
      "Threshold is a cliff: any breach = full reporting of every foreign account.");

    // Form 8938 — pick threshold by status/residence
    var status = model.identity.usFilingStatus;
    var isMfj = (status === "married_filing_jointly" || status === "mfj");
    var abroad = model.limitsRaw.feieClaimed; // FEIE => living abroad proxy
    var tbl = L.FORM_8938[abroad ? (isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE") : (isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE")];
    gauge("form8938", "Form 8938 (FATCA) any-time", model.accounts.aggregatePeak.usd, tbl.anyTime, "USD",
      "Threshold shown is the 'any time during year' figure for your status/residence.");

    // LRS — outbound remittance
    gauge("lrs", "LRS outbound remittance", U.inrToUsd(model.limitsRaw.lrsRemittedInr), L.LRS_ANNUAL_USD, "USD",
      "RBI cap is per individual per financial year; TCS applies above ₹10L.");

    // FEIE — foreign earned income exclusion usage
    if (model.limitsRaw.feieClaimed || model.limitsRaw.foreignEarnedIncomeUsd > 0) {
      gauge("feie", "FEIE exclusion used", Math.min(model.limitsRaw.feieAmountUsd, L.FEIE_MAX_USD), L.FEIE_MAX_USD, "USD",
        "Excluded foreign earned income cannot also generate FTC — watch the no-double-dip rule.");
    }

    return gauges;
  }

  /* ------------------------------------------------------------------------
   * compute — orchestrator. Returns the full computed bundle.
   * ----------------------------------------------------------------------*/
  function compute(model) {
    var residency = resolveResidency(model);

    // Tax-liability estimates (planning, not filing). Use total income on each
    // side as the taxable proxy; the engine's job is to SIZE exposure.
    var indiaTaxableInr = model.income.india.total.inr;
    // For US worldwide residents, taxable base includes foreign income.
    var usTaxableUsd = residency.us.worldwide
      ? model.income.us.total.usd + model.income.india.total.usd
      : model.income.us.usSourceTotal.usd;

    var taxEst = {
      india: {
        taxableInr: indiaTaxableInr,
        estTaxInr: estimateIndiaTaxInr(indiaTaxableInr),
        estTaxUsd: U.inrToUsd(estimateIndiaTaxInr(indiaTaxableInr))
      },
      us: {
        taxableUsd: usTaxableUsd,
        estTaxUsd: estimateUsTaxUsd(usTaxableUsd, model.identity.usFilingStatus)
      }
    };

    var doubleTax = mapDoubleTaxedIncome(model, residency);
    var ftc = computeFtc(model, residency, taxEst);
    var limits = computeLimits(model);

    return {
      residency: residency,
      taxEstimate: taxEst,
      doubleTax: doubleTax,
      ftc: ftc,
      limits: limits,
      headline: {
        name: model.identity.name,
        baseYear: model.meta.baseYear,
        jurisdiction: model.meta.jurisdiction,
        totalIncomeUsd: model.income.us.total.usd + model.income.india.total.usd,
        worldwideOverlap: residency.worldwideOverlap,
        netUnrelievedDoubleTaxUsd: ftc.netUnrelievedDoubleTaxUsd
      }
    };
  }

  WISING.compute = compute;
  WISING.computeInternals = {
    estimateIndiaTaxInr: estimateIndiaTaxInr,
    estimateUsTaxUsd: estimateUsTaxUsd,
    resolveResidency: resolveResidency,
    mapDoubleTaxedIncome: mapDoubleTaxedIncome,
    computeFtc: computeFtc,
    computeLimits: computeLimits
  };
})(typeof window !== "undefined" ? window : globalThis);

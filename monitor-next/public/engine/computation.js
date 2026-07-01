/* ============================================================================
 * WISING — Layer 2 Engine :: computation.js
 * ----------------------------------------------------------------------------
 * The computation engine. Turns the normalized unified model into the
 * quantitative cross-border picture:
 *
 *   1. Effective residency on each side.
 *   2. A proper India income-tax computation (heads -> Chapter VI-A ->
 *      slab tax by regime -> §87A rebate -> surcharge w/ marginal relief ->
 *      4% cess, plus special CG rates).
 *   3. A proper US federal income-tax computation (AGI -> standard/itemized
 *      -> ordinary brackets + preferential LTCG/QDI rates -> NIIT ->
 *      additional Medicare).
 *   4. FTC reconciliation driven by those two computed liabilities
 *      (Form 1116 §904 limitation in BOTH directions).
 *   5. Double-taxed income map + limit-monitoring gauges.
 *
 * Planning-grade, deterministic, side-effect free. NOT a return computation.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};
  var CONST = WISING.CONST;
  var U = WISING.util;

  // ---- generic progressive-bracket helper ---------------------------------
  function bracketTax(amount, slabs) {
    var t = Math.max(0, amount), tax = 0, prev = 0, i;
    for (i = 0; i < slabs.length; i++) {
      var cap = slabs[i][0], rate = slabs[i][1];
      if (t > prev) { tax += (Math.min(t, cap) - prev) * rate; prev = cap; }
      else break;
    }
    return tax;
  }

  /* =========================================================================
   * INDIA INCOME-TAX COMPUTATION
   * =======================================================================*/
  function computeIndiaTax(model) {
    var T = CONST.TAX.INDIA;
    var inc = model.income.india;
    // Business entities (company / firm / LLP) use corporate rates, not slabs.
    if (model.entity && (model.entity.indiaIsCompany || model.entity.indiaIsFirm)) {
      return computeIndiaEntityTax(model, inc);
    }
    var ded = model.deductions.india;
    var regime = (model.residency.india.taxRegime || "NEW").toUpperCase();
    var isNew = regime !== "OLD";
    var slabs = isNew ? T.SLABS_NEW : T.SLABS_OLD;

    // Normal-slab income (salary is already taxable-net from Layer 1).
    var normalSlabInr =
      inc.salary.inr + inc.business.inr + inc.houseProperty.inr +
      inc.interest.inr + inc.dividend.inr;

    // Chapter VI-A deductions.
    var deductionsInr;
    if (isNew) {
      // New regime: essentially only employer NPS u/s 80CCD(2).
      deductionsInr = ded.s80CCD2_employer || 0;
    } else {
      var caps = T.DEDUCTION_CAPS_OLD;
      deductionsInr =
        Math.min(ded.s80C, caps.s80C) +
        Math.min(ded.s80CCD1B, caps.s80CCD1B) +
        Math.min(ded.s80D, caps.s80D_self + caps.s80D_parents_senior) +
        (ded.s80CCD2_employer || 0) +
        Math.min(ded.s80TTA_TTB, 10000);
    }

    var totalNormalInr = Math.max(0, normalSlabInr - deductionsInr);

    // Special-rate incomes.
    var stcgInr = inc.stcg.inr;
    var ltcgTaxableInr = Math.max(0, inc.ltcg.inr - T.LTCG_112A_EXEMPT_INR);
    var specialTaxInr = stcgInr * T.STCG_111A_RATE + ltcgTaxableInr * T.LTCG_112A_RATE;

    // Slab tax on normal income.
    var slabTaxInr = bracketTax(totalNormalInr, slabs);

    // §87A rebate (applies to slab tax on normal income only).
    var totalIncomeInr = totalNormalInr + stcgInr + inc.ltcg.inr;
    var rebate = isNew ? T.REBATE_87A_NEW : T.REBATE_87A_OLD;
    var rebateInr = 0;
    if (totalNormalInr <= rebate.incomeCap) {
      rebateInr = Math.min(slabTaxInr, rebate.maxRebate);
    }

    var taxAfterRebateInr = Math.max(0, slabTaxInr - rebateInr) + specialTaxInr;

    // Surcharge (individual brackets) with simplified marginal relief.
    var surchargeInr = computeIndiaSurcharge(taxAfterRebateInr, totalIncomeInr, isNew, slabs, specialTaxInr, T);

    // 4% Health & Education cess.
    var cessInr = (taxAfterRebateInr + surchargeInr) * T.CESS_RATE;
    var totalTaxInr = taxAfterRebateInr + surchargeInr + cessInr;

    return {
      regime: regime,
      grossTotalIncomeInr: normalSlabInr + stcgInr + inc.ltcg.inr,
      deductionsInr: deductionsInr,
      totalIncomeInr: totalIncomeInr,
      slabTaxInr: slabTaxInr,
      specialTaxInr: specialTaxInr,
      rebateInr: rebateInr,
      surchargeInr: surchargeInr,
      cessInr: cessInr,
      totalTaxInr: totalTaxInr,
      totalTaxUsd: U.inrToUsd(totalTaxInr),
      totalIncomeUsd: U.inrToUsd(totalIncomeInr),
      effectiveRate: totalIncomeInr > 0 ? totalTaxInr / totalIncomeInr : 0
    };
  }

  // ---- India corporate / firm computation (ITR-6 / ITR-5) ----
  function computeIndiaEntityTax(model, inc) {
    var E = model.entity;
    var taxable = inc.total.inr;              // business profit + other income
    var regime, rate, surRate, matApplied = false, preCess;

    if (E.indiaIsCompany) {
      var C = CONST.TAX.INDIA_COMPANY;
      rate = E.indiaOpt115baa ? C.RATE_115BAA : (E.indiaTurnoverLte400cr ? C.RATE_TURNOVER_LTE_400CR : C.RATE_DEFAULT);
      var baseTax = taxable * rate;
      surRate = E.indiaOpt115baa ? C.SURCHARGE_115BAA : (taxable > 100000000 ? C.SURCHARGE_OVER_10CR : (taxable > 10000000 ? C.SURCHARGE_OVER_1CR : 0));
      var normal = baseTax + baseTax * surRate;
      var mat = taxable * C.MAT_RATE;         // MAT floor (book-profit proxy)
      matApplied = !E.indiaOpt115baa && normal < mat;
      preCess = matApplied ? mat : normal;
      var cessC = preCess * C.CESS_RATE;
      regime = "Corporate ITR-6 (" + Math.round(rate * 100) + "%" + (E.indiaOpt115baa ? " §115BAA" : "") + (matApplied ? ", MAT" : "") + ")";
      return entityResult(taxable, baseTax, preCess - baseTax, cessC, preCess + cessC, regime, matApplied);
    }
    // firm / LLP
    var F = CONST.TAX.INDIA_FIRM;
    var ftax = taxable * F.RATE;
    surRate = taxable > 10000000 ? F.SURCHARGE_OVER_1CR : 0;
    var fsur = ftax * surRate;
    var fcess = (ftax + fsur) * F.CESS_RATE;
    regime = "Firm/LLP ITR-5 (30%)";
    return entityResult(taxable, ftax, fsur, fcess, ftax + fsur + fcess, regime, false);

    function entityResult(taxableInr, base, sur, cess, total, label, mat) {
      return {
        regime: label, isEntity: true, matApplied: mat,
        grossTotalIncomeInr: taxableInr, deductionsInr: 0, totalIncomeInr: taxableInr,
        slabTaxInr: base, specialTaxInr: 0, rebateInr: 0, surchargeInr: sur, cessInr: cess,
        totalTaxInr: total, totalTaxUsd: U.inrToUsd(total), totalIncomeUsd: U.inrToUsd(taxableInr),
        effectiveRate: taxableInr > 0 ? total / taxableInr : 0
      };
    }
  }

  function computeIndiaSurcharge(taxBase, totalIncome, isNew, slabs, specialTax, T) {
    // Determine rate & threshold.
    var rate = 0, threshold = 0;
    if (totalIncome > 50000000) { rate = isNew ? T.SURCHARGE_NEW_MAX : 0.37; threshold = 50000000; }
    else if (totalIncome > 20000000) { rate = 0.25; threshold = 20000000; }
    else if (totalIncome > 10000000) { rate = 0.15; threshold = 10000000; }
    else if (totalIncome > 5000000) { rate = 0.10; threshold = 5000000; }
    else return 0;

    // Surcharge on the CG/dividend-attributable tax is capped at 15%.
    var cappedRate = Math.min(rate, T.SURCHARGE_CG_DIV_CAP);
    var nonSpecialTax = Math.max(0, taxBase - specialTax);
    var surcharge = nonSpecialTax * rate + specialTax * cappedRate;

    // Simplified marginal relief: total (tax + surcharge) may not exceed the
    // tax at the threshold plus the income earned above the threshold.
    var taxAtThreshold = bracketTax(threshold, slabs);
    var cap = taxAtThreshold + (totalIncome - threshold);
    if (taxBase + surcharge > cap) surcharge = Math.max(0, cap - taxBase);
    return surcharge;
  }

  /* =========================================================================
   * US FEDERAL INCOME-TAX COMPUTATION
   * =======================================================================*/
  function computeUsTax(model, residency) {
    var T = CONST.TAX.US;
    var inc = model.income.us;
    // Business entities: C-corp pays 21% flat; S-corp/partnership pass through.
    var ek = model.entity ? model.entity.usKind : "individual";
    if (ek === "ccorp" || ek === "scorp" || ek === "partnership" || ek === "trust") {
      return computeUsEntityTax(model, inc, ek);
    }
    var ded = model.deductions.us;
    var status = model.identity.usFilingStatus;
    var brackets = T.BRACKETS[status] || T.BRACKETS.single;
    var worldwide = residency.us.worldwide;

    // Foreign income is included only for worldwide residents/citizens.
    var fW = worldwide ? inc.foreignWages.usd : 0;
    var fI = worldwide ? inc.foreignInterest.usd : 0;
    var fD = worldwide ? inc.foreignDividends.usd : 0;
    var fR = worldwide ? inc.foreignRental.usd : 0;
    var fP = worldwide ? inc.foreignPension.usd : 0;
    var fStcg = worldwide ? inc.foreignStcg.usd : 0;
    var fLtcg = worldwide ? inc.foreignLtcg.usd : 0;

    var nonQualDivUs = Math.max(0, inc.ordinaryDividendsUs.usd - inc.qualifiedDividendsUs.usd);

    // Ordinary income (taxed at bracket rates).
    var ordinaryIncome =
      inc.wages.usd + fW + inc.interestUs.usd + fI +
      nonQualDivUs + fD + inc.stcgUs.usd + fStcg +
      inc.rentalUs.usd + fR + fP;

    // Preferential income (LTCG + qualified dividends).
    var preferentialIncome = inc.ltcgUs.usd + fLtcg + inc.qualifiedDividendsUs.usd;

    var totalIncome = ordinaryIncome + preferentialIncome;

    // Adjustments (above-the-line) — keep minimal.
    var adjustments = Math.min(ded.studentLoanInterest, 2500);
    var agi = Math.max(0, totalIncome - adjustments);

    // Deduction: standard vs itemized.
    var standard = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
    var itemized = Math.min(ded.salt, T.SALT_CAP_USD) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * agi);
    var deduction;
    if (ded.mode === "itemized") deduction = itemized;
    else if (ded.mode === "standard") deduction = standard;
    else deduction = Math.max(standard, itemized);

    var taxableIncome = Math.max(0, agi - deduction);

    // Split taxable income into preferential and ordinary portions.
    var prefTaxable = Math.min(preferentialIncome, taxableIncome);
    var ordTaxable = taxableIncome - prefTaxable;

    var ordinaryTax = bracketTax(ordTaxable, brackets);

    // Preferential (LTCG/QDI) stacked on top of ordinary taxable income.
    var lb = T.LTCG_BRACKETS[status] || T.LTCG_BRACKETS.single;
    var start = ordTaxable;
    var amt0 = Math.max(0, Math.min(lb.br0 - start, prefTaxable));
    var remAfter0 = prefTaxable - amt0;
    var amt15 = Math.max(0, Math.min(lb.br15 - Math.max(start, lb.br0), remAfter0));
    var amt20 = remAfter0 - amt15;
    var preferentialTax = amt15 * 0.15 + amt20 * 0.20;

    var incomeTax = ordinaryTax + preferentialTax;

    // NIIT (3.8%).
    var netInvestmentIncome =
      inc.interestUs.usd + fI + inc.ordinaryDividendsUs.usd + fD +
      inc.capitalGainsUs.usd + fStcg + fLtcg + inc.rentalUs.usd + fR;
    var niitThreshold = CONST.LIMITS.NIIT_THRESHOLD[status] || 200000;
    var niit = T.NIIT_RATE * Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold));

    // Additional Medicare (prefer the form's computed figure).
    var addlMedicare = model.limitsRaw.additionalMedicareOwed || 0;

    var totalTaxBeforeFtc = incomeTax + niit + addlMedicare;

    return {
      filingStatus: status,
      worldwide: worldwide,
      totalIncomeUsd: totalIncome,
      agiUsd: agi,
      deductionUsd: deduction,
      deductionMode: (ded.mode === "itemized" || ded.mode === "standard") ? ded.mode : (itemized > standard ? "itemized" : "standard"),
      taxableIncomeUsd: taxableIncome,
      ordinaryTaxUsd: ordinaryTax,
      preferentialTaxUsd: preferentialTax,
      incomeTaxUsd: incomeTax,
      niitUsd: niit,
      additionalMedicareUsd: addlMedicare,
      totalTaxBeforeFtcUsd: totalTaxBeforeFtc,
      foreignSourceIncomeUsd: fW + fI + fD + fR + fP + fStcg + fLtcg,
      usSourceIncomeUsd: inc.usSourceTotal.usd,
      effectiveRate: totalIncome > 0 ? totalTaxBeforeFtc / totalIncome : 0
    };
  }

  // ---- US corporate / pass-through computation ----
  function computeUsEntityTax(model, inc, kind) {
    var taxable = inc.total.usd; // business income + other
    var form = kind === "ccorp" ? "1120" : kind === "scorp" ? "1120-S" : kind === "partnership" ? "1065" : "1041";
    if (kind === "ccorp") {
      var tax = taxable * CONST.TAX.US.C_CORP_RATE;
      return usEntityResult(taxable, tax, "C-Corp (1120, 21%)", false);
    }
    // S-corp / partnership: entity itself pays ~$0 federal income tax; income
    // passes through to owners on a K-1.
    return usEntityResult(taxable, 0, (kind === "scorp" ? "S-Corp (1120-S)" : kind === "partnership" ? "Partnership (1065)" : "Trust/Estate (1041)") + " · pass-through", true);

    function usEntityResult(taxableUsd, tax, label, passthrough) {
      return {
        filingStatus: label, isEntity: true, passthrough: passthrough, worldwide: true,
        totalIncomeUsd: taxableUsd, agiUsd: taxableUsd, deductionUsd: 0, deductionMode: "n/a",
        taxableIncomeUsd: taxableUsd, ordinaryTaxUsd: tax, preferentialTaxUsd: 0,
        incomeTaxUsd: tax, niitUsd: 0, additionalMedicareUsd: 0, totalTaxBeforeFtcUsd: tax,
        foreignSourceIncomeUsd: model.income.us.foreignSourceTotal.usd,
        usSourceIncomeUsd: model.income.us.usSourceTotal.usd,
        effectiveRate: taxableUsd > 0 ? tax / taxableUsd : 0
      };
    }
  }

  /* =========================================================================
   * RESIDENCY
   * =======================================================================*/
  function resolveResidency(model) {
    var IN = CONST.INDIA_STATUS, US = CONST.US_STATUS;
    var inStatus = model.residency.india.status;
    var usStatus = model.residency.us.status;

    var indiaResident = (inStatus === IN.ROR || inStatus === IN.RNOR);
    var indiaWorldwide = (inStatus === IN.ROR);

    var usResident = model.residency.us.isCitizen || model.residency.us.hasGreenCard ||
                     usStatus === US.RESIDENT_ALIEN || model.residency.us.sptMet;
    var usWorldwide = usResident;

    return {
      india: { status: inStatus, isResident: indiaResident, worldwide: indiaWorldwide },
      us: { status: usStatus, isResident: usResident, worldwide: usWorldwide, isCitizen: model.residency.us.isCitizen },
      dualResident: indiaResident && usResident,
      worldwideOverlap: indiaWorldwide && usWorldwide
    };
  }

  /* =========================================================================
   * FTC RECONCILIATION — driven by the two computed liabilities.
   * =======================================================================*/
  function computeFtc(model, residency, indiaTax, usTax) {
    // ---- Direction 1: US Form 1116 — credit for Indian taxes ----
    // From the US view, Indian income is foreign-source.
    var foreignSrcUsd = model.income.india.total.usd;
    var usTaxableUsd = usTax.taxableIncomeUsd;
    // Only income tax (not NIIT/Medicare) is creditable.
    var usIncomeTaxUsd = usTax.incomeTaxUsd;
    var indiaTaxPaidUsd = indiaTax.totalTaxUsd;

    var usLimitFraction = usTaxableUsd > 0 ? Math.min(1, foreignSrcUsd / usTaxableUsd) : 0;
    var usFtcLimit = usIncomeTaxUsd * usLimitFraction;
    var usFtcAllowed = Math.min(indiaTaxPaidUsd, usFtcLimit);
    var usCarryover = Math.max(0, indiaTaxPaidUsd - usFtcAllowed);

    // ---- Direction 2: India §90 relief — credit for US taxes ----
    // From the India view (ROR), US-source income is foreign-source.
    var foreignSrcIndiaUsd = residency.india.worldwide ? model.income.us.usSourceTotal.usd : 0;
    var indiaTotalIncomeUsd = indiaTax.totalIncomeUsd;
    var indiaTaxOnForeignUsd = indiaTotalIncomeUsd > 0
      ? indiaTax.totalTaxUsd * Math.min(1, foreignSrcIndiaUsd / indiaTotalIncomeUsd)
      : 0;
    // US tax attributable to US-source income.
    var usTaxOnUsSourceUsd = usTax.totalIncomeUsd > 0
      ? usTax.incomeTaxUsd * Math.min(1, usTax.usSourceIncomeUsd / usTax.totalIncomeUsd)
      : 0;
    var indiaReliefAllowed = Math.min(usTaxOnUsSourceUsd, indiaTaxOnForeignUsd);

    // Net unrelieved double tax across both directions.
    var usResidual = usCarryover; // Indian tax not credited in the US this year
    var indiaResidual = Math.max(0, Math.min(usTaxOnUsSourceUsd, indiaTaxOnForeignUsd) - indiaReliefAllowed);
    var netUnrelieved = usResidual + indiaResidual;

    return {
      us: {
        foreignSourceIncomeUsd: foreignSrcUsd,
        taxableIncomeUsd: usTaxableUsd,
        usIncomeTaxUsd: usIncomeTaxUsd,
        indiaTaxPaidUsd: indiaTaxPaidUsd,
        limitFraction: usLimitFraction,
        ftcLimitUsd: usFtcLimit,
        ftcAllowedUsd: usFtcAllowed,
        carryoverUsd: usCarryover,
        residualDoubleTaxUsd: usResidual
      },
      india: {
        foreignSourceIncomeUsd: foreignSrcIndiaUsd,
        usTaxOnUsSourceUsd: usTaxOnUsSourceUsd,
        reliefCapUsd: indiaTaxOnForeignUsd,
        reliefAllowedUsd: indiaReliefAllowed
      },
      netUnrelievedDoubleTaxUsd: netUnrelieved
    };
  }

  /* =========================================================================
   * DOUBLE-TAXED INCOME MAP
   * =======================================================================*/
  function mapDoubleTaxedIncome(model, residency) {
    var items = [], inc = model.income;
    function pair(label, indiaMoney, usMoney, note) {
      var inExposed = indiaMoney && indiaMoney.usd > 0;
      var usExposed = usMoney && usMoney.usd > 0;
      var doublyTaxed = inExposed && (residency.us.worldwide || usExposed);
      if (inExposed || usExposed) {
        items.push({
          label: label, indiaUsd: indiaMoney ? indiaMoney.usd : 0,
          usUsd: usMoney ? usMoney.usd : 0, doublyTaxed: doublyTaxed, note: note || ""
        });
      }
    }
    pair("Salary / Wages (India-source)", inc.india.salary, inc.us.foreignWages,
      "Indian employment income is foreign-source for the US; creditable via Form 1116 general basket.");
    pair("Business / Professional income", inc.india.business, U.zeroMoney(),
      "Indian business profits may also flow through GILTI/Subpart F if held via a corp (Form 5471).");
    pair("House property / Rental (India)", inc.india.houseProperty, inc.us.foreignRental,
      "Indian rent: net-of-expense basis differs (IN 30% standard deduction vs US actual + depreciation).");
    pair("Interest income", inc.india.interest, inc.us.foreignInterest,
      "Passive basket for US FTC; India taxes at slab rate.");
    pair("Dividend income", inc.india.dividend, inc.us.foreignDividends,
      "Indian dividends taxable in shareholder's hands; US qualified-dividend rate may differ.");
    pair("Capital gains", inc.india.capitalGains, inc.us.foreignCapitalGains,
      "STCG/LTCG holding-period and rate definitions differ between IN and US.");
    var totalDoublyTaxedUsd = items.reduce(function (s, it) {
      return s + (it.doublyTaxed ? Math.max(it.indiaUsd, it.usUsd) : 0);
    }, 0);
    return { items: items, totalDoublyTaxedUsd: totalDoublyTaxedUsd };
  }

  /* =========================================================================
   * LIMIT MONITORING
   * =======================================================================*/
  function computeLimits(model) {
    var L = CONST.LIMITS, gauges = [];
    function gauge(id, label, valueUsd, limitUsd, unit, note) {
      var pct = limitUsd > 0 ? (valueUsd / limitUsd) : 0;
      var status = pct >= 1 ? "breached" : (pct >= 0.8 ? "approaching" : "ok");
      gauges.push({ id: id, label: label, value: valueUsd, limit: limitUsd, pct: pct, status: status, unit: unit || "USD", note: note || "" });
    }
    gauge("fbar", "FBAR (FinCEN 114) aggregate", model.accounts.aggregatePeak.usd, L.FBAR_AGGREGATE_USD, "USD",
      "Threshold is a cliff: any breach = full reporting of every foreign account.");
    var status = model.identity.usFilingStatus;
    var isMfj = status === "mfj";
    var abroad = model.limitsRaw.feieClaimed;
    var tbl = L.FORM_8938[abroad ? (isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE") : (isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE")];
    gauge("form8938", "Form 8938 (FATCA) any-time", model.accounts.aggregatePeak.usd, tbl.anyTime, "USD",
      "Threshold shown is the 'any time during year' figure for your status/residence.");
    gauge("lrs", "LRS outbound remittance", U.inrToUsd(model.limitsRaw.lrsRemittedInr), L.LRS_ANNUAL_USD, "USD",
      "RBI cap is per individual per financial year; TCS applies above ₹10L.");
    if (model.limitsRaw.feieClaimed || model.limitsRaw.foreignEarnedIncomeUsd > 0) {
      gauge("feie", "FEIE exclusion used", Math.min(model.limitsRaw.feieAmountUsd, L.FEIE_MAX_USD), L.FEIE_MAX_USD, "USD",
        "Excluded foreign earned income cannot also generate FTC — watch the no-double-dip rule.");
    }
    return gauges;
  }

  /* =========================================================================
   * ORCHESTRATOR
   * =======================================================================*/
  function compute(model) {
    var residency = resolveResidency(model);
    var indiaTax = computeIndiaTax(model);
    var usTax = computeUsTax(model, residency);
    var ftc = computeFtc(model, residency, indiaTax, usTax);
    var doubleTax = mapDoubleTaxedIncome(model, residency);
    var limits = computeLimits(model);

    return {
      residency: residency,
      indiaTax: indiaTax,
      usTax: usTax,
      // back-compat alias used by older dashboard code
      taxEstimate: { india: { estTaxUsd: indiaTax.totalTaxUsd, estTaxInr: indiaTax.totalTaxInr }, us: { estTaxUsd: usTax.totalTaxBeforeFtcUsd } },
      ftc: ftc,
      doubleTax: doubleTax,
      limits: limits,
      headline: {
        name: model.identity.name,
        baseYear: model.meta.baseYear,
        jurisdiction: model.meta.jurisdiction,
        totalIncomeUsd: model.income.us.total.usd + model.income.india.total.usd,
        indiaTaxUsd: indiaTax.totalTaxUsd,
        usTaxUsd: usTax.totalTaxBeforeFtcUsd,
        combinedTaxBeforeReliefUsd: indiaTax.totalTaxUsd + usTax.totalTaxBeforeFtcUsd,
        worldwideOverlap: residency.worldwideOverlap,
        netUnrelievedDoubleTaxUsd: ftc.netUnrelievedDoubleTaxUsd
      }
    };
  }

  WISING.compute = compute;
  WISING.computeInternals = {
    bracketTax: bracketTax,
    computeIndiaTax: computeIndiaTax,
    computeUsTax: computeUsTax,
    resolveResidency: resolveResidency,
    mapDoubleTaxedIncome: mapDoubleTaxedIncome,
    computeFtc: computeFtc,
    computeLimits: computeLimits
  };
})(typeof window !== "undefined" ? window : globalThis);

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

  /* ---- Carry-forward loss set-off (s.71B house property, s.72 business,
   * s.74 capital gains, s.32(2) unabsorbed depreciation) --------------------
   * Layer 1 already resolves per-entry eligibility (late-filing denial,
   * new-regime HP/business-depreciation restrictions) into the "available"
   * amounts read in normalize.js; this sequences the actual SET-OFF against
   * this year's income under the Act's ordering rules, instead of just
   * flagging that brought-forward losses exist.
   *
   * Known simplification: speculative business loss (s.73) can only be set
   * off against speculative business income, which Layer 1 doesn't collect
   * as a separate bucket from ordinary business income — so a speculative
   * loss always stays fully carried forward here rather than being (wrongly)
   * absorbed against ordinary business income. */
  function computeLossSetOff(cfl, buckets) {
    var businessInr = buckets.businessInr, housePropertyInr = buckets.housePropertyInr;
    var otherNormalInr = buckets.otherNormalInr, stcgInr = buckets.stcgInr, ltcgGrossInr = buckets.ltcgGrossInr;

    // 1. Business loss -> business income only (s.72).
    var businessLossUsed = Math.min(cfl.businessLossAvailableInr || 0, businessInr);
    businessInr -= businessLossUsed;
    var businessLossUnused = (cfl.businessLossAvailableInr || 0) - businessLossUsed;

    // 2. House property loss -> house property income only (s.71B; unlike
    // CURRENT-year HP loss, brought-forward HP loss cannot go inter-head).
    var hpLossUsed = Math.min(cfl.housePropertyLossAvailableInr || 0, housePropertyInr);
    housePropertyInr -= hpLossUsed;
    var hpLossUnused = (cfl.housePropertyLossAvailableInr || 0) - hpLossUsed;

    // 3. STCG loss -> STCG first, remainder against LTCG (both allowed, s.74).
    var stcgLossAvail = cfl.stcgLossAvailableInr || 0;
    var stcgLossUsedVsStcg = Math.min(stcgLossAvail, stcgInr);
    stcgInr -= stcgLossUsedVsStcg;
    var stcgLossRemaining = stcgLossAvail - stcgLossUsedVsStcg;
    var stcgLossUsedVsLtcg = Math.min(stcgLossRemaining, ltcgGrossInr);
    ltcgGrossInr -= stcgLossUsedVsLtcg;
    var stcgLossUnused = stcgLossRemaining - stcgLossUsedVsLtcg;

    // 4. LTCG loss -> LTCG only, never STCG (s.74).
    var ltcgLossAvail = cfl.ltcgLossAvailableInr || 0;
    var ltcgLossUsed = Math.min(ltcgLossAvail, ltcgGrossInr);
    ltcgGrossInr -= ltcgLossUsed;
    var ltcgLossUnused = ltcgLossAvail - ltcgLossUsed;

    // 5. Speculative loss -> no speculative-income bucket modeled (see note
    // above), so it always stays fully carried forward.
    var speculativeLossUnused = cfl.speculativeLossAvailableInr || 0;

    // 6. Unabsorbed depreciation (s.32(2)) -> any head except salary, no time
    // limit. Convention: business first (deemed current-year business loss),
    // then house property, then capital gains, then other normal income.
    var depRemaining = cfl.unabsorbedDepreciationCf || 0;
    var used;
    used = Math.min(depRemaining, businessInr); businessInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, housePropertyInr); housePropertyInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, stcgInr); stcgInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, ltcgGrossInr); ltcgGrossInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, otherNormalInr); otherNormalInr -= used; depRemaining -= used;
    var depUsed = (cfl.unabsorbedDepreciationCf || 0) - depRemaining;

    var totalUsedInr = businessLossUsed + hpLossUsed + stcgLossUsedVsStcg + stcgLossUsedVsLtcg + ltcgLossUsed + depUsed;
    var totalUnusedInr = businessLossUnused + hpLossUnused + stcgLossUnused + ltcgLossUnused + speculativeLossUnused + depRemaining;

    return {
      businessInr: businessInr, housePropertyInr: housePropertyInr, otherNormalInr: otherNormalInr,
      stcgInr: stcgInr, ltcgGrossInr: ltcgGrossInr,
      totalUsedInr: totalUsedInr, totalUnusedInr: totalUnusedInr,
      unused: {
        businessInr: businessLossUnused, housePropertyInr: hpLossUnused,
        stcgInr: stcgLossUnused, ltcgInr: ltcgLossUnused,
        speculativeInr: speculativeLossUnused, unabsorbedDepreciationInr: depRemaining
      },
      used: {
        businessInr: businessLossUsed, housePropertyInr: hpLossUsed,
        stcgInr: stcgLossUsedVsStcg, ltcgFromStcgLossInr: stcgLossUsedVsLtcg, ltcgInr: ltcgLossUsed,
        unabsorbedDepreciationInr: depUsed
      }
    };
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
    // Deemed dividend on buyback (s.2(22)(f)) is taxed exactly like ordinary
    // dividend — at slab rates, in Other Sources — so it joins the same
    // normal-slab bucket dividend already sits in.
    var deemedDividendInr = (inc.deemedDividendBuyback && inc.deemedDividendBuyback.inr) || 0;

    // Sequence brought-forward loss set-off against this year's income
    // BEFORE computing the slab/special-rate totals below, so the actual tax
    // reflects it (not just a disclosure that losses exist). Salary and
    // s.115BB/115BBJ special-rate income are untouched — losses cannot be
    // set off against either (s.58(4) explicitly bars it for the latter).
    var lossSetOff = computeLossSetOff(model.carryForwardLosses || {}, {
      businessInr: inc.business.inr,
      housePropertyInr: inc.houseProperty.inr,
      otherNormalInr: inc.interest.inr + inc.dividend.inr + deemedDividendInr,
      stcgInr: inc.stcg.inr,
      ltcgGrossInr: inc.ltcg.inr
    });

    var normalSlabInr = inc.salary.inr + lossSetOff.businessInr + lossSetOff.housePropertyInr + lossSetOff.otherNormalInr;

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

    // Special-rate incomes (already net of capital-loss set-off above).
    var stcgInr = lossSetOff.stcgInr;
    var ltcgTaxableInr = Math.max(0, lossSetOff.ltcgGrossInr - T.LTCG_112A_EXEMPT_INR);
    // s.115BB/115BBJ (lottery/betting/online gaming): flat rate, no basic
    // exemption threshold benefit — the full amount is taxed, never reduced
    // by any slab/exemption logic.
    var special115bbInr = (inc.specialRate115bb && inc.specialRate115bb.inr) || 0;
    var special115bbTaxInr = special115bbInr * T.RATE_115BB;
    // Only CG/dividend-type special-rate tax gets the 15%-surcharge-cap
    // treatment (computeIndiaSurcharge below) — s.115BB/115BBJ winnings do
    // NOT get that cap and take the full uncapped slab-based surcharge rate,
    // so keep it out of the "cap-eligible" bucket passed to that function.
    var capEligibleSpecialTaxInr = stcgInr * T.STCG_111A_RATE + ltcgTaxableInr * T.LTCG_112A_RATE;
    var specialTaxInr = capEligibleSpecialTaxInr + special115bbTaxInr;

    // Slab tax on normal income.
    var slabTaxInr = bracketTax(totalNormalInr, slabs);

    // §87A rebate — restricted to a "resident individual" by the section
    // itself; HUF/AOP/BOI/trust share this same slab computation path but are
    // NOT entitled to it (previously applied unconditionally to anyone who
    // reached this branch, which silently over-relieved HUF filers).
    // NOTE: uses ltcgTaxableInr (net of the s.112A exemption), not gross LTCG
    // — the exempt slice isn't part of total income at all, same as it isn't
    // part of the special-rate tax computed just above. Previously this used
    // gross LTCG while specialTaxInr/capEligibleSpecialTaxInr used the
    // exemption-adjusted figure, silently inflating totalIncomeInr (and, via
    // computeIndiaSurcharge below, the surcharge threshold test) by the
    // exempt amount.
    var totalIncomeInr = totalNormalInr + stcgInr + ltcgTaxableInr + special115bbInr;
    var isIndividual = !model.entity || model.entity.indiaKind === "individual";
    var rebate = isNew ? T.REBATE_87A_NEW : T.REBATE_87A_OLD;
    var rebateInr = 0;
    if (isIndividual && totalNormalInr <= rebate.incomeCap) {
      rebateInr = Math.min(slabTaxInr, rebate.maxRebate);
    }

    var taxAfterRebateInr = Math.max(0, slabTaxInr - rebateInr) + specialTaxInr;

    // Surcharge (individual brackets) with simplified marginal relief. Pass
    // only the cap-eligible (CG/dividend) special tax — the 115BB tax rides
    // along inside taxAfterRebateInr but is counted as "non-special" here so
    // it gets the full uncapped surcharge rate.
    var surchargeInr = computeIndiaSurcharge(taxAfterRebateInr, totalIncomeInr, isNew, slabs, capEligibleSpecialTaxInr, T);

    // 4% Health & Education cess.
    var cessInr = (taxAfterRebateInr + surchargeInr) * T.CESS_RATE;
    var totalTaxInr = taxAfterRebateInr + surchargeInr + cessInr;

    return {
      regime: regime,
      grossTotalIncomeInr: normalSlabInr + stcgInr + ltcgTaxableInr + special115bbInr,
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
      effectiveRate: totalIncomeInr > 0 ? totalTaxInr / totalIncomeInr : 0,
      lossSetOff: lossSetOff
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
   * FEIE ELIGIBILITY (Form 2555, §911)
   * ---------------------------------------------------------------------
   * The exclusion is ONLY available to a taxpayer whose tax home is in a
   * foreign country AND who meets the bona-fide-residence test or the
   * physical-presence test (>=330 full days abroad in 12 months, i.e. at
   * most ~35 days in the US during the test period). A person living in the
   * US with foreign income does NOT qualify. Layer 1 (US) captures all of
   * these facts under foreign_earned_income.*.
   * =======================================================================*/
  function feieEligibility(model) {
    var f = model.feie || {};
    var claimed = !!f.claimed || (f.amountClaimedUsd || 0) > 0;
    var home = String(f.taxHomeCountry || "").trim().toLowerCase();
    var taxHomeAbroad = home !== "" && home !== "us" && home !== "usa" &&
                        home !== "united states" && home !== "united states of america";
    var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
    var ppMet = !!f.physicalPresence && ppDaysOk;
    var bfMet = !!f.bonaFide;
    var reasons = [];
    if (claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
    if (claimed && !bfMet && !ppMet) {
      reasons.push(!f.physicalPresence && !f.bonaFide
        ? "neither the bona-fide-residence nor the physical-presence test is met"
        : (f.physicalPresence && !ppDaysOk
          ? (f.daysInUsTestPeriod + " US days in the test period — over the ~35-day allowance (330 full days abroad required)")
          : "bona-fide-residence test not met"));
    }
    return {
      claimed: claimed,
      amountClaimedUsd: f.amountClaimedUsd || 0,
      taxHomeAbroad: taxHomeAbroad,
      testMet: bfMet || ppMet,
      eligible: taxHomeAbroad && (bfMet || ppMet),
      reasons: reasons
    };
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
    // Non-resident alien filing Form 1040-NR (and not electing §6013(g)/(h) to
    // be treated as a full-year resident): ECI is graduated, FDAP is flat —
    // NOT the same resident-style computation used below.
    if (model.treaty.files1040nr && model.nra && !model.nra.s6013hElection) {
      return computeNraTax(model, inc);
    }
    var ded = model.deductions.us;
    var status = model.identity.usFilingStatus;
    var brackets = T.BRACKETS[status] || T.BRACKETS.single;
    var worldwide = residency.us.worldwide;

    // Foreign income is included only for worldwide residents/citizens.
    var fW = worldwide ? inc.foreignWages.usd : 0;

    // FEIE (Form 2555) — gated on eligibility, not on the checkbox. Only a
    // taxpayer living abroad (foreign tax home + bona-fide-residence or
    // physical-presence test) may exclude, and only foreign EARNED income.
    var feie = feieEligibility(model);
    var feieAppliedUsd = 0;
    if (worldwide && feie.claimed && feie.eligible && fW > 0) {
      var feieBase = feie.amountClaimedUsd > 0 ? feie.amountClaimedUsd : fW;
      feieAppliedUsd = Math.min(fW, feieBase, CONST.LIMITS.FEIE_MAX_USD);
      fW = fW - feieAppliedUsd;
    }
    var fI = worldwide ? inc.foreignInterest.usd : 0;
    var fD = worldwide ? inc.foreignDividends.usd : 0;
    var fR = worldwide ? inc.foreignRental.usd : 0;
    var fP = worldwide ? inc.foreignPension.usd : 0;
    var fStcg = worldwide ? inc.foreignStcg.usd : 0;
    var fLtcg = worldwide ? inc.foreignLtcg.usd : 0;

    var nonQualDivUs = Math.max(0, inc.ordinaryDividendsUs.usd - inc.qualifiedDividendsUs.usd);

    // Ordinary income (taxed at bracket rates). US retirement/pension
    // distributions and Social Security are US-source ordinary income.
    var ordinaryIncome =
      inc.wages.usd + fW + inc.interestUs.usd + fI +
      nonQualDivUs + fD + inc.stcgUs.usd + fStcg +
      inc.rentalUs.usd + fR + fP + (inc.usRetirementIncome ? inc.usRetirementIncome.usd : 0);

    // Preferential income (LTCG + qualified dividends).
    var preferentialIncome = inc.ltcgUs.usd + fLtcg + inc.qualifiedDividendsUs.usd;

    var totalIncome = ordinaryIncome + preferentialIncome;

    // ---- Self-employment tax (Schedule SE) ----
    // 92.35% of SE net earnings; 12.4% Social Security (capped by the wage base,
    // reduced by W-2 SS wages already taxed) + 2.9% Medicare (uncapped). Half of
    // the SE tax is an above-the-line deduction.
    var seNet = (inc.seEarningsUsd || 0) * T.SE_NET_FACTOR;
    var ssWagesAlready = inc.medicareWages || inc.wages.usd || 0;
    var ssBaseRemaining = Math.max(0, T.SS_WAGE_BASE_USD - ssWagesAlready);
    var seTax = seNet > 0 ? (T.SE_RATE_SS * Math.min(seNet, ssBaseRemaining) + T.SE_RATE_MEDICARE * seNet) : 0;
    var halfSeDeduction = seTax / 2;

    // Adjustments (above-the-line) — student-loan interest + 1/2 SE tax.
    var adjustments = Math.min(ded.studentLoanInterest, 2500) + halfSeDeduction;
    var agi = Math.max(0, totalIncome - adjustments);

    // Deduction: standard vs itemized.
    var standard = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
    var itemized = Math.min(ded.salt, T.SALT_CAP_USD) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * agi);
    var deduction;
    if (ded.mode === "itemized") deduction = itemized;
    else if (ded.mode === "standard") deduction = standard;
    else deduction = Math.max(standard, itemized);

    var taxableBeforeQbi = Math.max(0, agi - deduction);

    // ---- QBI deduction (§199A) ----
    // 20% of qualified business income, capped at 20% of (taxable income less
    // net capital gains), with an SSTB phase-out over the income threshold.
    var qbi = inc.qbiIncomeUsd || 0;
    var qbiThr = T.QBI_THRESHOLD[status] || T.QBI_THRESHOLD.single;
    var qbiPhase = T.QBI_PHASEIN[status] || T.QBI_PHASEIN.single;
    var qbiFrac = 1;
    if (inc.qbiIsSSTB) {
      if (taxableBeforeQbi >= qbiThr + qbiPhase) qbiFrac = 0;
      else if (taxableBeforeQbi > qbiThr) qbiFrac = 1 - (taxableBeforeQbi - qbiThr) / qbiPhase;
    }
    var qbiDeduction = T.QBI_RATE * qbi * qbiFrac;
    qbiDeduction = Math.max(0, Math.round(Math.min(qbiDeduction, T.QBI_RATE * Math.max(0, taxableBeforeQbi - preferentialIncome))));

    var taxableIncome = Math.max(0, taxableBeforeQbi - qbiDeduction);

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

    // ---- AMT (§55) — parallel minimum tax ----
    // AMTI = regular taxable income + disallowed deductions (the standard
    // deduction, or the SALT slice if itemized) + preference items (§57). QBI is
    // allowed for AMT. TMT = 26/28% of the AMT base above the exemption; AMT owed
    // is the excess of TMT over the regular income tax.
    var usedMode = (ded.mode === "itemized" || ded.mode === "standard") ? ded.mode : (itemized > standard ? "itemized" : "standard");
    var amtAddback = usedMode === "standard" ? deduction : Math.min(ded.salt, T.SALT_CAP_USD);
    var amtiUsd = Math.max(0, taxableIncome + amtAddback + (ded.amtPrefs || 0));
    var amtExFull = T.AMT_EXEMPTION[status] || T.AMT_EXEMPTION.single;
    var amtPhase = T.AMT_PHASEOUT[status] || T.AMT_PHASEOUT.single;
    var amtExemption = Math.max(0, amtExFull - 0.25 * Math.max(0, amtiUsd - amtPhase));
    var amtBase = Math.max(0, amtiUsd - amtExemption);
    var amtOrdBase = Math.max(0, amtBase - prefTaxable); // LTCG/QDI keep preferential rates
    var amtBrk = status === "mfs" ? T.AMT_RATE_BREAK / 2 : T.AMT_RATE_BREAK;
    var tmtOrd = amtOrdBase <= amtBrk ? amtOrdBase * T.AMT_RATE_LOW : amtBrk * T.AMT_RATE_LOW + (amtOrdBase - amtBrk) * T.AMT_RATE_HIGH;
    var amtOwed = Math.max(0, Math.round(tmtOrd + preferentialTax - incomeTax));

    // ---- Non-refundable personal credits ----
    // Child & Dependent Care (20% of up to $3k/$6k), AOTC (≤$2,500/student) and
    // Lifetime Learning (≤$2,000), both education credits phased out by MAGI.
    var magi = agi;
    var eduLo = status === "mfj" ? 160000 : 80000, eduHi = status === "mfj" ? 180000 : 90000;
    var eduPhase = magi <= eduLo ? 1 : (magi >= eduHi ? 0 : 1 - (magi - eduLo) / (eduHi - eduLo));
    var careCap = (ded.dependents >= 2 ? 6000 : 3000);
    var childCareCredit = 0.20 * Math.min(ded.careExpenses || 0, careCap);
    var aotcCredit = Math.min(ded.aotc || 0, 2500 * Math.max(1, ded.dependents || 1)) * eduPhase;
    var llcCredit = Math.min(ded.lifetimeLearning || 0, 2000) * eduPhase;
    var creditsUsd = Math.min(Math.round(childCareCredit + aotcCredit + llcCredit), Math.round(incomeTax));

    var totalTaxBeforeFtc = incomeTax + niit + addlMedicare + seTax + amtOwed - creditsUsd;

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
      seTaxUsd: seTax,
      qbiDeductionUsd: qbiDeduction,
      amtUsd: amtOwed,
      creditsUsd: creditsUsd,
      totalTaxBeforeFtcUsd: totalTaxBeforeFtc,
      foreignSourceIncomeUsd: fW + fI + fD + fR + fP + fStcg + fLtcg,
      usSourceIncomeUsd: inc.usSourceTotal.usd,
      feie: {
        claimed: feie.claimed, eligible: feie.eligible, taxHomeAbroad: feie.taxHomeAbroad,
        testMet: feie.testMet, reasons: feie.reasons, appliedUsd: feieAppliedUsd
      },
      effectiveRate: totalIncome > 0 ? totalTaxBeforeFtc / totalIncome : 0
    };
  }

  // ---- Form 1040-NR computation (non-resident alien, no §6013(g)/(h) election) ----
  // Layer 1 already classifies US-source income into ECI (wages + net
  // self-employment) and FDAP (interest + ordinary dividends + rental) — see
  // nra_specific.us_eci_income_usd / us_fdap_income_usd. ECI is taxed at the
  // same graduated brackets as a resident (deductions allowed, but NRAs
  // generally cannot claim the standard deduction — itemized only here,
  // planning-grade; the narrow India-treaty student/business-apprentice
  // standard-deduction exception is not modeled). FDAP is taxed FLAT at the
  // claimed treaty rate (or 30% absent a claim), with NO deductions — this is
  // Schedule NEC, not the graduated brackets. NRAs are not taxed on
  // foreign-source income at all, so there is no US-side FTC need for it.
  function computeNraTax(model, inc) {
    var T = CONST.TAX.US;
    var nra = model.nra || {};
    var status = model.identity.usFilingStatus === "mfj" ? "mfj" : "single"; // NRAs generally can't file MFJ absent §6013
    var brackets = T.BRACKETS[status] || T.BRACKETS.single;
    var ded = model.deductions.us;

    var eciUsd = nra.eciIncomeUsd || 0;
    var fdapUsd = nra.fdapIncomeUsd || 0;
    var claim = (nra.treatyRateClaims || [])[0];
    var fdapRate = (claim && claim.rate != null) ? Math.max(0, Math.min(1, Number(claim.rate) / 100)) : 0.30;

    var itemized = Math.min(ded.salt, T.SALT_CAP_USD) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * eciUsd);
    var taxableEciUsd = Math.max(0, eciUsd - itemized);
    var eciTaxUsd = bracketTax(taxableEciUsd, brackets);
    var fdapTaxUsd = fdapUsd * fdapRate;
    var addlMedicare = model.limitsRaw.additionalMedicareOwed || 0;
    var totalTax = eciTaxUsd + fdapTaxUsd + addlMedicare;

    return {
      filingStatus: status, worldwide: false, isNra: true,
      totalIncomeUsd: eciUsd + fdapUsd,
      agiUsd: eciUsd, deductionUsd: itemized, deductionMode: "itemized (NRA — no standard deduction)",
      taxableIncomeUsd: taxableEciUsd,
      ordinaryTaxUsd: eciTaxUsd, preferentialTaxUsd: 0, incomeTaxUsd: eciTaxUsd + fdapTaxUsd,
      niitUsd: 0, additionalMedicareUsd: addlMedicare, seTaxUsd: 0, qbiDeductionUsd: 0, amtUsd: 0, creditsUsd: 0,
      totalTaxBeforeFtcUsd: totalTax,
      foreignSourceIncomeUsd: 0, // NRAs aren't taxed on foreign-source income — no US FTC need for it
      usSourceIncomeUsd: eciUsd + fdapUsd,
      nra: { eciUsd: eciUsd, fdapUsd: fdapUsd, fdapRate: fdapRate, eciTaxUsd: eciTaxUsd, fdapTaxUsd: fdapTaxUsd },
      feie: { claimed: false, eligible: false, taxHomeAbroad: false, testMet: false, reasons: [], appliedUsd: 0 },
      effectiveRate: (eciUsd + fdapUsd) > 0 ? totalTax / (eciUsd + fdapUsd) : 0
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
        incomeTaxUsd: tax, niitUsd: 0, additionalMedicareUsd: 0,
        seTaxUsd: 0, qbiDeductionUsd: 0, amtUsd: 0, creditsUsd: 0,
        totalTaxBeforeFtcUsd: tax,
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

    // Apply the recorded DTAA Article 4 tie-breaker: the LOSER jurisdiction
    // stops taxing worldwide income (source-basis only) for the treaty period.
    // US citizens keep worldwide taxation regardless (§ saving clause).
    var tre = model.treaty || {};
    var indiaCedes = tre.treatyResidence === "us" || tre.dtaaForcedNr === true;
    var usCedes = (tre.usTreatyResidence === "india" || tre.files1040nr === true) && !model.residency.us.isCitizen;
    var tieBreakWinner = tre.treatyResidence !== "none" ? tre.treatyResidence
                        : (tre.usTreatyResidence !== "none" ? tre.usTreatyResidence : null);
    if (indiaCedes) indiaWorldwide = false;
    if (usCedes) usWorldwide = false;

    return {
      india: { status: inStatus, isResident: indiaResident, worldwide: indiaWorldwide, cedesViaTreaty: indiaCedes },
      us: { status: usStatus, isResident: usResident, worldwide: usWorldwide, isCitizen: model.residency.us.isCitizen, cedesViaTreaty: usCedes },
      dualResident: indiaResident && usResident,
      tieBreakWinner: tieBreakWinner,
      worldwideOverlap: indiaWorldwide && usWorldwide
    };
  }

  /* =========================================================================
   * FTC RECONCILIATION — driven by the two computed liabilities.
   * =======================================================================*/
  function computeFtc(model, residency, indiaTax, usTax) {
    // ---- Direction 1: US Form 1116 — credit for Indian taxes ----
    // From the US view, Indian income is foreign-source.
    // §911(d)(6) no-double-dip: income excluded under FEIE leaves the FTC
    // computation entirely — it is removed from foreign-source income and the
    // Indian tax allocable to it is proportionally disallowed as a credit.
    var feieExcludedUsd = (usTax.feie && usTax.feie.appliedUsd) || 0;
    // An NRA (Form 1040-NR, no §6013 election) is not taxed by the US on
    // foreign-source income at all, so there is nothing for a US-side FTC to
    // relieve — zeroing this avoids a misleading "credit available/shortfall"
    // finding computed against income that was never in the US tax base.
    var foreignSrcGrossUsd = usTax.isNra ? 0 : model.income.india.total.usd;
    var foreignSrcUsd = Math.max(0, foreignSrcGrossUsd - feieExcludedUsd);
    // The `: 1` fallback below is only valid when there's genuinely no foreign
    // income to begin with; for an NRA, foreignSrcGrossUsd is zeroed by FIAT
    // (not because there's no Indian income) so the fallback would wrongly
    // multiply a real India tax figure by 1 and present it as an unrelieved
    // US-side credit shortfall. Force the whole US-direction credit to 0 for NRAs.
    var creditableFraction = usTax.isNra ? 0 : (foreignSrcGrossUsd > 0 ? foreignSrcUsd / foreignSrcGrossUsd : 1);
    var usTaxableUsd = usTax.taxableIncomeUsd;
    // Only income tax (not NIIT/Medicare) is creditable.
    var usIncomeTaxUsd = usTax.incomeTaxUsd;
    var indiaTaxPaidGrossUsd = indiaTax.totalTaxUsd;
    var indiaTaxPaidUsd = indiaTaxPaidGrossUsd * creditableFraction;
    var indiaTaxDisallowedUsd = indiaTaxPaidGrossUsd - indiaTaxPaidUsd;

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
        feieExcludedUsd: feieExcludedUsd,
        indiaTaxDisallowedUsd: indiaTaxDisallowedUsd,
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
    // "Living abroad" for the 8938 threshold table follows the §911 facts
    // (foreign tax home + presence test), not the FEIE checkbox.
    var feieEl = feieEligibility(model);
    var abroad = feieEl.taxHomeAbroad && feieEl.testMet;
    var tbl = L.FORM_8938[abroad ? (isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE") : (isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE")];
    gauge("form8938", "Form 8938 (FATCA) any-time", model.accounts.aggregatePeak.usd, tbl.anyTime, "USD",
      "Threshold shown is the 'any time during year' figure for your status/residence.");
    gauge("lrs", "LRS outbound remittance", U.inrToUsd(model.limitsRaw.lrsRemittedInr), L.LRS_ANNUAL_USD, "USD",
      "RBI cap is per individual per financial year; TCS applies above ₹10L.");
    if (feieEl.claimed || model.limitsRaw.foreignEarnedIncomeUsd > 0) {
      var feieUsed = feieEl.eligible
        ? Math.min(model.limitsRaw.feieAmountUsd || model.limitsRaw.foreignEarnedIncomeUsd, L.FEIE_MAX_USD)
        : 0;
      gauge("feie", "FEIE exclusion used", feieUsed, L.FEIE_MAX_USD, "USD",
        feieEl.eligible
          ? "Excluded foreign earned income cannot also generate FTC — §911 no-double-dip applied."
          : (feieEl.claimed ? "FEIE claimed but NOT eligible (" + feieEl.reasons.join("; ") + ") — exclusion set to $0."
                            : "Not claimed."));
    }
    return gauges;
  }

  /* =========================================================================
   * CROSS-BASIS RECONCILIATION
   * ---------------------------------------------------------------------
   * The core value prop: the SAME income taxed under BOTH countries' own
   * code. India-source heads are re-computed under the US IRC when the US
   * taxes worldwide; US-source heads are re-computed under the Indian ITA
   * when India is ROR. Planning-grade — items marked `estimate:true` still
   * need line-item inputs (US rental depreciation, per-transaction FX under
   * Rule 115, cost basis / acquisition date for gains) to be filing-exact.
   * =======================================================================*/
  function crossBasis(model, residency, usTax) {
    function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
    var inc = model.income, rows = [];
    var feieApplied = (usTax.feie && usTax.feie.appliedUsd) || 0;
    var usWW = residency.us.worldwide, inWW = residency.india.worldwide;
    var viaForeignCorp = model.assets.usOwns10PctForeignCorp || (model.assets.usForeignCorps || []).length > 0;
    var stdDedInr = model.residency.india.taxRegime === "old" ? 50000 : 75000;
    var stdDedUsd = stdDedInr / CONST.FX.INR_PER_USD;
    var stdDedLabel = "₹" + stdDedInr.toLocaleString("en-IN");
    function row(o) {
      o.indiaLawUsd = Math.round(o.indiaLawUsd || 0); o.usLawUsd = Math.round(o.usLawUsd || 0);
      o.doublyTaxed = o.indiaLawUsd > 0 && o.usLawUsd > 0;
      o.overlapUsd = o.doublyTaxed ? Math.min(o.indiaLawUsd, o.usLawUsd) : 0;
      rows.push(o);
    }

    // ---- Direction A: India-source income → US IRC (US taxes worldwide) ----
    // Each side is computed under its OWN code, so the two columns diverge where
    // deductions differ (salary std deduction, house-property 30% vs US
    // depreciation) and share a base but differ in RATE for pure-inclusion heads.
    if (usWW) {
      if (inc.india.salary.usd > 0) {
        // India figure is already net of the std deduction; the US taxes the
        // gross wage (adds it back) and then applies FEIE when eligible.
        var grossWage = inc.india.salary.usd + stdDedUsd;
        row({ head: "salary", label: "Salary / Wages", dir: "IN→US", source: "India",
          indiaLawUsd: inc.india.salary.usd, usLawUsd: Math.max(0, grossWage - feieApplied),
          indiaRule: "Net of " + stdDedLabel + " std deduction · slab ≤ 30%",
          usRule: (feieApplied > 0 ? "Gross less FEIE " + usd(feieApplied) : "Gross wage; no std deduction") + " · brackets ≤ 37%" });
      }
      if (inc.india.business.usd > 0) {
        if (viaForeignCorp) {
          row({ head: "business", label: "Business / Professional", dir: "IN→US", source: "India",
            indiaLawUsd: inc.india.business.usd, usLawUsd: 0,
            indiaRule: "PGBP net · Indian depreciation",
            usRule: "Held via Indian company → not personal income; taxed via CFC/GILTI (Form 5471)",
            note: "See the Form 5471 finding." });
        } else {
          row({ head: "business", label: "Business / Professional", dir: "IN→US", source: "India",
            indiaLawUsd: inc.india.business.usd, usLawUsd: inc.india.business.usd, estimate: true,
            indiaRule: "PGBP net · Indian depreciation", usRule: "Schedule C net · US depreciation (MACRS)",
            note: "US net approximated at Indian net — diverges with US depreciation schedule." });
        }
      }
      if (inc.india.houseProperty.usd > 0) {
        // India: Net Annual Value less the flat 30% deduction (s.24a). US: gross
        // rent less actual expenses AND straight-line depreciation (27.5y) — a
        // much larger write-off, so the US base is typically lower.
        var nav = inc.india.houseProperty.usd;
        row({ head: "rental", label: "House property / Rental", dir: "IN→US", source: "India",
          indiaLawUsd: nav * 0.70, usLawUsd: nav * 0.55, estimate: true,
          indiaRule: "NAV less 30% std deduction (s.24a)",
          usRule: "Gross less actual expenses + straight-line depreciation (27.5y)",
          note: "US net is planning-grade — refine with the property's depreciable basis." });
      }
      if (inc.india.interest.usd > 0) row({ head: "interest", label: "Interest", dir: "IN→US", source: "India",
        indiaLawUsd: inc.india.interest.usd, usLawUsd: inc.india.interest.usd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Ordinary ≤ 37% (passive FTC basket)" });
      if (inc.india.dividend.usd > 0) row({ head: "dividend", label: "Dividend", dir: "IN→US", source: "India",
        indiaLawUsd: inc.india.dividend.usd, usLawUsd: inc.india.dividend.usd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Qualified 15–20% if treaty + holding, else ordinary" });
      if (inc.india.capitalGains.usd > 0) row({ head: "capgains", label: "Capital gains", dir: "IN→US", source: "India",
        indiaLawUsd: inc.india.capitalGains.usd, usLawUsd: inc.india.capitalGains.usd, sameBase: true, estimate: true,
        indiaRule: "LTCG 12.5% / STCG slab · Indian holding periods",
        usRule: "LTCG 0/15/20% (>1y) / STCG ordinary · USD cost basis",
        note: "Same gain; the US recomputes on USD cost basis + acquisition-date FX (Rule 115)." });
    }

    // ---- Direction B: US-source income → Indian ITA (India ROR = worldwide) ----
    if (inWW) {
      if (inc.us.wages.usd > 0) row({ head: "us_salary", label: "US Salary / Wages", dir: "US→IN", source: "US",
        indiaLawUsd: Math.max(0, inc.us.wages.usd - stdDedUsd), usLawUsd: inc.us.wages.usd,
        indiaRule: "Less " + stdDedLabel + " std deduction · slab ≤ 30%", usRule: "Gross wage · brackets ≤ 37%" });
      if (inc.us.rentalUs.usd > 0) row({ head: "us_rental", label: "US House property / Rental", dir: "US→IN", source: "US",
        indiaLawUsd: inc.us.rentalUs.usd * 1.15, usLawUsd: inc.us.rentalUs.usd, estimate: true,
        indiaRule: "NAV less 30% only — US depreciation added back", usRule: "Net after expenses + depreciation",
        note: "India disallows US depreciation and grants only the 30% deduction, so its base is higher." });
      if (inc.us.interestUs.usd > 0) row({ head: "us_interest", label: "US Interest", dir: "US→IN", source: "US",
        indiaLawUsd: inc.us.interestUs.usd, usLawUsd: inc.us.interestUs.usd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Ordinary ≤ 37%" });
      if (inc.us.ordinaryDividendsUs.usd > 0) row({ head: "us_dividend", label: "US Dividend", dir: "US→IN", source: "US",
        indiaLawUsd: inc.us.ordinaryDividendsUs.usd, usLawUsd: inc.us.ordinaryDividendsUs.usd, sameBase: true,
        indiaRule: "Slab ≤ 30%", usRule: "Qualified 15–20% / ordinary" });
      if (inc.us.capitalGainsUs.usd > 0) row({ head: "us_capgains", label: "US Capital gains", dir: "US→IN", source: "US",
        indiaLawUsd: inc.us.capitalGainsUs.usd, usLawUsd: inc.us.capitalGainsUs.usd, sameBase: true, estimate: true,
        indiaRule: "STCG slab / LTCG per Indian buckets", usRule: "LTCG 0/15/20% / STCG ordinary" });
    }

    var overlapUsd = rows.reduce(function (s, r) { return s + r.overlapUsd; }, 0);
    var anyEstimate = rows.some(function (r) { return r.estimate; });
    return { rows: rows, overlapUsd: overlapUsd, feieAppliedUsd: feieApplied, anyEstimate: anyEstimate };
  }

  /* =========================================================================
   * TAX-YEAR APPORTIONMENT (Indian FY Apr–Mar ↔ US CY Jan–Dec)
   * ---------------------------------------------------------------------
   * The Indian FY straddles two US calendar years: Q1–Q3 (Apr–Dec) fall in
   * CY-primary, Q4 (Jan–Mar) in CY-next. We split Indian income across the US
   * calendar years (using quarterly data when present, else an even-earning
   * assumption) and the US CY across the Indian FY (9/12 + 3/12), so FTC in
   * each country can be matched to the other's period. Planning-grade.
   * =======================================================================*/
  function computeApportionment(model) {
    var baseYear = model.meta.baseYear || 2025;
    var q = model.periods && model.periods.indiaQuarterlyUsd;
    var hasQ = !!(q && q.some(function (x) { return x > 0; }));
    var indiaFyTotal = model.income.india.total.usd;
    var primaryShare, nextShare;
    if (hasQ) {
      var qTot = (q[0] + q[1] + q[2] + q[3]) || indiaFyTotal || 1;
      primaryShare = (q[0] + q[1] + q[2]) / qTot;
      nextShare = q[3] / qTot;
    } else {
      primaryShare = 0.75; nextShare = 0.25;   // 9 months (Apr–Dec) vs 3 (Jan–Mar)
    }
    var usCyTotal = model.income.us.usSourceTotal.usd;
    return {
      basis: hasQ ? "Indian quarterly data" : "even-earning assumption (Apr–Dec vs Jan–Mar)",
      fyLabel: "FY " + baseYear + "–" + String(baseYear + 1).slice(2),
      cyPrimary: baseYear, cyNext: baseYear + 1,
      indiaFyTotalUsd: indiaFyTotal,
      indiaToCyPrimaryUsd: Math.round(indiaFyTotal * primaryShare),
      indiaToCyNextUsd: Math.round(indiaFyTotal * nextShare),
      primaryShare: primaryShare, nextShare: nextShare,
      usCyTotalUsd: usCyTotal,
      // US CY → Indian FY: the FY captures Apr–Dec of CY-primary (9/12) plus
      // Jan–Mar of CY-next (3/12).
      usCyToFyPrimaryUsd: Math.round(usCyTotal * 9 / 12),
      usCyToFyNextUsd: Math.round(usCyTotal * 3 / 12)
    };
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
    var reconciliation = crossBasis(model, residency, usTax);
    var apportionment = computeApportionment(model);
    var limits = computeLimits(model);

    return {
      residency: residency,
      indiaTax: indiaTax,
      usTax: usTax,
      reconciliation: reconciliation,
      apportionment: apportionment,
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
    feieEligibility: feieEligibility,
    computeIndiaTax: computeIndiaTax,
    computeUsTax: computeUsTax,
    resolveResidency: resolveResidency,
    mapDoubleTaxedIncome: mapDoubleTaxedIncome,
    computeFtc: computeFtc,
    computeLimits: computeLimits
  };
})(typeof window !== "undefined" ? window : globalThis);

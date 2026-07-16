/* ============================================================================
 * WISING — Layer 2 Engine :: computation.js
 * ----------------------------------------------------------------------------
 * The computation engine. Turns the normalized unified model into the
 * quantitative cross-border picture:
 *
 *   1. Effective residency on each side.
 *   2. A proper India income-tax computation (heads -> Chapter VI-A ->
 *      slab tax by regime -> §156 rebate -> surcharge w/ marginal relief ->
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

  /* OBBBA SALT cap (TY2025+): $40,000 ($20,000 MFS), phased down 30 cents per
   * dollar of AGI above the threshold ($500,000 / $250,000 MFS), floored at
   * the old $10,000 TCJA cap — so the higher cap only actually helps
   * taxpayers below the threshold. */
  function computeSaltCap(agi, status, T) {
    var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
    var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
    var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
    return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
  }

  /* Social Security benefit taxability (s.86) — IRS Pub 915 Worksheet 1,
   * transcribed line-for-line (the comments below are the worksheet's own
   * line numbers) so the arithmetic can be checked against the published
   * form rather than re-derived from the tiered-rate description of the
   * rule. otherAgiExclSs is AGI computed WITHOUT any Social Security
   * (ordinary + preferential income, before adjustments — s.86 uses gross
   * income items, not post-adjustment AGI, for this specific test).
   * Returns the taxable portion of grossSsUsd — never more than 85% of it,
   * never more than actual provisional income can support. */
  function computeSsTaxableUsd(grossSsUsd, otherAgiExclSs, taxExemptInterestUsd, status, T) {
    if (grossSsUsd <= 0) return 0;
    var baseAmt = T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single;
    var addlAmt = T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single;
    var line2 = 0.5 * grossSsUsd;
    var line5 = line2 + Math.max(0, otherAgiExclSs) + Math.max(0, taxExemptInterestUsd); // provisional income
    var line7 = Math.max(0, line5 - baseAmt);
    if (line7 <= 0) return 0; // below base threshold — nothing taxable
    var line8 = Math.max(0, addlAmt - baseAmt);
    var line9 = Math.min(line7, line8);
    var line10 = line7 - line9;
    var line11 = 0.5 * line9;
    var line12 = Math.min(line2, line11);
    var line13 = T.SS_TAXABLE_TIER2_RATE * line10;
    var line14 = line12 + line13;
    var line15 = T.SS_TAXABLE_TIER2_RATE * grossSsUsd;
    return Math.min(line14, line15);
  }

  /* Same ladder as bracketTax, but returns the actual per-bracket breakdown
   * (only brackets the income actually reaches) so the UI can show the real
   * slab-by-slab math instead of a single opaque total. */
  function bracketBreakdown(amount, slabs) {
    var t = Math.max(0, amount), prev = 0, rows = [];
    for (var i = 0; i < slabs.length; i++) {
      var cap = slabs[i][0], rate = slabs[i][1];
      if (t > prev) {
        var taxable = Math.min(t, cap) - prev;
        rows.push({ from: prev, to: cap, rate: rate, taxable: taxable, tax: taxable * rate });
        prev = cap;
      } else break;
    }
    return rows;
  }

  /* ---- Carry-forward loss set-off (s.110 house property, s.112 business,
   * s.111 capital gains, s.113 speculative business, s.33(11) unabsorbed
   * depreciation) --------------------------------------------------------
   * Layer 1 already resolves per-entry eligibility (late-filing denial,
   * new-regime HP/business-depreciation restrictions) into the "available"
   * amounts read in normalize.js; this sequences the actual SET-OFF against
   * this year's income under the Act's ordering rules, instead of just
   * flagging that brought-forward losses exist. */
  function computeLossSetOff(cfl, buckets) {
    var businessInr = buckets.businessInr, housePropertyInr = buckets.housePropertyInr;
    var otherNormalInr = buckets.otherNormalInr, stcgInr = buckets.stcgInr, ltcgGrossInr = buckets.ltcgGrossInr;
    // s.73/s.113: speculative business loss/income is genuinely ring-fenced
    // — a brought-forward speculative loss can ONLY be set off against THIS
    // YEAR's speculative income, never ordinary business profit (Phase 1,
    // §2.2 — same shape as the VDA-never-loss-set-off rule). Floored at 0
    // by the caller before this runs; a negative current-year speculative
    // result doesn't participate in set-off at all this year.
    var speculativeInr = Math.max(0, buckets.speculativeInr || 0);
    // Slab-rate STCG (currently: unlisted buy-back gains and foreign-equity
    // gains held <=24 months) is STILL "Capital Gains" head income for loss
    // set-off purposes — the slab rate is a rate mechanism (same principle
    // as ordinary s.111 non-STT STCG, e.g. on unlisted shares generally,
    // which has always been both slab-rate AND loss-set-off-eligible). Set
    // off FIRST, ahead of the flat-20%-rate STCG bucket, since it's the more
    // tax-expensive slice for the taxpayer to leave un-offset — a
    // reasonable, documented ordering choice where the Act doesn't dictate
    // one, not an assumption baked in silently.
    var stcgSlabInr = buckets.stcgSlabInr || 0;
    // ltcgGrossInr = s.198 LTCG (listed, STT-paid — ₹1,25,000 exemption
    // pool). ltcg197Inr = s.197 LTCG (unlisted buy-back / foreign equity —
    // NO exemption, taxed from the first rupee). LTCG/STCG-spillover losses
    // prefer to offset ltcg197Inr FIRST: every rupee offset there is a full
    // 12.5% saved, whereas s.198 gains already get up to ₹1.25L free, so
    // it's the less tax-expensive pool to leave un-offset — same ordering
    // principle as stcgSlabInr vs stcgInr above.
    var ltcg197Inr = buckets.ltcg197Inr || 0;

    // 1. Business loss -> business income only (s.112).
    var businessLossUsed = Math.min(cfl.businessLossAvailableInr || 0, businessInr);
    businessInr -= businessLossUsed;
    var businessLossUnused = (cfl.businessLossAvailableInr || 0) - businessLossUsed;

    // 2. House property loss -> house property income only (s.110; unlike
    // CURRENT-year HP loss, brought-forward HP loss cannot go inter-head).
    var hpLossUsed = Math.min(cfl.housePropertyLossAvailableInr || 0, housePropertyInr);
    housePropertyInr -= hpLossUsed;
    var hpLossUnused = (cfl.housePropertyLossAvailableInr || 0) - hpLossUsed;

    // 3. STCG loss -> slab-rate STCG first, then flat-rate STCG, then s.197
    // LTCG, then s.198 LTCG (all allowed under s.111 — STCG loss can offset
    // either LTCG pool).
    var stcgLossAvail = cfl.stcgLossAvailableInr || 0;
    var stcgLossUsedVsStcgSlab = Math.min(stcgLossAvail, stcgSlabInr);
    stcgSlabInr -= stcgLossUsedVsStcgSlab;
    var stcgLossAfterSlab = stcgLossAvail - stcgLossUsedVsStcgSlab;
    var stcgLossUsedVsStcg = Math.min(stcgLossAfterSlab, stcgInr);
    stcgInr -= stcgLossUsedVsStcg;
    var stcgLossAfterFlat = stcgLossAfterSlab - stcgLossUsedVsStcg;
    var stcgLossUsedVsLtcg197 = Math.min(stcgLossAfterFlat, ltcg197Inr);
    ltcg197Inr -= stcgLossUsedVsLtcg197;
    var stcgLossAfterLtcg197 = stcgLossAfterFlat - stcgLossUsedVsLtcg197;
    var stcgLossUsedVsLtcg198 = Math.min(stcgLossAfterLtcg197, ltcgGrossInr);
    ltcgGrossInr -= stcgLossUsedVsLtcg198;
    var stcgLossUnused = stcgLossAfterLtcg197 - stcgLossUsedVsLtcg198;
    var stcgLossUsedVsLtcg = stcgLossUsedVsLtcg197 + stcgLossUsedVsLtcg198;

    // 4. LTCG loss -> s.197 LTCG first (no exemption cushion), then s.198
    // LTCG. Never STCG (s.111).
    var ltcgLossAvail = cfl.ltcgLossAvailableInr || 0;
    var ltcgLossUsedVs197 = Math.min(ltcgLossAvail, ltcg197Inr);
    ltcg197Inr -= ltcgLossUsedVs197;
    var ltcgLossAfter197 = ltcgLossAvail - ltcgLossUsedVs197;
    var ltcgLossUsedVs198 = Math.min(ltcgLossAfter197, ltcgGrossInr);
    ltcgGrossInr -= ltcgLossUsedVs198;
    var ltcgLossUnused = ltcgLossAfter197 - ltcgLossUsedVs198;
    var ltcgLossUsed = ltcgLossUsedVs197 + ltcgLossUsedVs198;

    // 5. Speculative loss -> speculative income ONLY (s.73/s.113) — the one
    // bucket brought-forward speculative loss is legally allowed to offset.
    var speculativeLossAvail = cfl.speculativeLossAvailableInr || 0;
    var speculativeLossUsed = Math.min(speculativeLossAvail, speculativeInr);
    speculativeInr -= speculativeLossUsed;
    var speculativeLossUnused = speculativeLossAvail - speculativeLossUsed;

    // 6. Unabsorbed depreciation (s.33(11)) -> any head except salary, no time
    // limit. Convention: business first (deemed current-year business loss),
    // then house property, then capital gains (slab-rate STCG, then flat-rate
    // STCG, then s.197 LTCG, then s.198 LTCG), then other normal income.
    var depRemaining = cfl.unabsorbedDepreciationCf || 0;
    var used;
    used = Math.min(depRemaining, businessInr); businessInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, housePropertyInr); housePropertyInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, stcgSlabInr); stcgSlabInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, stcgInr); stcgInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, ltcg197Inr); ltcg197Inr -= used; depRemaining -= used;
    used = Math.min(depRemaining, ltcgGrossInr); ltcgGrossInr -= used; depRemaining -= used;
    used = Math.min(depRemaining, otherNormalInr); otherNormalInr -= used; depRemaining -= used;
    // s.32(2): unabsorbed depreciation is deemed current-year depreciation
    // "for the purposes of this Act" — the same broad any-head eligibility
    // extends to speculative business income (still the PGBP head), unlike
    // ordinary business/speculative losses which stay ring-fenced.
    used = Math.min(depRemaining, speculativeInr); speculativeInr -= used; depRemaining -= used;
    var depUsed = (cfl.unabsorbedDepreciationCf || 0) - depRemaining;

    var totalUsedInr = businessLossUsed + hpLossUsed + stcgLossUsedVsStcgSlab + stcgLossUsedVsStcg + stcgLossUsedVsLtcg + ltcgLossUsed + speculativeLossUsed + depUsed;
    var totalUnusedInr = businessLossUnused + hpLossUnused + stcgLossUnused + ltcgLossUnused + speculativeLossUnused + depRemaining;

    return {
      businessInr: businessInr, housePropertyInr: housePropertyInr, otherNormalInr: otherNormalInr,
      stcgInr: stcgInr, stcgSlabInr: stcgSlabInr, ltcgGrossInr: ltcgGrossInr, ltcg197Inr: ltcg197Inr,
      speculativeInr: speculativeInr,
      totalUsedInr: totalUsedInr, totalUnusedInr: totalUnusedInr,
      unused: {
        businessInr: businessLossUnused, housePropertyInr: hpLossUnused,
        stcgInr: stcgLossUnused, ltcgInr: ltcgLossUnused,
        speculativeInr: speculativeLossUnused, unabsorbedDepreciationInr: depRemaining
      },
      used: {
        businessInr: businessLossUsed, housePropertyInr: hpLossUsed,
        stcgSlabInr: stcgLossUsedVsStcgSlab, stcgInr: stcgLossUsedVsStcg, ltcgFromStcgLossInr: stcgLossUsedVsLtcg, ltcgInr: ltcgLossUsed,
        speculativeInr: speculativeLossUsed, unabsorbedDepreciationInr: depUsed
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
    // Deemed dividend on buyback (s.2(40)(f), 1-Oct-2024 to 31-Mar-2026
    // buy-backs only) is taxed exactly like ordinary dividend — at slab
    // rates, in Other Sources — so it joins the same normal-slab bucket
    // dividend already sits in. Buy-backs on/after 1-Apr-2026 are capital
    // gains instead (s.69) — listed shares and unlisted shares held >24mo
    // fold into stcg/ltcg/ltcg197Inr in normalize.js (same rule applies to
    // foreign equity holdings, e.g. US stocks — always "unlisted" for
    // Indian tax purposes). Unlisted/foreign shares held <=24mo
    // (inc.stcgSlabInr) are ALSO capital-gains-head income — slab rate is
    // just the rate mechanism (same as ordinary non-STT STCG always has
    // been) — so it stays OUT of this bucket and instead flows through
    // computeLossSetOff's STCG pool below, joining normal-slab income only
    // AFTER loss set-off, not before.
    var deemedDividendInr = (inc.deemedDividendBuyback && inc.deemedDividendBuyback.inr) || 0;

    // s.207 — India-source interest/dividend/royalty/FTS paid to a NON-
    // RESIDENT is taxed flat (not slab), with no Chapter VI-A deduction or
    // loss set-off at all (s.207(4)) — a DTAA-elected rate (s.159)
    // displaces the domestic default, per-stream, when TRC/Form 41 are on
    // file. RNOR is still a "resident" for this purpose (only genuine NR gets
    // s.207). Deemed dividend (s.2(40)(f)) stays in the slab bucket for now
    // — its own characterization-mismatch finding is a separate, already-
    // built feature and layering s.207 on top of it is a distinct question
    // not scoped here.
    //
    // Layer 1 now collects a per-election amount_inr (the specific rupee
    // amount the taxpayer is claiming the treaty rate against, e.g. one NRO
    // account's interest out of several). For interest/dividend, that's a
    // CLAIM against the broader other_sources aggregate — whatever isn't
    // covered by an election still gets taxed, just at the plain domestic
    // rate (no treaty applies to it). For royalty/FTS there IS no broader
    // aggregate anywhere in Layer 1 — the election table is the only place
    // this income is ever recorded, so the summed election amounts ARE the
    // total for that stream.
    var isNR = model.residency.india.status === CONST.INDIA_STATUS.NR;
    // Ordinary NRO interest is NOT s.207 income (see computeNrInterestTreatment)
    // — it defaults to slab rates, with only a DTAA-beneficial slice carved
    // out. Dividend/royalty/FTS genuinely are s.207 income, unchanged.
    var otherSourcesMiscInr = (inc.otherSourcesMisc && inc.otherSourcesMisc.inr) || 0;
    var nrInterest = isNR
      ? computeNrInterestTreatment(model, T, slabs, inc.salary.inr + inc.business.inr + inc.houseProperty.inr + deemedDividendInr + otherSourcesMiscInr, inc.interest.inr)
      : null;
    var s115aDividend = isNR ? computeS115aStream(model, T, "dividend", inc.dividend.inr) : null;
    var s115aRoyalty = isNR ? computeS115aStream(model, T, "royalty", null) : null;
    var s115aFts = isNR ? computeS115aStream(model, T, "fts", null) : null;
    var nrInterestSlabEligibleInr = nrInterest ? nrInterest.slabEligibleInr : 0;
    var nrInterestCarvedOutInr = nrInterest ? nrInterest.carvedOutInr : 0;
    var nrInterestCarvedOutTaxInr = nrInterest ? nrInterest.carvedOutTaxInr : 0;
    var s115aDividendInr = s115aDividend ? s115aDividend.totalInr : 0;
    var s115aRoyaltyInr = s115aRoyalty ? s115aRoyalty.totalInr : 0;
    var s115aFtsInr = s115aFts ? s115aFts.totalInr : 0;
    var s115aDividendTaxInr = s115aDividend ? s115aDividend.taxInr : 0;
    var s115aRoyaltyTaxInr = s115aRoyalty ? s115aRoyalty.taxInr : 0;
    var s115aFtsTaxInr = s115aFts ? s115aFts.taxInr : 0;

    // Current-year depreciation (Phase 1, §2.4) can now push aggregate
    // business income negative — a case computeLossSetOff's businessInr
    // input was never designed for (it assumes a non-negative starting
    // bucket, matching every other head). Per s.32(2), depreciation
    // specifically (unlike an ordinary current-year operating loss, which
    // this single-year-snapshot engine has no future-year carry-forward
    // output for and so cannot otherwise model) is immediately eligible for
    // set-off against ANY head this year, exactly like brought-forward
    // unabsorbed depreciation — so the depreciation-caused portion of a
    // negative result is folded into this year's unabsorbedDepreciationCf
    // pool before set-off runs, and business income itself is floored at 0
    // going in. Any residual negative result beyond what depreciation
    // explains (a genuine non-depreciation current-year loss) is a known,
    // documented simplification: it's absorbed by the floor rather than
    // carried forward, since there's no output for it to carry into.
    var businessInrRaw = inc.business.inr;
    var currentYearDepreciationInr = inc.businessDepreciationInr || 0;
    var unabsorbedDepThisYearInr = businessInrRaw < 0 ? Math.min(currentYearDepreciationInr, -businessInrRaw) : 0;
    var cflForSetOff = model.carryForwardLosses ? {
      businessLossAvailableInr: model.carryForwardLosses.businessLossAvailableInr,
      speculativeLossAvailableInr: model.carryForwardLosses.speculativeLossAvailableInr,
      stcgLossAvailableInr: model.carryForwardLosses.stcgLossAvailableInr,
      ltcgLossAvailableInr: model.carryForwardLosses.ltcgLossAvailableInr,
      housePropertyLossAvailableInr: model.carryForwardLosses.housePropertyLossAvailableInr,
      unabsorbedDepreciationCf: (model.carryForwardLosses.unabsorbedDepreciationCf || 0) + unabsorbedDepThisYearInr
    } : { unabsorbedDepreciationCf: unabsorbedDepThisYearInr };

    // Sequence brought-forward loss set-off against this year's income
    // BEFORE computing the slab/special-rate totals below, so the actual tax
    // reflects it (not just a disclosure that losses exist). Salary and
    // s.128/194 special-rate income are untouched — losses cannot be
    // set off against either (s.58(4) explicitly bars it for the latter);
    // s.207 dividend/royalty/FTS is excluded too, for the same no-set-off
    // reason — but slab-eligible NR interest is ordinary income now, so it
    // DOES participate in loss set-off like any other "other normal" income.
    var lossSetOff = computeLossSetOff(cflForSetOff, {
      businessInr: Math.max(0, businessInrRaw),
      housePropertyInr: inc.houseProperty.inr,
      otherNormalInr: deemedDividendInr + otherSourcesMiscInr + (isNR ? nrInterestSlabEligibleInr : inc.interest.inr + inc.dividend.inr),
      stcgInr: inc.stcg.inr,
      stcgSlabInr: inc.stcgSlabInr || 0,
      ltcgGrossInr: inc.ltcg.inr,
      ltcg197Inr: inc.ltcg197Inr || 0,
      // s.73/s.113: only a POSITIVE current-year speculative result
      // participates in set-off (against brought-forward speculative loss,
      // then unabsorbed depreciation) — a current-year speculative LOSS is
      // ring-fenced out entirely, not netted against ordinary business
      // income, and (single-year-snapshot engine) has no carry-forward
      // output of its own, same documented limitation as an ordinary
      // current-year business loss.
      speculativeInr: Math.max(0, inc.speculativeIncomeInr || 0)
    });

    var normalSlabInr = inc.salary.inr + lossSetOff.businessInr + lossSetOff.housePropertyInr + lossSetOff.otherNormalInr + lossSetOff.stcgSlabInr + lossSetOff.speculativeInr;

    // Chapter VI-A deductions.
    var deductionsInr;
    if (isNew) {
      // New regime: essentially only employer NPS u/s 124(2) (was 80CCD(2)).
      deductionsInr = ded.s80CCD2_employer || 0;
    } else {
      var caps = T.DEDUCTION_CAPS_OLD;
      // s.80GG (rent paid, no HRA received): least of (a) rent paid less 10%
      // of adjusted total income, (b) ₹5,000/month (₹60,000/year), (c) 25%
      // of adjusted total income. normalSlabInr (gross total income before
      // Chapter VI-A deductions) is used as the adjusted-total-income proxy
      // — not the exact statutory definition (which also excludes LTCG/
      // STCG/certain other items) but a disclosed, directly-available floor,
      // consistent with this file's existing Phase-0 approximations
      // elsewhere. Only ever previously read nowhere in this engine (see
      // docs/FIELD_COVERAGE_AUDIT.md) — was unconditionally ₹0.
      var s80ggRentInr = ded.s80GG_rentPaidInr || 0;
      var s80ggInr = s80ggRentInr > 0
        ? Math.max(0, Math.min(s80ggRentInr - 0.10 * normalSlabInr, 60000, 0.25 * normalSlabInr))
        : 0;
      deductionsInr =
        Math.min(ded.s80C, caps.s80C) +
        Math.min(ded.s80CCD1B, caps.s80CCD1B) +
        Math.min(ded.s80D, caps.s80D_self + caps.s80D_parents_senior) +
        (ded.s80CCD2_employer || 0) +
        Math.min(ded.s80TTA_TTB, 10000) +
        (ded.s80DD || 0) + (ded.s80DDB || 0) + (ded.s80U || 0) +
        (ded.s80E || 0) + (ded.s80EEA_EE || 0) + (ded.s80GGB_GGC || 0) +
        s80ggInr;
    }

    var totalNormalInr = Math.max(0, normalSlabInr - deductionsInr);

    // Special-rate incomes (already net of capital-loss set-off above).
    var stcgInr = lossSetOff.stcgInr;
    // s.198 LTCG (listed, STT-paid): ₹1,25,000 annual exemption, then 12.5%.
    var ltcgTaxableInr = Math.max(0, lossSetOff.ltcgGrossInr - T.LTCG_112A_EXEMPT_INR);
    // s.197 LTCG (unlisted buy-back / foreign equity, e.g. US stocks — both
    // held >24mo): SAME 12.5% rate, but NO exemption — taxed from the first
    // rupee. Multi-source-verified (CBDT FAQ via PIB, ClearTax, Bajaj
    // Finserv, Tax2win, KPMG) that the ₹1,25,000 threshold is textually
    // embedded in s.112A/s.198 itself and does not extend to or pool with
    // s.112/s.197 — pooling these into one exemption-eligible bucket would
    // silently under-tax unlisted/foreign LTCG.
    var ltcg197TaxableInr = Math.max(0, lossSetOff.ltcg197Inr);
    // s.128/194 (lottery/betting/online gaming): flat rate, no basic
    // exemption threshold benefit — the full amount is taxed, never reduced
    // by any slab/exemption logic.
    var special115bbInr = (inc.specialRate115bb && inc.specialRate115bb.inr) || 0;
    var special115bbTaxInr = special115bbInr * T.RATE_115BB;
    // s.115BBH VDA/crypto: flat 30% on POSITIVE gains only (normalize.js
    // already dropped any negative-gain transactions rather than netting
    // them — no loss set-off is ever allowed here, not even VDA-vs-VDA),
    // no exemption, no indexation. Deliberately excluded from
    // computeLossSetOff entirely, unlike every other capital-gains bucket
    // above — it's not eligible for set-off against ANYTHING.
    var vdaGainInr = (inc.vdaGainInr || 0);
    var vdaTaxInr = vdaGainInr * T.RATE_115BBH;
    // s.115E(1)(a) Chapter XII-A investment income: flat 20% on interest
    // (specified debenture/deposit) or dividend (specified shares), no
    // Chapter VI-A deductions, no exemption. Not a capital gain — never
    // touches computeLossSetOff, same as VDA above.
    var chapterXiiaInvestmentIncomeInr = (inc.chapterXiiaInvestmentIncomeInr || 0);
    var chapterXiiaInvestmentIncomeTaxInr = chapterXiiaInvestmentIncomeInr * T.RATE_115E_INVESTMENT_INCOME;
    // Only CG/dividend-type special-rate tax gets the 15%-surcharge-cap
    // treatment (computeIndiaSurcharge below) — s.128/194 winnings do
    // NOT get that cap and take the full uncapped slab-based surcharge rate,
    // so keep it out of the "cap-eligible" bucket passed to that function.
    // s.207 dividend is "dividend income" for the cap's purposes; s.207
    // royalty/FTS and DTAA-carved-out interest are not, so they ride along
    // with 128 instead. s.115BBH is its own standalone section (not part of
    // the ss.111A/112/112A capital-gains chapter the surcharge cap proviso
    // lists), so VDA gains ride along with 128/194 here too — a documented,
    // reasonable inference, not independently source-confirmed. Chapter
    // XII-A investment income is the same: its own standalone section, no
    // source found indicating any special surcharge-cap treatment, so it
    // rides along uncapped too.
    var capEligibleSpecialTaxInr = stcgInr * T.STCG_111A_RATE + ltcgTaxableInr * T.LTCG_112A_RATE + ltcg197TaxableInr * T.LTCG_112A_RATE + s115aDividendTaxInr;
    var specialTaxInr = capEligibleSpecialTaxInr + special115bbTaxInr + vdaTaxInr + chapterXiiaInvestmentIncomeTaxInr + nrInterestCarvedOutTaxInr + s115aRoyaltyTaxInr + s115aFtsTaxInr;

    // Slab tax on normal income.
    var slabTaxInr = bracketTax(totalNormalInr, slabs);
    var slabBreakdown = bracketBreakdown(totalNormalInr, slabs);

    // §156 rebate — restricted to a "resident individual" by the section
    // itself; HUF/AOP/BOI/trust share this same slab computation path but are
    // NOT entitled to it (previously applied unconditionally to anyone who
    // reached this branch, which silently over-relieved HUF filers).
    // NOTE: uses ltcgTaxableInr (net of the s.198 exemption), not gross LTCG
    // — the exempt slice isn't part of total income at all, same as it isn't
    // part of the special-rate tax computed just above. Previously this used
    // gross LTCG while specialTaxInr/capEligibleSpecialTaxInr used the
    // exemption-adjusted figure, silently inflating totalIncomeInr (and, via
    // computeIndiaSurcharge below, the surcharge threshold test) by the
    // exempt amount. ltcg197TaxableInr has no exemption to net out (s.197),
    // so it's already the full taxable amount.
    var totalIncomeInr = totalNormalInr + stcgInr + ltcgTaxableInr + ltcg197TaxableInr + special115bbInr + vdaGainInr + chapterXiiaInvestmentIncomeInr + nrInterestCarvedOutInr + s115aDividendInr + s115aRoyaltyInr + s115aFtsInr;
    // ...and NR is excluded too (s.156 says "resident individual" — RNOR
    // still counts as resident for this, only genuine NR does not).
    var isIndividual = !model.entity || model.entity.indiaKind === "individual";
    var rebate = isNew ? T.REBATE_87A_NEW : T.REBATE_87A_OLD;
    var rebateInr = 0;
    if (isIndividual && !isNR && totalNormalInr <= rebate.incomeCap) {
      rebateInr = Math.min(slabTaxInr, rebate.maxRebate);
    }

    var taxAfterRebateInr = Math.max(0, slabTaxInr - rebateInr) + specialTaxInr;

    // Surcharge (individual brackets) with simplified marginal relief. Pass
    // only the cap-eligible (CG/dividend) special tax — the 128 tax rides
    // along inside taxAfterRebateInr but is counted as "non-special" here so
    // it gets the full uncapped surcharge rate.
    var surchargeInr = computeIndiaSurcharge(taxAfterRebateInr, totalIncomeInr, isNew, slabs, capEligibleSpecialTaxInr, T);

    // 4% Health & Education cess.
    var cessInr = (taxAfterRebateInr + surchargeInr) * T.CESS_RATE;

    // s.69(2)(b) promoter additional tax on buy-back capital gains (Budget
    // 2026, buy-backs on/after 1-Apr-2026): layered ON TOP of the ordinary
    // LTCG/STCG tax on the promoter's buy-back gain already included above
    // (via ltcgTaxableInr/ltcg197TaxableInr/stcgInr, folded in at
    // normalize.js) — this adds just the incremental piece, not a re-tax of
    // the whole gain. Computed on the promoter's gross buy-back gain at the
    // same 12.5% base rate regardless of whether it landed in the s.198 or
    // s.197 bucket (identical rate either way — only the exemption differs,
    // and this additional-tax layer isn't netted against that exemption
    // either way) — a modeling simplification. See constants.js for the
    // target-rate/surcharge detail.
    var isCorporatePromoter = !!(model.entity && model.entity.indiaKind === "company");
    var promoterTargetRate = isCorporatePromoter
      ? T.PROMOTER_BUYBACK_TARGET_RATE_CORPORATE
      : T.PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE;
    var promoterLtcgAdditionalInr = Math.max(0, inc.promoterBuybackLtcgInr || 0) * Math.max(0, promoterTargetRate - T.LTCG_112A_RATE);
    var promoterStcgAdditionalInr = Math.max(0, inc.promoterBuybackStcgInr || 0) * Math.max(0, promoterTargetRate - T.STCG_111A_RATE);
    var promoterAdditionalTaxInr = promoterLtcgAdditionalInr + promoterStcgAdditionalInr;
    // The 12% surcharge applies to the additional tax only, irrespective of
    // total income (unlike the ordinary income-linked surcharge above).
    var promoterSurchargeInr = promoterAdditionalTaxInr * T.PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE;
    var promoterCessInr = (promoterAdditionalTaxInr + promoterSurchargeInr) * T.CESS_RATE;
    var promoterBuybackExtraTaxInr = promoterAdditionalTaxInr + promoterSurchargeInr + promoterCessInr;

    var totalTaxInr = taxAfterRebateInr + surchargeInr + cessInr + promoterBuybackExtraTaxInr;

    return {
      regime: regime,
      grossTotalIncomeInr: normalSlabInr + stcgInr + ltcgTaxableInr + ltcg197TaxableInr + special115bbInr + vdaGainInr + chapterXiiaInvestmentIncomeInr + nrInterestCarvedOutInr + s115aDividendInr + s115aRoyaltyInr + s115aFtsInr,
      deductionsInr: deductionsInr,
      totalIncomeInr: totalIncomeInr,
      slabTaxInr: slabTaxInr,
      slabBreakdown: slabBreakdown,
      totalNormalInr: totalNormalInr,
      ltcgTaxableInr: ltcgTaxableInr,
      ltcg197TaxableInr: ltcg197TaxableInr,
      vdaGainInr: vdaGainInr,
      vdaTaxInr: vdaTaxInr,
      chapterXiiaInvestmentIncomeInr: chapterXiiaInvestmentIncomeInr,
      chapterXiiaInvestmentIncomeTaxInr: chapterXiiaInvestmentIncomeTaxInr,
      specialTaxInr: specialTaxInr,
      rebateInr: rebateInr,
      surchargeInr: surchargeInr,
      cessInr: cessInr,
      promoterBuyback: promoterAdditionalTaxInr > 0 ? {
        isCorporatePromoter: isCorporatePromoter,
        targetRate: promoterTargetRate,
        ltcgGainInr: inc.promoterBuybackLtcgInr || 0,
        stcgGainInr: inc.promoterBuybackStcgInr || 0,
        additionalTaxInr: promoterAdditionalTaxInr,
        surchargeInr: promoterSurchargeInr,
        cessInr: promoterCessInr,
        totalExtraTaxInr: promoterBuybackExtraTaxInr
      } : null,
      totalTaxInr: totalTaxInr,
      totalTaxUsd: U.inrToUsd(totalTaxInr),
      totalIncomeUsd: U.inrToUsd(totalIncomeInr),
      effectiveRate: totalIncomeInr > 0 ? totalTaxInr / totalIncomeInr : 0,
      lossSetOff: lossSetOff,
      s115a: isNR ? {
        dividend: s115aDividend, royalty: s115aRoyalty, fts: s115aFts
      } : null,
      nrInterest: nrInterest
    };
  }

  /* Computes the actual s.207 tax for one income stream (interest/dividend/
   * royalty/FTS), reading each treaty election's own amount_inr — the specific
   * rupee amount the taxpayer is claiming the treaty rate against (e.g. one
   * NRO account's interest out of several) — rather than assuming an election
   * covers 100% of the stream.
   *
   * aggregateTotalInr is the broader Layer-1-collected total for this stream
   * (interest/dividend have one, from other_sources); pass null when no such
   * aggregate exists (royalty/FTS — Layer 1 only ever records those through
   * this election table, so the summed election amounts ARE the total).
   *
   * Each election's rate is whichever is LOWER of the domestic s.207 default
   * or the elected rate — s.159 guarantees the assessee the more beneficial
   * of domestic law or the treaty, never a worse rate just because a
   * (possibly mistaken) election is on file — and only counts at all when
   * TRC/Form 41 support the claim. Whatever part of an aggregate total isn't
   * covered by any election still gets taxed, just at the plain domestic
   * rate. Shared CONST.TAX.INDIA.S115A_RATES table with the
   * dtaa_treaty_elections finding text in conflicts.js so the two can't
   * disagree. */
  function computeS115aStream(model, T, incomeType, aggregateTotalInr) {
    var treaty = model.treaty || {};
    var domestic = T.S115A_RATES[incomeType];
    var docsOk = treaty.trcStatus && treaty.form10fFiled;
    var hasAggregate = aggregateTotalInr != null;
    var remainingInr = hasAggregate ? aggregateTotalInr : 0;
    var claimedInr = 0, taxInr = 0;
    var elections = [];
    (treaty.treatyElections || []).forEach(function (e) {
      if (!e || e.income_type !== incomeType) return;
      var raw = U.num(e.amount_inr);
      var amt = hasAggregate ? Math.min(raw, Math.max(0, remainingInr)) : raw;
      var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
      var rate = (docsOk && electedRate != null) ? Math.min(domestic, electedRate) : domestic;
      var electionTaxInr = amt * rate;
      claimedInr += amt;
      taxInr += electionTaxInr;
      elections.push({
        article: e.treaty_article || null,
        requestedAmountInr: raw,
        appliedAmountInr: amt,
        electedRate: electedRate,
        domesticRate: domestic,
        rateApplied: rate,
        taxInr: electionTaxInr,
        outcome: !docsOk ? "denied_no_docs" : (electedRate != null && electedRate < domestic ? "elected_rate_applied" : "domestic_rate_wins")
      });
      if (hasAggregate) remainingInr -= amt;
    });
    var uncapturedInr = hasAggregate ? Math.max(0, remainingInr) : 0;
    var uncapturedTaxInr = uncapturedInr * domestic;
    taxInr += uncapturedTaxInr;
    var totalInr = hasAggregate ? aggregateTotalInr : claimedInr;
    return {
      totalInr: totalInr, taxInr: taxInr, claimedInr: claimedInr, uncapturedInr: uncapturedInr,
      uncapturedTaxInr: uncapturedTaxInr, elections: elections,
      domesticRate: domestic, effectiveRate: totalInr > 0 ? taxInr / totalInr : domestic
    };
  }

  /* Ordinary NRO savings/FD interest for a non-resident is NOT actually
   * within s.207's scope — that concessional flat rate is narrowly limited
   * to interest on foreign-currency borrowings/specified bonds (s.207 (narrowly, the foreign-currency-borrowing-interest limb)),
   * not ordinary rupee-denominated bank deposit interest. So by default it's
   * ordinary slab-rate "other sources" income, exactly like a resident's —
   * banks withhold TDS at a flat 30% (s.195) as a conservative default since
   * they can't verify treaty eligibility at the point of credit, but that's
   * withholding, not the final liability computed here.
   *
   * A DTAA election (India-US Article 11, capped at 15%) can still carve a
   * specific claimed amount OUT of slab income and tax it flat instead — but
   * only when TRC/Form 41 are on file AND it's actually cheaper than what
   * that slice would cost at the marginal slab rate (s.159 "whichever is
   * more beneficial" — same principle as computeS115aStream, just compared
   * against a marginal rate instead of a flat domestic one, since there IS
   * no flat domestic rate for this income anymore). The marginal slab rate
   * is approximated by comparing slab tax on (everything else + this slice)
   * vs (everything else alone) — a planning-grade approximation that
   * doesn't account for loss-set-off ordering, consistent with the rest of
   * this engine's precision level. */
  function computeNrInterestTreatment(model, T, slabs, otherSlabIncomeInr, interestAggregateInr) {
    var treaty = model.treaty || {};
    var docsOk = treaty.trcStatus && treaty.form10fFiled;
    var remainingInr = interestAggregateInr;
    var elections = [];
    var carvedOutInr = 0, carvedOutTaxInr = 0;
    (treaty.treatyElections || []).forEach(function (e) {
      if (!e || e.income_type !== "interest") return;
      var raw = U.num(e.amount_inr);
      var amt = Math.min(raw, Math.max(0, remainingInr));
      if (amt <= 0) return;
      remainingInr -= amt;
      var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
      var canElect = docsOk && electedRate != null;
      var marginalSlabTaxInr = bracketTax(otherSlabIncomeInr + interestAggregateInr, slabs) -
                                bracketTax(otherSlabIncomeInr + interestAggregateInr - amt, slabs);
      var treatyTaxInr = canElect ? amt * electedRate : null;
      var carvedOut = canElect && treatyTaxInr < marginalSlabTaxInr;
      if (carvedOut) { carvedOutInr += amt; carvedOutTaxInr += treatyTaxInr; }
      elections.push({
        article: e.treaty_article || null, requestedAmountInr: raw, appliedAmountInr: amt,
        electedRate: electedRate, marginalSlabTaxInr: marginalSlabTaxInr, treatyTaxInr: treatyTaxInr,
        carvedOut: carvedOut,
        outcome: !docsOk ? "denied_no_docs" : (electedRate == null ? "no_rate" : (carvedOut ? "treaty_beats_slab" : "slab_beats_treaty"))
      });
    });
    var uncapturedInr = Math.max(0, remainingInr);
    return {
      totalInr: interestAggregateInr,
      slabEligibleInr: interestAggregateInr - carvedOutInr,
      carvedOutInr: carvedOutInr, carvedOutTaxInr: carvedOutTaxInr,
      uncapturedInr: uncapturedInr, elections: elections
    };
  }

  // ---- India corporate / firm computation (ITR-6 / ITR-5) ----
  function computeIndiaEntityTax(model, inc) {
    var E = model.entity;
    var taxable = inc.total.inr;              // business profit + other income
    var regime, rate, surRate, matApplied = false, preCess;

    if (E.indiaIsCompany) {
      // Place of incorporation — NOT residency — controls which rate
      // schedule applies. A foreign-incorporated company that's resident
      // via POEM (worldwide income in scope, computed.residency.india
      // already reflects that correctly) still uses the FOREIGN company
      // schedule: s.115BA/115BAA/115BAB are domestic-incorporated-only
      // elections, unavailable regardless of residency or what a demo
      // profile might have set. Previously every company — domestic or
      // foreign, resident or not — was taxed under the domestic schedule.
      if (model.residency.india.isIndianCompanyFact === false) {
        var FC = CONST.TAX.INDIA_COMPANY_FOREIGN;
        rate = FC.RATE;
        var baseTaxF = taxable * rate;
        surRate = taxable > 100000000 ? FC.SURCHARGE_OVER_10CR : (taxable > 10000000 ? FC.SURCHARGE_OVER_1CR : 0);
        var normalF = baseTaxF + baseTaxF * surRate;
        // s.115JB(4A)/(4C): a foreign company with no India PE is exempt
        // from MAT outright (approximated on that single fact — see
        // constants.js note on the DTAA-residence nuance not modeled).
        var hasIndiaPE = !!(model.treaty && model.treaty.hasPE);
        var matBaseInrF = E.indiaMatBookProfitInr != null ? E.indiaMatBookProfitInr : taxable;
        var matF = matBaseInrF * FC.MAT_RATE;
        matApplied = hasIndiaPE && normalF < matF;
        preCess = matApplied ? matF : normalF;
        var cessF = preCess * FC.CESS_RATE;
        regime = "Foreign Company ITR-6 (" + Math.round(rate * 100) + "%" + (matApplied ? ", MAT" : (hasIndiaPE ? "" : ", MAT-exempt (no India PE)")) + ")";
        return entityResult(taxable, baseTaxF, preCess - baseTaxF, cessF, preCess + cessF, regime, matApplied);
      }
      var C = CONST.TAX.INDIA_COMPANY;
      // 115BAB (new manufacturing, 15%) and 115BA (manufacturing, 25% flat,
      // no turnover test) were previously read only for the additional-
      // depreciation disallowance check, never for the company's own rate —
      // a company that elected either fell through to the default
      // turnover-400cr/30% schedule instead of its actual elected rate.
      rate = E.indiaOpt115bab ? C.RATE_115BAB : E.indiaOpt115baa ? C.RATE_115BAA :
        E.indiaOpt115ba ? C.RATE_115BA : (E.indiaTurnoverLte400cr ? C.RATE_TURNOVER_LTE_400CR : C.RATE_DEFAULT);
      var baseTax = taxable * rate;
      // Only 115BAA/115BAB get the flat 10% surcharge (and MAT exemption,
      // s.115JB(5A)) — 115BA and the no-election default both use the
      // general income-tiered surcharge scale and remain MAT-subject.
      var concessional115 = E.indiaOpt115bab || E.indiaOpt115baa;
      surRate = concessional115 ? (E.indiaOpt115bab ? C.SURCHARGE_115BAB : C.SURCHARGE_115BAA) :
        (taxable > 100000000 ? C.SURCHARGE_OVER_10CR : (taxable > 10000000 ? C.SURCHARGE_OVER_1CR : 0));
      var normal = baseTax + baseTax * surRate;
      // MAT floor: use the real Schedule III book profit (s.115JB) when
      // Layer 1 India actually collected one (div-prof-mat-profit) — only
      // falls back to a taxable-income proxy when that field was left
      // blank, since book profit and taxable income routinely diverge
      // (book depreciation/provisions vs. the Act's own add-backs).
      var matBaseInr = E.indiaMatBookProfitInr != null ? E.indiaMatBookProfitInr : taxable;
      var mat = matBaseInr * C.MAT_RATE;
      matApplied = !concessional115 && normal < mat;
      preCess = matApplied ? mat : normal;
      var cessC = preCess * C.CESS_RATE;
      regime = "Corporate ITR-6 (" + Math.round(rate * 100) + "%" +
        (E.indiaOpt115bab ? " §115BAB" : E.indiaOpt115baa ? " §200" : E.indiaOpt115ba ? " §115BA" : "") +
        (matApplied ? ", MAT" : "") + ")";
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
    // Self-employment earnings from a Schedule C row flagged as a Foreign
    // Disregarded Entity (llc_type "foreign_disregarded") — the one real
    // Layer 1 US signal that a self-employment business is foreign-earned.
    // Net self-employment earnings ARE foreign earned income for §911
    // purposes (unlike SE TAX itself under §1401, which the exclusion never
    // reaches — see the Schedule SE computation below, which still draws
    // seEarningsUsd unreduced by feieAppliedUsd).
    var fSE = worldwide ? inc.foreignSelfEmployment.usd : 0;

    // FEIE (Form 2555) — gated on eligibility, not on the checkbox. Only a
    // taxpayer living abroad (foreign tax home + bona-fide-residence or
    // physical-presence test) may exclude, and only foreign EARNED income
    // (wages + net self-employment earnings, combined against one cap —
    // mirrors Layer 1 US's own single feie_amount_claimed_usd field, which
    // likewise doesn't distinguish the underlying income's source array).
    var feie = feieEligibility(model);
    var feieAppliedUsd = 0;
    if (worldwide && feie.claimed && feie.eligible && (fW + fSE) > 0) {
      var feieEarnedBaseUsd = fW + fSE;
      var feieBase = feie.amountClaimedUsd > 0 ? feie.amountClaimedUsd : feieEarnedBaseUsd;
      feieAppliedUsd = Math.min(feieEarnedBaseUsd, feieBase, CONST.LIMITS.FEIE_MAX_USD);
      var feieAppliedToWagesUsd = Math.min(fW, feieAppliedUsd);
      fW = fW - feieAppliedToWagesUsd;
      fSE = fSE - (feieAppliedUsd - feieAppliedToWagesUsd);
    }
    var fI = worldwide ? inc.foreignInterest.usd : 0;
    var fD = worldwide ? inc.foreignDividends.usd : 0;
    var fR = worldwide ? inc.foreignRental.usd : 0;
    var fP = worldwide ? inc.foreignPension.usd : 0;
    var fStcg = worldwide ? inc.foreignStcg.usd : 0;
    var fLtcg = worldwide ? inc.foreignLtcg.usd : 0;

    var nonQualDivUs = Math.max(0, inc.ordinaryDividendsUs.usd - inc.qualifiedDividendsUs.usd);

    // Ordinary income (taxed at bracket rates), EXCLUDING Social Security —
    // SS needs the rest of ordinary + preferential income already totaled
    // before its own taxable portion can be computed (s.86 "provisional
    // income" test, below). IRA/401(k) distributions and pension remain
    // fully taxable US-source ordinary income, included here as always.
    // Business/self-employment income (Sch C, S-corp/partnership K-1) is
    // always US-source in this model EXCEPT the foreign_disregarded slice
    // already carved into fSE above — every other self-employment/K-1
    // source has no foreign-business counterpart collected, so the rest of
    // businessUs stays unconditional, not gated on `worldwide`.
    var ordinaryIncomeExclSs =
      inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0) + inc.interestUs.usd + fI +
      nonQualDivUs + fD + inc.stcgUs.usd + fStcg +
      inc.rentalUs.usd + fR + fP + (inc.usRetirementIncomeExclSs ? inc.usRetirementIncomeExclSs.usd : (inc.usRetirementIncome ? inc.usRetirementIncome.usd : 0));

    // Preferential income (LTCG + qualified dividends).
    var preferentialIncome = inc.ltcgUs.usd + fLtcg + inc.qualifiedDividendsUs.usd;

    // s.86: only 0%/50%/85% of Social Security benefits are actually
    // taxable, via the "provisional income" test — previously 100% was
    // folded into ordinary income unconditionally, overstating tax for
    // every SS-receiving profile (gap tracker US-2, an active
    // misstatement, not just a gap). Preferential income counts toward
    // provisional income even though it's taxed at a different rate (s.86
    // uses gross income items, not the post-adjustment AGI figure).
    var grossSsUsd = (inc.socialSecurityUs && inc.socialSecurityUs.usd) || 0;
    var taxExemptInterestUsd = (inc.taxExemptInterestUs && inc.taxExemptInterestUs.usd) || 0;
    var taxableSsUsd = computeSsTaxableUsd(grossSsUsd, ordinaryIncomeExclSs + preferentialIncome, taxExemptInterestUsd, status, T);

    var ordinaryIncome = ordinaryIncomeExclSs + taxableSsUsd;
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

    // Adjustments (above-the-line) — student-loan interest + 1/2 SE tax +
    // SE health insurance (§162(l)) + SE retirement plan (SEP-IRA/Solo
    // 401k, §404). Both were previously read nowhere in this engine (see
    // docs/FIELD_COVERAGE_AUDIT.md) despite the form correctly collecting
    // them — AGI was always overstated by the full amount of both for a
    // self-employed filer. Floored at seNet (can't deduct more SE health
    // insurance than there was SE income to support it), matching this
    // file's existing Phase-0-floor convention rather than modeling the
    // exact §162(l)(2)(A) earned-income limitation precisely.
    var seHealthDeduction = Math.min(ded.seHealthInsuranceDeductionUsd || 0, Math.max(0, seNet));
    var adjustments = Math.min(ded.studentLoanInterest, 2500) + halfSeDeduction +
      seHealthDeduction + (ded.seRetirementDeductionUsd || 0);
    var agi = Math.max(0, totalIncome - adjustments);

    // Deduction: standard vs itemized.
    var standard = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
    var saltCapUsd = computeSaltCap(agi, status, T);
    var itemized = Math.min(ded.salt, saltCapUsd) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * agi);
    var deduction;
    if (ded.mode === "itemized") deduction = itemized;
    else if (ded.mode === "standard") deduction = standard;
    else deduction = Math.max(standard, itemized);

    // ---- OBBBA "senior deduction" (temporary, TY2025-2028) ----
    // $6,000 per taxpayer age 65+ by year end, on top of the standard/
    // itemized deduction either way, phased out 6% of AGI over the
    // threshold. Only the primary taxpayer's age is known (Layer 1 US
    // collects no spouse DOB), so a second $6,000 for an also-65+ spouse on
    // a joint return is not modeled here.
    var taxpayerAge = null;
    if (model.identity && model.identity.dob) {
      var dobYear = new Date(model.identity.dob).getFullYear();
      if (!isNaN(dobYear)) taxpayerAge = (model.meta.baseYear || 2025) - dobYear;
    }
    var isSenior = taxpayerAge !== null && taxpayerAge >= T.SENIOR_DEDUCTION_MIN_AGE && status !== "mfs";
    var seniorPhaseoutThr = T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD[status] || T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD.single;
    var seniorDeductionUsd = isSenior
      ? Math.max(0, Math.round(T.SENIOR_DEDUCTION_PER_PERSON_USD - T.SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(0, agi - seniorPhaseoutThr)))
      : 0;

    // ---- OBBBA "no tax on tips" / "no tax on overtime" (temporary,
    // TY2025-2028) — above-the-line deductions off AGI, MFS entirely
    // ineligible, phased out $100 per $1,000 of MAGI over the threshold.
    // Amounts are the qualified subset already included in Box 1 wages
    // (Layer 1 US collects them per-W2 alongside Box 1), so this deduction
    // does not add income — it un-taxes a slice already counted above.
    var isMfs = status === "mfs";
    var tipsOtPhaseoutThr = T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD[status] || T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD.single;
    var tipsOtPhaseoutReduction = Math.ceil(Math.max(0, agi - tipsOtPhaseoutThr) / 1000) * T.TIPS_OVERTIME_PHASEOUT_PER_1000_USD;
    var qualifiedTipsUsd = isMfs ? 0 : (inc.qualifiedTipsUsd || 0);
    var qualifiedOvertimeUsd = isMfs ? 0 : (inc.qualifiedOvertimeUsd || 0);
    var tipsDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedTipsUsd, T.TIPS_DEDUCTION_MAX_USD) - tipsOtPhaseoutReduction));
    var overtimeMaxUsd = T.OVERTIME_DEDUCTION_MAX_USD[status] || T.OVERTIME_DEDUCTION_MAX_USD.single;
    var overtimeDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedOvertimeUsd, overtimeMaxUsd) - tipsOtPhaseoutReduction));

    var taxableBeforeQbi = Math.max(0, agi - deduction - seniorDeductionUsd - tipsDeductionUsd - overtimeDeductionUsd);

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
    var ordinaryBracketBreakdown = bracketBreakdown(ordTaxable, brackets);

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
    var amtAddback = usedMode === "standard" ? deduction : Math.min(ded.salt, saltCapUsd);
    var amtiUsd = Math.max(0, taxableIncome + amtAddback + (ded.amtPrefs || 0));
    var amtExFull = T.AMT_EXEMPTION[status] || T.AMT_EXEMPTION.single;
    var amtPhase = T.AMT_PHASEOUT[status] || T.AMT_PHASEOUT.single;
    var amtExemption = Math.max(0, amtExFull - T.AMT_PHASEOUT_RATE * Math.max(0, amtiUsd - amtPhase));
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
    var otherCreditsUsd = Math.min(Math.round(childCareCredit + aotcCredit + llcCredit), Math.round(incomeTax));

    // ---- Child Tax Credit (§24) + refundable Additional CTC ----
    // $2,200/child (TY2025-2028, OBBBA), phased out $50 per $1,000 of AGI over the
    // threshold. Non-refundable portion offsets whatever tax is left after
    // the credits above; any CTC that doesn't fit against tax is refundable
    // (ACTC) up to $1,700/child, capped at 15% of earned income over $2,500.
    // "Dependents" here reuses the same generic count already used for the
    // dependent-care/AOTC credits above — Layer 1 doesn't separately track
    // which dependents are qualifying children under 17.
    var numChildrenForCtc = ded.dependents || 0;
    var ctcPhaseoutThr = T.CTC_PHASEOUT_THRESHOLD_USD[status] || T.CTC_PHASEOUT_THRESHOLD_USD.single;
    var ctcMaxTotalUsd = T.CTC_PER_CHILD_USD * numChildrenForCtc;
    var ctcPhaseoutReductionUsd = Math.ceil(Math.max(0, agi - ctcPhaseoutThr) / 1000) * T.CTC_PHASEOUT_PER_1000_USD;
    var ctcAvailableUsd = Math.max(0, ctcMaxTotalUsd - ctcPhaseoutReductionUsd);
    var remainingTaxAfterOtherCredits = Math.max(0, Math.round(incomeTax) - otherCreditsUsd);
    var ctcNonRefundableUsd = Math.min(ctcAvailableUsd, remainingTaxAfterOtherCredits);
    var ctcUnusedUsd = ctcAvailableUsd - ctcNonRefundableUsd;
    var earnedIncomeUsd = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0);
    var actcCapUsd = Math.min(
      T.CTC_REFUNDABLE_MAX_PER_CHILD_USD * numChildrenForCtc,
      T.CTC_REFUNDABLE_RATE * Math.max(0, earnedIncomeUsd - T.CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD)
    );
    var ctcRefundableUsd = Math.round(Math.max(0, Math.min(ctcUnusedUsd, actcCapUsd)));
    var creditsUsd = otherCreditsUsd + ctcNonRefundableUsd + ctcRefundableUsd;

    var totalTaxBeforeFtc = incomeTax + niit + addlMedicare + seTax + amtOwed - creditsUsd;

    return {
      filingStatus: status,
      worldwide: worldwide,
      totalIncomeUsd: totalIncome,
      ordinaryIncomeUsd: ordinaryIncome,
      preferentialIncomeUsd: preferentialIncome,
      agiUsd: agi,
      deductionUsd: deduction,
      deductionMode: (ded.mode === "itemized" || ded.mode === "standard") ? ded.mode : (itemized > standard ? "itemized" : "standard"),
      saltCapUsd: saltCapUsd,
      socialSecurityDetail: {
        grossUsd: grossSsUsd, taxableUsd: taxableSsUsd,
        taxablePct: grossSsUsd > 0 ? taxableSsUsd / grossSsUsd : 0,
        provisionalIncomeUsd: ordinaryIncomeExclSs + preferentialIncome + 0.5 * grossSsUsd + taxExemptInterestUsd,
        baseThresholdUsd: T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single,
        additionalThresholdUsd: T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single
      },
      seniorDeductionUsd: seniorDeductionUsd,
      seniorDetail: { age: taxpayerAge, isSenior: isSenior, fullAmountUsd: T.SENIOR_DEDUCTION_PER_PERSON_USD, phaseoutThresholdUsd: seniorPhaseoutThr },
      tipsDeductionUsd: tipsDeductionUsd,
      overtimeDeductionUsd: overtimeDeductionUsd,
      tipsOvertimeDetail: {
        isMfs: isMfs, qualifiedTipsUsd: qualifiedTipsUsd, qualifiedOvertimeUsd: qualifiedOvertimeUsd,
        tipsMaxUsd: T.TIPS_DEDUCTION_MAX_USD, overtimeMaxUsd: overtimeMaxUsd,
        phaseoutThresholdUsd: tipsOtPhaseoutThr, phaseoutReductionUsd: tipsOtPhaseoutReduction
      },
      taxableIncomeUsd: taxableIncome,
      ordinaryTaxUsd: ordinaryTax,
      ordinaryTaxableUsd: ordTaxable,
      ordinaryBracketBreakdown: ordinaryBracketBreakdown,
      preferentialTaxUsd: preferentialTax,
      incomeTaxUsd: incomeTax,
      niitUsd: niit,
      additionalMedicareUsd: addlMedicare,
      seTaxUsd: seTax,
      qbiDeductionUsd: qbiDeduction,
      amtUsd: amtOwed,
      amtDetail: {
        amtiUsd: amtiUsd,
        addbackUsd: amtAddback,
        exemptionFullUsd: amtExFull,
        exemptionUsd: amtExemption,
        amtBaseUsd: amtBase,
        preferentialInBaseUsd: prefTaxable,
        ordinaryAmtBaseUsd: amtOrdBase,
        tmtOrdUsd: tmtOrd,
        tmtUsd: tmtOrd + preferentialTax,
        regularTaxUsd: incomeTax
      },
      creditsUsd: creditsUsd,
      otherCreditsUsd: otherCreditsUsd,
      ctcDetail: {
        numChildren: numChildrenForCtc, maxTotalUsd: ctcMaxTotalUsd, phaseoutReductionUsd: ctcPhaseoutReductionUsd,
        availableUsd: ctcAvailableUsd, nonRefundableUsd: ctcNonRefundableUsd, refundableUsd: ctcRefundableUsd,
        earnedIncomeUsd: earnedIncomeUsd
      },
      totalTaxBeforeFtcUsd: totalTaxBeforeFtc,
      foreignSourceIncomeUsd: fW + fSE + fI + fD + fR + fP + fStcg + fLtcg,
      usSourceIncomeUsd: inc.usSourceTotal.usd,
      retirementEpfInterestUsd: worldwide ? (inc.retirementEpfInterestUsd || 0) : 0,
      retirementNpsWithdrawalUsd: worldwide ? (inc.retirementNpsWithdrawalUsd || 0) : 0,
      niitDetail: {
        netInvestmentIncomeUsd: netInvestmentIncome,
        magiUsd: magi,
        thresholdUsd: niitThreshold,
        excessUsd: Math.max(0, Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold))),
        rate: T.NIIT_RATE
      },
      feie: {
        claimed: feie.claimed, eligible: feie.eligible, taxHomeAbroad: feie.taxHomeAbroad,
        testMet: feie.testMet, reasons: feie.reasons, appliedUsd: feieAppliedUsd
      },
      effectiveRate: totalIncome > 0 ? totalTaxBeforeFtc / totalIncome : 0
    };
  }

  // ---- US state individual income tax (CA / NY only, TY2025) ----
  // Scoped to a full-year-resident computation on the single state resolved
  // from Layer 1's domicile/primary-state facts — Layer 1 collects no
  // state-source-income breakdown, so true nonresident/part-year allocation
  // (or a two-state split when moved_states_this_year is set) is out of
  // scope; the FX-basis/tax-year-apportionment findings elsewhere in this
  // engine use the same "planning-grade, flag imprecision rather than model
  // it" convention. Base is federal AGI less the state's own standard
  // deduction — not a full state-specific AGI recomputation (CA/NY each
  // have their own addition/subtraction adjustments this does not model).
  // Business entities (ccorp/scorp/etc.) file separate state franchise/
  // entity-level returns, an unrelated and unmodeled regime, so this
  // function only fires for individual filers; NRAs (Form 1040-NR) are
  // skipped for the same "no state-source split" reason above.
  function computeUsStateTax(model, usTax) {
    var ek = model.entity ? model.entity.usKind : "individual";
    if (ek !== "individual" || usTax.isNra) return null;

    var sr = model.stateResidency || {};
    var stateCode = sr.domicileDec31 || sr.primaryState || sr.domicileJan1;
    var T = CONST.TAX.US_STATES[stateCode];
    if (!T) return null;

    // Single/MFJ only — see the US_STATES comment in constants.js.
    var status = model.identity.usFilingStatus === "mfj" ? "mfj" : "single";
    var brackets = T.BRACKETS[status];
    var standardDeductionUsd = T.STD_DEDUCTION[status];
    var dependents = (model.deductions && model.deductions.us && model.deductions.us.dependents) || 0;
    var dependentExemptionUsd = (T.DEPENDENT_EXEMPTION_USD || 0) * dependents;

    var taxableIncomeUsd = Math.max(0, usTax.agiUsd - standardDeductionUsd - dependentExemptionUsd);
    var bracketTaxUsd = bracketTax(taxableIncomeUsd, brackets);
    var bracketBreakdownRows = bracketBreakdown(taxableIncomeUsd, brackets);

    var surchargeUsd = 0;
    if (T.SURCHARGE_THRESHOLD_USD != null && taxableIncomeUsd > T.SURCHARGE_THRESHOLD_USD) {
      surchargeUsd = (taxableIncomeUsd - T.SURCHARGE_THRESHOLD_USD) * T.SURCHARGE_RATE;
    }

    var exemptionCreditUsd = (T.EXEMPTION_CREDIT_USD && T.EXEMPTION_CREDIT_USD[status]) || 0;
    var dependentCreditUsd = (T.DEPENDENT_CREDIT_USD || 0) * dependents;

    var totalTaxUsd = Math.max(0, Math.round(bracketTaxUsd + surchargeUsd - exemptionCreditUsd - dependentCreditUsd));

    return {
      state: stateCode,
      stateName: T.NAME,
      formName: T.FORM_NAME,
      filingStatus: status,
      agiUsd: usTax.agiUsd,
      standardDeductionUsd: standardDeductionUsd,
      dependentExemptionUsd: dependentExemptionUsd,
      taxableIncomeUsd: taxableIncomeUsd,
      bracketTaxUsd: bracketTaxUsd,
      bracketBreakdown: bracketBreakdownRows,
      surchargeUsd: surchargeUsd,
      surchargeLabel: T.SURCHARGE_LABEL || null,
      exemptionCreditUsd: exemptionCreditUsd,
      dependentCreditUsd: dependentCreditUsd,
      totalTaxUsd: totalTaxUsd,
      effectiveRate: usTax.agiUsd > 0 ? totalTaxUsd / usTax.agiUsd : 0,
      basis: "TY2025 rates (returns filed 2026); full-year resident, worldwide income via federal AGI, no foreign tax credit against state tax."
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
    var claimedRate = (claim && claim.rate != null) ? Math.max(0, Math.min(1, Number(claim.rate) / 100)) : null;
    // A treaty-reduced FDAP withholding rate requires a valid Form W-8BEN
    // on file with the withholding agent (Treas. Reg. §1.1441-6) — without
    // it, the payer must withhold at the 30% statutory default regardless
    // of what the treaty would otherwise allow, and (absent other
    // substantiation) that's what actually applies at return-filing too.
    // Previously this used the claimed rate unconditionally even when
    // nra.submittedW8ben was false — silently understating FDAP tax
    // exactly when the nra_w8ben_missing finding was already warning that
    // the claim was at risk; the disclosure and the computed number
    // disagreed with each other.
    var w8benOnFile = nra.submittedW8ben === true;
    var fdapRate = (w8benOnFile && claimedRate != null) ? claimedRate : 0.30;

    var itemized = Math.min(ded.salt, computeSaltCap(eciUsd, status, T)) + ded.mortgageInterest + ded.charitable +
                   Math.max(0, ded.medical - 0.075 * eciUsd);
    var taxableEciUsd = Math.max(0, eciUsd - itemized);
    var eciTaxUsd = bracketTax(taxableEciUsd, brackets);
    var eciBracketBreakdown = bracketBreakdown(taxableEciUsd, brackets);
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
      nra: { eciUsd: eciUsd, fdapUsd: fdapUsd, fdapRate: fdapRate, eciTaxUsd: eciTaxUsd, fdapTaxUsd: fdapTaxUsd, taxableEciUsd: taxableEciUsd, eciBracketBreakdown: eciBracketBreakdown,
        claimedRate: claimedRate, w8benOnFile: w8benOnFile, incomeType: (claim && claim.income_type) || null },
      feie: { claimed: false, eligible: false, taxHomeAbroad: false, testMet: false, reasons: [], appliedUsd: 0 },
      effectiveRate: (eciUsd + fdapUsd) > 0 ? totalTax / (eciUsd + fdapUsd) : 0
    };
  }

  // ---- US corporate / pass-through computation ----
  function computeUsEntityTax(model, inc, kind) {
    // Schedule M-1 (when Layer 1 US actually collected one for this entity's
    // own return — corporate_financials.schedule_m1, ccorp/scorp/partnership
    // only) is the real book-to-tax-reconciled taxable income for THIS
    // entity's own return; inc.total.usd is only the generic aggregate
    // (wages/business/interest/etc.) that business_income_usd — the one
    // field a demo profile could otherwise use for "this entity's own
    // income" — silently falls back to, despite no real Layer 1 US input
    // ever writing that field. Prefer the M-1 figure whenever present.
    var m1Taxable = model.entity && model.entity.usScheduleM1TaxableIncomeUsd;
    var taxable = m1Taxable != null ? m1Taxable : inc.total.usd; // business income + other
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

    // ---- Direction 2: India §159 relief — credit for US taxes ----
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
    // US side previously hardcoded to zero — every business/professional
    // profile showed no double-tax exposure on this row regardless of
    // actual US self-employment income. inc.us.foreignSelfEmployment is the
    // one bucket that's genuinely comparable to Indian-source business
    // income (a Schedule C row flagged foreign_disregarded, i.e., the same
    // underlying foreign business Layer 1 India also taxed) — domestic US
    // self-employment/K-1 income (inc.us.businessUs) is a different pool
    // with no Indian-source counterpart, so it's deliberately excluded here.
    pair("Business / Professional income", inc.india.business, inc.us.foreignSelfEmployment,
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
    if (model.limitsRaw.nroCumulativeRepatriatedUsd > 0) {
      gauge("nro_repatriation", "NRO repatriation (this FY)", model.limitsRaw.nroCumulativeRepatriatedUsd, L.NRO_REPATRIATION_ANNUAL_USD, "USD",
        "RBI ceiling on NRO-account repatriation abroad, separate from and in addition to the LRS cap above — each repatriation needs its own Form 15CA/15CB (Form 145/146 from TY2026-27).");
    }
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
    if (model.limitsRaw.trumpAccountsOpened) {
      var taChildren = Math.max(1, model.limitsRaw.trumpAccountsNumChildren || 1);
      gauge("trump_account", "Trump Account (§530A) annual contributions", model.limitsRaw.trumpAccountsContributionsUsd,
        L.TRUMP_ACCOUNT_ANNUAL_CAP_USD * taChildren, "USD",
        "Cap is " + L.TRUMP_ACCOUNT_ANNUAL_CAP_USD.toLocaleString("en-US") + "/child/year, combined across all contributors (parents, family, employer) — shown here as the aggregate across " + taChildren + " child(ren).");
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
   * INDIA ITR FORM SOLVER — independent backend determination
   * =========================================================================
   * Mirrors layer1_india.html's own evaluateITRForm() (the AY 2026-27 CBDT
   * notified-form eligibility rules — verified 2026-07-12 against the same
   * notification the frontend cites) but computed HERE, from model/computed
   * fields this engine has already independently verified against Layer 1's
   * real, live-written data — not from the frontend's own precomputed
   * surcharge_buckets or its persisted itr_recommendation.form.
   *
   * This exists because the frontend calculator has real, verified bugs a
   * backend-only fallback would otherwise inherit or simply not catch:
   *   - hasBusiness reads business_income.has_business_income, a "setup
   *     wizard" checkbox that desyncs from business_income.has_business_or_fo_income
   *     (the field the actual Business/F&O module and every other reader —
   *     including this engine — writes to and reads from). A user who fills
   *     in real business data without separately re-toggling the wizard
   *     checkbox gets evaluated as if they had none.
   *   - hasPartnerIncome reads business_income.partner_remuneration_inr /
   *     partner_interest_inr (singular) — fields NO input anywhere in
   *     layer1_india.html ever writes. Always false. The real data lives in
   *     partner_firms[] (Phase 1, §2.3), which this solver reads instead.
   *   - isDirector reads profile.is_company_director — a field with no
   *     backing UI control at all anywhere in the file. Always false;
   *     documented below as a genuine, undisclosed Layer 1 gap, not
   *     silently assumed non-director.
   *
   * Runs unconditionally (unlike the old crude entity-type-only fallback)
   * so every profile gets a real, checked recommendation — hand-authored
   * demo profiles included, not just ones that went through the browser
   * form. See buildReturnFormDetermination (conflicts.js) for the
   * frontend cross-check this feeds.
   * ----------------------------------------------------------------------*/
  function computeIndiaItrForm(model, computed) {
    var E = model.entity, inc = model.income.india, R = model.residency.india;
    var entity = E.indiaKind;
    var isInd = entity === "individual", isHuf = entity === "huf";
    var isROR = R.status === "ROR";
    var totalIncomeInr = computed.indiaTax.grossTotalIncomeInr || 0;

    var stcg111A = (inc.stcg && inc.stcg.inr) || 0;                 // s.196 (old 111A)
    var ltcg112A = (inc.ltcg && inc.ltcg.inr) || 0;                 // s.198 (old 112A) — has the ₹1,25,000 exemption
    var ltcg112 = inc.ltcg197Inr || 0;                              // s.197 (old 112, non-112A) — no exemption
    var stcgOther = inc.stcgSlabInr || 0;                           // unlisted/foreign STCG ≤24mo, slab rate
    var otherCapitalGains = stcg111A + ltcg112 + stcgOther;
    // AY 2026-27: ITR-1/4 now tolerate s.112A LTCG up to the ₹1,25,000
    // exemption threshold ALONE (no other capital gains, no BF capital
    // losses) — previously any capital gain at all forced ITR-2/3.
    var hasDisqualifyingCapitalGains = otherCapitalGains > 0 || ltcg112A > 125000;

    var hasForeignIncome = (isInd || isHuf) && model.indiaForeignIncomeDeclared === true;
    var hasForeignAssets = (isInd || isHuf) && model.indiaForeignAssetsDeclared === true;
    var hasCrypto = (isInd || isHuf) && ((inc.vdaGainInr || 0) > 0 || (inc.vdaSaleConsiderationInr || 0) > 0);
    // AY 2026-27: ITR-1/4 now tolerate up to TWO house properties (was one).
    var multipleHP = (inc.housePropertyCount || 0) > 2;
    var hasHighAgriIncome = (inc.agriculturalIncomeInr || 0) > 5000;
    var hasLotteryOrGaming = ((inc.specialRate115bb && inc.specialRate115bb.inr) || 0) > 0;
    var hasBFLosses = !!(model.carryForwardLosses && model.carryForwardLosses.hasBroughtForwardLosses === true);
    var hasSpeculativeOrFNO = (inc.speculativeIncomeInr || 0) !== 0 || (inc.businessFnoIncomeInr || 0) !== 0;
    // Layer 1 has no UI control anywhere that sets profile.is_company_director
    // — this can never be a real "true" today. Read the field anyway (in
    // case a future Layer 1 revision adds the control) but flag the gap so
    // this isn't mistaken for a checked "not a director" answer.
    var isDirector = isInd && E.isCompanyDirector === true;
    var directorUnknown = isInd && !isDirector;

    var disqualifiers = [];
    if (totalIncomeInr > 5000000) disqualifiers.push("Total income exceeds ₹50,00,000 (₹" + Math.round(totalIncomeInr).toLocaleString("en-IN") + ")");
    if (!isROR) disqualifiers.push("Not Resident & Ordinarily Resident (status: " + (R.status || "unknown") + ")");
    if (hasDisqualifyingCapitalGains) {
      disqualifiers.push(otherCapitalGains > 0
        ? "Capital gains beyond the s.198-only allowance (STCG and/or non-s.198 LTCG present)"
        : "LTCG under s.198 exceeds the ₹1,25,000 threshold (₹" + Math.round(ltcg112A).toLocaleString("en-IN") + ")");
    }
    if (hasForeignIncome) disqualifiers.push("Foreign income declared (foreign_income.has_foreign_income)");
    if (hasForeignAssets) disqualifiers.push("Foreign assets declared (Schedule FA)");
    if (hasCrypto) disqualifiers.push("Crypto/VDA gains or sale activity on file");
    if (multipleHP) disqualifiers.push("More than 2 house properties (" + inc.housePropertyCount + ")");
    if (hasHighAgriIncome) disqualifiers.push("Agricultural income exceeds ₹5,000 (₹" + Math.round(inc.agriculturalIncomeInr).toLocaleString("en-IN") + ")");
    if (hasLotteryOrGaming) disqualifiers.push("Lottery/betting/online-gaming winnings on file (s.128/194)");
    if (hasBFLosses) disqualifiers.push("Brought-forward losses on file");
    if (hasSpeculativeOrFNO) disqualifiers.push("Speculative or F&O business income on file");
    if (isDirector) disqualifiers.push("Company director (profile.is_company_director)");

    var isDisqualified = disqualifiers.length > 0;

    var hasBusiness = !!(inc.indiaHasRegularBooksEntry || inc.indiaHasValidPresumptiveEntry ||
      (inc.businessFnoIncomeInr || 0) !== 0 || (inc.speculativeIncomeInr || 0) !== 0);
    var hasPartnerIncome = !!inc.indiaHasPartnerFirmIncome;
    // ITR-4 needs EVERY business signal to be a valid presumptive election —
    // one regular-books entry, one partner-firm rupee, or any F&O/speculative
    // activity at all forces ITR-3 regardless of how many other entries
    // validly use s.44AD/44ADA/44AE.
    var presumptiveOnly = inc.indiaHasValidPresumptiveEntry === true && !inc.indiaHasRegularBooksEntry &&
      !hasPartnerIncome && (inc.businessFnoIncomeInr || 0) === 0 && (inc.speculativeIncomeInr || 0) === 0;

    var form, explanation;

    if (entity === "company") {
      if (E.indiaIsSection8) { form = "ITR-7"; explanation = "For NGOs, Public Charitable Trusts, registered Societies, and Section 8 Companies claiming tax exemptions."; }
      else { form = "ITR-6"; explanation = "For Corporate Companies (Private Limited, Public Limited, OPCs) not claiming charitable exemptions."; }
    } else if (["trust", "ngo", "society", "political_party"].indexOf(entity) >= 0) {
      form = "ITR-7"; explanation = "For NGOs, Public Charitable Trusts, registered Societies, and Political Parties claiming tax exemptions under Trust & NGO Tax Exemptions.";
    } else if (["firm", "aop", "boi", "ajp", "local"].indexOf(entity) >= 0) {
      if (entity === "firm" && !isDisqualified && presumptiveOnly) {
        form = "ITR-4 (SUGAM)"; explanation = "For Resident Partnership Firms (excluding LLPs) with total income up to ₹50 Lakhs opting for Presumptive Taxation (44AD, 44ADA, 44AE).";
      } else {
        form = "ITR-5"; explanation = "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities.";
      }
    } else if (entity === "llp") {
      form = "ITR-5"; explanation = "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities.";
    } else if (isInd || isHuf) {
      if (hasBusiness || hasPartnerIncome) {
        if (!isDisqualified && presumptiveOnly && !hasPartnerIncome) {
          form = "ITR-4 (SUGAM)"; explanation = "For Resident Individuals and HUFs with total income up to ₹50 Lakhs who opt exclusively for the Presumptive Taxation Scheme (44AD/44ADA/44AE).";
        } else {
          form = "ITR-3"; explanation = "For Individuals and HUFs with Business or Professional Income maintaining books, or receiving remuneration/interest as a partner in a firm. Mandatory if disqualified from ITR-4.";
        }
      } else if (isInd && !isDisqualified) {
        form = "ITR-1 (SAHAJ)"; explanation = "For Resident Salaried Individuals with total income up to ₹50 Lakhs (Salary, up to 2 house properties, basic other sources). Restrictions: no foreign assets/income, no capital gains beyond the s.198-only allowance, no directorships.";
      } else {
        form = "ITR-2"; explanation = "For Individuals and HUFs not having business/profession income but having Capital Gains, Foreign Income/Assets, multiple properties, or otherwise not qualifying for ITR-1." +
          (disqualifiers.length ? " Disqualified from ITR-1 due to: " + disqualifiers.join("; ") + "." : "");
      }
    } else {
      form = "ITR-2"; explanation = "Entity type not otherwise classified — defaulting to ITR-2 pending a proper Layer 1 entity-type read.";
    }

    return {
      form: form,
      explanation: explanation,
      disqualified: isDisqualified,
      disqualifiers: disqualifiers,
      totalIncomeInr: totalIncomeInr,
      directorUnknown: directorUnknown,
      // Frontend's own persisted verdict (Layer 1's evaluateITRForm(), when
      // it ran) — for cross-check only, never as the primary answer. null
      // when Layer 1 never produced one (e.g. a hand-authored profile that
      // bypassed the browser form entirely).
      frontendForm: E.indiaReturnFormIsRecommendation ? E.indiaReturnForm : null,
      frontendExplanation: E.indiaReturnFormExplanation || null,
      matchesFrontend: E.indiaReturnFormIsRecommendation ? (E.indiaReturnForm === form) : null
    };
  }

  /* =========================================================================
   * ORCHESTRATOR
   * =======================================================================*/
  function compute(model) {
    var residency = resolveResidency(model);
    var indiaTax = computeIndiaTax(model);
    var usTax = computeUsTax(model, residency);
    var stateTax = computeUsStateTax(model, usTax);
    var ftc = computeFtc(model, residency, indiaTax, usTax);
    var doubleTax = mapDoubleTaxedIncome(model, residency);
    var reconciliation = crossBasis(model, residency, usTax);
    var apportionment = computeApportionment(model);
    var limits = computeLimits(model);
    var indiaItrForm = model.meta.hasIndiaScope ? computeIndiaItrForm(model, { indiaTax: indiaTax }) : null;

    return {
      residency: residency,
      indiaTax: indiaTax,
      usTax: usTax,
      stateTax: stateTax,
      indiaItrForm: indiaItrForm,
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
    computeUsStateTax: computeUsStateTax,
    resolveResidency: resolveResidency,
    mapDoubleTaxedIncome: mapDoubleTaxedIncome,
    computeFtc: computeFtc,
    computeLimits: computeLimits,
    computeIndiaItrForm: computeIndiaItrForm
  };
})(typeof window !== "undefined" ? window : globalThis);

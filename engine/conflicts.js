/* ============================================================================
 * WISING — Layer 2 Engine :: conflicts.js
 * ----------------------------------------------------------------------------
 * The "conflict detection engine". Consumes the normalized model + the computed
 * bundle and emits:
 *
 *   findings[]  — ranked conflicts & mismatches (the headline value prop)
 *   documents[] — the document-filing checklist with triggered/why state
 *   ftcReport   — a reconciliation table ready for the dashboard
 *
 * Each finding is { id, severity, category, title, detail, recommendation,
 * amountUsd, refs[] }. Findings are sorted critical -> warning -> info.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};
  var CONST = WISING.CONST;
  var U = WISING.util;

  function usd(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  /* ------------------------------------------------------------------------
   * detectConflicts — the rule-book. Order roughly mirrors severity, but the
   * final list is sorted by severity weight at the end.
   * ----------------------------------------------------------------------*/
  function detectConflicts(model, computed) {
    var S = CONST.SEVERITY, C = CONST.CATEGORY;
    var f = [];
    var res = computed.residency;
    var ftc = computed.ftc;

    function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
      f.push({
        id: id, severity: severity, category: category, title: title,
        detail: detail, recommendation: recommendation,
        amountUsd: amountUsd || 0, refs: refs || []
      });
    }

    // -- 1. DUAL RESIDENCY + ARTICLE 4 TIE-BREAKER -------------------------
    // Single finding with two states, driven by the Layer 1 tie-breaker wizard
    // (both forms capture & sync dtaa_treaty_residence). If a winner is recorded
    // we surface the RESOLVED position (proof the engine honours Layer 1); only
    // if it is genuinely blank do we flag it as an open action.
    if (res.dualResident) {
      var tbWinner = model.treaty.treatyResidence !== "none" ? model.treaty.treatyResidence
                   : (model.treaty.usTreatyResidence !== "none" ? model.treaty.usTreatyResidence : null);
      var usTag = res.us.isCitizen ? "citizen" : model.residency.us.hasGreenCard ? "green card" : "SPT met";
      if (!tbWinner) {
        add("dual_residency", S.CRITICAL, C.TREATY,
          "Dual tax residency — Article 4 tie-breaker not yet run",
          "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag +
          ") for an overlapping period, and the Layer 1 Article 4 tie-breaker has not been completed. Until it is, both countries assert worldwide taxing rights and only partial FTC relief is available.",
          "Complete the Layer 1 tie-breaker wizard (permanent home → centre of vital interests → habitual abode → nationality). WISING records the winner and produces Form 8833 (US) + the TRC / Form 10F support (India) for the loser side.",
          computed.doubleTax.totalDoublyTaxedUsd, ["DTAA Art. 4", "Form 8833", "TRC", "Form 10F"]);
      } else {
        add("dual_residency_resolved", S.INFO, C.TREATY,
          "Dual residency resolved under DTAA Article 4 → " + String(tbWinner).toUpperCase(),
          "Both India and the US met residency, and the Layer 1 Article 4 tie-breaker resolves treaty residence to " +
          String(tbWinner).toUpperCase() + " for the overlapping period. WISING has applied this to the tax and FTC computation below; the loser jurisdiction is taxed on a source basis.",
          "Keep " + (tbWinner === "india" ? "TRC + Form 10F (India) and Form 8833 (US)" : "Form 8833 (US) and TRC + Form 10F (India)") + " on file to support the position.",
          0, ["DTAA Art. 4", tbWinner === "india" ? "Form 10F" : "Form 8833"]);
      }
    }

    // -- 3. TREATY BENEFIT CLAIMED WITHOUT TRC / FORM 10F -------------------
    var claimsTreaty = model.treaty.treatyResidence !== "none" ||
                       model.treaty.usTreatyResidence !== "none" ||
                       model.treaty.dtaaForcedNr || model.treaty.files1040nr;
    if (claimsTreaty && (!model.treaty.trcStatus || !model.treaty.form10fFiled)) {
      var missing = [];
      if (!model.treaty.trcStatus) missing.push("TRC (IRS Form 6166)");
      if (!model.treaty.form10fFiled) missing.push("Form 10F");
      add("treaty_docs_missing", S.CRITICAL, C.TREATY,
        "Treaty relief claimed without supporting documents",
        "A treaty position / DTAA rate is being relied upon, but " + missing.join(" and ") +
        " is not on file. Indian tax authorities will deny treaty relief u/s 90(4) without a valid TRC, and Form 10F is mandatory u/r 21AB.",
        "Obtain " + missing.join(" and ") + " before filing. For US residents, request Form 6166 from the IRS (Form 8802 application) well in advance — it can take 6–8 weeks.",
        0, ["s.90(4)", "Rule 21AB", "Form 6166"]);
    }

    // -- 4. FTC RECONCILIATION GAP (residual double tax) -------------------
    if (ftc.netUnrelievedDoubleTaxUsd > 1) {
      add("ftc_gap", S.CRITICAL, C.CREDIT,
        "Foreign Tax Credit shortfall — residual double taxation",
        "Indian tax paid (" + usd(ftc.us.indiaTaxPaidUsd) + ") exceeds the US FTC limitation (" +
        usd(ftc.us.ftcLimitUsd) + ") for this year. " + usd(ftc.us.residualDoubleTaxUsd) +
        " of Indian tax cannot be credited currently and would otherwise be double-taxed.",
        "WISING books the excess credit (" + usd(ftc.us.carryoverUsd) + ") to the §904(c) carryover schedule (back 1 / forward 10) and tests treaty re-sourcing to lift the limitation — your CA/CPA receives the completed Form 1116 workpaper with the carryover tracked year over year.",
        ftc.us.residualDoubleTaxUsd, ["Form 1116", "§904(c)"]);
    } else if (ftc.us.indiaTaxPaidUsd > 0 && ftc.us.ftcAllowedUsd > 0) {
      add("ftc_available", S.INFO, C.CREDIT,
        "Foreign Tax Credit available and within limit",
        "Indian tax of " + usd(ftc.us.indiaTaxPaidUsd) + " is fully creditable against US tax this year (" +
        usd(ftc.us.ftcAllowedUsd) + " within a " + usd(ftc.us.ftcLimitUsd) + " limitation).",
        "Claim on Form 1116 (US) and file Form 67 (India) before the ITR due date to preserve symmetric relief.",
        ftc.us.ftcAllowedUsd, ["Form 1116", "Form 67"]);
    }

    // -- 4b. FEIE CLAIMED BUT NOT ELIGIBLE (§911) ---------------------------
    // FEIE is only for taxpayers LIVING ABROAD: foreign tax home + bona-fide
    // residence or physical presence (>=330 days abroad). Someone living in
    // the US with foreign income cannot claim it — the engine zeroes the
    // exclusion and flags the claim.
    var feieRes = computed.usTax && computed.usTax.feie;
    if (feieRes && feieRes.claimed && !feieRes.eligible) {
      add("feie_ineligible", S.CRITICAL, C.CREDIT,
        "FEIE claimed but the taxpayer does not qualify",
        "Form 2555 exclusion was claimed in Layer 1, but the §911 tests fail: " + feieRes.reasons.join("; ") +
        ". FEIE is only available to someone living abroad — a US-based taxpayer with foreign income must use the Foreign Tax Credit instead. The engine has computed US tax WITHOUT the exclusion.",
        "Remove the FEIE claim and rely on Form 1116 FTC for the Indian taxes (usually better anyway when Indian rates exceed US rates). If the taxpayer genuinely lives abroad, complete the tax-home and presence-test fields in the US Layer 1 so the exclusion can be applied.",
        model.limitsRaw.feieAmountUsd || 0, ["§911", "Form 2555", "Form 1116"]);
    } else if (feieRes && feieRes.claimed && feieRes.eligible && feieRes.appliedUsd > 0) {
      add("feie_applied", S.INFO, C.CREDIT,
        "FEIE applied — " + usd(feieRes.appliedUsd) + " of foreign wages excluded",
        "The §911 tests are met (foreign tax home + " + (feieRes.testMet ? "presence test" : "") +
        "), so " + usd(feieRes.appliedUsd) + " of foreign earned income is excluded from US tax. The excluded income and its share of Indian tax were removed from the FTC computation (no-double-dip).",
        "Compare FEIE vs full FTC annually — for high-tax countries like India, revoking FEIE in favour of FTC can save tax, but a revocation locks you out of FEIE for 5 years.",
        0, ["Form 2555", "§911(d)(6)"]);
    }

    // -- 4c. AMT BITES ------------------------------------------------------
    if (computed.usTax && computed.usTax.amtUsd > 0) {
      add("amt_applies", S.WARNING, C.CREDIT,
        "Alternative Minimum Tax applies (+" + usd(computed.usTax.amtUsd) + ")",
        "The tentative minimum tax exceeds the regular tax, so AMT of " + usd(computed.usTax.amtUsd) +
        " is added. Common drivers: a large standard-deduction / SALT add-back, private-activity-bond interest, or an ISO exercise.",
        "WISING computes the parallel AMT (Form 6251). Review ISO exercise timing and the state-tax add-back; AMT paid on deferral items can generate a Minimum Tax Credit (Form 8801) usable in later years.",
        computed.usTax.amtUsd, ["§55", "Form 6251", "Form 8801"]);
    }

    // -- 4d. NIIT / ADDITIONAL MEDICARE — NOT OFFSET BY THE FTC -------------
    // §1411 NIIT and §3101(b)(2) Additional Medicare are surtaxes, not "income
    // tax" for §901/§904 purposes (Reg. 1.901-1(a); the treaty's FTC article
    // doesn't reach them either) — so Indian tax credited against regular US
    // income tax leaves these two surtaxes fully standing on the same income.
    // This is a real double-tax residue that the headline "FTC allowed" figure
    // can make invisible unless called out on its own.
    var niitUsd = (computed.usTax && computed.usTax.niitUsd) || 0;
    var addlMedUsd = (computed.usTax && computed.usTax.additionalMedicareUsd) || 0;
    if ((niitUsd > 1 || addlMedUsd > 1) && ftc.us.indiaTaxPaidUsd > 0) {
      var surtaxParts = [];
      if (niitUsd > 1) surtaxParts.push("NIIT " + usd(niitUsd) + " (§1411, 3.8%)");
      if (addlMedUsd > 1) surtaxParts.push("Additional Medicare " + usd(addlMedUsd) + " (§3101(b)(2), 0.9%)");
      add("niit_medicare_not_creditable", S.WARNING, C.CREDIT,
        "NIIT / Additional Medicare surtaxes are not offset by the Foreign Tax Credit",
        surtaxParts.join(" and ") + " applies on top of regular US income tax. Indian income tax can only credit the " +
        "REGULAR US income tax (§901/§904) — these two surtaxes are outside the FTC mechanism entirely, so they stand " +
        "as double taxation even when the rest of the Indian tax is fully credited.",
        "There is no credit path for this residue — the only levers are reducing MAGI/net investment income (retirement " +
        "contributions, timing) or, for Additional Medicare, W-4 withholding planning. Make sure the client understands " +
        "the FTC reconciliation above does not clear this amount.",
        niitUsd + addlMedUsd, ["§1411", "§3101(b)(2)", "Form 8960", "Form 8959"]);
    }

    // -- 4e. NO US-INDIA TOTALIZATION AGREEMENT — SE TAX DOUBLE COVERAGE ----
    // The US has Totalization Agreements with ~30 countries (UK, Canada,
    // Germany, Japan, ...) that let a Certificate of Coverage exempt a
    // cross-border self-employed / seconded worker from paying INTO both
    // countries' social-security systems. The US and India have NEVER signed
    // one, so a self-employed dual-resident owes full US SE tax (15.3%) with
    // no exemption, and if routed through an Indian entity can separately
    // trigger EPF/social-security-style employer obligations in India — with
    // zero coordination between the two.
    var seTaxUsd = (computed.usTax && computed.usTax.seTaxUsd) || 0;
    var hasIndiaNexus = res.india.isResident || model.income.india.business.usd > 0 || model.income.india.salary.usd > 0;
    if (seTaxUsd > 1 && hasIndiaNexus) {
      add("no_totalization_agreement", S.WARNING, C.CREDIT,
        "No US–India Totalization Agreement — self-employment tax has no double-coverage relief",
        usd(seTaxUsd) + " of US self-employment tax (Schedule SE) is owed in full. Unlike ~30 countries with a US " +
        "Totalization Agreement, India has none — there is no Certificate of Coverage to exempt a self-employed or " +
        "seconded worker from social-security-style contributions in both countries, and no credit mechanism folds " +
        "Indian PF/social contributions into the US SE tax computation.",
        "Confirm whether Indian-side EPF/social contributions are also being made on the same work; if so this is " +
        "uncoordinated double coverage by design (not a filing error) — the only mitigants are entity structuring " +
        "(e.g., routing through a foreign corporation to convert SE income to a dividend/salary mix) or accepting the cost.",
        0, ["SE tax", "Schedule SE", "No US-India Totalization Agreement"]);
    }

    // -- 4f. PERMANENT ESTABLISHMENT — ARTICLE 7 SURVIVES THE TIE-BREAKER ---
    // Layer 1 (India) captures has_permanent_establishment_in_india but the
    // engine never used it. Article 7 (Business Profits) gives India a
    // taxing right on PE-attributable profits REGARDLESS of who wins the
    // Article 4 residence tie-breaker — a taxpayer who "cedes" India as their
    // treaty residence still owes India tax on the business profits its PE
    // there earns. This is easy to miss once the tie-breaker result reads as
    // "India isn't taxing worldwide income any more."
    if (model.treaty.hasPE && model.income.india.business.usd > 0) {
      add("pe_article7", S.WARNING, C.TREATY,
        "Permanent establishment in India — Article 7 business profits survive the tie-breaker",
        "A permanent establishment in India is on file alongside " + usd(model.income.india.business.usd) +
        " of Indian business/professional income. Even where the DTAA Article 4 tie-breaker resolves general treaty " +
        "residence away from India, Article 7 still gives India the right to tax profits ATTRIBUTABLE to that PE — the " +
        "tie-breaker result doesn't exempt PE profits the way it can exempt other income categories.",
        "Confirm profit attribution to the PE (functions/assets/risks, arm's-length pricing) separately from the general " +
        "residency analysis, and don't assume a 'ceded' India residence removes India's claim on PE-sourced business profits.",
        0, ["DTAA Art. 7", "Permanent establishment"]);
    }

    // -- 4g. CHAPTER XII-A (s.115H/115C) ELECTED BUT NOT IN THE COMPUTATION -
    // s.115H/115C give an NRI a concessional flat rate (20% investment income
    // / 10% LTCG, no slab progression) on specified foreign-exchange assets,
    // and — the easy-to-miss part — s.115H lets the taxpayer KEEP that regime
    // even after becoming resident again, for as long as the assets are held,
    // by filing the election each year. WISING doesn't yet recompute India
    // tax under this regime, so the number below should not be trusted as-is
    // when this box is checked.
    if (model.treaty.chapterXiiaElected) {
      add("chapter_xiia_not_computed", S.WARNING, C.CREDIT,
        "Chapter XII-A (s.115H/115C) elected — not reflected in the India tax computed below",
        "The Layer 1 Chapter XII-A election is on. Under s.115H/115C, specified investment income from foreign-exchange " +
        "assets is taxed at a flat 20% (10% for LTCG) instead of slab rates, and — unlike most NRI concessions — the " +
        "election can be KEPT even after the taxpayer becomes an ordinary resident, by re-filing it each year the assets " +
        "are retained. The India tax figure above is computed under normal slab/special rates and does not apply this election.",
        "Recompute the specified-asset income separately at the s.115H/115C flat rates before relying on the India tax " +
        "total above, and confirm the annual re-election was filed if residency status has since changed.",
        0, ["s.115H", "s.115C", "Chapter XII-A"]);
    }

    // -- 4h. NRA (1040-NR): FDAP SHOULD BE FLAT-RATE, NOT GRADUATED ---------
    // A non-resident alien's US-source FDAP income (interest, dividends,
    // rents, etc. not effectively connected with a US trade/business) is
    // taxed at a flat 30% (or lower treaty rate) with NO deductions —
    // ECI is taxed at the same graduated brackets as a resident. The engine
    // runs everyone through one graduated-bracket computation regardless of
    // this split, which understates/misstates the true 1040-NR liability.
    var nra = model.nra || {};
    if (model.treaty.files1040nr && !nra.s6013hElection && nra.fdapIncomeUsd > 0) {
      var nraDetail = computed.usTax && computed.usTax.nra;
      var claimedRate = (nra.treatyRateClaims[0] && nra.treatyRateClaims[0].rate) || null;
      add("nra_fdap_flat_rate", S.INFO, C.CREDIT,
        "1040-NR: FDAP taxed flat" + (nraDetail ? " (" + Math.round(nraDetail.fdapRate * 100) + "%)" : "") + ", ECI at graduated rates",
        usd(nra.fdapIncomeUsd) + " of FDAP income (interest/dividends/rents not effectively connected with a US trade or " +
        "business) is taxed flat" + (claimedRate ? " at the claimed " + claimedRate + "% treaty rate" : " at the 30% statutory rate (no treaty rate on file)") +
        " with no deductions (Schedule NEC), separate from " + usd(nra.eciIncomeUsd) + " of ECI taxed at graduated brackets" +
        " with itemized deductions only (NRAs generally can't claim the standard deduction).",
        "Confirm the treaty rate claimed on Form W-8BEN/1040-NR matches the rate used here" +
        (claimedRate ? "" : " — no treaty rate is on file, so the default 30% was applied; check whether Article 11/12 of the DTAA reduces it") + ".",
        0, ["Form 1040-NR", "Schedule NEC", "FDAP", "ECI"]);
    }

    // -- 4i. NRA TREATY RATE CLAIMED WITHOUT W-8BEN ON FILE -----------------
    if ((nra.treatyRateClaims || []).length > 0 && !nra.submittedW8ben) {
      add("nra_w8ben_missing", S.CRITICAL, C.TREATY,
        "Treaty withholding rate claimed without Form W-8BEN on file",
        (nra.treatyRateClaims.length) + " treaty-rate claim(s) are recorded for US-source FDAP income, but Form W-8BEN " +
        "(certifying foreign status and the treaty claim to the withholding agent) is not on file. Without it, the payer " +
        "must withhold at the default 30% rather than the claimed treaty rate.",
        "File Form W-8BEN with each withholding agent to support the claimed treaty rate; without it, expect 30% " +
        "withholding and a refund claim on the 1040-NR instead of correct withholding at source.",
        0, ["Form W-8BEN", "Treaty rate claim"]);
    }

    // -- 4j. FIRPTA — US REAL PROPERTY DISPOSITION BY A FOREIGN PERSON ------
    if (nra.usRealPropertyDisposed) {
      add("firpta", S.WARNING, C.DOCUMENT,
        "FIRPTA withholding on US real property disposition",
        "A disposition of US real property by a foreign person is on file" +
        (nra.firptaWithholdingUsd > 0 ? " with " + usd(nra.firptaWithholdingUsd) + " withheld at closing" : "") +
        ". FIRPTA generally requires the buyer to withhold 15% of the gross sale price (not the gain) at closing, " +
        "regardless of the seller's actual tax liability on the transaction.",
        "File Form 8288-A/8288-B as applicable; if 15% of the gross price materially overstates the actual tax on the " +
        "gain, apply for a withholding certificate (Form 8288-B) BEFORE closing to reduce it, and reconcile the balance on the 1040-NR.",
        nra.firptaWithholdingUsd || 0, ["FIRPTA", "Form 8288-A", "Form 8288-B"]);
    }

    // -- 5. FORM 67 TIMING (India FTC procedural) --------------------------
    if (model.income.us.foreignSourceTotal.usd > 0 || model.taxesPaid.us.total.usd > 0) {
      add("form67_required", S.INFO, C.DOCUMENT,
        "Form 67 — prepared for the Indian FTC claim",
        "Foreign income / foreign tax is present, so India requires Form 67 (with Schedule FSI and TR) on or before the ITR due date to allow FTC u/s 90/91.",
        "WISING prepares and e-files Form 67 with Schedules FSI/TR ahead of the ITR due date — it's on the filing checklist, no manual action needed.",
        0, ["Form 67", "Rule 128", "Schedule FSI", "Schedule TR"]);
    }

    // -- 6. TAX-YEAR / APPORTIONMENT MISMATCH ------------------------------
    if (res.dualResident || (model.meta.hasIndia && model.meta.hasUs)) {
      var ap = computed.apportionment;
      add("tax_year_mismatch", S.INFO, C.CREDIT,
        "Tax-year apportionment: Indian FY ↔ US CY (computed)",
        "India taxes Apr–Mar; the US taxes Jan–Dec. WISING splits the Indian FY across US calendar years — " +
        usd(ap.indiaToCyPrimaryUsd) + " into CY" + ap.cyPrimary + " and " + usd(ap.indiaToCyNextUsd) + " into CY" + ap.cyNext +
        " (" + ap.basis + ") — and apportions the US calendar year into the Indian FY (9/12 + 3/12).",
        "See the FY ↔ CY Apportionment panel on the Filings tab for the period-matched figures behind Form 67 (India) and Form 1116 (US). Planning-grade — refine with per-transaction dates at filing.",
        0, [CONST.CALENDAR.INDIA_FY.label, CONST.CALENDAR.US_CY.label]);
    }

    // -- 7. FX BASIS MISMATCH ----------------------------------------------
    add("fx_basis", S.INFO, C.CREDIT,
      "FX conversion basis is an approximation",
      "Cross-border amounts are normalized at a flat " + CONST.FX.INR_PER_USD +
      " INR/USD. Statutory FTC computations require the telegraphic-transfer buying rate on the relevant date (Rule 115 / SBI TTBR).",
      "Re-price each foreign income and tax item at the correct per-transaction rate before filing; the flat rate is for planning visibility only.",
      0, ["Rule 115", "SBI TTBR"]);

    // -- 7b. STATE RESIDENCY — THE INDIA-US TREATY DOES NOT BIND STATES -----
    // Article 4 / the federal §911/§901 machinery is FEDERAL law only. States
    // are not treaty parties, so a taxpayer who is non-resident (or a treaty
    // non-resident) for FEDERAL purposes can still be a full worldwide-income
    // state tax resident under that state's own domicile/statutory-day test —
    // and most states (famously California) grant no credit for tax paid to a
    // FOREIGN country, only to other US states. This is an easy-to-miss,
    // fully separate double-tax channel.
    var sr = model.stateResidency || {};
    var hasStateTies = !!(sr.primaryState || sr.domicileDec31 || sr.domicileJan1 || (sr.footprint || []).length > 0);
    var hasFederalTreatyPosture = res.dualResident || model.treaty.treatyResidence !== "none" ||
                                   model.treaty.usTreatyResidence !== "none" || model.treaty.dtaaForcedNr;
    if (hasStateTies && hasFederalTreatyPosture) {
      var stateNote = [];
      var flagState = sr.domicileDec31 || sr.primaryState || sr.domicileJan1;
      if (sr.caSafeHarbor || sr.caRetainsTies) stateNote.push("California safe-harbor/retained-ties facts are on file — CA is aggressive about domicile and does not allow a credit for foreign tax paid.");
      if (sr.ny548DayRule || sr.nyPermanentAbode || sr.nyDaysPresent > 0) stateNote.push("New York statutory-residency facts are on file (183-day + permanent-abode / 548-day rule) — NY residency is tested independently of the federal position.");
      if (sr.movedStates) stateNote.push("A mid-year state move is on file — part-year returns may be due in two states.");
      add("state_treaty_not_binding", S.WARNING, C.TREATY,
        "State tax residency is not resolved by the DTAA / federal treaty position" + (flagState ? " (" + flagState + ")" : ""),
        "The India-US treaty and the federal residency determination above bind FEDERAL tax only. " +
        (flagState ? flagState + " " : "The state on file ") + "applies its own domicile or statutory-day residency test, " +
        "independent of the Article 4 tie-breaker or any §911/1040NR position. A taxpayer can be a federal treaty " +
        "non-resident while remaining a full worldwide-income STATE resident with Indian income fully taxable and " +
        (stateNote.length ? "no matching relief in some states." : "little or no state-level foreign tax credit."),
        "Run the state's own residency test (domicile intent + day count) separately from the federal/treaty analysis. " +
        (stateNote.length ? stateNote.join(" ") : "Check whether the state allows any credit for foreign tax paid — several do not.") +
        " Do not assume the federal treaty position carries over.",
        0, ["State residency", flagState || "State domicile"]);
    }

    // -- 8. PFIC EXPOSURE (Indian mutual funds) ----------------------------
    var mfCount = (model.assets.indianMutualFunds || []).length;
    if (mfCount > 0 && res.us.isResident) {
      add("pfic", S.CRITICAL, C.ENTITY,
        "PFIC exposure: Indian mutual funds",
        mfCount + " Indian mutual fund / ETF holding(s) detected. For a US person these are Passive Foreign Investment Companies — taxed under the punitive §1291 excess-distribution regime by default, with a separate Form 8621 per fund.",
        "Evaluate a QEF or Mark-to-Market election (must be timely). Many Indian AMCs cannot supply a PFIC Annual Information Statement, which can force the §1291 default — consider restructuring holdings to US-domiciled funds.",
        0, ["Form 8621", "§1291", "QEF / MTM"]);
    }

    // -- 9. CFC / FORM 5471 (Indian companies) — use the ownership answer ---
    // Layer 1 (US) captures owns_10_percent_foreign_corp + foreign_corporations[],
    // so we don't hedge on "if you own ≥10%": we know.
    var bizCount = (model.assets.indianBusinesses || []).length;
    var usOwnsForeignCorp = model.assets.usOwns10PctForeignCorp || (model.assets.usForeignCorps || []).length > 0;
    if (usOwnsForeignCorp && res.us.isResident) {
      add("cfc", S.WARNING, C.ENTITY,
        "Controlled Foreign Corporation — Form 5471 required (GILTI/Subpart F not yet quantified)",
        "Layer 1 records the US person owning ≥10% of a foreign corporation" + (bizCount > 0 ? " (Indian company on file)" : "") +
        ", so Form 5471 applies and GILTI / Subpart F can accelerate US tax on undistributed Indian profits before any dividend is paid. " +
        "WISING flags the exposure from the ownership data but does NOT yet compute a GILTI/Subpart F inclusion amount — that requires the " +
        "entity's tested income, E&P and qualified business asset investment (QBAI), which Layer 1 doesn't collect today.",
        "File Form 5471 regardless. To quantify GILTI/Subpart F (and evaluate the §962 election against India's MAT/credit), collect the " +
        "Indian company's tested income, E&P and QBAI — until then, treat this as a required-filing flag, not a computed liability.",
        0, ["Form 5471", "GILTI §951A", "Subpart F", "§962 election"]);
    } else if (bizCount > 0 && res.us.isResident) {
      add("cfc_below_threshold", S.INFO, C.ENTITY,
        "Indian company held below the 10% CFC threshold",
        bizCount + " Indian business interest(s) on file, but Layer 1 shows US ownership below 10% — so Form 5471 Category 5 / GILTI do not apply this year.",
        "No 5471 action needed at current ownership. WISING re-checks automatically and flags the moment a purchase or reorganization pushes ownership to ≥10%.",
        0, ["Form 5471", "10% threshold"]);
    }

    // -- 10. RETIREMENT ACCOUNT TREATMENT MISMATCH -------------------------
    if ((model.assets.epfInr > 0 || model.assets.ppfInr > 0 || model.assets.npsInr > 0) && res.us.isResident) {
      add("retirement_mismatch", S.WARNING, C.RETIREMENT,
        "Indian retirement accounts (EPF / PPF / NPS) are taxed differently by the US",
        "India treats EPF, PPF and NPS as tax-free (or lightly taxed). The US does not automatically agree: the IRS can tax the interest these accounts earn every year, and may treat PPF like a trust that needs extra forms.",
        "WISING checks whether each account is a treaty-protected pension (Article 20) or a trust, adds the yearly interest to US income where the US requires it, and prepares the FBAR / Form 8938 and any Form 3520 filing — so nothing gets missed.",
        0, ["DTAA Art. 20", "Form 3520/3520-A", "FBAR"]);
    }

    // -- 10a. CROSS-FORM INCONSISTENCY — INDIA'S OWN SCHEDULE FA SELF-REPORT
    // The two Layer 1 forms are filled independently; nothing today checks
    // whether they AGREE. An India ROR must disclose worldwide (Schedule FA)
    // foreign assets — if the India form explicitly says "no foreign assets"
    // while the US form shows US accounts/US-source income (which, from
    // India's side, ARE foreign assets), the two intake forms are flatly
    // contradicting each other and Schedule FA is very likely under-reported.
    var usHasForeignToIndiaAssets = (model.accounts.accounts || []).some(function (a) { return a.country !== "India"; }) ||
                                     model.income.us.usSourceTotal.usd > 0;
    if (res.india.status === CONST.INDIA_STATUS.ROR && model.indiaForeignAssetsDeclared === false && usHasForeignToIndiaAssets) {
      add("schedule_fa_inconsistent", S.CRITICAL, C.DOCUMENT,
        "Layer 1 forms disagree: India form says 'no foreign assets', US form shows foreign holdings",
        "The India intake form explicitly records NO foreign assets, but the US intake form shows US-source income and/or " +
        "non-Indian accounts for the same taxpayer — who is an Indian ROR this year and therefore subject to worldwide " +
        "Schedule FA disclosure. This is a direct contradiction between the two forms, not just a missing field.",
        "Reconcile the two forms before filing: either the India form's 'no foreign assets' answer needs correcting, or the " +
        "US-side accounts/income need to be re-checked. Schedule FA penalties for non-disclosure are severe and independent " +
        "of whether any tax is actually due on the asset.",
        0, ["Schedule FA", "Black Money Act"]);
    }

    // -- 10b. FOREIGN GIFTS / TRUSTS — FORM 3520 PENALTY EXPOSURE -----------
    // No tax is due on a foreign gift itself, which is exactly why this gets
    // missed: Form 3520 Part IV reporting is required once gifts from a
    // single nonresident donor (or related group) exceed $100k in the year,
    // and the penalty for late/no filing is up to 25% of the gift — with no
    // underlying tax liability to signal that something is owed. Foreign
    // trust beneficiary status carries its own 3520/3520-A regime.
    var fg = model.foreignGifts || {};
    if (fg.receivedAbove100k || fg.isTrustBeneficiary) {
      var giftReasons = [];
      if (fg.receivedAbove100k) giftReasons.push("gift(s) from a foreign person exceeding $100,000 this year");
      if (fg.isTrustBeneficiary) giftReasons.push("US beneficiary of a foreign trust");
      add("foreign_gift_3520", S.WARNING, C.DOCUMENT,
        "Form 3520 required — foreign gift / trust reporting (no tax due, but real penalty exposure)",
        "Layer 1 records " + giftReasons.join(" and ") + ". Form 3520 is an INFORMATION return — there is no tax on a bona " +
        "fide gift — but the failure-to-file penalty is up to 25% of the unreported amount, and it is one of the most " +
        "commonly missed filings precisely because no tax is owed to prompt it.",
        "File Form 3520 (and 3520-A if a foreign trust with a US owner) by the return due date, even where no tax results. " +
        "Confirm the gift is genuinely a gift and not disguised compensation or a loan, and aggregate gifts from related donors.",
        0, ["Form 3520", "Form 3520-A"]);
    }
    if (fg.receivedFromCoveredExpatriate) {
      add("covered_expat_gift_tax", S.CRITICAL, C.CREDIT,
        "§2801 covered-expatriate gift/bequest tax may apply",
        "A gift or bequest was received from someone Layer 1 flags as a covered expatriate. Unlike an ordinary foreign gift, " +
        "§2801 imposes a special transfer tax on the US RECIPIENT, at the highest gift/estate tax rate, on the value received " +
        "from a covered expatriate — this is a real tax liability, not just an information filing.",
        "Confirm the donor's covered-expatriate status and compute the §2801 tax on Form 708 (once finalized) / per current IRS " +
        "guidance; this is separate from and in addition to the Form 3520 reporting above.",
        0, ["§2801", "Covered expatriate"]);
    }

    // -- 11. LRS LIMIT MONITORING ------------------------------------------
    var lrs = computed.limits.filter(function (g) { return g.id === "lrs"; })[0];
    if (lrs && lrs.status !== "ok") {
      add("lrs_limit", lrs.status === "breached" ? S.CRITICAL : S.WARNING, C.LIMIT,
        "LRS remittance " + (lrs.status === "breached" ? "limit breached" : "approaching limit"),
        "Outbound LRS remittances of " + usd(lrs.value) + " are at " + Math.round(lrs.pct * 100) +
        "% of the USD 250,000 RBI annual cap.",
        lrs.status === "breached"
          ? "A breach can attract RBI scrutiny and AD-bank refusal. Verify remittances across all banks (the cap is per-PAN, not per-account) and document the source of funds."
          : "Monitor remaining headroom for the rest of the financial year; TCS at 20% applies above ₹10 lakh.",
        0, ["RBI LRS", "TCS u/s 206C(1G)"]);
    }

    // -- 12. FBAR / 8938 LIMIT BREACH --------------------------------------
    var fbar = computed.limits.filter(function (g) { return g.id === "fbar"; })[0];
    if (fbar && fbar.status === "breached") {
      add("fbar_limit", S.CRITICAL, C.LIMIT,
        "FBAR threshold breached",
        "Aggregate peak balance across foreign accounts is " + usd(fbar.value) +
        ", above the USD 10,000 reporting cliff. EVERY foreign account must be reported, not just those over the limit.",
        "File FinCEN Form 114 by the due date (auto-extended to Oct 15). Non-willful penalties start at ~$10,000 per violation; willful penalties are far higher.",
        0, ["FinCEN 114", "FBAR"]);
    }

    // -- 12b. EQUITY COMPENSATION — CROSS-BORDER SOURCING CONFLICT ----------
    // India's ESOP perquisite (s.17(2)(vi), taxed at exercise/allotment) and
    // the US's RSU-vest / NSO-exercise ordinary income are usually two views
    // of the SAME multi-year equity award, split by whichever country the
    // employee was in on each vesting/exercise date. When both sides show
    // equity-comp activity in the same year, the award is very likely being
    // sourced independently by each country under its own timing rule, with
    // no day-count (workdays-in-country) allocation under DTAA Art. 15/16 to
    // prevent the same tranche from being fully taxed twice.
    var eq = model.equityComp || {};
    if (eq.hasUsEquityComp && eq.esopPerquisiteInr > 0) {
      add("equity_comp_sourcing", S.WARNING, C.INCOME,
        "Equity compensation taxed on both sides — cross-border sourcing not applied",
        "Both an India ESOP/perquisite event and a US equity-compensation event (RSU vest / NSO exercise) are on file " +
        "for this year. India taxes the ESOP perquisite in full at exercise/allotment (s.17(2)(vi)); the US taxes RSU " +
        "vesting / NSO exercise in full as ordinary income in the vesting/exercise year. Absent a workday-based " +
        "allocation, the same equity award can be fully taxed by BOTH countries rather than apportioned to where the " +
        "services were actually performed during the vesting period.",
        "Reconstruct the vesting-period workday split between India and the US (DTAA Art. 15/16 dependent-personal-" +
        "services sourcing) so each country only taxes its proportionate share, then claim FTC/§90 relief on the " +
        "genuinely overlapping portion rather than the full award twice.",
        0, ["DTAA Art. 15", "s.17(2)(vi)", "RSU vesting", "NSO exercise"]);
    }

    // -- 13. CROSS-BASIS SUMMARY (one finding; detail lives in the table) ---
    // The per-head "same income, both codes" breakdown is shown in the
    // Cross-Basis Reconciliation table (Filings tab), not as N warnings.
    var recon = computed.reconciliation;
    var dtRows = (recon && recon.rows || []).filter(function (r) { return r.doublyTaxed; });
    if (dtRows.length > 0) {
      add("cross_basis_summary", S.INFO, C.INCOME,
        dtRows.length + " income head(s) taxed under both codes — see reconciliation",
        "The same income is taxed in India (its own Act) and the US (the IRC): " +
        dtRows.map(function (r) { return r.label; }).join(", ") + ". Overlapping exposure of " +
        usd(recon.overlapUsd) + " is what the FTC / §90 relief resolves." +
        (recon.anyEstimate ? " Some heads are planning-grade estimates pending line-item inputs." : ""),
        "Open the Cross-Basis Reconciliation on the Filings tab to see each head on both bases, then relieve the overlap via Form 1116 (US) / Form 67 (India).",
        recon.overlapUsd, ["DTAA", "Form 1116", "Form 67"]);
    }

    // -- sort by severity then amount --------------------------------------
    var weight = {}; weight[S.CRITICAL] = 0; weight[S.WARNING] = 1; weight[S.INFO] = 2;
    f.sort(function (a, b) {
      if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
      return b.amountUsd - a.amountUsd;
    });
    return f;
  }

  /* ------------------------------------------------------------------------
   * buildDocuments — evaluate the document catalogue against the model.
   * ----------------------------------------------------------------------*/
  function buildDocuments(model, computed) {
    var res = computed.residency;
    var triggers = {
      fincen_114: model.accounts.aggregatePeak.usd > CONST.LIMITS.FBAR_AGGREGATE_USD && res.us.isResident,
      form_8938: (function () {
        var g = computed.limits.filter(function (x) { return x.id === "form8938"; })[0];
        return !!g && g.status === "breached" && res.us.isResident;
      })(),
      form_1116: model.taxesPaid.india.total.usd > 0 && res.us.isResident,
      form_2555: model.limitsRaw.feieClaimed,
      form_8833: res.dualResident || model.treaty.usTreatyResidence !== "none" || model.treaty.files1040nr,
      form_8621: (model.assets.indianMutualFunds || []).length > 0 && res.us.isResident,
      form_5471: (model.assets.indianBusinesses || []).length > 0 && res.us.isResident,
      form_8865: false,
      form_3520: ((model.assets.ppfInr > 0 || model.assets.epfInr > 0) && res.us.isResident) ||
                 model.foreignGifts.receivedAbove100k || model.foreignGifts.isTrustBeneficiary,
      form_1040nr: model.treaty.files1040nr || (res.us.status === CONST.US_STATUS.NON_RESIDENT_ALIEN),
      form_8960: computed.headline.totalIncomeUsd > (CONST.LIMITS.NIIT_THRESHOLD[model.identity.usFilingStatus] || 200000) &&
                 (model.income.us.interestUs.usd + model.income.us.ordinaryDividendsUs.usd + model.income.us.capitalGainsUs.usd) > 0,
      form_8959: (computed.usTax && computed.usTax.additionalMedicareUsd > 0) || (model.limitsRaw.additionalMedicareOwed || 0) > 0,
      form_67: model.income.us.foreignSourceTotal.usd > 0 || model.taxesPaid.us.total.usd > 0 || res.india.isResident,
      trc: res.dualResident || model.treaty.treatyResidence !== "none" || model.treaty.usTreatyResidence !== "none",
      form_10f: res.dualResident || model.treaty.treatyResidence !== "none",
      schedule_fa: res.india.status === CONST.INDIA_STATUS.ROR &&
                   (model.income.us.usSourceTotal.usd > 0 || (model.accounts.accounts || []).some(function (a) { return a.country !== "India"; })),
      schedule_fsi_tr: model.taxesPaid.us.total.usd > 0 || model.income.us.usSourceTotal.usd > 0,
      form_15ca_cb: model.limitsRaw.lrsRemittedInr > 0
    };

    return CONST.DOCUMENTS.map(function (d) {
      var triggered = !!triggers[d.id];
      return {
        id: d.id,
        jurisdiction: d.jurisdiction,
        name: d.name,
        desc: d.desc,
        why: d.why,
        severity: d.severity,
        required: triggered,
        status: triggered ? "required" : "not_triggered"
      };
    });
  }

  /* ------------------------------------------------------------------------
   * buildFtcReport — flatten the FTC computation into a dashboard table.
   * ----------------------------------------------------------------------*/
  function buildFtcReport(model, computed) {
    var ftc = computed.ftc;
    var feieRows = ftc.us.feieExcludedUsd > 0
      ? [{ label: "Less FEIE-excluded wages (§911)", usd: -ftc.us.feieExcludedUsd },
         { label: "Indian tax disallowed on excluded income", usd: -ftc.us.indiaTaxDisallowedUsd }]
      : [];
    return {
      direction_us_claims_india: {
        title: "US Form 1116 — credit for Indian taxes",
        rows: feieRows.concat([
          { label: "Indian income tax (creditable)", usd: ftc.us.indiaTaxPaidUsd },
          { label: "Foreign-source income (US view)", usd: ftc.us.foreignSourceIncomeUsd },
          { label: "US taxable income", usd: ftc.us.taxableIncomeUsd },
          { label: "US income tax (pre-credit)", usd: ftc.us.usIncomeTaxUsd },
          { label: "FTC limitation = US tax × foreign/taxable", usd: ftc.us.ftcLimitUsd },
          { label: "FTC allowed this year", usd: ftc.us.ftcAllowedUsd, emphasis: true },
          { label: "Excess credit carried over (§904(c))", usd: ftc.us.carryoverUsd },
          { label: "Residual double tax (unrelieved)", usd: ftc.us.residualDoubleTaxUsd, warn: true }
        ])
      },
      direction_india_relief: {
        title: "India §90 relief — for US taxes on doubly-taxed income",
        rows: [
          { label: "US-source income (foreign, India view)", usd: ftc.india.foreignSourceIncomeUsd },
          { label: "US tax on that US-source income", usd: ftc.india.usTaxOnUsSourceUsd },
          { label: "Indian tax on the doubly-taxed income (cap)", usd: ftc.india.reliefCapUsd },
          { label: "§90 relief allowed", usd: ftc.india.reliefAllowedUsd, emphasis: true }
        ]
      },
      headlineNetDoubleTaxUsd: ftc.netUnrelievedDoubleTaxUsd
    };
  }

  /* ------------------------------------------------------------------------
   * buildTaxComputation — flatten the India & US computed liabilities into
   * dashboard-ready breakdown tables (transparency behind the FTC numbers).
   * ----------------------------------------------------------------------*/
  function buildTaxComputation(computed) {
    var i = computed.indiaTax, u = computed.usTax;
    return {
      india: {
        title: i.isEntity ? ("India income tax — " + i.regime) : ("India income tax (" + i.regime + " regime)"),
        currency: "INR",
        rows: [
          { label: "Gross total income", inr: i.grossTotalIncomeInr },
          { label: "Chapter VI-A deductions", inr: -i.deductionsInr },
          { label: "Total income", inr: i.totalIncomeInr },
          { label: "Tax at slab rates", inr: i.slabTaxInr },
          { label: "Tax on special-rate gains (111A/112A)", inr: i.specialTaxInr },
          { label: "Less §87A rebate", inr: -i.rebateInr },
          { label: "Surcharge", inr: i.surchargeInr },
          { label: "Health & education cess (4%)", inr: i.cessInr },
          { label: "Total India tax", inr: i.totalTaxInr, emphasis: true }
        ],
        totalUsd: i.totalTaxUsd,
        effectiveRate: i.effectiveRate
      },
      us: u.isNra ? {
        title: "US federal tax — Form 1040-NR (ECI graduated / FDAP flat)",
        currency: "USD",
        rows: [
          { label: "ECI (wages + net self-employment)", usd: u.nra.eciUsd },
          { label: "Less itemized deductions (no standard deduction for NRAs)", usd: -u.deductionUsd },
          { label: "Taxable ECI", usd: u.taxableIncomeUsd },
          { label: "Tax on ECI (graduated brackets)", usd: u.nra.eciTaxUsd },
          { label: "FDAP (interest/dividends/rental, Schedule NEC)", usd: u.nra.fdapUsd },
          { label: "Tax on FDAP (flat " + Math.round(u.nra.fdapRate * 100) + "%, no deductions)", usd: u.nra.fdapTaxUsd },
          { label: "Additional Medicare tax", usd: u.additionalMedicareUsd },
          { label: "Total US tax (pre-FTC)", usd: u.totalTaxBeforeFtcUsd, emphasis: true }
        ],
        totalUsd: u.totalTaxBeforeFtcUsd,
        effectiveRate: u.effectiveRate
      } : {
        title: u.isEntity ? ("US federal tax — " + u.filingStatus) : ("US federal income tax (" + u.filingStatus.toUpperCase() + ")"),
        currency: "USD",
        rows: [
          { label: "Total income" + (u.worldwide ? " (worldwide)" : " (US-source)"), usd: u.totalIncomeUsd },
          { label: "Adjusted gross income", usd: u.agiUsd },
          { label: "Less " + u.deductionMode + " deduction", usd: -u.deductionUsd }
        ].concat(u.qbiDeductionUsd > 0 ? [{ label: "Less §199A QBI deduction", usd: -u.qbiDeductionUsd }] : [])
          .concat([
            { label: "Taxable income", usd: u.taxableIncomeUsd },
            { label: "Ordinary-rate tax", usd: u.ordinaryTaxUsd },
            { label: "Preferential LTCG/QDI tax", usd: u.preferentialTaxUsd },
            { label: "Net investment income tax (NIIT)", usd: u.niitUsd },
            { label: "Additional Medicare tax", usd: u.additionalMedicareUsd }
          ])
          .concat(u.seTaxUsd > 0 ? [{ label: "Self-employment tax (Schedule SE)", usd: u.seTaxUsd }] : [])
          .concat(u.amtUsd > 0 ? [{ label: "Alternative Minimum Tax (§55)", usd: u.amtUsd }] : [])
          .concat(u.creditsUsd > 0 ? [{ label: "Less non-refundable credits (care/AOTC/LLC)", usd: -u.creditsUsd }] : [])
          .concat([{ label: "Total US tax (pre-FTC)", usd: u.totalTaxBeforeFtcUsd, emphasis: true }]),
        totalUsd: u.totalTaxBeforeFtcUsd,
        effectiveRate: u.effectiveRate
      }
    };
  }

  /* ------------------------------------------------------------------------
   * analyze — single entry point used by the dashboard.
   * ----------------------------------------------------------------------*/
  function analyze(opts) {
    opts = opts || {};
    var scenario = opts.scenario || {};

    // Scenario overrides let the dashboard re-run the engine live (what-if
    // levers). FX is a module constant, so override it around this synchronous
    // call and restore afterwards.
    var savedFx = CONST.FX.INR_PER_USD;
    if (scenario.fxRate) CONST.FX.INR_PER_USD = scenario.fxRate;

    var model = WISING.normalize(opts);

    if (scenario.indiaRegime) model.residency.india.taxRegime = scenario.indiaRegime;
    if (scenario.feie !== undefined && scenario.feie !== null) model.limitsRaw.feieClaimed = scenario.feie;

    var computed = WISING.compute(model);

    CONST.FX.INR_PER_USD = savedFx; // restore

    var findings = detectConflicts(model, computed);
    var documents = buildDocuments(model, computed);
    var ftcReport = buildFtcReport(model, computed);
    var taxComputation = buildTaxComputation(computed);
    var monitoring = WISING.monitor
      ? WISING.monitor(model, computed, { findings: findings, asOf: (opts.scenario && opts.scenario.asOf) || opts.asOf })
      : null;

    var counts = { critical: 0, warning: 0, info: 0 };
    findings.forEach(function (x) { counts[x.severity]++; });

    return {
      model: model,
      computed: computed,
      findings: findings,
      documents: documents,
      ftcReport: ftcReport,
      taxComputation: taxComputation,
      monitoring: monitoring,
      summary: {
        name: model.identity.name,
        baseYear: model.meta.baseYear,
        jurisdiction: model.meta.jurisdiction,
        hasIndia: model.meta.hasIndia,
        hasUs: model.meta.hasUs,
        indiaQuarterly: model.meta.indiaQuarterly,
        indiaStatus: computed.residency.india.status,
        usStatus: computed.residency.us.status,
        dualResident: computed.residency.dualResident,
        totalIncomeUsd: computed.headline.totalIncomeUsd,
        indiaTaxUsd: computed.headline.indiaTaxUsd,
        usTaxUsd: computed.headline.usTaxUsd,
        netDoubleTaxUsd: computed.headline.netUnrelievedDoubleTaxUsd,
        counts: counts,
        requiredDocs: documents.filter(function (d) { return d.required; }).length,
        healthScore: monitoring ? monitoring.health.score : null,
        nextDeadline: monitoring && monitoring.calendar.next ? monitoring.calendar.next.dateLabel : null
      }
    };
  }

  WISING.analyze = analyze;
  WISING.conflictInternals = {
    detectConflicts: detectConflicts,
    buildDocuments: buildDocuments,
    buildFtcReport: buildFtcReport
  };
})(typeof window !== "undefined" ? window : globalThis);

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

  function inr(n) {
    return "₹" + Math.round(n).toLocaleString("en-IN");
  }

  // Form 1118 is the corporate Foreign Tax Credit form — same core §904
  // limitation this engine computes, but filed by a C-corp instead of the
  // individual/estate/trust Form 1116 (which also covers pass-through
  // owners, so S-corp/partnership/trust profiles correctly stay on 1116).
  // Every FTC-adjacent citation should call this instead of hardcoding
  // "Form 1116", so a C-corp profile is never told to file the wrong form.
  function usFtcForm(model) {
    return (model.entity && model.entity.usReturnForm === "1120") ? "Form 1118" : "Form 1116";
  }

  /* Reconstructs WHICH Article 4 test actually decided the tie-break (the
   * winner alone doesn't say whether it was permanent home, centre of vital
   * interests, habitual abode, or nationality) — mirrors the same step
   * sequence as Layer 1's own evaluateTieBreaker() so the reasoning shown
   * here always matches what the taxpayer walked through. Returns null when
   * no tie-break data is on file (e.g. the winner came from the US Layer 1
   * form instead, which doesn't record these steps). */
  function describeTieBreak(t) {
    var home = t.tieBreakHome, cvi = t.tieBreakCvi, abode = t.tieBreakAbode, nat = t.tieBreakNationality;
    if (home === "india") return { article: "Art. 4(2)(a)", reason: "permanent home is only in India" };
    if (home === "us") return { article: "Art. 4(2)(a)", reason: "permanent home is only in the US" };
    if (home !== "both" && home !== "neither") return null;
    if (cvi === "india") return { article: "Art. 4(2)(a)", reason: "centre of vital interests is closer to India" };
    if (cvi === "us") return { article: "Art. 4(2)(a)", reason: "centre of vital interests is closer to the US" };
    if (cvi !== "tie") return null;
    if (abode === "india") return { article: "Art. 4(2)(b)", reason: "habitual abode is in India" };
    if (abode === "us") return { article: "Art. 4(2)(b)", reason: "habitual abode is in the US" };
    if (abode !== "tie") return null;
    if (nat === "india") return { article: "Art. 4(2)(c)", reason: "Indian national" };
    if (nat === "us") return { article: "Art. 4(2)(c)", reason: "US national" };
    if (nat === "tie") return { article: "Art. 4(3)", reason: "neither permanent home, vital interests, abode nor nationality broke the tie", mapRequired: true };
    return null;
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
      var tb = describeTieBreak(model.treaty);
      if (!tbWinner) {
        if (tb && tb.mapRequired) {
          // All four mechanical tests (home, CVI, abode, nationality) were
          // exhausted on the Layer 1 wizard and none broke the tie — this
          // isn't an incomplete form, it's a genuine Art. 4(3) case that
          // needs the competent authorities (IRS/CBDT), not more form fields.
          add("dual_residency", S.CRITICAL, C.TREATY,
            "Dual tax residency — Article 4(3) Mutual Agreement Procedure required",
            "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag +
            "). The Layer 1 tie-breaker wizard was completed through all four tests — permanent home, centre of vital " +
            "interests, habitual abode, and nationality — and " + tb.reason + ". Article 4(3) hands this to the " +
            "competent authorities (CBDT and the IRS) for a Mutual Agreement Procedure; it cannot be self-resolved.",
            "File a MAP request (competent authority assistance) with the IRS and/or CBDT rather than re-running the " +
            "wizard — the mechanical tie-breaker has already been exhausted. Both countries continue asserting worldwide " +
            "taxing rights and only partial FTC relief is available until MAP concludes.",
            computed.doubleTax.totalDoublyTaxedUsd, ["DTAA Art. 4(3)", "MAP", "Form 8833", "TRC", "Form 41"]);
        } else {
          add("dual_residency", S.CRITICAL, C.TREATY,
            "Dual tax residency — Article 4 tie-breaker not yet run",
            "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag +
            ") for an overlapping period, and the Layer 1 Article 4 tie-breaker has not been completed. Until it is, both countries assert worldwide taxing rights and only partial FTC relief is available.",
            "Complete the Layer 1 tie-breaker wizard (permanent home → centre of vital interests → habitual abode → nationality). WISING will then flag Form 8833 (US) and the TRC / Form 41 requirement (India) on the filing checklist for the loser side — actually preparing and filing those remains a manual step.",
            computed.doubleTax.totalDoublyTaxedUsd, ["DTAA Art. 4", "Form 8833", "TRC", "Form 41"]);
        }
      } else {
        add("dual_residency_resolved", S.INFO, C.TREATY,
          "Dual residency resolved under DTAA Article 4 → " + String(tbWinner).toUpperCase(),
          "Both India and the US met residency, and the Layer 1 Article 4 tie-breaker resolves treaty residence to " +
          String(tbWinner).toUpperCase() + " for the overlapping period" +
          (tb ? " (" + tb.article + ": " + tb.reason + ")" : "") +
          ". WISING has applied this to the tax and FTC computation below; the loser jurisdiction is taxed on a source basis.",
          "Keep " + (tbWinner === "india" ? "TRC + Form 41 (India) and Form 8833 (US)" : "Form 8833 (US) and TRC + Form 41 (India)") + " on file to support the position.",
          0, ["DTAA Art. 4", tbWinner === "india" ? "Form 41" : "Form 8833"]);
      }
    }

    // -- 3. TREATY BENEFIT CLAIMED WITHOUT TRC / FORM 10F -------------------
    var treatyElections = model.treaty.treatyElections || [];
    var claimsTreaty = model.treaty.treatyResidence !== "none" ||
                       model.treaty.usTreatyResidence !== "none" ||
                       model.treaty.dtaaForcedNr || model.treaty.files1040nr ||
                       treatyElections.length > 0;
    if (claimsTreaty && (!model.treaty.trcStatus || !model.treaty.form10fFiled)) {
      var missing = [];
      if (!model.treaty.trcStatus) missing.push("TRC (IRS Form 6166)");
      if (!model.treaty.form10fFiled) missing.push("Form 41");
      add("treaty_docs_missing", S.CRITICAL, C.TREATY,
        "Treaty relief claimed without supporting documents",
        "A treaty position / DTAA rate is being relied upon, but " + missing.join(" and ") +
        " is not on file. Indian tax authorities will deny treaty relief u/s 159(8) without a valid TRC, and Form 41 is mandatory u/r 75.",
        "Obtain " + missing.join(" and ") + " before filing. For US residents, request Form 6166 from the IRS (Form 8802 application) well in advance — it can take 6–8 weeks.",
        0, ["s.159(8)", "Rule 75 (Income-tax Rules, 2026)", "Form 6166"]);
    }

    // -- 3b. DTAA TREATY RATE ELECTIONS ON FILE (per income stream) ---------
    // Layer 1 lets the taxpayer claim a specific DTAA article/rate on
    // India-source interest, royalty, FTS or dividend, against a specific
    // rupee amount_inr (e.g. Art. 11(2)(b) 15% on ₹1,50,000 of one NRO
    // account's interest). Dividend/royalty/FTS genuinely fall under s.207's
    // concessional domestic rate (a flat comparison, see computeS115aStream).
    // Interest does NOT — s.207 (narrowly, the foreign-currency-borrowing-interest limb)'s concessional rate is narrowly
    // limited to foreign-currency-borrowing interest, so ordinary NRO
    // interest defaults to slab rates, and a treaty election only carves it
    // out when that beats the *marginal* slab rate on that slice (see
    // computeNrInterestTreatment). Rather than re-deriving either comparison
    // here (and risking drift from what's actually computed), this reads the
    // real per-election outcome straight from computed.indiaTax.
    var COMPUTED_S115A_TYPES = { dividend: true, royalty: true, fts: true };
    if (treatyElections.length > 0) {
      var isNrForS115a = res.india.status === CONST.INDIA_STATUS.NR;
      var docsShortfall = [];
      if (!model.treaty.trcStatus) docsShortfall.push("TRC (IRS Form 6166)");
      if (!model.treaty.form10fFiled) docsShortfall.push("Form 41");
      var s115aByType = (computed.indiaTax && computed.indiaTax.s115a) || {};
      var nrInterestElections = (computed.indiaTax && computed.indiaTax.nrInterest && computed.indiaTax.nrInterest.elections) || [];
      var interestSeen = 0;
      var typeSeen = { dividend: 0, royalty: 0, fts: 0 };
      var electionParts = treatyElections
        .filter(function (e) { return e && e.income_type; })
        .map(function (e) {
          var pct = e.elected_rate != null ? Math.round(e.elected_rate * 100) + "%" : "unset rate";
          var amtInr = U.num(e.amount_inr);
          var amtStr = amtInr > 1 ? " on " + inr(amtInr) : " (no amount entered)";
          var computedTag;
          if (!isNrForS115a) {
            computedTag = " [not applied — taxpayer is not NR, see below]";
          } else if (e.income_type === "capital_gains") {
            computedTag = " [not applied — no special treaty rate under Art. 13 for capital gains]";
          } else if (amtInr <= 1) {
            computedTag = " [not applied — no amount entered against this election]";
          } else if (e.income_type === "interest") {
            var ie = nrInterestElections[interestSeen++];
            if (!ie) computedTag = " [not applied]";
            else if (ie.outcome === "denied_no_docs") computedTag = " [election denied — TRC/Form 41 missing, ordinary slab rates apply to this slice instead]";
            else if (ie.outcome === "treaty_beats_slab") computedTag = " [elected rate applied — beats the marginal slab rate this slice would otherwise cost]";
            else computedTag = " [not applied — the marginal slab rate on this slice is already cheaper than the elected treaty rate]";
          } else if (COMPUTED_S115A_TYPES[e.income_type]) {
            var stream = s115aByType[e.income_type];
            var se = stream && stream.elections && stream.elections[typeSeen[e.income_type]++];
            var domestic = CONST.TAX.INDIA.S115A_RATES[e.income_type];
            var compareDom = domestic != null ? " (vs " + Math.round(domestic * 100) + "% domestic s.207 rate)" : "";
            if (!se) computedTag = " [not applied]" + compareDom;
            else if (se.outcome === "denied_no_docs") computedTag = " [election denied — domestic " + Math.round(domestic * 100) + "% rate applied instead, TRC/Form 41 missing]";
            else if (se.outcome === "elected_rate_applied") computedTag = " [elected rate applied to the India tax above" + compareDom + "]";
            else computedTag = " [domestic " + Math.round(domestic * 100) + "% rate applied instead — it's more beneficial than the elected rate]";
          } else {
            computedTag = " [not applied]";
          }
          return e.income_type + " @ " + pct + (e.treaty_article ? " (" + e.treaty_article + ")" : "") + amtStr + computedTag;
        });
      add("dtaa_treaty_elections", docsShortfall.length > 0 ? S.WARNING : S.INFO, C.TREATY,
        electionParts.length + " DTAA treaty rate election(s) on file",
        "Layer 1 records a claimed treaty rate on the following India-source income stream(s): " + electionParts.join("; ") + "." +
        (!isNrForS115a
          ? " This taxpayer is resident (not NR) under India's own domestic law, so s.207 and every election above " +
            "has NO effect regardless of income type; residents are taxed on this income at slab rates instead. If the " +
            "taxpayer is genuinely meant to be NR, check the residency determination; if not, these elections are moot."
          : " Dividend, royalty and FTS elections are compared against the flat domestic s.207 rate (s.159, whichever " +
            "is lower). Interest is different — ordinary NRO interest isn't actually s.207 income (that concessional " +
            "rate is narrow, foreign-currency-borrowing interest only), so it's slab-rate income by default, and an " +
            "election only helps when the flat treaty rate beats the marginal slab rate on that specific slice. Capital-" +
            "gains elections are NOT applied — Art. 13 itself provides no special treaty rate, domestic law governs " +
            "regardless (see Part H).") +
        (docsShortfall.length > 0
          ? " Layer 1 does NOT show " + docsShortfall.join(" or ") + " on file — every one of these elections is at risk of " +
            "being denied and defaulting back to slab/domestic rates without it."
          : ""),
        docsShortfall.length > 0
          ? "Obtain " + docsShortfall.join(" and ") + " before relying on any of these elected rates — without it, the payer/" +
            "assessing officer can withhold or assess at the full domestic rate shown above instead."
          : "Confirm each elected rate against the current India-US DTAA text for that article — TRC and Form 41 are on file, " +
            "but that alone doesn't verify the specific article/rate claimed is correct for this income stream.",
        0, ["DTAA treaty election", "s.207", "s.159", "s.159(8)"]);
    }

    // -- 3c2. WITHHOLDING DOCUMENTATION GAP — QUANTIFIED HEADLINE -----------
    // Consolidates every treaty-denied stream (India s.207/s.159 dividend/
    // royalty/FTS/interest, US FDAP under IRC §1441/§1.1441-6) into ONE
    // number: the real, computed extra tax being paid this year purely
    // because supporting documentation (TRC, Form 41, Form W-8BEN) isn't on
    // file — not an estimate, the same per-stream figures the Withholding
    // Taxes page shows, summed. Fires only when that number is actually
    // material; the per-stream detail (dtaa_treaty_elections, nra_w8ben_
    // missing) above already covers the narrative for each individual
    // stream — this is the one-line "how much is this actually costing you"
    // a preparer would lead with.
    var wh = buildWithholdingSummary(model, computed);
    if (wh.totalGapUsd > 1) {
      var whParts = [];
      if (wh.india.totalGapInr > 1) whParts.push(inr(wh.india.totalGapInr) + " in India (TRC/Form 41)");
      if (wh.us.totalGapUsd > 1) whParts.push(usd(wh.us.totalGapUsd) + " in the US (Form W-8BEN)");
      add("withholding_documentation_gap", S.CRITICAL, C.DOCUMENT,
        "Missing documentation is costing " + usd(wh.totalGapUsd) + " in avoidable withholding tax this year",
        "Adding up every income stream where a treaty-reduced rate was claimed but denied for lack of supporting " +
        "documentation: " + whParts.join(" + ") + " — " + usd(wh.totalGapUsd) + " total, computed directly from the " +
        "same rate/amount figures used elsewhere on this page, not estimated. See the Withholding Taxes page for the " +
        "full row-by-row breakdown of which income and which document.",
        "File the missing documentation (TRC + Form 41 for India s.159 elections; Form W-8BEN with the US withholding " +
        "agent for FDAP) as soon as possible — none of this is lost once filed for a FUTURE payment, but the tax " +
        "already withheld/assessed on past payments this year may require a separate refund claim to recover.",
        wh.totalGapUsd, ["Withholding tax", "TRC", "Form 41", "Form W-8BEN"]);
    }

    // -- 3c. PAN NOT LINKED TO AADHAAR — PAN TREATED AS INOPERATIVE ---------
    // Captured by Layer 1's profile toggle but never read anywhere in the
    // engine before this. Under Rule 114AAA, an unlinked PAN is "inoperative":
    // every payer must withhold at the higher default rate u/s 397(2) (merges
    // the old ss.206AA/206CC, TDS+TCS) as if no PAN had been furnished — this overrides ANY treaty
    // rate elected above, refunds are withheld while inoperative, and interest
    // keeps accruing for the period it stays that way. Only fires on an
    // explicit false (not simply unanswered/null).
    if (model.identity.panAadhaarLinked === false) {
      add("pan_not_linked_aadhaar", S.CRITICAL, C.DOCUMENT,
        "PAN not linked to Aadhaar — PAN is inoperative, higher TDS/TCS applies",
        "Layer 1 records the PAN as NOT linked to Aadhaar. Under Rule 114AAA an unlinked PAN is treated as inoperative — " +
        "every payer must withhold TDS/TCS at the higher default rate u/s 397(2) (generally 20%, or double the " +
        "normal TCS rate, whichever is higher) as if no PAN had been furnished at all, REGARDLESS of any lower slab, " +
        "special, or DTAA treaty rate that would otherwise apply — including the treaty elections above, if any. " +
        "Refunds are also withheld while the PAN remains inoperative, and interest keeps accruing for that period.",
        "Link PAN to Aadhaar (paying the applicable late fee) before relying on any withholding-rate, refund, or treaty-" +
        "election figure on this page — every number computed here assumes a valid, operative PAN.",
        0, ["s.397(2)", "Rule 114AAA", "PAN inoperative"]);
    }

    // -- 4. FTC RECONCILIATION GAP (residual double tax) -------------------
    // Requires real dual scope: "residual double taxation" is meaningless
    // for a taxpayer who was never taxed by the second country in the first
    // place — without a US tax liability to credit against, indiaTaxPaidUsd
    // trivially exceeds a near-zero ftcLimitUsd and this fired for every
    // purely-domestic Indian taxpayer regardless of actual US exposure
    // (found building the india_only_ca_client demo profile).
    if (model.meta.hasIndiaScope && model.meta.hasUsScope && ftc.netUnrelievedDoubleTaxUsd > 1) {
      add("ftc_gap", S.CRITICAL, C.CREDIT,
        "Foreign Tax Credit shortfall — residual double taxation",
        "Indian tax paid (" + usd(ftc.us.indiaTaxPaidUsd) + ") exceeds the US FTC limitation (" +
        usd(ftc.us.ftcLimitUsd) + ") for this year. " + usd(ftc.us.residualDoubleTaxUsd) +
        " of Indian tax cannot be credited currently and would otherwise be double-taxed.",
        usd(ftc.us.carryoverUsd) + " is eligible to carry over under §904(c) (back 1 year / forward 10), but WISING is a " +
        "single-year snapshot — it does NOT persist this carryover across tax years or track it for you. Record " +
        usd(ftc.us.carryoverUsd) + " on " + usFtcForm(model) + " Schedule B this year, and re-enter it as prior-year carryover when you " +
        "run next year's numbers. Also check whether treaty re-sourcing (Art. 25) could reclassify some income to lift " +
        "the limitation — WISING does not test this automatically.",
        ftc.us.residualDoubleTaxUsd, [usFtcForm(model), "§904(c)"]);
    } else if (model.meta.hasIndiaScope && model.meta.hasUsScope && ftc.us.indiaTaxPaidUsd > 0 && ftc.us.ftcAllowedUsd > 0) {
      add("ftc_available", S.INFO, C.CREDIT,
        "Foreign Tax Credit available and within limit",
        "Indian tax of " + usd(ftc.us.indiaTaxPaidUsd) + " is fully creditable against US tax this year (" +
        usd(ftc.us.ftcAllowedUsd) + " within a " + usd(ftc.us.ftcLimitUsd) + " limitation).",
        "Claim on " + usFtcForm(model) + " (US) and file Form 44 (India) before the ITR due date to preserve symmetric relief.",
        ftc.us.ftcAllowedUsd, [usFtcForm(model), "Form 44"]);
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
        "US Alternative Minimum Tax applies (+" + usd(computed.usTax.amtUsd) + ")",
        "This is a US-only tax (IRC §55) — India has no AMT-equivalent regime. The US tentative minimum tax exceeds the " +
        "regular US tax, so an additional " + usd(computed.usTax.amtUsd) +
        " is added to the US liability. Common drivers: a large standard-deduction / SALT add-back, private-activity-bond interest, or an ISO exercise.",
        "WISING computes the parallel AMT (Form 6251) and includes it in the US tax total above. Review ISO exercise timing and the state-tax add-back; AMT paid on deferral items can generate a Minimum Tax Credit (Form 8801) usable in later years.",
        computed.usTax.amtUsd, ["§55", "Form 6251", "Form 8801"]);
    }

    // -- 4c2. FORM 2210 — UNDERPAYMENT PENALTY (90%-of-current-year safe
    // harbor only). The alternative 100%/110%-of-PRIOR-year safe harbor
    // needs last year's total tax, which isn't tracked (WISING is a
    // single-year snapshot) — so this can only ever say "you might owe a
    // penalty", never "you definitely do": meeting the prior-year safe
    // harbor instead would still avoid it.
    if (computed.usTax && model.meta.hasUsScope) {
      var us2210TotalTaxUsd = Math.max(0, (computed.usTax.totalTaxBeforeFtcUsd || 0) - (ftc.us.ftcAllowedUsd || 0));
      var us2210PaidUsd = model.taxesPaid.us.total.usd;
      var us2210SafeHarborUsd = us2210TotalTaxUsd * 0.9;
      var us2210BalanceDueUsd = us2210TotalTaxUsd - us2210PaidUsd;
      if (us2210BalanceDueUsd > 1000 && us2210PaidUsd < us2210SafeHarborUsd) {
        add("underpayment_2210", S.WARNING, C.CREDIT,
          "US estimated-tax underpayment penalty may apply (Form 2210)",
          "Withholding + estimated payments (" + usd(us2210PaidUsd) + ") fall short of 90% of this year's total US tax (" +
          usd(us2210SafeHarborUsd) + " of " + usd(us2210TotalTaxUsd) + "), with a balance due over the $1,000 de-minimis. " +
          "WISING only checks the 90%-of-CURRENT-year safe harbor — it does NOT check the alternative 100%/110%-of-PRIOR-year " +
          "safe harbor (needs last year's total tax, which isn't tracked), so meeting that instead could still avoid the penalty.",
          "Confirm last year's total tax against the 100%/110% prior-year safe harbor before assuming a penalty applies. If " +
          "neither safe harbor is met, Form 2210 computes the actual penalty using quarterly IRS underpayment rates.",
          Math.max(0, us2210BalanceDueUsd), ["Form 2210", "§6654"]);
      }
    }

    // -- 4c3. FORM 3921 — ISO INFORMATION RETURN -----------------------------
    if (model.equityComp && model.equityComp.isoExerciseCount > 0) {
      add("iso_3921", S.INFO, C.DOCUMENT,
        "ISO exercise(s) on file — employer owes you Form 3921",
        model.equityComp.isoExerciseCount + " incentive stock option exercise(s) recorded this year. The employer is " +
        "required to furnish Form 3921 (one per exercise) by January 31 of the following year, reporting the grant/exercise " +
        "dates, exercise price, and FMV at exercise — the same figures already driving the AMT preference computed above.",
        "Confirm Form 3921 was received from the employer for each exercise and that its FMV/exercise-price figures match " +
        "what's on file here before relying on the AMT number.",
        0, ["Form 3921", "§6039"]);
    }

    // -- 4c4. FORM 10-IEA — OLD-REGIME ELECTION (business/professional
    // income only; a once-in-a-lifetime election under s.115BAC(6)/s.202,
    // withdrawable only once). Company/firm entities file ITR-6/5 and don't
    // make this individual-regime election, so they're excluded.
    if (model.residency.india.taxRegime === "OLD" && (model.income.india.business.inr || 0) > 0 &&
        !model.entity.indiaIsCompany && !model.entity.indiaIsFirm) {
      add("form_10iea", S.WARNING, C.DOCUMENT,
        "Form 10-IEA required to elect the old regime with business/professional income",
        "The old tax regime is selected and business/professional (PGBP) income is on file. Unlike a salary-only filer, an " +
        "assessee with PGBP income can't just choose the old regime on the ITR itself — Form 10-IEA must be filed by the " +
        "s.139(1) due date, and once withdrawn from the old regime this way, old-regime eligibility is gone for good " +
        "except for those without PGBP income.",
        "File Form 10-IEA before the ITR due date. Confirm this taxpayer hasn't already exercised and withdrawn the " +
        "election in a prior year, which would make the old regime unavailable regardless of what's chosen this year.",
        0, ["Form 10-IEA", "s.115BAC(6)"]);
    }

    // -- 4c5. FORM 1099-DA AWARENESS — inferred from India-side VDA/crypto
    // activity, the only crypto signal anywhere in the model. This is
    // deliberately NOT a claim that a US Form 1099-DA obligation exists —
    // Indian-exchange-only crypto activity has no US broker involvement at
    // all. Framed as an awareness prompt, not a filing requirement.
    if (model.income.india.vdaSaleConsiderationInr > 0 && model.meta.hasUsScope) {
      add("form_1099da_awareness", S.INFO, C.DOCUMENT,
        "Crypto/VDA activity on file — check for US Form 1099-DA broker reporting",
        "Virtual digital asset transactions are recorded on the India side this year. If any of this activity (or other " +
        "crypto activity not entered here) ran through a US-regulated broker or exchange, that broker owes the taxpayer " +
        "Form 1099-DA — gross-proceeds reporting is mandatory for 2025 transactions, and basis reporting becomes mandatory " +
        "for covered assets from 1 Jan 2026. Indian-exchange-only activity has no US 1099-DA angle at all.",
        "Ask whether any crypto activity this year touched a US-based broker/exchange; if so, reconcile against the " +
        "1099-DA received before relying on the capital-gains figures shown elsewhere.",
        0, ["Form 1099-DA"]);
    }

    // -- 4c6. STATE INCOME TAX (CA / NY only) — a real, computed liability,
    // not just the disclosure-only "state residency isn't treaty-bound"
    // warning above (which fires even when no state tax has actually been
    // computed, e.g. no CA/NY residency facts on file, or a no-income-tax
    // state like TX/WA/FL). This finding only fires once computeUsStateTax
    // has actually resolved a CA or NY liability.
    if (computed.stateTax && computed.stateTax.totalTaxUsd > 0) {
      var st = computed.stateTax;
      add("state_income_tax", S.WARNING, C.CREDIT,
        st.stateName + " state income tax: " + usd(st.totalTaxUsd) + " (" + st.formName + ")",
        st.stateName + " taxes a full-year resident's WORLDWIDE income, including Indian-source income already reported " +
        "on the federal and Indian returns — computed here as " + usd(st.taxableIncomeUsd) + " of state taxable income " +
        "(federal AGI " + usd(st.agiUsd) + " less the " + st.stateName + " standard deduction" +
        (st.dependentExemptionUsd > 0 ? " and dependent exemption" : "") + ") at " + st.stateName + "'s own bracket rates" +
        (st.surchargeUsd > 0 ? ", plus " + usd(st.surchargeUsd) + " (" + st.surchargeLabel + ")" : "") +
        (st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? ", less " + usd(st.exemptionCreditUsd + st.dependentCreditUsd) + " of personal/dependent credits" : "") +
        ". Neither the Foreign Tax Credit computed above nor any DTAA relief applies here — " + st.stateName +
        " is not a party to the India-US treaty and " + (st.state === "CA" ? "grants no credit for tax paid to a foreign country at all." : "does not treat Indian tax as a creditable state-level offset."),
        "File " + st.formName + " alongside the federal return. This is a full-year-resident, TY2025-rates estimate — it does not " +
        "split state-source income for a part-year or nonresident allocation, does not model " + st.stateName +
        "'s own AGI addition/subtraction adjustments beyond the standard deduction" +
        (st.dependentExemptionUsd > 0 ? "/dependent exemption" : "") + ", and (for California) does not include the local-jurisdiction " +
        "SDI/VPDI payroll tax. Treat as directional, not filing-ready.",
        st.totalTaxUsd, [st.formName, st.stateName + " residency"]);
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

    // -- 4f2. ENTITY-LEVEL DUAL RESIDENCY — FOREIGN COMPANY, POEM IN INDIA --
    // An Indian-incorporated company is unconditionally India-resident
    // (place of incorporation controls) — POEM only matters for a company
    // that is NOT Indian-incorporated. The Layer 1 solver only reaches ROR
    // for such a company when its own POEM facts (board location, key
    // management location, director split) point to India — so if this
    // taxpayer is a company, is on file as NOT Indian-incorporated, and
    // still resolved to ROR, that resolution IS the POEM-in-India finding.
    // A foreign-incorporated company doesn't stop being resident wherever
    // it was incorporated just because India also claims it via POEM — this
    // is a genuine ENTITY-level double residency, distinct from (and not
    // resolved by) the individual Article 4 hierarchy, which doesn't apply
    // to companies the same way (Article 4(3) sends companies to competent-
    // authority mutual agreement instead of a mechanical tie-breaker).
    if (model.entity && model.entity.indiaIsCompany &&
        model.residency.india.isIndianCompanyFact === false &&
        res.india.status === CONST.INDIA_STATUS.ROR) {
      var cr = model.companyResidency || {};
      var poemFactors = [];
      if (cr.boardMeetingsOutsideIndia) poemFactors.push("board meets primarily outside India");
      if (cr.keyManagementLocation) poemFactors.push("key management location: " + cr.keyManagementLocation);
      if (cr.directorsInIndia || cr.directorsOutsideIndia) poemFactors.push(cr.directorsInIndia + " director(s) in India vs " + cr.directorsOutsideIndia + " outside");
      add("entity_dual_residency_poem", S.WARNING, C.TREATY,
        "Foreign-incorporated company with POEM in India — entity-level dual residency",
        "This company is on file as NOT incorporated in India, yet its Place of Effective Management facts" +
        (poemFactors.length ? " (" + poemFactors.join("; ") + ")" : "") +
        " resolve it to an Indian tax resident (worldwide income in scope) under s.6(3). Being incorporated elsewhere " +
        "means it doesn't stop being resident there either (most countries, including the US, use place-of-incorporation " +
        "as their own company-residency test) — so this entity is very likely resident in BOTH countries at once, with no " +
        "individual-style Article 4 hierarchy to mechanically resolve it.",
        "Confirm the other country's own company-residency test independently (place of incorporation alone is often " +
        "sufficient there) — if it also claims residency, this needs the treaty's company tie-breaker (competent-authority " +
        "mutual agreement under Article 4(3)), not a self-service test. Revisit the POEM facts too: 'mostly outside India' " +
        "board meetings alone isn't dispositive if commercial decisions are substantively made elsewhere.",
        0, ["DTAA Art. 4(3)", "s.6(3)", "POEM", "Mutual Agreement Procedure"]);
    }

    // -- 4g. CHAPTER XII-A (s.217/212) ELECTED — INVESTMENT INCOME CHECK --
    // s.217/212 give an NRI a concessional flat rate on specified foreign-
    // exchange assets: 20% on "investment income" (interest on a specified
    // debenture/deposit, dividend on specified shares) and 12.5% on LTCG
    // (raised from 10% by Budget 2024, alongside the general capital-gains
    // rate simplification) — no slab progression either way. And — the
    // easy-to-miss part — s.217 lets the taxpayer KEEP that regime even
    // after becoming resident again, for as long as the assets are held, by
    // filing the election each year.
    //
    // LTCG/STCG on specified LISTED EQUITY, DEBENTURES, and GOVERNMENT
    // SECURITIES (transactions marked "sold to a third party" — Layer 1
    // can't yet distinguish a market sale from a maturity redemption for
    // debentures/govt securities, and a real Tribunal precedent confirms
    // redemption isn't a taxable "transfer" at all) IS now correctly
    // reflected in the India tax computed below. Specified DEPOSITS never
    // generate capital gains (same redemption-isn't-a-transfer principle).
    // "Investment income" IS now also computed, from a per-holding field
    // on any SFEA-marked transaction — but since that's a manually-entered
    // figure per holding (not derived from dates/prices the way capital
    // gains are), a preparer forgetting to fill it in for a holding that
    // plausibly earned interest/dividend is a real, silent risk this
    // finding is specifically designed to catch.
    var xiiaHoldingCount = (model.income.india && model.income.india.chapterXiiaSfeaHoldingCount) || 0;
    var xiiaInvIncomeInr = (model.income.india && model.income.india.chapterXiiaInvestmentIncomeInr) || 0;
    if (model.treaty.chapterXiiaElected && xiiaHoldingCount === 0) {
      add("chapter_xiia_elected_no_holdings", S.WARNING, C.CREDIT,
        "Chapter XII-A elected, but no Financial Holdings transaction is marked as a specified foreign-exchange asset",
        "The Layer 1 Chapter XII-A election is on, but none of the Financial Holdings transactions on file are flagged " +
        "as \"Specified Foreign Exchange Asset (NRI)\" — s.217/212's flat-rate regime only applies to shares/debentures/" +
        "deposits/government securities actually purchased in convertible foreign exchange. Either a specified holding " +
        "exists but wasn't flagged (so its capital gains and investment income are being computed under ordinary rules " +
        "instead), or the election isn't actually needed this year.",
        "If a specified holding exists, mark it \"Specified Foreign Exchange Asset\" on its Financial Holdings entry so " +
        "it gets the correct s.217/212 treatment. If none exists, consider whether the election is still needed.",
        0, ["s.217", "s.212", "Chapter XII-A"]);
    } else if (model.treaty.chapterXiiaElected && xiiaHoldingCount > 0 && xiiaInvIncomeInr < 1) {
      add("chapter_xiia_investment_income_missing", S.WARNING, C.CREDIT,
        "Chapter XII-A elected, " + xiiaHoldingCount + " specified holding(s) on file — but no investment income entered for any of them",
        "The Layer 1 Chapter XII-A election is on, and " + xiiaHoldingCount + " Financial Holdings transaction(s) are marked as a " +
        "specified foreign-exchange asset — but none of them has an \"Investment Income This Year\" figure entered. A specified " +
        "debenture or deposit almost always earns some interest, and specified shares may pay dividends; if any of these holdings " +
        "did, that income is taxed at a flat 20% under s.217/212 (s.115E(1)(a)) — separate from, and in addition to, any capital " +
        "gains already reflected below.",
        "Check each specified holding for interest/dividend actually received this year and enter it in the \"Investment Income " +
        "This Year\" field — if genuinely none was received (e.g. a zero-coupon instrument still accruing, or shares that paid no " +
        "dividend), no action needed.",
        0, ["s.217", "s.212", "Chapter XII-A", "s.115E"]);
    } else if (model.treaty.chapterXiiaElected && xiiaInvIncomeInr > 0) {
      add("chapter_xiia_investment_income_computed", S.INFO, C.CREDIT,
        "Chapter XII-A investment income of " + inr(xiiaInvIncomeInr) + " included at the flat 20% rate",
        "Interest/dividend entered against your Chapter XII-A specified holdings (" + inr(xiiaInvIncomeInr) + " total) is taxed " +
        "at the flat 20% s.217/212 (s.115E(1)(a)) rate in the India tax computed below — no Chapter VI-A deductions or basic " +
        "exemption apply to this slice, per Chapter XII-A's own rules.",
        "Confirm this figure covers ALL specified holdings' interest/dividend for the year, not just some of them.",
        0, ["s.217", "s.212", "Chapter XII-A", "s.115E"]);
    }

    // -- 4g2. SPECIAL-RATE WINNINGS (s.128/194) — NOW COMPUTED ---------
    // Lottery/betting/online-gaming winnings are flat 30% with no basic
    // exemption, no Chapter VI-A deduction and no §156 rebate — this was
    // previously invisible to the whole model (not even in total income).
    // It's now correctly taxed and included in the FTC/double-tax base; the
    // remaining caveat is that a flat special rate doesn't necessarily match
    // whatever rate the US applies to the same winnings, which the FTC
    // limitation (built on an average-rate basis) can only approximate.
    var specialBBUsd = model.income.india.specialRate115bb ? model.income.india.specialRate115bb.usd : 0;
    if (specialBBUsd > 1) {
      add("special_rate_gaming_winnings", res.us.worldwide ? S.WARNING : S.INFO, C.INCOME,
        usd(specialBBUsd) + " of lottery/gaming winnings — flat 30% (s.128/194), no exemptions",
        "This income is taxed at a flat 30% with no basic exemption threshold, no Chapter VI-A deduction and no §156 " +
        "rebate — it's now included in the India tax total and the FTC/double-tax figures above." +
        (res.us.worldwide ? " Because the US taxes worldwide income, the same winnings are very likely also US-taxable " +
          "as ordinary income — a real double-tax exposure that the general FTC computation only approximates, since it " +
          "doesn't specifically match this flat 30% Indian rate against whatever ordinary rate the US applies to it." : ""),
        "Confirm US-side treatment of the same winnings separately from the general FTC computation — a flat-rate/" +
        "graduated-rate mismatch on the same income can leave a residual gap the average-rate FTC approximation misses.",
        specialBBUsd, ["s.128", "s.194"]);
    }

    // -- 4g3. UNEXPLAINED INCOME (s.195) — NOT REFLECTED IN THE COMPUTATION
    // s.195 is uniquely punitive and denies EVERY deduction, exemption, and
    // loss set-off outright — nothing else in the Act gets this treatment.
    // Rate note: Finance Act 2026 cut the base rate from 60% to 30% (the
    // ~78% effective rate — 60% + 25% surcharge + 4% cess — was the pre-
    // Tax-Year-2026-27 figure); the current effective rate is ~39% (30% tax
    // + 25% surcharge + 4% cess). Flagged rather than computed (unlike
    // s.128 above) because getting a provision this punitive wrong in
    // either direction is worse than leaving it explicit.
    if (model.income.india.unexplained115bbeInr > 0) {
      add("s115bbe_unexplained_income", S.CRITICAL, C.INCOME,
        "Unexplained income on file (s.195) — not reflected in the India tax computed above",
        "₹" + Math.round(model.income.india.unexplained115bbeInr).toLocaleString("en-IN") + " is recorded as unexplained " +
        "income under s.195. This carries a flat ~39% effective rate (30% tax + 25% surcharge + 4% cess, per Finance " +
        "Act 2026) and — unlike any other provision — denies every deduction, exemption, and loss set-off with no " +
        "exceptions. The India tax figure above does not include this; it needs to be added separately.",
        "Compute the s.195 addition separately at the full ~39% effective rate before relying on the India tax total " +
        "above, and confirm the source of these funds is genuinely unexplained rather than misclassified income that " +
        "belongs under a normal head.",
        0, ["s.195"]);
    }

    // -- 4g4. CARRY-FORWARD LOSSES — NOW ACTUALLY SET OFF --------------------
    // WISING sequences the real set-off (see computeLossSetOff in
    // computation.js) against this year's income under s.110/112/111/33(11),
    // using the per-entry eligibility Layer 1 already resolved. This finding
    // now reports what actually happened — applied vs. still carrying
    // forward — rather than a blanket "not applied" disclosure. Entity
    // (company/firm) taxpayers aren't covered (s.116 is a different regime
    // and lossSetOff isn't computed on that path), hence the guard below.
    var cfl = model.carryForwardLosses || {};
    var cflCount = (cfl.businessLossCfCount || 0) + (cfl.speculativeLossCfCount || 0) +
                   (cfl.stcgLossCfCount || 0) + (cfl.ltcgLossCfCount || 0) + (cfl.housePropertyLossCfCount || 0);
    var lso = computed.indiaTax && computed.indiaTax.lossSetOff;
    if (lso && (cfl.hasBroughtForwardLosses === true || cflCount > 0 || cfl.unabsorbedDepreciationCf > 0)) {
      var appliedParts = [];
      if (lso.used.businessInr > 1) appliedParts.push(inr(lso.used.businessInr) + " business loss vs. business income");
      if (lso.used.stcgSlabInr > 1) appliedParts.push(inr(lso.used.stcgSlabInr) + " STCG loss vs. slab-rate STCG (s.69 unlisted buy-back)");
      if (lso.used.stcgInr > 1) appliedParts.push(inr(lso.used.stcgInr) + " STCG loss vs. STCG");
      if (lso.used.ltcgFromStcgLossInr > 1) appliedParts.push(inr(lso.used.ltcgFromStcgLossInr) + " STCG loss vs. LTCG");
      if (lso.used.ltcgInr > 1) appliedParts.push(inr(lso.used.ltcgInr) + " LTCG loss vs. LTCG");
      if (lso.used.housePropertyInr > 1) appliedParts.push(inr(lso.used.housePropertyInr) + " house-property loss vs. house-property income");
      if (lso.used.unabsorbedDepreciationInr > 1) appliedParts.push(inr(lso.used.unabsorbedDepreciationInr) + " unabsorbed depreciation");

      var unusedParts = [];
      if (lso.unused.businessInr > 1) unusedParts.push(inr(lso.unused.businessInr) + " business loss (no business income left to absorb it)");
      if (lso.unused.stcgInr > 1) unusedParts.push(inr(lso.unused.stcgInr) + " STCG loss");
      if (lso.unused.ltcgInr > 1) unusedParts.push(inr(lso.unused.ltcgInr) + " LTCG loss");
      if (lso.unused.housePropertyInr > 1) unusedParts.push(inr(lso.unused.housePropertyInr) + " house-property loss");
      if (lso.unused.speculativeInr > 1) unusedParts.push(inr(lso.unused.speculativeInr) + " speculative loss (not modeled — see note)");
      if (lso.unused.unabsorbedDepreciationInr > 1) unusedParts.push(inr(lso.unused.unabsorbedDepreciationInr) + " unabsorbed depreciation");

      if (lso.totalUsedInr > 1 && lso.totalUnusedInr <= 1) {
        add("carry_forward_losses_not_applied", S.INFO, C.CREDIT,
          "Brought-forward losses fully set off this year",
          "All eligible prior-year losses were absorbed against this year's income: " + appliedParts.join("; ") +
          ". The India tax computed above already reflects this — no residual carry-forward remains.",
          "Confirm the set-off is reported correctly on Schedule CFL/BFLA of the ITR, matching the ordering above.",
          0, ["Loss carry-forward", "s.110", "s.112", "s.111"]);
      } else if (lso.totalUsedInr > 1) {
        add("carry_forward_losses_not_applied", S.WARNING, C.CREDIT,
          "Brought-forward losses partially set off — some still carrying forward",
          "Applied this year: " + appliedParts.join("; ") + ". Still carrying forward (no matching current-year income " +
          "to absorb it, or — for speculative loss — not modeled at all): " + unusedParts.join("; ") + ".",
          "Track the unused amounts on Schedule CFL for future years (subject to the 8-year limit, indefinite for " +
          "unabsorbed depreciation), and confirm speculative-income figures separately since WISING doesn't model that bucket.",
          0, ["Loss carry-forward", "s.110", "s.112", "s.111"]);
      } else {
        add("carry_forward_losses_not_applied", S.WARNING, C.CREDIT,
          "Brought-forward losses on file — none could be set off against this year's income",
          "Prior-year losses are recorded (" + unusedParts.join("; ") + "), but there is no matching current-year income " +
          "in the same head(s) to absorb any of it — the India tax computed above is correct as-is; these losses simply " +
          "carry forward untouched.",
          "Track these on Schedule CFL for a future year with matching income (subject to the 8-year limit for capital/" +
          "business losses, indefinite for unabsorbed depreciation).",
          0, ["Loss carry-forward", "s.110", "s.112", "s.111"]);
      }
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
    // Form 44 is a checkbox on the INDIA return — it requires real India
    // scope, not just US scope, on top of the existing income/tax check.
    // (a) hasUsScope alone wasn't enough: foreignSourceTotal can be nonzero
    // from India-side auto-hydration (e.g. taxable EPF interest folded into
    // "foreign-source interest" for a dual taxpayer's US return) even for a
    // taxpayer with zero actual US exposure (india_only_ca_client). (b) a
    // taxpayer with real US exposure but NO India return to file at all
    // (us_only_cpa_client) has no Form 44 to file either — India isn't
    // "the second country" for a US-only taxpayer, so requiring hasUsScope
    // alone still let this fire for her.
    if (model.meta.hasIndiaScope && model.meta.hasUsScope && (model.income.us.foreignSourceTotal.usd > 0 || model.taxesPaid.us.total.usd > 0)) {
      add("form67_required", S.INFO, C.DOCUMENT,
        "Form 44 — required for the Indian FTC claim",
        "Foreign income / foreign tax is present, so India requires Form 44 (with Schedule FSI and TR) on or before the ITR due date to allow FTC u/s 90/91.",
        "WISING flags Form 44 (with Schedule FSI/TR) as required on the filing checklist, using the FSI/TR figures already computed above — actually preparing and e-filing it on the income-tax portal ahead of the ITR due date is still a manual step.",
        0, ["Form 44", "Rule 128", "Schedule FSI", "Schedule TR"]);
    }

    // -- 6. TAX-YEAR / APPORTIONMENT MISMATCH ------------------------------
    // hasIndiaScope/hasUsScope (not the structural hasIndia/hasUs, which are
    // true for ANY profile since Layer 1's shell exists on both sides
    // regardless of real exposure) — apportioning a tax year across two
    // calendars is meaningless for a taxpayer who only has one calendar to
    // begin with.
    if (res.dualResident || (model.meta.hasIndiaScope && model.meta.hasUsScope)) {
      var ap = computed.apportionment;
      add("tax_year_mismatch", S.INFO, C.CREDIT,
        "Tax-year apportionment: Indian FY ↔ US CY (computed)",
        "India taxes Apr–Mar; the US taxes Jan–Dec. WISING splits the Indian FY across US calendar years — " +
        usd(ap.indiaToCyPrimaryUsd) + " into CY" + ap.cyPrimary + " and " + usd(ap.indiaToCyNextUsd) + " into CY" + ap.cyNext +
        " (" + ap.basis + ") — and apportions the US calendar year into the Indian FY (9/12 + 3/12).",
        "See the FY ↔ CY Apportionment panel on the Filings tab for the period-matched figures behind Form 44 (India) and " + usFtcForm(model) + " (US). Planning-grade — refine with per-transaction dates at filing.",
        0, [CONST.CALENDAR.INDIA_FY.label, CONST.CALENDAR.US_CY.label]);
    }

    // -- 7. FX BASIS MISMATCH ----------------------------------------------
    // Same scope gate — an FX conversion-basis caveat only means something
    // when amounts are actually being converted/compared cross-border.
    if (model.meta.hasIndiaScope && model.meta.hasUsScope) {
      add("fx_basis", S.INFO, C.CREDIT,
        "FX conversion basis is an approximation",
        "Cross-border amounts are normalized at a flat " + CONST.FX.INR_PER_USD +
        " INR/USD. Statutory FTC computations require the telegraphic-transfer buying rate on the relevant date (Rule 115 / SBI TTBR).",
        "Re-price each foreign income and tax item at the correct per-transaction rate before filing; the flat rate is for planning visibility only.",
        0, ["Rule 115", "SBI TTBR"]);
    }

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
        "No 5471 action needed at current ownership. WISING recomputes this every time you re-run the numbers, so update the ownership percentage in Layer 1 as soon as a purchase or reorganization changes it — this isn't monitored in the background.",
        0, ["Form 5471", "10% threshold"]);
    }

    // -- 9b. TRANSFER PRICING — related-party flag, not a price computation -
    // Same ownership fact as the CFC check above establishes these are
    // "associated enterprises"; not gated on res.us.isResident since s.92
    // applies to the Indian entity's own return regardless of the US
    // owner's current personal residency status. Deliberately amountUsd: 0
    // and no ALP computation — that needs a comparables/benchmarking study,
    // normally a separate specialist engagement even where the same advisor
    // prepares the income tax return. This is a "go check" flag, not a
    // quantified exposure.
    if (usOwnsForeignCorp) {
      add("transfer_pricing", S.WARNING, C.DOCUMENT,
        "Related-party cross-border transactions — transfer pricing documentation may apply",
        "Layer 1 records a related-party cross-border ownership link (US person owning ≥10% of a foreign/Indian corporation). " +
        "Any transactions between you and that related entity this year — service fees, cost allocations, loans, guarantees, " +
        "IP licensing — must be priced at arm's length under India's s.92-92F and the US's parallel §482 regime. WISING does " +
        "NOT evaluate whether pricing is arm's-length; it only flags that the relationship exists.",
        "If related-party cross-border transactions occurred this year, confirm Form 3CEB certification and Rule 10D " +
        "documentation requirements (India side) and §482 documentation (US side) with a transfer-pricing specialist — " +
        "penalties for missing documentation run 2% of transaction value, up to 200% for concealment.",
        0, ["s.92-92F", "Form 3CEB", "Rule 10D", "§482"]);
    }

    // -- 10. RETIREMENT ACCOUNT TREATMENT MISMATCH -------------------------
    if ((model.assets.epfInr > 0 || model.assets.ppfInr > 0 || model.assets.npsInr > 0) && res.us.isResident) {
      var epfInterestUsd = U.inrToUsd(model.assets.taxableEpfInterestInr || 0);
      var npsWithdrawalUsd = U.inrToUsd(model.assets.taxableNpsWithdrawalInr || 0);
      var hasQuantified = epfInterestUsd > 1 || npsWithdrawalUsd > 1;
      var quantifiedParts = [];
      if (epfInterestUsd > 1) quantifiedParts.push(usd(epfInterestUsd) + " of EPF interest");
      if (npsWithdrawalUsd > 1) quantifiedParts.push(usd(npsWithdrawalUsd) + " of NPS withdrawal");
      add("retirement_mismatch", S.WARNING, C.RETIREMENT,
        "Indian retirement accounts (EPF / PPF / NPS) are taxed differently by the US",
        "India treats EPF, PPF and NPS as tax-free (or lightly taxed). The US does not automatically agree: the IRS can tax " +
        "the interest these accounts earn every year, and may treat PPF like a trust that needs extra forms." +
        (hasQuantified ? " Layer 1 already records " + quantifiedParts.join(" and ") + " as taxable this year — WISING " +
          "has added that amount to the US taxable income and tax figures shown elsewhere on this page (as ordinary " +
          "foreign-source interest/pension), so it isn't just displayed here without effect." : ""),
        "WISING does NOT determine whether a specific account is a treaty-protected pension under DTAA Art. 20, or " +
        "whether PPF should be treated as a foreign trust requiring Form 3520/3520-A — those are legal/factual " +
        "determinations you need to make yourself; Form 3520 only appears on the filing checklist when the separate " +
        "PPF/EPF-plus-US-residency trigger fires, not because this specific check ran. Confirm the treaty-protection " +
        "question and trust classification before relying on the totals above.",
        epfInterestUsd + npsWithdrawalUsd, ["DTAA Art. 20", "Form 3520/3520-A", "FBAR"]);
    }

    // -- 10b. DEEMED DIVIDEND ON BUYBACK — CHARACTERIZATION MISMATCH --------
    // s.2(40)(f) applied ONLY to buy-backs between 1-Oct-2024 and 31-Mar-2026:
    // the FULL buyback consideration was taxed as a dividend at slab rates in
    // India, with the share's cost becoming a capital LOSS instead of
    // reducing the dividend. The US almost certainly characterized the same
    // cash differently — a buyback is ordinarily a capital transaction there
    // (capital gain/return of capital against basis, not dividend income).
    // Same cash, two different characters. Budget 2026 REVERSED this for
    // buy-backs on/after 1-Apr-2026 (Tax Year 2026-27 onward) — those are
    // capital gains in India too now (s.69), so this mismatch no longer
    // applies going forward; the gating below only fires for the narrow
    // historical window since only that window still lands in
    // deemedDividendBuyback (see normalize.js).
    var deemedDivUsd = model.income.india.deemedDividendBuyback ? model.income.india.deemedDividendBuyback.usd : 0;
    if (deemedDivUsd > 1 && res.us.worldwide) {
      add("deemed_dividend_buyback_mismatch", S.WARNING, C.INCOME,
        usd(deemedDivUsd) + " share buyback (Oct 2024 - Mar 2026 window) — India taxed it as dividend, the US likely as capital gain",
        "Under s.2(40)(f), buy-backs between 1-Oct-2024 and 31-Mar-2026 were taxed by India as the FULL consideration as " +
        "a deemed dividend at slab rates, with the shares' cost basis becoming a capital LOSS rather than reducing the " +
        "dividend. The US, by contrast, ordinarily treats a share buyback as a capital transaction — gain or loss " +
        "against the shares' cost basis, not dividend income. The same cash is very likely characterized differently " +
        "by each country, which can distort both the FTC basket (passive/dividend vs. capital gain) and the true " +
        "amount of relief available. (Budget 2026 reversed this for buy-backs on/after 1-Apr-2026 — see s.69 instead.)",
        "Don't assume the general FTC computation resolves this cleanly — confirm how the US side actually reports the " +
        "buyback (capital transaction vs. dividend) and reconcile the mismatch explicitly, including the capital loss " +
        "India allows on the extinguished shares, which the US computation won't mirror the same way.",
        deemedDivUsd, ["s.2(40)(f)", "Share buyback", "FTC basket"]);
    }

    // -- 10b2. PROMOTER ADDITIONAL TAX ON BUYBACK GAINS (s.69(2)(b)) --------
    // A promoter (>10% shareholder, or a Companies Act/SEBI-defined promoter)
    // pays ordinary LTCG/STCG tax on a buy-back gain PLUS an additional tax
    // that brings the combined rate to a fixed target (30% non-corporate,
    // 22% corporate), plus a 12% surcharge on just the additional tax. This
    // is a real, material extra tax burden that's easy to miss since it's
    // layered on top of — not instead of — the ordinary capital-gains tax
    // already shown elsewhere on the page.
    var pb = computed.indiaTax && computed.indiaTax.promoterBuyback;
    if (pb && pb.totalExtraTaxInr > 1) {
      add("promoter_buyback_additional_tax", S.WARNING, C.INCOME,
        "Promoter additional tax on buy-back gains — " + inr(pb.additionalTaxInr + pb.surchargeInr + pb.cessInr) + " on top of ordinary capital-gains tax",
        "As a promoter (s.69(2)(b)) on this buy-back, the ordinary " + (pb.ltcgGainInr > 0 ? "12.5% LTCG" : "20% STCG") +
        " tax on the gain is not the end of it: an additional tax brings the combined rate to " +
        Math.round(pb.targetRate * 100) + "% (" + (pb.isCorporatePromoter ? "corporate promoter" : "non-corporate promoter") +
        "), and a further 12% surcharge applies on that additional tax specifically — irrespective of total income. " +
        "Additional tax: " + inr(pb.additionalTaxInr) + "; surcharge: " + inr(pb.surchargeInr) + "; cess: " + inr(pb.cessInr) + ".",
        "Confirm promoter status (direct/indirect >10% shareholding, or Companies Act/SEBI promoter designation) is " +
        "correct before relying on this — the additional tax and surcharge do not apply to non-promoter shareholders " +
        "in the same buy-back at all.",
        U.inrToUsd(pb.totalExtraTaxInr), ["s.69(2)(b)", "Promoter additional tax", "Share buyback"]);
    }

    // -- 10b3. HOLDING-PERIOD CHARACTERIZATION MISMATCH ----------------------
    // India: unlisted shares/securities need >24 months held for LTCG (12
    // for listed). The US uses a flat >12 months for LTCG on any asset — no
    // listed/unlisted distinction. So an unlisted asset held 12-24 months is
    // short-term (India slab rate) but long-term (US preferential rate) —
    // same transaction, opposite character in each country. Two sources
    // feed this: unlisted share buy-backs (s.69), and foreign equity
    // holdings (e.g. US stocks — also always "unlisted" for Indian tax
    // purposes, since they're not on a recognized Indian exchange). Same
    // underlying rule either way. Computed straight from the same dates/
    // listed-flag Layer 1 already collects for the transaction, not a
    // second manual entry. The dollar figure below is a REAL recompute
    // (calls the actual computeUsTax twice, once per classification) — not
    // an estimate — so this is exactly as auditable as every other number
    // on the page, not a black-box severity score.
    var holdingMismatches = (model.income.india && model.income.india.holdingPeriodMismatches) || [];
    holdingMismatches.forEach(function (mm, mi) {
      var base = model.income.us || {};
      function withForeignCg(classification) {
        var clone = JSON.parse(JSON.stringify(model));
        clone.income.us.foreignLtcg = clone.income.us.foreignLtcg || { inr: 0, usd: 0 };
        clone.income.us.foreignStcg = clone.income.us.foreignStcg || { inr: 0, usd: 0 };
        if (classification === "ltcg") {
          clone.income.us.foreignLtcg.usd = (base.foreignLtcg ? base.foreignLtcg.usd : 0) + mm.gainUsd;
        } else {
          clone.income.us.foreignStcg.usd = (base.foreignStcg ? base.foreignStcg.usd : 0) + mm.gainUsd;
        }
        return WISING.computeInternals.computeUsTax(clone, computed.residency);
      }
      var asLtcg = withForeignCg("ltcg");
      var asStcg = withForeignCg("stcg");
      var deltaUsd = asStcg.totalTaxBeforeFtcUsd - asLtcg.totalTaxBeforeFtcUsd;
      if (Math.abs(deltaUsd) < 1) return; // no real rate difference at this taxpayer's bracket — not worth flagging
      var correctIsLtcg = mm.usClassification === "ltcg";
      var assetLabel = mm.sourceType === "buyback" ? "buy-back" : "foreign equity holding";
      // Listed LTCG is s.198 (STT-paid, exemption-eligible); unlisted/
      // foreign LTCG is s.197 (no exemption) — different section, same
      // 12.5% rate. Must not conflate the two in the citation.
      var ltcgSection = mm.isListed ? "s.198" : "s.197";
      add("holding_period_mismatch_" + mi, S.WARNING, C.TREATY,
        mm.companyName + " " + assetLabel + ": " + Math.round(mm.monthsHeld) + " months held — India says " + mm.indiaClassification.toUpperCase() +
        ", US says " + mm.usClassification.toUpperCase() + " (" + usd(Math.abs(deltaUsd)) + " at stake)",
        "This " + (mm.isListed ? "listed" : "unlisted") + " " + assetLabel + " was held " + Math.round(mm.monthsHeld) + " months. India requires " +
        "more than " + mm.indiaThresholdMonths + " months for LTCG on " + (mm.isListed ? "listed" : "unlisted") + " shares, so this is " +
        mm.indiaClassification.toUpperCase() + " there (taxed " + (mm.indiaClassification === "ltcg" ? "at 12.5%, " + ltcgSection + (mm.isListed ? " (₹1,25,000 exemption pool)" : " (no exemption, taxable from ₹1)") : (mm.isListed ? "at 20%, s.196" : "at your India slab rate")) +
        "). The US requires only more than 12 months for LTCG on any asset — no listed/unlisted distinction — so the SAME gain is " +
        mm.usClassification.toUpperCase() + " under US rules. Recomputed your actual US return both ways: treated as LTCG, US tax is " +
        usd(asLtcg.totalTaxBeforeFtcUsd) + "; treated as STCG (ordinary rates), US tax is " + usd(asStcg.totalTaxBeforeFtcUsd) + " — a difference of " +
        usd(Math.abs(deltaUsd)) + ".",
        correctIsLtcg
          ? "Report this gain as LONG-TERM on the US return (Schedule D) even though it's short-term in India — using India's " +
            "label on the US foreign-capital-gains input would cost roughly " + usd(Math.abs(deltaUsd)) + " in overpaid US tax."
          : "Report this gain as SHORT-TERM on the US return even though it's long-term in India — using India's label on the US " +
            "foreign-capital-gains input would understate US tax by roughly " + usd(Math.abs(deltaUsd)) + ".",
        Math.abs(deltaUsd), ["Holding period", ltcgSection + " vs IRC §1222", mm.sourceType === "buyback" ? "Share buyback" : "Foreign equity"]);
    });

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

    // -- 10b. ITR FORM MISMATCH — WISING's independent backend computation
    // vs Layer 1 India's own persisted recommendation (itr_recommendation.form,
    // when it ran). computeIndiaItrForm is the authoritative answer here
    // (see its own header comment for the concrete bugs found in Layer 1's
    // frontend calculator that motivate not trusting it alone) — a
    // disagreement is worth surfacing rather than silently picking one,
    // since it usually points to stale Layer 1 state or a real data gap.
    if (computed.indiaItrForm && computed.indiaItrForm.matchesFrontend === false) {
      var itrM = computed.indiaItrForm;
      add("india_itr_form_mismatch", S.WARNING, C.DOCUMENT,
        "ITR form disagreement: WISING computes " + itrM.form + ", Layer 1 says " + itrM.frontendForm,
        "WISING's own independent eligibility check (income thresholds, residency, capital gains, foreign assets/income, " +
        "crypto, house-property count, brought-forward losses, speculative/F&O income) computes " + itrM.form +
        ". Layer 1 India's own recommendation, last computed client-side, was " + itrM.frontendForm +
        " (\"" + (itrM.frontendExplanation || "no explanation on file") + "\"). Common causes: Layer 1's client-side check ran " +
        "before a later edit (its recommendation is only recomputed when the eligibility function re-runs, not on every " +
        "field change), or a genuine difference in what each side reads (see computeIndiaItrForm's header comment for three " +
        "confirmed Layer 1 field bugs this backend check deliberately doesn't inherit).",
        "Trust WISING's " + itrM.form + " unless you can identify a specific reason Layer 1's client-side check is right and " +
        "this backend computation is wrong — re-running Layer 1's eligibility check (revisit the Review/Summary step) after " +
        "any income or residency edit is the most common fix.",
        0, ["ITR eligibility", itrM.form, itrM.frontendForm]);
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
        "Confirm the donor's covered-expatriate status and compute the §2801 tax on Form 708, finalized January 2026 (TD 10027) " +
        "with the first return due 15 Jul 2027 for gifts/bequests received in calendar 2025; this is separate from and in " +
        "addition to the Form 3520 reporting above.",
        0, ["§2801", "Form 708", "Covered expatriate"]);
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
        0, ["RBI LRS", "TCS u/s 394(1)"]);
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

    // -- 12a. TRUMP ACCOUNT (§530A) MONITORING ------------------------------
    // New OBBBA custodial account for US-citizen children under 18 with an
    // SSN; contributions (other than the one-time federal seed) weren't
    // permitted before July 4, 2026. Always surface an info/warning note when
    // one is in use — this is a brand-new-in-2026 account type most preparers
    // haven't seen yet — and escalate to a real finding if the $5,000/child/
    // year cap (combined across all contributors) is breached.
    var trumpAcct = computed.limits.filter(function (g) { return g.id === "trump_account"; })[0];
    if (trumpAcct) {
      var taSeedEligible = model.limitsRaw.trumpAccountsSeedEligibleChildren || 0;
      var taSeedUsd = CONST.LIMITS.TRUMP_ACCOUNT_FEDERAL_SEED_USD;
      var seedNote = taSeedEligible > 0
        ? "A $" + taSeedUsd.toLocaleString("en-US") + " one-time federal seed contribution applies to the " + taSeedEligible +
          " child(ren) born 2025-2028 — separate from, and not counted against, the $5,000/year cap."
        : "No federal seed applies — that one-time $1,000 contribution is only for children born 2025-2028.";
      if (trumpAcct.status === "breached") {
        add("trump_account_contribution_limit", S.WARNING, C.LIMIT,
          "Trump Account (§530A) contribution cap exceeded",
          "Contributions of " + usd(trumpAcct.value) + " across " + Math.max(1, model.limitsRaw.trumpAccountsNumChildren || 1) +
          " child(ren) exceed the $5,000/child/year cap (combined across all contributors — parents, family, employer all draw " +
          "from the same limit). " + seedNote,
          "Excess contributions are not automatically rejected by the custodian in every case — verify the aggregate against " +
          "all contributors and consider a corrective withdrawal before the account's growth compounds on an over-contribution.",
          0, ["§530A", "Trump Account"]);
      } else {
        add("trump_account_contribution_limit", S.INFO, C.LIMIT,
          "Trump Account (§530A) in use",
          "Contributions of " + usd(trumpAcct.value) + " this year are within the $5,000/child/year cap. " + seedNote +
          " Contributions are nondeductible; account growth is tax-deferred until withdrawal, and the account converts to a " +
          "Traditional IRA when the beneficiary turns 18.",
          "No action needed while under the cap — just confirm contributions are tracked in aggregate across every contributor, " +
          "not just this taxpayer's own deposits.",
          0, ["§530A", "Trump Account"]);
      }
    }

    // -- 12b. EQUITY COMPENSATION — CROSS-BORDER SOURCING CONFLICT ----------
    // India's ESOP perquisite (s.17(1)(vi), taxed at exercise/allotment) and
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
        "for this year. India taxes the ESOP perquisite in full at exercise/allotment (s.17(1)(vi)); the US taxes RSU " +
        "vesting / NSO exercise in full as ordinary income in the vesting/exercise year. Absent a workday-based " +
        "allocation, the same equity award can be fully taxed by BOTH countries rather than apportioned to where the " +
        "services were actually performed during the vesting period.",
        "Reconstruct the vesting-period workday split between India and the US (DTAA Art. 15/16 dependent-personal-" +
        "services sourcing) so each country only taxes its proportionate share, then claim FTC/§159 relief on the " +
        "genuinely overlapping portion rather than the full award twice.",
        0, ["DTAA Art. 15", "s.17(1)(vi)", "RSU vesting", "NSO exercise"]);
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
        usd(recon.overlapUsd) + " is what the FTC / §159 relief resolves." +
        (recon.anyEstimate ? " Some heads are planning-grade estimates pending line-item inputs." : ""),
        "Open the Cross-Basis Reconciliation on the Filings tab to see each head on both bases, then relieve the overlap via " + usFtcForm(model) + " (US) / Form 44 (India).",
        recon.overlapUsd, ["DTAA", usFtcForm(model), "Form 44"]);
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
  // Sums s.44AB tax-audit turnover across Indian business entries, using the
  // same receipts field-fallback chain as computeBusinessEntryNetProfitInr /
  // presumptiveCeilingInr in normalize.js (gross receipts, else turnover,
  // else the scheme-specific digital+cash split) so this reads the same
  // numbers those functions already trust rather than a second guess at
  // field names. Returns the total and the cash-receipts share so the caller
  // can apply the ₹1cr / ₹10cr(≥95%-digital) threshold.
  function indiaBusinessTurnoverInr(entries) {
    var totalInr = 0, cashInr = 0;
    (entries || []).forEach(function (b) {
      var digital = U.num(b.digital_receipts_inr) + U.num(b.ada_digital_receipts_inr);
      var cash = U.num(b.cash_receipts_inr) + U.num(b.ada_cash_receipts_inr);
      var receipts = U.num(b.gross_receipts_inr) || U.num(b.turnover_inr) || (digital + cash);
      totalInr += receipts;
      cashInr += cash;
    });
    return { totalInr: totalInr, cashInr: cashInr };
  }

  function buildDocuments(model, computed) {
    var res = computed.residency;
    var triggers = {
      fincen_114: model.accounts.aggregatePeak.usd > CONST.LIMITS.FBAR_AGGREGATE_USD && res.us.isResident,
      form_8938: (function () {
        var g = computed.limits.filter(function (x) { return x.id === "form8938"; })[0];
        return !!g && g.status === "breached" && res.us.isResident;
      })(),
      // res.us.isResident is an individual-residency concept (SPT/citizenship)
      // that's meaningless for a corporation — a C-corp filer needs Form 1118
      // (see usFtcForm) whenever it paid Indian tax, regardless of that flag.
      form_1116: model.taxesPaid.india.total.usd > 0 &&
                 (res.us.isResident || (model.entity && model.entity.usReturnForm === "1120")),
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
      form_15ca_cb: model.limitsRaw.lrsRemittedInr > 0,
      // Schedule AL is an ITR-2/3 (individual/HUF) threshold rule — ITR-5/6
      // filers (firm/company) carry their own unconditional balance-sheet
      // requirement instead, so they're excluded here rather than double-
      // counted against the same ₹50L test.
      schedule_al: !model.entity.indiaIsCompany && !model.entity.indiaIsFirm &&
                   computed.indiaTax && computed.indiaTax.totalIncomeInr > 5000000,
      form_3cb_3cd: model.entity.indiaIsCompany || (function () {
        // A company is a statutory-audit case unconditionally (Companies Act,
        // independent of s.44AB turnover); an individual/firm business only
        // above the turnover threshold — checked from actual receipts below.
        var t = indiaBusinessTurnoverInr(model.assets.indianBusinesses);
        if (t.totalInr <= 0) return false;
        var atLeast95PctDigital = (t.cashInr / t.totalInr) <= 0.05;
        return t.totalInr > (atLeast95PctDigital ? 100000000 : 10000000);
      })(),
      // Mirrors the `trc` trigger — same underlying fact (a treaty benefit is
      // being claimed) but framed for the US side: obtaining IRS Form 6166
      // (via Form 8802) is the prerequisite step to producing the TRC/Form 41
      // paperwork the India side needs.
      form_8802: res.dualResident || model.treaty.treatyResidence !== "none" || model.treaty.usTreatyResidence !== "none",
      // amtUsd is already computed and shown elsewhere — this just promotes
      // it to a filing requirement instead of a citation buried in a finding.
      form_6251: !!(computed.usTax && computed.usTax.amtUsd > 0),
      form_8288: !!(model.nra && model.nra.usRealPropertyDisposed && (model.nra.firptaWithholdingUsd || 0) > 0),
      // Same ownership signal the CFC/Form 5471 check and the transfer_pricing
      // finding already trust — a real related-party cross-border link.
      form_3ceb: !!model.assets.usOwns10PctForeignCorp || (model.assets.usForeignCorps || []).length > 0,
      // Any India-side income implies a reconciliation obligation — these
      // aren't taxpayer-filed, so there's no narrower per-client fact to gate
      // on beyond "does this taxpayer have an India return at all".
      form_26as_ais_tis: model.meta.hasIndiaScope,
      form_16_16a: model.meta.hasIndiaScope,
      lrs_form_a2: model.limitsRaw.lrsRemittedInr > 0,
      // Same reasoning as form_16_16a: every US filer needs to know this
      // form exists ahead of the Apr 15 deadline, not just the ones who will
      // end up filing late (which isn't a fact WISING can know in advance).
      form_4868: model.meta.hasUsScope,
      form_540: !!(computed.stateTax && computed.stateTax.state === "CA"),
      form_it201: !!(computed.stateTax && computed.stateTax.state === "NY")
    };

    // Catalogue entries are static reference data — form_1116 is the only one
    // whose real-world form NUMBER (not just applicability) depends on who's
    // filing, so it's the only one that needs a per-client name/desc/why
    // override rather than just a trigger.
    var isForm1118 = model.entity && model.entity.usReturnForm === "1120";
    return CONST.DOCUMENTS.map(function (d) {
      var triggered = !!triggers[d.id];
      var name = d.name, desc = d.desc, why = d.why;
      if (d.id === "form_1116" && isForm1118) {
        name = "IRS Form 1118 (Foreign Tax Credit — Corporations)";
        desc = "Claims credit for income tax paid to India against US corporate tax liability.";
        why = "This C-corp paid Indian income tax on income that is also taxable in the US. C-corps file Form 1118, not the individual/estate/trust Form 1116.";
      }
      return {
        id: d.id,
        jurisdiction: d.jurisdiction,
        name: name,
        desc: desc,
        why: why,
        severity: d.severity,
        required: triggered,
        status: triggered ? "required" : "not_triggered"
      };
    });
  }

  /* Trace helpers — attach to every dashboard row so the UI can pop open a
   * "where did this come from" panel. "source" = pulled from Layer 1 with no
   * material computation; "calc" = a formula over other already-shown
   * numbers (parts are {label, amount} in the row's own currency, or
   * {label, display} for a non-currency operand like a rate).
   *
   * citation (optional, both kinds): a dated pointer to the external rule
   * this trace relied on — e.g. a CBDT/IRS form or threshold that was
   * verified against a live source rather than derived purely from numbers
   * already on screen. Omit it for pure internal computation; only rules
   * that could go stale (they change on a yearly notification/Finance Act
   * cycle) should carry one, so its presence itself signals "this needs
   * periodic re-verification," not "everything here is externally sourced." */
  function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
  function source(detail, citation) { return { kind: "source", detail: detail, citation: citation || null }; }
  function holdings(section, note) { return { kind: "holdings", section: section, note: note || null }; }

  /* Turns a computation.js bracketBreakdown() array into trace `parts` — one
   * line per bracket actually reached, so a "slab tax" row shows the real
   * ladder instead of a vague description. */
  function bracketParts(breakdown, fmt) {
    // Federal US and India slab rates are all whole percentages, but state
    // brackets (NY 4.5%/5.25%/6.85%..., CA 9.3%/10.3%/11.3%/12.3%) are not —
    // Math.round(rate*100) silently collapsed 4.5%/5.25% to the same "5%".
    // parseFloat(...toFixed(2)) keeps up to 2 decimals but drops trailing
    // zeros, so integer rates still print as plain "10%", not "10.00%".
    function pctLabel(rate) { return (parseFloat((rate * 100).toFixed(2))) + "%"; }
    return (breakdown || []).map(function (b) {
      var label = b.to === Infinity
        ? pctLabel(b.rate) + " above " + fmt(b.from)
        : pctLabel(b.rate) + " on " + fmt(b.from) + "–" + fmt(b.to);
      return { label: label, amount: b.tax };
    });
  }

  /* Turns a computeS115aStream() result into trace `parts` — one line per
   * actual DTAA election (article, amount, which rate won and why) plus a
   * final line for whatever wasn't covered by any election, so the s.207
   * rows show the real per-election math instead of a claimed/uncaptured
   * summary with no detail on individual elections. */
  function s115aParts(stream, fmt) {
    var parts = (stream.elections || []).map(function (e) {
      var artTxt = e.article ? " (" + e.article + ")" : "";
      var label;
      if (e.outcome === "denied_no_docs") {
        label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " denied — TRC/Form 41 missing, domestic " + Math.round(e.domesticRate * 100) + "% applies instead";
      } else if (e.outcome === "elected_rate_applied") {
        label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " @ " + Math.round(e.rateApplied * 100) + "% treaty rate (beats " + Math.round(e.domesticRate * 100) + "% domestic)";
      } else {
        label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " — domestic " + Math.round(e.domesticRate * 100) + "% still wins over the " + Math.round(e.electedRate * 100) + "% elected rate";
      }
      return { label: label, amount: e.taxInr };
    });
    if (stream.uncapturedInr > 1) {
      parts.push({ label: "No election covers " + fmt(stream.uncapturedInr) + " — taxed @ " + Math.round(stream.domesticRate * 100) + "% domestic default", amount: stream.uncapturedTaxInr });
    }
    return parts;
  }

  /* Same idea as s115aParts, but for computeNrInterestTreatment()'s result —
   * only the elections that actually got carved OUT of slab income (the
   * comparison is against a marginal slab rate, not a flat domestic one, so
   * there's no single "domestic rate" to quote). */
  function nrInterestParts(nrInterest, fmt) {
    return (nrInterest.elections || []).filter(function (e) { return e.carvedOut; }).map(function (e) {
      var artTxt = e.article ? " (" + e.article + ")" : "";
      return {
        label: "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " @ " + Math.round(e.electedRate * 100) + "% treaty rate (beats the " + fmt(e.marginalSlabTaxInr) + " it would have cost at the marginal slab rate)",
        amount: e.treatyTaxInr
      };
    });
  }

  /* ------------------------------------------------------------------------
   * buildFtcReport — flatten the FTC computation into a dashboard table.
   * ----------------------------------------------------------------------*/
  function buildFtcReport(model, computed) {
    var ftc = computed.ftc, indiaTax = computed.indiaTax, usTax = computed.usTax;
    var feieRows = ftc.us.feieExcludedUsd > 0
      ? [
          { label: "Less FEIE-excluded wages (§911)", usd: -ftc.us.feieExcludedUsd,
            trace: source("The §911 Foreign Earned Income Exclusion amount claimed on Layer 1 US (Form 2555). Excluded income leaves the FTC computation entirely — §911(d)(6) no-double-dip.") },
          { label: "Indian tax disallowed on excluded income", usd: -ftc.us.indiaTaxDisallowedUsd,
            trace: calc("Total Indian tax × (FEIE-excluded wages ÷ gross Indian-source income) — the slice of Indian tax attributable to income the US isn't taxing at all can't be credited", [
              { label: "Total India tax (USD)", amount: indiaTax.totalTaxUsd },
              { label: "FEIE-excluded wages", amount: ftc.us.feieExcludedUsd },
              { label: "Gross Indian-source income (US view)", amount: model.income.india.total.usd }
            ]) }
        ]
      : [];
    return {
      direction_us_claims_india: {
        title: "US " + usFtcForm(model) + " — credit for Indian taxes",
        rows: feieRows.concat([
          { label: "Indian income tax (creditable)", usd: ftc.us.indiaTaxPaidUsd,
            trace: calc("Total India tax × creditable fraction (gross Indian income less any FEIE-excluded slice, over gross Indian income)", [
              { label: "Total India tax (from Tax Computation)", amount: indiaTax.totalTaxUsd },
              { label: "Creditable fraction", display: Math.round((indiaTax.totalTaxUsd > 0 ? ftc.us.indiaTaxPaidUsd / indiaTax.totalTaxUsd : 1) * 100) + "%" }
            ]) },
          { label: "Foreign-source income (US view)", usd: ftc.us.foreignSourceIncomeUsd,
            trace: holdings("india", ftc.us.feieExcludedUsd > 0 ? ("Net of the " + usd(ftc.us.feieExcludedUsd) + " FEIE-excluded wages shown in the row above.") : null) },
          { label: "US taxable income", usd: ftc.us.taxableIncomeUsd,
            trace: calc("Same figure as \"Taxable income\" in the Tax Computation card above", [
              { label: "US taxable income", amount: ftc.us.taxableIncomeUsd }
            ]) },
          { label: "US income tax (pre-credit)", usd: ftc.us.usIncomeTaxUsd,
            trace: calc("Ordinary-rate tax + preferential LTCG/QDI tax only — NIIT, Additional Medicare, SE tax and AMT are excluded, they're not creditable against foreign tax by statute", [
              { label: "Ordinary-rate tax", amount: usTax.ordinaryTaxUsd },
              { label: "Preferential LTCG/QDI tax", amount: usTax.preferentialTaxUsd }
            ]) },
          { label: "FTC limitation = US tax × foreign/taxable", usd: ftc.us.ftcLimitUsd,
            trace: calc("§904(a): the credit can't exceed US tax on this income times the same proportion foreign-source income bears to total taxable income", [
              { label: "US income tax (pre-credit)", amount: ftc.us.usIncomeTaxUsd },
              { label: "Foreign-source income", amount: ftc.us.foreignSourceIncomeUsd },
              { label: "US taxable income", amount: ftc.us.taxableIncomeUsd }
            ]) },
          { label: "FTC allowed this year", usd: ftc.us.ftcAllowedUsd, emphasis: true,
            trace: calc("Lesser of Indian tax paid and the §904 limitation", [
              { label: "Indian income tax (creditable)", amount: ftc.us.indiaTaxPaidUsd },
              { label: "FTC limitation", amount: ftc.us.ftcLimitUsd }
            ]) },
          { label: "Excess credit carried over (§904(c))", usd: ftc.us.carryoverUsd,
            trace: calc("Indian tax paid in excess of what the §904 limitation allows this year — carries back 1 year / forward 10 years", [
              { label: "Indian income tax (creditable)", amount: ftc.us.indiaTaxPaidUsd },
              { label: "Less FTC allowed this year", amount: -ftc.us.ftcAllowedUsd }
            ]) },
          { label: "Residual double tax (unrelieved)", usd: ftc.us.residualDoubleTaxUsd, warn: true,
            trace: calc("Same as the excess credit carried over — until it's actually used in a future year this is double taxation the credit hasn't relieved yet", [
              { label: "Excess credit carried over", amount: ftc.us.carryoverUsd }
            ]) }
        ])
      },
      direction_india_relief: {
        title: "India §159 relief — for US taxes on doubly-taxed income",
        rows: [
          { label: "US-source income (foreign, India view)", usd: ftc.india.foreignSourceIncomeUsd,
            trace: holdings("us", ftc.india.foreignSourceIncomeUsd === 0 ? "Only counted when the taxpayer is India ROR (worldwide taxation) — zero here because that isn't the case." : null) },
          { label: "US tax on that US-source income", usd: ftc.india.usTaxOnUsSourceUsd,
            trace: calc("US income tax × (US-source income ÷ total US income) — the slice of US tax attributable to income India also taxes", [
              { label: "US income tax (pre-credit)", amount: usTax.incomeTaxUsd },
              { label: "US-source income", amount: usTax.usSourceIncomeUsd },
              { label: "Total US income", amount: usTax.totalIncomeUsd }
            ]) },
          { label: "Indian tax on the doubly-taxed income (cap)", usd: ftc.india.reliefCapUsd,
            trace: calc("Total India tax × (US-source income ÷ total India-view income) — s.159 relief can never exceed the Indian tax actually attributable to that income", [
              { label: "Total India tax", amount: indiaTax.totalTaxUsd },
              { label: "US-source income (India view)", amount: ftc.india.foreignSourceIncomeUsd },
              { label: "Total India-view income", amount: indiaTax.totalIncomeUsd }
            ]) },
          { label: "§90 relief allowed", usd: ftc.india.reliefAllowedUsd, emphasis: true,
            trace: calc("Lesser of the US tax on that income and the Indian-tax cap", [
              { label: "US tax on the doubly-taxed income", amount: ftc.india.usTaxOnUsSourceUsd },
              { label: "Indian tax cap", amount: ftc.india.reliefCapUsd }
            ]) }
        ]
      },
      headlineNetDoubleTaxUsd: ftc.netUnrelievedDoubleTaxUsd
    };
  }

  /* ------------------------------------------------------------------------
   * buildTaxComputation — flatten the India & US computed liabilities into
   * dashboard-ready breakdown tables (transparency behind the FTC numbers).
   * ----------------------------------------------------------------------*/
  function buildTaxComputation(model, computed) {
    var i = computed.indiaTax, u = computed.usTax;
    var T = CONST.TAX.INDIA;
    var dedIndia = (model.deductions && model.deductions.india) || {};

    // The India "by-head" total shown in Holdings is GROSS LTCG (pre-s.198
    // exemption); Tax Computation uses the exemption-adjusted figure. That's
    // the only legitimate gap between the two views (verified: every other
    // income head sums identically) — surfaced as a note on the Holdings-link
    // rows below rather than silently landing on a "different" total.
    var ltcgGrossInrForNote = (model.income && model.income.india && model.income.india.ltcg && model.income.india.ltcg.inr) || 0;
    var ltcgExemptGapInr = Math.max(0, ltcgGrossInrForNote - (i.ltcgTaxableInr || 0));
    var indiaHoldingsNote = ltcgExemptGapInr > 1
      ? ("Holdings shows gross LTCG before the s.198 exemption — ₹" + Math.round(ltcgExemptGapInr).toLocaleString("en-IN") + " of LTCG is exempt here, so this figure is that much lower.")
      : null;

    // Brought-forward loss set-off breakdown (s.112/110/111/33(11)) — shown as
    // explicit "before -> deductions -> after" rows so the set-off is never a
    // silent adjustment buried inside "Gross total income".
    var lso = i.lossSetOff;
    var cfl = model.carryForwardLosses || {};
    var LOSS_ROW_DEFS = [
      { key: "businessInr", label: "  — brought-forward business loss set off (s.112)", availableKey: "businessLossAvailableInr", rule: "Set off only against business income (s.112)" },
      { key: "housePropertyInr", label: "  — brought-forward house-property loss set off (s.110)", availableKey: "housePropertyLossAvailableInr", rule: "Set off only against house-property income (s.110) — unlike current-year HP loss, brought-forward HP loss can't go inter-head" },
      { key: "stcgSlabInr", label: "  — brought-forward STCG loss set off vs current slab-rate STCG (s.111, s.69 unlisted buy-back)", availableKey: "stcgLossAvailableInr", rule: "STCG loss is set off against slab-rate STCG first — it's the more tax-expensive bucket to leave un-offset (s.111)" },
      { key: "stcgInr", label: "  — brought-forward STCG loss set off vs current STCG (s.111)", availableKey: "stcgLossAvailableInr", rule: "STCG loss is set off against current STCG first (s.111)" },
      { key: "ltcgFromStcgLossInr", label: "  — brought-forward STCG loss set off vs current LTCG (s.111)", availableKey: "stcgLossAvailableInr", rule: "Any STCG loss left after offsetting current STCG can still offset LTCG (s.111)" },
      { key: "ltcgInr", label: "  — brought-forward LTCG loss set off vs current LTCG (s.111)", availableKey: "ltcgLossAvailableInr", rule: "LTCG loss can only offset LTCG, never STCG (s.111)" },
      { key: "unabsorbedDepreciationInr", label: "  — unabsorbed depreciation set off (s.33(11))", availableKey: "unabsorbedDepreciationCf", rule: "No time limit; can offset any head except salary (s.33(11))" }
    ];
    var indiaGrossRows = (lso && lso.totalUsedInr > 1) ? [
      { label: "Current-year income (before brought-forward loss set-off)", inr: i.grossTotalIncomeInr + lso.totalUsedInr,
        trace: holdings("india", indiaHoldingsNote) }
    ].concat(LOSS_ROW_DEFS.filter(function (d) { return lso.used[d.key] > 1; }).map(function (d) {
      return { label: d.label, inr: -lso.used[d.key],
        trace: calc(d.rule + " — amount used is the lesser of the loss available and the current-year income in that bucket", [
          { label: "Brought-forward loss available", amount: cfl[d.availableKey] || 0 },
          { label: "Amount actually set off this year", amount: lso.used[d.key] }
        ]) };
    })).concat([
      { label: "Gross total income (after brought-forward loss set-off)", inr: i.grossTotalIncomeInr,
        trace: calc("Current-year income before set-off, less all brought-forward losses set off above", [
          { label: "Before set-off", amount: i.grossTotalIncomeInr + lso.totalUsedInr },
          { label: "Less: total losses set off", amount: -lso.totalUsedInr }
        ]) }
    ]) : [
      { label: "Gross total income", inr: i.grossTotalIncomeInr,
        trace: holdings("india", indiaHoldingsNote) }
    ];
    var indiaLossCarryRow = (lso && lso.totalUnusedInr > 1) ? [
      { label: "Losses carried forward to future years (could not be set off this year)", inr: lso.totalUnusedInr,
        trace: calc("Brought-forward losses left over after set-off — different loss categories can only offset specific income heads (s.112/110/111/33(11)), so a category with no matching income this year carries forward untouched (8 years for most heads, no limit for unabsorbed depreciation)", [
          { label: "Total unused this year", amount: lso.totalUnusedInr }
        ]) }
    ] : [];

    var dedTrace = i.regime === "NEW"
      ? calc("New regime allows only the employer's NPS contribution under s.124(2) — s.123/126/124(1B)/153 etc. are not available", [
          { label: "Employer NPS contribution (s.124(2))", amount: dedIndia.s80CCD2_employer || 0 }
        ])
      : calc("Old regime: s.123 (cap ₹1.5L) + s.124(1B) NPS (cap ₹50k) + s.126 health insurance (cap ₹75k) + employer NPS s.124(2) (uncapped) + s.153 savings interest (cap ₹10k)", [
          { label: "s.123 (capped ₹1.5L)", amount: Math.min(dedIndia.s80C || 0, T.DEDUCTION_CAPS_OLD.s80C) },
          { label: "s.124(1B) NPS (capped ₹50k)", amount: Math.min(dedIndia.s80CCD1B || 0, T.DEDUCTION_CAPS_OLD.s80CCD1B) },
          { label: "s.126 health insurance (capped ₹75k)", amount: Math.min(dedIndia.s80D || 0, T.DEDUCTION_CAPS_OLD.s80D_self + T.DEDUCTION_CAPS_OLD.s80D_parents_senior) },
          { label: "Employer NPS s.124(2)", amount: dedIndia.s80CCD2_employer || 0 },
          { label: "s.153 savings interest (capped ₹10k)", amount: Math.min(dedIndia.s80TTA_TTB || 0, 10000) }
        ]);

    var rebateCap = i.regime === "NEW" ? T.REBATE_87A_NEW.maxRebate : T.REBATE_87A_OLD.maxRebate;
    var s115aTraces = i.s115a ? ["dividend", "royalty", "fts"].filter(function (k) {
      return i.s115a[k] && i.s115a[k].totalInr > 1;
    }).map(function (k) {
      var s = i.s115a[k];
      return { label: "  — of which s.207 " + k + " @ " + Math.round(s.effectiveRate * 100) + "% effective", inr: s.taxInr,
        trace: calc("Total " + k + " income of " + inr(s.totalInr) + " under s.207 — each DTAA election (s.159) is taxed at whichever is LOWER of the domestic default or the elected treaty rate, and only when TRC/Form 41 are on file; anything not covered by a valid election falls back to the domestic default",
          s115aParts(s, inr)) };
    }) : [];
    var nrInterestTrace = (i.nrInterest && i.nrInterest.carvedOutInr > 1) ? [
      { label: "  — of which DTAA-carved-out interest (Art 11) taxed separately", inr: i.nrInterest.carvedOutTaxInr,
        trace: calc("Ordinary NRO interest is slab-rate income for a non-resident by default (s.207's concessional rate doesn't actually cover it — that's narrowly limited to foreign-currency-borrowing interest). A specific claimed amount can still be carved out and taxed at the flat treaty rate instead of slab rates, but only when TRC/Form 41 are on file AND it's actually cheaper than the marginal slab rate on that slice (s.159)",
          nrInterestParts(i.nrInterest, inr)) }
    ] : [];
    var ltcg197Trace = ((i.ltcg197TaxableInr || 0) > 1) ? [
      { label: "  — of which s.197 LTCG @ 12.5% (no exemption)", inr: (i.ltcg197TaxableInr || 0) * T.LTCG_112A_RATE,
        trace: calc("Same 12.5% rate as s.198, but NO ₹1,25,000 exemption — that's textually specific to s.198's listed/STT-paid gains and doesn't pool with s.197, so this whole amount is taxable from the first rupee. Fed by: unlisted buy-back gains, foreign-equity gains (e.g. US stocks), unlisted bonds without STT, non-equity-oriented/non-specified mutual funds (debt MF acquired pre-Apr-2023, 35-65%-equity hybrid funds, international/FoF funds no longer meeting s.50AA's specified-fund test), and Chapter XII-A specified listed equity/debentures/government securities sold to a third party (s.115E's LTCG rate has no exemption either, unlike ordinary s.198) — all held >24 months, or >12 months for a listed bond, specified debenture/govt security, or specified listed equity", [
          { label: "s.197 LTCG (after loss set-off)", amount: i.ltcg197TaxableInr || 0 },
          { label: "Tax @ 12.5%, no exemption", amount: (i.ltcg197TaxableInr || 0) * T.LTCG_112A_RATE }
        ]) }
    ] : [];
    var vdaTrace = ((i.vdaGainInr || 0) > 1) ? [
      { label: "  — of which s.115BBH VDA/crypto @ 30% flat", inr: i.vdaTaxInr || 0,
        trace: calc("Virtual digital assets (crypto) are taxed at a flat 30% on positive gains only — no LTCG/STCG distinction, no holding-period threshold, no exemption or indexation, and crucially NO loss set-off is allowed at all, not even against a gain from a different VDA in the same year, and no carry-forward. Any losing VDA transaction is simply excluded, never netted against a gain", [
          { label: "VDA gains (losses excluded, never netted)", amount: i.vdaGainInr || 0 },
          { label: "Tax @ 30% flat", amount: i.vdaTaxInr || 0 }
        ]) }
    ] : [];

    return {
      india: {
        title: i.isEntity ? ("India income tax — " + i.regime) : ("India income tax (" + i.regime + " regime)"),
        currency: "INR",
        rows: indiaGrossRows.concat([
          { label: "Chapter VI-A deductions", inr: -i.deductionsInr, trace: dedTrace },
          { label: "Total income", inr: i.totalIncomeInr,
            trace: calc("Gross total income less Chapter VI-A deductions", [
              { label: "Gross total income", amount: i.grossTotalIncomeInr },
              { label: "Less Chapter VI-A deductions", amount: -i.deductionsInr }
            ]) },
          { label: "Tax at slab rates", inr: i.slabTaxInr,
            trace: calc("Progressive slab-rate tax under the " + i.regime + " regime, applied to ₹" + Math.round(i.totalNormalInr).toLocaleString("en-IN") + " of normal-rate income (salary, house property, business, other sources" + (i.nrInterest ? " — including ordinary NRO interest, which is slab-rate income by default; only a DTAA-beneficial slice is carved out separately below" : "") + ", after Chapter VI-A deductions and brought-forward loss set-off). Capital gains and other special-rate income are taxed separately, not at slab rates.",
              bracketParts(i.slabBreakdown, inr)) },
          { label: "Tax on special-rate income (196/197/198 gains + 115BBH VDA + 128/194 winnings" + (i.s115a ? " + s.207 dividend/royalty/FTS" : "") + (i.nrInterest && i.nrInterest.carvedOutInr > 1 ? " + DTAA-carved-out interest" : "") + ")", inr: i.specialTaxInr,
            trace: calc("s.196 STCG @ 20% + s.198 LTCG @ 12.5% (listed/STT-paid, net of the ₹1,25,000 exemption) + s.197 LTCG @ 12.5% (unlisted/foreign — no exemption, separate section, does not pool with s.198's threshold) + s.115BBH VDA/crypto @ 30% flat (no set-off, ever) + s.128/194 lottery/betting/gaming winnings @ 30% flat, no exemption" + (i.s115a ? " + s.207 dividend/royalty/FTS at their own rates" : "") + (i.nrInterest && i.nrInterest.carvedOutInr > 1 ? " + any DTAA-carved-out interest at its treaty rate" : "") + " (each broken out below)", []) }
        ]).concat(nrInterestTrace).concat(ltcg197Trace).concat(vdaTrace).concat(s115aTraces).concat([
          { label: "Less §156 rebate", inr: -i.rebateInr,
            trace: calc("Only for a resident individual (not NR, not HUF/AOP/BOI/trust) whose normal-rate income is at or below the threshold — lesser of tax at slab rates and the statutory cap", [
              { label: "Statutory rebate cap", amount: rebateCap },
              { label: "Rebate actually allowed", amount: i.rebateInr }
            ]) },
          { label: "Surcharge", inr: i.surchargeInr,
            trace: calc("Progressive surcharge (10%/15%/25%/37% bands by total income) on tax before cess, with marginal relief so the tax increase never exceeds the income increase over the threshold; capital-gains/dividend-type special-rate income is capped at a 15% surcharge rate", [
              { label: "Surcharge", amount: i.surchargeInr }
            ]) },
          { label: "Health & education cess (4%)", inr: i.cessInr,
            trace: calc("4% of (tax after rebate + surcharge)", [
              { label: "Tax after §156 rebate", amount: i.slabTaxInr - i.rebateInr + i.specialTaxInr },
              { label: "Surcharge", amount: i.surchargeInr },
              { label: "Cess rate", display: "4%" }
            ]) },
          { label: "Total India tax", inr: i.totalTaxInr, emphasis: true,
            trace: calc("Tax at slab rates + tax on special-rate income − §156 rebate + surcharge + cess", [
              { label: "Tax at slab rates", amount: i.slabTaxInr },
              { label: "Tax on special-rate income", amount: i.specialTaxInr },
              { label: "Less §156 rebate", amount: -i.rebateInr },
              { label: "Surcharge", amount: i.surchargeInr },
              { label: "Cess", amount: i.cessInr }
            ]) }
        ]).concat(indiaLossCarryRow),
        totalUsd: i.totalTaxUsd,
        effectiveRate: i.effectiveRate
      },
      us: u.isNra ? {
        title: "US federal tax — Form 1040-NR (ECI graduated / FDAP flat)",
        currency: "USD",
        rows: [
          { label: "ECI (wages + net self-employment)", usd: u.nra.eciUsd,
            trace: source("Effectively Connected Income — US wages + net self-employment earnings, entered on Layer 1 US.") },
          { label: "Less itemized deductions (no standard deduction for NRAs)", usd: -u.deductionUsd,
            trace: source("NRAs cannot claim the standard deduction (with narrow treaty exceptions) — itemized deductions from Layer 1 US only.") },
          { label: "Taxable ECI", usd: u.taxableIncomeUsd,
            trace: calc("ECI less itemized deductions", [
              { label: "ECI", amount: u.nra.eciUsd },
              { label: "Less itemized deductions", amount: -u.deductionUsd }
            ]) },
          { label: "Tax on ECI (graduated brackets)", usd: u.nra.eciTaxUsd,
            trace: calc("Progressive federal brackets (10%-37%, same ladder as a resident filer) applied to $" + Math.round(u.nra.taxableEciUsd).toLocaleString("en-US") + " of taxable ECI",
              bracketParts(u.nra.eciBracketBreakdown, usd)) },
          { label: "FDAP (interest/dividends/rental, Schedule NEC)", usd: u.nra.fdapUsd,
            trace: source("Fixed, Determinable, Annual or Periodical income — US-source passive income entered on Layer 1 US, taxed on a gross basis (no deductions).") },
          { label: "Tax on FDAP (flat " + Math.round(u.nra.fdapRate * 100) + "%, no deductions)", usd: u.nra.fdapTaxUsd,
            trace: calc("FDAP × flat rate (30% statutory default, or a lower treaty rate if a valid W-8BEN treaty claim is on file)", [
              { label: "FDAP income", amount: u.nra.fdapUsd },
              { label: "Rate applied", display: Math.round(u.nra.fdapRate * 100) + "%" }
            ]) },
          { label: "Additional Medicare tax", usd: u.additionalMedicareUsd,
            trace: source("Computed directly on Layer 1 US (Form 8959) and taken as-is — the engine does not recompute it.") },
          { label: "Total US tax (pre-FTC)", usd: u.totalTaxBeforeFtcUsd, emphasis: true,
            trace: calc("Tax on ECI + tax on FDAP + Additional Medicare tax", [
              { label: "Tax on ECI", amount: u.nra.eciTaxUsd },
              { label: "Tax on FDAP", amount: u.nra.fdapTaxUsd },
              { label: "Additional Medicare tax", amount: u.additionalMedicareUsd }
            ]) }
        ],
        totalUsd: u.totalTaxBeforeFtcUsd,
        effectiveRate: u.effectiveRate
      } : (function () {
        // The US "by-head" total in Holdings is gross, pre-FEIE. When the gap
        // between it and this engine's total income is fully explained by the
        // §911 exclusion (the only known legitimate reason they'd differ),
        // link straight to Holdings instead of re-deriving the same numbers;
        // otherwise fall back to a plain formula so a click never lands on a
        // Holdings figure that looks unexplainably different.
        var usHoldingsTotalUsd = (model.income && model.income.us && model.income.us.total && model.income.us.total.usd) || 0;
        var feieAppliedUsd = (u.feie && u.feie.appliedUsd) || 0;
        var usGapExplainedByFeie = Math.abs((usHoldingsTotalUsd - u.totalIncomeUsd) - feieAppliedUsd) < 1;
        var totalIncomeTrace = usGapExplainedByFeie
          ? holdings("us", feieAppliedUsd > 0 ? ("Holdings shows gross foreign wages before the §911 FEIE exclusion (" + usd(feieAppliedUsd) + " excluded here), so this figure is that much lower.") : null)
          : calc("Ordinary income (wages + business/self-employment + interest + non-qualified dividends + STCG + rental + pension" + (u.worldwide ? ", foreign amounts included since this is worldwide taxation" : "") + ") + preferential income (LTCG + qualified dividends)", [
              { label: "Ordinary income", amount: u.ordinaryIncomeUsd },
              { label: "Preferential income (LTCG/QDI)", amount: u.preferentialIncomeUsd }
            ]);
        return {
        title: u.isEntity ? ("US federal tax — " + u.filingStatus) : ("US federal income tax (" + u.filingStatus.toUpperCase() + ")"),
        currency: "USD",
        rows: [
          { label: "Total income" + (u.worldwide ? " (worldwide)" : " (US-source)"), usd: u.totalIncomeUsd,
            trace: totalIncomeTrace }
        ]
          .concat((u.retirementEpfInterestUsd > 0) ? [{ label: "  — of which taxable EPF interest (India retirement a/c, worldwide taxation)", usd: u.retirementEpfInterestUsd,
            trace: source("Entered directly on Layer 1 India → Other Sources → \"Taxable EPF interest\". Included here because worldwide taxation applies to this taxpayer.") }] : [])
          .concat((u.retirementNpsWithdrawalUsd > 0) ? [{ label: "  — of which taxable NPS withdrawal (India retirement a/c, worldwide taxation)", usd: u.retirementNpsWithdrawalUsd,
            trace: source("Entered directly on Layer 1 India → Other Sources → \"Taxable NPS withdrawal\". Included here because worldwide taxation applies to this taxpayer.") }] : [])
          .concat([
            { label: "Adjusted gross income", usd: u.agiUsd,
              trace: calc("Total income less above-the-line adjustments (student-loan interest, capped at $2,500, + half of self-employment tax)", [
                { label: "Total income", amount: u.totalIncomeUsd },
                { label: "Less adjustments", amount: -(u.totalIncomeUsd - u.agiUsd) }
              ]) },
            { label: "Less " + u.deductionMode + " deduction", usd: -u.deductionUsd,
              trace: calc(u.deductionMode === "standard"
                ? "Standard deduction for filing status " + u.filingStatus.toUpperCase() + " — used because it exceeds (or the taxpayer elected) itemizing"
                : "Itemized: SALT (capped at " + usd(u.saltCapUsd) + " — OBBBA's $40,000 cap, phased down 30¢/$1 of AGI over $500,000, floored at the old $10,000) + mortgage interest + charitable + medical expenses over 7.5% of AGI — used because it exceeds (or the taxpayer elected) the standard deduction", [
                { label: "Deduction used", amount: u.deductionUsd }
              ]) }
          ])
          .concat(u.seniorDeductionUsd > 0 ? [{ label: "Less senior deduction (OBBBA §70103, age 65+)", usd: -u.seniorDeductionUsd,
            trace: calc("$6,000 for a taxpayer age 65+ by year end (TY2025-2028, temporary), on top of the standard/itemized deduction either way, phased out 6¢/$1 of AGI over " + usd(u.seniorDetail.phaseoutThresholdUsd) + ". Only the primary taxpayer's age is known — Layer 1 collects no spouse DOB, so a second $6,000 for an also-65+ spouse isn't modeled.", [
              { label: "Taxpayer age", display: u.seniorDetail.age + " years" },
              { label: "Full amount before phase-out", amount: u.seniorDetail.fullAmountUsd },
              { label: "Senior deduction after phase-out", amount: u.seniorDeductionUsd }
            ]) }] : [])
          .concat(u.tipsDeductionUsd > 0 ? [{ label: "Less \"no tax on tips\" deduction (OBBBA, 2025-2028)", usd: -u.tipsDeductionUsd,
            trace: calc("Lesser of qualified tip income (already included in Box 1 wages above) or the $" + Math.round(u.tipsOvertimeDetail.tipsMaxUsd).toLocaleString("en-US") + " flat cap, less $100 per $1,000 of AGI over " + usd(u.tipsOvertimeDetail.phaseoutThresholdUsd) + ". Not available at all to MFS filers.", [
              { label: "Qualified tip income (Box 1 subset)", amount: u.tipsOvertimeDetail.qualifiedTipsUsd },
              { label: "Flat cap", amount: u.tipsOvertimeDetail.tipsMaxUsd },
              { label: "Less phase-out reduction", amount: -u.tipsOvertimeDetail.phaseoutReductionUsd },
              { label: "Tips deduction after phase-out", amount: u.tipsDeductionUsd }
            ]) }] : [])
          .concat(u.overtimeDeductionUsd > 0 ? [{ label: "Less \"no tax on overtime\" deduction (OBBBA, 2025-2028)", usd: -u.overtimeDeductionUsd,
            trace: calc("Lesser of qualified FLSA §7 overtime premium pay (already included in Box 1 wages above) or the $" + Math.round(u.tipsOvertimeDetail.overtimeMaxUsd).toLocaleString("en-US") + " cap (filing status " + u.filingStatus.toUpperCase() + "), less $100 per $1,000 of AGI over " + usd(u.tipsOvertimeDetail.phaseoutThresholdUsd) + ". Not available at all to MFS filers.", [
              { label: "Qualified overtime premium (Box 1 subset)", amount: u.tipsOvertimeDetail.qualifiedOvertimeUsd },
              { label: "Cap for this filing status", amount: u.tipsOvertimeDetail.overtimeMaxUsd },
              { label: "Less phase-out reduction", amount: -u.tipsOvertimeDetail.phaseoutReductionUsd },
              { label: "Overtime deduction after phase-out", amount: u.overtimeDeductionUsd }
            ]) }] : [])
          .concat(u.qbiDeductionUsd > 0 ? [{ label: "Less §199A QBI deduction", usd: -u.qbiDeductionUsd,
            trace: calc("20% of qualified business income (Sch C/S-corp/partnership pass-through), capped at 20% of (taxable income less net capital gains); phased out for specified service trades above the SSTB income threshold", [
              { label: "QBI deduction", amount: u.qbiDeductionUsd }
            ]) }] : [])
          .concat([
            { label: "Taxable income", usd: u.taxableIncomeUsd,
              trace: calc("AGI less deduction" + (u.seniorDeductionUsd > 0 ? " less senior deduction" : "") + (u.tipsDeductionUsd > 0 ? " less tips deduction" : "") + (u.overtimeDeductionUsd > 0 ? " less overtime deduction" : "") + (u.qbiDeductionUsd > 0 ? " less §199A QBI deduction" : ""), [
                { label: "AGI", amount: u.agiUsd },
                { label: "Less deduction", amount: -u.deductionUsd }
              ].concat(u.seniorDeductionUsd > 0 ? [{ label: "Less senior deduction", amount: -u.seniorDeductionUsd }] : [])
                .concat(u.tipsDeductionUsd > 0 ? [{ label: "Less tips deduction", amount: -u.tipsDeductionUsd }] : [])
                .concat(u.overtimeDeductionUsd > 0 ? [{ label: "Less overtime deduction", amount: -u.overtimeDeductionUsd }] : [])
                .concat(u.qbiDeductionUsd > 0 ? [{ label: "Less QBI deduction", amount: -u.qbiDeductionUsd }] : [])) },
            { label: "Ordinary-rate tax", usd: u.ordinaryTaxUsd,
              trace: calc("Progressive federal brackets (10%-37%, filing status " + u.filingStatus.toUpperCase() + ") applied to $" + Math.round(u.ordinaryTaxableUsd).toLocaleString("en-US") + " of ordinary taxable income (taxable income less the LTCG/QDI portion, which is taxed separately below)",
                bracketParts(u.ordinaryBracketBreakdown, usd)) },
            { label: "Preferential LTCG/QDI tax", usd: u.preferentialTaxUsd,
              trace: calc("0%/15%/20% long-term capital gains brackets, stacked on top of ordinary taxable income", [
                { label: "Preferential LTCG/QDI tax", amount: u.preferentialTaxUsd }
              ]) },
            { label: "Net investment income tax (NIIT, §1411)", usd: u.niitUsd,
              trace: u.niitUsd > 0 && u.niitDetail
                ? calc("3.8% × NIIT base (see breakdown below)", [
                    { label: "NIIT base", amount: u.niitDetail.excessUsd },
                    { label: "Rate", display: "3.8%" }
                  ])
                : calc("Zero — either no net investment income, or MAGI doesn't exceed the filing-status threshold", []) }
          ])
          .concat(u.niitUsd > 0 && u.niitDetail ? [
            { label: "  — net investment income (interest/div/cap gains/rental)", usd: u.niitDetail.netInvestmentIncomeUsd,
              trace: source("Interest + dividends + capital gains + rental income (foreign-source included when worldwide taxation applies) — from the income already itemized on Layer 1 India/US.") },
            { label: "  — MAGI", usd: u.niitDetail.magiUsd,
              trace: calc("Equal to AGI in this engine's model (no foreign-earned-income-exclusion add-back scenario is modeled)", [
                { label: "AGI", amount: u.agiUsd }
              ]) },
            { label: "  — less filing-status threshold", usd: -u.niitDetail.thresholdUsd,
              trace: source("Statutory NIIT threshold by filing status (§1411(b)) — $200,000 single/HoH, $250,000 MFJ, $125,000 MFS. Not indexed for inflation.") },
            { label: "  — NIIT base (lesser of NII and MAGI-over-threshold) @ " + (u.niitDetail.rate * 100).toFixed(1) + "%", usd: u.niitDetail.excessUsd,
              trace: calc("Lesser of net investment income and (MAGI − threshold)", [
                { label: "Net investment income", amount: u.niitDetail.netInvestmentIncomeUsd },
                { label: "MAGI over threshold", amount: Math.max(0, u.niitDetail.magiUsd - u.niitDetail.thresholdUsd) }
              ]) }
          ] : [])
          .concat([
            { label: "Additional Medicare tax", usd: u.additionalMedicareUsd,
              trace: source("Computed directly on Layer 1 US (Form 8959) and taken as-is — the engine does not recompute it.") }
          ])
          .concat(u.seTaxUsd > 0 ? [{ label: "Self-employment tax (Schedule SE)", usd: u.seTaxUsd,
            trace: calc("92.35% of net SE earnings × (12.4% Social Security, capped by the wage base less W-2 SS wages already taxed, + 2.9% Medicare, uncapped); half of this is an above-the-line deduction", [
              { label: "Self-employment tax", amount: u.seTaxUsd }
            ]) }] : [])
          .concat(u.amtUsd > 0 && u.amtDetail ? [
            { label: "Alternative Minimum Tax (§55)", usd: u.amtUsd,
              trace: calc("Tentative minimum tax minus regular tax, when positive (see breakdown below)", [
                { label: "Tentative minimum tax", amount: u.amtDetail.tmtUsd },
                { label: "Less regular tax", amount: -u.amtDetail.regularTaxUsd }
              ]) },
            { label: "  — AMTI (taxable income + standard/SALT addback + preference items)", usd: u.amtDetail.amtiUsd,
              trace: calc("Taxable income + disallowed-deduction addback (the full standard deduction, or just the SALT slice if itemized) + AMT preference items (e.g. the ISO exercise bargain-element spread, §56(b)(3))", [
                { label: "Taxable income", amount: u.taxableIncomeUsd },
                { label: "Addback (standard deduction or SALT)", amount: u.amtDetail.addbackUsd },
                { label: "AMT preference items", amount: u.amtDetail.amtiUsd - u.taxableIncomeUsd - u.amtDetail.addbackUsd }
              ]) },
            { label: "  — less AMT exemption (phased out above threshold)", usd: -u.amtDetail.exemptionUsd,
              trace: calc("Full statutory exemption reduced 25¢ for every $1 of AMTI above the phase-out threshold", [
                { label: "Full exemption", amount: u.amtDetail.exemptionFullUsd },
                { label: "AMTI", amount: u.amtDetail.amtiUsd },
                { label: "Exemption after phase-out", amount: u.amtDetail.exemptionUsd }
              ]) },
            { label: "  — AMT base", usd: u.amtDetail.amtBaseUsd,
              trace: calc("AMTI less the (phased-out) exemption", [
                { label: "AMTI", amount: u.amtDetail.amtiUsd },
                { label: "Less exemption", amount: -u.amtDetail.exemptionUsd }
              ]) },
            { label: "  — tentative minimum tax (26%/28% ordinary + LTCG/QDI at preferential rates)", usd: u.amtDetail.tmtUsd,
              trace: calc("26% (28% above the AMT rate breakpoint) on the ordinary AMT base (AMT base less any LTCG/QDI, which keep their preferential rates) + preferential-rate tax on the LTCG/QDI portion", [
                { label: "Ordinary AMT base", amount: u.amtDetail.ordinaryAmtBaseUsd },
                { label: "Tax on ordinary AMT base", amount: u.amtDetail.tmtOrdUsd },
                { label: "Preferential-rate tax (LTCG/QDI, same as above)", amount: u.preferentialTaxUsd }
              ]) },
            { label: "  — less regular tax (AMT owed = excess of TMT over this)", usd: -u.amtDetail.regularTaxUsd,
              trace: calc("Same as ordinary-rate tax + preferential LTCG/QDI tax shown above", [
                { label: "Ordinary-rate tax", amount: u.ordinaryTaxUsd },
                { label: "Preferential LTCG/QDI tax", amount: u.preferentialTaxUsd }
              ]) }
          ] : [])
          .concat(u.otherCreditsUsd > 0 ? [{ label: "Less other non-refundable credits (care/AOTC/LLC)", usd: -u.otherCreditsUsd,
            trace: calc("Child/dependent care credit (20% of qualifying expenses, capped) + American Opportunity + Lifetime Learning education credits (both phased out by MAGI) — capped at the tax otherwise due", [
              { label: "Credits", amount: u.otherCreditsUsd }
            ]) }] : [])
          .concat(u.ctcDetail && u.ctcDetail.availableUsd > 0 ? [{ label: "Less Child Tax Credit (§24)", usd: -(u.ctcDetail.nonRefundableUsd + u.ctcDetail.refundableUsd),
            trace: calc("$2,200/child (TY2025-2028, OBBBA), phased out $50 per $1,000 of AGI over the threshold. The portion that doesn't fit against tax owed is refundable (Additional CTC) up to $1,700/child, capped at 15% of earned income over $2,500. \"Children\" here reuses the same dependents count as the care/AOTC credits above — Layer 1 doesn't separately track qualifying-child ages.", [
              { label: "Number of children (Layer 1 dependents count)", display: String(u.ctcDetail.numChildren) },
              { label: "Max CTC before phase-out", amount: u.ctcDetail.maxTotalUsd },
              { label: "Phase-out reduction", amount: -u.ctcDetail.phaseoutReductionUsd },
              { label: "Non-refundable (offsets tax)", amount: u.ctcDetail.nonRefundableUsd },
              { label: "Refundable (Additional CTC)", amount: u.ctcDetail.refundableUsd }
            ]) }] : [])
          .concat([{ label: "Total US tax (pre-FTC)", usd: u.totalTaxBeforeFtcUsd, emphasis: true,
            trace: calc("Income tax (ordinary + preferential) + NIIT + Additional Medicare tax + SE tax + AMT − non-refundable credits", [
              { label: "Income tax (ordinary + preferential)", amount: u.incomeTaxUsd },
              { label: "NIIT", amount: u.niitUsd },
              { label: "Additional Medicare tax", amount: u.additionalMedicareUsd },
              { label: "SE tax", amount: u.seTaxUsd },
              { label: "AMT", amount: u.amtUsd },
              { label: "Less credits", amount: -u.creditsUsd }
            ]) }]),
        totalUsd: u.totalTaxBeforeFtcUsd,
        effectiveRate: u.effectiveRate
      };
      })(),
      usState: (function () {
        var st = computed.stateTax;
        if (!st) return null;
        return {
          title: st.stateName + " state income tax (" + st.formName + ", " + st.filingStatus.toUpperCase() + ")",
          currency: "USD",
          rows: [
            { label: "Federal AGI (starting point)", usd: st.agiUsd,
              trace: source("Same federal AGI computed above — " + st.stateName + " taxes a full-year resident's worldwide income, so no separate state-source recomputation is done.") },
            { label: "Less " + st.stateName + " standard deduction", usd: -st.standardDeductionUsd,
              trace: source(st.stateName + "'s own standard deduction for " + st.filingStatus.toUpperCase() + " — separate from, and smaller than, the federal one.") }
          ].concat(st.dependentExemptionUsd > 0 ? [
            { label: "Less NY dependent exemption ($1,000/dependent)", usd: -st.dependentExemptionUsd,
              trace: source("NY dropped the personal exemption for filer/spouse decades ago; only the $1,000-per-dependent exemption survives.") }
          ] : []).concat([
            { label: "State taxable income", usd: st.taxableIncomeUsd,
              trace: calc("Federal AGI less the state standard deduction" + (st.dependentExemptionUsd > 0 ? " and dependent exemption" : ""), [
                { label: "Federal AGI", amount: st.agiUsd },
                { label: "Less standard deduction", amount: -st.standardDeductionUsd }
              ].concat(st.dependentExemptionUsd > 0 ? [{ label: "Less dependent exemption", amount: -st.dependentExemptionUsd }] : [])) },
            { label: "Tax at " + st.stateName + " bracket rates", usd: st.bracketTaxUsd,
              trace: calc("Progressive " + st.stateName + " brackets applied to $" + Math.round(st.taxableIncomeUsd).toLocaleString("en-US") + " of state taxable income",
                bracketParts(st.bracketBreakdown, usd)) }
          ]).concat(st.surchargeUsd > 0 ? [
            { label: st.surchargeLabel, usd: st.surchargeUsd,
              trace: calc("1% of state taxable income over $1,000,000 — this threshold is NOT doubled for MFJ", [
                { label: "State taxable income over $1,000,000", amount: Math.max(0, st.taxableIncomeUsd - 1000000) },
                { label: "Surcharge @ 1%", amount: st.surchargeUsd }
              ]) }
          ] : []).concat((st.exemptionCreditUsd + st.dependentCreditUsd) > 0 ? [
            { label: "Less personal/dependent exemption credit", usd: -(st.exemptionCreditUsd + st.dependentCreditUsd),
              trace: source("California's personal exemption credit ($153 single/MFS/HOH, $307 MFJ) plus $475 per dependent — a credit against tax, not a deduction from income.") }
          ] : []).concat([
            { label: "Total " + st.stateName + " tax", usd: st.totalTaxUsd, emphasis: true,
              trace: calc("Bracket tax" + (st.surchargeUsd > 0 ? " + surcharge" : "") + (st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? " − exemption/dependent credits" : ""), [
                { label: "Bracket tax", amount: st.bracketTaxUsd },
                { label: "Surcharge", amount: st.surchargeUsd },
                { label: "Less credits", amount: -(st.exemptionCreditUsd + st.dependentCreditUsd) }
              ]) }
          ]),
          totalUsd: st.totalTaxUsd,
          effectiveRate: st.effectiveRate,
          basis: st.basis
        };
      })()
    };
  }

  /* ------------------------------------------------------------------------
   * buildWithholdingSummary — every income stream subject to a treaty-
   * dependent withholding rate, on both sides, broken out row by row: gross
   * amount, domestic default rate, treaty-elected rate (if any), whether the
   * supporting documentation is actually on file, the rate ACTUALLY being
   * applied as a result, and the real dollar/rupee cost of any gap between
   * "what you're paying" and "what you'd pay with the paperwork filed" —
   * computed directly from the same election data computeIndiaTax/
   * computeUsTax already produced, not re-estimated. Every number here
   * already exists elsewhere in the engine; this just re-surfaces it in one
   * dedicated, income-stream-first view instead of scattered across
   * multiple findings.
   * ----------------------------------------------------------------------*/
  function buildWithholdingSummary(model, computed) {
    var i = computed.indiaTax, u = computed.usTax;
    var indiaRows = [];
    var indiaTotalGapInr = 0;

    function pushS115aRows(streamKey, label, citation) {
      var stream = i.s115a && i.s115a[streamKey];
      if (!stream) return;
      (stream.elections || []).forEach(function (e, idx) {
        var docsOk = e.outcome !== "denied_no_docs";
        // If docs were missing, the amount was taxed at the domestic rate
        // instead of the (better) elected rate — the gap is the exact
        // difference on that slice, not an estimate.
        var gapInr = (!docsOk && e.electedRate != null && e.electedRate < e.domesticRate)
          ? e.appliedAmountInr * (e.domesticRate - e.electedRate) : 0;
        indiaTotalGapInr += gapInr;
        indiaRows.push({
          id: streamKey + "_election_" + idx, jurisdiction: "IN", category: "treaty_gap", label: label + (e.article ? " (" + e.article + ")" : ""),
          grossInr: e.appliedAmountInr, domesticRatePct: e.domesticRate * 100,
          treatyRatePct: e.electedRate != null ? e.electedRate * 100 : null,
          docsOk: docsOk, rateAppliedPct: e.rateApplied * 100, taxInr: e.taxInr, gapInr: gapInr,
          note: docsOk ? null : "TRC/Form 41 missing — treaty rate denied, domestic rate applied instead",
          citation: citation
        });
      });
      if ((stream.uncapturedInr || 0) > 1) {
        indiaRows.push({
          id: streamKey + "_unclaimed", jurisdiction: "IN", category: "treaty_gap", label: label + " — unclaimed (no treaty election on file)",
          grossInr: stream.uncapturedInr, domesticRatePct: stream.domesticRate * 100, treatyRatePct: null,
          docsOk: null, rateAppliedPct: stream.domesticRate * 100, taxInr: stream.uncapturedTaxInr, gapInr: 0,
          note: "Not a documentation gap — no treaty rate was ever claimed for this slice, so there's nothing to deny",
          citation: citation
        });
      }
    }
    pushS115aRows("dividend", "Dividend", "s.207 / s.159");
    pushS115aRows("royalty", "Royalty", "s.207 / s.159");
    pushS115aRows("fts", "Fees for Technical Services", "s.207 / s.159");

    if (i.nrInterest) {
      (i.nrInterest.elections || []).forEach(function (e, idx) {
        var docsOk = e.outcome !== "denied_no_docs";
        var counterfactualTreatyTaxInr = e.electedRate != null ? e.appliedAmountInr * e.electedRate : null;
        var gapInr = (!docsOk && counterfactualTreatyTaxInr != null && counterfactualTreatyTaxInr < e.marginalSlabTaxInr)
          ? e.marginalSlabTaxInr - counterfactualTreatyTaxInr : 0;
        indiaTotalGapInr += gapInr;
        var actualTaxInr = docsOk && e.carvedOut ? e.treatyTaxInr : e.marginalSlabTaxInr;
        indiaRows.push({
          id: "nrInterest_election_" + idx, jurisdiction: "IN", category: "treaty_gap", label: "NRO Interest" + (e.article ? " (" + e.article + ")" : ""),
          grossInr: e.appliedAmountInr, domesticRatePct: null, // no flat domestic rate — slab-based by default
          treatyRatePct: e.electedRate != null ? e.electedRate * 100 : null,
          docsOk: docsOk, rateAppliedPct: e.appliedAmountInr > 0 ? (actualTaxInr / e.appliedAmountInr) * 100 : null,
          taxInr: actualTaxInr, gapInr: gapInr,
          note: docsOk ? null : "TRC/Form 41 missing — treaty carve-out denied, taxed at marginal slab rate instead",
          citation: "Art 11(2)(b), s.159"
        });
      });
    }

    // -- GENERAL WITHHOLDING — every taxpayer, resident or not ---------------
    // The rows above only exist for NR/NRA taxpayers electing a treaty rate.
    // These rows show ordinary TDS/withholding that applies regardless of
    // residency: salary TDS, property-sale TDS, W-2 federal/state withholding.
    var wd = model.withholdingDetail || { india: { propertyTds: [] }, us: {} };

    if ((wd.india.tdsAggregateInr || 0) > 1) {
      indiaRows.push({
        id: "tds_aggregate", jurisdiction: "IN", category: "general", label: "TDS Already Deducted (Aggregate — Form 26AS)",
        grossInr: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxInr: wd.india.tdsAggregateInr, gapInr: 0,
        note: "Single aggregate figure — Layer 1 doesn't capture a per-source breakdown of income type or rate for this amount",
        citation: "s.199"
      });
    }
    // s.194-IA (resident seller, 1%, ≥₹50L) vs s.195 (NR seller, no floor,
    // rate set by the AO/treaty) — same buyer-withholding mechanism, two
    // different sections depending on the seller's residency status.
    var isNrSellerForPropertyTds = model.residency.india.status === CONST.INDIA_STATUS.NR;
    (wd.india.propertyTds || []).forEach(function (p, idx) {
      var rateAppliedPct = p.saleConsiderationInr > 0 ? (p.tdsInr / p.saleConsiderationInr) * 100 : null;
      indiaRows.push({
        id: "property_tds_" + idx, jurisdiction: "IN", category: "general",
        label: "Property Sale TDS — " + p.propertyType + (p.saleDate ? " (" + p.saleDate + ")" : ""),
        grossInr: p.saleConsiderationInr || null, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: rateAppliedPct, taxInr: p.tdsInr, gapInr: 0,
        note: isNrSellerForPropertyTds ? "Buyer-withheld on sale proceeds from an NR seller" : "Buyer-withheld on sale proceeds from a resident seller",
        citation: isNrSellerForPropertyTds ? "s.195" : "s.194-IA"
      });
    });

    // TCS (Ch. XVII-BB, s.206C) — a DIFFERENT mechanism from everything
    // above: collected on money going OUT (LRS remittances, overseas tour
    // packages) rather than withheld from income coming in, but equally
    // creditable against final India tax liability. Kept in its own
    // "general" row, separate label, so it isn't mistaken for TDS.
    if ((wd.india.tcsAggregateInr || 0) > 1) {
      indiaRows.push({
        id: "tcs_aggregate", jurisdiction: "IN", category: "general", label: "TCS Already Collected (Aggregate — Form 26AS)",
        grossInr: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxInr: wd.india.tcsAggregateInr, gapInr: 0,
        note: "Tax Collected at Source on outbound payments (not income) — creditable against final tax liability the same as TDS",
        citation: "s.206C"
      });
    }

    // -- ESTIMATES — deterministic from known data, but NOT a confirmed
    // withheld/collected receipt, so kept OUT of every total to avoid
    // double-counting against the aggregates above (which may or may not
    // already include these amounts — Layer 1 has no way to say either way).
    var estimateRows = { india: [], us: [] };
    if (wd.india.lrsTcs) {
      var lrs = wd.india.lrsTcs;
      estimateRows.india.push({
        id: "lrs_tcs_estimate", jurisdiction: "IN", category: "estimate",
        label: "Expected TCS on LRS Remittance — " + lrs.purposeLabel,
        grossInr: lrs.totalRemittedInr, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: null, taxInr: lrs.tcsInr, gapInr: 0,
        note: lrs.note + " — cross-check against the TCS aggregate above, not a confirmed collection receipt (excluded from totals)",
        citation: "s.206C(1G)"
      });
    }
    var vdaSaleInr = (model.income && model.income.india && model.income.india.vdaSaleConsiderationInr) || 0;
    if (vdaSaleInr > 10000) {
      estimateRows.india.push({
        id: "vda_194s_estimate", jurisdiction: "IN", category: "estimate",
        label: "Expected TDS on Crypto/VDA Transfers (s.194S)",
        grossInr: vdaSaleInr, domesticRatePct: null, treatyRatePct: null, docsOk: null,
        rateAppliedPct: 1, taxInr: Math.round(vdaSaleInr * 0.01), gapInr: 0,
        note: "1% of total transfer consideration (₹10,000 floor for most taxpayers, ₹50,000 for \"specified persons\" under s.44AB — not distinguishable from available data) — not confirmed as actually withheld, may already be inside the aggregate TDS credit above (excluded from totals)",
        citation: "s.194S"
      });
    }

    var panAadhaarInoperative = model.identity.panAadhaarLinked === false;

    var usRows = [];
    var usTotalGapUsd = 0;
    if (u.isNra && u.nra) {
      var n = u.nra;
      if (n.fdapUsd > 0) {
        var gapUsd = (!n.w8benOnFile && n.claimedRate != null && n.claimedRate < 0.30)
          ? n.fdapUsd * (0.30 - n.claimedRate) : 0;
        usTotalGapUsd += gapUsd;
        usRows.push({
          id: "fdap", jurisdiction: "US", category: "treaty_gap", label: "FDAP" + (n.incomeType ? " (" + n.incomeType + ")" : "") + " — Schedule NEC",
          grossUsd: n.fdapUsd, domesticRatePct: 30, treatyRatePct: n.claimedRate != null ? n.claimedRate * 100 : null,
          docsOk: n.w8benOnFile, rateAppliedPct: n.fdapRate * 100, taxUsd: n.fdapTaxUsd, gapUsd: gapUsd,
          note: n.w8benOnFile ? null : "Form W-8BEN missing — treaty rate denied, 30% statutory default withheld instead",
          citation: "IRC §1441 / Treas. Reg. §1.1441-6"
        });
      }
    }
    var firptaUsd = model.nra && model.nra.usRealPropertyDisposed ? (model.nra.firptaWithholdingUsd || 0) : 0;
    if (firptaUsd > 1) {
      usRows.push({
        id: "firpta", jurisdiction: "US", category: "treaty_gap", label: "FIRPTA — US real property disposition",
        grossUsd: null, domesticRatePct: 15, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxUsd: firptaUsd, gapUsd: 0,
        note: "Mandatory withholding on gross proceeds regardless of documentation — not treaty-rate-dependent",
        citation: "IRC §1445"
      });
    }

    // -- GENERAL WITHHOLDING — every US taxpayer, resident or not -----------
    var w2Employers = (model.income && model.income.us && model.income.us.w2Employers) || [];
    if (w2Employers.length > 0) {
      w2Employers.forEach(function (w, idx) {
        if (!(w.federalWithheldUsd > 1) && !(w.wagesUsd > 1)) return;
        var rateAppliedPct = w.wagesUsd > 0 ? (w.federalWithheldUsd / w.wagesUsd) * 100 : null;
        usRows.push({
          id: "w2_" + idx, jurisdiction: "US", category: "general",
          label: "W-2 Withholding — " + (w.employerName || "Unnamed Employer"),
          grossUsd: w.wagesUsd || null, domesticRatePct: null, treatyRatePct: null, docsOk: null,
          rateAppliedPct: rateAppliedPct, taxUsd: w.federalWithheldUsd, gapUsd: 0,
          note: w.stateWithheldUsd > 1 ? ("+ " + usd(w.stateWithheldUsd) + " state tax withheld") : null,
          citation: "IRC §3402 / Form W-2"
        });
      });
    } else if (model.taxesPaid && model.taxesPaid.us.withholding.usd > 1) {
      // Older/aggregate-only data shape — no per-employer breakdown captured.
      usRows.push({
        id: "w2_aggregate", jurisdiction: "US", category: "general", label: "Federal Withholding (Aggregate — Form W-2)",
        grossUsd: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxUsd: model.taxesPaid.us.withholding.usd, gapUsd: 0,
        note: "Single aggregate figure — no per-employer breakdown on file",
        citation: "IRC §3402 / Form W-2"
      });
    }
    var stateWithUsd = (model.withholdingDetail && model.withholdingDetail.us.stateWithholdingUsd) || 0;
    if (stateWithUsd > 1 && w2Employers.length === 0) {
      usRows.push({
        id: "state_withholding_aggregate", jurisdiction: "US", category: "general", label: "State Withholding (Aggregate — Form W-2 Box 17)",
        grossUsd: null, domesticRatePct: null, treatyRatePct: null, docsOk: null, rateAppliedPct: null,
        taxUsd: stateWithUsd, gapUsd: 0, note: null, citation: "Form W-2 Box 17"
      });
    }

    return {
      india: { rows: indiaRows, estimateRows: estimateRows.india, totalGapInr: indiaTotalGapInr, totalGapUsd: U.inrToUsd(indiaTotalGapInr), panAadhaarInoperative: panAadhaarInoperative },
      us: { rows: usRows, estimateRows: estimateRows.us, totalGapUsd: usTotalGapUsd },
      totalGapUsd: U.inrToUsd(indiaTotalGapInr) + usTotalGapUsd
    };
  }

  /* ------------------------------------------------------------------------
   * buildScopeNotes — deliberately-not-computed boundaries, surfaced in the
   * Monitor itself (not just the docs page) so a professional reading the
   * numbers also sees what the numbers deliberately do NOT cover. These are
   * the recorded decisions from docs/GAP_TRACKER.md that are not
   * rule-encodable (or are verified assurances), each shown only when the
   * loaded profile actually makes it relevant. Pure disclosures — no note
   * here ever changes a computed figure.
   * ----------------------------------------------------------------------*/
  function buildScopeNotes(model) {
    var notes = [];
    var hasIndia = model.meta.hasIndiaScope, hasUs = model.meta.hasUsScope, dual = hasIndia && hasUs;
    var hasIndiaBusiness = (model.entity && model.entity.isBusiness) || (model.income.india.business && model.income.india.business.inr > 0);
    var hasSecuritiesTrades = ((model.assets && model.assets.indianSecurities) || []).length > 0;
    var hasUsWagesOrSe = model.income.us.wages.usd > 0 || (model.income.us.seEarningsUsd || 0) > 0;

    function note(id, area, kind, title, body, relevant) {
      if (relevant) notes.push({ id: id, area: area, kind: kind, title: title, body: body });
    }

    note("scope_gaar", "India", "excluded", "GAAR is not evaluated",
      "India's General Anti-Avoidance Rule can recharacterize arrangements that lack commercial substance — a facts-and-circumstances judgment no rules engine can safely make. WISING flags mechanical conflicts only; whether an arrangement invites GAAR scrutiny remains a professional call.",
      hasIndia);
    note("scope_stt", "India", "excluded", "STT is not computed as a levy",
      "Securities Transaction Tax charged on trades (raised on F&O by Finance Act 2026) isn't calculated here. The stt_paid flag on each transaction drives the capital-gains regime (s.196/198 vs s.197) — the levy amount itself is neither a tax credit nor a capital-gains deduction, so nothing downstream depends on it.",
      hasSecuritiesTrades);
    note("scope_payer_tds", "India", "excluded", "Your obligations as a TDS deductor aren't tracked",
      "The Withholding page covers tax withheld FROM this taxpayer's income. Duties in the opposite direction — deducting TDS on payments the business makes to vendors, contractors, or professionals — aren't monitored as a compliance obligation in their own right, though the resulting s.40(a) expense disallowance for TDS failures (and s.40A(3) cash-payment / s.43B(h) MSME-overdue disallowances) does flow into business income (Phase 1).",
      hasIndiaBusiness);
    note("scope_clubbing", "India", "excluded", "Clubbing amounts are taken as entered",
      "Spousal and minor-child clubbed income entered in Layer 1 is taxed as given. WISING doesn't trace asset transfers between family members to detect clubbing that should have been reported but wasn't.",
      hasIndia);
    note("scope_fica", "United States", "excluded", "FICA/FUTA levies aren't computed",
      "Employee and employer Social Security/Medicare/unemployment payroll taxes are a separate tax base from income tax. Only the pieces that touch the 1040 are computed: Additional Medicare 0.9%, self-employment tax, and the W-2 withholding shown on the Withholding page.",
      hasUsWagesOrSe);
    note("scope_fatca_ch4", "Cross-border", "excluded", "FATCA Chapter 4 withholding is institution-side",
      "The 30% FATCA withholding regime (IRC §§1471-1474) applies to payments to non-compliant foreign financial institutions — banks' problem, not yours directly. Where it touches an individual is the US-person self-certification banks request, which is tracked with your documents.",
      dual);
    note("scope_mocked_uploads", "App", "excluded", "Document-upload extraction is simulated",
      "Every \"upload to auto-fill\" feature in Layer 1 (Form 26AS, Lower-TDS certificate, bank statements, property documents) is a demo simulation with representative values — not live OCR. Figures sourced from an upload should be treated as manually-entered until real extraction ships.",
      true);
    note("scope_mli", "Cross-border", "assurance", "MLI does not affect the India-US treaty",
      "The US never signed the OECD Multilateral Instrument, so the India-US DTAA text is untouched by it — unlike India's treaties with the UK, Netherlands, or Singapore. Verified; nothing to apply.",
      dual);
    note("scope_dtaa_current", "Cross-border", "assurance", "Treaty text current as modeled",
      "The India-US DTAA has not been amended since the 2000 protocol. Every treaty rate and tie-breaker rule in this engine reflects the treaty as it stands.",
      dual);

    return notes;
  }

  /* ------------------------------------------------------------------------
   * buildReturnFormDetermination — surfaces WHICH return form applies and
   * WHY, for both sides, on the Filings page.
   *
   * India side: computed.indiaItrForm (computeIndiaItrForm in computation.js)
   * is now the AUTHORITATIVE answer — a real, independent backend
   * computation from verified-reliable model/computed fields, run
   * unconditionally for every profile. Layer 1's own persisted
   * itr_recommendation.form (when present) is shown as a cross-check, not
   * trusted as the primary source — see computeIndiaItrForm's own comment
   * for the three concrete, verified bugs in Layer 1's frontend calculator
   * that motivate not trusting it alone (a desyncable "setup wizard"
   * checkbox, two dead partner-income fields, and an uncapturable
   * directorship field).
   * ----------------------------------------------------------------------*/
  function buildReturnFormDetermination(model, computed) {
    var E = model.entity;
    var CBDT_CITATION = "CBDT notified the AY 2026-27 ITR forms 2026-03-30 (corrigendum 2026-04-10). Eligibility rules verified against that notification 2026-07-12 — re-check each filing season, since CBDT re-notifies forms (and sometimes changes eligibility) annually.";
    var itr = computed.indiaItrForm;

    var reasonsSuffix = (itr && itr.disqualifiers.length) ? " Reasons: " + itr.disqualifiers.join("; ") + "." : "";
    var indiaTrace;
    if (!itr) {
      indiaTrace = source("No India-side data on file.", null);
    } else if (itr.frontendForm == null) {
      indiaTrace = source(
        (itr.explanation || "Backend-computed eligibility check.") + reasonsSuffix +
        " Layer 1 India hasn't produced its own recommendation for this profile (itr_recommendation.form is unset) — this is WISING's own independent computation, run unconditionally, not a hedge pending the frontend.",
        CBDT_CITATION);
    } else if (itr.matchesFrontend) {
      indiaTrace = source(
        (itr.explanation || "") + reasonsSuffix + " Cross-checked against Layer 1 India's own recommendation (" + itr.frontendForm + ") — they agree.",
        CBDT_CITATION);
    } else {
      // Disagreement between WISING's independent computation and Layer 1's
      // own persisted verdict — surfaced here AND as a real finding
      // (india_itr_form_mismatch in detectConflicts) rather than silently
      // picking one.
      indiaTrace = source(
        "WISING computes " + itr.form + "; Layer 1 India's own recommendation was " + itr.frontendForm +
        " (\"" + (itr.frontendExplanation || "no explanation on file") + "\"). They disagree — see the india_itr_form_mismatch finding for likely causes." + reasonsSuffix,
        CBDT_CITATION);
    }

    var usDetail =
      E.usReturnForm === "1120" ? "C-Corp: entity-level return, taxed at 21% flat." :
      E.usReturnForm === "1120-S" ? "S-Corp: informational return, income passes through via K-1." :
      E.usReturnForm === "1065" ? "Partnership: informational return, income passes through via K-1." :
      E.usReturnForm === "1041" ? "Trust/estate return." :
      E.usReturnForm === "1040-NR" ? "Nonresident alien individual return — Layer 1 US recorded this taxpayer as filing Form 1040-NR." :
      "Resident/citizen individual return — standard Form 1040 (not recorded as an NRA 1040-NR filer).";
    var usTrace = source(usDetail, "IRS form-per-entity-type/residency-status mapping, verified 2026-07-12.");

    return {
      india: {
        form: itr ? itr.form : E.indiaReturnForm,
        // "isRecommendation" now means "a real, checked computation" —
        // true unconditionally whenever India data exists, since
        // computeIndiaItrForm always runs (no more crude fallback).
        isRecommendation: !!itr,
        matchesFrontend: itr ? itr.matchesFrontend : null,
        trace: indiaTrace
      },
      us: { form: E.usReturnForm, trace: usTrace }
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
    var taxComputation = buildTaxComputation(model, computed);
    var withholding = buildWithholdingSummary(model, computed);
    var scopeNotes = buildScopeNotes(model);
    var returnForms = buildReturnFormDetermination(model, computed);
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
      withholding: withholding,
      scopeNotes: scopeNotes,
      returnForms: returnForms,
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

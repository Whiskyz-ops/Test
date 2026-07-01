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

    // -- 1. DUAL RESIDENCY ---------------------------------------------------
    if (res.dualResident) {
      add("dual_residency", S.CRITICAL, C.RESIDENCY,
        "Dual tax residency (India + US)",
        "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") +
        ") and the US (" + (res.us.isCitizen ? "citizen" : res.us.hasGreenCard ? "green card" : "SPT met") +
        "). Both jurisdictions assert taxing rights over worldwide income for an overlapping period.",
        "Resolve residency under Article 4 of the India-US DTAA tie-breaker (permanent home → centre of vital interests → habitual abode → nationality). File IRS Form 8833 (US) and obtain a TRC + Form 10F (India) for the loser jurisdiction.",
        0, ["DTAA Art. 4", "Form 8833", "TRC", "Form 10F"]);
    }

    // -- 2. TREATY TIE-BREAKER NOT RESOLVED ---------------------------------
    if (res.dualResident && model.treaty.treatyResidence === "none" && model.treaty.usTreatyResidence === "none") {
      add("tiebreak_unresolved", S.CRITICAL, C.TREATY,
        "DTAA tie-breaker not yet applied",
        "Dual residency exists but no Article 4 tie-breaker election is recorded on either side. Without it, the same income is exposed to full tax in both countries and only partial FTC relief is available.",
        "Run the Article 4 cascade and record the resulting treaty residence on the loser side. The Indian FY (Apr–Mar) straddles two US calendar years — apportion US earnings/withholdings to Indian fiscal months before applying the tie-breaker.",
        computed.doubleTax.totalDoublyTaxedUsd, ["DTAA Art. 4"]);
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
        "Carry the excess credit (" + usd(ftc.us.carryoverUsd) + ") back 1 year / forward 10 years on Form 1116. Re-check the source-by-source income split and whether any income should re-source under the treaty to lift the limitation.",
        ftc.us.residualDoubleTaxUsd, ["Form 1116", "§904(c)"]);
    } else if (ftc.us.indiaTaxPaidUsd > 0 && ftc.us.ftcAllowedUsd > 0) {
      add("ftc_available", S.INFO, C.CREDIT,
        "Foreign Tax Credit available and within limit",
        "Indian tax of " + usd(ftc.us.indiaTaxPaidUsd) + " is fully creditable against US tax this year (" +
        usd(ftc.us.ftcAllowedUsd) + " within a " + usd(ftc.us.ftcLimitUsd) + " limitation).",
        "Claim on Form 1116 (US) and file Form 67 (India) before the ITR due date to preserve symmetric relief.",
        ftc.us.ftcAllowedUsd, ["Form 1116", "Form 67"]);
    }

    // -- 5. FORM 67 TIMING (India FTC procedural) --------------------------
    if (model.income.us.foreignSourceTotal.usd > 0 || model.taxesPaid.us.total.usd > 0) {
      add("form67_required", S.WARNING, C.DOCUMENT,
        "Form 67 required to claim Indian FTC",
        "Foreign income / foreign tax is present. India allows FTC u/s 90/91 ONLY if Form 67 is filed on or before the ITR due date, with Schedule FSI and Schedule TR.",
        "File Form 67 electronically before submitting the ITR. A late Form 67 is condonable but risks credit denial.",
        0, ["Form 67", "Rule 128", "Schedule FSI", "Schedule TR"]);
    }

    // -- 6. TAX-YEAR / APPORTIONMENT MISMATCH ------------------------------
    if (res.dualResident || (model.meta.hasIndia && model.meta.hasUs)) {
      add("tax_year_mismatch", S.WARNING, C.CREDIT,
        "Tax-year mismatch: Indian FY vs US CY",
        "India taxes Apr–Mar; the US taxes Jan–Dec. The same income & withholding fall in different reporting periods, so FTC claimed in one country must be apportioned to match the other's period.",
        "Apportion US calendar-year wages/withholding into Indian fiscal months (and vice-versa) when populating Form 67 / Form 1116. Keep a reconciliation worksheet for both filings.",
        0, [CONST.CALENDAR.INDIA_FY.label, CONST.CALENDAR.US_CY.label]);
    }

    // -- 7. FX BASIS MISMATCH ----------------------------------------------
    add("fx_basis", S.INFO, C.CREDIT,
      "FX conversion basis is an approximation",
      "Cross-border amounts are normalized at a flat " + CONST.FX.INR_PER_USD +
      " INR/USD. Statutory FTC computations require the telegraphic-transfer buying rate on the relevant date (Rule 115 / SBI TTBR).",
      "Re-price each foreign income and tax item at the correct per-transaction rate before filing; the flat rate is for planning visibility only.",
      0, ["Rule 115", "SBI TTBR"]);

    // -- 8. PFIC EXPOSURE (Indian mutual funds) ----------------------------
    var mfCount = (model.assets.indianMutualFunds || []).length;
    if (mfCount > 0 && res.us.isResident) {
      add("pfic", S.CRITICAL, C.ENTITY,
        "PFIC exposure: Indian mutual funds",
        mfCount + " Indian mutual fund / ETF holding(s) detected. For a US person these are Passive Foreign Investment Companies — taxed under the punitive §1291 excess-distribution regime by default, with a separate Form 8621 per fund.",
        "Evaluate a QEF or Mark-to-Market election (must be timely). Many Indian AMCs cannot supply a PFIC Annual Information Statement, which can force the §1291 default — consider restructuring holdings to US-domiciled funds.",
        0, ["Form 8621", "§1291", "QEF / MTM"]);
    }

    // -- 9. CFC / FORM 5471 (Indian companies) -----------------------------
    var bizCount = (model.assets.indianBusinesses || []).length;
    if (bizCount > 0 && res.us.isResident) {
      add("cfc", S.WARNING, C.ENTITY,
        "Controlled Foreign Corporation exposure (Indian company)",
        bizCount + " Indian business entity(ies) detected. If the US person owns ≥10%, Form 5471 is required and GILTI / Subpart F inclusions may accelerate US tax on undistributed Indian profits.",
        "Confirm ownership %, classify the entity, and evaluate a §962 election (corporate rate + FTC) or check-the-box planning. India's MAT/credit interaction must be modelled jointly.",
        0, ["Form 5471", "GILTI §951A", "Subpart F", "§962 election"]);
    }

    // -- 10. RETIREMENT ACCOUNT TREATMENT MISMATCH -------------------------
    if ((model.assets.epfInr > 0 || model.assets.ppfInr > 0 || model.assets.npsInr > 0) && res.us.isResident) {
      add("retirement_mismatch", S.WARNING, C.RETIREMENT,
        "Indian retirement accounts — divergent treatment",
        "EPF/PPF/NPS balances are tax-exempt (or concessionally taxed) in India, but the US-India treaty does NOT exempt them. The IRS may treat PPF as a foreign grantor trust (Form 3520/3520-A) and tax accretions annually.",
        "Determine whether each account is a pension covered by Article 20 vs a trust. Report on FBAR/8938; assess annual income inclusion of interest accretions and any 3520 obligation.",
        0, ["DTAA Art. 20", "Form 3520/3520-A", "FBAR"]);
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

    // -- 13. INCOME-CHARACTER MISMATCHES (per doubly-taxed head) -----------
    (computed.doubleTax.items || []).forEach(function (it) {
      if (it.doublyTaxed && Math.max(it.indiaUsd, it.usUsd) > 0) {
        add("income_" + it.label.replace(/[^a-z]+/gi, "_").toLowerCase(), S.WARNING, C.INCOME,
          "Doubly-taxed income: " + it.label,
          it.label + " is taxed in India (" + usd(it.indiaUsd) + ") and exposed in the US (" +
          usd(it.usUsd || it.indiaUsd) + "). " + (it.note || ""),
          "Confirm source rules and treaty article, then relieve via FTC on the residence side. Watch character/holding-period differences that change the rate.",
          Math.max(it.indiaUsd, it.usUsd), ["DTAA", "Form 1116", "Form 67"]);
      }
    });

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
      form_3520: (model.assets.ppfInr > 0 || model.assets.epfInr > 0) && res.us.isResident,
      form_1040nr: model.treaty.files1040nr || (res.us.status === CONST.US_STATUS.NON_RESIDENT_ALIEN),
      form_8960: computed.headline.totalIncomeUsd > (CONST.LIMITS.NIIT_THRESHOLD[model.identity.usFilingStatus] || 200000) &&
                 (model.income.us.interestUs.usd + model.income.us.ordinaryDividendsUs.usd + model.income.us.capitalGainsUs.usd) > 0,
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
    return {
      direction_us_claims_india: {
        title: "US Form 1116 — credit for Indian taxes",
        rows: [
          { label: "Indian income tax (computed liability)", usd: ftc.us.indiaTaxPaidUsd },
          { label: "Foreign-source income (US view)", usd: ftc.us.foreignSourceIncomeUsd },
          { label: "US taxable income", usd: ftc.us.taxableIncomeUsd },
          { label: "US income tax (pre-credit)", usd: ftc.us.usIncomeTaxUsd },
          { label: "FTC limitation = US tax × foreign/taxable", usd: ftc.us.ftcLimitUsd },
          { label: "FTC allowed this year", usd: ftc.us.ftcAllowedUsd, emphasis: true },
          { label: "Excess credit carried over (§904(c))", usd: ftc.us.carryoverUsd },
          { label: "Residual double tax (unrelieved)", usd: ftc.us.residualDoubleTaxUsd, warn: true }
        ]
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
        title: "India income tax (" + i.regime + " regime)",
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
      us: {
        title: "US federal income tax (" + u.filingStatus.toUpperCase() + ")",
        currency: "USD",
        rows: [
          { label: "Total income" + (u.worldwide ? " (worldwide)" : " (US-source)"), usd: u.totalIncomeUsd },
          { label: "Adjusted gross income", usd: u.agiUsd },
          { label: "Less " + u.deductionMode + " deduction", usd: -u.deductionUsd },
          { label: "Taxable income", usd: u.taxableIncomeUsd },
          { label: "Ordinary-rate tax", usd: u.ordinaryTaxUsd },
          { label: "Preferential LTCG/QDI tax", usd: u.preferentialTaxUsd },
          { label: "Net investment income tax (NIIT)", usd: u.niitUsd },
          { label: "Additional Medicare tax", usd: u.additionalMedicareUsd },
          { label: "Total US tax (pre-FTC)", usd: u.totalTaxBeforeFtcUsd, emphasis: true }
        ],
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

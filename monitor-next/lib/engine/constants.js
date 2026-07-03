/* ============================================================================
 * WISING — India-US Tax Conflict Detection Tool
 * Layer 2 Engine :: constants.js
 * ----------------------------------------------------------------------------
 * Central catalogue of FX assumptions, statutory monetary thresholds and the
 * document-filing rule-book. Everything that is a "magic number" in cross-border
 * India/US tax lives here so the computation and conflict engines stay readable
 * and the assumptions are auditable by a tax professional in one place.
 *
 * NOTE: These are prototype defaults for FY2025-26 / TY2025. They are NOT a
 * substitute for the live statutory tables — a production build would pull these
 * from a versioned rule service. Values are chosen to be consistent with the
 * Layer 1 intake forms (which hydrate cross-border data at 83.0 INR/USD).
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};

  var CONST = {
    // ---- Schema contract: localStorage keys the Layer 1 forms write to ----
    STORAGE_KEYS: {
      ROUTER: "wising_router_state",
      INDIA: "wising_layer1_india_state",
      US: "wising_us_state"
    },

    // ---- Foreign exchange -------------------------------------------------
    // The Layer 1 hydration engine uses a flat 83.0 INR/USD. We keep the same
    // anchor so values reconcile, but expose it so timing-basis conflicts
    // (TT buying rate on date of remittance vs flat rate) can be surfaced.
    FX: {
      INR_PER_USD: 83.0,
      // SBI TT buying-rate basis is what Rule 115 / Form 67 actually require;
      // a flat-rate hydration is an approximation we flag, not an error.
      BASIS_NOTE: "Flat 83.0 INR/USD. Statutory FTC requires per-transaction TT buying rate (Rule 115 / SBI TTBR)."
    },

    // ---- Residency enums (mirror the Layer 1 forms) -----------------------
    INDIA_STATUS: { ROR: "ROR", RNOR: "RNOR", NR: "NR" },
    US_STATUS: {
      RESIDENT_ALIEN: "RESIDENT_ALIEN",
      NON_RESIDENT_ALIEN: "NON_RESIDENT_ALIEN",
      DUAL_STATUS: "DUAL_STATUS",
      CITIZEN: "US_CITIZEN"
    },

    // ---- Statutory monetary thresholds -----------------------------------
    LIMITS: {
      // FBAR / FinCEN Form 114 — aggregate peak of all foreign accounts.
      FBAR_AGGREGATE_USD: 10000,

      // FATCA / Form 8938 — varies by filing status & residence. The Layer 1
      // US form uses the "living abroad" figures; we encode the full table.
      FORM_8938: {
        US_RESIDENT_SINGLE: { lastDay: 50000, anyTime: 75000 },
        US_RESIDENT_MFJ: { lastDay: 100000, anyTime: 150000 },
        ABROAD_SINGLE: { lastDay: 200000, anyTime: 300000 },
        ABROAD_MFJ: { lastDay: 400000, anyTime: 600000 }
      },

      // RBI Liberalised Remittance Scheme — USD 250,000 per individual / FY.
      LRS_ANNUAL_USD: 250000,

      // Foreign Earned Income Exclusion (Form 2555) — TY2025 figure.
      FEIE_MAX_USD: 130000,

      // Net Investment Income Tax (3.8%) MAGI thresholds.
      NIIT_THRESHOLD: { single: 200000, mfj: 250000, mfs: 125000 },

      // Additional Medicare Tax (0.9%) wage thresholds.
      ADDL_MEDICARE_THRESHOLD: { single: 200000, mfj: 250000, mfs: 125000 },

      // Foreign gift reporting (Form 3520) — from non-resident individuals.
      FOREIGN_GIFT_REPORTING_USD: 100000,

      // §54 / §54F India capital-gains reinvestment cap (informational).
      INDIA_54EC_CAP_INR: 5000000
    },

    // ---- Tax-year calendars ----------------------------------------------
    CALENDAR: {
      INDIA_FY: { startMonth: 4, label: "Apr 1 – Mar 31 (Financial Year)" },
      US_CY: { startMonth: 1, label: "Jan 1 – Dec 31 (Calendar Year)" },
      // The 3-month offset is the root cause of most apportionment conflicts.
      OFFSET_MONTHS: 3
    },

    // ---- Severity ladder used across the conflict engine ------------------
    SEVERITY: { CRITICAL: "critical", WARNING: "warning", INFO: "info" },

    // ---- Conflict categories (drive dashboard grouping) -------------------
    CATEGORY: {
      RESIDENCY: "residency",
      TREATY: "treaty",
      INCOME: "income",
      CREDIT: "credit",
      LIMIT: "limit",
      DOCUMENT: "document",
      ENTITY: "entity",
      RETIREMENT: "retirement"
    },

    /* ----------------------------------------------------------------------
     * TAX TABLES — FY2025-26 (India, AY2026-27) / TY2025 (US).
     * Planning-grade. Kept in one place so the computation engine is auditable
     * and a production build can swap in a versioned rule service.
     * --------------------------------------------------------------------*/
    TAX: {
      INDIA: {
        // [upper_bound_inr, rate]; Infinity = top slab.
        SLABS_NEW: [
          [400000, 0.00], [800000, 0.05], [1200000, 0.10],
          [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]
        ],
        SLABS_OLD: [
          [250000, 0.00], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]
        ],
        STD_DEDUCTION_SALARY_NEW_INR: 75000,
        STD_DEDUCTION_SALARY_OLD_INR: 50000,
        // §87A rebate
        REBATE_87A_NEW: { incomeCap: 1200000, maxRebate: 60000 },
        REBATE_87A_OLD: { incomeCap: 500000, maxRebate: 12500 },
        // Chapter VI-A caps (OLD regime). NEW regime disallows most of these.
        DEDUCTION_CAPS_OLD: { s80C: 150000, s80CCD1B: 50000, s80D_self: 25000, s80D_parents_senior: 50000 },
        // Special rates (post 23-Jul-2024)
        STCG_111A_RATE: 0.20,
        LTCG_112A_RATE: 0.125,
        LTCG_112A_EXEMPT_INR: 125000,
        LTCG_112_RATE: 0.125,
        // Surcharge brackets for individuals [income_over_inr, rate]
        SURCHARGE_IND: [
          [50000000, 0.25], [20000000, 0.25], [10000000, 0.15], [5000000, 0.10], [0, 0.00]
        ],
        SURCHARGE_CG_DIV_CAP: 0.15, // surcharge on 111A/112A/dividend capped at 15%
        SURCHARGE_NEW_MAX: 0.25,    // new regime caps top surcharge at 25%
        CESS_RATE: 0.04
      },
      US: {
        // 2025 ordinary brackets by filing status; [upper_bound_usd, rate].
        BRACKETS: {
          single: [[11925,0.10],[48475,0.12],[103350,0.22],[197300,0.24],[250525,0.32],[626350,0.35],[Infinity,0.37]],
          mfj:    [[23850,0.10],[96950,0.12],[206700,0.22],[394600,0.24],[501050,0.32],[751600,0.35],[Infinity,0.37]],
          mfs:    [[11925,0.10],[48475,0.12],[103350,0.22],[197300,0.24],[250525,0.32],[375800,0.35],[Infinity,0.37]],
          hoh:    [[17000,0.10],[64850,0.12],[103350,0.22],[197300,0.24],[250500,0.32],[626350,0.35],[Infinity,0.37]]
        },
        STD_DEDUCTION: { single: 15000, mfj: 30000, mfs: 15000, hoh: 22500 },
        // Long-term cap-gains / qualified-dividend preferential brackets 2025.
        // 0% up to br0, 15% up to br15, 20% above (by taxable income).
        LTCG_BRACKETS: {
          single: { br0: 48350, br15: 533400 },
          mfj:    { br0: 96700, br15: 600050 },
          mfs:    { br0: 48350, br15: 300000 },
          hoh:    { br0: 64750, br15: 566700 }
        },
        SALT_CAP_USD: 10000,
        NIIT_RATE: 0.038,
        ADDL_MEDICARE_RATE: 0.009,
        C_CORP_RATE: 0.21,
        // ---- Self-employment tax (Schedule SE), 2025 ----
        SE_NET_FACTOR: 0.9235,          // 92.35% of net SE earnings is SE-taxable
        SE_RATE_SS: 0.124,              // Social Security portion (capped)
        SE_RATE_MEDICARE: 0.029,        // Medicare portion (uncapped)
        SS_WAGE_BASE_USD: 176100,       // 2025 Social Security wage base
        // ---- Qualified Business Income deduction (§199A), 2025 ----
        QBI_RATE: 0.20,
        QBI_THRESHOLD: { single: 197300, mfj: 394600, mfs: 197300, hoh: 197300 },
        QBI_PHASEIN: { single: 50000, mfj: 100000, mfs: 50000, hoh: 50000 }
      },
      // ---- entity (business) corporate rates ----
      INDIA_COMPANY: {
        RATE_115BAA: 0.22, SURCHARGE_115BAA: 0.10,   // domestic co, no incentives
        RATE_TURNOVER_LTE_400CR: 0.25,
        RATE_DEFAULT: 0.30,
        SURCHARGE_OVER_1CR: 0.07, SURCHARGE_OVER_10CR: 0.12,
        MAT_RATE: 0.15, CESS_RATE: 0.04
      },
      INDIA_FIRM: { RATE: 0.30, SURCHARGE_OVER_1CR: 0.12, CESS_RATE: 0.04 }
    }
  };

  /* ------------------------------------------------------------------------
   * DOCUMENT CATALOGUE
   * Each entry is a filing/compliance artefact. `trigger` is evaluated by the
   * computation engine against the normalized model and returns a boolean.
   * `jurisdiction`: 'US' | 'IN'. `severity` drives how loudly the dashboard
   * nags. Keep wording professional — this is read by CPAs/CAs.
   * ----------------------------------------------------------------------*/
  CONST.DOCUMENTS = [
    // ---------------------------- US side --------------------------------
    {
      id: "fincen_114",
      jurisdiction: "US",
      name: "FinCEN Form 114 (FBAR)",
      desc: "Report of Foreign Bank and Financial Accounts.",
      why: "Aggregate peak balance across all foreign (Indian) accounts exceeded USD 10,000.",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_8938",
      jurisdiction: "US",
      name: "IRS Form 8938 (FATCA)",
      desc: "Statement of Specified Foreign Financial Assets, filed with Form 1040.",
      why: "Specified foreign financial assets exceeded the Form 8938 reporting threshold for your filing status/residence.",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_1116",
      jurisdiction: "US",
      name: "IRS Form 1116 (Foreign Tax Credit)",
      desc: "Claims credit for income tax paid to India against US tax liability.",
      why: "Indian income tax was paid on income that is also taxable in the US.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_2555",
      jurisdiction: "US",
      name: "IRS Form 2555 (FEIE)",
      desc: "Foreign Earned Income Exclusion / foreign housing exclusion.",
      why: "FEIE was elected on foreign earned income.",
      severity: CONST.SEVERITY.INFO
    },
    {
      id: "form_8833",
      jurisdiction: "US",
      name: "IRS Form 8833 (Treaty-Based Position)",
      desc: "Discloses a treaty-based return position (e.g. Article 4 tie-breaker).",
      why: "A DTAA tie-breaker or treaty rate is being relied upon to override default US taxation.",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_8621",
      jurisdiction: "US",
      name: "IRS Form 8621 (PFIC)",
      desc: "Information return for Passive Foreign Investment Companies — one per fund.",
      why: "Holdings in Indian mutual funds / ETFs are PFICs and require annual reporting (punitive §1291 regime unless QEF/MTM elected).",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_5471",
      jurisdiction: "US",
      name: "IRS Form 5471 (CFC)",
      desc: "Information return for US persons owning ≥10% of a foreign corporation.",
      why: "You own ≥10% of an Indian company — potential Subpart F / GILTI inclusion.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_8865",
      jurisdiction: "US",
      name: "IRS Form 8865",
      desc: "Return for US persons with interests in a foreign partnership.",
      why: "You hold an interest in an Indian partnership/LLP.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_3520",
      jurisdiction: "US",
      name: "IRS Form 3520 / 3520-A",
      desc: "Reporting of foreign gifts and transactions with foreign trusts.",
      why: "Foreign gift > USD 100,000 received, or you are a grantor/beneficiary of a foreign trust (note: Indian PPF/EPF may be treated as trusts).",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_1040nr",
      jurisdiction: "US",
      name: "IRS Form 1040-NR",
      desc: "Non-resident alien income tax return.",
      why: "You are (or elect to be treated as) a US non-resident alien for this year.",
      severity: CONST.SEVERITY.INFO
    },
    {
      id: "form_8960",
      jurisdiction: "US",
      name: "IRS Form 8960 (NIIT)",
      desc: "Net Investment Income Tax (3.8%).",
      why: "MAGI exceeded the NIIT threshold and net investment income is present.",
      severity: CONST.SEVERITY.INFO
    },
    // ---------------------------- India side -----------------------------
    {
      id: "form_67",
      jurisdiction: "IN",
      name: "Form 67 (India FTC)",
      desc: "Statement of foreign income & foreign tax, filed before the ITR due date.",
      why: "Foreign (US) income is being offered to tax in India and FTC u/s 90/91 is claimed. Schedule FSI/TR must accompany the ITR.",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "trc",
      jurisdiction: "IN",
      name: "Tax Residency Certificate (TRC)",
      desc: "Issued by the other contracting state (IRS Form 6166 for the US).",
      why: "DTAA relief / treaty rate is being claimed — a TRC is mandatory u/s 90(4).",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_10f",
      jurisdiction: "IN",
      name: "Form 10F",
      desc: "Self-declaration accompanying the TRC, filed electronically on the ITR portal.",
      why: "Treaty benefit claimed and the TRC does not contain all particulars required u/r 21AB.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "schedule_fa",
      jurisdiction: "IN",
      name: "Schedule FA (Foreign Assets)",
      desc: "Disclosure of foreign assets/accounts in the Indian ITR.",
      why: "You are Resident & Ordinarily Resident (ROR) and hold US bank accounts, securities or other foreign assets.",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "schedule_fsi_tr",
      jurisdiction: "IN",
      name: "Schedule FSI & Schedule TR",
      desc: "Foreign Source Income and Tax Relief schedules in the ITR.",
      why: "Foreign income is offered to tax and relief u/s 90/91 is claimed.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_15ca_cb",
      jurisdiction: "IN",
      name: "Form 15CA / 15CB",
      desc: "Remittance certificates for foreign outward remittances.",
      why: "Outward remittances under LRS / to non-residents were made during the year.",
      severity: CONST.SEVERITY.INFO
    }
  ];

  WISING.CONST = CONST;
})(typeof window !== "undefined" ? window : globalThis);

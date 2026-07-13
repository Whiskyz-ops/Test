/* ============================================================================
 * WISING — India-US Tax Conflict Detection Tool
 * Layer 2 Engine :: constants.js
 * ----------------------------------------------------------------------------
 * Central catalogue of FX assumptions, statutory monetary thresholds and the
 * document-filing rule-book. Everything that is a "magic number" in cross-border
 * India/US tax lives here so the computation and conflict engines stay readable
 * and the assumptions are auditable by a tax professional in one place.
 *
 * NOTE: These are prototype defaults for Tax Year 2026-27 (India) / Tax Year
 * 2026 (US). India's Income-tax Act, 2025 (in force 1 Apr 2026) unifies
 * "Financial Year"/"Assessment Year" into a single "Tax Year" concept and
 * renumbers every section — citations below use the ITA 2025 numbering.
 * SOURCING CAVEAT: the ITA 2025 section numbers were sourced from secondary
 * commentary (tax-publisher concordance articles — chiefly TaxTMI's "Clause
 * X of the Income Tax Bill, 2025 vs. Section Y of the Income-tax Act, 1961"
 * series), not the CBDT's official mapping utility directly (it blocks
 * automated access). Every citation has now been checked against at least
 * two independent sources; two wrong initial guesses were caught and fixed
 * this way (§87A is §156, not §157; §54 is §82, not §84). Reasonably
 * reliable, but still not the same as pulling from the official utility —
 * spot-check against incometaxindia.gov.in before relying on any single
 * citation in a real filing or professional opinion.
 * They are NOT a
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
      // SBI TT buying-rate basis is what Rule 115 / Form 44 actually require;
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

      // Foreign Earned Income Exclusion (Form 2555) — TY2026 figure (was
      // $130,000 for TY2025).
      FEIE_MAX_USD: 132900,

      // Net Investment Income Tax (3.8%) MAGI thresholds — fixed by statute
      // since 2013, NOT indexed for inflation (confirmed unchanged by OBBBA).
      NIIT_THRESHOLD: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },

      // Additional Medicare Tax (0.9%) wage thresholds.
      ADDL_MEDICARE_THRESHOLD: { single: 200000, mfj: 250000, mfs: 125000 },

      // Foreign gift reporting (Form 3520) — from non-resident individuals.
      FOREIGN_GIFT_REPORTING_USD: 100000,

      // §84 / §86 India capital-gains reinvestment cap (informational).
      INDIA_54EC_CAP_INR: 5000000,

      // Section 530A "Trump Accounts" (OBBBA) — custodial accounts for
      // US-citizen children under 18 with an SSN. Contributions (other than
      // the federal seed) cannot be accepted before this launch date; the
      // annual cap is per child, combined across all contributors. The
      // one-time federal seed contribution is separate from and doesn't
      // count against the annual cap, and is only available for children
      // born in the given window.
      TRUMP_ACCOUNT_LAUNCH_DATE: "2026-07-04",
      TRUMP_ACCOUNT_ANNUAL_CAP_USD: 5000,
      TRUMP_ACCOUNT_FEDERAL_SEED_USD: 1000,
      TRUMP_ACCOUNT_SEED_BIRTH_YEAR_MIN: 2025,
      TRUMP_ACCOUNT_SEED_BIRTH_YEAR_MAX: 2028
    },

    // ---- Tax-year calendars ----------------------------------------------
    CALENDAR: {
      INDIA_FY: { startMonth: 4, label: "Apr 1 – Mar 31 (Tax Year)" },
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
     * TAX TABLES — Tax Year 2026-27 (India, Income-tax Act 2025) / TY2026 (US).
     * Planning-grade. Kept in one place so the computation engine is auditable
     * and a production build can swap in a versioned rule service.
     * --------------------------------------------------------------------*/
    TAX: {
      INDIA: {
        // [upper_bound_inr, rate]; Infinity = top slab. Unchanged from
        // FY2025-26 — Budget 2026 (Feb 2026) retained the FY2025-26 slab
        // structure, rebate (now §156, was §87A), and standard deduction
        // as-is for Tax Year 2026-27 (Income-tax Act, 2025).
        SLABS_NEW: [
          [400000, 0.00], [800000, 0.05], [1200000, 0.10],
          [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]
        ],
        SLABS_OLD: [
          [250000, 0.00], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]
        ],
        STD_DEDUCTION_SALARY_NEW_INR: 75000,
        STD_DEDUCTION_SALARY_OLD_INR: 50000,
        // §156 rebate
        REBATE_87A_NEW: { incomeCap: 1200000, maxRebate: 60000 },
        REBATE_87A_OLD: { incomeCap: 500000, maxRebate: 12500 },
        // Chapter VI-A caps (OLD regime). NEW regime disallows most of these.
        DEDUCTION_CAPS_OLD: { s80C: 150000, s80CCD1B: 50000, s80D_self: 25000, s80D_parents_senior: 50000 },
        // Special rates (post 23-Jul-2024)
        STCG_111A_RATE: 0.20,
        LTCG_112A_RATE: 0.125,
        LTCG_112A_EXEMPT_INR: 125000,
        LTCG_112_RATE: 0.125,
        // s.69(2)(b) promoter additional tax on buy-back capital gains (Budget
        // 2026, buy-backs on/after 1-Apr-2026 only): a promoter (>10%
        // shareholder, or a Companies Act/SEBI-defined promoter) pays ordinary
        // LTCG/STCG tax on the gain PLUS an additional tax calibrated so the
        // combined (base + additional) rate hits a fixed target — 30% for a
        // non-corporate promoter (individual/HUF/firm), 22% for a corporate
        // promoter (a company) — regardless of whether the gain was LTCG
        // (12.5%) or STCG (20%). A further 12% surcharge applies on the
        // ADDITIONAL tax only (not the base tax, not the total), irrespective
        // of the promoter's total income. Only applies to buy-back capital
        // gains taxed at the flat LTCG/STCG rates — NOT to the unlisted-
        // short-term slice, which is already slab-rate income, not one of
        // "the applicable rates" this provision layers onto (a scoped
        // simplification, not independently confirmed either way).
        PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE: 0.30,
        PROMOTER_BUYBACK_TARGET_RATE_CORPORATE: 0.22,
        PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE: 0.12,
        // s.128 (lottery/betting) / s.194 (online gaming): flat 30%,
        // no basic exemption, no Chapter VI-A deduction, no §156 rebate.
        RATE_115BB: 0.30,
        // s.115BBH (VDA/crypto, renumbers to §194 under ITA 2025 per TaxTMI's
        // "Clause 194 vs Section 115BBH" comparison) — flat 30%, no
        // deduction except cost of acquisition (already netted out before
        // this rate applies), no indexation, no exemption, no loss set-off
        // (not even VDA-vs-VDA), no carry-forward. Confirmed unchanged
        // through Budget 2025/2026 by multiple independent sources.
        RATE_115BBH: 0.30,
        // s.115E(1)(a) Chapter XII-A "investment income" (interest on a
        // specified debenture/deposit, dividend on specified shares —
        // renumbers to §214 under ITA 2025): flat 20%, no Chapter VI-A
        // deductions, no basic exemption. Multi-source-verified
        // (incometaxindia.gov.in bare-act text, TaxGuru, callmyca,
        // TaxTMI's §214-vs-s.115E comparison) unchanged since long before
        // Budget 2024 — only the LTCG leg of s.115E (RATE_115E_LTCG below,
        // same section, different clause) moved 10%->12.5% that year.
        // Ordinary surcharge (by total-income slab) and 4% cess apply on
        // top, same as any other special-rate income — nothing
        // Chapter-XII-A-specific overrides that.
        RATE_115E_INVESTMENT_INCOME: 0.20,
        // s.207 domestic default withholding rates on India-source dividend/
        // royalty/FTS paid to a NON-RESIDENT (no PE) — the baseline a DTAA-
        // elected rate (s.159) displaces when TRC/Form 41 support it.
        // Shared between computation.js (actual NR tax) and conflicts.js (the
        // treaty-election comparison text) so they can't drift apart.
        // Royalty/FTS was 10% (Finance Act 2013) until the Finance Act 2023
        // amendment DOUBLED it to 20%, effective 1 April 2023 (AY 2024-25) —
        // specifically to push non-residents toward claiming DTAA rates
        // (properly documented) instead of defaulting to domestic law.
        // NOTE: no "interest" entry here on purpose — ordinary NRO interest
        // isn't actually within s.207's scope (that's narrowly limited to
        // foreign-currency-borrowing interest under s.207 (narrowly, the foreign-currency-borrowing-interest limb)), so it has
        // no flat domestic rate to fall back to; see
        // computeNrInterestTreatment() in computation.js, which slab-taxes it
        // by default instead.
        S115A_RATES: { dividend: 0.20, royalty: 0.20, fts: 0.20 },
        // Surcharge brackets for individuals [income_over_inr, rate]
        SURCHARGE_IND: [
          [50000000, 0.25], [20000000, 0.25], [10000000, 0.15], [5000000, 0.10], [0, 0.00]
        ],
        SURCHARGE_CG_DIV_CAP: 0.15, // surcharge on 196/198/dividend capped at 15%
        SURCHARGE_NEW_MAX: 0.25,    // new regime caps top surcharge at 25%
        CESS_RATE: 0.04
      },
      US: {
        // TY2026 ordinary brackets by filing status (Rev. Proc. 2025-32);
        // [upper_bound_usd, rate]. OBBBA gives the bottom two brackets (10%/
        // 12%) an extra inflation bump (~4%) vs. ~2.3% for the rest.
        BRACKETS: {
          single: [[12400,0.10],[49840,0.12],[106250,0.22],[202850,0.24],[257540,0.32],[640600,0.35],[Infinity,0.37]],
          mfj:    [[24800,0.10],[100800,0.12],[211400,0.22],[403550,0.24],[512450,0.32],[768700,0.35],[Infinity,0.37]],
          mfs:    [[12400,0.10],[50400,0.12],[105700,0.22],[201775,0.24],[256225,0.32],[384350,0.35],[Infinity,0.37]],
          hoh:    [[17700,0.10],[67450,0.12],[105700,0.22],[201750,0.24],[256200,0.32],[640600,0.35],[Infinity,0.37]]
        },
        // OBBBA ("One Big Beautiful Bill Act", signed July 2025) raised these
        // above the pre-OBBBA/Rev. Proc. 2024-40 figures; TY2026 amounts per
        // Rev. Proc. 2025-32 (was 15750/31500/15750/23625 for TY2025).
        STD_DEDUCTION: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 },
        // Long-term cap-gains / qualified-dividend preferential brackets,
        // TY2026 (Rev. Proc. 2025-32). 0% up to br0, 15% up to br15, 20% above
        // (by taxable income).
        LTCG_BRACKETS: {
          single: { br0: 49450, br15: 545500 },
          mfj:    { br0: 98900, br15: 613700 },
          mfs:    { br0: 49450, br15: 306850 },
          hoh:    { br0: 66200, br15: 579600 }
        },
        // SALT cap under OBBBA: raised from a flat $10,000 (TCJA) to $40,000
        // ($20,000 MFS) for TY2025, then indexed +1%/year 2026-2029 —
        // TY2026 is $40,400 ($20,200 MFS), phased DOWN 30 cents per dollar of
        // MAGI above the threshold, floored at $10,000 — so high earners
        // still land back at the old cap. Reverts to a flat $10,000 with no
        // phase-down in 2030.
        SALT_CAP_BASE_USD: { single: 40400, mfj: 40400, mfs: 20200, hoh: 40400 },
        SALT_CAP_PHASEOUT_THRESHOLD_USD: { single: 505000, mfj: 505000, mfs: 252500, hoh: 505000 },
        SALT_CAP_PHASEOUT_RATE: 0.30,
        SALT_CAP_FLOOR_USD: 10000,
        NIIT_RATE: 0.038,
        ADDL_MEDICARE_RATE: 0.009,
        C_CORP_RATE: 0.21,
        // ---- Self-employment tax (Schedule SE) ----
        SE_NET_FACTOR: 0.9235,          // 92.35% of net SE earnings is SE-taxable
        SE_RATE_SS: 0.124,              // Social Security portion (capped)
        SE_RATE_MEDICARE: 0.029,        // Medicare portion (uncapped)
        SS_WAGE_BASE_USD: 184500,       // TY2026 Social Security wage base
        // ---- Qualified Business Income deduction (§199A), TY2026 ----
        // OBBBA widened the phase-in range itself (structural change, not just
        // inflation indexing) starting TY2026: $75,000 single/HoH/MFS and
        // $150,000 MFJ, up from $50,000/$100,000 for TY2025.
        QBI_RATE: 0.20,
        QBI_THRESHOLD: { single: 201750, mfj: 403500, mfs: 201750, hoh: 201750 },
        QBI_PHASEIN: { single: 75000, mfj: 150000, mfs: 75000, hoh: 75000 },
        // ---- Alternative Minimum Tax (§55), TY2026 ----
        // OBBBA restructured the AMT exemption phase-out starting TY2026: the
        // phase-out threshold drops back to ~2018 levels ($500k single/MFS/
        // HoH, $1,000,000 MFJ — down from the TY2025 TCJA-indexed $626,350/
        // $1,252,700) AND the phase-out rate doubles from 25% to 50% (see
        // AMT_PHASEOUT_RATE, applied in computeUsTax). Both changes make AMT
        // bite considerably more higher earners in TY2026 than TY2025.
        AMT_EXEMPTION: { single: 90100, mfj: 140200, mfs: 70100, hoh: 90100 },
        AMT_PHASEOUT: { single: 500000, mfj: 1000000, mfs: 500000, hoh: 500000 },
        AMT_PHASEOUT_RATE: 0.50,
        AMT_RATE_BREAK: 244500,         // 26% up to this AMT base, 28% above (MFS: half)
        AMT_RATE_LOW: 0.26,
        AMT_RATE_HIGH: 0.28,
        // ---- Child Tax Credit (§24) — OBBBA made $2,200/child (up from
        // $2,000) permanent, indexed thereafter; the indexing formula rounds
        // down to the nearest $100 and TY2026 inflation wasn't enough to move
        // it, so it's still $2,200 for TY2026 (confirmed via Rev. Proc.
        // 2025-32). Phases out $50 per $1,000 (or fraction) of MAGI over the
        // threshold (not itself indexed). Up to $1,700/child is refundable
        // (Additional CTC, also unchanged for TY2026) at 15% of earned income
        // over $2,500.
        CTC_PER_CHILD_USD: 2200,
        CTC_PHASEOUT_THRESHOLD_USD: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000 },
        CTC_PHASEOUT_PER_1000_USD: 50,
        CTC_REFUNDABLE_MAX_PER_CHILD_USD: 1700,
        CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD: 2500,
        CTC_REFUNDABLE_RATE: 0.15,
        // ---- OBBBA "senior deduction" (temporary, TY2025-2028) — $6,000 per
        // taxpayer age 65+ by year end (stacks with std/itemized deduction),
        // phased out 6% of MAGI over the threshold. MFS filers are entirely
        // ineligible (not merely a smaller/halved amount) — see
        // computeUsTax's isSenior check. This engine only has the primary
        // taxpayer's DOB (no spouse DOB field in Layer 1 US), so a second
        // $6,000 for an also-65+ spouse on a MFJ return is not modeled.
        SENIOR_DEDUCTION_MIN_AGE: 65,
        SENIOR_DEDUCTION_PER_PERSON_USD: 6000,
        SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD: { single: 75000, mfj: 150000, hoh: 75000 },
        SENIOR_DEDUCTION_PHASEOUT_RATE: 0.06,
        // ---- OBBBA "no tax on tips" / "no tax on overtime" deductions
        // (temporary, TY2025-2028) — above-the-line deductions (available
        // whether or not the taxpayer itemizes), phased out $100 per $1,000
        // of MAGI over the threshold. MFS filers are entirely ineligible for
        // both. Tips cap is a flat $25,000 regardless of filing status;
        // overtime cap is $12,500 single/HoH or $25,000 MFJ (the "half-time"
        // FLSA §7 premium portion only, not the full overtime wage).
        TIPS_DEDUCTION_MAX_USD: 25000,
        OVERTIME_DEDUCTION_MAX_USD: { single: 12500, mfj: 25000, hoh: 12500 },
        TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD: { single: 150000, mfj: 300000, hoh: 150000 },
        TIPS_OVERTIME_PHASEOUT_PER_1000_USD: 100
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
    {
      id: "form_8959",
      jurisdiction: "US",
      name: "IRS Form 8959 (Additional Medicare Tax)",
      desc: "Additional 0.9% Medicare tax on wages/SE income above the filing-status threshold, and reconciles employer over/under-withholding.",
      why: "Additional Medicare Tax is owed and is not offset by the Foreign Tax Credit.",
      severity: CONST.SEVERITY.INFO
    },
    // ---------------------------- India side -----------------------------
    {
      id: "form_67",
      jurisdiction: "IN",
      name: "Form 44 (India FTC)",
      desc: "Statement of foreign income & foreign tax, filed before the ITR due date.",
      why: "Foreign (US) income is being offered to tax in India and FTC u/s 90/91 is claimed. Schedule FSI/TR must accompany the ITR.",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "trc",
      jurisdiction: "IN",
      name: "Tax Residency Certificate (TRC)",
      desc: "Issued by the other contracting state (IRS Form 6166 for the US).",
      why: "DTAA relief / treaty rate is being claimed — a TRC is mandatory u/s 159(8).",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_10f",
      jurisdiction: "IN",
      name: "Form 41",
      desc: "Self-declaration accompanying the TRC, filed electronically on the ITR portal.",
      why: "Treaty benefit claimed and the TRC does not contain all particulars required u/r 75.",
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

/* ============================================================================
 * WISING — India-US Tax Conflict Detection Tool
 * Layer 2 Engine :: constants.js
 * ----------------------------------------------------------------------------
 * Central catalogue of FX assumptions, statutory monetary thresholds and the
 * document-filing rule-book. Everything that is a "magic number" in cross-border
 * India/US tax lives here so the computation and conflict engines stay readable
 * and the assumptions are auditable by a tax professional in one place.
 *
 * Canonical home as of docs/GAP_TRACKER.md section H.9 (21 Jul 2026): this is
 * reference DATA, not computation logic, so it lives with the DAG
 * (prototypes/graph-pilot), not engine/ — edit it here, only here. As of the
 * full engine freeze (docs/DAG_MIGRATION_TRACKER.md section I, 23 Jul 2026)
 * engine/constants.js no longer exists — router.html/layer1_*.html load
 * this file directly, and the classic engine's own frozen copy (a
 * permanent, no-longer-updated snapshot) lives at archive/engine-frozen/.
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

      // RBI NRO-account repatriation ceiling — USD 1,000,000 per individual /
      // FY, subject to Form 15CA/15CB (Form 145/146 from TY2026-27).
      NRO_REPATRIATION_ANNUAL_USD: 1000000,

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
        // s.80DD/80U flat statutory amounts by disability severity, and the
        // s.80DDB medical-expense cap by patient age band — promoted here
        // from normalize.js-local literals (SYS-1) so the engine and the
        // DAG (prototypes/graph-pilot) share one authoritative copy.
        S80DD_U_FLAT_INR: { standard: 75000, severe: 125000 },
        S80DDB_CAP_INR: { normal: 40000, senior: 100000 },
        // s.32 WDV depreciation rates by Layer 1 asset class, and the
        // capital-gains classification groups (Group A: STT-paid equity-class
        // s.196/198; Group C: slab-rate debt-class) — promoted here from
        // normalize.js-local literals (SYS-1) so engine and DAG share one copy.
        ASSET_CLASS_RATES_INDIA: {
          building_residential: 0.05, building_commercial: 0.10, building_temporary: 0.40,
          plant_machinery_general: 0.15, plant_machinery_motor_cars: 0.15,
          plant_machinery_commercial_vehicles: 0.30, plant_machinery_computers: 0.40,
          plant_machinery_books: 0.40, plant_machinery_pollution: 0.40,
          ships: 0.20, intangible_assets: 0.25
        },
        CG_GROUP_A_CLASSES: ["listed_equity", "equity_mutual_fund", "hybrid_mf_equity", "reit_invit", "etf"],
        CG_GROUP_C_CLASSES: ["debt_mutual_fund_pre_apr23", "hybrid_mf_debt", "international_mf", "fof"],
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
        // ---- §1(h)(4) collectibles gain: LTCG only, capped at 28% (never
        // gets 0/15/20% treatment) ----
        COLLECTIBLES_RATE: 0.28,
        // ---- §1202 QSBS exclusion. OBBBA (H.R.1, signed 4 Jul 2025)
        // replaced the old 5-year-cliff/100%-exclusion/$10M-cap regime with
        // a tiered 3/4/5-year 50%/75%/100% exclusion and a $15M cap, but
        // ONLY for stock acquired on or after 5 Jul 2025 (the day after
        // enactment) -- stock acquired earlier keeps the old cliff rule
        // (assuming acquisition after 27 Sep 2010, the last date the
        // exclusion was less than 100% under prior law -- realistic for any
        // stock still held into TY2026). Exclusion cap is always the
        // GREATER of the flat dollar cap or 10x the taxpayer's adjusted
        // basis in the stock (§1202(b)(1)(A)/(B)).
        QSBS_OBBBA_EFFECTIVE_DATE: "2025-07-05",
        QSBS_PRE_OBBBA_CAP_USD: 10000000,
        QSBS_OBBBA_CAP_USD: 15000000,
        QSBS_OBBBA_TIERS: [{ years: 5, pct: 1.00 }, { years: 4, pct: 0.75 }, { years: 3, pct: 0.50 }],
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
        // ---- Social Security benefit taxability (s.86) ----
        // "Provisional income" (a.k.a. combined income) test: base/
        // additional thresholds, UNLIKE nearly every other figure in this
        // file, are NOT inflation-indexed — fixed by statute since 1984
        // (base) and 1993 (additional) and unchanged by OBBBA (which added
        // the separate $6,000 senior deduction instead of touching s.86).
        // No expiry/re-verification needed the way bracket/exemption
        // figures do. MFS who lived WITH their spouse at any point in the
        // year gets $0/$0 (85% of benefits taxable from the first dollar,
        // no exclusion at all) — the favorable "lived apart all year"
        // exception uses the single thresholds instead, but Layer 1 US
        // doesn't capture that fact, so MFS conservatively uses the $0/$0
        // punitive default rather than assuming the exception applies.
        SS_PROVISIONAL_INCOME_BASE_USD: { single: 25000, mfj: 32000, mfs: 0, hoh: 25000 },
        SS_PROVISIONAL_INCOME_ADDITIONAL_USD: { single: 34000, mfj: 44000, mfs: 0, hoh: 34000 },
        SS_TAXABLE_TIER1_RATE: 0.5,
        SS_TAXABLE_TIER2_RATE: 0.85,
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
        // §24(h)(4) Credit for Other Dependents (ODC): $500/dependent, flat
        // (not inflation-indexed, unchanged since 2018), sharing the SAME
        // combined phase-out with CTC under §24(h)(3) -- but with NO
        // refundable/Additional-CTC component at all.
        ODC_PER_DEPENDENT_USD: 500,
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
      // ---- US state individual income tax (TY2025, returns filed 2026) ----
      // Only CA and NY are modeled — Layer 1 US only collects dedicated
      // statutory-residency-test facts (state_residency.ca_*, .ny_*) for
      // these two states; every other state on the dropdown is a bare
      // domicile string with no residency-test data to key a computation
      // off of. Single/MFJ only — Layer 1's 9 demo profiles never use HOH/
      // MFS, and this engine's own bracket tables for those two statuses
      // could not be independently verified against a second source this
      // session, so they are left unmodeled rather than guessed (see
      // computeUsStateTax's status fallback).
      US_STATES: {
        CA: {
          NAME: "California",
          FORM_NAME: "Form 540",
          // FTB 2025 Schedule X, single/MFS filers; MFJ/HOH/QSS thresholds
          // are exactly 2x single throughout.
          BRACKETS: {
            single: [[11079,0.01],[26264,0.02],[41452,0.04],[57542,0.06],[72724,0.08],[371479,0.093],[445771,0.103],[742953,0.113],[Infinity,0.123]],
            mfj:    [[22158,0.01],[52528,0.02],[82904,0.04],[115084,0.06],[145448,0.08],[742958,0.093],[891542,0.103],[1485906,0.113],[Infinity,0.123]]
          },
          STD_DEDUCTION: { single: 5706, mfj: 11412 },
          // Personal exemption CREDIT (subtracted from tax, not income), FTB 2025.
          EXEMPTION_CREDIT_USD: { single: 153, mfj: 307 },
          DEPENDENT_CREDIT_USD: 475,
          // Mental Health Services Tax: flat 1% on taxable income over $1M,
          // NOT doubled for MFJ (same $1M threshold regardless of status) —
          // this is what produces CA's well-known 13.3% marginal top rate.
          SURCHARGE_THRESHOLD_USD: 1000000,
          SURCHARGE_RATE: 0.01,
          SURCHARGE_LABEL: "Mental Health Services Tax (1% over $1,000,000, not doubled for MFJ)"
        },
        NY: {
          NAME: "New York",
          FORM_NAME: "Form IT-201",
          // NYS Dept. of Taxation & Finance 2025 rate schedule.
          BRACKETS: {
            single: [[8500,0.04],[11700,0.045],[13900,0.0525],[80650,0.055],[215400,0.06],[1077550,0.0685],[5000000,0.0965],[25000000,0.103],[Infinity,0.109]],
            mfj:    [[17150,0.04],[23600,0.045],[27900,0.0525],[161550,0.055],[323200,0.06],[2155350,0.0685],[5000000,0.0965],[25000000,0.103],[Infinity,0.109]]
          },
          STD_DEDUCTION: { single: 8000, mfj: 16050 },
          // NY dropped a personal exemption for filer/spouse decades ago;
          // only the $1,000/dependent exemption survives, taken against
          // income (not a credit, unlike CA's).
          DEPENDENT_EXEMPTION_USD: 1000
        }
      },
      // ---- entity (business) corporate rates ----
      // Domestic-company-only elections (s.115BA/115BAA/115BAB) and the
      // domestic default schedule — a FOREIGN company (not incorporated in
      // India, whether or not it's resident via POEM) is never eligible for
      // any of these regardless of what's on file; see INDIA_COMPANY_FOREIGN
      // below, verified 2026-07-15, re-check each Finance Act cycle.
      INDIA_COMPANY: {
        RATE_115BAB: 0.15, SURCHARGE_115BAB: 0.10,   // domestic co, new manufacturing (s.115BAB)
        RATE_115BAA: 0.22, SURCHARGE_115BAA: 0.10,   // domestic co, no incentives
        RATE_115BA: 0.25,                            // domestic co, manufacturing (s.115BA) — flat, no turnover test
        RATE_TURNOVER_LTE_400CR: 0.25,                // default (no election): turnover-gated
        RATE_DEFAULT: 0.30,
        SURCHARGE_OVER_1CR: 0.07, SURCHARGE_OVER_10CR: 0.12,
        MAT_RATE: 0.15, CESS_RATE: 0.04
      },
      // Foreign company (not incorporated in India — POEM can still make it
      // an Indian TAX RESIDENT, taxed on worldwide income, but incorporation
      // alone controls which RATE schedule applies, not residency). Flat
      // 35% (cut from 40% by the Finance Act 2025, effective this same
      // AY2026-27 — verified 2026-07-15, re-check each Finance Act cycle),
      // lower surcharge slabs than the domestic schedule, same 4% cess.
      // s.115JB(4A)/(4C) MAT exemption applies when the company has no
      // India PE (approximated here on that single fact — the fuller
      // DTAA-residence/no-Companies-Act-registration distinction in the
      // statute isn't modeled, same Phase-0-floor precision convention as
      // the rest of this engine's MAT/AMT handling).
      INDIA_COMPANY_FOREIGN: {
        RATE: 0.35, SURCHARGE_OVER_1CR: 0.02, SURCHARGE_OVER_10CR: 0.05,
        MAT_RATE: 0.15, CESS_RATE: 0.04
      },
      INDIA_FIRM: { RATE: 0.30, SURCHARGE_OVER_1CR: 0.12, CESS_RATE: 0.04 },
      // ---- US depreciation (MACRS/§179/bonus) — Sch C/F asset rows ----
      // §179: OBBBA raised both the cap and phase-out threshold, now
      // permanent parts of the code and inflation-adjusted annually — TY2026
      // figures ($2,560,000 / $4,090,000) verified 2026-07-15 (IRS Rev.
      // Proc., re-check each filing season). Layer 1 US's OWN local preview
      // calculators still hardcode the stale pre-OBBBA 2024 figures
      // ($1,200,000 / $3,000,000) in three separate places — this engine
      // deliberately does NOT trust that copy.
      US_SEC179_MAX_USD: 2560000,
      US_SEC179_PHASEOUT_THRESHOLD_USD: 4090000,
      // Bonus depreciation: OBBBA permanently restored 100% for qualified
      // property placed in service after 19 Jan 2025 (was on a TCJA
      // phase-down to 0% by 2027) — so every asset in scope for this
      // TY2026 engine gets 100%, not the 20% Layer 1's own UI copy/preview
      // calculators still hardcode (labeled there as "the 2026 rate").
      US_BONUS_DEPRECIATION_RATE: 1.00,
      // IRS Pub 946 Table A-1 (200%-declining-balance, half-year convention)
      // for 3/5/7-year property, and the 150%-DB-derived table for 15-year
      // property — stable, unchanged for decades. Year-1 values match
      // Layer 1's own hardcoded first-year-only rates exactly (33.33/20.00/
      // 14.29/5.00%), confirming table selection; years 2+ are this
      // engine's own addition (Layer 1 has no multi-year table at all).
      US_MACRS_HALF_YEAR: {
        "3-year":  [0.3333, 0.4445, 0.1481, 0.0741],
        "5-year":  [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576],
        "7-year":  [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446],
        "15-year": [0.0500, 0.0950, 0.0855, 0.0770, 0.0693, 0.0623, 0.0590, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590, 0.0591, 0.0295]
      },
      // Straight-line classes — full annual rate; §179/bonus categorically
      // ineligible for these (real property + intangible amortization),
      // matching Layer 1's own eligibility gating exactly.
      US_MACRS_STRAIGHT_LINE_ANNUAL: { "27.5-year": 1 / 27.5, "39-year": 1 / 39, "amortization-15": 1 / 15 }
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
    {
      id: "form_540",
      jurisdiction: "US",
      name: "California Form 540 (Resident Income Tax Return)",
      desc: "California state income tax return — computed on worldwide income for a full-year CA resident, including Indian-source income. CA grants no credit for tax paid to a foreign country.",
      why: "State-of-residence facts on file point to California, and CA taxes worldwide income independently of the federal treaty position.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_it201",
      jurisdiction: "US",
      name: "New York Form IT-201 (Resident Income Tax Return)",
      desc: "New York state income tax return — computed on worldwide income for a full-year NY resident, including Indian-source income. NY grants no credit for tax paid to a foreign country.",
      why: "State-of-residence facts on file point to New York, and NY taxes worldwide income independently of the federal treaty position.",
      severity: CONST.SEVERITY.WARNING
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
      name: "Form 145 / Form 146 (was 15CA / 15CB)",
      desc: "Remittance certificates for foreign outward remittances.",
      why: "Outward remittances under LRS / to non-residents were made during the year. Renumbered from Form 15CA/15CB effective 1 Apr 2026 under the Income-tax Rules, 2026 (Rule 220) — the old numbers still apply to remittances made before that date.",
      severity: CONST.SEVERITY.INFO
    },
    {
      id: "schedule_al",
      jurisdiction: "IN",
      name: "Schedule AL (Assets & Liabilities)",
      desc: "Disclosure of assets and liabilities at cost, filed with the ITR.",
      why: "Total income exceeds ₹50 lakh — Schedule AL is mandatory at this threshold u/s 139(1) (ITR-2/3/5 filers).",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_3cb_3cd",
      jurisdiction: "IN",
      name: "Form 3CB / 3CD (Tax Audit Report)",
      desc: "Chartered Accountant's tax-audit report and statement of particulars, filed before the ITR due date.",
      why: "Business turnover exceeds the s.44AB tax-audit threshold (₹1 crore, or ₹10 crore where cash receipts and payments are each ≤5% of the total).",
      severity: CONST.SEVERITY.CRITICAL
    },
    {
      id: "form_8802",
      jurisdiction: "US",
      name: "IRS Form 8802 (Application for US Residency Certification)",
      desc: "Application to the IRS for Form 6166 — the US residency certificate India's TRC requirement expects the other contracting state to issue.",
      why: "DTAA relief is being claimed on Indian-source income — Form 6166 must be requested via Form 8802 before it can be filed with the Indian TRC/Form 41 paperwork; IRS processing typically takes 4-6+ weeks, so file well ahead of the India due date.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_6251",
      jurisdiction: "US",
      name: "IRS Form 6251 (Alternative Minimum Tax)",
      desc: "Computes AMT and reconciles it against regular tax liability.",
      why: "AMT preference items (commonly an ISO exercise, or the SALT-cap add-back) push tentative minimum tax above the regular tax for the year.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_8288",
      jurisdiction: "US",
      name: "IRS Form 8288 / 8288-A / 8288-B (FIRPTA Withholding)",
      desc: "Withholding certificate and returns for a foreign person's disposition of US real property.",
      why: "A US real property interest was disposed of by a foreign person — 15% FIRPTA withholding applies at closing unless a Form 8288-B withholding certificate reduces it.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_3ceb",
      jurisdiction: "IN",
      name: "Form 3CEB (Transfer Pricing Certification)",
      desc: "Chartered Accountant's report on international transactions with associated enterprises, filed before the ITR due date u/s 92E.",
      why: "A cross-border related-party ownership relationship is on file — international transactions with that entity must be reported and certified, independent of whether pricing is at arm's length.",
      severity: CONST.SEVERITY.WARNING
    },
    {
      id: "form_26as_ais_tis",
      jurisdiction: "IN",
      name: "Form 26AS / AIS / TIS",
      desc: "Annual tax-credit statement (26AS) and the Annual/Taxpayer Information Statements — the pre-filled record every ITR should be reconciled against before filing.",
      why: "Indian income is on file for this taxpayer — TDS, advance tax and reported high-value transactions should be cross-checked against these statements before the return is filed.",
      severity: CONST.SEVERITY.INFO
    },
    {
      id: "form_16_16a",
      jurisdiction: "IN",
      name: "Form 16 / Form 16A (TDS Certificates)",
      desc: "Salary (Form 16) and non-salary (Form 16A) TDS certificates issued by each deductor.",
      why: "Indian income subject to TDS is on file — hold the certificate from each deductor to reconcile against Form 26AS/AIS and support the credit claimed in the ITR.",
      severity: CONST.SEVERITY.INFO
    },
    {
      id: "lrs_form_a2",
      jurisdiction: "IN",
      name: "LRS Form A2 (Outward Remittance Declaration)",
      desc: "Declaration furnished to the remitting bank for each outward remittance under the Liberalised Remittance Scheme.",
      why: "Outward remittances under LRS were made this year — each remittance requires its own Form A2 filed with the bank at the time of transfer, separate from the annual Form 145/146 (was 15CA/15CB) return-time reporting.",
      severity: CONST.SEVERITY.INFO
    },
    {
      id: "form_4868",
      jurisdiction: "US",
      name: "IRS Form 4868 (Extension Request)",
      desc: "Automatic 6-month extension of time to file (not to pay) the US return.",
      why: "Must be filed by the original due date to legally reach the extended deadline already on your Compliance Calendar — the extension does not happen automatically.",
      severity: CONST.SEVERITY.INFO
    }
  ];

  WISING.CONST = CONST;

  /* ==========================================================================
   * ClientRegistry — per-client Layer 0/1 storage isolation ("+ Add Client").
   * Browser-only (uses localStorage/location/document) — irrelevant to the
   * Node-side DAG computation, so it's attached directly to WISING here
   * rather than exported via module.exports below.
   *
   * The classic single "live" slot (CONST.STORAGE_KEYS.ROUTER/INDIA/US) is
   * unchanged default behavior for router.html/layer1_*.html opened plain,
   * with no query string — existing bookmarks/demo flows keep working
   * exactly as before. When the Monitor's "+ Add Client" button opens
   * router.html?client=<id> in a new tab, EVERY read/write of router/india/us
   * state on that page (and any layer1_*.html/router.html page reached by
   * following an in-page link, since the id is propagated onto same-page-set
   * links automatically — see propagateClientParamInLinks below) is scoped
   * to that one client's own namespaced keys instead of the shared global
   * ones — so two clients' Layer 0/1 data can never cross-contaminate, even
   * with several tabs open for different clients at once. Demo profiles
   * (PROFILES/SAMPLE, engine/profiles.js) are untouched by any of this —
   * they're plain in-memory objects, never read/write localStorage at all.
   * ==========================================================================*/
  var CLIENT_REGISTRY_KEY = "wising_client_registry";
  var CLIENT_LINK_TARGETS = ["router.html", "layer1_india.html", "layer1_us.html"];

  function activeClientIdFromUrl() {
    try {
      if (typeof root.location === "undefined" || !root.URLSearchParams) return null;
      return new root.URLSearchParams(root.location.search).get("client") || null;
    } catch (e) { return null; }
  }

  function clientScopedKey(which, clientId) {
    return "wising_client_" + clientId + "_" + which.toLowerCase();
  }

  // The key a Layer 0/1 page should actually read/write for `which`
  // ("ROUTER"|"INDIA"|"US") given THIS page's own URL — falls back to the
  // shared global key with no ?client= param present (unchanged behavior).
  function storageKeyFor(which) {
    var id = activeClientIdFromUrl();
    return id ? clientScopedKey(which, id) : CONST.STORAGE_KEYS[which];
  }

  function listClients() {
    try {
      var raw = root.localStorage.getItem(CLIENT_REGISTRY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveClientRegistry(list) {
    try { root.localStorage.setItem(CLIENT_REGISTRY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  // Generates a new stable client id, registers it (placeholder label —
  // updateLabel below keeps it in sync with the real name once Layer 0 is
  // saved), and returns the id. Does NOT write any router/india/us data —
  // those keys simply don't exist yet, which getRawState below already
  // treats as "blank client," so there's nothing to clear/reset.
  function createClient() {
    var id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var list = listClients();
    list.push({ id: id, label: "New client", createdAt: new Date().toISOString() });
    saveClientRegistry(list);
    return id;
  }

  function removeClient(clientId) {
    try {
      root.localStorage.removeItem(clientScopedKey("ROUTER", clientId));
      root.localStorage.removeItem(clientScopedKey("INDIA", clientId));
      root.localStorage.removeItem(clientScopedKey("US", clientId));
    } catch (e) { /* ignore */ }
    saveClientRegistry(listClients().filter(function (c) { return c.id !== clientId; }));
  }

  function updateClientLabel(clientId, label) {
    var list = listClients(), found = false;
    list.forEach(function (c) { if (c.id === clientId) { c.label = label; found = true; } });
    if (found) saveClientRegistry(list);
  }

  // Reads one client's raw {router, india, us} state directly by id —
  // bypassing the shared global keys entirely, usable from anywhere (the
  // Monitor computing every registry client's summary, not just the one
  // page.jsx currently has open via ?client=).
  function getClientRawState(clientId) {
    function read(key) {
      try { var raw = root.localStorage.getItem(key); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
    }
    return {
      router: read(clientScopedKey("ROUTER", clientId)),
      india: read(clientScopedKey("INDIA", clientId)),
      us: read(clientScopedKey("US", clientId))
    };
  }

  // Rewrites every same-page-set <a href="router.html|layer1_india.html|
  // layer1_us.html"> on THIS page to carry ?client=<id> forward, so
  // clicking between Layer 0/1 pages while editing one client never
  // silently drops back to the shared global slot. No-op with no active
  // client id (plain/demo usage, unchanged). Run once on DOMContentLoaded.
  function propagateClientParamInLinks() {
    var id = activeClientIdFromUrl();
    if (!id || typeof root.document === "undefined" || !root.document.querySelectorAll) return;
    var anchors = root.document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute("href");
      if (CLIENT_LINK_TARGETS.indexOf(href) !== -1) {
        anchors[i].setAttribute("href", href + "?client=" + encodeURIComponent(id));
      }
    }
  }

  // For the rare JS-driven navigation (window.location.href = '...') that
  // can't be caught by the anchor-rewrite pass above — carries the active
  // client id forward the same way.
  function navigateWithClient(targetHtml) {
    var id = activeClientIdFromUrl();
    root.location.href = id ? (targetHtml + "?client=" + encodeURIComponent(id)) : targetHtml;
  }

  WISING.ClientRegistry = {
    activeIdFromUrl: activeClientIdFromUrl,
    storageKeyFor: storageKeyFor,
    list: listClients,
    create: createClient,
    remove: removeClient,
    updateLabel: updateClientLabel,
    getRawState: getClientRawState,
    propagateLinks: propagateClientParamInLinks,
    navigate: navigateWithClient
  };

  if (typeof root.document !== "undefined") {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", propagateClientParamInLinks);
    } else {
      propagateClientParamInLinks();
    }
  }

  // CommonJS export for direct require() — the DAG (prototypes/graph-pilot)
  // imports the SAME tables instead of hand-copying them (SYS-1 in
  // docs/DAG_MIGRATION_TRACKER.md). No behavior change for the browser
  // script-tag path above.
  if (typeof module !== "undefined" && module.exports) module.exports = { CONST: CONST };
})(typeof window !== "undefined" ? window : globalThis);

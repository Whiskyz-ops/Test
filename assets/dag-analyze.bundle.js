"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // prototypes/graph-pilot/constants.js
  var require_constants = __commonJS({
    "prototypes/graph-pilot/constants.js"(exports, module) {
      (function(root) {
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
            INR_PER_USD: 83,
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
            FBAR_AGGREGATE_USD: 1e4,
            // FATCA / Form 8938 — varies by filing status & residence. The Layer 1
            // US form uses the "living abroad" figures; we encode the full table.
            FORM_8938: {
              US_RESIDENT_SINGLE: { lastDay: 5e4, anyTime: 75e3 },
              US_RESIDENT_MFJ: { lastDay: 1e5, anyTime: 15e4 },
              ABROAD_SINGLE: { lastDay: 2e5, anyTime: 3e5 },
              ABROAD_MFJ: { lastDay: 4e5, anyTime: 6e5 }
            },
            // RBI Liberalised Remittance Scheme — USD 250,000 per individual / FY.
            LRS_ANNUAL_USD: 25e4,
            // RBI NRO-account repatriation ceiling — USD 1,000,000 per individual /
            // FY, subject to Form 15CA/15CB (Form 145/146 from TY2026-27).
            NRO_REPATRIATION_ANNUAL_USD: 1e6,
            // Foreign Earned Income Exclusion (Form 2555) — TY2026 figure (was
            // $130,000 for TY2025).
            FEIE_MAX_USD: 132900,
            // Net Investment Income Tax (3.8%) MAGI thresholds — fixed by statute
            // since 2013, NOT indexed for inflation (confirmed unchanged by OBBBA).
            NIIT_THRESHOLD: { single: 2e5, mfj: 25e4, mfs: 125e3, hoh: 2e5 },
            // Additional Medicare Tax (0.9%) wage thresholds.
            ADDL_MEDICARE_THRESHOLD: { single: 2e5, mfj: 25e4, mfs: 125e3 },
            // Foreign gift reporting (Form 3520) — from non-resident individuals.
            FOREIGN_GIFT_REPORTING_USD: 1e5,
            // §84 / §86 India capital-gains reinvestment cap (informational).
            INDIA_54EC_CAP_INR: 5e6,
            // Section 530A "Trump Accounts" (OBBBA) — custodial accounts for
            // US-citizen children under 18 with an SSN. Contributions (other than
            // the federal seed) cannot be accepted before this launch date; the
            // annual cap is per child, combined across all contributors. The
            // one-time federal seed contribution is separate from and doesn't
            // count against the annual cap, and is only available for children
            // born in the given window.
            TRUMP_ACCOUNT_LAUNCH_DATE: "2026-07-04",
            TRUMP_ACCOUNT_ANNUAL_CAP_USD: 5e3,
            TRUMP_ACCOUNT_FEDERAL_SEED_USD: 1e3,
            TRUMP_ACCOUNT_SEED_BIRTH_YEAR_MIN: 2025,
            TRUMP_ACCOUNT_SEED_BIRTH_YEAR_MAX: 2028
          },
          // ---- Tax-year calendars ----------------------------------------------
          CALENDAR: {
            INDIA_FY: { startMonth: 4, label: "Apr 1 \u2013 Mar 31 (Tax Year)" },
            US_CY: { startMonth: 1, label: "Jan 1 \u2013 Dec 31 (Calendar Year)" },
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
                [4e5, 0],
                [8e5, 0.05],
                [12e5, 0.1],
                [16e5, 0.15],
                [2e6, 0.2],
                [24e5, 0.25],
                [Infinity, 0.3]
              ],
              SLABS_OLD: [
                [25e4, 0],
                [5e5, 0.05],
                [1e6, 0.2],
                [Infinity, 0.3]
              ],
              STD_DEDUCTION_SALARY_NEW_INR: 75e3,
              STD_DEDUCTION_SALARY_OLD_INR: 5e4,
              // §156 rebate
              REBATE_87A_NEW: { incomeCap: 12e5, maxRebate: 6e4 },
              REBATE_87A_OLD: { incomeCap: 5e5, maxRebate: 12500 },
              // Chapter VI-A caps (OLD regime). NEW regime disallows most of these.
              DEDUCTION_CAPS_OLD: { s80C: 15e4, s80CCD1B: 5e4, s80D_self: 25e3, s80D_parents_senior: 5e4 },
              // Special rates (post 23-Jul-2024)
              STCG_111A_RATE: 0.2,
              LTCG_112A_RATE: 0.125,
              LTCG_112A_EXEMPT_INR: 125e3,
              // s.80DD/80U flat statutory amounts by disability severity, and the
              // s.80DDB medical-expense cap by patient age band — promoted here
              // from normalize.js-local literals (SYS-1) so the engine and the
              // DAG (prototypes/graph-pilot) share one authoritative copy.
              S80DD_U_FLAT_INR: { standard: 75e3, severe: 125e3 },
              S80DDB_CAP_INR: { normal: 4e4, senior: 1e5 },
              // s.32 WDV depreciation rates by Layer 1 asset class, and the
              // capital-gains classification groups (Group A: STT-paid equity-class
              // s.196/198; Group C: slab-rate debt-class) — promoted here from
              // normalize.js-local literals (SYS-1) so engine and DAG share one copy.
              ASSET_CLASS_RATES_INDIA: {
                building_residential: 0.05,
                building_commercial: 0.1,
                building_temporary: 0.4,
                plant_machinery_general: 0.15,
                plant_machinery_motor_cars: 0.15,
                plant_machinery_commercial_vehicles: 0.3,
                plant_machinery_computers: 0.4,
                plant_machinery_books: 0.4,
                plant_machinery_pollution: 0.4,
                ships: 0.2,
                intangible_assets: 0.25
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
              PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE: 0.3,
              PROMOTER_BUYBACK_TARGET_RATE_CORPORATE: 0.22,
              PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE: 0.12,
              // s.128 (lottery/betting) / s.194 (online gaming): flat 30%,
              // no basic exemption, no Chapter VI-A deduction, no §156 rebate.
              RATE_115BB: 0.3,
              // s.115BBH (VDA/crypto, renumbers to §194 under ITA 2025 per TaxTMI's
              // "Clause 194 vs Section 115BBH" comparison) — flat 30%, no
              // deduction except cost of acquisition (already netted out before
              // this rate applies), no indexation, no exemption, no loss set-off
              // (not even VDA-vs-VDA), no carry-forward. Confirmed unchanged
              // through Budget 2025/2026 by multiple independent sources.
              RATE_115BBH: 0.3,
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
              RATE_115E_INVESTMENT_INCOME: 0.2,
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
              S115A_RATES: { dividend: 0.2, royalty: 0.2, fts: 0.2 },
              // Surcharge brackets for individuals [income_over_inr, rate]
              SURCHARGE_IND: [
                [5e7, 0.25],
                [2e7, 0.25],
                [1e7, 0.15],
                [5e6, 0.1],
                [0, 0]
              ],
              SURCHARGE_CG_DIV_CAP: 0.15,
              // surcharge on 196/198/dividend capped at 15%
              SURCHARGE_NEW_MAX: 0.25,
              // new regime caps top surcharge at 25%
              CESS_RATE: 0.04
            },
            US: {
              // TY2026 ordinary brackets by filing status (Rev. Proc. 2025-32);
              // [upper_bound_usd, rate]. OBBBA gives the bottom two brackets (10%/
              // 12%) an extra inflation bump (~4%) vs. ~2.3% for the rest.
              BRACKETS: {
                single: [[12400, 0.1], [49840, 0.12], [106250, 0.22], [202850, 0.24], [257540, 0.32], [640600, 0.35], [Infinity, 0.37]],
                mfj: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
                mfs: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]],
                hoh: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]]
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
                mfj: { br0: 98900, br15: 613700 },
                mfs: { br0: 49450, br15: 306850 },
                hoh: { br0: 66200, br15: 579600 }
              },
              // SALT cap under OBBBA: raised from a flat $10,000 (TCJA) to $40,000
              // ($20,000 MFS) for TY2025, then indexed +1%/year 2026-2029 —
              // TY2026 is $40,400 ($20,200 MFS), phased DOWN 30 cents per dollar of
              // MAGI above the threshold, floored at $10,000 — so high earners
              // still land back at the old cap. Reverts to a flat $10,000 with no
              // phase-down in 2030.
              SALT_CAP_BASE_USD: { single: 40400, mfj: 40400, mfs: 20200, hoh: 40400 },
              SALT_CAP_PHASEOUT_THRESHOLD_USD: { single: 505e3, mfj: 505e3, mfs: 252500, hoh: 505e3 },
              SALT_CAP_PHASEOUT_RATE: 0.3,
              SALT_CAP_FLOOR_USD: 1e4,
              NIIT_RATE: 0.038,
              ADDL_MEDICARE_RATE: 9e-3,
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
              SS_PROVISIONAL_INCOME_BASE_USD: { single: 25e3, mfj: 32e3, mfs: 0, hoh: 25e3 },
              SS_PROVISIONAL_INCOME_ADDITIONAL_USD: { single: 34e3, mfj: 44e3, mfs: 0, hoh: 34e3 },
              SS_TAXABLE_TIER1_RATE: 0.5,
              SS_TAXABLE_TIER2_RATE: 0.85,
              // ---- Self-employment tax (Schedule SE) ----
              SE_NET_FACTOR: 0.9235,
              // 92.35% of net SE earnings is SE-taxable
              SE_RATE_SS: 0.124,
              // Social Security portion (capped)
              SE_RATE_MEDICARE: 0.029,
              // Medicare portion (uncapped)
              SS_WAGE_BASE_USD: 184500,
              // TY2026 Social Security wage base
              // ---- Qualified Business Income deduction (§199A), TY2026 ----
              // OBBBA widened the phase-in range itself (structural change, not just
              // inflation indexing) starting TY2026: $75,000 single/HoH/MFS and
              // $150,000 MFJ, up from $50,000/$100,000 for TY2025.
              QBI_RATE: 0.2,
              QBI_THRESHOLD: { single: 201750, mfj: 403500, mfs: 201750, hoh: 201750 },
              QBI_PHASEIN: { single: 75e3, mfj: 15e4, mfs: 75e3, hoh: 75e3 },
              // ---- Alternative Minimum Tax (§55), TY2026 ----
              // OBBBA restructured the AMT exemption phase-out starting TY2026: the
              // phase-out threshold drops back to ~2018 levels ($500k single/MFS/
              // HoH, $1,000,000 MFJ — down from the TY2025 TCJA-indexed $626,350/
              // $1,252,700) AND the phase-out rate doubles from 25% to 50% (see
              // AMT_PHASEOUT_RATE, applied in computeUsTax). Both changes make AMT
              // bite considerably more higher earners in TY2026 than TY2025.
              AMT_EXEMPTION: { single: 90100, mfj: 140200, mfs: 70100, hoh: 90100 },
              AMT_PHASEOUT: { single: 5e5, mfj: 1e6, mfs: 5e5, hoh: 5e5 },
              AMT_PHASEOUT_RATE: 0.5,
              AMT_RATE_BREAK: 244500,
              // 26% up to this AMT base, 28% above (MFS: half)
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
              CTC_PHASEOUT_THRESHOLD_USD: { single: 2e5, mfj: 4e5, mfs: 2e5, hoh: 2e5 },
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
              SENIOR_DEDUCTION_PER_PERSON_USD: 6e3,
              SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD: { single: 75e3, mfj: 15e4, hoh: 75e3 },
              SENIOR_DEDUCTION_PHASEOUT_RATE: 0.06,
              // ---- OBBBA "no tax on tips" / "no tax on overtime" deductions
              // (temporary, TY2025-2028) — above-the-line deductions (available
              // whether or not the taxpayer itemizes), phased out $100 per $1,000
              // of MAGI over the threshold. MFS filers are entirely ineligible for
              // both. Tips cap is a flat $25,000 regardless of filing status;
              // overtime cap is $12,500 single/HoH or $25,000 MFJ (the "half-time"
              // FLSA §7 premium portion only, not the full overtime wage).
              TIPS_DEDUCTION_MAX_USD: 25e3,
              OVERTIME_DEDUCTION_MAX_USD: { single: 12500, mfj: 25e3, hoh: 12500 },
              TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD: { single: 15e4, mfj: 3e5, hoh: 15e4 },
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
                  single: [[11079, 0.01], [26264, 0.02], [41452, 0.04], [57542, 0.06], [72724, 0.08], [371479, 0.093], [445771, 0.103], [742953, 0.113], [Infinity, 0.123]],
                  mfj: [[22158, 0.01], [52528, 0.02], [82904, 0.04], [115084, 0.06], [145448, 0.08], [742958, 0.093], [891542, 0.103], [1485906, 0.113], [Infinity, 0.123]]
                },
                STD_DEDUCTION: { single: 5706, mfj: 11412 },
                // Personal exemption CREDIT (subtracted from tax, not income), FTB 2025.
                EXEMPTION_CREDIT_USD: { single: 153, mfj: 307 },
                DEPENDENT_CREDIT_USD: 475,
                // Mental Health Services Tax: flat 1% on taxable income over $1M,
                // NOT doubled for MFJ (same $1M threshold regardless of status) —
                // this is what produces CA's well-known 13.3% marginal top rate.
                SURCHARGE_THRESHOLD_USD: 1e6,
                SURCHARGE_RATE: 0.01,
                SURCHARGE_LABEL: "Mental Health Services Tax (1% over $1,000,000, not doubled for MFJ)"
              },
              NY: {
                NAME: "New York",
                FORM_NAME: "Form IT-201",
                // NYS Dept. of Taxation & Finance 2025 rate schedule.
                BRACKETS: {
                  single: [[8500, 0.04], [11700, 0.045], [13900, 0.0525], [80650, 0.055], [215400, 0.06], [1077550, 0.0685], [5e6, 0.0965], [25e6, 0.103], [Infinity, 0.109]],
                  mfj: [[17150, 0.04], [23600, 0.045], [27900, 0.0525], [161550, 0.055], [323200, 0.06], [2155350, 0.0685], [5e6, 0.0965], [25e6, 0.103], [Infinity, 0.109]]
                },
                STD_DEDUCTION: { single: 8e3, mfj: 16050 },
                // NY dropped a personal exemption for filer/spouse decades ago;
                // only the $1,000/dependent exemption survives, taken against
                // income (not a credit, unlike CA's).
                DEPENDENT_EXEMPTION_USD: 1e3
              }
            },
            // ---- entity (business) corporate rates ----
            // Domestic-company-only elections (s.115BA/115BAA/115BAB) and the
            // domestic default schedule — a FOREIGN company (not incorporated in
            // India, whether or not it's resident via POEM) is never eligible for
            // any of these regardless of what's on file; see INDIA_COMPANY_FOREIGN
            // below, verified 2026-07-15, re-check each Finance Act cycle.
            INDIA_COMPANY: {
              RATE_115BAB: 0.15,
              SURCHARGE_115BAB: 0.1,
              // domestic co, new manufacturing (s.115BAB)
              RATE_115BAA: 0.22,
              SURCHARGE_115BAA: 0.1,
              // domestic co, no incentives
              RATE_115BA: 0.25,
              // domestic co, manufacturing (s.115BA) — flat, no turnover test
              RATE_TURNOVER_LTE_400CR: 0.25,
              // default (no election): turnover-gated
              RATE_DEFAULT: 0.3,
              SURCHARGE_OVER_1CR: 0.07,
              SURCHARGE_OVER_10CR: 0.12,
              MAT_RATE: 0.15,
              CESS_RATE: 0.04
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
              RATE: 0.35,
              SURCHARGE_OVER_1CR: 0.02,
              SURCHARGE_OVER_10CR: 0.05,
              MAT_RATE: 0.15,
              CESS_RATE: 0.04
            },
            INDIA_FIRM: { RATE: 0.3, SURCHARGE_OVER_1CR: 0.12, CESS_RATE: 0.04 },
            // ---- US depreciation (MACRS/§179/bonus) — Sch C/F asset rows ----
            // §179: OBBBA raised both the cap and phase-out threshold, now
            // permanent parts of the code and inflation-adjusted annually — TY2026
            // figures ($2,560,000 / $4,090,000) verified 2026-07-15 (IRS Rev.
            // Proc., re-check each filing season). Layer 1 US's OWN local preview
            // calculators still hardcode the stale pre-OBBBA 2024 figures
            // ($1,200,000 / $3,000,000) in three separate places — this engine
            // deliberately does NOT trust that copy.
            US_SEC179_MAX_USD: 256e4,
            US_SEC179_PHASEOUT_THRESHOLD_USD: 409e4,
            // Bonus depreciation: OBBBA permanently restored 100% for qualified
            // property placed in service after 19 Jan 2025 (was on a TCJA
            // phase-down to 0% by 2027) — so every asset in scope for this
            // TY2026 engine gets 100%, not the 20% Layer 1's own UI copy/preview
            // calculators still hardcode (labeled there as "the 2026 rate").
            US_BONUS_DEPRECIATION_RATE: 1,
            // IRS Pub 946 Table A-1 (200%-declining-balance, half-year convention)
            // for 3/5/7-year property, and the 150%-DB-derived table for 15-year
            // property — stable, unchanged for decades. Year-1 values match
            // Layer 1's own hardcoded first-year-only rates exactly (33.33/20.00/
            // 14.29/5.00%), confirming table selection; years 2+ are this
            // engine's own addition (Layer 1 has no multi-year table at all).
            US_MACRS_HALF_YEAR: {
              "3-year": [0.3333, 0.4445, 0.1481, 0.0741],
              "5-year": [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576],
              "7-year": [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446],
              "15-year": [0.05, 0.095, 0.0855, 0.077, 0.0693, 0.0623, 0.059, 0.059, 0.0591, 0.059, 0.0591, 0.059, 0.0591, 0.059, 0.0591, 0.0295]
            },
            // Straight-line classes — full annual rate; §179/bonus categorically
            // ineligible for these (real property + intangible amortization),
            // matching Layer 1's own eligibility gating exactly.
            US_MACRS_STRAIGHT_LINE_ANNUAL: { "27.5-year": 1 / 27.5, "39-year": 1 / 39, "amortization-15": 1 / 15 }
          }
        };
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
            desc: "Information return for Passive Foreign Investment Companies \u2014 one per fund.",
            why: "Holdings in Indian mutual funds / ETFs are PFICs and require annual reporting (punitive \xA71291 regime unless QEF/MTM elected).",
            severity: CONST.SEVERITY.CRITICAL
          },
          {
            id: "form_5471",
            jurisdiction: "US",
            name: "IRS Form 5471 (CFC)",
            desc: "Information return for US persons owning \u226510% of a foreign corporation.",
            why: "You own \u226510% of an Indian company \u2014 potential Subpart F / GILTI inclusion.",
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
            desc: "California state income tax return \u2014 computed on worldwide income for a full-year CA resident, including Indian-source income. CA grants no credit for tax paid to a foreign country.",
            why: "State-of-residence facts on file point to California, and CA taxes worldwide income independently of the federal treaty position.",
            severity: CONST.SEVERITY.WARNING
          },
          {
            id: "form_it201",
            jurisdiction: "US",
            name: "New York Form IT-201 (Resident Income Tax Return)",
            desc: "New York state income tax return \u2014 computed on worldwide income for a full-year NY resident, including Indian-source income. NY grants no credit for tax paid to a foreign country.",
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
            why: "DTAA relief / treaty rate is being claimed \u2014 a TRC is mandatory u/s 159(8).",
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
            why: "Outward remittances under LRS / to non-residents were made during the year. Renumbered from Form 15CA/15CB effective 1 Apr 2026 under the Income-tax Rules, 2026 (Rule 220) \u2014 the old numbers still apply to remittances made before that date.",
            severity: CONST.SEVERITY.INFO
          },
          {
            id: "schedule_al",
            jurisdiction: "IN",
            name: "Schedule AL (Assets & Liabilities)",
            desc: "Disclosure of assets and liabilities at cost, filed with the ITR.",
            why: "Total income exceeds \u20B950 lakh \u2014 Schedule AL is mandatory at this threshold u/s 139(1) (ITR-2/3/5 filers).",
            severity: CONST.SEVERITY.WARNING
          },
          {
            id: "form_3cb_3cd",
            jurisdiction: "IN",
            name: "Form 3CB / 3CD (Tax Audit Report)",
            desc: "Chartered Accountant's tax-audit report and statement of particulars, filed before the ITR due date.",
            why: "Business turnover exceeds the s.44AB tax-audit threshold (\u20B91 crore, or \u20B910 crore where cash receipts and payments are each \u22645% of the total).",
            severity: CONST.SEVERITY.CRITICAL
          },
          {
            id: "form_8802",
            jurisdiction: "US",
            name: "IRS Form 8802 (Application for US Residency Certification)",
            desc: "Application to the IRS for Form 6166 \u2014 the US residency certificate India's TRC requirement expects the other contracting state to issue.",
            why: "DTAA relief is being claimed on Indian-source income \u2014 Form 6166 must be requested via Form 8802 before it can be filed with the Indian TRC/Form 41 paperwork; IRS processing typically takes 4-6+ weeks, so file well ahead of the India due date.",
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
            why: "A US real property interest was disposed of by a foreign person \u2014 15% FIRPTA withholding applies at closing unless a Form 8288-B withholding certificate reduces it.",
            severity: CONST.SEVERITY.WARNING
          },
          {
            id: "form_3ceb",
            jurisdiction: "IN",
            name: "Form 3CEB (Transfer Pricing Certification)",
            desc: "Chartered Accountant's report on international transactions with associated enterprises, filed before the ITR due date u/s 92E.",
            why: "A cross-border related-party ownership relationship is on file \u2014 international transactions with that entity must be reported and certified, independent of whether pricing is at arm's length.",
            severity: CONST.SEVERITY.WARNING
          },
          {
            id: "form_26as_ais_tis",
            jurisdiction: "IN",
            name: "Form 26AS / AIS / TIS",
            desc: "Annual tax-credit statement (26AS) and the Annual/Taxpayer Information Statements \u2014 the pre-filled record every ITR should be reconciled against before filing.",
            why: "Indian income is on file for this taxpayer \u2014 TDS, advance tax and reported high-value transactions should be cross-checked against these statements before the return is filed.",
            severity: CONST.SEVERITY.INFO
          },
          {
            id: "form_16_16a",
            jurisdiction: "IN",
            name: "Form 16 / Form 16A (TDS Certificates)",
            desc: "Salary (Form 16) and non-salary (Form 16A) TDS certificates issued by each deductor.",
            why: "Indian income subject to TDS is on file \u2014 hold the certificate from each deductor to reconcile against Form 26AS/AIS and support the credit claimed in the ITR.",
            severity: CONST.SEVERITY.INFO
          },
          {
            id: "lrs_form_a2",
            jurisdiction: "IN",
            name: "LRS Form A2 (Outward Remittance Declaration)",
            desc: "Declaration furnished to the remitting bank for each outward remittance under the Liberalised Remittance Scheme.",
            why: "Outward remittances under LRS were made this year \u2014 each remittance requires its own Form A2 filed with the bank at the time of transfer, separate from the annual Form 145/146 (was 15CA/15CB) return-time reporting.",
            severity: CONST.SEVERITY.INFO
          },
          {
            id: "form_4868",
            jurisdiction: "US",
            name: "IRS Form 4868 (Extension Request)",
            desc: "Automatic 6-month extension of time to file (not to pay) the US return.",
            why: "Must be filed by the original due date to legally reach the extended deadline already on your Compliance Calendar \u2014 the extension does not happen automatically.",
            severity: CONST.SEVERITY.INFO
          }
        ];
        WISING.CONST = CONST;
        var CLIENT_REGISTRY_KEY = "wising_client_registry";
        var CLIENT_LINK_TARGETS = ["router.html", "layer1_india.html", "layer1_us.html"];
        function activeClientIdFromUrl() {
          try {
            if (typeof root.location === "undefined" || !root.URLSearchParams) return null;
            return new root.URLSearchParams(root.location.search).get("client") || null;
          } catch (e) {
            return null;
          }
        }
        function clientScopedKey(which, clientId) {
          return "wising_client_" + clientId + "_" + which.toLowerCase();
        }
        function storageKeyFor(which) {
          var id = activeClientIdFromUrl();
          return id ? clientScopedKey(which, id) : CONST.STORAGE_KEYS[which];
        }
        function listClients() {
          try {
            var raw = root.localStorage.getItem(CLIENT_REGISTRY_KEY);
            return raw ? JSON.parse(raw) : [];
          } catch (e) {
            return [];
          }
        }
        function saveClientRegistry(list) {
          try {
            root.localStorage.setItem(CLIENT_REGISTRY_KEY, JSON.stringify(list));
          } catch (e) {
          }
        }
        function createClient() {
          var id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          var list = listClients();
          list.push({ id, label: "New client", createdAt: (/* @__PURE__ */ new Date()).toISOString() });
          saveClientRegistry(list);
          return id;
        }
        function removeClient(clientId) {
          try {
            root.localStorage.removeItem(clientScopedKey("ROUTER", clientId));
            root.localStorage.removeItem(clientScopedKey("INDIA", clientId));
            root.localStorage.removeItem(clientScopedKey("US", clientId));
          } catch (e) {
          }
          saveClientRegistry(listClients().filter(function(c) {
            return c.id !== clientId;
          }));
        }
        function updateClientLabel(clientId, label) {
          var list = listClients(), found = false;
          list.forEach(function(c) {
            if (c.id === clientId) {
              c.label = label;
              found = true;
            }
          });
          if (found) saveClientRegistry(list);
        }
        function getClientRawState(clientId) {
          function read(key) {
            try {
              var raw = root.localStorage.getItem(key);
              return raw ? JSON.parse(raw) : {};
            } catch (e) {
              return {};
            }
          }
          return {
            router: read(clientScopedKey("ROUTER", clientId)),
            india: read(clientScopedKey("INDIA", clientId)),
            us: read(clientScopedKey("US", clientId))
          };
        }
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
        function navigateWithClient(targetHtml) {
          var id = activeClientIdFromUrl();
          root.location.href = id ? targetHtml + "?client=" + encodeURIComponent(id) : targetHtml;
        }
        WISING.ClientRegistry = {
          activeIdFromUrl: activeClientIdFromUrl,
          storageKeyFor,
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
        if (typeof module !== "undefined" && module.exports) module.exports = { CONST };
      })(typeof window !== "undefined" ? window : globalThis);
    }
  });

  // prototypes/graph-pilot/sample-data.js
  var require_sample_data = __commonJS({
    "prototypes/graph-pilot/sample-data.js"() {
      (function(root) {
        "use strict";
        var WISING = root.WISING = root.WISING || {};
        var ROUTER = {
          jurisdiction: "dual",
          base_tax_year: 2025,
          full_name: "Aarav Sharma",
          date_of_birth: "1988-07-15",
          is_us_citizen: false,
          has_green_card: false,
          us_days: 330,
          has_us_source_income_or_assets: true
        };
        var INDIA = {
          profile: {
            full_name: "Aarav Sharma",
            entity_type: "individual",
            date_of_birth: "1988-07-15",
            pan: "ABCPS1234K",
            tax_regime: "NEW"
          },
          residency_detail: {
            days_in_india_current_year: 210,
            final_india_residency_status: "ROR"
          },
          dtaa: {
            tax_residency_country: "US",
            is_us_resident_for_dtaa: true,
            dtaa_treaty_residence: "us",
            // <-- Article 4 tie-breaker RUN in Layer 1 → US
            trc_status: true,
            // <-- TRC on file
            has_permanent_establishment_in_india: false,
            treaty_elections: [],
            dtaa_forced_nr: false
          },
          compliance_docs: {
            trc: { document_uploaded: true },
            form_10f: { is_filed: true },
            // <-- Form 10F filed
            chapter_xiia_elected: false
          },
          bank_accounts: [
            { bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 32e5 },
            { bank_name: "ICICI Bank", account_type: "nro", peak_balance_inr: 15e5 }
          ],
          property: {
            has_indian_property_transaction: true,
            properties: [
              { address: "Flat 12B, Pune", property_type: "Residential", gross_rent_received_inr: 6e5, municipal_taxes_paid_inr: 3e4 }
            ]
          },
          financial_holdings: {
            has_financial_transactions: true,
            transactions: [
              { asset_type: "equity_mutual_fund", asset_name: "Axis Bluechip Fund", value_inr: 25e5 },
              { asset_type: "debt_mutual_fund", asset_name: "HDFC Corporate Bond Fund", value_inr: 12e5 }
            ]
          },
          domestic_income: {
            salary: { has_salary_income: true, taxable_salary_inr: 42e5, gross_salary_inr: 45e5 },
            house_property: {
              has_house_property_income: true,
              properties: [{ annual_value_inr: 42e4, gross_rent_received_inr: 6e5 }]
            },
            business_income: {
              has_business_or_fo_income: true,
              business_entries: [
                { trade_name: "Sharma Consulting Pvt Ltd", net_profit_inr: 18e5 }
              ]
            },
            capital_gains: { short_term_15_pct: 25e4 },
            other_sources: { interest_inr: 0 }
          },
          other_sources: {
            has_other_sources_income: true,
            interest_savings_inr: 8e4,
            interest_fd_rd_inr: 22e4,
            dividend_inr: 15e4
          },
          deductions: {
            s80C: { epf_employee_inr: 15e4, ppf_inr: 15e4 },
            s80CCC_80CCD1: { nps_employee_contribution_inr: 5e4 }
          },
          lrs_outbound: {
            total_lrs_remitted_this_fy_inr: 17e6,
            // ~$205k -> approaching $250k LRS cap
            lrs_purpose: "investment"
          },
          tax_credits: {
            advance_tax_q1_15jun_inr: 4e5,
            advance_tax_q2_15sep_inr: 4e5,
            advance_tax_q3_15dec_inr: 4e5,
            advance_tax_q4_15mar_inr: 3e5,
            tds_already_deducted_inr: 35e4,
            tds_inr: 0,
            tcs_inr: 0
          },
          metadata: { schema_version: "layer1_india_v5_1", financial_year: "TY2026-27" }
        };
        var US = {
          profile: {
            tax_entity_type: "individual",
            full_name: "Aarav Sharma",
            date_of_birth: "1988-07-15",
            filing_status: "mfj",
            ssn_or_itin_type: "ssn"
          },
          us_residency_detail: {
            is_us_citizen: false,
            has_green_card: false,
            us_days_current_year: 330,
            spt_test_met: true,
            // <-- US resident via SPT
            final_us_residency_status: "RESIDENT_ALIEN",
            dtaa_treaty_residence: "us"
            // <-- synced tie-breaker outcome
          },
          income_us_source: {
            has_employment_income: true,
            wages_w2: [
              {
                employer_name: "Cloudscale Inc",
                wages_box1_usd: 165e3,
                tax_details_collapsed_by_default: { federal_tax_withheld_usd: 31e3, medicare_wages_box5_usd: 165e3 }
              }
            ],
            interest_us_source_usd: 3200,
            ordinary_dividends_us_source_usd: 4100,
            ltcg_us_source_usd: 9e3,
            stcg_us_source_usd: 0
          },
          income_foreign_source: {
            foreign_wages: [{ employer_name: "India Salary", wages_usd: 50602 }],
            // ₹42L taxable / 83
            foreign_interest_usd: 3614,
            // ₹3L / 83
            foreign_dividends_usd: 1807,
            // ₹1.5L / 83
            foreign_rental_income_usd: 5060,
            // ₹4.2L annual value / 83
            foreign_stcg_usd: 3012,
            foreign_ltcg_usd: 0
          },
          foreign_earned_income: {
            claims_feie: false,
            foreign_earned_income_usd: 50602,
            feie_amount_claimed_usd: 0
          },
          bank_accounts: [
            { bank_name: "HDFC Bank", account_type: "savings", country: "India", peak_balance_usd: 38554 },
            { bank_name: "ICICI Bank", account_type: "nro", country: "India", peak_balance_usd: 18072 }
          ],
          fbar_aggregate_peak_usd: 56626,
          form_8938_required: false,
          foreign_entities: {
            owns_10_percent_foreign_corp: true,
            foreign_corporations: [
              { corp_name: "Sharma Consulting Pvt Ltd", country: "IN", gilti_income_usd: 21687 }
            ],
            pfic_holdings: [
              { asset_name: "Axis Bluechip Fund", holding_value_usd: 30120 },
              { asset_name: "HDFC Corporate Bond Fund", holding_value_usd: 14458 }
            ],
            has_pfics: true
          },
          retirement_accounts: {
            indian_epf_balance_usd: 1807,
            indian_ppf_balance_usd: 1807
          },
          ftc_inputs: {
            claims_ftc: true,
            ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 22289, foreign_income_usd: 0 }]
          },
          withholding_and_estimated: {
            federal_withholding_total_usd: 31e3,
            estimated_tax_q1_apr15_usd: 0,
            estimated_tax_q2_jun15_usd: 0,
            estimated_tax_q3_sep15_usd: 0,
            estimated_tax_q4_jan15_usd: 0
          },
          nra_specific: { files_form_1040nr: false },
          metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
        };
        WISING.SAMPLE = { router: ROUTER, india: INDIA, us: US };
        WISING.loadSampleIntoStorage = function() {
          try {
            var K = WISING.CONST.STORAGE_KEYS;
            root.localStorage.setItem(K.ROUTER, JSON.stringify(ROUTER));
            root.localStorage.setItem(K.INDIA, JSON.stringify(INDIA));
            root.localStorage.setItem(K.US, JSON.stringify(US));
            return true;
          } catch (e) {
            return false;
          }
        };
      })(typeof window !== "undefined" ? window : globalThis);
    }
  });

  // prototypes/graph-pilot/profiles.js
  var require_profiles = __commonJS({
    "prototypes/graph-pilot/profiles.js"() {
      (function(root) {
        "use strict";
        var WISING = root.WISING = root.WISING || {};
        var KEYS = WISING.CONST && WISING.CONST.STORAGE_KEYS || {
          ROUTER: "wising_router_state",
          INDIA: "wising_layer1_india_state",
          US: "wising_us_state"
        };
        var ACTIVE_KEY = "wising_active_profile";
        function router(name, extra) {
          return Object.assign({
            jurisdiction: "dual",
            base_tax_year: 2026,
            full_name: name,
            date_of_birth: "1988-01-01",
            is_us_citizen: false,
            has_green_card: false,
            us_days: 0,
            has_us_source_income_or_assets: true
          }, extra || {});
        }
        function meta(schema, fy) {
          return { schema_version: schema, financial_year: fy };
        }
        var QUARTERLY_STATIC_NUMERIC_KEYS = {
          holding_pct: true,
          shares: true,
          shares_acquired: true,
          fmv_per_share_inr: true,
          exercise_price_per_share_inr: true
        };
        function fyQuarterOf(dateStr, baseYear) {
          if (!dateStr) return "Q1";
          var d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
          if (isNaN(d.getTime())) return "Q1";
          var y = d.getFullYear(), m = d.getMonth();
          if (y === baseYear && m >= 3 && m <= 5) return "Q1";
          if (y === baseYear && m >= 6 && m <= 8) return "Q2";
          if (y === baseYear && m >= 9 && m <= 11) return "Q3";
          if (y === baseYear + 1 && m >= 0 && m <= 2) return "Q4";
          return "Q1";
        }
        function splitFlow(node) {
          if (node === null || node === void 0) return [null, null, null, null];
          if (Array.isArray(node)) {
            var outA = [[], [], [], []];
            node.forEach(function(el) {
              var parts2 = splitFlow(el);
              for (var i2 = 0; i2 < 4; i2++) outA[i2].push(parts2[i2]);
            });
            return outA;
          }
          if (typeof node === "object") {
            var outO = [{}, {}, {}, {}];
            for (var k in node) {
              if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
              var v = node[k];
              if (typeof v === "number") {
                if (QUARTERLY_STATIC_NUMERIC_KEYS[k]) {
                  outO[0][k] = v;
                  outO[1][k] = null;
                  outO[2][k] = null;
                  outO[3][k] = null;
                } else {
                  var base = Math.floor(v / 4), rem = v - base * 3;
                  outO[0][k] = base;
                  outO[1][k] = base;
                  outO[2][k] = base;
                  outO[3][k] = rem;
                }
              } else if (typeof v === "boolean" || typeof v === "string") {
                outO[0][k] = outO[1][k] = outO[2][k] = outO[3][k] = v;
              } else {
                var parts = splitFlow(v);
                for (var i = 0; i < 4; i++) outO[i][k] = parts[i];
              }
            }
            return outO;
          }
          return [node, node, node, node];
        }
        function buildQuarters(india, baseYear) {
          var di = india.domestic_income || {};
          var os = india.other_sources || {};
          var cg = india.capital_gains || {};
          var lrs = india.lrs_outbound || {};
          var esopEvents = di.salary && di.salary.esop_perquisite_events || [];
          var diForSplit = di;
          if (esopEvents.length) {
            diForSplit = JSON.parse(JSON.stringify(di));
            diForSplit.salary.esop_perquisite_events = [];
          }
          var diQ = splitFlow(diForSplit), osQ = splitFlow(os), cgQ = splitFlow(cg), lrsQ = splitFlow(lrs);
          esopEvents.forEach(function(ev) {
            var q = fyQuarterOf(ev.vesting_or_exercise_date || ev.grant_date, baseYear);
            var idx = ["Q1", "Q2", "Q3", "Q4"].indexOf(q);
            diQ[idx].salary.esop_perquisite_events = (diQ[idx].salary.esop_perquisite_events || []).concat([ev]);
          });
          var quarters = {};
          ["Q1", "Q2", "Q3", "Q4"].forEach(function(q, i) {
            quarters[q] = { domestic_income: diQ[i], other_sources: osQ[i], capital_gains: cgQ[i], lrs_outbound: lrsQ[i] };
          });
          ["financial_holdings", "commodities", "unlisted_equity", "property", "nro_repatriation"].forEach(function(cat) {
            if (india[cat]) quarters.Q1[cat] = JSON.parse(JSON.stringify(india[cat]));
          });
          return quarters;
        }
        var P1 = {
          id: "dual_resident_h1b",
          label: "Dual Resident \u2014 H-1B",
          story: "India ROR + US SPT, senior tech hire in California. Both tax worldwide income \u2192 DTAA tie-breaker + FTC shortfall; ISO exercise triggers AMT and mirrors an ESOP grant from his prior Indian employer (equity-comp sourcing); NIIT, a carried-forward capital loss, and a Schedule FA slip round it out. Also sold some Schwab-held AMZN stock after 18 months \u2014 India treats a foreign stock as an unlisted security (24mo LTCG threshold, no s.198 exemption) so it's STCG at his slab rate there, but the US calls the same gain LTCG (12mo threshold) \u2014 and since he's worldwide-taxed by BOTH countries this year, that's a genuine characterization mismatch with real dollars at stake on both sides, not just a paperwork gap.",
          tags: ["dual residency", "FTC", "PFIC", "AMT", "equity comp", "Foreign equity"],
          router: router("Aarav Sharma", { us_days: 330, date_of_birth: "1988-07-15" }),
          india: {
            profile: { full_name: "Aarav Sharma", entity_type: "individual", date_of_birth: "1988-07-15", pan: "ABCPS1234K", tax_regime: "NEW" },
            residency_detail: { days_in_india_current_year: 183, final_india_residency_status: "ROR" },
            // Tie-break wizard walked through: permanent home was ambiguous (kept a
            // place in both countries), so it fell to centre of vital interests,
            // which landed on the US — the actual reasoning behind "us" winning,
            // not just the bare verdict. No treaty_elections here on purpose: he's
            // domestically ROR, and s.207 (what a treaty election overrides) only
            // applies to a genuine domestic NR — see Rohan (us_resident_indian_income)
            // for that case instead.
            dtaa: { tax_residency_country: "US", is_us_resident_for_dtaa: true, dtaa_treaty_residence: "us", trc_status: true, has_permanent_establishment_in_india: false, dtaa_forced_nr: false, tb_home: "both", tb_cvi: "us" },
            compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true }, chapter_xiia_elected: false },
            bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 32e5 }, { bank_name: "ICICI Bank", account_type: "nro", peak_balance_inr: 15e5 }],
            property: { has_indian_property_transaction: true, properties: [{ address: "Flat 12B, Pune", property_type: "Residential", annual_value_inr: 42e4, gross_rent_received_inr: 6e5, municipal_taxes_paid_inr: 3e4 }] },
            // AMZN held 18 months (Nov 2024 - May 2026) via his US Schwab brokerage
            // (see the matching account on the US side below): >12mo so LTCG for
            // the US, but <=24mo so STCG-at-slab-rate for India (foreign shares
            // are "unlisted foreign securities" under Indian law — 24mo threshold,
            // not 12) — triggers the holding-period characterization mismatch,
            // and since he's ROR + US worldwide-taxed, it actually fires (unlike
            // a similar holding for a US non-resident-alien, where the US simply
            // doesn't tax the gain at all and there's nothing to mismatch).
            financial_holdings: { has_financial_transactions: true, transactions: [
              { asset_type: "equity_mutual_fund", asset_name: "Axis Bluechip Fund", value_inr: 25e5 },
              { asset_type: "debt_mutual_fund", asset_name: "HDFC Corporate Bond Fund", value_inr: 12e5 },
              {
                asset_class: "foreign_equity_unlisted",
                asset_name_or_ticker: "AMZN",
                acquisition_date: "2024-11-01",
                purchase_value: 1e4,
                purchase_currency: "USD",
                sale_date: "2026-05-01",
                sale_value: 18e3,
                sale_currency: "USD",
                stt_paid: false,
                transfer_expenses: 0,
                is_specified_foreign_exchange_asset: false
              }
            ] },
            // Preparer left this unchecked despite the US brokerage/401(k)/bank
            // accounts shown on his US form below — as ROR he must disclose them on
            // Schedule FA; the two forms flatly disagree (schedule_fa_inconsistent).
            foreign_assets: { has_foreign_assets: false, assets: [] },
            // ESOP grant from his prior Indian employer (Infosys, see the US-side
            // foreign_wages entry below for the same Apr–Aug stint) — carried an
            // equity grant across the move, exercised the same year as the US-side
            // ISO grant → equity_comp_sourcing (both countries taxing the same
            // multi-year award independently, no day-count allocation).
            // Small side freelance-development income alongside the W-2 job —
            // deliberately regular books (presumptive_scheme: null, not just
            // omitted), NOT a demo of the presumptive schemes — exercises Phase 1
            // depreciation on a real ROR-eligible individual (contrast Rohan
            // Mehta's NR-forced fallthrough and Sharma HUF's entity-type
            // exclusion below — three different reasons an entry lands on
            // regular books).
            domestic_income: { salary: { has_salary_income: true, taxable_salary_inr: 18e5, esop_perquisite_events: [{ employer_name: "Infosys Ltd", grant_date: "2021-06-01", vesting_or_exercise_date: "2026-06-01", shares: 400, fmv_per_share_inr: 1800, exercise_price_per_share_inr: 300, perquisite_value_inr: 6e5 }] }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 42e4 }] }, business_income: { has_business_or_fo_income: true, business_entries: [
              {
                business_name: "Sharma Freelance Dev",
                nature: "software consulting",
                presumptive_scheme: null,
                gross_receipts_inr: 9e5,
                expenses: { rent_for_business_premises_inr: 6e4, other_business_expenses_inr: 4e4 }
              }
            ], asset_blocks: [
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "plant_machinery_computers", opening_wdv_inr: 8e4, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false }
            ] }, capital_gains: { short_term_15_pct: 25e4 } },
            // taxable_epf_interest_inr now actually lands in the US income
            // computation (folded into foreign-source interest), not just this
            // finding's display text.
            other_sources: { has_other_sources_income: true, interest_savings_inr: 4e4, interest_fd_rd_inr: 12e4, dividend_inr: 9e4, taxable_epf_interest_inr: 45e3 },
            deductions: { s80C: { epf_employee_inr: 15e4, ppf_inr: 15e4 }, s80CCC_80CCD1: { nps_employee_contribution_inr: 5e4 } },
            // A prior-year capital-market loss carried forward, not yet set off
            // against this year's capital gains above.
            carry_forward_losses: { has_brought_forward_losses: true, stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 18e4 }] },
            lrs_outbound: { total_lrs_remitted_this_fy_inr: 17e6 },
            tax_credits: { advance_tax_q1_15jun_inr: 4e5, advance_tax_q2_15sep_inr: 4e5, advance_tax_q3_15dec_inr: 4e5, advance_tax_q4_15mar_inr: 3e5, tds_already_deducted_inr: 35e4 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Aarav Sharma", date_of_birth: "1988-07-15", filing_status: "mfj", ssn_or_itin_type: "ssn" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 185, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "us" },
            income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Cloudscale Inc (US)", wages_box1_usd: 2e5, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 38e3, medicare_wages_box5_usd: 2e5 } }], interest_us_source_usd: 3200, ordinary_dividends_us_source_usd: 6200, qualified_dividends_us_source_usd: 4200, ltcg_us_source_usd: 14e3 },
            income_foreign_source: { foreign_wages: [{ employer_name: "Infosys (India, Apr\u2013Aug)", wages_usd: 21687 }], foreign_interest_usd: 1928, foreign_dividends_usd: 1084, foreign_rental_income_usd: 5060, foreign_stcg_usd: 3012 },
            foreign_earned_income: { claims_feie: false, foreign_earned_income_usd: 21687, feie_amount_claimed_usd: 0 },
            // ISO exercise the same year as the Infosys ESOP event above → the AMT
            // preference item (bargain element) plus the equity-comp sourcing
            // conflict. Common combination for a relocated tech employee.
            equity_compensation: { iso_exercises: [{ shares_exercised: 3e3, fmv_at_exercise_usd: 65, strike_price_usd: 12 }] },
            // California is the single most common H-1B/relocated-tech-worker state;
            // the federal DTAA tie-breaker above doesn't bind it (state_treaty_not_binding).
            state_residency: { primary_state_of_residence: "CA", ca_retains_property_or_voter_reg: true },
            bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", country: "India", peak_balance_usd: 38554 }, { bank_name: "ICICI Bank", account_type: "nro", country: "India", peak_balance_usd: 18072 }],
            fbar_aggregate_peak_usd: 56626,
            foreign_entities: { owns_10_percent_foreign_corp: false, foreign_corporations: [], pfic_holdings: [{ asset_name: "Axis Bluechip Fund", holding_value_usd: 30120 }, { asset_name: "HDFC Corporate Bond Fund", holding_value_usd: 14458 }], has_pfics: true },
            retirement_accounts: { "401k_employee_contribution_usd": 20500, "401k_employer_match_usd": 9e3, roth_ira_contribution_usd: 7e3, indian_epf_balance_usd: 1807 },
            financial_holdings: [{ asset_name: "Schwab \u2014 Taxable Brokerage (US equities)", account_type: "taxable_brokerage", peak_balance_usd: 168e3, country: "US" }, { asset_name: "Fidelity 401(k) \u2014 US index funds", account_type: "retirement_brokerage", peak_balance_usd: 92e3, country: "US" }],
            real_estate: { has_real_estate_transaction: false, properties: [] },
            ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 22289 }] },
            withholding_and_estimated: { federal_withholding_total_usd: 31e3 },
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P2 = {
          id: "us_resident_indian_income",
          label: "US Resident \xB7 Indian income",
          story: 'US green-card holder with Indian rent, dividends, mutual funds, a small India consulting stake and a US-side consulting side gig. US taxes worldwide \u2192 FTC (Form 1116) for Indian TDS; PFIC; a below-threshold Indian business stake; no US-India Totalization Agreement on his US self-employment tax; plus occasional online-gaming winnings and an unexplained cash deposit back home. His W-2 job also reports qualified tip income and overtime premium pay \u2014 the first demo of the (OBBBA, TY2025-2028) "no tax on tips"/"no tax on overtime" deductions, both intact here since his AGI sits just under the $300,000 MFJ phase-out threshold. Also a general partner in a small consulting LLC \u2014 the first demo of partnership K-1 guaranteed payments (previously dropped from income entirely) and Box 14A self-employment earnings (previously unread, so partnership SE tax was always $0).',
          tags: ["FTC 1116", "PFIC", "FBAR", "NR in India", "self-employment", "tips/overtime", "K-1"],
          router: router("Rohan Mehta", { is_us_citizen: false, has_green_card: true, us_days: 365, date_of_birth: "1985-03-22" }),
          india: {
            profile: { full_name: "Rohan Mehta", entity_type: "individual", date_of_birth: "1985-03-22", pan: "AAAPM5678Q", tax_regime: "NEW" },
            residency_detail: { days_in_india_current_year: 20, final_india_residency_status: "NR" },
            // A genuinely beneficial treaty rate on ₹1.5L of his ₹2.6L NRO interest
            // (15% vs the 20% domestic s.207 default — the other ₹1.1L isn't
            // claimed under treaty at all, so it's taxed at the plain domestic
            // rate regardless) plus a royalty stream (India has no other_sources
            // field for royalty at all — this election table is the only place
            // it's ever recorded, exercising that for the first time). But TRC/
            // Form 41 are missing (see compliance_docs below), so BOTH elections
            // are denied and the computation correctly falls back to the domestic
            // rate for each.
            dtaa: { tax_residency_country: "US", is_us_resident_for_dtaa: true, dtaa_treaty_residence: "US", trc_status: false, form_10f: false, treaty_elections: [
              { income_type: "interest", amount_inr: 15e4, elected_rate: 0.15, treaty_article: "Art 11(2)(b)" },
              { income_type: "royalty", amount_inr: 4e5, elected_rate: 0.15, treaty_article: "Art 12(2)(a)(ii)" }
            ] },
            compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
            bank_accounts: [{ bank_name: "SBI (NRO)", account_type: "nro", peak_balance_inr: 26e5 }, { bank_name: "Axis (NRE)", account_type: "nre", peak_balance_inr: 19e5 }],
            property: { has_indian_property_transaction: true, properties: [{ address: "Villa 4, Bengaluru", property_type: "Residential", annual_value_inr: 84e4, gross_rent_received_inr: 12e5, municipal_taxes_paid_inr: 6e4 }] },
            financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "SBI Bluechip Fund", value_inr: 42e5 }, { asset_type: "equity_mutual_fund", asset_name: "Mirae Asset Large Cap", value_inr: 26e5 }] },
            // Small India-side consulting stake, held below the 10% US CFC threshold
            // (see the matching foreign_entities block on the US side below) →
            // triggers cfc_below_threshold instead of the full CFC/Form 5471 finding.
            // The first demo profile that DOESN'T inject a hand-authored
            // net_profit_inr, proving the real computation now works from real
            // Layer 1-shaped fields (gross_receipts_inr, presumptive_scheme).
            // Correction (Phase 1 build): this entry's presumptive_scheme:
            // "s44ADA" election is actually INVALID — Rohan is NR for India this
            // year (final_india_residency_status below), and s.44AD/44ADA are
            // ROR-only — so it correctly falls through to regular books at the
            // full ₹18,00,000 gross receipts (no expenses were ever entered for
            // this line item). A prior version of this comment claimed the
            // presumptive 50% rate applied (₹9,00,000, matching the old injected
            // figure) — that was never actually true once residency was checked;
            // this is the correct, law-accurate result, not a bug.
            // Second entry ("Mehta Equipment Rentals") is regular books, no
            // presumptive election — exercises Phase 1's asset_blocks[] WDV
            // depreciation (§2.4): opening ₹20,00,000 + additions ₹5,00,000
            // (both full-rate, addition date well before the <180-day cutoff) on
            // General P&M (15%) = ₹3,75,000 depreciation. Also exercises Phase 1's
            // statutory disallowances: ₹1,00,000 paid to a resident without TDS
            // (30% disallowed = ₹30,000) plus one MSME invoice unpaid past its
            // 15-day (no written agreement) window (₹50,000, fully disallowed) —
            // both are add-backs against the expense pool, not new deductions.
            // Net: ₹24,00,000 − (₹6,00,000 expenses − ₹80,000 disallowances) −
            // ₹3,75,000 depreciation = ₹15,05,000.
            // F&O trading (₹2,50,000 profit) is ordinary PGBP income, added
            // straight in. A small intraday (speculative) LOSS of ₹80,000
            // exercises the ring-fence (§2.2): it must NOT reduce the ordinary
            // business total above — with no brought-forward speculative loss on
            // file to eventually net against, it simply carries no consequence
            // this year (a single-year-snapshot engine has no carry-forward
            // output for it), rather than being wrongly absorbed. Also a partner
            // stake in a third firm (§2.3): ₹6,00,000 remuneration + ₹1,20,000
            // interest on capital are taxable PGBP income to Rohan; the firm's
            // own ₹9,00,000 profit share is genuinely exempt (already taxed at
            // the firm level) and must NOT double up here.
            domestic_income: { salary: { has_salary_income: false }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 84e4 }] }, business_income: {
              has_business_or_fo_income: true,
              non_speculative_income_inr: 25e4,
              fno_turnover_inr: 4e6,
              speculative_income_inr: -8e4,
              speculative_turnover_inr: 9e5,
              business_entries: [
                { business_name: "Mehta Advisory Services", nature: "consulting", presumptive_scheme: "s44ADA", gross_receipts_inr: 18e5, holding_pct: 5 },
                {
                  business_name: "Mehta Equipment Rentals",
                  nature: "equipment rental",
                  presumptive_scheme: null,
                  gross_receipts_inr: 24e5,
                  expenses: {
                    rent_for_business_premises_inr: 18e4,
                    employee_salary_wages_inr: 3e5,
                    other_business_expenses_inr: 12e4,
                    payments_to_residents_no_tds_inr: 1e5
                  }
                }
              ],
              asset_blocks: [
                { unit_biz_idx: 1, unit_branch_idx: null, asset_class: "plant_machinery_general", opening_wdv_inr: 2e6, additions_during_year_inr: 5e5, addition_date: "2026-06-01", sale_consideration_inr: 0, is_new_manufacturing_asset: false }
              ],
              msme_payables: [
                { unit_biz_idx: 1, unit_branch_idx: null, supplier_name: "Precision Tools Co", amount_inr: 5e4, invoice_date: "2026-01-01", has_written_agreement: false, payment_date: null }
              ],
              partner_firms: [
                { firm_name: "Kapoor & Mehta Consulting LLP", entity_type: "llp", remuneration_from_entity_inr: 6e5, interest_on_capital_from_entity_inr: 12e4, profit_share_exempt_inr: 9e5 }
              ]
            }, capital_gains: { short_term_15_pct: 18e4 } },
            // Occasional fantasy-sports/online-gaming winnings (very common alongside
            // NRI rental/dividend income today) plus an unexplained cash deposit the
            // client can't source-document (a routine real-world s.195/115BBE flag, not a
            // fabricated edge case).
            other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 26e4, dividend_inr: 22e4, online_gaming_winnings_inr: 18e4, unexplained_income_115BBE_inr: 25e4 },
            deductions: {},
            lrs_outbound: {},
            tax_credits: { tds_already_deducted_inr: 43e4 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Rohan Mehta", date_of_birth: "1985-03-22", filing_status: "mfj", ssn_or_itin_type: "ssn" },
            us_residency_detail: { is_us_citizen: false, has_green_card: true, us_days_current_year: 345, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "none" },
            income_us_source: {
              has_employment_income: true,
              wages_w2: [{ employer_name: "Northwind Labs", wages_box1_usd: 158e3, qualified_tip_income_usd: 2400, qualified_overtime_premium_usd: 5800, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 3e4, medicare_wages_box5_usd: 158e3 } }],
              self_employment: [{ business_name: "Mehta Analytics (consulting)", self_employment_earnings_usd: 62e3 }],
              // A general-partner stake in a small consulting partnership — Box 4
              // guaranteed payments (previously dropped from income entirely) plus
              // Box 1 ordinary income; Box 14A (self_employment_earnings_usd) is the
              // K-1's own combined SE-tax figure, exercising the fix that
              // partnership SE tax was unconditionally $0 before (Box 14A was never
              // read). QBI only picks up the $18,000 ordinary slice, correctly
              // excluding the $12,000 guaranteed payments. Also carries a small
              // Box 5 interest allocation and a Box 12 s.179 deduction, exercising
              // the K-1 passive-income-box and s.179 fixes on the SAME K-1 that
              // already exercises Box 1/4/14A.
              partnerships_k1: [{ business_name: "Meridian Consulting Partners LLC", partner_type: "general", ordinary_business_income_usd: 18e3, guaranteed_payments_usd: 12e3, self_employment_earnings_usd: 3e4, interest_income_usd: 900, sec179_deduction_usd: 2e3 }],
              // A passive minority stake in a friend's S-corp — Box 1 ordinary
              // income under ordinary_income_usd, the REAL Layer 1 US field name
              // (scorp_income_usd/ordinary_business_income_usd exist nowhere on
              // the live form and previously left EVERY S-corp K-1's Box 1 at $0
              // regardless of what was entered — the single highest-value gap
              // found in the ccorp/scorp/partnership/trust form audit). No
              // material participation, so correctly excluded from SE tax.
              s_corporations_k1: [{ business_name: "Harborline Print Co", ordinary_income_usd: 9e3, ordinary_dividends_usd: 500, is_specified_service_trade: false }],
              interest_us_source_usd: 5200,
              ordinary_dividends_us_source_usd: 6400,
              qualified_dividends_us_source_usd: 4e3,
              ltcg_us_source_usd: 12e3,
              rental_income_us_source_usd: 27e3
            },
            income_foreign_source: { foreign_rental_income_usd: 14458, foreign_dividends_usd: 2651, foreign_interest_usd: 3133, foreign_stcg_usd: 2169 },
            retirement_accounts: { "401k_employee_contribution_usd": 23e3, "401k_employer_match_usd": 9500, roth_ira_contribution_usd: 7e3, hsa_contribution_usd: 4150 },
            financial_holdings: [{ asset_name: "Fidelity \u2014 Taxable Brokerage", account_type: "taxable_brokerage", peak_balance_usd: 224e3, country: "US" }, { asset_name: "Vanguard \u2014 VTSAX / VTI", account_type: "taxable_brokerage", peak_balance_usd: 141e3, country: "US" }],
            real_estate: { has_real_estate_transaction: true, properties: [{ name: "Rental condo \u2014 Jersey City, NJ", property_type: "Residential rental", gross_rent_usd: 36e3, expenses_usd: 9e3 }] },
            // Works in Manhattan, lives across the river — NY statutory-residency
            // facts (permanent abode + 184+ days present) put NY state tax in play
            // even though the rental property itself is in NJ (unmodeled — no NJ
            // bracket data exists in this engine).
            state_residency: { primary_state_of_residence: "NY", ny_actual_days_present: 240, ny_permanent_place_of_abode: true },
            // Deliberate demo error: a US-based green-card holder (365 US days) cannot
            // claim FEIE — no foreign tax home, no presence test. The engine must zero
            // the exclusion and raise the "FEIE claimed but not eligible" conflict.
            foreign_earned_income: { claims_feie: true, feie_amount_claimed_usd: 14458, tax_home_country: "United States", bona_fide_residence: false, physical_presence: false, days_in_us_during_test_period: 365 },
            bank_accounts: [{ bank_name: "SBI (NRO)", account_type: "nro", country: "India", peak_balance_usd: 31325 }, { bank_name: "Axis (NRE)", account_type: "nre", country: "India", peak_balance_usd: 22892 }],
            fbar_aggregate_peak_usd: 54217,
            foreign_entities: { owns_10_percent_foreign_corp: false, foreign_corporations: [], pfic_holdings: [{ asset_name: "SBI Bluechip Fund", holding_value_usd: 50602 }, { asset_name: "Mirae Asset Large Cap", holding_value_usd: 31325 }], has_pfics: true },
            ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "Passive", foreign_taxes_usd: 5180 }] },
            withholding_and_estimated: { federal_withholding_total_usd: 3e4 },
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P3 = {
          id: "india_ror_us_income",
          label: "India ROR \xB7 US income",
          story: "Resident of India (ROR), formerly NRI, with US rental, dividends & brokerage. India taxes worldwide \u2192 Form 44/\xA7159 credit for US tax; Schedule FA for US assets; files 1040-NR on US-source income with a treaty rate claimed but no W-8BEN on file, plus FIRPTA withholding on a US property sale; kept her Chapter XII-A election on specified assets after becoming ROR. Also sold NVDA (held directly in her US brokerage) after 18 months \u2014 India treats it as an unlisted foreign security (24mo LTCG threshold, no s.198 exemption) so it's STCG at her slab rate there, but the US calls the same gain LTCG (12mo threshold) \u2014 a holding-period characterization mismatch. As an India resident, she also remitted \u20B915L to top up that brokerage under LRS \u2014 the first demo of s.206C(1G) TCS (20% on the \u20B95L over the \u20B910L base threshold), a mechanism entirely separate from TDS since it's collected on money leaving India, not income arriving.",
          tags: ["Form 44", "Schedule FA", "1040-NR", "FIRPTA", "Foreign equity"],
          router: router("Anita Desai", { is_us_citizen: false, has_green_card: false, us_days: 35, date_of_birth: "1982-11-09" }),
          india: {
            profile: { full_name: "Anita Desai", entity_type: "individual", date_of_birth: "1982-11-09", pan: "AADPD9012R", tax_regime: "OLD" },
            residency_detail: { days_in_india_current_year: 320, final_india_residency_status: "ROR" },
            dtaa: { tax_residency_country: "IN", is_us_resident_for_dtaa: false, dtaa_treaty_residence: "none", trc_status: true, form_10f: true },
            // Was NRI for years before moving back; kept the Chapter XII-A election
            // on her specified foreign-exchange assets even after becoming ROR
            // (s.217 permits this by re-filing annually) — a real, easy-to-miss
            // retained-concession scenario, not just a first-time NRI election.
            compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true }, chapter_xiia_elected: true },
            bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 18e5 }],
            property: { has_indian_property_transaction: false, properties: [] },
            // NVDA held 18 months (Feb 2025 - Aug 2026): >12mo so LTCG for the US,
            // but <=24mo so STCG-at-slab-rate for India (foreign shares are
            // "unlisted foreign securities" under Indian law — 24mo threshold,
            // not 12) — triggers the holding-period characterization mismatch.
            financial_holdings: { has_financial_transactions: true, transactions: [
              {
                asset_class: "foreign_equity_unlisted",
                asset_name_or_ticker: "NVDA",
                acquisition_date: "2025-02-01",
                purchase_value: 8e3,
                purchase_currency: "USD",
                sale_date: "2026-08-01",
                sale_value: 15e3,
                sale_currency: "USD",
                stt_paid: false,
                transfer_expenses: 0,
                is_specified_foreign_exchange_asset: false
              }
            ] },
            foreign_assets: { has_foreign_assets: true, assets: [{ country: "US", type: "brokerage", value_inr: 68e5 }, { country: "US", type: "real_estate", value_inr: 12e6 }] },
            // Small side consulting practice alongside the salaried role —
            // regular books (Phase 1 depreciation on a second ROR-eligible
            // profile, different asset class than Aarav's — a furnished home
            // office, General P&M — for coverage diversity).
            domestic_income: { salary: { has_salary_income: true, taxable_salary_inr: 36e5 }, house_property: { has_house_property_income: false, properties: [] }, business_income: { has_business_or_fo_income: true, business_entries: [
              {
                business_name: "Desai Advisory",
                nature: "management consulting",
                presumptive_scheme: null,
                gross_receipts_inr: 7e5,
                expenses: { other_business_expenses_inr: 5e4, ca_professional_fees_inr: 15e3 }
              }
            ], asset_blocks: [
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "plant_machinery_general", opening_wdv_inr: 15e4, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false }
            ] }, capital_gains: {} },
            // LTCG well above the s.198 exemption threshold — exercises the fix
            // where totalIncomeInr now correctly excludes the exempt slice instead
            // of counting the full gross gain.
            capital_gains: { ltcg_112a_inr: 3e5 },
            other_sources: { has_other_sources_income: true, interest_savings_inr: 6e4, interest_fd_rd_inr: 14e4 },
            deductions: { s80C: { epf_employee_inr: 15e4 }, s80D: { self_family_premium_inr: 25e3 } },
            // Remitted funds to top up her US brokerage this year — as an India
            // ROR, LRS (s.206C(1G)) applies: 20% TCS on the ₹5L excess over the
            // ₹10L base threshold, since "investment" isn't one of the
            // concessional-rate purposes (education/medical).
            lrs_outbound: { total_lrs_remitted_this_fy_inr: 15e5, lrs_purpose: "investment" },
            tax_credits: { advance_tax_q1_15jun_inr: 2e5, advance_tax_q2_15sep_inr: 2e5, tds_already_deducted_inr: 15e4 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Anita Desai", date_of_birth: "1982-11-09", filing_status: "single", ssn_or_itin_type: "itin" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 35, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN", dtaa_treaty_residence: "IN" },
            income_us_source: { has_real_estate: true, interest_us_source_usd: 1800, ordinary_dividends_us_source_usd: 9600, qualified_dividends_us_source_usd: 7e3, ltcg_us_source_usd: 22e3, rental_income_us_source_usd: 3e4 },
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [{ bank_name: "Chase", account_type: "checking", country: "US", peak_balance_usd: 42e3 }],
            fbar_aggregate_peak_usd: 0,
            foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: { federal_withholding_total_usd: 9800 },
            // Treaty rate claimed on FDAP but no W-8BEN on file (nra_w8ben_missing),
            // plus a US real-property disposition subject to FIRPTA withholding.
            nra_specific: {
              files_form_1040nr: true,
              us_eci_income_usd: 3e4,
              us_fdap_income_usd: 11400,
              treaty_rate_claims: [{ income_type: "dividends", rate: 15 }],
              submitted_w8ben: false,
              us_real_property_disposed: true,
              firpta_withholding_usd: 45e3
            },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P4 = {
          id: "founder_indian_company",
          label: "Founder \xB7 Indian company",
          story: `US resident owning an Indian Pvt Ltd (\u226510%). Triggers Form 5471 + GILTI/Subpart-F on the US side while the company is taxed in India, plus a two-tranche share buyback from his own company. The founder-era tranche \u2014 since Budget 2026 (Tax Year 2026-27, s.69) \u2014 is unlisted-share LTCG at 12.5%, not the pre-2026 deemed-dividend-at-slab-rates treatment; as a 100%-owner he's also a "promoter" under s.69(2)(b), so an additional tax plus a 12% surcharge layers on top of that ordinary LTCG tax. A second, more recent tranche (~17 months held) demonstrates the holding-period characterization mismatch: India's unlisted-share threshold is 24 months (so this is short-term, slab-rate, there) while the US's uniform 12-month threshold makes the SAME gain long-term \u2014 the first demo of that cross-border conflict, with a real recomputed US-dollar figure showing what's at stake if the wrong classification is used on the US return. Two kids \u2014 the first demo of the (OBBBA, TY2025-2028) $2,200/child Child Tax Credit, and (both grandparents having pitched in) the first demo of a Trump Account (\xA7530A) contribution cap breach \u2014 $11,000 across 2 children against the $10,000 combined annual cap. (Full entity separation arrives with multi-entity Phase 1.)`,
          tags: ["Form 5471", "GILTI", "CFC", "entity", "buyback", "CTC", "Trump Account"],
          router: router("Vikram Rao", { is_us_citizen: false, has_green_card: true, us_days: 340, date_of_birth: "1986-05-30" }),
          india: {
            profile: { full_name: "Vikram Rao", entity_type: "individual", date_of_birth: "1986-05-30", pan: "AAVPR3456S", tax_regime: "NEW" },
            residency_detail: { days_in_india_current_year: 25, final_india_residency_status: "NR" },
            // A dividend treaty election on his full ₹5L dividend at 25% (Art
            // 10(2)(b), the generic portfolio rate) — but the domestic s.207
            // dividend rate (20%) is actually LOWER. TRC/Form 41 are on file this
            // time, but s.159 still guarantees him whichever is more beneficial,
            // so this mistaken election has zero effect (still taxed at 20%) even
            // though it's sitting on file claiming 25%. Contrast: an interest
            // election on ₹2L of NRO interest at 15% (Art 11(2)(b)) genuinely
            // beats the 20% domestic rate, and docs are present, so THIS one
            // actually lowers his tax — the success case neither Rohan (docs
            // missing) nor his own dividend election (worse rate) demonstrates.
            dtaa: { tax_residency_country: "US", is_us_resident_for_dtaa: true, dtaa_treaty_residence: "US", trc_status: true, form_10f: true, treaty_elections: [
              { income_type: "dividend", amount_inr: 5e5, elected_rate: 0.25, treaty_article: "Art 10(2)(b)" },
              { income_type: "interest", amount_inr: 2e5, elected_rate: 0.15, treaty_article: "Art 11(2)(b)" }
            ] },
            compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true } },
            bank_accounts: [{ bank_name: "Kotak (Company)", account_type: "current", peak_balance_inr: 54e5 }],
            property: { properties: [] },
            financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "unlisted_equity", asset_name: "Nova Systems Pvt Ltd (100%)", value_inr: 45e6 }] },
            // linked_client_id (docs/GAP_TRACKER.md section H.12): same explicit
            // tag as the US foreign_corporations entry above, on this profile's
            // India-side declaration of the same holding — both sides of one
            // real-world relationship now carry the tag independently, exactly
            // as a live advisor filling out both forms would do.
            //
            // acquisition_date/number_of_shares/cost_per_share (added same
            // session, per user request to complete this as a real acquisition
            // record rather than a name-only stub): founder's original paid-up
            // capital, well before the current tax year — still a HELD position
            // (no sale_date/sale_price_per_share), consistent with the US side
            // showing him as an ACTIVE 100% CFC owner with ongoing GILTI income.
            // engine/normalize.js only reads cost/date fields once sale_date is
            // present ("still holding — no taxable event yet" otherwise), so
            // this doesn't change any computed tax figure.
            unlisted_equity: { has_unlisted_equity_transaction: true, transactions: [{ company: "Nova Systems Pvt Ltd", holding_pct: 100, linked_client_id: "india_pvt_ltd", acquisition_date: "2019-04-15", number_of_shares: 1e4, cost_per_share: 10, cost_per_share_currency: "INR" }] },
            domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: { short_term_15_pct: 1e5 } },
            // Two partial buybacks by his own company, same round of corporate
            // action, two different share tranches:
            //
            // 1. Founder-era shares held since incorporation (>24 months,
            //    unlisted) — Budget 2026 (s.69, ITA 2025) taxes buy-backs on/after
            //    1-Apr-2026 as LTCG @12.5%, not the pre-Apr-2026 full-consideration
            //    deemed dividend at slab rates. Cost basis is nominal founder-share
            //    value: Rs35L consideration less a Rs50k cost basis = Rs34.5L LTCG
            //    (unlisted, no indexation, s.198). As a 100%-owner he's also a
            //    "promoter" (s.69(2)(b)) — modeled via is_promoter, demonstrating
            //    the additional-tax-plus-surcharge layer (30% non-corporate target
            //    rate) on top of the ordinary 12.5% LTCG.
            // 2. A later tranche (a secondary sale of shares from a follow-on
            //    round, acquired 2025-01-15) tendered in the SAME buyback,  held
            //    ~17 months — squarely in the 12-24 month gap where India's
            //    unlisted-share threshold (24mo) and the US's uniform threshold
            //    (12mo) DISAGREE: short-term (slab rate) in India, long-term
            //    (preferential rate) in the US. Demonstrates the holding-period
            //    characterization mismatch finding — same company, same buyback
            //    event, deliberately different holding period from tranche 1 so
            //    the profile shows both the clean case and the mismatch case
            //    side by side.
            //
            // Uses the full per-transaction shape (not the aggregated shortcut)
            // specifically so this profile also exercises normalize.js's
            // transaction-array aggregation path, not just the demo-shortcut one.
            share_buyback: { transactions: [
              {
                company_name: "Nova Systems Pvt Ltd",
                is_listed: false,
                is_promoter: true,
                buyback_date: "2026-06-15",
                original_acquisition_date: "2018-04-01",
                consideration_received_inr: 35e5,
                original_cost_inr: 5e4,
                capital_gain_or_loss: 345e4,
                gain_classification: "ltcg",
                buyback_pre_or_post_oct2024: "capital_gains_era"
              },
              {
                company_name: "Nova Systems Pvt Ltd",
                is_listed: false,
                is_promoter: true,
                buyback_date: "2026-06-15",
                original_acquisition_date: "2025-01-15",
                consideration_received_inr: 15e5,
                original_cost_inr: 2e5,
                capital_gain_or_loss: 13e5,
                gain_classification: "stcg_slab",
                buyback_pre_or_post_oct2024: "capital_gains_era"
              }
            ] },
            other_sources: { has_other_sources_income: true, dividend_inr: 5e5, interest_fd_rd_inr: 2e5 },
            // A brought-forward STCG loss bigger than this year's STCG gain — set
            // off first against current STCG, then the spillover offsets his new
            // buyback LTCG too (s.111/s.198's ordering), fully absorbing it. (Was
            // "only partly absorbed" before the LTCG existed to soak up the
            // spillover — now demonstrates full absorption across two gain types
            // in one year, distinct from the HUF's total non-absorption.)
            carry_forward_losses: { has_brought_forward_losses: true, stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 25e4 }] },
            deductions: {},
            lrs_outbound: {},
            tax_credits: { advance_tax_q1_15jun_inr: 6e5, advance_tax_q2_15sep_inr: 7e5, advance_tax_q3_15dec_inr: 7e5, advance_tax_q4_15mar_inr: 5e5 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            // Two kids — well under the $400k MFJ Child Tax Credit phase-out, so
            // this demonstrates the full $2,200/child CTC (§24, TY2025-2028 OBBBA
            // amount) with no phase-out reduction.
            profile: { tax_entity_type: "individual", full_name: "Vikram Rao", date_of_birth: "1986-05-30", filing_status: "mfj", ssn_or_itin_type: "ssn", incorporated_in_us: false, dependents_count: 2, trump_accounts_opened: true, trump_accounts_num_children: 2, trump_accounts_children_born_2025_2028: 1, trump_accounts_total_contributions_usd: 11e3 },
            us_residency_detail: { is_us_citizen: false, has_green_card: true, us_days_current_year: 340, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "none" },
            income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Nova Systems USA Inc", wages_box1_usd: 165e3, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 31e3, medicare_wages_box5_usd: 165e3 } }], interest_us_source_usd: 3400, ordinary_dividends_us_source_usd: 5200, qualified_dividends_us_source_usd: 3600, ltcg_us_source_usd: 18e3 },
            income_foreign_source: { foreign_dividends_usd: 6024 },
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [{ bank_name: "Kotak (Company)", account_type: "current", country: "India", peak_balance_usd: 65060 }],
            fbar_aggregate_peak_usd: 65060,
            // Shaped like the real "Add Foreign Corporation" UI (syncCorpState())
            // actually writes — corporation_name/country_of_incorporation/
            // ownership_percentage, not corp_name/country/ownership_pct — so this
            // profile exercises the gap tracker US-26 alias fix instead of the
            // short internal names the engine used to require. gilti_income_usd
            // stays a hand-entered estimate (the real card has no GILTI input at
            // all — that's the separate, larger XB-14 quantification gap), same
            // convention as every other "demo profile injects a figure the real
            // form can't yet produce" shortcut elsewhere in this file.
            // linked_client_id (docs/GAP_TRACKER.md section H.12): the advisor's
            // own explicit tag that this CFC is india_pvt_ltd's own client
            // profile, entered the same way any real advisor would via the new
            // Layer 1 US "Linked client" field on this entry — not a hardcoded
            // ENTITY_LINKS seed anymore (that array is gone; entity-graph.js now
            // discovers links by scanning for this exact field).
            // tax_year_start (added same session): the CFC's own accounting year
            // start, aligned to its Indian FY (Apr-Mar) — purely descriptive
            // Form 5471 metadata, not read anywhere in normalize.js/
            // computation.js, so this has no effect on GILTI or any other
            // computed figure.
            foreign_entities: { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corporation_name: "Nova Systems Pvt Ltd", country_of_incorporation: "IN", ownership_percentage: 100, tax_year_start: "2026-04-01", gilti_income_usd: 108433, subpart_f_income_usd: 0, section_962_election_active: false, linked_client_id: "india_pvt_ltd" }], pfic_holdings: [], has_pfics: false },
            retirement_accounts: { "401k_employee_contribution_usd": 23e3, "401k_employer_match_usd": 8e3 },
            financial_holdings: [{ asset_name: "Fidelity \u2014 Taxable Brokerage (US equities)", account_type: "taxable_brokerage", peak_balance_usd: 24e4, country: "US" }],
            real_estate: { has_real_estate_transaction: true, properties: [{ name: "Primary home \u2014 Austin, TX", property_type: "Residential (own use)", gross_rent_usd: 0, expenses_usd: 0 }] },
            ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 30120 }] },
            withholding_and_estimated: { federal_withholding_total_usd: 22e3 },
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P5 = {
          id: "us_citizen_expat_india",
          label: "US Citizen expat in India",
          story: "US citizen living/working in India, past traditional retirement age but still consulting as an independent professional \u2014 genuinely eligible for (and electing) India's s.44ADA presumptive scheme, the suite's first VALID applied presumptive election. FEIE on the same foreign self-employment earnings (Schedule C, Foreign Disregarded Entity), but SE tax still applies in full since \xA7911 never reaches it. PFIC on Indian MFs, FBAR \u2014 US citizenship-based taxation always applies. A gift from her father, a long-term green-card holder who formally relinquished it and was found to be a covered expatriate, brings Form 3520 reporting plus the \xA72801 recipient-side transfer tax. At 67, the first demo of the (OBBBA, TY2025-2028) $6,000 senior deduction.",
          tags: ["FEIE", "PFIC", "citizen", "covered expatriate", "senior deduction", "s44ADA", "SE tax"],
          router: router("Grace Thomas", { is_us_citizen: true, has_green_card: false, us_days: 20, date_of_birth: "1958-09-12" }),
          india: {
            profile: { full_name: "Grace Thomas", entity_type: "individual", date_of_birth: "1958-09-12", pan: "AGTPT7890T", tax_regime: "NEW" },
            residency_detail: { days_in_india_current_year: 330, final_india_residency_status: "ROR" },
            dtaa: { tax_residency_country: "IN", dtaa_treaty_residence: "none", trc_status: false, form_10f: false },
            compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
            bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 21e5 }],
            property: { properties: [] },
            financial_holdings: { has_financial_transactions: true, transactions: [{ asset_type: "equity_mutual_fund", asset_name: "Parag Parikh Flexi Cap", value_inr: 18e5 }] },
            // Recharacterized from salary (the old shape) to real s.44ADA
            // professional income — she's an independent consultant paid fees by
            // an Indian client, not a W-2-style employee, and as ROR + individual
            // she's genuinely eligible (not excluded like Rohan's NR status,
            // Sharma HUF's entity type, or a company/firm) — the first demo
            // profile in the whole suite with a VALID, applied presumptive
            // election rather than one that falls through to regular books.
            // Digital receipts are 100% of the total, clearing the 95% bar for
            // the higher Rs75L ceiling; Rs50L in receipts still clears either
            // ceiling. Mirrored on the US side below as foreign self-employment
            // (Schedule C, Foreign Disregarded Entity), not foreign_wages —
            // matching her real classification as an independent contractor.
            domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, business_entries: [
              { business_name: "Grace Thomas Consulting", nature: "technical consultancy", presumptive_scheme: "s44ADA", gross_receipts_inr: 5e6, ada_digital_receipts_inr: 5e6, ada_cash_receipts_inr: 0 }
            ] }, capital_gains: {} },
            // NPS withdrawal Layer 1 records as taxable this year — exercises the
            // fix where this now actually raises US taxable income (folded into
            // foreign-source pension), distinct from Aarav's EPF-interest case.
            other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 12e4, taxable_nps_withdrawal_inr: 3e4 },
            deductions: { s80C: { ppf_inr: 15e4 } },
            lrs_outbound: {},
            // s.194J professional-fees TDS (10% of gross receipts) — the old
            // Rs9L figure was calibrated to salary-slab withholding on a Rs50L
            // W-2-style wage, wildly disproportionate to a client's flat 10%
            // deduction on Rs50L of consulting fees.
            tax_credits: { tds_already_deducted_inr: 5e5 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Grace Thomas", date_of_birth: "1958-09-12", filing_status: "single", ssn_or_itin_type: "ssn" },
            us_residency_detail: { is_us_citizen: true, has_green_card: false, us_days_current_year: 20, spt_test_met: false, final_us_residency_status: "US_CITIZEN", dtaa_treaty_residence: "none" },
            // At 67 she's collecting Social Security while still consulting —
            // exercises the gap tracker US-2 fix (IRC §86 provisional-income
            // worksheet). Her US-source investment income plus half her benefit
            // lands provisional income just above the $25,000 single-filer base
            // threshold, so only a small tier-1 slice (~11%, not 0% and not the
            // old-wrong 100%) of the $24,000 benefit ends up taxable — most of
            // her income is FEIE-excluded foreign self-employment earnings, which
            // this worksheet correctly leaves out of provisional income.
            income_us_source: {
              interest_us_source_usd: 2400,
              ordinary_dividends_us_source_usd: 5200,
              qualified_dividends_us_source_usd: 4100,
              ltcg_us_source_usd: 9e3,
              social_security_benefits_usd: 24e3,
              // Real classification: an independent contractor paid fees by an
              // Indian client, not a W-2-style employee — Layer 1 US's own "Add
              // Foreign Corporation"-style FDE flow (llc_type foreign_disregarded)
              // is what actually models this, not income_foreign_source.foreign_wages.
              // Same $60,241 as her India-side Rs50L gross receipts (Rs50L / 83).
              // net self-employment earnings ARE foreign earned income for FEIE,
              // but the resulting SE tax is NOT excluded by it (Schedule SE runs
              // on the full, unexcluded figure) — she genuinely owes SE tax now,
              // which the old wages characterization never exposed at all.
              // A laptop bought this year for the consulting practice — exercises
              // real MACRS/bonus depreciation (US-18) on a Schedule C business,
              // not just the gross-receipts-less-expenses shell. 100% bonus
              // depreciation (permanent under OBBBA) fully expenses it in year 1.
              // Known simplification, same as Layer 1 US's own asset-row form
              // (no "used predominantly outside the US" flag exists to enter):
              // real law (s.168(g)) mandates the Alternative Depreciation System
              // — straight-line, longer recovery periods, NO bonus depreciation
              // — for property used predominantly abroad, which this laptop (used
              // in her India practice) technically is. Not modeled here, matching
              // the gap in the source form rather than guessing at ADS figures
              // the preparer has no way to signal.
              self_employment: [
                {
                  id: "grace-consulting-in",
                  business_name: "Grace Thomas Consulting (India)",
                  llc_type: "foreign_disregarded",
                  has_se_income: true,
                  gross_receipts_usd: 60241,
                  expenses_usd: 0,
                  is_specified_service_trade: true,
                  assets: [{ id: "grace-laptop", name: "Consulting laptop", class: "5-year", cost: 2500, sec179: 0, bonus: true, placed_in_service_date: "2026-02-01" }]
                }
              ],
              // A modest distribution from her late mother's family trust — the
              // trust K-1 card (trusts_estates_k1[]) was previously read NOWHERE
              // in the engine at all (gap tracker US-17): Box 1 ordinary income
              // plus a Box 5/6a/6b passive slice, none of which reached AGI
              // before this fix regardless of how it was entered.
              trusts_estates_k1: [
                { business_name: "Thomas Family Trust", trust_type: "simple", ordinary_income_usd: 4e3, interest_income_usd: 300, ordinary_dividends_usd: 600, qualified_dividends_usd: 500, is_specified_service_trade: false }
              ]
            },
            income_foreign_source: { foreign_interest_usd: 1446 },
            foreign_earned_income: { claims_feie: true, foreign_earned_income_usd: 60241, feie_amount_claimed_usd: 60241, qualification_test: "bona_fide_residence", tax_home_country: "India", bona_fide_residence: true, bona_fide_residence_start_date: "2022-06-01", physical_presence: false, days_in_us_during_test_period: 20 },
            bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", country: "India", peak_balance_usd: 25301 }],
            fbar_aggregate_peak_usd: 25301,
            foreign_entities: { foreign_corporations: [], owns_foreign_disregarded_entity: true, pfic_holdings: [{ asset_name: "Parag Parikh Flexi Cap", holding_value_usd: 21687 }], has_pfics: true },
            financial_holdings: [{ asset_name: "Vanguard \u2014 Taxable Brokerage (US, pre-move)", account_type: "taxable_brokerage", peak_balance_usd: 118e3, country: "US" }],
            retirement_accounts: { indian_epf_balance_usd: 3600 },
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: { federal_withholding_total_usd: 0 },
            nra_specific: { files_form_1040nr: false },
            // Her father, a decades-long US green-card holder, formally relinquished
            // it after retiring back to India and was determined a "covered
            // expatriate" on net worth — the gift he sent her this year carries the
            // §2801 recipient-side transfer tax on top of the ordinary Form 3520 gift
            // reporting (no income tax on the gift itself, but real penalty/tax exposure).
            foreign_gifts_and_trusts: { received_foreign_gifts_above_100k: true, received_gift_from_covered_expatriate: true },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P6 = {
          id: "india_only_ca_client",
          label: "India-Only \xB7 CA client (no US exposure)",
          story: 'Business POV of a pure-India CA practice: a Bengaluru senior manager with zero US ties at all \u2014 Router is explicitly "India only," and the Monitor collapses to a single-country view (no US badge, no US residency card, no DTAA panel) rather than fabricating a dual-jurisdiction picture. Deliberately dense: salary plus two side businesses (a presumptive s.44ADA UX-consulting practice and a regular-books stationery retail shop exercising depreciation, an MSME-payment disallowance, and F&O/speculative ring-fencing), a partner stake in a family LLP, listed-equity STCG/LTCG, an unlisted-company share buyback, a crypto sale taxed flat under s.115BBH, a physical-gold sale plus a Sovereign Gold Bond redeemed exempt at maturity, the full spread of "other sources" (family pension, a taxable gift, online-gaming winnings, taxable EPF interest), nine separate Chapter VI-A deductions under the OLD regime, an LRS remittance, a brought-forward capital loss, and a full advance-tax/TDS reconciliation \u2014 everything a well-off, purely domestic Indian client actually brings a CA in one filing year.',
          tags: ["India-only", "single-jurisdiction", "presumptive + regular books", "F&O", "VDA/crypto", "partner-firm", "depreciation", "Chapter VI-A"],
          router: router("Kavya Iyer", { us_days: 0, is_us_citizen: false, has_green_card: false, has_us_source_income_or_assets: false, date_of_birth: "1984-11-20", jurisdiction: "single_india" }),
          india: {
            profile: { full_name: "Kavya Iyer", entity_type: "individual", date_of_birth: "1984-11-20", pan: "AKIPI4567L", tax_regime: "OLD" },
            residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR" },
            dtaa: {},
            compliance_docs: {},
            bank_accounts: [{ bank_name: "HDFC Bank", account_type: "savings", peak_balance_inr: 28e5 }, { bank_name: "SBI", account_type: "current", peak_balance_inr: 95e4 }],
            property: { has_indian_property_transaction: true, properties: [
              { address: "Flat 3B, Indiranagar, Bengaluru", property_type: "Residential", annual_value_inr: 36e4, gross_rent_received_inr: 48e4, municipal_taxes_paid_inr: 18e3 },
              { address: "2BHK, Mysore", property_type: "Residential", annual_value_inr: 18e4, gross_rent_received_inr: 24e4, municipal_taxes_paid_inr: 9e3 }
            ] },
            foreign_assets: { has_foreign_assets: false, assets: [] },
            foreign_income: { has_foreign_income: false },
            // Listed-fund holdings (no capital gain modeled on these directly —
            // held, not sold) + an ETH sale (s.115BBH flat 30%, no threshold, no
            // loss set-off eligibility — the same VDA ring-fence Sharma HUF's BTC
            // sale exercises).
            financial_holdings: { has_financial_transactions: true, transactions: [
              { asset_type: "equity_mutual_fund", asset_name: "Parag Parikh Flexi Cap", value_inr: 32e5 },
              { asset_type: "debt_mutual_fund", asset_name: "ICICI Pru Corporate Bond Fund", value_inr: 14e5 },
              { asset_class: "vda_crypto", asset_name_or_ticker: "ETH", quantity: 3, acquisition_date: "2024-02-10", purchase_value: 48e4, purchase_currency: "INR", sale_date: "2026-09-01", sale_value: 72e4, sale_currency: "INR", transfer_expenses: 0 }
            ] },
            // A small angel stake, tendered in a buyback this year — LTCG on an
            // unlisted, non-promoter holding (contrast Vikram Rao's promoter
            // buyback in founder_indian_company, which additionally carries the
            // s.69(2)(b) promoter surcharge layer this one doesn't). The actual
            // taxable event (the buyback) is modeled below via share_buyback,
            // not here — this entry is just "also holds a stake in X," same as
            // Vikram Rao's. acquisition_date/number_of_shares/cost_per_share
            // (added same session) match share_buyback's own
            // original_acquisition_date ("2021-03-01") and original_cost_inr
            // (250000 = 2500 shares x Rs.100) exactly, so the two records agree
            // on the same historical purchase instead of each stating it
            // independently.
            unlisted_equity: { has_unlisted_equity_transaction: true, transactions: [{ company: "Brightlane Foods Pvt Ltd", holding_pct: 4, acquisition_date: "2021-03-01", number_of_shares: 2500, cost_per_share: 100, cost_per_share_currency: "INR" }] },
            share_buyback: { transactions: [
              {
                company_name: "Brightlane Foods Pvt Ltd",
                is_listed: false,
                is_promoter: false,
                buyback_date: "2026-07-10",
                original_acquisition_date: "2021-03-01",
                consideration_received_inr: 9e5,
                original_cost_inr: 25e4,
                capital_gain_or_loss: 65e4,
                gain_classification: "ltcg",
                buyback_pre_or_post_oct2024: "capital_gains_era"
              }
            ] },
            // Physical gold sold at a gain (GROUP_C, s.112, 24mo threshold) plus a
            // Sovereign Gold Bond redeemed AT MATURITY — exempt under s.47(viic),
            // exercising the "genuinely no taxable event" branch, not just a low
            // one.
            commodities: { transactions: [
              { asset_class: "physical_gold", acquisition_date: "2023-11-01", purchase_value: 32e4, purchase_currency: "INR", sale_date: "2026-10-15", sale_value: 41e4, sale_currency: "INR" },
              { asset_class: "sovereign_gold_bond_original", acquisition_date: "2018-11-05", purchase_value: 15e4, purchase_currency: "INR", sale_date: "2026-11-05", sale_value: 26e4, sale_currency: "INR", is_maturity_redemption: true }
            ] },
            domestic_income: {
              salary: { has_salary_income: true, taxable_salary_inr: 24e5, employer_nps_contribution_inr: 12e4 },
              house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 36e4 }, { annual_value_inr: 18e4 }] },
              business_income: {
                has_business_or_fo_income: true,
                // F&O ordinary profit + a small ring-fenced speculative LOSS (must
                // NOT offset the ordinary business total — same rule Rohan Mehta's
                // profile exercises).
                non_speculative_income_inr: 32e4,
                fno_turnover_inr: 65e5,
                speculative_income_inr: -45e3,
                speculative_turnover_inr: 5e5,
                business_entries: [
                  { business_name: "Kavya Iyer UX Consulting", nature: "design consultancy", presumptive_scheme: "s44ADA", gross_receipts_inr: 22e5, ada_digital_receipts_inr: 2e6, ada_cash_receipts_inr: 2e5 },
                  {
                    business_name: "Iyer Stationery Mart",
                    nature: "retail trading",
                    presumptive_scheme: null,
                    turnover_inr: 85e5,
                    gross_receipts_inr: 85e5,
                    expenses: {
                      rent_for_business_premises_inr: 48e4,
                      employee_salary_wages_inr: 96e4,
                      other_business_expenses_inr: 62e4,
                      insurance_premium_inr: 4e4,
                      payments_to_residents_no_tds_inr: 15e4
                    }
                  }
                ],
                asset_blocks: [
                  { unit_biz_idx: 1, unit_branch_idx: null, asset_class: "plant_machinery_general", opening_wdv_inr: 9e5, additions_during_year_inr: 3e5, addition_date: "2026-05-15", sale_consideration_inr: 0, is_new_manufacturing_asset: false }
                ],
                msme_payables: [
                  { unit_biz_idx: 1, unit_branch_idx: null, supplier_name: "Sunrise Packaging Co", amount_inr: 65e3, invoice_date: "2026-02-01", has_written_agreement: false, payment_date: null }
                ],
                partner_firms: [
                  { firm_name: "Iyer & Rao Jewelry Trading LLP", entity_type: "llp", remuneration_from_entity_inr: 48e4, interest_on_capital_from_entity_inr: 9e4, profit_share_exempt_inr: 7e5 }
                ]
              },
              // short_term_15_pct is read from domestic_income.capital_gains (via
              // di.capital_gains — di = annual.domestic_income), same path as
              // every other profile. ltcg_112a_inr is NOT read from here — it
              // needs the separate TOP-LEVEL india.capital_gains sibling below
              // (annual.capital_gains, a genuinely different container); nesting
              // it here instead silently dropped ₹2,10,000 of real LTCG from the
              // computation entirely (found matching Anita Desai's
              // india_ror_us_income profile, the one other profile that uses
              // ltcg_112a_inr and gets the container right).
              capital_gains: { short_term_15_pct: 34e4 }
            },
            capital_gains: { ltcg_112a_inr: 21e4 },
            other_sources: { has_other_sources_income: true, interest_savings_inr: 32e3, interest_fd_rd_inr: 21e4, dividend_inr: 95e3, family_pension_gross_inr: 18e4, gifts_above_50k_inr: 12e4, online_gaming_winnings_inr: 4e4, taxable_epf_interest_inr: 28e3 },
            // Nine distinct Chapter VI-A sections, only meaningful under the OLD
            // regime (why this profile picks OLD, unlike most others in the
            // suite) — 80C intentionally oversubscribed (₹2,00,000 of
            // contributions against the ₹1,50,000 cap) to exercise the cap itself,
            // not just an under-cap figure.
            deductions: {
              s80C: { epf_employee_inr: 15e4, elss_inr: 5e4, life_insurance_premium_inr: 35e3, tuition_fees_inr: 6e4 },
              s80CCD_1B: { nps_additional_inr: 5e4 },
              s80D: { self_family_premium_inr: 28e3, parents_premium_inr: 45e3 },
              s80DDB: { has_specified_diseases_treatment: true, medical_expenses_inr: 55e3, patient_category: "senior" },
              s80E: { education_loan_interest_inr: 85e3 },
              s80EEA_EE: { affordable_home_loan_interest_inr: 14e4, loan_sanction_date: "2020-06-15" },
              s80TTA_TTB: { savings_interest_inr: 32e3 },
              s80ggb_ggc_political_donation_inr: 25e3
            },
            carry_forward_losses: { has_brought_forward_losses: true, stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 9e4 }] },
            lrs_outbound: { total_lrs_remitted_this_fy_inr: 12e5 },
            tax_credits: { advance_tax_q1_15jun_inr: 18e4, advance_tax_q2_15sep_inr: 22e4, advance_tax_q3_15dec_inr: 22e4, advance_tax_q4_15mar_inr: 18e4, tds_already_deducted_inr: 31e4 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          // Minimal shell — Layer 1's own profile-seeding contract always ships
          // both sides so neither form crashes if opened, but every field here is
          // genuinely empty/zero (not a hand-waved guess): this taxpayer has no US
          // days, no US citizenship/green card, no US-source income or assets.
          // Combined with the router's explicit "single_india" jurisdiction (also
          // independently auto-detected — see model.meta.hasUsScope), the Monitor
          // renders NOTHING US-related for this profile.
          us: {
            profile: { tax_entity_type: "individual", full_name: "Kavya Iyer", filing_status: "single" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
            income_us_source: {},
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [],
            fbar_aggregate_peak_usd: 0,
            foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: {},
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P7 = {
          id: "us_only_cpa_client",
          label: "US-Only \xB7 CPA client (no India exposure)",
          story: 'Business POV of a pure-US CPA practice: a Sacramento data consultant with zero India ties at all \u2014 Router is explicitly "US only," and the Monitor collapses to a single-country view (no India badge, no India residency card, no DTAA panel) rather than fabricating a dual-jurisdiction picture. Deliberately dense: W-2 wages, a Schedule C consulting practice with two real depreciable assets (a server rack partially \xA7179-expensed, a business SUV 100%-bonus-depreciated), a limited-partner K-1, an SSTB S-corp K-1 (exercising the QBI phase-out a non-SSTB K-1 never triggers), a family-trust K-1, rental real estate, both short- and long-term capital gains, an ISO exercise plus private-activity-bond interest (both AMT preference items), a full itemized-deduction spread landing above the SALT cap, the Child & Dependent Care Credit plus an education credit for two CTC-eligible dependents, 401(k)/HSA contributions alongside IRA/401(k) distributions in the same year, and California state residency \u2014 everything a well-off, purely domestic US client actually brings a CPA in one filing year.',
          tags: ["US-only", "single-jurisdiction", "Schedule C depreciation", "K-1", "SSTB/QBI", "AMT", "itemized deductions", "credits"],
          router: router("David Chen", { is_us_citizen: true, has_green_card: false, us_days: 365, date_of_birth: "1979-03-08", jurisdiction: "single_us" }),
          // Minimal shell — mirror-image of P6's US side: zero India days, no
          // Indian income, no Indian assets, on file. Combined with the router's
          // explicit "single_us" jurisdiction, the Monitor renders NOTHING
          // India-related for this profile.
          india: {
            profile: { full_name: "David Chen", entity_type: "individual", tax_regime: "NEW" },
            residency_detail: { days_in_india_current_year: 0, final_india_residency_status: "NR" },
            dtaa: {},
            compliance_docs: {},
            bank_accounts: [],
            property: { properties: [] },
            financial_holdings: { transactions: [] },
            domestic_income: { salary: { has_salary_income: false }, house_property: { has_house_property_income: false, properties: [] }, business_income: { has_business_or_fo_income: false, business_entries: [] }, capital_gains: {} },
            other_sources: {},
            deductions: {},
            carry_forward_losses: {},
            lrs_outbound: {},
            tax_credits: {},
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "David Chen", date_of_birth: "1979-03-08", filing_status: "mfj", ssn_or_itin_type: "ssn", dependents_count: 2 },
            us_residency_detail: { is_us_citizen: true, has_green_card: false, us_days_current_year: 365, spt_test_met: true, final_us_residency_status: "US_CITIZEN", dtaa_treaty_residence: "none" },
            income_us_source: {
              has_employment_income: true,
              wages_w2: [{ employer_name: "Meridian Analytics Inc", wages_box1_usd: 21e4, tax_details_collapsed_by_default: { federal_tax_withheld_usd: 41e3, medicare_wages_box5_usd: 21e4 } }],
              // Real per-asset MACRS/§179/100%-bonus depreciation (US-29, shipped
              // this session) on TWO assets in the same business: the server rack
              // splits §179 ($10,000) and bonus (100% on the $12,000 remainder);
              // the SUV takes 100% bonus on the full $20,000 basis outright —
              // exercising both paths in one Schedule C, sized to still leave a
              // real positive net-SE-income figure (Schedule SE tax, QBI) rather
              // than depreciating the whole practice's profit away to $0.
              self_employment: [
                {
                  id: "david-consulting",
                  business_name: "Chen Data Consulting",
                  has_se_income: true,
                  gross_receipts_usd: 95e3,
                  expenses_usd: 18e3,
                  is_specified_service_trade: false,
                  assets: [
                    { id: "david-server", name: "Office server rack", class: "7-year", cost: 22e3, sec179: 1e4, bonus: true, placed_in_service_date: "2026-03-01" },
                    { id: "david-suv", name: "Business SUV (>6,000 lb GVWR)", class: "5-year", cost: 2e4, sec179: 0, bonus: true, placed_in_service_date: "2026-06-15" }
                  ]
                }
              ],
              // Limited partner (no material participation) — ordinary income only,
              // no guaranteed payments, no SE tax base.
              partnerships_k1: [{ business_name: "Ridgeline Capital Partners LP", partner_type: "limited", ordinary_business_income_usd: 14e3, guaranteed_payments_usd: 0, self_employment_earnings_usd: 0, interest_income_usd: 1200, ordinary_dividends_usd: 800, sec179_deduction_usd: 0 }],
              // A specified-service-trade S-corp (health field) — exercises the
              // QBI SSTB phase-out the non-SSTB K-1s in this same profile don't
              // trigger.
              s_corporations_k1: [{ business_name: "Brightpath Dental PC", ordinary_income_usd: 22e3, ordinary_dividends_usd: 0, is_specified_service_trade: true }],
              trusts_estates_k1: [{ business_name: "Chen Family Trust", trust_type: "simple", ordinary_income_usd: 6e3, interest_income_usd: 400, ordinary_dividends_usd: 700, qualified_dividends_usd: 600, is_specified_service_trade: false }],
              interest_us_source_usd: 4200,
              ordinary_dividends_us_source_usd: 8200,
              qualified_dividends_us_source_usd: 6100,
              ltcg_us_source_usd: 32e3,
              stcg_us_source_usd: 9e3,
              rental_income_us_source_usd: 21e3,
              // Retirement DISTRIBUTIONS in the same year as active retirement
              // CONTRIBUTIONS below (realistic: an old employer's 401(k) rolled
              // out / partially cashed while still actively saving elsewhere) —
              // Layer 1 US has no live UI for these fields yet (gap tracker
              // US-24), but the engine itself already reads them.
              ira_distributions_usd: 12e3,
              "401k_distributions_usd": 8e3,
              se_health_insurance_deduction_usd: 9600,
              se_retirement_deduction_usd: 15e3
            },
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            // ISO bargain element — an AMT preference item alongside the private-
            // activity-bond interest below, both landing in the same return.
            equity_compensation: { iso_exercises: [{ shares_exercised: 2e3, fmv_at_exercise_usd: 40, strike_price_usd: 15 }] },
            itemized_deductions_and_credits: {
              use_standard_or_itemized: "itemized",
              state_and_local_taxes_paid_usd: 45e3,
              mortgage_interest_paid_usd: 24e3,
              charitable_contributions_cash_usd: 12e3,
              charitable_contributions_appreciated_usd: 5e3,
              medical_expenses_usd: 8e3,
              student_loan_interest_usd: 2500,
              child_and_dependent_care_expenses_usd: 9e3,
              education_credits_aotc_usd: 2500,
              education_credits_llc_usd: 0,
              dependents_count: 2
            },
            // Real field path (amt_inputs.private_activity_bond_interest_usd, not
            // the itemized-card fallback) — see gap tracker US-21.
            amt_inputs: { private_activity_bond_interest_usd: 3e3 },
            state_residency: { primary_state_of_residence: "CA", ca_retains_property_or_voter_reg: true },
            // Layer 1 US's bank_accounts field is specifically for FOREIGN account
            // disclosure (FBAR/8938) — a real US taxpayer with only domestic
            // banking has nothing to enter here at all, and a US-domestic account
            // entered here would (bug found building this profile: aggregateAccounts'
            // fallback summed ALL disclosed accounts toward the FBAR aggregate
            // without filtering out US-country ones) incorrectly count toward the
            // $10,000 FBAR reporting cliff. David has no foreign accounts, so this
            // stays empty rather than listing his ordinary US checking account.
            bank_accounts: [],
            fbar_aggregate_peak_usd: 0,
            foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
            retirement_accounts: { "401k_employee_contribution_usd": 23e3, "401k_employer_match_usd": 11e3, hsa_contribution_usd: 8300 },
            financial_holdings: [{ asset_name: "Vanguard \u2014 Taxable Brokerage", account_type: "taxable_brokerage", peak_balance_usd: 34e4, country: "US" }, { asset_name: "Fidelity 401(k)", account_type: "retirement_brokerage", peak_balance_usd: 41e4, country: "US" }],
            real_estate: { has_real_estate_transaction: true, properties: [{ name: "Rental duplex \u2014 Sacramento, CA", property_type: "Residential rental", gross_rent_usd: 36e3, expenses_usd: 15e3 }] },
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: { federal_withholding_total_usd: 41e3, estimated_tax_q1_apr15_usd: 8e3, estimated_tax_q2_jun15_usd: 8e3, estimated_tax_q3_sep15_usd: 8e3, estimated_tax_q4_jan15_usd: 8e3 },
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var B1 = {
          id: "india_pvt_ltd",
          label: "Indian Pvt Ltd (company)",
          story: "Business POV: an Indian domestic company (SaaS exporter). Corporate tax under \xA7200 (22%), MAT check, ITR-6 \u2014 business profits, not salary.",
          tags: ["company", "ITR-6", "200", "corporate"],
          router: router("Nova Systems Pvt Ltd", { us_days: 0, has_us_source_income_or_assets: false }),
          india: {
            // mat_book_profit intentionally absent: Layer 1 India nulls that field
            // the moment opt_115baa is checked (div-prof-mat-profit is hidden and
            // cleared — s.115JB(5A) exempts s.115BAA companies from MAT outright),
            // so a concessional company can never actually carry a live book-profit
            // figure alongside the election.
            profile: { full_name: "Nova Systems Pvt Ltd", entity_type: "company", tax_regime: "NEW", turnover_lte_400cr: true, opt_115baa: true },
            residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR", is_poem_in_india: true, is_indian_company: true },
            dtaa: { dtaa_treaty_residence: "none", trc_status: false, has_permanent_establishment_in_india: false },
            compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
            bank_accounts: [{ bank_name: "Kotak (Current)", account_type: "current", peak_balance_inr: 42e6 }],
            property: { properties: [] },
            financial_holdings: { has_financial_transactions: false, transactions: [] },
            // Real regular-books company entry (companies are categorically
            // excluded from both s.44AD and s.44ADA, so this always lands on
            // books regardless of presumptive_scheme being left unset) — turnover
            // less clean PGBP expenses less s.32 WDV depreciation nets to the same
            // Rs6cr the old net_profit_inr shortcut asserted directly, but now
            // genuinely earned through Phase 1's expense/depreciation machinery
            // instead of bypassing it. Server room (computers, 40%) + owned office
            // (commercial building, 10%) asset blocks.
            domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [
              {
                business_name: "Nova Systems Pvt Ltd",
                nature: "software",
                presumptive_scheme: null,
                turnover_inr: 1e8,
                expenses: { employee_salary_wages_inr: 24e6, rent_for_business_premises_inr: 3e6, other_business_expenses_inr: 8e6, ca_professional_fees_inr: 7e5, insurance_premium_inr: 3e5 }
              }
            ], asset_blocks: [
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "plant_machinery_computers", opening_wdv_inr: 7e6, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false },
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "building_commercial", opening_wdv_inr: 12e6, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false }
            ] }, capital_gains: {} },
            other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 9e5 },
            deductions: {},
            lrs_outbound: {},
            tax_credits: { advance_tax_q1_15jun_inr: 3e6, advance_tax_q2_15sep_inr: 35e5, advance_tax_q3_15dec_inr: 35e5, advance_tax_q4_15mar_inr: 3e6, tds_already_deducted_inr: 4e5 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Nova Systems Pvt Ltd", filing_status: "single" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
            income_us_source: {},
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [],
            fbar_aggregate_peak_usd: 0,
            foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: {},
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var B2 = {
          id: "us_ccorp_indian_sub",
          label: "US C-Corp + Indian sub",
          story: "Business POV: a Delaware C-Corp (Form 1120, 21%) with an Indian Pvt Ltd subsidiary (ITR-6, 25%). Two corporate taxpayers + cross-border structure.",
          tags: ["C-Corp", "1120", "subsidiary", "corporate"],
          router: router("Cloudspire Inc", { us_days: 365, has_us_source_income_or_assets: true }),
          india: {
            profile: { full_name: "Cloudspire India Pvt Ltd", entity_type: "company", tax_regime: "NEW", turnover_lte_400cr: true, opt_115baa: false },
            residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR", is_poem_in_india: true, is_indian_company: true },
            dtaa: { dtaa_treaty_residence: "none", trc_status: true, has_permanent_establishment_in_india: true },
            compliance_docs: { trc: { document_uploaded: true }, form_10f: { is_filed: true } },
            bank_accounts: [{ bank_name: "HSBC (Current)", account_type: "current", peak_balance_inr: 3e7 }],
            property: { properties: [] },
            financial_holdings: { has_financial_transactions: false, transactions: [] },
            // Real regular-books company entry (same s.44AD/44ADA entity-type
            // exclusion as Nova Systems above). Net profit is engineered to land on the
            // exact same Rs8cr the old net_profit_inr shortcut asserted directly,
            // since that figure is precisely mirrored into this same profile's
            // US-side gilti_income_usd/foreign_taxes_usd below (Rs8cr / 83 and
            // 25% of Rs8cr / 83 respectively) — changing it here without
            // recomputing those would silently desync the two sides again.
            domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [
              {
                business_name: "Cloudspire India Pvt Ltd",
                nature: "software",
                presumptive_scheme: null,
                turnover_inr: 14e7,
                expenses: { employee_salary_wages_inr: 35e6, rent_for_business_premises_inr: 4e6, other_business_expenses_inr: 12e6, ca_professional_fees_inr: 7e5, insurance_premium_inr: 3e5 }
              }
            ], asset_blocks: [
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "plant_machinery_computers", opening_wdv_inr: 1e7, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false },
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "building_commercial", opening_wdv_inr: 4e7, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false }
            ] }, capital_gains: {} },
            other_sources: {},
            deductions: {},
            lrs_outbound: {},
            tax_credits: { advance_tax_q1_15jun_inr: 4e6, advance_tax_q2_15sep_inr: 5e6, advance_tax_q3_15dec_inr: 5e6, advance_tax_q4_15mar_inr: 4e6 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "ccorp", full_name: "Cloudspire Inc", incorporation_state: "DE", incorporated_in_us: true, filing_status: "single" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 365, spt_test_met: false, final_us_residency_status: "DOMESTIC_ENTITY" },
            // business_income_usd was a shortcut: verified by direct grep, no
            // input anywhere in layer1_us.html ever writes that field — a real
            // ccorp-entity-type filer has no way to enter it. The real mechanism
            // Layer 1 US actually exposes for "this entity's own taxable income"
            // is Schedule M-1 (corp-tab-M1, shown once tax_entity_type is
            // ccorp/scorp/partnership) — book income plus/less the standard
            // book-to-tax reconciliation items. Engineered to net to the exact
            // same $4,260,000 the old shortcut asserted directly: $4.99M of
            // additions (book income + federal tax provision + disallowed meals +
            // foreign tax deducted-not-credited, thematically tied to the Indian
            // subsidiary's own FTC claim below) less $730k of subtractions
            // (municipal-bond tax-exempt interest + tax depreciation in excess of
            // book, e.g. bonus depreciation on servers).
            income_us_source: { c_corporations_1120: [] },
            corporate_financials: { schedule_m1: {
              net_income_per_books: 4e6,
              federal_tax_expense: 9e5,
              meals_disallowed_50: 5e4,
              foreign_taxes_credited: 4e4,
              tax_exempt_interest: 3e4,
              tax_depreciation_over_book: 7e5
            } },
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [{ bank_name: "SVB", account_type: "current", country: "US", peak_balance_usd: 18e5 }],
            fbar_aggregate_peak_usd: 0,
            // corporation_name/country_of_incorporation/ownership_percentage
            // (renamed same session from corp_name/country/ownership_pct): the
            // real "Add Foreign Corporation" UI (syncCorpState() in
            // layer1_us.html) only ever writes/reads these names — the short
            // names normalize.js/assets-nodes.js alias them to (see comment at
            // that call site, gap tracker US-26) were never what the actual form
            // produces, so this card rendered completely blank (Corporation
            // Name/Country/Ownership% all empty) despite carrying real data
            // underneath. Renaming is computationally inert (both engine and DAG
            // alias both names identically: `c.corp_name || c.corporation_name`,
            // etc.) — this only fixes what's visible in the form.
            // tax_year_start added same session too, same rationale as
            // founder_indian_company's own entry above.
            foreign_entities: { owns_10_percent_foreign_corp: true, foreign_corporations: [{ corporation_name: "Cloudspire India Pvt Ltd", country_of_incorporation: "IN", ownership_percentage: 100, tax_year_start: "2026-04-01", gilti_income_usd: 963855, subpart_f_income_usd: 0 }], pfic_holdings: [] },
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: true, ftc_baskets: [{ country: "IN", basket_category: "General", foreign_taxes_usd: 240964 }] },
            withholding_and_estimated: { estimated_tax_q1_apr15_usd: 2e5, estimated_tax_q2_jun15_usd: 22e4 },
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var B3 = {
          id: "foreign_holdco_poem_india",
          label: "Foreign Holdco \xB7 POEM in India",
          story: "Business POV: a Singapore-incorporated holding company whose real commercial decisions are made from Mumbai. Not incorporated in India, but its Place of Effective Management facts resolve it to an Indian tax resident anyway \u2014 entity-level dual residency with no individual-style tie-breaker to resolve it.",
          tags: ["company", "POEM", "s.6(3)", "entity"],
          router: router("Meridian Holdings Pte Ltd", { us_days: 0, has_us_source_income_or_assets: false }),
          india: {
            profile: { full_name: "Meridian Holdings Pte Ltd", entity_type: "company", tax_regime: "NEW", turnover_lte_400cr: true, opt_115baa: false },
            residency_detail: { days_in_india_current_year: 365, final_india_residency_status: "ROR", is_indian_company: false },
            company_residency: {
              is_active_business: true,
              board_meetings_primarily_outside_india: true,
              key_management_location: "Mumbai, India",
              management_delegated_outside_india: false,
              directors_in_india_count: 3,
              directors_outside_india_count: 2
            },
            dtaa: { dtaa_treaty_residence: "none", trc_status: false, has_permanent_establishment_in_india: false },
            compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
            bank_accounts: [{ bank_name: "DBS (Current)", account_type: "current", peak_balance_inr: 18e6 }],
            property: { properties: [] },
            financial_holdings: { has_financial_transactions: false, transactions: [] },
            // Real regular-books company entry, same entity-type exclusion as the
            // other two company profiles above. Owned Mumbai office (commercial
            // building, 10%) doubles as the seat of the key-management-location
            // fact this profile's POEM finding hinges on. Nets to the same Rs2.2cr
            // the old net_profit_inr shortcut asserted directly.
            domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: true, entity_type: "company", business_entries: [
              {
                business_name: "Meridian Holdings Pte Ltd",
                nature: "investment holding",
                presumptive_scheme: null,
                turnover_inr: 3e7,
                expenses: { employee_salary_wages_inr: 3e6, rent_for_business_premises_inr: 8e5, other_business_expenses_inr: 12e5, ca_professional_fees_inr: 3e5, insurance_premium_inr: 1e5 }
              }
            ], asset_blocks: [
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "building_commercial", opening_wdv_inr: 2e7, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false },
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "plant_machinery_computers", opening_wdv_inr: 15e5, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false }
            ] }, capital_gains: {} },
            other_sources: {},
            deductions: {},
            lrs_outbound: {},
            tax_credits: { advance_tax_q1_15jun_inr: 12e5, advance_tax_q2_15sep_inr: 14e5, advance_tax_q3_15dec_inr: 14e5, advance_tax_q4_15mar_inr: 12e5 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Meridian Holdings Pte Ltd", filing_status: "single" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
            income_us_source: {},
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [],
            fbar_aggregate_peak_usd: 0,
            foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: {},
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var B4 = {
          id: "sharma_huf",
          label: "Sharma HUF (family investment vehicle)",
          story: "Business POV: an HUF managing ancestral property and FD investments in India. Control & management is NOT wholly outside India, so it stays resident \u2014 a different test than the individual day-count. At ~\u20B96.5L income it sits right at the \xA7156 rebate threshold, demonstrating the entity-aware fix (HUF isn't entitled to the individual-only rebate). PAN also isn't linked to Aadhaar, so every TDS figure here understates the higher rate actually being withheld. Also sold some Bitcoin this year for a gain \u2014 taxed flat 30% under s.115BBH regardless of how long held, and the family's \u20B92,00,000 brought-forward STCG loss can't touch it at all (VDA gains are never loss-set-off eligible, not even against another VDA's loss in the same year) \u2014 a common, costly misconception this demo makes concrete. Also sold a plot this year for \u20B968L \u2014 a purely domestic transaction where the RESIDENT buyer withholds 1% under s.194-IA, the first demo of resident-side (non-NRI) property TDS.",
          tags: ["HUF", "entity", "156", "control and management", "PAN-Aadhaar", "VDA/crypto"],
          router: router("Sharma HUF", { us_days: 0, has_us_source_income_or_assets: false }),
          india: {
            profile: { full_name: "Sharma HUF", entity_type: "huf", tax_regime: "NEW", pan_aadhaar_linked: false },
            residency_detail: { is_wholly_outside_india: false, final_india_residency_status: "ROR" },
            dtaa: {},
            compliance_docs: {},
            bank_accounts: [{ bank_name: "SBI", account_type: "current", peak_balance_inr: 9e5 }],
            // Also sold a plot this year — a RESIDENT seller, so the buyer withholds
            // 1% under s.194-IA (not s.195, which is NR-only) on the ₹68L sale
            // consideration. Layer 1 previously only ever collected buyer-TDS
            // detail for NR sellers; this demonstrates it now capturing the same
            // withholding for a domestic resident too.
            property: { has_indian_property_transaction: true, properties: [
              { address: "Ancestral home, Jaipur", property_type: "Residential", annual_value_inr: 3e5, gross_rent_received_inr: 36e4, municipal_taxes_paid_inr: 12e3 },
              { address: "Plot 7, Vasant Vihar, Jaipur", property_type: "Land (non-agricultural)", sale_date: "2026-09-15", sale_consideration: 68e5, sale_consideration_currency: "INR", buyer_tan: "JPRS12345K", buyer_tds_deducted_inr: 68e3, buyer_tds_challan_number: "CHLN99182" }
            ] },
            // Bitcoin sold this year for a ₹300,000 gain — s.115BBH flat 30%, no
            // holding-period threshold, no set-off against the ₹200,000 STCG loss
            // carryforward below (loss set-off is a Capital Gains head mechanism;
            // VDA gains sit entirely outside that head).
            financial_holdings: { has_financial_transactions: true, transactions: [
              {
                asset_class: "vda_crypto",
                asset_name_or_ticker: "BTC",
                quantity: 0.5,
                acquisition_date: "2023-06-01",
                purchase_value: 9e5,
                purchase_currency: "INR",
                sale_date: "2026-08-01",
                sale_value: 12e5,
                sale_currency: "INR",
                transfer_expenses: 0
              }
            ] },
            // Family kirana (general store) trading business — deliberately
            // ELECTS s.44ADA (presumptive_scheme set), but HUFs are specifically
            // excluded from s.44ADA (entity44ADAExcluded, not rorFails — a
            // genuinely different ineligibility reason than Rohan Mehta's NR
            // exclusion) — the election is invalid and falls through to regular
            // books, exercising that exact branch of the trace message fix.
            domestic_income: { salary: { has_salary_income: false }, house_property: { has_house_property_income: true, properties: [{ annual_value_inr: 3e5 }] }, business_income: { has_business_or_fo_income: true, business_entries: [
              {
                business_name: "Sharma Kirana Store",
                nature: "general trading",
                presumptive_scheme: "s44ADA",
                gross_receipts_inr: 12e5,
                expenses: { rent_for_business_premises_inr: 1e5, employee_salary_wages_inr: 18e4, other_business_expenses_inr: 6e4 }
              }
            ], asset_blocks: [
              { unit_biz_idx: 0, unit_branch_idx: null, asset_class: "building_commercial", opening_wdv_inr: 4e5, additions_during_year_inr: 0, addition_date: null, sale_consideration_inr: 0, is_new_manufacturing_asset: false }
            ] }, capital_gains: {} },
            other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 35e4 },
            deductions: {},
            // A prior-year business loss and STCG loss on file, but the HUF has no
            // business income or capital gains THIS year to absorb either against
            // — demonstrates the "correctly stays fully carried forward, nothing
            // to set off" branch of the loss set-off computation.
            carry_forward_losses: { has_brought_forward_losses: true, business_loss_cf: [{ assessment_year: "AY2023-24", amount_inr: 5e5 }], stcg_loss_cf: [{ assessment_year: "AY2024-25", amount_inr: 2e5 }] },
            lrs_outbound: {},
            tax_credits: { tds_already_deducted_inr: 15e3 },
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Sharma HUF", filing_status: "single" },
            us_residency_detail: { is_us_citizen: false, has_green_card: false, us_days_current_year: 0, spt_test_met: false, final_us_residency_status: "NON_RESIDENT_ALIEN" },
            income_us_source: {},
            income_foreign_source: {},
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [],
            fbar_aggregate_peak_usd: 0,
            foreign_entities: { foreign_corporations: [], pfic_holdings: [] },
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: {},
            nra_specific: { files_form_1040nr: false },
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var P8 = {
          id: "greencard_retiree_india",
          label: "Green Card Retiree in India",
          story: "A US green-card holder who has retired back to India, spending most of the year there (300 days \u2014 past India's 182-day residency test) on a modest family pension, with a short visit back to see family (20 US days). She's genuinely a tax resident of BOTH countries this year \u2014 India by day-count, the US unconditionally by green-card status, which never depends on days at all \u2014 yet owes $0 real tax in either: India's s.87A rebate fully absorbs tax on her \u20B96L income, and her honestly-reported worldwide income (the same pension, plus a little interest on each side) sits comfortably under the US standard deduction. The Monitor's two statuses no other demo profile ever reaches: India is threshold-crossed-but-$0-tax (Filing-only \u2014 she must still file to disclose the foreign account), and the US is worldwide-taxpayer-but-nowhere-near-any-threshold (Approaching) \u2014 both real, both correctly NOT 'Exposed' or 'On track'.",
          tags: ["green card", "retiree", "dual resident", "Approaching", "Filing-only", "s87A rebate"],
          router: router("Lakshmi Pillai", { is_us_citizen: false, has_green_card: true, us_days: 20, date_of_birth: "1958-04-15" }),
          india: {
            profile: { full_name: "Lakshmi Pillai", entity_type: "individual", date_of_birth: "1958-04-15", pan: "ALPPL1234M", tax_regime: "NEW" },
            // days>=182 with nr9/d7729 both false derives ROR — matches the
            // recorded status below, so this doesn't also trip the residency
            // consistency finding; that's not what this profile is demonstrating.
            residency_detail: { days_in_india_current_year: 300, final_india_residency_status: "ROR", nr_years_last_10_gte_9: false, days_in_india_last_7_years_lte_729: false },
            dtaa: { tax_residency_country: "IN", dtaa_treaty_residence: "none", trc_status: false, form_10f: false },
            compliance_docs: { trc: { document_uploaded: false }, form_10f: { is_filed: false } },
            bank_accounts: [{ bank_name: "SBI", account_type: "savings", peak_balance_inr: 85e4 }],
            property: { properties: [] },
            financial_holdings: { has_financial_transactions: false, transactions: [] },
            domestic_income: { salary: { has_salary_income: false }, business_income: { has_business_or_fo_income: false }, capital_gains: {} },
            other_sources: { has_other_sources_income: true, family_pension_inr: 6e5, interest_fd_rd_inr: 8e3 },
            deductions: {},
            lrs_outbound: {},
            tax_credits: {},
            metadata: meta("layer1_india_v5_1", "TY2026-27")
          },
          us: {
            profile: { tax_entity_type: "individual", full_name: "Lakshmi Pillai", date_of_birth: "1958-04-15", filing_status: "single", ssn_or_itin_type: "ssn" },
            // hasGreenCard alone makes her a worldwide US taxpayer (resolveResidency
            // in computation.js) — spt_test_met is irrelevant here and the SPT
            // consistency check in conflicts.js skips entirely once has_green_card
            // is true, so a low day count next to a green card never looks like a
            // data-entry error the way it would for a non-citizen/non-green-card filer.
            us_residency_detail: { is_us_citizen: false, has_green_card: true, us_days_current_year: 20, spt_test_met: false, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "none" },
            income_us_source: { interest_us_source_usd: 200 },
            // Worldwide income reported honestly (not omitted) — same India pension
            // and interest, converted — and it's still under the $16,100 single
            // standard deduction, so this is genuinely $0 tax, not a hidden gap.
            income_foreign_source: { foreign_interest_usd: 96, foreign_pension_usd: 7228 },
            foreign_earned_income: { claims_feie: false },
            bank_accounts: [{ bank_name: "Wells Fargo", account_type: "savings", country: "US", peak_balance_usd: 4e3 }],
            fbar_aggregate_peak_usd: 4e3,
            foreign_entities: { foreign_corporations: [], owns_foreign_disregarded_entity: false, pfic_holdings: [], has_pfics: false },
            financial_holdings: [],
            retirement_accounts: {},
            ftc_inputs: { claims_ftc: false },
            withholding_and_estimated: { federal_withholding_total_usd: 0 },
            nra_specific: { files_form_1040nr: false },
            foreign_gifts_and_trusts: {},
            metadata: { schema_version: "layer1_us_v1", us_calendar_year: 2026 }
          }
        };
        var PROFILES = [P1, P2, P3, P4, P5, P6, P7, P8, B1, B2, B3, B4];
        PROFILES.forEach(function(p) {
          p.india.quarters = buildQuarters(p.india, p.router.base_tax_year || 2026);
        });
        function listProfiles() {
          return PROFILES.map(function(p) {
            return { id: p.id, label: p.label, story: p.story, tags: p.tags };
          });
        }
        function getProfile(id) {
          for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === id) return PROFILES[i];
          return null;
        }
        function loadProfile(id) {
          var p = getProfile(id);
          if (!p) return false;
          try {
            try {
              for (var i = root.localStorage.length - 1; i >= 0; i--) {
                var k = root.localStorage.key(i);
                if (k && k.indexOf("wising_") === 0) root.localStorage.removeItem(k);
              }
            } catch (e) {
            }
            root.localStorage.setItem(KEYS.ROUTER, JSON.stringify(p.router));
            root.localStorage.setItem(KEYS.INDIA, JSON.stringify(p.india));
            root.localStorage.setItem(KEYS.US, JSON.stringify(p.us));
            root.localStorage.setItem(ACTIVE_KEY, id);
            try {
              root.dispatchEvent(new StorageEvent("storage", { key: KEYS.INDIA }));
            } catch (e) {
            }
            try {
              root.dispatchEvent(new CustomEvent("wising:profile", { detail: { id } }));
            } catch (e) {
            }
            return true;
          } catch (e) {
            return false;
          }
        }
        function activeProfileId() {
          try {
            return root.localStorage.getItem(ACTIVE_KEY);
          } catch (e) {
            return null;
          }
        }
        WISING.PROFILES = PROFILES;
        WISING.listProfiles = listProfiles;
        WISING.getProfile = getProfile;
        WISING.loadProfile = loadProfile;
        WISING.activeProfileId = activeProfileId;
      })(typeof window !== "undefined" ? window : globalThis);
    }
  });

  // prototypes/graph-pilot/graph.js
  var require_graph = __commonJS({
    "prototypes/graph-pilot/graph.js"(exports, module) {
      "use strict";
      function wrapDeps(depValues, nodeId) {
        return new Proxy(depValues, {
          get: function(target, prop) {
            if (typeof prop === "symbol" || prop === "toJSON" || prop === "then") return target[prop];
            if (!Object.prototype.hasOwnProperty.call(target, prop)) {
              throw new Error(
                "Node '" + nodeId + "'.compute() accessed '" + prop + "', which isn't in its own declared deps. Add '" + prop + "' to this node's deps array \u2014 or if this was accidental, this check just caught a real bug (the exact class that silently zeroed out income heads while closing the aggregateIndiaIncome boundary)."
              );
            }
            return target[prop];
          }
        });
      }
      function createGraph(nodeDefs) {
        Object.keys(nodeDefs).forEach(function(id) {
          var def = nodeDefs[id];
          if (def.scopeGate && def.deps.indexOf(def.scopeGate) === -1) {
            throw new Error(
              "Node '" + id + "' declares scopeGate '" + def.scopeGate + "' but doesn't list it in deps \u2014 the gate must be an explicit dependency so it resolves before the gate check runs."
            );
          }
        });
        function resolve(targetIds, ctx) {
          var cache = {};
          var inStack = {};
          function resolveOne(id) {
            if (Object.prototype.hasOwnProperty.call(cache, id)) return cache[id];
            var def = nodeDefs[id];
            if (!def) throw new Error("Unknown node '" + id + "'");
            if (inStack[id]) throw new Error("Cycle detected at node '" + id + "'");
            inStack[id] = true;
            var depValues = {};
            def.deps.forEach(function(depId) {
              depValues[depId] = resolveOne(depId);
            });
            var guardedDeps = wrapDeps(depValues, id);
            var value;
            if (def.scopeGate && depValues[def.scopeGate] === false) {
              value = typeof def.outOfScopeValue === "function" ? def.outOfScopeValue(guardedDeps, ctx) : def.outOfScopeValue;
            } else {
              value = def.compute(guardedDeps, ctx);
            }
            cache[id] = value;
            inStack[id] = false;
            return value;
          }
          var out = {};
          targetIds.forEach(function(id) {
            out[id] = resolveOne(id);
          });
          return { values: out, all: cache };
        }
        return { resolve, nodeDefs };
      }
      module.exports = { createGraph };
    }
  });

  // prototypes/graph-pilot/fx-util.js
  var require_fx_util = __commonJS({
    "prototypes/graph-pilot/fx-util.js"(exports, module) {
      var DEFAULT_FX_RATE = 83;
      function fxRate(ctx) {
        var v = ctx && ctx.fxRateOverride;
        var n = Number(v);
        return v !== void 0 && v !== null && !isNaN(n) && n > 0 ? n : DEFAULT_FX_RATE;
      }
      module.exports = { fxRate, DEFAULT_FX_RATE };
    }
  });

  // prototypes/graph-pilot/residency-nodes.js
  var require_residency_nodes = __commonJS({
    "prototypes/graph-pilot/residency-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function deriveCompanyPoem(cr) {
        cr = cr || {};
        if (cr.isActiveBusiness === true) {
          return cr.boardMeetingsOutsideIndia === false;
        } else if (cr.keyManagementLocation) {
          if (cr.keyManagementLocation === "india") return true;
          if (cr.keyManagementLocation === "outside_india") return false;
          if (cr.keyManagementLocation === "mixed") {
            var inCount = cr.directorsInIndia || 0, outCount = cr.directorsOutsideIndia || 0;
            if (inCount > outCount) return true;
            if (outCount > inCount) return false;
            return cr.managementDelegatedOutsideIndia === false;
          }
          return false;
        } else {
          return false;
        }
      }
      function deriveIndiaDomesticStatus(entity, f) {
        if (entity === "company") {
          var isIndian = f.isIndianCompany;
          if (isIndian === true) return "ROR";
          if (isIndian === false) return deriveCompanyPoem(f.company) === true ? "ROR" : "NR";
          return "ROR";
        }
        if (entity === "firm" || entity === "llp" || entity === "aop" || entity === "trust") {
          return f.whollyOutside === true ? "NR" : "ROR";
        }
        if (entity === "huf") {
          if (f.whollyOutside === true) return "NR";
          return f.nr9 === true || f.d7729 === true ? "RNOR" : "ROR";
        }
        var days = f.days, p4y = f.p4y, emp = f.emp || "none", visit = f.visit, nr9 = f.nr9, d7729 = f.d7729, inc15 = f.inc15, ltac = f.ltac || false;
        if (days >= 182) {
          if (nr9 === false && d7729 === false) return "ROR";
          if (nr9 === true) return "RNOR";
          return "RNOR";
        } else if (days >= 60 && days < 182) {
          if (p4y === true) {
            if (emp !== "none") {
              if (inc15 === true && ltac === false) return "RNOR";
              if (inc15 === false) return "NR";
              return "NR";
            } else if (visit === true) {
              if (days >= 120 && inc15 === true) return "RNOR";
              if (days >= 120 && inc15 === false) return "NR";
              if (days < 120 && inc15 === true && ltac === false) return "RNOR";
              return "NR";
            } else {
              if (nr9 === false && d7729 === false) return "ROR";
              if (nr9 === true) return "RNOR";
              return "RNOR";
            }
          } else {
            if (inc15 === true && ltac === false) return "RNOR";
            return "NR";
          }
        } else if (days < 60) {
          if (inc15 === true && ltac === false) return "RNOR";
          return "NR";
        }
        return "NR";
      }
      var NODES = {
        indiaStatusRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.final_india_residency_status", null);
        } },
        usStatusRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "us_residency_detail.final_us_residency_status", null);
        } },
        usIsCitizenRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "us_residency_detail.is_us_citizen", false) === true;
        } },
        usHasGreenCardRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "us_residency_detail.has_green_card", false) === true;
        } },
        usSptMetRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "us_residency_detail.spt_test_met", false) === true;
        } },
        treatyIndiaResidenceRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "dtaa.dtaa_treaty_residence", "none");
        } },
        treatyDtaaForcedNrRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "dtaa.dtaa_forced_nr", false) === true;
        } },
        treatyUsResidenceRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "us_residency_detail.dtaa_treaty_residence", "none");
        } },
        treatyFiles1040nrRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "nra_specific.files_form_1040nr", false) === true;
        } },
        // ---- resolveResidency, ported in full ------------------------------------
        residencyResult: {
          deps: [
            "indiaStatusRaw",
            "usStatusRaw",
            "usIsCitizenRaw",
            "usHasGreenCardRaw",
            "usSptMetRaw",
            "treatyIndiaResidenceRaw",
            "treatyDtaaForcedNrRaw",
            "treatyUsResidenceRaw",
            "treatyFiles1040nrRaw"
          ],
          compute: function(d) {
            var inStatus = d.indiaStatusRaw, usStatus = d.usStatusRaw;
            var indiaResident = inStatus === "ROR" || inStatus === "RNOR";
            var indiaWorldwide = inStatus === "ROR";
            var usResident = d.usIsCitizenRaw || d.usHasGreenCardRaw || usStatus === "RESIDENT_ALIEN" || d.usSptMetRaw;
            var usWorldwide = usResident;
            var indiaCedes = d.treatyIndiaResidenceRaw === "us" || d.treatyDtaaForcedNrRaw === true;
            var usCedes = (d.treatyUsResidenceRaw === "india" || d.treatyFiles1040nrRaw === true) && !d.usIsCitizenRaw;
            var tieBreakWinner = d.treatyIndiaResidenceRaw !== "none" ? d.treatyIndiaResidenceRaw : d.treatyUsResidenceRaw !== "none" ? d.treatyUsResidenceRaw : null;
            if (indiaCedes) indiaWorldwide = false;
            if (usCedes) usWorldwide = false;
            return {
              india: { status: inStatus, isResident: indiaResident, worldwide: indiaWorldwide, cedesViaTreaty: indiaCedes },
              us: { status: usStatus, isResident: usResident, worldwide: usWorldwide, isCitizen: d.usIsCitizenRaw, cedesViaTreaty: usCedes },
              dualResident: indiaResident && usResident,
              tieBreakWinner,
              worldwideOverlap: indiaWorldwide && usWorldwide
            };
          }
        },
        // ---- raw leaves: entity kind + the FULL individual/company/HUF fact set -
        indiaEntityKindRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.entity_type", "individual");
        } },
        indiaDaysCurrentYearRaw: { deps: [], compute: function(d, ctx) {
          return Number(safe(ctx.india, "residency_detail.days_in_india_current_year", 0)) || 0;
        } },
        indiaDays4YearRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.days_in_india_preceding_4_years_gte_365", null);
        } },
        indiaEmploymentOrCrewRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.employment_or_crew_status", null);
        } },
        indiaVisitPioCitizenRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.came_on_visit_to_india_pio_citizen", null);
        } },
        indiaNr9Raw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.nr_years_last_10_gte_9", null);
        } },
        indiaD7729Raw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.days_in_india_last_7_years_lte_729", null);
        } },
        indiaIncome15lRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.india_source_income_above_15l", null);
        } },
        indiaLtacRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.liable_to_tax_in_another_country_being_indian_citizen", false) === true;
        } },
        indiaIsIndianCompanyRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.is_indian_company", null);
        } },
        indiaWhollyOutsideIndiaRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.is_wholly_outside_india", null);
        } },
        companyIsActiveBusinessRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "company_residency.is_active_business", false) === true;
        } },
        companyBoardOutsideIndiaRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "company_residency.board_meetings_primarily_outside_india", false) === true;
        } },
        companyKeyManagementLocationRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "company_residency.key_management_location", "");
        } },
        companyManagementDelegatedOutsideRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "company_residency.management_delegated_outside_india", false) === true;
        } },
        companyDirectorsInIndiaRaw: { deps: [], compute: function(d, ctx) {
          return Number(safe(ctx.india, "company_residency.directors_in_india_count", 0)) || 0;
        } },
        companyDirectorsOutsideIndiaRaw: { deps: [], compute: function(d, ctx) {
          return Number(safe(ctx.india, "company_residency.directors_outside_india_count", 0)) || 0;
        } },
        usDaysCurrentYearRaw: { deps: [], compute: function(d, ctx) {
          return Number(safe(ctx.us, "us_residency_detail.us_days_current_year", 0)) || 0;
        } },
        usIncorporatedInUsRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "profile.incorporated_in_us", null);
        } },
        usEntityKindRaw: {
          deps: [],
          compute: function(d, ctx) {
            var usT = safe(ctx.us, "profile.tax_entity_type", "individual");
            if (usT === "llc") usT = safe(ctx.us, "profile.llc_tax_election", "individual");
            return usT;
          }
        },
        // ---- deriveCompanyPoem, as its own node (individually testable) ---------
        indiaCompanyPoemDerived: {
          deps: [
            "companyIsActiveBusinessRaw",
            "companyBoardOutsideIndiaRaw",
            "companyKeyManagementLocationRaw",
            "companyManagementDelegatedOutsideRaw",
            "companyDirectorsInIndiaRaw",
            "companyDirectorsOutsideIndiaRaw"
          ],
          compute: function(d) {
            return deriveCompanyPoem({
              isActiveBusiness: d.companyIsActiveBusinessRaw,
              boardMeetingsOutsideIndia: d.companyBoardOutsideIndiaRaw,
              keyManagementLocation: d.companyKeyManagementLocationRaw,
              managementDelegatedOutsideIndia: d.companyManagementDelegatedOutsideRaw,
              directorsInIndia: d.companyDirectorsInIndiaRaw,
              directorsOutsideIndia: d.companyDirectorsOutsideIndiaRaw
            });
          }
        },
        // ---- deriveIndiaDomesticStatus, as a node — full runResidencySolver() ---
        // port, PURE domestic law, no DTAA override (see file header). -----------
        indiaDomesticStatusDerived: {
          deps: [
            "indiaEntityKindRaw",
            "indiaDaysCurrentYearRaw",
            "indiaDays4YearRaw",
            "indiaEmploymentOrCrewRaw",
            "indiaVisitPioCitizenRaw",
            "indiaNr9Raw",
            "indiaD7729Raw",
            "indiaIncome15lRaw",
            "indiaLtacRaw",
            "indiaIsIndianCompanyRaw",
            "indiaWhollyOutsideIndiaRaw",
            "indiaCompanyPoemDerived",
            "companyIsActiveBusinessRaw",
            "companyBoardOutsideIndiaRaw",
            "companyKeyManagementLocationRaw",
            "companyManagementDelegatedOutsideRaw",
            "companyDirectorsInIndiaRaw",
            "companyDirectorsOutsideIndiaRaw"
          ],
          compute: function(d) {
            return deriveIndiaDomesticStatus(d.indiaEntityKindRaw, {
              days: d.indiaDaysCurrentYearRaw,
              p4y: d.indiaDays4YearRaw,
              emp: d.indiaEmploymentOrCrewRaw,
              visit: d.indiaVisitPioCitizenRaw,
              nr9: d.indiaNr9Raw,
              d7729: d.indiaD7729Raw,
              inc15: d.indiaIncome15lRaw,
              ltac: d.indiaLtacRaw,
              isIndianCompany: d.indiaIsIndianCompanyRaw,
              whollyOutside: d.indiaWhollyOutsideIndiaRaw,
              company: {
                isActiveBusiness: d.companyIsActiveBusinessRaw,
                boardMeetingsOutsideIndia: d.companyBoardOutsideIndiaRaw,
                keyManagementLocation: d.companyKeyManagementLocationRaw,
                managementDelegatedOutsideIndia: d.companyManagementDelegatedOutsideRaw,
                directorsInIndia: d.companyDirectorsInIndiaRaw,
                directorsOutsideIndia: d.companyDirectorsOutsideIndiaRaw
              }
            });
          }
        },
        // ---- the consistency finding: derived domestic status vs. recorded ------
        residencyConsistencyFindings: {
          deps: [
            "indiaStatusRaw",
            "indiaEntityKindRaw",
            "indiaDomesticStatusDerived",
            "treatyIndiaResidenceRaw",
            "treatyDtaaForcedNrRaw",
            "usStatusRaw",
            "usDaysCurrentYearRaw",
            "usSptMetRaw",
            "usIsCitizenRaw",
            "usHasGreenCardRaw",
            "usEntityKindRaw",
            "usIncorporatedInUsRaw"
          ],
          compute: function(d) {
            var findings = [];
            if (d.indiaStatusRaw != null && d.indiaDomesticStatusDerived !== d.indiaStatusRaw) {
              var treatyOverrideActive = d.treatyIndiaResidenceRaw === "us" || d.treatyDtaaForcedNrRaw === true;
              var entityLabel = d.indiaEntityKindRaw === "individual" ? "" : d.indiaEntityKindRaw === "company" ? " (company)" : d.indiaEntityKindRaw === "huf" ? " (HUF)" : " (" + d.indiaEntityKindRaw + ")";
              if (treatyOverrideActive && d.indiaStatusRaw === "NR" && d.indiaDomesticStatusDerived !== "NR") {
                findings.push({
                  id: "residency_status_dtaa_conflated_india",
                  severity: "warning",
                  category: "residency",
                  title: "India residential status may be conflated with the DTAA treaty tie-break" + entityLabel,
                  detail: "Based on the residency facts on file, this taxpayer's India DOMESTIC-LAW status under s.6 should be " + d.indiaDomesticStatusDerived + ', but the recorded final_india_residency_status is NR. The DTAA Article 4 tie-break is recorded as resolving to the US (dtaa_treaty_residence = "us"' + (d.treatyDtaaForcedNrRaw ? " / dtaa_forced_nr = true" : "") + `). Layer 1's residency wizard used to overwrite the domestic status field itself whenever the treaty tie-break resolved away from India \u2014 but under Indian law, residential status (ROR/RNOR/NR) is a purely domestic-law determination, unaffected by any treaty. "Losing" the Article 4 tie-breaker doesn't make someone stop being domestically resident \u2014 it only changes worldwide-taxation scope for treaty purposes (already handled correctly, separately, elsewhere in this computation). This finding is the domestic-status side of that same fact pattern, surfaced because the two concepts appear to have been conflated in what was recorded for this profile.`,
                  recommendation: "For domestic-law purposes (advance-tax interest under s.234B/234C, PAN-Aadhaar linking, Schedule FA disclosure, TDS rates on India-source payments), this taxpayer's status should likely be treated as " + d.indiaDomesticStatusDerived + ", with the treaty position tracked separately as a worldwide-taxation election, not as a change to the underlying residential status.",
                  amountUsd: 0,
                  refs: ["s.6", "DTAA Art. 4"]
                });
              } else {
                findings.push({
                  id: d.indiaEntityKindRaw === "company" ? "residency_status_mismatch_india_company" : d.indiaEntityKindRaw === "individual" ? "residency_status_mismatch_india" : "residency_status_mismatch_india_entity",
                  severity: "warning",
                  category: "residency",
                  title: "India residency status may not match the facts on file" + entityLabel + " \u2014 derived " + d.indiaDomesticStatusDerived + ", recorded " + d.indiaStatusRaw,
                  detail: "Re-deriving India's residential-status determination from the same raw facts Layer 1's own wizard uses (day-count, the 4-year lookback, RNOR sub-status conditions, employment/PIO-visit exceptions, s.6(1A) deemed-residency, incorporation/POEM, or control-and-management, depending on entity type) produces " + d.indiaDomesticStatusDerived + ", but the recorded final_india_residency_status is " + d.indiaStatusRaw + ".",
                  recommendation: "Re-run the Layer 1 India residency wizard, or verify the underlying residency facts were entered consistently \u2014 this looks like a wizard or data-entry error.",
                  amountUsd: 0,
                  refs: ["s.6"]
                });
              }
            }
            if (d.usEntityKindRaw === "individual") {
              if (!d.usIsCitizenRaw && !d.usHasGreenCardRaw) {
                if (d.usDaysCurrentYearRaw >= 183 && d.usSptMetRaw === false) {
                  findings.push({
                    id: "residency_status_understated_us",
                    severity: "info",
                    category: "residency",
                    title: "US Substantial Presence Test may be understated \u2014 " + d.usDaysCurrentYearRaw + " days present but SPT marked not met",
                    detail: "Layer 1 records " + d.usDaysCurrentYearRaw + " days of physical presence in the US this year \u2014 at or above the 183-day figure IRC 7701(b)(3)'s weighted 3-year sum reaches from current-year days alone (full weight, regardless of the prior two years) \u2014 yet spt_test_met is recorded false. Two narrow exception categories exist, confirmed against Layer 1 US's own SPT calculation (layer1_us.html): 'exempt individual' status (F/J/M/Q student/trainee visas within their exempt years, foreign-government-related individuals, charitable-event athletes) excludes ALL days from the SPT count; separately, specific days can be excluded even for a non-exempt individual (e.g. a medical-condition exception). This engine does not model either, so this flag cannot rule them out \u2014 verify before assuming error.",
                    recommendation: "Confirm exempt-individual status or a day-exclusion claim doesn't apply before correcting spt_test_met \u2014 if neither does, this looks like a wizard or data-entry error.",
                    amountUsd: 0,
                    refs: ["IRC 7701(b)(3)"]
                  });
                } else if (d.usDaysCurrentYearRaw < 31 && d.usSptMetRaw === true) {
                  findings.push({
                    id: "residency_status_overstated_us",
                    severity: "warning",
                    category: "residency",
                    title: "US Substantial Presence Test may be overstated \u2014 only " + d.usDaysCurrentYearRaw + " days present but SPT marked met",
                    detail: "Layer 1 records only " + d.usDaysCurrentYearRaw + " days of physical presence in the US this year, but spt_test_met is recorded true. IRC 7701(b)(3)(A) sets an unconditional floor: the SPT cannot be satisfied with fewer than 31 days of presence in the current year, regardless of the weighted 3-year total. No known exception (exempt-individual status and day-exclusions can only reduce the count, never add days back).",
                    recommendation: "Re-run the Layer 1 US residency wizard, or verify us_days_current_year was entered for the correct calendar year.",
                    amountUsd: 0,
                    refs: ["IRC 7701(b)(3)(A)"]
                  });
                }
              }
            } else {
              if (d.usIncorporatedInUsRaw === true && d.usStatusRaw !== "DOMESTIC_ENTITY") {
                findings.push({
                  id: "residency_status_understated_us_entity",
                  severity: "warning",
                  category: "residency",
                  title: "US entity residency may be understated \u2014 incorporated in the US but not marked Domestic Entity",
                  detail: "Layer 1 records this entity as incorporated in the US (profile.incorporated_in_us = true), yet the recorded final status is " + d.usStatusRaw + ", not DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this field directly from incorporated_in_us with no other factor involved \u2014 no known exception.",
                  recommendation: "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status were entered consistently \u2014 this looks like a wizard or data-entry error.",
                  amountUsd: 0,
                  refs: []
                });
              } else if (d.usIncorporatedInUsRaw === false && d.usStatusRaw === "DOMESTIC_ENTITY") {
                findings.push({
                  id: "residency_status_overstated_us_entity",
                  severity: "warning",
                  category: "residency",
                  title: "US entity residency may be overstated \u2014 not incorporated in the US but marked Domestic Entity",
                  detail: "Layer 1 records this entity as NOT incorporated in the US (profile.incorporated_in_us = false), yet the recorded final status is DOMESTIC_ENTITY. Layer 1's own corporate residency logic sets this field directly from incorporated_in_us with no other factor involved \u2014 no known exception.",
                  recommendation: "Re-run the Layer 1 US residency wizard, or verify incorporated_in_us and final_us_residency_status were entered consistently \u2014 this looks like a wizard or data-entry error.",
                  amountUsd: 0,
                  refs: []
                });
              }
            }
            return findings;
          }
        }
      };
      module.exports = {
        NODES,
        deriveIndiaDomesticStatus,
        deriveCompanyPoem
      };
    }
  });

  // prototypes/graph-pilot/aggregateindiaincome-nodes.js
  var require_aggregateindiaincome_nodes = __commonJS({
    "prototypes/graph-pilot/aggregateindiaincome-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function monthsBetween(fromStr, toStr) {
        if (!fromStr || !toStr) return null;
        var a = new Date(fromStr), b = new Date(toStr);
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
        return (b - a) / (1e3 * 60 * 60 * 24) / 30.436875;
      }
      var CONST_AGGIN = require_constants().CONST;
      var ASSET_CLASS_RATES_INDIA = CONST_AGGIN.TAX.INDIA.ASSET_CLASS_RATES_INDIA;
      function isUnder180DaysAdditionInr(additionDateStr) {
        if (!additionDateStr) return false;
        var d = new Date(additionDateStr);
        if (isNaN(d.getTime())) return false;
        var month = d.getMonth(), date = d.getDate();
        return month === 9 && date >= 4 || month > 9 || month <= 2;
      }
      function computeAssetBlockNormalDepreciationInr(block) {
        var rate = ASSET_CLASS_RATES_INDIA[block.asset_class];
        if (!rate) return 0;
        var opening = num(block.opening_wdv_inr), additions = num(block.additions_during_year_inr), sale = num(block.sale_consideration_inr);
        var wdvBeforeDep = opening + additions - sale;
        if (wdvBeforeDep <= 0) return 0;
        var halfYear = additions > 0 && isUnder180DaysAdditionInr(block.addition_date);
        if (!halfYear) return wdvBeforeDep * rate;
        var fullRateBase = Math.max(0, opening - sale);
        var saleAgainstAdditions = Math.max(0, sale - opening);
        var halfRateBase = Math.max(0, additions - saleAgainstAdditions);
        return Math.min(wdvBeforeDep, fullRateBase * rate + halfRateBase * rate * 0.5);
      }
      function additionalDepreciationEligibleInr(india, entry) {
        var entityType = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
        var isCompany = entityType === "company";
        var isConcessionalCompany = isCompany && (safe(india, "profile.opt_115baa", false) === true || safe(india, "profile.opt_115bab", false) === true || safe(india, "profile.opt_115ba", false) === true);
        var isNewRegimeIndHuf = (entityType === "individual" || entityType === "huf") && (safe(india, "profile.tax_regime", "NEW") || "NEW").toUpperCase() !== "OLD";
        var regimeDisallows = isConcessionalCompany || isNewRegimeIndHuf;
        var hasMfgOrPowerGen = entry.business_code === "01000" || entry.business_code === "power_gen";
        return hasMfgOrPowerGen && !regimeDisallows;
      }
      function computeAssetBlockAdditionalDepreciationInr(block, india, entry) {
        if (block.asset_class !== "plant_machinery_general" || block.is_new_manufacturing_asset !== true) return 0;
        var additions = num(block.additions_during_year_inr);
        if (additions <= 0) return 0;
        if (!additionalDepreciationEligibleInr(india, entry)) return 0;
        var rate = isUnder180DaysAdditionInr(block.addition_date) ? 0.1 : 0.2;
        return additions * rate;
      }
      function aggregateEntryDepreciationInr(entryIdx, assetBlocks, india, entry) {
        var total = 0;
        (assetBlocks || []).forEach(function(block) {
          if (block.unit_biz_idx !== entryIdx) return;
          total += computeAssetBlockNormalDepreciationInr(block);
          total += computeAssetBlockAdditionalDepreciationInr(block, india, entry);
        });
        return total;
      }
      function computeMsmeDisallowanceInr(entryIdx, msmePayables) {
        var total = 0, today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        (msmePayables || []).forEach(function(m) {
          if (m.unit_biz_idx !== entryIdx) return;
          var amt = num(m.amount_inr);
          if (!m.invoice_date || amt <= 0) return;
          var invDate = new Date(m.invoice_date);
          invDate.setHours(0, 0, 0, 0);
          if (isNaN(invDate.getTime())) return;
          var dueDate = new Date(invDate);
          dueDate.setDate(dueDate.getDate() + (m.has_written_agreement === true ? 45 : 15));
          var refDate = m.payment_date ? new Date(m.payment_date) : today;
          refDate.setHours(0, 0, 0, 0);
          if (refDate > dueDate) total += amt;
        });
        return total;
      }
      function aggregateEntryDisallowancesInr(entryIdx, exp, msmePayables) {
        var s40aI = num(exp.payments_to_non_residents_no_tds_inr);
        var s40aIa = Math.round(num(exp.payments_to_residents_no_tds_inr) * 0.3);
        var s40A3 = num(exp.total_cash_payments_exceeding_limit_inr) + num(exp.total_cash_payments_exceeding_35k_inr);
        var s43Bh = computeMsmeDisallowanceInr(entryIdx, msmePayables);
        return s40aI + s40aIa + s40A3 + s43Bh;
      }
      function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
        var total = digitalInr + cashInr;
        var atLeast95PctDigital = total > 0 && cashInr / total <= 0.05;
        if (scheme === "s44AD") return atLeast95PctDigital ? 3e7 : 2e7;
        if (scheme === "s44ADA") return atLeast95PctDigital ? 75e5 : 5e6;
        return Infinity;
      }
      function usesRegularBooksInr(b, eligibility) {
        var scheme = b.presumptive_scheme;
        if (scheme === "s44AD") {
          var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
          return !(eligibility.eligible44AD && dig + csh <= presumptiveCeilingInr("s44AD", dig, csh));
        }
        if (scheme === "s44ADA") {
          var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
          var adaReceipts = num(b.gross_receipts_inr) || adaDig + adaCsh;
          return !(eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh));
        }
        if (scheme === "s44AE") return false;
        return true;
      }
      function computeBusinessEntryNetProfitInr(b, eligibility, depreciationInr, disallowancesInr) {
        eligibility = eligibility || { eligible44AD: true, eligible44ADA: true };
        var scheme = b.presumptive_scheme;
        var adaReceipts;
        if (scheme === "s44AD") {
          var dig44AD = num(b.digital_receipts_inr), csh44AD = num(b.cash_receipts_inr);
          if (eligibility.eligible44AD && dig44AD + csh44AD <= presumptiveCeilingInr("s44AD", dig44AD, csh44AD)) return dig44AD * 0.06 + csh44AD * 0.08;
        } else if (scheme === "s44ADA") {
          var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
          adaReceipts = num(b.gross_receipts_inr) || adaDig + adaCsh;
          if (eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)) return adaReceipts * 0.5;
        } else if (scheme === "s44AE") return null;
        var exp = b.expenses || {};
        var pfEsiDeductibleInr = exp.employer_pf_esi_paid_before_due_date === true ? num(exp.employer_pf_esi_contribution_inr) : 0;
        var deductibleBeforeDisallowances = num(exp.rent_for_business_premises_inr) + num(exp.repairs_maintenance_inr) + num(exp.employee_salary_wages_inr) + num(exp.employee_bonus_commission_inr) + num(exp.interest_on_borrowed_capital_inr) + num(exp.insurance_premium_inr) + num(exp.bad_debts_written_off_inr) + num(exp.other_business_expenses_inr) + num(exp.ca_professional_fees_inr) + pfEsiDeductibleInr;
        var deductible = Math.max(0, deductibleBeforeDisallowances - num(disallowancesInr));
        var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
        var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || (scheme === "s44AD" ? dig + csh : 0) || (scheme === "s44ADA" ? adaReceipts : 0);
        return receipts - deductible - num(depreciationInr);
      }
      function computeGoodsVehiclePresumptiveInr(vehicles) {
        var total = 0;
        (vehicles || []).forEach(function(v) {
          var months = num(v.months_owned);
          if (!(months > 0)) return;
          if (v.vehicle_type === "heavy") total += 1e3 * num(v.gvw_tonnes) * months;
          else if (v.vehicle_type === "light") total += 7500 * months;
        });
        return total;
      }
      function toInrAtCurrency(amount, currency, usdToInrRate) {
        var amt = num(amount);
        if (!currency || currency === "INR") return amt;
        if (currency === "USD") return amt * usdToInrRate;
        return null;
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(inr, ctx) {
        return num(inr) / fxRate(ctx);
      }
      var GROUP_A_CLASSES = CONST_AGGIN.TAX.INDIA.CG_GROUP_A_CLASSES;
      var GROUP_C_CLASSES = CONST_AGGIN.TAX.INDIA.CG_GROUP_C_CLASSES;
      var S50AA_UNLISTED_DEBT_CUTOFF = "2024-07-23";
      var NODES = {
        // ---- annual slice (re-verified independently, same logic as XB-25's port) ----
        annualSliceAgg: {
          deps: [],
          compute: function(d, ctx) {
            var india = ctx.india;
            var quarters = safe(india, "quarters", null);
            if (!quarters) return { domestic_income: safe(india, "domestic_income", {}), other_sources: safe(india, "other_sources", {}), capital_gains: safe(india, "capital_gains", {}), lrs_outbound: safe(india, "lrs_outbound", {}) };
            function merge(target, source) {
              for (var k in source) {
                if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
                var sv = source[k];
                if (sv === null || sv === void 0) continue;
                if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
                else if (typeof sv === "boolean") target[k] = target[k] || sv;
                else if (Array.isArray(sv)) {
                  if (!Array.isArray(target[k])) target[k] = [];
                  sv.forEach(function(el, i) {
                    if (el && typeof el === "object") {
                      target[k][i] = target[k][i] || {};
                      merge(target[k][i], el);
                    } else if (target[k].indexOf(el) < 0) {
                      target[k].push(el);
                    }
                  });
                } else if (typeof sv === "object") {
                  target[k] = target[k] || {};
                  merge(target[k], sv);
                } else {
                  target[k] = sv;
                }
              }
              return target;
            }
            var out = { domestic_income: {}, other_sources: {}, capital_gains: {}, lrs_outbound: {} };
            ["Q1", "Q2", "Q3", "Q4"].forEach(function(q) {
              var qs = quarters[q];
              if (!qs) return;
              if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income);
              if (qs.other_sources) merge(out.other_sources, qs.other_sources);
              if (qs.capital_gains) merge(out.capital_gains, qs.capital_gains);
              if (qs.lrs_outbound) merge(out.lrs_outbound, qs.lrs_outbound);
            });
            return out;
          }
        },
        diAgg: { deps: ["annualSliceAgg"], compute: function(d) {
          return d.annualSliceAgg.domestic_income || {};
        } },
        osAgg: { deps: ["annualSliceAgg"], compute: function(d) {
          return d.annualSliceAgg.other_sources || {};
        } },
        cgAgg: { deps: ["annualSliceAgg"], compute: function(d) {
          return d.annualSliceAgg.capital_gains || {};
        } },
        bizEntriesAgg: { deps: ["diAgg"], compute: function(d) {
          return safe(d.diAgg, "business_income.business_entries", []);
        } },
        bizAssetBlocksAgg: { deps: ["diAgg"], compute: function(d) {
          return safe(d.diAgg, "business_income.asset_blocks", []);
        } },
        bizMsmePayablesAgg: { deps: ["diAgg"], compute: function(d) {
          return safe(d.diAgg, "business_income.msme_payables", []);
        } },
        goodsVehiclesAgg: { deps: ["diAgg"], compute: function(d) {
          return safe(d.diAgg, "business_income.goods_vehicles", []);
        } },
        partnerFirmsAgg: { deps: ["diAgg"], compute: function(d) {
          return safe(d.diAgg, "business_income.partner_firms", []);
        } },
        fnoIncomeInrAgg: { deps: ["diAgg"], compute: function(d) {
          return num(safe(d.diAgg, "business_income.non_speculative_income_inr", 0));
        } },
        speculativeIncomeInrAgg: { deps: ["diAgg"], compute: function(d) {
          return num(safe(d.diAgg, "business_income.speculative_income_inr", 0));
        } },
        // Closes AGG-1's last recorded knownMissing side-channel (normalize.js
        // L731) — used only by computeIndiaItrForm's (XBR-6) >Rs5,000 ITR-1/4
        // disqualifier, not otherwise taxed by this engine (agricultural income
        // is exempt under s.10(1)).
        agriculturalIncomeInrAgg: { deps: ["diAgg"], compute: function(d) {
          return num(safe(d.diAgg, "agricultural_income_inr", 0));
        } },
        // Closes AGG-1's LAST remaining knownMissing side-channel (normalize.js
        // L1303) — needed for CFL-6 batch 2's s115bbe_unexplained_income finding.
        unexplained115bbeInrAgg: { deps: ["osAgg"], compute: function(d) {
          return num(safe(d.osAgg, "unexplained_income_115BBE_inr", 0));
        } },
        indiaResidencyStatusRawAgg: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.final_india_residency_status", null);
        } },
        // IN-38: the DTAA Article 4 tie-break to the US doesn't change domestic
        // residential status (s.6) — see residency-nodes.js's file header for the
        // full reasoning — but it DOES mean worldwide income is outside India's
        // tax net under the treaty. Read here so capitalGainsComputation's
        // isIndiaRor gate (below) can exclude foreign financial holdings for a
        // treaty-ceding taxpayer without relying on the (now-fixed) status-
        // conflation bug that used to achieve this by accident.
        indiaDtaaWorldwideCededAgg: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.dtaa_worldwide_ceded", false) === true;
        } },
        presumptiveEligibilityAgg: {
          deps: ["indiaResidencyStatusRawAgg"],
          compute: function(d, ctx) {
            var india = ctx.india;
            var ror = d.indiaResidencyStatusRawAgg === "ROR";
            var entity = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
            var entityExcluded44AD = ["llp", "company", "aop", "trust", "local", "coop", "ajp"].indexOf(entity) >= 0;
            var eligible44AD = ror && !entityExcluded44AD;
            return { eligible44AD, eligible44ADA: eligible44AD && entity !== "huf", indiaStatus: d.indiaResidencyStatusRawAgg, entityType: entity, rorFails: !ror };
          }
        },
        // ---- EXACT business.inr, with real WDV depreciation + disallowances ----
        businessComputation: {
          deps: ["bizEntriesAgg", "presumptiveEligibilityAgg", "bizAssetBlocksAgg", "bizMsmePayablesAgg", "goodsVehiclesAgg", "fnoIncomeInrAgg", "partnerFirmsAgg"],
          compute: function(d, ctx) {
            var india = ctx.india;
            var businessInr = 0, businessDepreciationInr = 0;
            var indiaHasRegularBooksEntry = false, indiaHasValidPresumptiveEntry = false;
            (d.bizEntriesAgg || []).forEach(function(b, idx) {
              var netProfitInr = b.net_profit_inr || b.net_profit;
              if (netProfitInr === void 0 || netProfitInr === null) {
                var isRegularBooks = usesRegularBooksInr(b, d.presumptiveEligibilityAgg);
                if (isRegularBooks) indiaHasRegularBooksEntry = true;
                else indiaHasValidPresumptiveEntry = true;
                var entryDepreciationInr = isRegularBooks ? aggregateEntryDepreciationInr(idx, d.bizAssetBlocksAgg, india, b) : 0;
                var entryDisallowancesInr = isRegularBooks ? aggregateEntryDisallowancesInr(idx, b.expenses || {}, d.bizMsmePayablesAgg) : 0;
                netProfitInr = computeBusinessEntryNetProfitInr(b, d.presumptiveEligibilityAgg, entryDepreciationInr, entryDisallowancesInr);
                businessDepreciationInr += entryDepreciationInr;
              } else {
                indiaHasRegularBooksEntry = true;
              }
              businessInr += num(netProfitInr);
            });
            businessInr += computeGoodsVehiclePresumptiveInr(d.goodsVehiclesAgg);
            businessInr += d.fnoIncomeInrAgg;
            var indiaHasPartnerFirmIncome = false;
            (d.partnerFirmsAgg || []).forEach(function(firm) {
              var firmIncomeInr = num(firm.remuneration_from_entity_inr) + num(firm.interest_on_capital_from_entity_inr);
              if (firmIncomeInr !== 0) indiaHasPartnerFirmIncome = true;
              businessInr += firmIncomeInr;
            });
            return { businessInr, businessDepreciationInr, indiaHasRegularBooksEntry, indiaHasValidPresumptiveEntry, indiaHasPartnerFirmIncome };
          }
        },
        // ---- capital gains: buy-back + foreign equity + financial holdings +
        // commodities + unlisted equity, ported in full -----------------------
        capitalGainsComputation: {
          deps: ["indiaResidencyStatusRawAgg", "indiaDtaaWorldwideCededAgg", "cgAgg", "osAgg", "diAgg"],
          compute: function(d, ctx) {
            var india = ctx.india, os = d.osAgg, annualCg = d.cgAgg;
            var USD_TO_INR = fxRate(ctx);
            var buybackTxs = safe(india, "share_buyback.transactions", []) || [];
            var deemedDividendInr = num(safe(os, "deemed_dividend_from_buyback_inr", 0));
            var buybackLtcgInr = num(safe(annualCg, "buyback_ltcg_inr", 0));
            var buybackStcgInr = num(safe(annualCg, "buyback_stcg_inr", 0));
            var buybackStcgSlabInr = num(safe(os, "buyback_stcg_slab_inr", 0));
            var buybackLtcg197Inr = 0, promoterBuybackLtcgInr = 0, promoterBuybackStcgInr = 0;
            var holdingPeriodMismatches = [];
            buybackTxs.forEach(function(bb) {
              if (bb.buyback_pre_or_post_oct2024 === "post_oct2024") {
                deemedDividendInr += num(bb.consideration_received_inr);
              } else if (bb.buyback_pre_or_post_oct2024 === "capital_gains_era") {
                var g = num(bb.capital_gain_or_loss);
                if (bb.gain_classification === "ltcg") {
                  if (bb.is_listed) buybackLtcgInr += g;
                  else buybackLtcg197Inr += g;
                  if (bb.is_promoter && g > 0) promoterBuybackLtcgInr += g;
                } else if (bb.gain_classification === "stcg") {
                  buybackStcgInr += g;
                  if (bb.is_promoter && g > 0) promoterBuybackStcgInr += g;
                } else if (bb.gain_classification === "stcg_slab") {
                  buybackStcgSlabInr += g;
                }
                var bbMonths = monthsBetween(bb.original_acquisition_date, bb.buyback_date);
                if (bbMonths !== null && g > 0 && bb.gain_classification) {
                  var bbUsClassification = bbMonths > 12 ? "ltcg" : "stcg";
                  var bbIndiaClassification = bb.gain_classification === "ltcg" ? "ltcg" : "stcg";
                  if (bbUsClassification !== bbIndiaClassification) {
                    holdingPeriodMismatches.push({
                      companyName: bb.company_name || "Unnamed company",
                      isListed: !!bb.is_listed,
                      monthsHeld: bbMonths,
                      gainInr: g,
                      gainUsd: inrToUsd(g, ctx),
                      indiaClassification: bbIndiaClassification,
                      usClassification: bbUsClassification,
                      indiaThresholdMonths: bb.is_listed ? 12 : 24,
                      sourceType: "buyback"
                    });
                  }
                }
              }
            });
            var isIndiaRor = d.indiaResidencyStatusRawAgg === "ROR" && !d.indiaDtaaWorldwideCededAgg;
            var foreignFinancialHoldingsTxs = isIndiaRor ? safe(india, "financial_holdings.transactions", []) || [] : [];
            var foreignEquityLtcg197Inr = 0, foreignEquityStcgSlabInr = 0;
            foreignFinancialHoldingsTxs.forEach(function(tx) {
              if (tx.asset_class !== "foreign_equity_unlisted") return;
              if (!tx.sale_date || tx.sale_value === null || tx.sale_value === void 0 || tx.sale_value === "") return;
              var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency, USD_TO_INR);
              var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency, USD_TO_INR);
              if (saleInr === null || purchaseInr === null) return;
              var months = monthsBetween(tx.acquisition_date, tx.sale_date);
              if (months === null) return;
              var g = saleInr - purchaseInr - num(tx.transfer_expenses);
              var feIndiaClassification = months > 24 ? "ltcg" : "stcg";
              if (feIndiaClassification === "ltcg") foreignEquityLtcg197Inr += g;
              else foreignEquityStcgSlabInr += g;
              if (g > 0) {
                var feUsClassification = months > 12 ? "ltcg" : "stcg";
                if (feUsClassification !== feIndiaClassification) {
                  holdingPeriodMismatches.push({
                    companyName: tx.asset_name_or_ticker || "Unnamed foreign holding",
                    isListed: false,
                    monthsHeld: months,
                    gainInr: g,
                    gainUsd: inrToUsd(g, ctx),
                    indiaClassification: feIndiaClassification,
                    usClassification: feUsClassification,
                    indiaThresholdMonths: 24,
                    sourceType: "foreign_equity"
                  });
                }
              }
            });
            var chapterXiiaElected = safe(india, "compliance_docs.chapter_xiia_elected", false) === true;
            var otherLtcg198Inr = 0, otherStcg20Inr = 0, otherLtcg197Inr = 0, otherStcgSlabInr = 0, vdaGainInr = 0, vdaSaleConsiderationInr = 0;
            var chapterXiiaInvestmentIncomeInr = 0, chapterXiiaSfeaHoldingCount = 0;
            (safe(india, "financial_holdings.transactions", []) || []).forEach(function(tx) {
              var cls = tx.asset_class;
              if (!cls || cls === "foreign_equity_unlisted") return;
              if (chapterXiiaElected && tx.is_specified_foreign_exchange_asset === true) {
                chapterXiiaSfeaHoldingCount += 1;
                var invIncomeInr = toInrAtCurrency(tx.investment_income_this_year, tx.investment_income_currency || "INR", USD_TO_INR);
                if (invIncomeInr !== null) chapterXiiaInvestmentIncomeInr += num(invIncomeInr);
              }
              if (cls === "nri_specified_company_deposit") return;
              if (!tx.sale_date || tx.sale_value === null || tx.sale_value === void 0 || tx.sale_value === "") return;
              var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency, USD_TO_INR);
              var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency, USD_TO_INR);
              if (saleInr === null || purchaseInr === null) return;
              if (cls === "vda_crypto") {
                vdaSaleConsiderationInr += saleInr;
                var vg = saleInr - purchaseInr - num(tx.transfer_expenses);
                if (vg > 0) vdaGainInr += vg;
                return;
              }
              if ((cls === "nri_specified_debenture" || cls === "nri_specified_govt_security") && tx.nri_exit_type !== "sold_to_third_party") return;
              var months = monthsBetween(tx.acquisition_date, tx.sale_date);
              if (months === null) return;
              var costBasisInr = purchaseInr;
              if ((cls === "listed_equity" || cls === "equity_mutual_fund") && tx.fmv_31jan2018_per_unit_inr && tx.quantity) {
                var fmvTotalInr = num(tx.fmv_31jan2018_per_unit_inr) * num(tx.quantity);
                costBasisInr = Math.max(purchaseInr, Math.min(fmvTotalInr, saleInr));
              }
              var g2 = saleInr - costBasisInr - num(tx.transfer_expenses);
              var isChapterXiiaListedEquity = cls === "listed_equity" && chapterXiiaElected && tx.is_specified_foreign_exchange_asset === true;
              if (cls === "debt_mutual_fund_post_apr23") {
                otherStcgSlabInr += g2;
              } else if (cls === "nri_specified_debenture" || cls === "nri_specified_govt_security") {
                if (tx.stt_paid !== false) {
                  if (months > 12) otherLtcg197Inr += g2;
                  else otherStcgSlabInr += g2;
                } else if (tx.sale_date >= S50AA_UNLISTED_DEBT_CUTOFF) {
                  otherStcgSlabInr += g2;
                } else if (months > 24) {
                  otherLtcg197Inr += g2;
                } else {
                  otherStcgSlabInr += g2;
                }
              } else if (isChapterXiiaListedEquity && months > 12) {
                otherLtcg197Inr += g2;
              } else if (isChapterXiiaListedEquity) {
                otherStcg20Inr += g2;
              } else if (GROUP_A_CLASSES.indexOf(cls) !== -1 && tx.stt_paid !== false) {
                if (months > 12) otherLtcg198Inr += g2;
                else otherStcg20Inr += g2;
              } else if (GROUP_A_CLASSES.indexOf(cls) !== -1) {
                if (months > 12) otherLtcg197Inr += g2;
                else otherStcgSlabInr += g2;
              } else if (cls === "bond_listed") {
                if (months > 12) otherLtcg197Inr += g2;
                else otherStcgSlabInr += g2;
              } else if (GROUP_C_CLASSES.indexOf(cls) !== -1) {
                if (months > 24) otherLtcg197Inr += g2;
                else otherStcgSlabInr += g2;
              }
            });
            var commodityLtcg197Inr = 0, commodityStcgSlabInr = 0;
            (safe(india, "commodities.transactions", []) || []).forEach(function(tx) {
              if (tx.is_maturity_redemption === true) return;
              if (!tx.sale_date || tx.sale_value === null || tx.sale_value === void 0 || tx.sale_value === "") return;
              var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency, USD_TO_INR);
              var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency, USD_TO_INR);
              if (saleInr === null || purchaseInr === null) return;
              var months = monthsBetween(tx.acquisition_date, tx.sale_date);
              if (months === null) return;
              var g3 = saleInr - purchaseInr;
              var ctype = tx.commodity_type;
              if (ctype === "gold_etf" || ctype === "gold_fund_of_funds") {
                commodityStcgSlabInr += g3;
              } else if (ctype === "sovereign_gold_bond_original" || ctype === "sovereign_gold_bond_secondary") {
                if (months > 12) commodityLtcg197Inr += g3;
                else commodityStcgSlabInr += g3;
              } else {
                if (months > 24) commodityLtcg197Inr += g3;
                else commodityStcgSlabInr += g3;
              }
            });
            var unlistedEquityLtcg197Inr = 0, unlistedEquityStcgSlabInr = 0;
            (safe(india, "unlisted_equity.transactions", []) || []).forEach(function(tx) {
              if (!tx.sale_date || tx.sale_price_per_share === null || tx.sale_price_per_share === void 0 || tx.sale_price_per_share === "") return;
              var shares = num(tx.number_of_shares);
              if (!(shares > 0)) return;
              var saleInr = toInrAtCurrency(num(tx.sale_price_per_share) * shares, tx.sale_price_per_share_currency, USD_TO_INR);
              var purchaseInr;
              if (tx.original_investment_currency && tx.original_investment_currency !== "INR" && tx.original_cost_in_foreign_currency != null) {
                purchaseInr = toInrAtCurrency(num(tx.original_cost_in_foreign_currency), tx.original_investment_currency, USD_TO_INR);
              } else {
                purchaseInr = toInrAtCurrency(num(tx.cost_per_share) * shares, tx.cost_per_share_currency, USD_TO_INR);
              }
              if (saleInr === null || purchaseInr === null) return;
              var months = monthsBetween(tx.acquisition_date, tx.sale_date);
              if (months === null) return;
              var g4 = saleInr - purchaseInr;
              if (months > 24) unlistedEquityLtcg197Inr += g4;
              else unlistedEquityStcgSlabInr += g4;
            });
            var stcgInr = num(safe(d.diAgg, "capital_gains.short_term_15_pct", 0)) + num(safe(annualCg, "stcg_111a_inr", 0)) + buybackStcgInr + otherStcg20Inr;
            var ltcgInr = num(safe(annualCg, "ltcg_112a_inr", 0)) + buybackLtcgInr + otherLtcg198Inr;
            var ltcg197Inr = buybackLtcg197Inr + foreignEquityLtcg197Inr + otherLtcg197Inr + commodityLtcg197Inr + unlistedEquityLtcg197Inr;
            var stcgSlabInr = buybackStcgSlabInr + foreignEquityStcgSlabInr + otherStcgSlabInr + commodityStcgSlabInr + unlistedEquityStcgSlabInr;
            return {
              stcgInr,
              ltcgInr,
              ltcg197Inr,
              stcgSlabInr,
              vdaGainInr,
              vdaSaleConsiderationInr,
              chapterXiiaInvestmentIncomeInr,
              chapterXiiaSfeaHoldingCount,
              deemedDividendInr,
              promoterBuybackLtcgInr,
              promoterBuybackStcgInr,
              holdingPeriodMismatches
            };
          }
        },
        // ---- otherSourcesMisc, full formula -------------------------------------
        otherSourcesMiscComputation: {
          deps: ["osAgg", "diAgg"],
          compute: function(d) {
            var os = d.osAgg;
            var giftsExempt = !!safe(os, "gifts_exemption_marriage", false) || !!safe(os, "gifts_exemption_relative", false);
            var giftsAbove50kInr = giftsExempt ? 0 : num(safe(os, "gifts_above_50k_inr", 0));
            var familyPensionGrossInr = num(safe(os, "family_pension_gross_inr", 0));
            var familyPensionNetInr = Math.max(0, familyPensionGrossInr - Math.min(15e3, Math.round(familyPensionGrossInr / 3)));
            return giftsAbove50kInr + familyPensionNetInr + num(safe(os, "spousal_clubbing_s64_inr", 0)) - num(safe(os, "minor_child_exemption_inr", 0)) + num(safe(os, "lic_maturity_inr", 0)) + num(safe(os, "angel_tax_premium_inr", 0)) - num(safe(os, "local_authority_s10_20_inr", 0)) + num(safe(os, "miscellaneous_income_inr", 0)) + num(safe(os, "taxable_epf_interest_inr", 0)) + num(safe(os, "taxable_nps_withdrawal_inr", 0));
          }
        },
        // ---- final total, matching aggregateIndiaIncome's own formula exactly ---
        totalIndiaIncomeInr: {
          deps: ["businessComputation", "capitalGainsComputation", "otherSourcesMiscComputation", "diAgg", "osAgg"],
          compute: function(d, ctx) {
            var india = ctx.india;
            var di = d.diAgg;
            var salaryInr = num(safe(di, "salary.taxable_salary_inr", null)) || num(safe(di, "salary.gross_salary_inr", 0));
            var hpProps = safe(di, "house_property.properties", []) || [];
            var housePropertyInr = hpProps.reduce(function(s, p) {
              return s + num(p.annual_value_inr || p.gross_annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0);
            }, 0);
            var os = d.osAgg;
            var interestInr = num(safe(os, "interest_savings_inr", 0)) + num(safe(os, "interest_fd_rd_inr", 0)) + num(safe(os, "interest_bonds_inr", 0)) + num(safe(os, "interest_on_it_refund_inr", 0)) + num(safe(di, "other_sources.interest_inr", 0));
            var dividendInr = num(safe(os, "dividend_inr", 0));
            var specialRate115bbInr = num(safe(os, "winnings_lottery_gaming_inr", 0)) + num(safe(os, "online_gaming_winnings_inr", 0));
            var bc = d.businessComputation, cg = d.capitalGainsComputation;
            return salaryInr + bc.businessInr + housePropertyInr + interestInr + dividendInr + cg.stcgInr + cg.ltcgInr + specialRate115bbInr + cg.deemedDividendInr + cg.stcgSlabInr + cg.ltcg197Inr + cg.vdaGainInr + cg.chapterXiiaInvestmentIncomeInr + d.otherSourcesMiscComputation;
          }
        },
        /* Built for the monitor-next integration (not a tracker row — every field
         * here already exists as a verified computation elsewhere in this file;
         * this only ASSEMBLES them into the exact shape aggregateIndiaIncome
         * itself returns, normalize.js L1304-1336, money-object fields included —
         * the India-side mirror of aggregateUsIncomeResult, which already has
         * this treatment). Every field name/derivation below is copied directly
         * from that return statement; verified field-for-field against the real
         * model.income.india in run-aggregateindiaincome.js. */
        indiaIncomeModelResult: {
          deps: [
            "businessComputation",
            "capitalGainsComputation",
            "otherSourcesMiscComputation",
            "diAgg",
            "osAgg",
            "fnoIncomeInrAgg",
            "speculativeIncomeInrAgg"
          ],
          compute: function(d, ctx) {
            function m(inr) {
              return { inr, usd: inr / fxRate(ctx) };
            }
            var di = d.diAgg, os = d.osAgg;
            var salaryInr = num(safe(di, "salary.taxable_salary_inr", null)) || num(safe(di, "salary.gross_salary_inr", 0));
            var hpProps = safe(di, "house_property.properties", []) || [];
            var housePropertyInr = hpProps.reduce(function(s, p) {
              return s + num(p.annual_value_inr || p.gross_annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0);
            }, 0);
            var interestInr = num(safe(os, "interest_savings_inr", 0)) + num(safe(os, "interest_fd_rd_inr", 0)) + num(safe(os, "interest_bonds_inr", 0)) + num(safe(os, "interest_on_it_refund_inr", 0)) + num(safe(di, "other_sources.interest_inr", 0));
            var dividendInr = num(safe(os, "dividend_inr", 0));
            var specialRate115bbInr = num(safe(os, "winnings_lottery_gaming_inr", 0)) + num(safe(os, "online_gaming_winnings_inr", 0));
            var agriculturalIncomeInr = num(safe(di, "agricultural_income_inr", 0));
            var unexplained115bbeInr = num(safe(os, "unexplained_income_115BBE_inr", 0));
            var bc = d.businessComputation, cg = d.capitalGainsComputation;
            var total = salaryInr + bc.businessInr + housePropertyInr + interestInr + dividendInr + cg.stcgInr + cg.ltcgInr + specialRate115bbInr + cg.deemedDividendInr + cg.stcgSlabInr + cg.ltcg197Inr + cg.vdaGainInr + cg.chapterXiiaInvestmentIncomeInr + d.otherSourcesMiscComputation;
            return {
              salary: m(salaryInr),
              business: m(bc.businessInr),
              businessDepreciationInr: bc.businessDepreciationInr,
              businessFnoIncomeInr: d.fnoIncomeInrAgg,
              speculativeIncomeInr: d.speculativeIncomeInrAgg,
              housePropertyCount: hpProps.length,
              agriculturalIncomeInr,
              indiaHasRegularBooksEntry: bc.indiaHasRegularBooksEntry,
              indiaHasValidPresumptiveEntry: bc.indiaHasValidPresumptiveEntry,
              indiaHasPartnerFirmIncome: bc.indiaHasPartnerFirmIncome,
              houseProperty: m(housePropertyInr),
              interest: m(interestInr),
              dividend: m(dividendInr),
              otherSourcesMisc: m(d.otherSourcesMiscComputation),
              stcg: m(cg.stcgInr),
              ltcg: m(cg.ltcgInr),
              ltcg197Inr: cg.ltcg197Inr,
              capitalGains: m(cg.stcgInr + cg.ltcgInr + cg.ltcg197Inr),
              specialRate115bb: m(specialRate115bbInr),
              deemedDividendBuyback: m(cg.deemedDividendInr),
              stcgSlabInr: cg.stcgSlabInr,
              vdaGainInr: cg.vdaGainInr,
              vdaSaleConsiderationInr: cg.vdaSaleConsiderationInr,
              chapterXiiaInvestmentIncomeInr: cg.chapterXiiaInvestmentIncomeInr,
              chapterXiiaSfeaHoldingCount: cg.chapterXiiaSfeaHoldingCount,
              promoterBuybackLtcgInr: cg.promoterBuybackLtcgInr,
              promoterBuybackStcgInr: cg.promoterBuybackStcgInr,
              holdingPeriodMismatches: cg.holdingPeriodMismatches,
              unexplained115bbeInr,
              total: m(total)
            };
          }
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/in1-nodes-v3.js
  var require_in1_nodes_v3 = __commonJS({
    "prototypes/graph-pilot/in1-nodes-v3.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function indiaAnnualSliceV3(india) {
        var quarters = safe(india, "quarters", null);
        if (!quarters) {
          return {
            domestic_income: safe(india, "domestic_income", {}),
            other_sources: safe(india, "other_sources", {})
          };
        }
        function merge(target, source) {
          for (var k in source) {
            if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
            var sv = source[k];
            if (sv === null || sv === void 0) continue;
            if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
            else if (typeof sv === "boolean") target[k] = target[k] || sv;
            else if (Array.isArray(sv)) {
              if (!Array.isArray(target[k])) target[k] = [];
              sv.forEach(function(el, i) {
                if (el && typeof el === "object") {
                  target[k][i] = target[k][i] || {};
                  merge(target[k][i], el);
                } else if (target[k].indexOf(el) < 0) {
                  target[k].push(el);
                }
              });
            } else if (typeof sv === "object") {
              target[k] = target[k] || {};
              merge(target[k], sv);
            } else {
              target[k] = sv;
            }
          }
          return target;
        }
        var out = { domestic_income: {}, other_sources: {} };
        ["Q1", "Q2", "Q3", "Q4"].forEach(function(q) {
          var qs = quarters[q];
          if (!qs) return;
          if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income);
          if (qs.other_sources) merge(out.other_sources, qs.other_sources);
        });
        return out;
      }
      var CONST = require_constants().CONST;
      var T = CONST.TAX.INDIA;
      var S80DD_U_FLAT = CONST.TAX.INDIA.S80DD_U_FLAT_INR;
      var S80DDB_CAP = CONST.TAX.INDIA.S80DDB_CAP_INR;
      function s80eeaEeCapInr(sanctionDate) {
        if (!sanctionDate) return 0;
        var d = new Date(sanctionDate);
        if (isNaN(d.getTime())) return 0;
        if (d >= /* @__PURE__ */ new Date("2016-04-01") && d <= /* @__PURE__ */ new Date("2017-03-31")) return 5e4;
        if (d >= /* @__PURE__ */ new Date("2019-04-01") && d <= /* @__PURE__ */ new Date("2022-03-31")) return 15e4;
        return 0;
      }
      function bracketTax(amount, slabs) {
        var t = Math.max(0, amount), tax = 0, prev = 0;
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            tax += (Math.min(t, cap) - prev) * rate;
            prev = cap;
          } else break;
        }
        return tax;
      }
      function computeIndiaSurcharge(taxBase, totalIncome, isNew, slabs, specialTax) {
        var rate = 0, threshold = 0;
        if (totalIncome > 5e7) {
          rate = isNew ? T.SURCHARGE_NEW_MAX : 0.37;
          threshold = 5e7;
        } else if (totalIncome > 2e7) {
          rate = 0.25;
          threshold = 2e7;
        } else if (totalIncome > 1e7) {
          rate = 0.15;
          threshold = 1e7;
        } else if (totalIncome > 5e6) {
          rate = 0.1;
          threshold = 5e6;
        } else return 0;
        var cappedRate = Math.min(rate, T.SURCHARGE_CG_DIV_CAP);
        var nonSpecialTax = Math.max(0, taxBase - specialTax);
        var surcharge = nonSpecialTax * rate + specialTax * cappedRate;
        var taxAtThreshold = bracketTax(threshold, slabs);
        var cap = taxAtThreshold + (totalIncome - threshold);
        if (taxBase + surcharge > cap) surcharge = Math.max(0, cap - taxBase);
        return surcharge;
      }
      function computeLossSetOff(cfl, buckets) {
        var businessInr = buckets.businessInr, housePropertyInr = buckets.housePropertyInr;
        var otherNormalInr = buckets.otherNormalInr, stcgInr = buckets.stcgInr, ltcgGrossInr = buckets.ltcgGrossInr;
        var speculativeInr = Math.max(0, buckets.speculativeInr || 0);
        var stcgSlabInr = buckets.stcgSlabInr || 0;
        var ltcg197Inr = buckets.ltcg197Inr || 0;
        var businessLossUsed = Math.min(cfl.businessLossAvailableInr || 0, businessInr);
        businessInr -= businessLossUsed;
        var businessLossUnused = (cfl.businessLossAvailableInr || 0) - businessLossUsed;
        var hpLossUsed = Math.min(cfl.housePropertyLossAvailableInr || 0, housePropertyInr);
        housePropertyInr -= hpLossUsed;
        var hpLossUnused = (cfl.housePropertyLossAvailableInr || 0) - hpLossUsed;
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
        var ltcgLossAvail = cfl.ltcgLossAvailableInr || 0;
        var ltcgLossUsedVs197 = Math.min(ltcgLossAvail, ltcg197Inr);
        ltcg197Inr -= ltcgLossUsedVs197;
        var ltcgLossAfter197 = ltcgLossAvail - ltcgLossUsedVs197;
        var ltcgLossUsedVs198 = Math.min(ltcgLossAfter197, ltcgGrossInr);
        ltcgGrossInr -= ltcgLossUsedVs198;
        var ltcgLossUnused = ltcgLossAfter197 - ltcgLossUsedVs198;
        var ltcgLossUsed = ltcgLossUsedVs197 + ltcgLossUsedVs198;
        var speculativeLossAvail = cfl.speculativeLossAvailableInr || 0;
        var speculativeLossUsed = Math.min(speculativeLossAvail, speculativeInr);
        speculativeInr -= speculativeLossUsed;
        var speculativeLossUnused = speculativeLossAvail - speculativeLossUsed;
        var depRemaining = cfl.unabsorbedDepreciationCf || 0;
        var used;
        used = Math.min(depRemaining, businessInr);
        businessInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, housePropertyInr);
        housePropertyInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, stcgSlabInr);
        stcgSlabInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, stcgInr);
        stcgInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, ltcg197Inr);
        ltcg197Inr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, ltcgGrossInr);
        ltcgGrossInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, otherNormalInr);
        otherNormalInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, speculativeInr);
        speculativeInr -= used;
        depRemaining -= used;
        var depUsed = (cfl.unabsorbedDepreciationCf || 0) - depRemaining;
        var totalUsedInr = businessLossUsed + hpLossUsed + stcgLossUsedVsStcgSlab + stcgLossUsedVsStcg + stcgLossUsedVsLtcg + ltcgLossUsed + speculativeLossUsed + depUsed;
        var totalUnusedInr = businessLossUnused + hpLossUnused + stcgLossUnused + ltcgLossUnused + speculativeLossUnused + depRemaining;
        return {
          businessInr,
          housePropertyInr,
          otherNormalInr,
          stcgInr,
          stcgSlabInr,
          ltcgGrossInr,
          ltcg197Inr,
          speculativeInr,
          totalUsedInr,
          totalUnusedInr,
          unused: {
            businessInr: businessLossUnused,
            housePropertyInr: hpLossUnused,
            stcgInr: stcgLossUnused,
            ltcgInr: ltcgLossUnused,
            speculativeInr: speculativeLossUnused,
            unabsorbedDepreciationInr: depRemaining
          },
          used: {
            businessInr: businessLossUsed,
            housePropertyInr: hpLossUsed,
            stcgSlabInr: stcgLossUsedVsStcgSlab,
            stcgInr: stcgLossUsedVsStcg,
            ltcgFromStcgLossInr: stcgLossUsedVsLtcg,
            ltcgInr: ltcgLossUsed,
            speculativeInr: speculativeLossUsed,
            unabsorbedDepreciationInr: depUsed
          }
        };
      }
      function computeS115aStream(treaty, incomeType, aggregateTotalInr) {
        var domestic = T.S115A_RATES[incomeType];
        var docsOk = treaty.trcStatus && treaty.form10fFiled;
        var hasAggregate = aggregateTotalInr != null;
        var remainingInr = hasAggregate ? aggregateTotalInr : 0;
        var claimedInr = 0, taxInr = 0;
        var elections = [];
        (treaty.treatyElections || []).forEach(function(e) {
          if (!e || e.income_type !== incomeType) return;
          var raw = num(e.amount_inr);
          var amt = hasAggregate ? Math.min(raw, Math.max(0, remainingInr)) : raw;
          var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
          var rate = docsOk && electedRate != null ? Math.min(domestic, electedRate) : domestic;
          var electionTaxInr = amt * rate;
          claimedInr += amt;
          taxInr += electionTaxInr;
          elections.push({
            article: e.treaty_article || null,
            requestedAmountInr: raw,
            appliedAmountInr: amt,
            electedRate,
            domesticRate: domestic,
            rateApplied: rate,
            taxInr: electionTaxInr,
            outcome: !docsOk ? "denied_no_docs" : electedRate != null && electedRate < domestic ? "elected_rate_applied" : "domestic_rate_wins"
          });
          if (hasAggregate) remainingInr -= amt;
        });
        var uncapturedInr = hasAggregate ? Math.max(0, remainingInr) : 0;
        var uncapturedTaxInr = uncapturedInr * domestic;
        taxInr += uncapturedTaxInr;
        var totalInr = hasAggregate ? aggregateTotalInr : claimedInr;
        return {
          totalInr,
          taxInr,
          claimedInr,
          uncapturedInr,
          uncapturedTaxInr,
          elections,
          domesticRate: domestic,
          effectiveRate: totalInr > 0 ? taxInr / totalInr : domestic
        };
      }
      function computeNrInterestTreatment(treaty, slabs, otherSlabIncomeInr, interestAggregateInr) {
        var docsOk = treaty.trcStatus && treaty.form10fFiled;
        var remainingInr = interestAggregateInr;
        var elections = [];
        var carvedOutInr = 0, carvedOutTaxInr = 0;
        (treaty.treatyElections || []).forEach(function(e) {
          if (!e || e.income_type !== "interest") return;
          var raw = num(e.amount_inr);
          var amt = Math.min(raw, Math.max(0, remainingInr));
          if (amt <= 0) return;
          remainingInr -= amt;
          var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
          var canElect = docsOk && electedRate != null;
          var marginalSlabTaxInr = bracketTax(otherSlabIncomeInr + interestAggregateInr, slabs) - bracketTax(otherSlabIncomeInr + interestAggregateInr - amt, slabs);
          var treatyTaxInr = canElect ? amt * electedRate : null;
          var carvedOut = canElect && treatyTaxInr < marginalSlabTaxInr;
          if (carvedOut) {
            carvedOutInr += amt;
            carvedOutTaxInr += treatyTaxInr;
          }
          elections.push({
            article: e.treaty_article || null,
            requestedAmountInr: raw,
            appliedAmountInr: amt,
            electedRate,
            marginalSlabTaxInr,
            treatyTaxInr,
            carvedOut,
            outcome: !docsOk ? "denied_no_docs" : electedRate == null ? "no_rate" : carvedOut ? "treaty_beats_slab" : "slab_beats_treaty"
          });
        });
        var uncapturedInr = Math.max(0, remainingInr);
        return {
          totalInr: interestAggregateInr,
          slabEligibleInr: interestAggregateInr - carvedOutInr,
          carvedOutInr,
          carvedOutTaxInr,
          uncapturedInr,
          elections
        };
      }
      var NODES = {
        // ---- raw leaves: salary/houseProperty/interest/dividend/specialRate115bb
        // — quarterly-merge-aware (indiaAnnualSliceV3 above) since 20 Jul 2026.
        annualSliceV3: { deps: [], compute: function(d, ctx) {
          return indiaAnnualSliceV3(ctx.india);
        } },
        salaryInr: { deps: ["annualSliceV3"], compute: function(d) {
          return num(safe(d.annualSliceV3.domestic_income, "salary.taxable_salary_inr", null)) || num(safe(d.annualSliceV3.domestic_income, "salary.gross_salary_inr", 0));
        } },
        housePropertyInr: {
          deps: ["annualSliceV3"],
          compute: function(d) {
            var hpProps = safe(d.annualSliceV3.domestic_income, "house_property.properties", []) || [];
            return hpProps.reduce(function(s, p) {
              return s + num(p.annual_value_inr || p.gross_annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0);
            }, 0);
          }
        },
        interestInr: {
          deps: ["annualSliceV3"],
          compute: function(d) {
            var os = d.annualSliceV3.other_sources;
            return num(safe(os, "interest_savings_inr", 0)) + num(safe(os, "interest_fd_rd_inr", 0)) + num(safe(os, "interest_bonds_inr", 0)) + num(safe(os, "interest_on_it_refund_inr", 0)) + num(safe(d.annualSliceV3.domestic_income, "other_sources.interest_inr", 0));
          }
        },
        dividendInr: { deps: ["annualSliceV3"], compute: function(d) {
          return num(safe(d.annualSliceV3.other_sources, "dividend_inr", 0));
        } },
        specialRate115bbInr: {
          deps: ["annualSliceV3"],
          compute: function(d) {
            var os = d.annualSliceV3.other_sources;
            return num(safe(os, "winnings_lottery_gaming_inr", 0)) + num(safe(os, "online_gaming_winnings_inr", 0));
          }
        },
        taxRegime: { deps: [], compute: function(d, ctx) {
          return (safe(ctx.india, "profile.tax_regime", "NEW") || "NEW").toUpperCase();
        } },
        indiaResidencyStatusRawV3: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.final_india_residency_status", null);
        } },
        indiaEntityTypeRawV3: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.entity_type", "individual");
        } },
        // ---- deductions (aggregateIndiaDeductions, ported exactly) --------------
        dedS80C: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80C", {});
          return num(x.epf_employee_inr) + num(x.ppf_inr) + num(x.elss_inr) + num(x.life_insurance_premium_inr) + num(x.principal_home_loan_inr) + num(x.tuition_fees_inr) + num(x.nsc_inr) + num(x.tax_saving_fd_inr) + num(x.sukanya_samriddhi_inr);
        } },
        dedS80CCD1B: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "deductions.s80CCD_1B.nps_additional_inr", 0));
        } },
        dedS80CCD2Employer: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "domestic_income.salary.employer_nps_contribution_inr", 0));
        } },
        dedS80D: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80D", {});
          return num(x.self_family_premium_inr) + num(x.parents_premium_inr);
        } },
        dedS80TTA_TTB: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "deductions.s80TTA_TTB.savings_interest_inr", 0));
        } },
        dedS80DD: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80DD", {});
          return x.has_disabled_dependents === true ? S80DD_U_FLAT[x.disability_percentage] || 0 : 0;
        } },
        dedS80DDB: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80DDB", {});
          return x.has_specified_diseases_treatment === true ? Math.min(num(x.medical_expenses_inr), S80DDB_CAP[x.patient_category] || S80DDB_CAP.normal) : 0;
        } },
        dedS80U: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80U", {});
          return x.has_self_disability === true ? S80DD_U_FLAT[x.disability_percentage] || 0 : 0;
        } },
        dedS80E: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "deductions.s80E.education_loan_interest_inr", 0));
        } },
        dedS80EEA_EE: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80EEA_EE", {});
          return Math.min(num(x.affordable_home_loan_interest_inr), s80eeaEeCapInr(x.loan_sanction_date));
        } },
        dedS80GGB_GGC: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "deductions.s80ggb_ggc_political_donation_inr", 0));
        } },
        dedS80GGRentPaidInr: { deps: [], compute: function(d, ctx) {
          var x = safe(ctx.india, "deductions.s80GG", {});
          return x.has_rent_paid_no_hra === true ? num(x.rent_paid_inr) : 0;
        } },
        // ---- carry-forward losses (raw, ported exactly) --------------------------
        cflBusinessInr: { deps: [], compute: function(d, ctx) {
          return sumAllowed(safe(ctx.india, "carry_forward_losses.business_loss_cf", []));
        } },
        cflSpeculativeInr: { deps: [], compute: function(d, ctx) {
          return sumAllowed(safe(ctx.india, "carry_forward_losses.speculative_loss_cf", []));
        } },
        cflStcgInr: { deps: [], compute: function(d, ctx) {
          return sumAllowed(safe(ctx.india, "carry_forward_losses.stcg_loss_cf", []));
        } },
        cflLtcgInr: { deps: [], compute: function(d, ctx) {
          return sumAllowed(safe(ctx.india, "carry_forward_losses.ltcg_loss_cf", []));
        } },
        cflHousePropertyInr: { deps: [], compute: function(d, ctx) {
          return sumAllowed(safe(ctx.india, "carry_forward_losses.house_property_loss_cf", []));
        } },
        cflUnabsorbedDepreciationInr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "carry_forward_losses.unabsorbed_depreciation_cf", 0));
        } },
        // ---- treaty (raw, ported exactly) -----------------------------------------
        treatyTrcStatus: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "dtaa.trc_status", false) === true || safe(ctx.india, "compliance_docs.trc.document_uploaded", false) === true;
        } },
        treatyForm10fFiled: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "compliance_docs.form_10f.is_filed", false) === true;
        } },
        treatyElectionsRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "dtaa.treaty_elections", []) || [];
        } },
        // ---- EXPLICIT BOUNDARY INPUTS: capital-gains classification + exact
        // business.inr — see file header for why these stay boundary this pass.
        businessInrBoundaryV3: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.business && ctx.model.income.india.business.inr);
        } },
        businessDepreciationInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.businessDepreciationInr);
        } },
        speculativeIncomeInrBoundaryV3: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.speculativeIncomeInr);
        } },
        stcgInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.stcg && ctx.model.income.india.stcg.inr);
        } },
        ltcgInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.ltcg && ctx.model.income.india.ltcg.inr);
        } },
        ltcg197InrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.ltcg197Inr);
        } },
        stcgSlabInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.stcgSlabInr);
        } },
        vdaGainInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.vdaGainInr);
        } },
        chapterXiiaInvestmentIncomeInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.chapterXiiaInvestmentIncomeInr);
        } },
        deemedDividendBuybackInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.deemedDividendBuyback && ctx.model.income.india.deemedDividendBuyback.inr);
        } },
        promoterBuybackLtcgInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.promoterBuybackLtcgInr);
        } },
        promoterBuybackStcgInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.promoterBuybackStcgInr);
        } },
        otherSourcesMiscInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.otherSourcesMisc && ctx.model.income.india.otherSourcesMisc.inr);
        } },
        // ---- computeIndiaTax, ported exactly (individual/HUF path only) ----------
        isNew: { deps: ["taxRegime"], compute: function(d) {
          return d.taxRegime !== "OLD";
        } },
        slabs: { deps: ["isNew"], compute: function(d) {
          return d.isNew ? T.SLABS_NEW : T.SLABS_OLD;
        } },
        isNRV3: { deps: ["indiaResidencyStatusRawV3"], compute: function(d) {
          return d.indiaResidencyStatusRawV3 === "NR";
        } },
        nrInterest: {
          deps: [
            "isNRV3",
            "treatyTrcStatus",
            "treatyForm10fFiled",
            "treatyElectionsRaw",
            "slabs",
            "salaryInr",
            "businessInrBoundaryV3",
            "housePropertyInr",
            "deemedDividendBuybackInrBoundary",
            "otherSourcesMiscInrBoundary",
            "interestInr"
          ],
          compute: function(d) {
            if (!d.isNRV3) return null;
            var otherSlabIncomeInr = d.salaryInr + d.businessInrBoundaryV3 + d.housePropertyInr + d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary;
            return computeNrInterestTreatment({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, d.slabs, otherSlabIncomeInr, d.interestInr);
          }
        },
        s115aDividend: {
          deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"],
          compute: function(d) {
            return d.isNRV3 ? computeS115aStream({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "dividend", d.dividendInr) : null;
          }
        },
        s115aRoyalty: {
          deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
          compute: function(d) {
            return d.isNRV3 ? computeS115aStream({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "royalty", null) : null;
          }
        },
        s115aFts: {
          deps: ["isNRV3", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
          compute: function(d) {
            return d.isNRV3 ? computeS115aStream({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "fts", null) : null;
          }
        },
        lossSetOffV3: {
          deps: [
            "businessInrBoundaryV3",
            "businessDepreciationInrBoundary",
            "cflBusinessInr",
            "cflSpeculativeInr",
            "cflStcgInr",
            "cflLtcgInr",
            "cflHousePropertyInr",
            "cflUnabsorbedDepreciationInr",
            "housePropertyInr",
            "isNRV3",
            "nrInterest",
            "deemedDividendBuybackInrBoundary",
            "otherSourcesMiscInrBoundary",
            "interestInr",
            "dividendInr",
            "stcgInrBoundary",
            "stcgSlabInrBoundary",
            "ltcgInrBoundary",
            "ltcg197InrBoundary",
            "speculativeIncomeInrBoundaryV3"
          ],
          compute: function(d) {
            var businessInrRaw = d.businessInrBoundaryV3;
            var unabsorbedDepThisYearInr = businessInrRaw < 0 ? Math.min(d.businessDepreciationInrBoundary, -businessInrRaw) : 0;
            var cflForSetOff = {
              businessLossAvailableInr: d.cflBusinessInr,
              speculativeLossAvailableInr: d.cflSpeculativeInr,
              stcgLossAvailableInr: d.cflStcgInr,
              ltcgLossAvailableInr: d.cflLtcgInr,
              housePropertyLossAvailableInr: d.cflHousePropertyInr,
              unabsorbedDepreciationCf: d.cflUnabsorbedDepreciationInr + unabsorbedDepThisYearInr
            };
            var nrInterestSlabEligibleInr = d.nrInterest ? d.nrInterest.slabEligibleInr : 0;
            return computeLossSetOff(cflForSetOff, {
              businessInr: Math.max(0, businessInrRaw),
              housePropertyInr: d.housePropertyInr,
              otherNormalInr: d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary + (d.isNRV3 ? nrInterestSlabEligibleInr : d.interestInr + d.dividendInr),
              stcgInr: d.stcgInrBoundary,
              stcgSlabInr: d.stcgSlabInrBoundary,
              ltcgGrossInr: d.ltcgInrBoundary,
              ltcg197Inr: d.ltcg197InrBoundary,
              speculativeInr: Math.max(0, d.speculativeIncomeInrBoundaryV3)
            });
          }
        },
        normalSlabInr: { deps: ["salaryInr", "lossSetOffV3"], compute: function(d) {
          return d.salaryInr + d.lossSetOffV3.businessInr + d.lossSetOffV3.housePropertyInr + d.lossSetOffV3.otherNormalInr + d.lossSetOffV3.stcgSlabInr + d.lossSetOffV3.speculativeInr;
        } },
        deductionsInrV3: {
          deps: [
            "isNew",
            "dedS80CCD2Employer",
            "dedS80C",
            "dedS80CCD1B",
            "dedS80D",
            "dedS80TTA_TTB",
            "dedS80DD",
            "dedS80DDB",
            "dedS80U",
            "dedS80E",
            "dedS80EEA_EE",
            "dedS80GGB_GGC",
            "dedS80GGRentPaidInr",
            "normalSlabInr"
          ],
          compute: function(d) {
            if (d.isNew) return d.dedS80CCD2Employer || 0;
            var caps = T.DEDUCTION_CAPS_OLD;
            var s80ggInr = d.dedS80GGRentPaidInr > 0 ? Math.max(0, Math.min(d.dedS80GGRentPaidInr - 0.1 * d.normalSlabInr, 6e4, 0.25 * d.normalSlabInr)) : 0;
            return Math.min(d.dedS80C, caps.s80C) + Math.min(d.dedS80CCD1B, caps.s80CCD1B) + Math.min(d.dedS80D, caps.s80D_self + caps.s80D_parents_senior) + (d.dedS80CCD2Employer || 0) + Math.min(d.dedS80TTA_TTB, 1e4) + (d.dedS80DD || 0) + (d.dedS80DDB || 0) + (d.dedS80U || 0) + (d.dedS80E || 0) + (d.dedS80EEA_EE || 0) + (d.dedS80GGB_GGC || 0) + s80ggInr;
          }
        },
        totalNormalInr: { deps: ["normalSlabInr", "deductionsInrV3"], compute: function(d) {
          return Math.max(0, d.normalSlabInr - d.deductionsInrV3);
        } },
        stcgTaxableInr: { deps: ["lossSetOffV3"], compute: function(d) {
          return d.lossSetOffV3.stcgInr;
        } },
        ltcgTaxableInr: { deps: ["lossSetOffV3"], compute: function(d) {
          return Math.max(0, d.lossSetOffV3.ltcgGrossInr - T.LTCG_112A_EXEMPT_INR);
        } },
        ltcg197TaxableInr: { deps: ["lossSetOffV3"], compute: function(d) {
          return Math.max(0, d.lossSetOffV3.ltcg197Inr);
        } },
        special115bbTaxInr: { deps: ["specialRate115bbInr"], compute: function(d) {
          return d.specialRate115bbInr * T.RATE_115BB;
        } },
        vdaTaxInr: { deps: ["vdaGainInrBoundary"], compute: function(d) {
          return d.vdaGainInrBoundary * T.RATE_115BBH;
        } },
        chapterXiiaInvestmentIncomeTaxInr: { deps: ["chapterXiiaInvestmentIncomeInrBoundary"], compute: function(d) {
          return d.chapterXiiaInvestmentIncomeInrBoundary * T.RATE_115E_INVESTMENT_INCOME;
        } },
        capEligibleSpecialTaxInr: {
          deps: ["stcgTaxableInr", "ltcgTaxableInr", "ltcg197TaxableInr", "s115aDividend"],
          compute: function(d) {
            return d.stcgTaxableInr * T.STCG_111A_RATE + d.ltcgTaxableInr * T.LTCG_112A_RATE + d.ltcg197TaxableInr * T.LTCG_112A_RATE + (d.s115aDividend ? d.s115aDividend.taxInr : 0);
          }
        },
        specialTaxInrV3: {
          deps: ["capEligibleSpecialTaxInr", "special115bbTaxInr", "vdaTaxInr", "chapterXiiaInvestmentIncomeTaxInr", "nrInterest", "s115aRoyalty", "s115aFts"],
          compute: function(d) {
            return d.capEligibleSpecialTaxInr + d.special115bbTaxInr + d.vdaTaxInr + d.chapterXiiaInvestmentIncomeTaxInr + (d.nrInterest ? d.nrInterest.carvedOutTaxInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.taxInr : 0) + (d.s115aFts ? d.s115aFts.taxInr : 0);
          }
        },
        slabTaxInr: { deps: ["totalNormalInr", "slabs"], compute: function(d) {
          return bracketTax(d.totalNormalInr, d.slabs);
        } },
        totalIncomeInrV3: {
          deps: [
            "totalNormalInr",
            "stcgTaxableInr",
            "ltcgTaxableInr",
            "ltcg197TaxableInr",
            "specialRate115bbInr",
            "vdaGainInrBoundary",
            "chapterXiiaInvestmentIncomeInrBoundary",
            "nrInterest",
            "s115aDividend",
            "s115aRoyalty",
            "s115aFts"
          ],
          compute: function(d) {
            return d.totalNormalInr + d.stcgTaxableInr + d.ltcgTaxableInr + d.ltcg197TaxableInr + d.specialRate115bbInr + d.vdaGainInrBoundary + d.chapterXiiaInvestmentIncomeInrBoundary + (d.nrInterest ? d.nrInterest.carvedOutInr : 0) + (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) + (d.s115aFts ? d.s115aFts.totalInr : 0);
          }
        },
        isIndividualV3: { deps: ["indiaEntityTypeRawV3"], compute: function(d) {
          return d.indiaEntityTypeRawV3 === "individual";
        } },
        rebateInrV3: {
          deps: ["isIndividualV3", "isNRV3", "totalNormalInr", "isNew", "slabTaxInr"],
          compute: function(d) {
            var rebate = d.isNew ? T.REBATE_87A_NEW : T.REBATE_87A_OLD;
            return d.isIndividualV3 && !d.isNRV3 && d.totalNormalInr <= rebate.incomeCap ? Math.min(d.slabTaxInr, rebate.maxRebate) : 0;
          }
        },
        taxAfterRebateInr: { deps: ["slabTaxInr", "rebateInrV3", "specialTaxInrV3"], compute: function(d) {
          return Math.max(0, d.slabTaxInr - d.rebateInrV3) + d.specialTaxInrV3;
        } },
        surchargeInrV3: {
          deps: ["taxAfterRebateInr", "totalIncomeInrV3", "isNew", "slabs", "capEligibleSpecialTaxInr"],
          compute: function(d) {
            return computeIndiaSurcharge(d.taxAfterRebateInr, d.totalIncomeInrV3, d.isNew, d.slabs, d.capEligibleSpecialTaxInr);
          }
        },
        cessInrV3: { deps: ["taxAfterRebateInr", "surchargeInrV3"], compute: function(d) {
          return (d.taxAfterRebateInr + d.surchargeInrV3) * T.CESS_RATE;
        } },
        promoterBuybackExtraTaxInr: {
          deps: ["indiaEntityTypeRawV3", "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary"],
          compute: function(d) {
            var isCorporatePromoter = d.indiaEntityTypeRawV3 === "company";
            var promoterTargetRate = isCorporatePromoter ? T.PROMOTER_BUYBACK_TARGET_RATE_CORPORATE : T.PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE;
            var ltcgAdditionalInr = Math.max(0, d.promoterBuybackLtcgInrBoundary) * Math.max(0, promoterTargetRate - T.LTCG_112A_RATE);
            var stcgAdditionalInr = Math.max(0, d.promoterBuybackStcgInrBoundary) * Math.max(0, promoterTargetRate - T.STCG_111A_RATE);
            var additionalTaxInr = ltcgAdditionalInr + stcgAdditionalInr;
            var surchargeInr = additionalTaxInr * T.PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE;
            var cessInr = (additionalTaxInr + surchargeInr) * T.CESS_RATE;
            return additionalTaxInr + surchargeInr + cessInr;
          }
        },
        totalTaxInrV3: {
          deps: ["taxAfterRebateInr", "surchargeInrV3", "cessInrV3", "promoterBuybackExtraTaxInr"],
          compute: function(d) {
            return d.taxAfterRebateInr + d.surchargeInrV3 + d.cessInrV3 + d.promoterBuybackExtraTaxInr;
          }
        }
      };
      function sumAllowed(arr) {
        return (arr || []).reduce(function(s, e) {
          var v = e && e.final_allowed_amount_inr != null ? e.final_allowed_amount_inr : num(e && e.amount_inr);
          return s + num(v);
        }, 0);
      }
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/entitytax-nodes.js
  var require_entitytax_nodes = __commonJS({
    "prototypes/graph-pilot/entitytax-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var CONST_ET = require_constants().CONST;
      var C = CONST_ET.TAX.INDIA_COMPANY;
      var FC = CONST_ET.TAX.INDIA_COMPANY_FOREIGN;
      var F = CONST_ET.TAX.INDIA_FIRM;
      var INDIA_MMR_TOP_SLAB_RATE = 0.3;
      var INDIA_MMR_TOP_SURCHARGE_RATE = 0.37;
      var INDIA_MMR_CESS_RATE = 0.04;
      var NODES = {
        indiaEntityTypeRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.entity_type", "individual");
        } },
        indiaIsCompany: { deps: ["indiaEntityTypeRaw"], compute: function(d) {
          return d.indiaEntityTypeRaw === "company";
        } },
        indiaIsFirm: { deps: ["indiaEntityTypeRaw"], compute: function(d) {
          return ["firm", "llp", "local"].indexOf(d.indiaEntityTypeRaw) >= 0;
        } },
        // "aop" covers AOP/BOI (one shared Layer 1 dropdown value); "trust" covers
        // Trust/NGO/Political Party (also one shared value — see file header).
        indiaIsAop: { deps: ["indiaEntityTypeRaw"], compute: function(d) {
          return d.indiaEntityTypeRaw === "aop";
        } },
        indiaIsTrust: { deps: ["indiaEntityTypeRaw"], compute: function(d) {
          return d.indiaEntityTypeRaw === "trust";
        } },
        isIndianCompanyFact: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.is_indian_company", null);
        } },
        indiaOpt115baa: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.opt_115baa", false) === true;
        } },
        indiaOpt115bab: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.opt_115bab", false) === true;
        } },
        indiaOpt115ba: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.opt_115ba", false) === true;
        } },
        indiaTurnoverLte400cr: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.turnover_lte_400cr", false) === true;
        } },
        indiaMatBookProfitInr: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.mat_book_profit", null);
        } },
        hasIndiaPE: { deps: [], compute: function(d, ctx) {
          return !!safe(ctx.india, "dtaa.has_permanent_establishment_in_india", false);
        } },
        // ---- the one boundary input: the entity's total India income -----------
        entityTaxableInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.total && ctx.model.income.india.total.inr);
        } },
        entityTaxResult: {
          deps: [
            "indiaIsCompany",
            "indiaIsFirm",
            "indiaIsAop",
            "indiaIsTrust",
            "isIndianCompanyFact",
            "indiaOpt115baa",
            "indiaOpt115bab",
            "indiaOpt115ba",
            "indiaTurnoverLte400cr",
            "indiaMatBookProfitInr",
            "hasIndiaPE",
            "entityTaxableInrBoundary"
          ],
          compute: function(d) {
            var taxable = d.entityTaxableInrBoundary;
            function entityResult(base, sur, cess, label, mat2) {
              var total = base + sur + cess;
              return { regime: label, matApplied: mat2, totalTaxInr: total, slabTaxInr: base, surchargeInr: sur, cessInr: cess };
            }
            if (d.indiaIsAop) {
              var aopBase = taxable * INDIA_MMR_TOP_SLAB_RATE;
              var aopSur = aopBase * INDIA_MMR_TOP_SURCHARGE_RATE;
              var aopCess = (aopBase + aopSur) * INDIA_MMR_CESS_RATE;
              return entityResult(aopBase, aopSur, aopCess, "AOP/BOI ITR-5 (Maximum Marginal Rate, s.167B)", false);
            }
            if (d.indiaIsTrust) {
              return entityResult(0, 0, 0, "Trust/NGO/Political Party ITR-7 (exempt \u2014 s.11/12A or s.13A, compliance unverified)", false);
            }
            if (d.indiaIsCompany) {
              if (d.isIndianCompanyFact === false) {
                var rateF = FC.RATE;
                var baseTaxF = taxable * rateF;
                var surRateF = taxable > 1e8 ? FC.SURCHARGE_OVER_10CR : taxable > 1e7 ? FC.SURCHARGE_OVER_1CR : 0;
                var normalF = baseTaxF + baseTaxF * surRateF;
                var matBaseInrF = d.indiaMatBookProfitInr != null ? d.indiaMatBookProfitInr : taxable;
                var matF = matBaseInrF * FC.MAT_RATE;
                var matAppliedF = d.hasIndiaPE && normalF < matF;
                var preCessF = matAppliedF ? matF : normalF;
                var cessF = preCessF * FC.CESS_RATE;
                var regimeF = "Foreign Company ITR-6 (" + Math.round(rateF * 100) + "%" + (matAppliedF ? ", MAT" : d.hasIndiaPE ? "" : ", MAT-exempt (no India PE)") + ")";
                return entityResult(baseTaxF, preCessF - baseTaxF, cessF, regimeF, matAppliedF);
              }
              var rate = d.indiaOpt115bab ? C.RATE_115BAB : d.indiaOpt115baa ? C.RATE_115BAA : d.indiaOpt115ba ? C.RATE_115BA : d.indiaTurnoverLte400cr ? C.RATE_TURNOVER_LTE_400CR : C.RATE_DEFAULT;
              var baseTax = taxable * rate;
              var concessional115 = d.indiaOpt115bab || d.indiaOpt115baa;
              var surRate = concessional115 ? d.indiaOpt115bab ? C.SURCHARGE_115BAB : C.SURCHARGE_115BAA : taxable > 1e8 ? C.SURCHARGE_OVER_10CR : taxable > 1e7 ? C.SURCHARGE_OVER_1CR : 0;
              var normal = baseTax + baseTax * surRate;
              var matBaseInr = d.indiaMatBookProfitInr != null ? d.indiaMatBookProfitInr : taxable;
              var mat = matBaseInr * C.MAT_RATE;
              var matApplied = !concessional115 && normal < mat;
              var preCess = matApplied ? mat : normal;
              var cessC = preCess * C.CESS_RATE;
              var regime = "Corporate ITR-6 (" + Math.round(rate * 100) + "%" + (d.indiaOpt115bab ? " \xA7115BAB" : d.indiaOpt115baa ? " \xA7200" : d.indiaOpt115ba ? " \xA7115BA" : "") + (matApplied ? ", MAT" : "") + ")";
              return entityResult(baseTax, preCess - baseTax, cessC, regime, matApplied);
            }
            var ftax = taxable * F.RATE;
            var fsurRate = taxable > 1e7 ? F.SURCHARGE_OVER_1CR : 0;
            var fsur = ftax * fsurRate;
            var fcess = (ftax + fsur) * F.CESS_RATE;
            return entityResult(ftax, fsur, fcess, "Firm/LLP ITR-5 (30%)", false);
          }
        },
        totalTaxInrEntity: { deps: ["entityTaxResult"], compute: function(d) {
          return d.entityTaxResult.totalTaxInr;
        } }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/india-full-nodes.js
  var require_india_full_nodes = __commonJS({
    "prototypes/graph-pilot/india-full-nodes.js"(exports, module) {
      "use strict";
      var incomeNodes = require_aggregateindiaincome_nodes().NODES;
      var v3Nodes = require_in1_nodes_v3().NODES;
      var entityNodes = require_entitytax_nodes().NODES;
      var OVERRIDDEN_BOUNDARY_IDS = [
        "businessInrBoundaryV3",
        "businessDepreciationInrBoundary",
        "speculativeIncomeInrBoundaryV3",
        "stcgInrBoundary",
        "ltcgInrBoundary",
        "ltcg197InrBoundary",
        "stcgSlabInrBoundary",
        "vdaGainInrBoundary",
        "chapterXiiaInvestmentIncomeInrBoundary",
        "deemedDividendBuybackInrBoundary",
        "promoterBuybackLtcgInrBoundary",
        "promoterBuybackStcgInrBoundary",
        "otherSourcesMiscInrBoundary",
        "entityTaxableInrBoundary"
      ];
      var NODES = {};
      [incomeNodes, v3Nodes, entityNodes].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
          if (NODES[k] && OVERRIDDEN_BOUNDARY_IDS.indexOf(k) === -1) {
            throw new Error("Unexpected node name collision on merge: '" + k + "' \u2014 resolve before combining.");
          }
          NODES[k] = src[k];
        });
      });
      NODES.businessInrBoundaryV3 = { deps: ["businessComputation"], compute: function(d) {
        return d.businessComputation.businessInr;
      } };
      NODES.businessDepreciationInrBoundary = { deps: ["businessComputation"], compute: function(d) {
        return d.businessComputation.businessDepreciationInr;
      } };
      NODES.speculativeIncomeInrBoundaryV3 = { deps: ["speculativeIncomeInrAgg"], compute: function(d) {
        return d.speculativeIncomeInrAgg;
      } };
      NODES.stcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.stcgInr;
      } };
      NODES.ltcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.ltcgInr;
      } };
      NODES.ltcg197InrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.ltcg197Inr;
      } };
      NODES.stcgSlabInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.stcgSlabInr;
      } };
      NODES.vdaGainInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.vdaGainInr;
      } };
      NODES.chapterXiiaInvestmentIncomeInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.chapterXiiaInvestmentIncomeInr;
      } };
      NODES.deemedDividendBuybackInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.deemedDividendInr;
      } };
      NODES.promoterBuybackLtcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.promoterBuybackLtcgInr;
      } };
      NODES.promoterBuybackStcgInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.promoterBuybackStcgInr;
      } };
      NODES.otherSourcesMiscInrBoundary = { deps: ["otherSourcesMiscComputation"], compute: function(d) {
        return d.otherSourcesMiscComputation;
      } };
      NODES.entityTaxableInrBoundary = { deps: ["totalIndiaIncomeInr"], compute: function(d) {
        return d.totalIndiaIncomeInr;
      } };
      NODES.isEntityTaxpayer = {
        deps: ["indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust"],
        compute: function(d) {
          return d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust;
        }
      };
      NODES.totalTaxInrCombined = {
        deps: ["isEntityTaxpayer", "totalTaxInrV3", "totalTaxInrEntity"],
        compute: function(d) {
          return d.isEntityTaxpayer ? d.totalTaxInrEntity : d.totalTaxInrV3;
        }
      };
      NODES.regimeCombined = {
        deps: ["isEntityTaxpayer", "taxRegime", "entityTaxResult"],
        compute: function(d) {
          return d.isEntityTaxpayer ? d.entityTaxResult.regime : d.taxRegime;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/itrform-nodes.js
  var require_itrform_nodes = __commonJS({
    "prototypes/graph-pilot/itrform-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      var indiaFullNodes = require_india_full_nodes().NODES;
      var NODES = {};
      Object.keys(indiaFullNodes).forEach(function(k) {
        NODES[k] = indiaFullNodes[k];
      });
      NODES.grossTotalIncomeInrV3 = {
        deps: [
          "normalSlabInr",
          "stcgTaxableInr",
          "ltcgTaxableInr",
          "ltcg197TaxableInr",
          "specialRate115bbInr",
          "vdaGainInrBoundary",
          "chapterXiiaInvestmentIncomeInrBoundary",
          "nrInterest",
          "s115aDividend",
          "s115aRoyalty",
          "s115aFts"
        ],
        compute: function(d) {
          return d.normalSlabInr + d.stcgTaxableInr + d.ltcgTaxableInr + d.ltcg197TaxableInr + d.specialRate115bbInr + d.vdaGainInrBoundary + d.chapterXiiaInvestmentIncomeInrBoundary + (d.nrInterest ? d.nrInterest.carvedOutInr : 0) + (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) + (d.s115aFts ? d.s115aFts.totalInr : 0);
        }
      };
      NODES.grossTotalIncomeInrCombined = {
        deps: ["isEntityTaxpayer", "grossTotalIncomeInrV3", "entityTaxableInrBoundary"],
        compute: function(d) {
          return d.isEntityTaxpayer ? d.entityTaxableInrBoundary : d.grossTotalIncomeInrV3;
        }
      };
      NODES.indiaForeignIncomeDeclaredRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "foreign_income.has_foreign_income", null);
      } };
      NODES.indiaForeignAssetsDeclaredRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "foreign_assets.has_foreign_assets", null);
      } };
      NODES.indiaHasBroughtForwardLossesRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "carry_forward_losses.has_brought_forward_losses", null);
      } };
      NODES.indiaIsCompanyDirectorRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "profile.is_company_director", false) === true;
      } };
      NODES.indiaIsSection8Raw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "profile.is_section_8", false) === true;
      } };
      NODES.indiaLayer1ItrRaw = {
        deps: [],
        compute: function(d, ctx) {
          var v = safe(ctx.india, "itr_recommendation.form", null);
          return v === "Unknown" ? null : v;
        }
      };
      NODES.indiaReturnFormExplanationRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "itr_recommendation.explanation", null);
      } };
      NODES.indiaItrFormResult = {
        deps: [
          "indiaEntityTypeRaw",
          "indiaResidencyStatusRawAgg",
          "grossTotalIncomeInrCombined",
          "stcgInrBoundary",
          "ltcgInrBoundary",
          "ltcg197InrBoundary",
          "stcgSlabInrBoundary",
          "indiaForeignIncomeDeclaredRaw",
          "indiaForeignAssetsDeclaredRaw",
          "vdaGainInrBoundary",
          "capitalGainsComputation",
          "totalIndiaIncomeInr",
          "agriculturalIncomeInrAgg",
          "specialRate115bbInr",
          "indiaHasBroughtForwardLossesRaw",
          "speculativeIncomeInrAgg",
          "fnoIncomeInrAgg",
          "indiaIsCompanyDirectorRaw",
          "businessComputation",
          "indiaIncomeModelResult",
          "indiaIsSection8Raw",
          "indiaLayer1ItrRaw",
          "indiaReturnFormExplanationRaw"
        ],
        compute: function(d) {
          var entity = d.indiaEntityTypeRaw;
          var isInd = entity === "individual", isHuf = entity === "huf";
          var isROR = d.indiaResidencyStatusRawAgg === "ROR";
          var totalIncomeInr = d.grossTotalIncomeInrCombined || 0;
          var stcg111A = d.stcgInrBoundary || 0;
          var ltcg112A = d.ltcgInrBoundary || 0;
          var ltcg112 = d.ltcg197InrBoundary || 0;
          var stcgOther = d.stcgSlabInrBoundary || 0;
          var otherCapitalGains = stcg111A + ltcg112 + stcgOther;
          var hasDisqualifyingCapitalGains = otherCapitalGains > 0 || ltcg112A > 125e3;
          var hasForeignIncome = (isInd || isHuf) && d.indiaForeignIncomeDeclaredRaw === true;
          var hasForeignAssets = (isInd || isHuf) && d.indiaForeignAssetsDeclaredRaw === true;
          var hasCrypto = (isInd || isHuf) && ((d.vdaGainInrBoundary || 0) > 0 || (d.capitalGainsComputation.vdaSaleConsiderationInr || 0) > 0);
          var multipleHP = (d.indiaIncomeModelResult.housePropertyCount || 0) > 2;
          var hasHighAgriIncome = (d.agriculturalIncomeInrAgg || 0) > 5e3;
          var hasLotteryOrGaming = (d.specialRate115bbInr || 0) > 0;
          var hasBFLosses = d.indiaHasBroughtForwardLossesRaw === true;
          var hasSpeculativeOrFNO = (d.speculativeIncomeInrAgg || 0) !== 0 || (d.fnoIncomeInrAgg || 0) !== 0;
          var isDirector = isInd && d.indiaIsCompanyDirectorRaw === true;
          var directorUnknown = isInd && !isDirector;
          var disqualifiers = [];
          if (totalIncomeInr > 5e6) disqualifiers.push("Total income exceeds \u20B950,00,000 (\u20B9" + Math.round(totalIncomeInr).toLocaleString("en-IN") + ")");
          if (!isROR) disqualifiers.push("Not Resident & Ordinarily Resident (status: " + (d.indiaResidencyStatusRawAgg || "unknown") + ")");
          if (hasDisqualifyingCapitalGains) {
            disqualifiers.push(otherCapitalGains > 0 ? "Capital gains beyond the s.198-only allowance (STCG and/or non-s.198 LTCG present)" : "LTCG under s.198 exceeds the \u20B91,25,000 threshold (\u20B9" + Math.round(ltcg112A).toLocaleString("en-IN") + ")");
          }
          if (hasForeignIncome) disqualifiers.push("Foreign income declared (foreign_income.has_foreign_income)");
          if (hasForeignAssets) disqualifiers.push("Foreign assets declared (Schedule FA)");
          if (hasCrypto) disqualifiers.push("Crypto/VDA gains or sale activity on file");
          if (multipleHP) disqualifiers.push("More than 2 house properties (" + d.indiaIncomeModelResult.housePropertyCount + ")");
          if (hasHighAgriIncome) disqualifiers.push("Agricultural income exceeds \u20B95,000 (\u20B9" + Math.round(d.agriculturalIncomeInrAgg).toLocaleString("en-IN") + ")");
          if (hasLotteryOrGaming) disqualifiers.push("Lottery/betting/online-gaming winnings on file (s.128/194)");
          if (hasBFLosses) disqualifiers.push("Brought-forward losses on file");
          if (hasSpeculativeOrFNO) disqualifiers.push("Speculative or F&O business income on file");
          if (isDirector) disqualifiers.push("Company director (profile.is_company_director)");
          var isDisqualified = disqualifiers.length > 0;
          var hasBusiness = !!(d.businessComputation.indiaHasRegularBooksEntry || d.businessComputation.indiaHasValidPresumptiveEntry || (d.fnoIncomeInrAgg || 0) !== 0 || (d.speculativeIncomeInrAgg || 0) !== 0);
          var hasPartnerIncome = !!d.businessComputation.indiaHasPartnerFirmIncome;
          var presumptiveOnly = d.businessComputation.indiaHasValidPresumptiveEntry === true && !d.businessComputation.indiaHasRegularBooksEntry && !hasPartnerIncome && (d.fnoIncomeInrAgg || 0) === 0 && (d.speculativeIncomeInrAgg || 0) === 0;
          var form, explanation;
          if (entity === "company") {
            if (d.indiaIsSection8Raw) {
              form = "ITR-7";
              explanation = "For NGOs, Public Charitable Trusts, registered Societies, and Section 8 Companies claiming tax exemptions.";
            } else {
              form = "ITR-6";
              explanation = "For Corporate Companies (Private Limited, Public Limited, OPCs) not claiming charitable exemptions.";
            }
          } else if (["trust", "ngo", "society", "political_party"].indexOf(entity) >= 0) {
            form = "ITR-7";
            explanation = "For NGOs, Public Charitable Trusts, registered Societies, and Political Parties claiming tax exemptions under Trust & NGO Tax Exemptions.";
          } else if (["firm", "aop", "boi", "ajp", "local"].indexOf(entity) >= 0) {
            if (entity === "firm" && !isDisqualified && presumptiveOnly) {
              form = "ITR-4 (SUGAM)";
              explanation = "For Resident Partnership Firms (excluding LLPs) with total income up to \u20B950 Lakhs opting for Presumptive Taxation (44AD, 44ADA, 44AE).";
            } else {
              form = "ITR-5";
              explanation = "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities.";
            }
          } else if (entity === "llp") {
            form = "ITR-5";
            explanation = "For Partnership Firms, LLPs, commercial AOPs, BOIs, AJPs, and Local Authorities.";
          } else if (isInd || isHuf) {
            if (hasBusiness || hasPartnerIncome) {
              if (!isDisqualified && presumptiveOnly && !hasPartnerIncome) {
                form = "ITR-4 (SUGAM)";
                explanation = "For Resident Individuals and HUFs with total income up to \u20B950 Lakhs who opt exclusively for the Presumptive Taxation Scheme (44AD/44ADA/44AE).";
              } else {
                form = "ITR-3";
                explanation = "For Individuals and HUFs with Business or Professional Income maintaining books, or receiving remuneration/interest as a partner in a firm. Mandatory if disqualified from ITR-4.";
              }
            } else if (isInd && !isDisqualified) {
              form = "ITR-1 (SAHAJ)";
              explanation = "For Resident Salaried Individuals with total income up to \u20B950 Lakhs (Salary, up to 2 house properties, basic other sources). Restrictions: no foreign assets/income, no capital gains beyond the s.198-only allowance, no directorships.";
            } else {
              form = "ITR-2";
              explanation = "For Individuals and HUFs not having business/profession income but having Capital Gains, Foreign Income/Assets, multiple properties, or otherwise not qualifying for ITR-1." + (disqualifiers.length ? " Disqualified from ITR-1 due to: " + disqualifiers.join("; ") + "." : "");
            }
          } else {
            form = "ITR-2";
            explanation = "Entity type not otherwise classified \u2014 defaulting to ITR-2 pending a proper Layer 1 entity-type read.";
          }
          return {
            form,
            explanation,
            disqualified: isDisqualified,
            disqualifiers,
            totalIncomeInr,
            directorUnknown,
            frontendForm: d.indiaLayer1ItrRaw,
            frontendExplanation: d.indiaLayer1ItrRaw ? d.indiaReturnFormExplanationRaw : null,
            matchesFrontend: d.indiaLayer1ItrRaw ? d.indiaLayer1ItrRaw === form : null
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/aggregateusincome-nodes.js
  var require_aggregateusincome_nodes = __commonJS({
    "prototypes/graph-pilot/aggregateusincome-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(inr, ctx) {
        return num(inr) / fxRate(ctx);
      }
      var CONST_AGGUS = require_constants().CONST;
      var US_SEC179_MAX_USD = CONST_AGGUS.TAX.US_SEC179_MAX_USD;
      var US_SEC179_PHASEOUT_THRESHOLD_USD = CONST_AGGUS.TAX.US_SEC179_PHASEOUT_THRESHOLD_USD;
      var US_BONUS_DEPRECIATION_RATE = CONST_AGGUS.TAX.US_BONUS_DEPRECIATION_RATE;
      var US_MACRS_HALF_YEAR = CONST_AGGUS.TAX.US_MACRS_HALF_YEAR;
      var US_MACRS_STRAIGHT_LINE_ANNUAL = CONST_AGGUS.TAX.US_MACRS_STRAIGHT_LINE_ANNUAL;
      function computeSelfEmploymentNetProfitUsd(s) {
        var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
        var grossProfit = num(s.gross_receipts_usd) - num(s.returns_and_allowances_usd) - cogs;
        return grossProfit + num(s.other_income_usd) - num(s.expenses_usd);
      }
      function selfEmploymentNetProfitUsd(s, depreciationUsd) {
        var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
        if (explicit !== void 0 && explicit !== null) return num(explicit);
        return computeSelfEmploymentNetProfitUsd(s) - num(depreciationUsd || 0);
      }
      function computeFarmGrossIncomeUsd(f) {
        var inc = safe(f, "itemized_income", {}) || {};
        var gross = num(inc.sales_livestock_produce_raised) + num(inc.sales_livestock_produce_purchased) + num(inc.cooperative_distributions) + num(inc.agricultural_program_payments) + num(inc.ccc_loans) + num(inc.crop_insurance_proceeds) + num(inc.custom_hire_income) + num(inc.other_income);
        if (f.accounting_method === "accrual") {
          var inv = safe(f, "inventory", {}) || {};
          gross -= num(inv.beginning_inventory) + num(inv.cost_of_purchases) - num(inv.ending_inventory);
        }
        return gross;
      }
      function computeFarmNetProfitUsd(f) {
        return computeFarmGrossIncomeUsd(f) - num(f.expenses_usd);
      }
      function farmNetProfitUsd(f, depreciationUsd) {
        if (f.net_profit_usd !== void 0 && f.net_profit_usd !== null) return num(f.net_profit_usd);
        if (f.gross_income_usd !== void 0 && f.gross_income_usd !== null) return num(f.gross_income_usd) - num(f.expenses_usd) - num(depreciationUsd || 0);
        return computeFarmNetProfitUsd(f) - num(depreciationUsd || 0);
      }
      function assetRecoveryYearN(asset, baseYear) {
        if (!asset || !asset.placed_in_service_date) return null;
        var d = new Date(asset.placed_in_service_date);
        if (isNaN(d.getTime())) return null;
        var yearN = baseYear - d.getFullYear() + 1;
        return yearN >= 1 ? yearN : null;
      }
      function straightLineYear1FractionInr(placedInServiceDateStr) {
        var d = new Date(placedInServiceDateStr);
        if (isNaN(d.getTime())) return 1;
        var monthsRemainingInclHalf = 12 - d.getMonth() - 0.5;
        return Math.max(0, Math.min(1, monthsRemainingInclHalf / 12));
      }
      function computeAssetDepreciationUsd(asset, baseYear) {
        var cost = num(asset.cost);
        var yearN = assetRecoveryYearN(asset, baseYear);
        var klass = asset.class;
        var isStraightLine = !!US_MACRS_STRAIGHT_LINE_ANNUAL[klass];
        var eligibleForSec179Bonus = !isStraightLine;
        var isCurrentYear = yearN === 1;
        var requestedSec179Usd = isCurrentYear && eligibleForSec179Bonus ? Math.min(Math.max(0, num(asset.sec179)), cost) : 0;
        var bonusEligibleBasisUsd = Math.max(0, cost - requestedSec179Usd);
        var bonusUsd = isCurrentYear && eligibleForSec179Bonus && asset.bonus === true ? bonusEligibleBasisUsd * US_BONUS_DEPRECIATION_RATE : 0;
        var macrsBasisUsd = Math.max(0, cost - requestedSec179Usd - bonusUsd);
        var macrsUsd = 0;
        if (yearN != null && macrsBasisUsd > 0) {
          if (isStraightLine) {
            var annualRate = US_MACRS_STRAIGHT_LINE_ANNUAL[klass];
            macrsUsd = yearN === 1 ? macrsBasisUsd * annualRate * straightLineYear1FractionInr(asset.placed_in_service_date) : macrsBasisUsd * annualRate;
          } else {
            var table = US_MACRS_HALF_YEAR[klass];
            if (table && yearN <= table.length) macrsUsd = macrsBasisUsd * table[yearN - 1];
          }
        }
        return { cost, yearN, isCurrentYear, class: klass, eligibleForSec179Bonus, requestedSec179Usd, bonusUsd, macrsUsd };
      }
      function aggregateAssetDepreciationUsd(businesses, baseYear) {
        var perAsset = [];
        businesses.forEach(function(b) {
          (b.assets || []).forEach(function(a) {
            perAsset.push({ businessKey: b.key, calc: computeAssetDepreciationUsd(a, baseYear) });
          });
        });
        var totalRequestedSec179Usd = perAsset.reduce(function(s, p) {
          return s + p.calc.requestedSec179Usd;
        }, 0);
        var totalQualifyingAdditionsUsd = perAsset.reduce(function(s, p) {
          return s + (p.calc.isCurrentYear && p.calc.eligibleForSec179Bonus ? p.calc.cost : 0);
        }, 0);
        var phaseoutReductionUsd = Math.max(0, totalQualifyingAdditionsUsd - US_SEC179_PHASEOUT_THRESHOLD_USD);
        var capAfterPhaseoutUsd = Math.max(0, US_SEC179_MAX_USD - phaseoutReductionUsd);
        var preSec179BusinessIncomeUsd = businesses.reduce(function(s, b) {
          var bonusMacrs = perAsset.filter(function(p) {
            return p.businessKey === b.key;
          }).reduce(function(s2, p) {
            return s2 + p.calc.bonusUsd + p.calc.macrsUsd;
          }, 0);
          return s + (b.grossReceiptsMinusExpensesUsd - bonusMacrs);
        }, 0);
        var allowedSec179AggregateUsd = Math.max(0, Math.min(totalRequestedSec179Usd, capAfterPhaseoutUsd, preSec179BusinessIncomeUsd));
        var scale = totalRequestedSec179Usd > 0 ? allowedSec179AggregateUsd / totalRequestedSec179Usd : 0;
        var byBusiness = {};
        perAsset.forEach(function(p) {
          var actualSec179Usd = p.calc.requestedSec179Usd * scale;
          var totalUsd = actualSec179Usd + p.calc.bonusUsd + p.calc.macrsUsd;
          if (!byBusiness[p.businessKey]) byBusiness[p.businessKey] = { totalUsd: 0, assets: [] };
          byBusiness[p.businessKey].totalUsd += totalUsd;
          byBusiness[p.businessKey].assets.push({
            name: null,
            class: p.calc.class,
            yearN: p.calc.yearN,
            cost: p.calc.cost,
            sec179Usd: actualSec179Usd,
            bonusUsd: p.calc.bonusUsd,
            macrsUsd: p.calc.macrsUsd,
            totalUsd
          });
        });
        return { byBusiness };
      }
      function k1PassiveIncomeUsd(k) {
        return {
          interestUsd: num(k.interest_income_usd),
          ordDivUsd: num(k.ordinary_dividends_usd),
          qualDivUsd: num(k.qualified_dividends_usd),
          stcgUsd: num(k.stcg_usd),
          ltcgUsd: num(k.ltcg_usd) + Math.max(0, num(k.net_sec1231_gain_usd || k.sec1231_gain_usd || 0)),
          rentalUsd: num(k.net_rental_real_estate_usd) + num(k.other_rental_income_usd) + num(k.royalties_usd || k.royalty_income_usd || 0)
        };
      }
      function m(usd, ctx) {
        return { usd, inr: usd * fxRate(ctx) };
      }
      var NODES = {
        baseYearUsAgg: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "metadata.us_calendar_year", 2025)) || 2025;
        } },
        uiAgg: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "income_us_source", {});
        } },
        fiAgg: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "income_foreign_source", {});
        } },
        wagesComputation: {
          deps: ["uiAgg"],
          compute: function(d) {
            var wages = 0, w2with = 0, medicareWages = 0, qualifiedTipsUsd = 0, qualifiedOvertimeUsd = 0;
            var w2Employers = [];
            var w2 = safe(d.uiAgg, "wages_w2", null);
            if (Array.isArray(w2)) {
              w2.forEach(function(w) {
                var wagesUsd = num(w.wages_box1_usd || w.wages_tips_compensation_usd || 0);
                wages += wagesUsd;
                var adv = w.tax_details_collapsed_by_default || w;
                var fedWithUsd = num(adv.federal_tax_withheld_usd || adv.federal_income_tax_withheld_usd || 0);
                w2with += fedWithUsd;
                medicareWages += num(adv.medicare_wages_box5_usd || w.wages_box1_usd || 0);
                qualifiedTipsUsd += num(w.qualified_tip_income_usd || 0);
                qualifiedOvertimeUsd += num(w.qualified_overtime_premium_usd || 0);
                var stateWithUsd = 0;
                (safe(w, "state_and_local_taxes", []) || []).forEach(function(st) {
                  stateWithUsd += num(st.state_tax_withheld_box17_usd || 0);
                });
                w2Employers.push({ employerName: w.employer_name || null, wagesUsd, federalWithheldUsd: fedWithUsd, stateWithheldUsd: stateWithUsd });
              });
            }
            return { wagesUsd: wages, w2WithholdingUsd: w2with, w2Employers, medicareWagesUsd: medicareWages, qualifiedTipsUsd, qualifiedOvertimeUsd };
          }
        },
        foreignWagesUsd: {
          deps: ["fiAgg"],
          compute: function(d) {
            return (safe(d.fiAgg, "foreign_wages", []) || []).reduce(function(s, w) {
              return s + num(w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd || 0);
            }, 0);
          }
        },
        // Combines self-employment AND farming_schedule_f assets into ONE
        // taxpayer-wide §179 aggregation pool (real law caps/phases out §179
        // across ALL of a taxpayer's directly-owned active trades/businesses
        // together, not per-array) — keyed "se"+idx / "farm"+idx so callers can
        // look up either. K-1/1120 asset rows are deliberately NOT folded in:
        // those entities' reported income already reflects the ENTITY's own
        // depreciation before flow-through (Box 1 is already net of regular/bonus
        // depreciation; only §179 is separately stated, as sec179_deduction_usd),
        // so a second per-asset computation against a K-1 recipient's own copy of
        // the entity's asset list would double-count. Farm has no such risk — a
        // directly-owned trade/business with its own real gross-receipts/expenses
        // derivation (computeFarmNetProfitUsd), not a pass-through entity's
        // already-net distributive share, so it's treated exactly like self-
        // employment. Named usBusinessDepreciationPlan (was
        // selfEmploymentDepreciationPlan before farm was folded in).
        usBusinessDepreciationPlan: {
          deps: ["uiAgg", "baseYearUsAgg"],
          compute: function(d) {
            var businesses = [];
            (safe(d.uiAgg, "self_employment", []) || []).forEach(function(s, idx) {
              var assets = (s.assets || []).slice();
              (s.branches || []).forEach(function(br) {
                assets = assets.concat(br.assets || []);
              });
              businesses.push({ key: "se" + idx, grossReceiptsMinusExpensesUsd: computeSelfEmploymentNetProfitUsd(s), assets });
            });
            (safe(d.uiAgg, "farming_schedule_f", []) || []).forEach(function(f, idx) {
              var assets = (f.assets || []).slice();
              (f.branches || []).forEach(function(br) {
                assets = assets.concat(br.assets || []);
              });
              businesses.push({ key: "farm" + idx, grossReceiptsMinusExpensesUsd: computeFarmNetProfitUsd(f), assets });
            });
            return aggregateAssetDepreciationUsd(businesses, d.baseYearUsAgg);
          }
        },
        k1PassiveTotals: {
          deps: ["uiAgg"],
          compute: function(d) {
            var totals = { interestUsd: 0, ordDivUsd: 0, qualDivUsd: 0, stcgUsd: 0, ltcgUsd: 0, rentalUsd: 0 };
            function add(k) {
              var p = k1PassiveIncomeUsd(k);
              totals.interestUsd += p.interestUsd;
              totals.ordDivUsd += p.ordDivUsd;
              totals.qualDivUsd += p.qualDivUsd;
              totals.stcgUsd += p.stcgUsd;
              totals.ltcgUsd += p.ltcgUsd;
              totals.rentalUsd += p.rentalUsd;
            }
            (safe(d.uiAgg, "partnerships_k1", []) || []).forEach(add);
            (safe(d.uiAgg, "s_corporations_k1", []) || []).forEach(add);
            (safe(d.uiAgg, "trusts_estates_k1", []) || []).forEach(add);
            return totals;
          }
        },
        businessAndSeComputation: {
          deps: ["uiAgg", "usBusinessDepreciationPlan", "baseYearUsAgg"],
          compute: function(d) {
            var ui = d.uiAgg, seDeprPlan = d.usBusinessDepreciationPlan;
            var businessUs = num(safe(ui, "business_income_usd", 0));
            (safe(ui, "c_corporations_1120", []) || []).forEach(function(c) {
              businessUs += num(c.taxable_income_usd || c.net_income_usd || 0);
            });
            (safe(ui, "partnerships_k1", []) || []).forEach(function(k) {
              businessUs += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) + num(k.guaranteed_payments_usd || 0) - num(k.sec179_deduction_usd || 0);
            });
            var foreignSelfEmployment = 0;
            (safe(ui, "self_employment", []) || []).forEach(function(s, idx) {
              var deprUsd = seDeprPlan.byBusiness["se" + idx] ? seDeprPlan.byBusiness["se" + idx].totalUsd : 0;
              var netUsd = selfEmploymentNetProfitUsd(s, deprUsd);
              if (s.llc_type === "foreign_disregarded") foreignSelfEmployment += netUsd;
              else businessUs += netUsd;
            });
            (safe(ui, "s_corporations_k1", []) || []).forEach(function(s) {
              businessUs += num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0) - num(s.sec179_deduction_usd || 0);
            });
            (safe(ui, "trusts_estates_k1", []) || []).forEach(function(t) {
              businessUs += num(t.ordinary_income_usd || 0) + num(t.ordinary_gain_usd || 0);
            });
            (safe(ui, "farming_schedule_f", []) || []).forEach(function(f, idx) {
              var deprUsd = seDeprPlan.byBusiness["farm" + idx] ? seDeprPlan.byBusiness["farm" + idx].totalUsd : 0;
              businessUs += farmNetProfitUsd(f, deprUsd);
            });
            var seEarnings = 0;
            (safe(ui, "self_employment", []) || []).forEach(function(s, idx) {
              var deprUsd = seDeprPlan.byBusiness["se" + idx] ? seDeprPlan.byBusiness["se" + idx].totalUsd : 0;
              seEarnings += selfEmploymentNetProfitUsd(s, deprUsd);
            });
            (safe(ui, "farming_schedule_f", []) || []).forEach(function(f, idx) {
              var deprUsd = seDeprPlan.byBusiness["farm" + idx] ? seDeprPlan.byBusiness["farm" + idx].totalUsd : 0;
              seEarnings += farmNetProfitUsd(f, deprUsd);
            });
            var qbiIncome = seEarnings, sstb = false;
            (safe(ui, "s_corporations_k1", []) || []).forEach(function(s) {
              qbiIncome += num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0) - num(s.sec179_deduction_usd || 0);
            });
            (safe(ui, "partnerships_k1", []) || []).forEach(function(k) {
              qbiIncome += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) - num(k.sec179_deduction_usd || 0);
            });
            (safe(ui, "trusts_estates_k1", []) || []).forEach(function(t) {
              qbiIncome += num(t.ordinary_income_usd || 0);
            });
            [].concat(safe(ui, "self_employment", []) || [], safe(ui, "s_corporations_k1", []) || [], safe(ui, "partnerships_k1", []) || [], safe(ui, "trusts_estates_k1", []) || [], safe(ui, "farming_schedule_f", []) || []).forEach(function(x) {
              if (x && (x.is_specified_service_trade === true || x.is_sstb === true || x.sstb === true)) sstb = true;
            });
            (safe(ui, "partnerships_k1", []) || []).forEach(function(k) {
              var box14a = k.self_employment_earnings_usd;
              if (box14a === null || box14a === void 0 || box14a === "") box14a = num(k.guaranteed_payments_usd || 0) + (k.partner_type === "general" ? num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) : 0);
              seEarnings += num(box14a);
            });
            return { businessUsUsd: businessUs, foreignSelfEmploymentUsd: foreignSelfEmployment, seEarningsUsd: seEarnings, qbiIncomeUsd: Math.max(0, qbiIncome), qbiIsSSTB: sstb };
          }
        },
        retirementComputation: {
          deps: ["uiAgg"],
          compute: function(d) {
            var ui = d.uiAgg;
            var iraDistUsd = num(safe(ui, "ira_distributions_usd", 0));
            var dist401kUsd = num(safe(ui, "401k_distributions_usd", 0));
            var pensionUsd = num(safe(ui, "pension_income_usd", 0));
            var socialSecurityGrossUsd = num(safe(ui, "social_security_benefits_usd", 0));
            return { usRetirementIncomeExclSsUsd: iraDistUsd + dist401kUsd + pensionUsd, socialSecurityUsUsd: socialSecurityGrossUsd, retirementDistributionsSubjectTo72tUsd: iraDistUsd + dist401kUsd };
          }
        },
        directIncomeComputation: {
          deps: ["uiAgg", "fiAgg", "k1PassiveTotals"],
          compute: function(d) {
            var ui = d.uiAgg, fi = d.fiAgg, k1 = d.k1PassiveTotals;
            return {
              taxExemptInterestUsUsd: num(safe(ui, "interest_us_exempt_usd", 0)),
              interestUsUsd: num(safe(ui, "interest_us_source_usd", 0)) + k1.interestUsd,
              ordinaryDividendsUsUsd: num(safe(ui, "ordinary_dividends_us_source_usd", 0)) + k1.ordDivUsd,
              qualifiedDividendsUsUsd: num(safe(ui, "qualified_dividends_us_source_usd", 0)) + k1.qualDivUsd,
              ltcgUsUsd: num(safe(ui, "ltcg_us_source_usd", 0)) + k1.ltcgUsd,
              stcgUsUsd: num(safe(ui, "stcg_us_source_usd", 0)) + k1.stcgUsd,
              rentalUsUsd: num(safe(ui, "rental_income_us_source_usd", 0)) + k1.rentalUsd,
              foreignInterestUsd: num(safe(fi, "foreign_interest_usd", 0)),
              foreignDividendsUsd: num(safe(fi, "foreign_dividends_usd", 0)),
              foreignRentalUsd: num(safe(fi, "foreign_rental_income_usd", 0)),
              foreignPensionUsd: num(safe(fi, "foreign_pension_income_usd", 0)),
              foreignStcgUsd: num(safe(fi, "foreign_stcg_usd", 0)),
              foreignLtcgUsd: num(safe(fi, "foreign_ltcg_usd", 0))
            };
          }
        },
        // ---- India-side EPF/NPS cross-border-taxable amounts — needs India's
        // own annualSlice (quarter-merge), re-derived independently here rather
        // than imported, same "re-verify, don't trust by reference" discipline
        // as every other file in this effort. ------------------------------------
        indiaAnnualSliceForUs: {
          deps: [],
          compute: function(d, ctx) {
            var india = ctx.india;
            var quarters = safe(india, "quarters", null);
            if (!quarters) return { other_sources: safe(india, "other_sources", {}) };
            function merge(target, source) {
              for (var k in source) {
                if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
                var sv = source[k];
                if (sv === null || sv === void 0) continue;
                if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
                else target[k] = sv;
              }
              return target;
            }
            var out = { other_sources: {} };
            ["Q1", "Q2", "Q3", "Q4"].forEach(function(q) {
              var qs = quarters[q];
              if (qs && qs.other_sources) merge(out.other_sources, qs.other_sources);
            });
            return out;
          }
        },
        epfNpsCrossBorder: {
          deps: ["indiaAnnualSliceForUs"],
          compute: function(d, ctx) {
            return {
              taxableEpfInterestUsd: inrToUsd(num(safe(d.indiaAnnualSliceForUs.other_sources, "taxable_epf_interest_inr", 0)), ctx),
              taxableNpsWithdrawalUsd: inrToUsd(num(safe(d.indiaAnnualSliceForUs.other_sources, "taxable_nps_withdrawal_inr", 0)), ctx)
            };
          }
        },
        // ---- final assembly, matching aggregateUsIncome's own return object ----
        aggregateUsIncomeResult: {
          deps: ["wagesComputation", "foreignWagesUsd", "businessAndSeComputation", "retirementComputation", "directIncomeComputation", "epfNpsCrossBorder"],
          compute: function(d, ctx) {
            var w = d.wagesComputation, biz = d.businessAndSeComputation, ret = d.retirementComputation, di = d.directIncomeComputation, epf = d.epfNpsCrossBorder;
            var foreignInterest = di.foreignInterestUsd + epf.taxableEpfInterestUsd;
            var foreignPension = di.foreignPensionUsd + epf.taxableNpsWithdrawalUsd;
            var usSourceTotal = w.wagesUsd + biz.businessUsUsd + di.interestUsUsd + di.ordinaryDividendsUsUsd + di.ltcgUsUsd + di.stcgUsUsd + di.rentalUsUsd + ret.usRetirementIncomeExclSsUsd + ret.socialSecurityUsUsd;
            var foreignSourceTotal = d.foreignWagesUsd + biz.foreignSelfEmploymentUsd + foreignInterest + di.foreignDividendsUsd + di.foreignRentalUsd + foreignPension + di.foreignStcgUsd + di.foreignLtcgUsd;
            return {
              wages: m(w.wagesUsd, ctx),
              businessUs: m(biz.businessUsUsd, ctx),
              w2Withholding: w.w2WithholdingUsd,
              w2Employers: w.w2Employers,
              medicareWages: w.medicareWagesUsd,
              qualifiedTipsUsd: w.qualifiedTipsUsd,
              qualifiedOvertimeUsd: w.qualifiedOvertimeUsd,
              seEarningsUsd: biz.seEarningsUsd,
              qbiIncomeUsd: biz.qbiIncomeUsd,
              qbiIsSSTB: biz.qbiIsSSTB,
              usRetirementIncome: m(ret.usRetirementIncomeExclSsUsd + ret.socialSecurityUsUsd, ctx),
              usRetirementIncomeExclSs: m(ret.usRetirementIncomeExclSsUsd, ctx),
              retirementDistributionsSubjectTo72tUsd: ret.retirementDistributionsSubjectTo72tUsd,
              socialSecurityUs: m(ret.socialSecurityUsUsd, ctx),
              taxExemptInterestUs: m(di.taxExemptInterestUsUsd, ctx),
              interestUs: m(di.interestUsUsd, ctx),
              ordinaryDividendsUs: m(di.ordinaryDividendsUsUsd, ctx),
              qualifiedDividendsUs: m(di.qualifiedDividendsUsUsd, ctx),
              ltcgUs: m(di.ltcgUsUsd, ctx),
              stcgUs: m(di.stcgUsUsd, ctx),
              capitalGainsUs: m(di.ltcgUsUsd + di.stcgUsUsd, ctx),
              rentalUs: m(di.rentalUsUsd, ctx),
              foreignWages: m(d.foreignWagesUsd, ctx),
              foreignSelfEmployment: m(biz.foreignSelfEmploymentUsd, ctx),
              foreignInterest: m(foreignInterest, ctx),
              foreignDividends: m(di.foreignDividendsUsd, ctx),
              foreignRental: m(di.foreignRentalUsd, ctx),
              foreignPension: m(foreignPension, ctx),
              foreignStcg: m(di.foreignStcgUsd, ctx),
              foreignLtcg: m(di.foreignLtcgUsd, ctx),
              foreignCapitalGains: m(di.foreignStcgUsd + di.foreignLtcgUsd, ctx),
              retirementEpfInterestUsd: epf.taxableEpfInterestUsd,
              retirementNpsWithdrawalUsd: epf.taxableNpsWithdrawalUsd,
              usSourceTotal: m(usSourceTotal, ctx),
              foreignSourceTotal: m(foreignSourceTotal, ctx),
              total: m(usSourceTotal + foreignSourceTotal, ctx)
            };
          }
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/ustax-nodes.js
  var require_ustax_nodes = __commonJS({
    "prototypes/graph-pilot/ustax-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var CONST = require_constants().CONST;
      var T = CONST.TAX.US;
      var FEIE_MAX_USD = CONST.LIMITS.FEIE_MAX_USD;
      var NIIT_THRESHOLD = CONST.LIMITS.NIIT_THRESHOLD;
      function bracketTax(amount, slabs) {
        var t = Math.max(0, amount), tax = 0, prev = 0;
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            tax += (Math.min(t, cap) - prev) * rate;
            prev = cap;
          } else break;
        }
        return tax;
      }
      function bracketBreakdown(amount, slabs) {
        var t = Math.max(0, amount), prev = 0, rows = [];
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            var taxable = Math.min(t, cap) - prev;
            rows.push({ from: prev, to: cap, rate, taxable, tax: taxable * rate });
            prev = cap;
          } else break;
        }
        return rows;
      }
      function computeSaltCap(agi, status) {
        var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
        var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
        var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
        return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
      }
      function computeSsTaxableUsd(grossSsUsd, otherAgiExclSs, taxExemptInterestUsd, status) {
        if (grossSsUsd <= 0) return 0;
        var baseAmt = T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single;
        var addlAmt = T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single;
        var line2 = 0.5 * grossSsUsd;
        var line5 = line2 + Math.max(0, otherAgiExclSs) + Math.max(0, taxExemptInterestUsd);
        var line7 = Math.max(0, line5 - baseAmt);
        if (line7 <= 0) return 0;
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
      function feieEligibility(f) {
        f = f || {};
        var claimed = !!f.claimed || (f.amountClaimedUsd || 0) > 0;
        var home = String(f.taxHomeCountry || "").trim().toLowerCase();
        var taxHomeAbroad = home !== "" && home !== "us" && home !== "usa" && home !== "united states" && home !== "united states of america";
        var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
        var ppMet = !!f.physicalPresence && ppDaysOk;
        var bfMet = !!f.bonaFide;
        var reasons = [];
        if (claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
        if (claimed && !bfMet && !ppMet) {
          reasons.push(!f.physicalPresence && !f.bonaFide ? "neither the bona-fide-residence nor the physical-presence test is met" : f.physicalPresence && !ppDaysOk ? f.daysInUsTestPeriod + " US days in the test period \u2014 over the ~35-day allowance (330 full days abroad required)" : "bona-fide-residence test not met");
        }
        return { claimed, amountClaimedUsd: f.amountClaimedUsd || 0, taxHomeAbroad, testMet: bfMet || ppMet, eligible: taxHomeAbroad && (bfMet || ppMet), reasons };
      }
      var NODES = {
        // ---- raw leaves for feie/filing status/entity gates ----------------------
        usEntityKind: { deps: [], compute: function(d, ctx) {
          return ctx.model.entity ? ctx.model.entity.usKind : "individual";
        } },
        files1040nr: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "nra_specific.files_form_1040nr", false) === true;
        } },
        s6013hElection: { deps: [], compute: function(d, ctx) {
          return safe(ctx.us, "nra_specific.s6013h_joint_election", false) === true;
        } },
        usFilingStatusRaw: {
          deps: [],
          compute: function(d, ctx) {
            var s = (safe(ctx.us, "profile.filing_status", "single") || "single").toLowerCase();
            if (s === "married_filing_jointly" || s === "mfj") return "mfj";
            if (s === "married_filing_separately" || s === "mfs") return "mfs";
            if (s === "head_of_household" || s === "hoh") return "hoh";
            return "single";
          }
        },
        worldwideUs: { deps: [], compute: function(d, ctx) {
          return !!(ctx.computed.residency && ctx.computed.residency.us && ctx.computed.residency.us.worldwide);
        } },
        feieRaw: {
          deps: [],
          compute: function(d, ctx) {
            return {
              claimed: safe(ctx.us, "foreign_earned_income.claims_feie", false) === true,
              amountClaimedUsd: num(safe(ctx.us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
              taxHomeCountry: safe(ctx.us, "foreign_earned_income.tax_home_country", ""),
              bonaFide: safe(ctx.us, "foreign_earned_income.bona_fide_residence", false) === true,
              physicalPresence: safe(ctx.us, "foreign_earned_income.physical_presence", false) === true,
              daysInUsTestPeriod: num(safe(ctx.us, "foreign_earned_income.days_in_us_during_test_period", 0))
            };
          }
        },
        feie: { deps: ["feieRaw"], compute: function(d) {
          return feieEligibility(d.feieRaw);
        } },
        // ---- EXPLICIT BOUNDARY: aggregateUsIncome's entire output ----------------
        incUs: { deps: [], compute: function(d, ctx) {
          return ctx.model.income.us;
        } },
        // ---- aggregateUsDeductions, ported exactly --------------------------------
        dedUs: {
          deps: [],
          compute: function(d, ctx) {
            var us = ctx.us;
            var it = safe(us, "itemized_deductions_and_credits", {});
            var isoAmtPrefUsd = 0;
            (safe(us, "equity_compensation.iso_exercises", []) || []).forEach(function(ex) {
              isoAmtPrefUsd += num(ex.amt_preference_spread_usd != null ? ex.amt_preference_spread_usd : Math.max(0, (num(ex.fmv_at_exercise_usd) - num(ex.strike_price_usd)) * num(ex.shares_exercised)));
            });
            return {
              mode: safe(it, "use_standard_or_itemized", "auto"),
              salt: num(safe(it, "state_and_local_taxes_paid_usd", 0)),
              mortgageInterest: num(safe(it, "mortgage_interest_paid_usd", 0)),
              charitable: num(safe(it, "charitable_contributions_cash_usd", 0)) + num(safe(it, "charitable_contributions_appreciated_usd", 0)),
              medical: num(safe(it, "medical_expenses_usd", 0)),
              studentLoanInterest: num(safe(it, "student_loan_interest_usd", 0)),
              isoAmtPrefUsd,
              amtPrefs: num(safe(us, "amt_inputs.private_activity_bond_interest_usd", 0)) + num(safe(it, "private_activity_bond_interest_usd", 0)) + num(safe(it, "amt_preference_spread_usd", 0)) + num(safe(us, "amt.private_activity_bond_interest_usd", 0)) + num(safe(us, "amt.amt_preference_spread_usd", 0)) + num(safe(us, "amt_items_usd", 0)) + isoAmtPrefUsd,
              careExpenses: num(safe(it, "child_and_dependent_care_expenses_usd", 0)) || num(safe(it, "dependent_care_expenses_usd", 0)),
              aotc: num(safe(it, "education_credits_aotc_usd", 0)),
              lifetimeLearning: num(safe(it, "education_credits_llc_usd", 0)),
              dependents: num(safe(us, "profile.dependents_count", 0)) || num(safe(it, "dependents_count", 0)),
              seHealthInsuranceDeductionUsd: num(safe(us, "income_us_source.se_health_insurance_deduction_usd", 0)),
              seRetirementDeductionUsd: num(safe(us, "income_us_source.se_retirement_deduction_usd", 0))
            };
          }
        },
        additionalMedicareOwedBoundary: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "withholding_and_estimated.additional_medicare_tax_owed_usd", 0));
        } },
        taxpayerDobRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "date_of_birth", safe(ctx.india, "profile.date_of_birth", safe(ctx.us, "profile.date_of_birth", null)));
        } },
        baseYearUs: { deps: [], compute: function(d, ctx) {
          return ctx.model.meta.baseYear;
        } },
        // ---- computeUsTax, ported in full (individual/resident path) -------------
        usTaxResult: {
          deps: ["incUs", "dedUs", "usFilingStatusRaw", "worldwideUs", "feie", "additionalMedicareOwedBoundary", "taxpayerDobRaw", "baseYearUs"],
          compute: function(d) {
            var inc = d.incUs, ded = d.dedUs, status = d.usFilingStatusRaw, worldwide = d.worldwideUs, feie = d.feie;
            var brackets = T.BRACKETS[status] || T.BRACKETS.single;
            var fW = worldwide ? inc.foreignWages.usd : 0;
            var fSE = worldwide ? inc.foreignSelfEmployment.usd : 0;
            var feieAppliedUsd = 0;
            if (worldwide && feie.claimed && feie.eligible && fW + fSE > 0) {
              var feieEarnedBaseUsd = fW + fSE;
              var feieBase = feie.amountClaimedUsd > 0 ? feie.amountClaimedUsd : feieEarnedBaseUsd;
              feieAppliedUsd = Math.min(feieEarnedBaseUsd, feieBase, FEIE_MAX_USD);
              var feieAppliedToWagesUsd = Math.min(fW, feieAppliedUsd);
              fW = fW - feieAppliedToWagesUsd;
              fSE = fSE - (feieAppliedUsd - feieAppliedToWagesUsd);
            }
            var fI = worldwide ? inc.foreignInterest.usd : 0, fD = worldwide ? inc.foreignDividends.usd : 0;
            var fR = worldwide ? inc.foreignRental.usd : 0, fP = worldwide ? inc.foreignPension.usd : 0;
            var fStcg = worldwide ? inc.foreignStcg.usd : 0, fLtcg = worldwide ? inc.foreignLtcg.usd : 0;
            var nonQualDivUs = Math.max(0, inc.ordinaryDividendsUs.usd - inc.qualifiedDividendsUs.usd);
            var ordinaryIncomeExclSs = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0) + inc.interestUs.usd + fI + nonQualDivUs + fD + inc.stcgUs.usd + fStcg + inc.rentalUs.usd + fR + fP + (inc.usRetirementIncomeExclSs ? inc.usRetirementIncomeExclSs.usd : inc.usRetirementIncome ? inc.usRetirementIncome.usd : 0);
            var preferentialIncome = inc.ltcgUs.usd + fLtcg + inc.qualifiedDividendsUs.usd;
            var grossSsUsd = inc.socialSecurityUs && inc.socialSecurityUs.usd || 0;
            var taxExemptInterestUsd = inc.taxExemptInterestUs && inc.taxExemptInterestUs.usd || 0;
            var taxableSsUsd = computeSsTaxableUsd(grossSsUsd, ordinaryIncomeExclSs + preferentialIncome, taxExemptInterestUsd, status);
            var ordinaryIncome = ordinaryIncomeExclSs + taxableSsUsd;
            var totalIncome = ordinaryIncome + preferentialIncome;
            var seNet = (inc.seEarningsUsd || 0) * T.SE_NET_FACTOR;
            var ssWagesAlready = inc.medicareWages || inc.wages.usd || 0;
            var ssBaseRemaining = Math.max(0, T.SS_WAGE_BASE_USD - ssWagesAlready);
            var seTax = seNet > 0 ? T.SE_RATE_SS * Math.min(seNet, ssBaseRemaining) + T.SE_RATE_MEDICARE * seNet : 0;
            var halfSeDeduction = seTax / 2;
            var seHealthDeduction = Math.min(ded.seHealthInsuranceDeductionUsd || 0, Math.max(0, seNet));
            var adjustments = Math.min(ded.studentLoanInterest, 2500) + halfSeDeduction + seHealthDeduction + (ded.seRetirementDeductionUsd || 0);
            var agi = Math.max(0, totalIncome - adjustments);
            var standard = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
            var saltCapUsd = computeSaltCap(agi, status);
            var itemized = Math.min(ded.salt, saltCapUsd) + ded.mortgageInterest + ded.charitable + Math.max(0, ded.medical - 0.075 * agi);
            var deduction = ded.mode === "itemized" ? itemized : ded.mode === "standard" ? standard : Math.max(standard, itemized);
            var taxpayerAge = null;
            if (d.taxpayerDobRaw) {
              var dobYear = new Date(d.taxpayerDobRaw).getFullYear();
              if (!isNaN(dobYear)) taxpayerAge = (d.baseYearUs || 2025) - dobYear;
            }
            var isSenior = taxpayerAge !== null && taxpayerAge >= T.SENIOR_DEDUCTION_MIN_AGE && status !== "mfs";
            var seniorPhaseoutThr = T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD[status] || T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD.single;
            var seniorDeductionUsd = isSenior ? Math.max(0, Math.round(T.SENIOR_DEDUCTION_PER_PERSON_USD - T.SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(0, agi - seniorPhaseoutThr))) : 0;
            var isMfs = status === "mfs";
            var tipsOtPhaseoutThr = T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD[status] || T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD.single;
            var tipsOtPhaseoutReduction = Math.ceil(Math.max(0, agi - tipsOtPhaseoutThr) / 1e3) * T.TIPS_OVERTIME_PHASEOUT_PER_1000_USD;
            var qualifiedTipsUsd = isMfs ? 0 : inc.qualifiedTipsUsd || 0;
            var qualifiedOvertimeUsd = isMfs ? 0 : inc.qualifiedOvertimeUsd || 0;
            var tipsDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedTipsUsd, T.TIPS_DEDUCTION_MAX_USD) - tipsOtPhaseoutReduction));
            var overtimeMaxUsd = T.OVERTIME_DEDUCTION_MAX_USD[status] || T.OVERTIME_DEDUCTION_MAX_USD.single;
            var overtimeDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedOvertimeUsd, overtimeMaxUsd) - tipsOtPhaseoutReduction));
            var taxableBeforeQbi = Math.max(0, agi - deduction - seniorDeductionUsd - tipsDeductionUsd - overtimeDeductionUsd);
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
            var prefTaxable = Math.min(preferentialIncome, taxableIncome);
            var ordTaxable = taxableIncome - prefTaxable;
            var ordinaryTax = bracketTax(ordTaxable, brackets);
            var ordinaryBracketBreakdown = bracketBreakdown(ordTaxable, brackets);
            var lb = T.LTCG_BRACKETS[status] || T.LTCG_BRACKETS.single;
            var start = ordTaxable;
            var amt0 = Math.max(0, Math.min(lb.br0 - start, prefTaxable));
            var remAfter0 = prefTaxable - amt0;
            var amt15 = Math.max(0, Math.min(lb.br15 - Math.max(start, lb.br0), remAfter0));
            var amt20 = remAfter0 - amt15;
            var preferentialTax = amt15 * 0.15 + amt20 * 0.2;
            var incomeTax = ordinaryTax + preferentialTax;
            var netInvestmentIncome = inc.interestUs.usd + fI + inc.ordinaryDividendsUs.usd + fD + inc.capitalGainsUs.usd + fStcg + fLtcg + inc.rentalUs.usd + fR;
            var niitThreshold = NIIT_THRESHOLD[status] || 2e5;
            var niit = T.NIIT_RATE * Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold));
            var addlMedicare = d.additionalMedicareOwedBoundary;
            var usedMode = ded.mode === "itemized" || ded.mode === "standard" ? ded.mode : itemized > standard ? "itemized" : "standard";
            var amtAddback = usedMode === "standard" ? deduction : Math.min(ded.salt, saltCapUsd);
            var amtiUsd = Math.max(0, taxableIncome + amtAddback + (ded.amtPrefs || 0));
            var amtExFull = T.AMT_EXEMPTION[status] || T.AMT_EXEMPTION.single;
            var amtPhase = T.AMT_PHASEOUT[status] || T.AMT_PHASEOUT.single;
            var amtExemption = Math.max(0, amtExFull - T.AMT_PHASEOUT_RATE * Math.max(0, amtiUsd - amtPhase));
            var amtBase = Math.max(0, amtiUsd - amtExemption);
            var amtOrdBase = Math.max(0, amtBase - prefTaxable);
            var amtBrk = status === "mfs" ? T.AMT_RATE_BREAK / 2 : T.AMT_RATE_BREAK;
            var tmtOrd = amtOrdBase <= amtBrk ? amtOrdBase * T.AMT_RATE_LOW : amtBrk * T.AMT_RATE_LOW + (amtOrdBase - amtBrk) * T.AMT_RATE_HIGH;
            var amtOwed = Math.max(0, Math.round(tmtOrd + preferentialTax - incomeTax));
            var magi = agi;
            var eduLo = status === "mfj" ? 16e4 : 8e4, eduHi = status === "mfj" ? 18e4 : 9e4;
            var eduPhase = magi <= eduLo ? 1 : magi >= eduHi ? 0 : 1 - (magi - eduLo) / (eduHi - eduLo);
            var careCap = ded.dependents >= 2 ? 6e3 : 3e3;
            var childCareCredit = 0.2 * Math.min(ded.careExpenses || 0, careCap);
            var aotcCredit = Math.min(ded.aotc || 0, 2500 * Math.max(1, ded.dependents || 1)) * eduPhase;
            var llcCredit = Math.min(ded.lifetimeLearning || 0, 2e3) * eduPhase;
            var otherCreditsUsd = Math.min(Math.round(childCareCredit + aotcCredit + llcCredit), Math.round(incomeTax));
            var numChildrenForCtc = ded.dependents || 0;
            var ctcPhaseoutThr = T.CTC_PHASEOUT_THRESHOLD_USD[status] || T.CTC_PHASEOUT_THRESHOLD_USD.single;
            var ctcMaxTotalUsd = T.CTC_PER_CHILD_USD * numChildrenForCtc;
            var ctcPhaseoutReductionUsd = Math.ceil(Math.max(0, agi - ctcPhaseoutThr) / 1e3) * T.CTC_PHASEOUT_PER_1000_USD;
            var ctcAvailableUsd = Math.max(0, ctcMaxTotalUsd - ctcPhaseoutReductionUsd);
            var remainingTaxAfterOtherCredits = Math.max(0, Math.round(incomeTax) - otherCreditsUsd);
            var ctcNonRefundableUsd = Math.min(ctcAvailableUsd, remainingTaxAfterOtherCredits);
            var ctcUnusedUsd = ctcAvailableUsd - ctcNonRefundableUsd;
            var earnedIncomeUsd = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0);
            var actcCapUsd = Math.min(T.CTC_REFUNDABLE_MAX_PER_CHILD_USD * numChildrenForCtc, T.CTC_REFUNDABLE_RATE * Math.max(0, earnedIncomeUsd - T.CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD));
            var ctcRefundableUsd = Math.round(Math.max(0, Math.min(ctcUnusedUsd, actcCapUsd)));
            var creditsUsd = otherCreditsUsd + ctcNonRefundableUsd + ctcRefundableUsd;
            var totalTaxBeforeFtc = incomeTax + niit + addlMedicare + seTax + amtOwed - creditsUsd;
            return {
              agiUsd: agi,
              taxableIncomeUsd: taxableIncome,
              incomeTaxUsd: incomeTax,
              niitUsd: niit,
              additionalMedicareUsd: addlMedicare,
              seTaxUsd: seTax,
              qbiDeductionUsd: qbiDeduction,
              amtUsd: amtOwed,
              creditsUsd,
              totalTaxBeforeFtcUsd: totalTaxBeforeFtc,
              deductionUsd: deduction,
              deductionMode: usedMode,
              // Added for XBR-2 (ftc-nodes.js wiring) — mirrors the same four
              // fields computeUsTax's own result carries for computeFtc's benefit:
              // totalIncomeUsd (engine L1046), usSourceIncomeUsd (= inc.usSourceTotal
              // .usd, engine L1101), the FEIE amount actually applied (engine's
              // usTax.feie.appliedUsd, flat here), and the worldwide flag.
              totalIncomeUsd: totalIncome,
              usSourceIncomeUsd: inc.usSourceTotal.usd,
              feieAppliedUsd,
              worldwide,
              // Added for CFL-7 (buildFtcReport's trace detail) — the ordinary/
              // preferential split computeUsTax's own result carries (engine
              // L289: incomeTax = ordinaryTax + preferentialTax) but this node
              // didn't expose separately until now; incomeTaxUsd above remains
              // their sum, unchanged.
              ordinaryTaxUsd: ordinaryTax,
              preferentialTaxUsd: preferentialTax,
              // Added for CFL-7 (buildTaxComputation) — every one of these is
              // already computed above as a local variable; this just exposes
              // them, matching the real computeUsTax's own return shape exactly
              // (computation.js:1043-1116) field-for-field. No new logic.
              filingStatus: status,
              ordinaryIncomeUsd: ordinaryIncome,
              preferentialIncomeUsd: preferentialIncome,
              saltCapUsd,
              socialSecurityDetail: {
                grossUsd: grossSsUsd,
                taxableUsd: taxableSsUsd,
                taxablePct: grossSsUsd > 0 ? taxableSsUsd / grossSsUsd : 0,
                provisionalIncomeUsd: ordinaryIncomeExclSs + preferentialIncome + 0.5 * grossSsUsd + taxExemptInterestUsd,
                baseThresholdUsd: T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single,
                additionalThresholdUsd: T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single
              },
              seniorDeductionUsd,
              seniorDetail: { age: taxpayerAge, isSenior, fullAmountUsd: T.SENIOR_DEDUCTION_PER_PERSON_USD, phaseoutThresholdUsd: seniorPhaseoutThr },
              tipsDeductionUsd,
              overtimeDeductionUsd,
              tipsOvertimeDetail: {
                isMfs,
                qualifiedTipsUsd,
                qualifiedOvertimeUsd,
                tipsMaxUsd: T.TIPS_DEDUCTION_MAX_USD,
                overtimeMaxUsd,
                phaseoutThresholdUsd: tipsOtPhaseoutThr,
                phaseoutReductionUsd: tipsOtPhaseoutReduction
              },
              ordinaryTaxableUsd: ordTaxable,
              ordinaryBracketBreakdown,
              amtDetail: {
                amtiUsd,
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
              otherCreditsUsd,
              ctcDetail: {
                numChildren: numChildrenForCtc,
                maxTotalUsd: ctcMaxTotalUsd,
                phaseoutReductionUsd: ctcPhaseoutReductionUsd,
                availableUsd: ctcAvailableUsd,
                nonRefundableUsd: ctcNonRefundableUsd,
                refundableUsd: ctcRefundableUsd,
                earnedIncomeUsd
              },
              foreignSourceIncomeUsd: fW + fSE + fI + fD + fR + fP + fStcg + fLtcg,
              retirementEpfInterestUsd: worldwide ? inc.retirementEpfInterestUsd || 0 : 0,
              retirementNpsWithdrawalUsd: worldwide ? inc.retirementNpsWithdrawalUsd || 0 : 0,
              niitDetail: {
                netInvestmentIncomeUsd: netInvestmentIncome,
                magiUsd: magi,
                thresholdUsd: niitThreshold,
                excessUsd: Math.max(0, Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold))),
                rate: T.NIIT_RATE
              },
              feie: {
                claimed: feie.claimed,
                eligible: feie.eligible,
                taxHomeAbroad: feie.taxHomeAbroad,
                testMet: feie.testMet,
                reasons: feie.reasons,
                appliedUsd: feieAppliedUsd
              },
              effectiveRate: totalIncome > 0 ? totalTaxBeforeFtc / totalIncome : 0
            };
          }
        },
        totalTaxBeforeFtcUsd: { deps: ["usTaxResult"], compute: function(d) {
          return d.usTaxResult.totalTaxBeforeFtcUsd;
        } }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/us-full-nodes.js
  var require_us_full_nodes = __commonJS({
    "prototypes/graph-pilot/us-full-nodes.js"(exports, module) {
      "use strict";
      var incomeNodes = require_aggregateusincome_nodes().NODES;
      var taxNodes = require_ustax_nodes().NODES;
      var residencyNodes = require_residency_nodes().NODES;
      var OVERRIDDEN_BOUNDARY_IDS = ["incUs", "worldwideUs"];
      var NODES = {};
      [incomeNodes, taxNodes, residencyNodes].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
          if (NODES[k] && OVERRIDDEN_BOUNDARY_IDS.indexOf(k) === -1) {
            throw new Error("Unexpected node name collision on merge: '" + k + "' \u2014 resolve before combining.");
          }
          NODES[k] = src[k];
        });
      });
      NODES.incUs = { deps: ["aggregateUsIncomeResult"], compute: function(d) {
        return d.aggregateUsIncomeResult;
      } };
      NODES.worldwideUs = { deps: ["residencyResult"], compute: function(d) {
        return d.residencyResult.us.worldwide;
      } };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/ftc-nodes.js
  var require_ftc_nodes = __commonJS({
    "prototypes/graph-pilot/ftc-nodes.js"(exports, module) {
      "use strict";
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var NODES = {
        // ---- boundaries: the real engine's outputs, standalone-verifiable ------
        feieExcludedUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          var u = ctx.computed.usTax;
          return u.feie && u.feie.appliedUsd || 0;
        } },
        usIsNraBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return !!ctx.computed.usTax.isNra;
        } },
        hasUsScopeBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.model.meta.hasUsScope !== false;
        } },
        indiaIncomeTotalUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.model.income.india.total.usd;
        } },
        usTaxableIncomeUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.computed.usTax.taxableIncomeUsd;
        } },
        usIncomeTaxUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.computed.usTax.incomeTaxUsd;
        } },
        usTotalIncomeUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.computed.usTax.totalIncomeUsd;
        } },
        usSourceIncomeUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.computed.usTax.usSourceIncomeUsd;
        } },
        indiaTotalTaxUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.computed.indiaTax.totalTaxUsd;
        } },
        indiaTotalIncomeUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.computed.indiaTax.totalIncomeUsd;
        } },
        indiaWorldwideBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return !!ctx.computed.residency.india.worldwide;
        } },
        usSourceTotalUsdBoundaryFtc: { deps: [], compute: function(d, ctx) {
          return ctx.model.income.us.usSourceTotal.usd;
        } },
        // ---- Direction 1: US Form 1116 — credit for Indian taxes ---------------
        ftcUsDirection: {
          deps: [
            "feieExcludedUsdBoundaryFtc",
            "usIsNraBoundaryFtc",
            "hasUsScopeBoundaryFtc",
            "indiaIncomeTotalUsdBoundaryFtc",
            "usTaxableIncomeUsdBoundaryFtc",
            "usIncomeTaxUsdBoundaryFtc",
            "indiaTotalTaxUsdBoundaryFtc"
          ],
          compute: function(d) {
            var feieExcludedUsd = d.feieExcludedUsdBoundaryFtc;
            var zeroed = d.usIsNraBoundaryFtc || !d.hasUsScopeBoundaryFtc;
            var foreignSrcGrossUsd = zeroed ? 0 : d.indiaIncomeTotalUsdBoundaryFtc;
            var foreignSrcUsd = Math.max(0, foreignSrcGrossUsd - feieExcludedUsd);
            var creditableFraction = zeroed ? 0 : foreignSrcGrossUsd > 0 ? foreignSrcUsd / foreignSrcGrossUsd : 1;
            var usTaxableUsd = d.usTaxableIncomeUsdBoundaryFtc;
            var usIncomeTaxUsd = d.usIncomeTaxUsdBoundaryFtc;
            var indiaTaxPaidGrossUsd = d.indiaTotalTaxUsdBoundaryFtc;
            var indiaTaxPaidUsd = indiaTaxPaidGrossUsd * creditableFraction;
            var indiaTaxDisallowedUsd = indiaTaxPaidGrossUsd - indiaTaxPaidUsd;
            var usLimitFraction = usTaxableUsd > 0 ? Math.min(1, foreignSrcUsd / usTaxableUsd) : 0;
            var usFtcLimit = usIncomeTaxUsd * usLimitFraction;
            var usFtcAllowed = Math.min(indiaTaxPaidUsd, usFtcLimit);
            var usCarryover = Math.max(0, indiaTaxPaidUsd - usFtcAllowed);
            return {
              foreignSourceIncomeUsd: foreignSrcUsd,
              feieExcludedUsd,
              indiaTaxDisallowedUsd,
              taxableIncomeUsd: usTaxableUsd,
              usIncomeTaxUsd,
              indiaTaxPaidUsd,
              limitFraction: usLimitFraction,
              ftcLimitUsd: usFtcLimit,
              ftcAllowedUsd: usFtcAllowed,
              carryoverUsd: usCarryover,
              residualDoubleTaxUsd: usCarryover
            };
          }
        },
        // ---- Direction 2: India §159 relief — credit for US taxes --------------
        ftcIndiaDirection: {
          deps: [
            "indiaWorldwideBoundaryFtc",
            "usSourceTotalUsdBoundaryFtc",
            "indiaTotalIncomeUsdBoundaryFtc",
            "indiaTotalTaxUsdBoundaryFtc",
            "usTotalIncomeUsdBoundaryFtc",
            "usIncomeTaxUsdBoundaryFtc",
            "usSourceIncomeUsdBoundaryFtc"
          ],
          compute: function(d) {
            var foreignSrcIndiaUsd = d.indiaWorldwideBoundaryFtc ? d.usSourceTotalUsdBoundaryFtc : 0;
            var indiaTotalIncomeUsd = d.indiaTotalIncomeUsdBoundaryFtc;
            var indiaTaxOnForeignUsd = indiaTotalIncomeUsd > 0 ? d.indiaTotalTaxUsdBoundaryFtc * Math.min(1, foreignSrcIndiaUsd / indiaTotalIncomeUsd) : 0;
            var usTaxOnUsSourceUsd = d.usTotalIncomeUsdBoundaryFtc > 0 ? d.usIncomeTaxUsdBoundaryFtc * Math.min(1, d.usSourceIncomeUsdBoundaryFtc / d.usTotalIncomeUsdBoundaryFtc) : 0;
            var indiaReliefAllowed = Math.min(usTaxOnUsSourceUsd, indiaTaxOnForeignUsd);
            return {
              foreignSourceIncomeUsd: foreignSrcIndiaUsd,
              usTaxOnUsSourceUsd,
              reliefCapUsd: indiaTaxOnForeignUsd,
              reliefAllowedUsd: indiaReliefAllowed
            };
          }
        },
        ftcResult: {
          deps: ["ftcUsDirection", "ftcIndiaDirection"],
          compute: function(d) {
            var usResidual = d.ftcUsDirection.carryoverUsd;
            var indiaResidual = Math.max(0, Math.min(d.ftcIndiaDirection.usTaxOnUsSourceUsd, d.ftcIndiaDirection.reliefCapUsd) - d.ftcIndiaDirection.reliefAllowedUsd);
            return {
              us: d.ftcUsDirection,
              india: d.ftcIndiaDirection,
              netUnrelievedDoubleTaxUsd: usResidual + indiaResidual
            };
          }
        }
      };
      module.exports = { NODES, num };
    }
  });

  // prototypes/graph-pilot/xborder-full-nodes.js
  var require_xborder_full_nodes = __commonJS({
    "prototypes/graph-pilot/xborder-full-nodes.js"(exports, module) {
      "use strict";
      var indiaFullNodes = require_india_full_nodes().NODES;
      var usFullNodes = require_us_full_nodes().NODES;
      var ftcNodes = require_ftc_nodes().NODES;
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      var fxRate = require_fx_util().fxRate;
      var OVERRIDDEN_BOUNDARY_IDS = [
        "feieExcludedUsdBoundaryFtc",
        "usIsNraBoundaryFtc",
        "hasUsScopeBoundaryFtc",
        "indiaIncomeTotalUsdBoundaryFtc",
        "usTaxableIncomeUsdBoundaryFtc",
        "usIncomeTaxUsdBoundaryFtc",
        "usTotalIncomeUsdBoundaryFtc",
        "usSourceIncomeUsdBoundaryFtc",
        "indiaTotalTaxUsdBoundaryFtc",
        "indiaTotalIncomeUsdBoundaryFtc",
        "indiaWorldwideBoundaryFtc",
        "usSourceTotalUsdBoundaryFtc"
      ];
      var NODES = {};
      [indiaFullNodes, usFullNodes, ftcNodes].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
          if (NODES[k] && OVERRIDDEN_BOUNDARY_IDS.indexOf(k) === -1) {
            throw new Error("Unexpected node name collision on merge: '" + k + "' \u2014 resolve before combining.");
          }
          NODES[k] = src[k];
        });
      });
      NODES.routerJurisdictionXB = { deps: [], compute: function(d, ctx) {
        return safe(ctx.router, "jurisdiction", null);
      } };
      NODES.routerUsSignalXB = {
        deps: [],
        compute: function(d, ctx) {
          return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true || safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
        }
      };
      NODES.hasUsScopeBoundaryFtc = {
        deps: ["routerJurisdictionXB", "routerUsSignalXB"],
        // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
        // values (docs/DAG_MIGRATION_TRACKER.md — the router.html rebuild),
        // additive synonyms for "single_india"/"single_us" — the 12 demo profiles
        // and the fuzzer only ever produce the original strings, unaffected.
        compute: function(d) {
          return d.routerJurisdictionXB === "single_india" || d.routerJurisdictionXB === "india_only" ? false : d.routerJurisdictionXB === "single_us" || d.routerJurisdictionXB === "us_only" ? true : d.routerUsSignalXB;
        }
      };
      NODES.feieExcludedUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function(d) {
        return d.usTaxResult.feieAppliedUsd || 0;
      } };
      NODES.usIsNraBoundaryFtc = {
        deps: ["usEntityKind", "files1040nr", "s6013hElection"],
        compute: function(d) {
          return ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.files1040nr && !d.s6013hElection;
        }
      };
      NODES.indiaIncomeTotalUsdBoundaryFtc = { deps: ["totalIndiaIncomeInr"], compute: function(d, ctx) {
        return d.totalIndiaIncomeInr / fxRate(ctx);
      } };
      NODES.usTaxableIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function(d) {
        return d.usTaxResult.taxableIncomeUsd;
      } };
      NODES.usIncomeTaxUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function(d) {
        return d.usTaxResult.incomeTaxUsd;
      } };
      NODES.usTotalIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function(d) {
        return d.usTaxResult.totalIncomeUsd;
      } };
      NODES.usSourceIncomeUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function(d) {
        return d.usTaxResult.usSourceIncomeUsd;
      } };
      NODES.indiaTotalTaxUsdBoundaryFtc = { deps: ["totalTaxInrCombined"], compute: function(d, ctx) {
        return d.totalTaxInrCombined / fxRate(ctx);
      } };
      NODES.indiaTotalIncomeUsdBoundaryFtc = {
        deps: ["isEntityTaxpayer", "totalIncomeInrV3", "entityTaxableInrBoundary"],
        compute: function(d, ctx) {
          return (d.isEntityTaxpayer ? d.entityTaxableInrBoundary : d.totalIncomeInrV3) / fxRate(ctx);
        }
      };
      NODES.indiaWorldwideBoundaryFtc = { deps: ["residencyResult"], compute: function(d) {
        return !!d.residencyResult.india.worldwide;
      } };
      NODES.usSourceTotalUsdBoundaryFtc = { deps: ["usTaxResult"], compute: function(d) {
        return d.usTaxResult.usSourceIncomeUsd;
      } };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/doubletax-nodes.js
  var require_doubletax_nodes = __commonJS({
    "prototypes/graph-pilot/doubletax-nodes.js"(exports, module) {
      "use strict";
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(inr, ctx) {
        return Number(inr) / fxRate(ctx);
      }
      var xborderFullNodes = require_xborder_full_nodes().NODES;
      var NODES = {};
      Object.keys(xborderFullNodes).forEach(function(k) {
        NODES[k] = xborderFullNodes[k];
      });
      NODES.indiaCapitalGainsInrXbr3 = {
        deps: ["capitalGainsComputation"],
        compute: function(d) {
          return d.capitalGainsComputation.stcgInr + d.capitalGainsComputation.ltcgInr + d.capitalGainsComputation.ltcg197Inr;
        }
      };
      NODES.mapDoubleTaxedIncomeResult = {
        deps: [
          "salaryInr",
          "businessComputation",
          "housePropertyInr",
          "interestInr",
          "dividendInr",
          "indiaCapitalGainsInrXbr3",
          "aggregateUsIncomeResult",
          "residencyResult"
        ],
        compute: function(d, ctx) {
          var items = [];
          var usWorldwide = d.residencyResult.us.worldwide;
          var us = d.aggregateUsIncomeResult;
          function pair(label, indiaInr, usMoney, note) {
            var indiaUsd = inrToUsd(indiaInr, ctx);
            var usUsd = usMoney ? usMoney.usd : 0;
            var inExposed = indiaUsd > 0;
            var usExposed = usUsd > 0;
            var doublyTaxed = inExposed && (usWorldwide || usExposed);
            if (inExposed || usExposed) {
              items.push({ label, indiaUsd, usUsd, doublyTaxed, note: note || "" });
            }
          }
          pair(
            "Salary / Wages (India-source)",
            d.salaryInr,
            us.foreignWages,
            "Indian employment income is foreign-source for the US; creditable via Form 1116 general basket."
          );
          pair(
            "Business / Professional income",
            d.businessComputation.businessInr,
            us.foreignSelfEmployment,
            "Indian business profits may also flow through GILTI/Subpart F if held via a corp (Form 5471)."
          );
          pair(
            "House property / Rental (India)",
            d.housePropertyInr,
            us.foreignRental,
            "Indian rent: net-of-expense basis differs (IN 30% standard deduction vs US actual + depreciation)."
          );
          pair(
            "Interest income",
            d.interestInr,
            us.foreignInterest,
            "Passive basket for US FTC; India taxes at slab rate."
          );
          pair(
            "Dividend income",
            d.dividendInr,
            us.foreignDividends,
            "Indian dividends taxable in shareholder's hands; US qualified-dividend rate may differ."
          );
          pair(
            "Capital gains",
            d.indiaCapitalGainsInrXbr3,
            us.foreignCapitalGains,
            "STCG/LTCG holding-period and rate definitions differ between IN and US."
          );
          var totalDoublyTaxedUsd = items.reduce(function(s, it) {
            return s + (it.doublyTaxed ? Math.max(it.indiaUsd, it.usUsd) : 0);
          }, 0);
          return { items, totalDoublyTaxedUsd };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/crossbasis-nodes.js
  var require_crossbasis_nodes = __commonJS({
    "prototypes/graph-pilot/crossbasis-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(inr, ctx) {
        return Number(inr) / fxRate(ctx);
      }
      var doubleTaxNodes = require_doubletax_nodes().NODES;
      var NODES = {};
      Object.keys(doubleTaxNodes).forEach(function(k) {
        NODES[k] = doubleTaxNodes[k];
      });
      NODES.usOwns10PctForeignCorpRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "foreign_entities.owns_10_percent_foreign_corp", false) === true;
      } };
      NODES.usForeignCorpsRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "foreign_entities.foreign_corporations", []) || [];
      } };
      NODES.viaForeignCorpXbr4 = {
        deps: ["usOwns10PctForeignCorpRaw", "usForeignCorpsRaw"],
        compute: function(d) {
          return d.usOwns10PctForeignCorpRaw || d.usForeignCorpsRaw.length > 0;
        }
      };
      NODES.crossBasisResult = {
        deps: [
          "usTaxResult",
          "residencyResult",
          "viaForeignCorpXbr4",
          "taxRegime",
          "salaryInr",
          "businessComputation",
          "housePropertyInr",
          "interestInr",
          "dividendInr",
          "indiaCapitalGainsInrXbr3",
          "aggregateUsIncomeResult"
        ],
        compute: function(d, ctx) {
          function usd(n) {
            return "$" + Math.round(n).toLocaleString("en-US");
          }
          var rows = [];
          var feieApplied = d.usTaxResult.feieAppliedUsd || 0;
          var usWW = d.residencyResult.us.worldwide, inWW = d.residencyResult.india.worldwide;
          var viaForeignCorp = d.viaForeignCorpXbr4;
          var stdDedInr = d.taxRegime === "OLD" ? 5e4 : 75e3;
          var stdDedUsd = stdDedInr / fxRate(ctx);
          var stdDedLabel = "\u20B9" + stdDedInr.toLocaleString("en-IN");
          function row(o) {
            o.indiaLawUsd = Math.round(o.indiaLawUsd || 0);
            o.usLawUsd = Math.round(o.usLawUsd || 0);
            o.doublyTaxed = o.indiaLawUsd > 0 && o.usLawUsd > 0;
            o.overlapUsd = o.doublyTaxed ? Math.min(o.indiaLawUsd, o.usLawUsd) : 0;
            rows.push(o);
          }
          var salaryUsd = inrToUsd(d.salaryInr, ctx);
          var businessUsd = inrToUsd(d.businessComputation.businessInr, ctx);
          var housePropertyUsd = inrToUsd(d.housePropertyInr, ctx);
          var interestUsd = inrToUsd(d.interestInr, ctx);
          var dividendUsd = inrToUsd(d.dividendInr, ctx);
          var capitalGainsUsd = inrToUsd(d.indiaCapitalGainsInrXbr3, ctx);
          var us = d.aggregateUsIncomeResult;
          if (usWW) {
            if (salaryUsd > 0) {
              var grossWage = salaryUsd + stdDedUsd;
              row({
                head: "salary",
                label: "Salary / Wages",
                dir: "IN\u2192US",
                source: "India",
                indiaLawUsd: salaryUsd,
                usLawUsd: Math.max(0, grossWage - feieApplied),
                indiaRule: "Net of " + stdDedLabel + " std deduction \xB7 slab \u2264 30%",
                usRule: (feieApplied > 0 ? "Gross less FEIE " + usd(feieApplied) : "Gross wage; no std deduction") + " \xB7 brackets \u2264 37%"
              });
            }
            if (businessUsd > 0) {
              if (viaForeignCorp) {
                row({
                  head: "business",
                  label: "Business / Professional",
                  dir: "IN\u2192US",
                  source: "India",
                  indiaLawUsd: businessUsd,
                  usLawUsd: 0,
                  indiaRule: "PGBP net \xB7 Indian depreciation",
                  usRule: "Held via Indian company \u2192 not personal income; taxed via CFC/GILTI (Form 5471)",
                  note: "See the Form 5471 finding."
                });
              } else {
                row({
                  head: "business",
                  label: "Business / Professional",
                  dir: "IN\u2192US",
                  source: "India",
                  indiaLawUsd: businessUsd,
                  usLawUsd: businessUsd,
                  estimate: true,
                  indiaRule: "PGBP net \xB7 Indian depreciation",
                  usRule: "Schedule C net \xB7 US depreciation (MACRS)",
                  note: "US net approximated at Indian net \u2014 diverges with US depreciation schedule."
                });
              }
            }
            if (housePropertyUsd > 0) {
              var nav = housePropertyUsd;
              row({
                head: "rental",
                label: "House property / Rental",
                dir: "IN\u2192US",
                source: "India",
                indiaLawUsd: nav * 0.7,
                usLawUsd: nav * 0.55,
                estimate: true,
                indiaRule: "NAV less 30% std deduction (s.24a)",
                usRule: "Gross less actual expenses + straight-line depreciation (27.5y)",
                note: "US net is planning-grade \u2014 refine with the property's depreciable basis."
              });
            }
            if (interestUsd > 0) row({
              head: "interest",
              label: "Interest",
              dir: "IN\u2192US",
              source: "India",
              indiaLawUsd: interestUsd,
              usLawUsd: interestUsd,
              sameBase: true,
              indiaRule: "Slab \u2264 30%",
              usRule: "Ordinary \u2264 37% (passive FTC basket)"
            });
            if (dividendUsd > 0) row({
              head: "dividend",
              label: "Dividend",
              dir: "IN\u2192US",
              source: "India",
              indiaLawUsd: dividendUsd,
              usLawUsd: dividendUsd,
              sameBase: true,
              indiaRule: "Slab \u2264 30%",
              usRule: "Qualified 15\u201320% if treaty + holding, else ordinary"
            });
            if (capitalGainsUsd > 0) row({
              head: "capgains",
              label: "Capital gains",
              dir: "IN\u2192US",
              source: "India",
              indiaLawUsd: capitalGainsUsd,
              usLawUsd: capitalGainsUsd,
              sameBase: true,
              estimate: true,
              indiaRule: "LTCG 12.5% / STCG slab \xB7 Indian holding periods",
              usRule: "LTCG 0/15/20% (>1y) / STCG ordinary \xB7 USD cost basis",
              note: "Same gain; the US recomputes on USD cost basis + acquisition-date FX (Rule 115)."
            });
          }
          if (inWW) {
            if (us.wages.usd > 0) row({
              head: "us_salary",
              label: "US Salary / Wages",
              dir: "US\u2192IN",
              source: "US",
              indiaLawUsd: Math.max(0, us.wages.usd - stdDedUsd),
              usLawUsd: us.wages.usd,
              indiaRule: "Less " + stdDedLabel + " std deduction \xB7 slab \u2264 30%",
              usRule: "Gross wage \xB7 brackets \u2264 37%"
            });
            if (us.rentalUs.usd > 0) row({
              head: "us_rental",
              label: "US House property / Rental",
              dir: "US\u2192IN",
              source: "US",
              indiaLawUsd: us.rentalUs.usd * 1.15,
              usLawUsd: us.rentalUs.usd,
              estimate: true,
              indiaRule: "NAV less 30% only \u2014 US depreciation added back",
              usRule: "Net after expenses + depreciation",
              note: "India disallows US depreciation and grants only the 30% deduction, so its base is higher."
            });
            if (us.interestUs.usd > 0) row({
              head: "us_interest",
              label: "US Interest",
              dir: "US\u2192IN",
              source: "US",
              indiaLawUsd: us.interestUs.usd,
              usLawUsd: us.interestUs.usd,
              sameBase: true,
              indiaRule: "Slab \u2264 30%",
              usRule: "Ordinary \u2264 37%"
            });
            if (us.ordinaryDividendsUs.usd > 0) row({
              head: "us_dividend",
              label: "US Dividend",
              dir: "US\u2192IN",
              source: "US",
              indiaLawUsd: us.ordinaryDividendsUs.usd,
              usLawUsd: us.ordinaryDividendsUs.usd,
              sameBase: true,
              indiaRule: "Slab \u2264 30%",
              usRule: "Qualified 15\u201320% / ordinary"
            });
            if (us.capitalGainsUs.usd > 0) row({
              head: "us_capgains",
              label: "US Capital gains",
              dir: "US\u2192IN",
              source: "US",
              indiaLawUsd: us.capitalGainsUs.usd,
              usLawUsd: us.capitalGainsUs.usd,
              sameBase: true,
              estimate: true,
              indiaRule: "STCG slab / LTCG per Indian buckets",
              usRule: "LTCG 0/15/20% / STCG ordinary"
            });
          }
          var overlapUsd = rows.reduce(function(s, r) {
            return s + r.overlapUsd;
          }, 0);
          var anyEstimate = rows.some(function(r) {
            return r.estimate;
          });
          return { rows, overlapUsd, feieAppliedUsd: feieApplied, anyEstimate };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/findings-nodes.js
  var require_findings_nodes = __commonJS({
    "prototypes/graph-pilot/findings-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
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
      var crossBasisNodes = require_crossbasis_nodes().NODES;
      var NODES = {};
      Object.keys(crossBasisNodes).forEach(function(k) {
        NODES[k] = crossBasisNodes[k];
      });
      NODES.panAadhaarLinkedRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "profile.pan_aadhaar_linked", null);
      } };
      NODES.tieBreakHomeRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "dtaa.tb_home", null);
      } };
      NODES.tieBreakCviRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "dtaa.tb_cvi", null);
      } };
      NODES.tieBreakAbodeRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "dtaa.tb_abode", null);
      } };
      NODES.tieBreakNationalityRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "dtaa.tb_nationality", null);
      } };
      NODES.usFtcFormXbr = { deps: ["usEntityKind"], compute: function(d) {
        return d.usEntityKind === "ccorp" ? "Form 1118" : "Form 1116";
      } };
      NODES.hasIndiaScopeXbr = { deps: ["routerJurisdictionXB"], compute: function(d) {
        return d.routerJurisdictionXB !== "single_us" && d.routerJurisdictionXB !== "us_only";
      } };
      NODES.findingsBatch1Result = {
        deps: [
          "panAadhaarLinkedRaw",
          "usTaxResult",
          "indiaIsCompany",
          "indiaIsIndianCompanyRaw",
          "residencyResult",
          "companyBoardOutsideIndiaRaw",
          "companyKeyManagementLocationRaw",
          "companyDirectorsInIndiaRaw",
          "companyDirectorsOutsideIndiaRaw",
          "ftcResult",
          "hasIndiaScopeXbr",
          "hasUsScopeBoundaryFtc",
          "usFtcFormXbr",
          "tieBreakHomeRaw",
          "tieBreakCviRaw",
          "tieBreakAbodeRaw",
          "tieBreakNationalityRaw",
          "treatyIndiaResidenceRaw",
          "treatyUsResidenceRaw",
          "usIsCitizenRaw",
          "usHasGreenCardRaw",
          "mapDoubleTaxedIncomeResult"
        ],
        compute: function(d) {
          var findings = [];
          function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
            findings.push({ id, severity, category, title, detail, recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
          }
          if (d.panAadhaarLinkedRaw === false) {
            add(
              "pan_not_linked_aadhaar",
              "critical",
              "document",
              "PAN not linked to Aadhaar \u2014 PAN is inoperative, higher TDS/TCS applies",
              "Layer 1 records the PAN as NOT linked to Aadhaar. Under Rule 114AAA an unlinked PAN is treated as inoperative \u2014 every payer must withhold TDS/TCS at the higher default rate u/s 397(2) (generally 20%, or double the normal TCS rate, whichever is higher) as if no PAN had been furnished at all, REGARDLESS of any lower slab, special, or DTAA treaty rate that would otherwise apply \u2014 including the treaty elections above, if any. Refunds are also withheld while the PAN remains inoperative, and interest keeps accruing for that period.",
              "Link PAN to Aadhaar (paying the applicable late fee) before relying on any withholding-rate, refund, or treaty-election figure on this page \u2014 every number computed here assumes a valid, operative PAN.",
              0,
              ["s.397(2)", "Rule 114AAA", "PAN inoperative"]
            );
          }
          var ftc = d.ftcResult;
          if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.netUnrelievedDoubleTaxUsd > 1) {
            add(
              "ftc_gap",
              "critical",
              "credit",
              "Foreign Tax Credit shortfall \u2014 residual double taxation",
              "Indian tax paid (" + usd(ftc.us.indiaTaxPaidUsd) + ") exceeds the US FTC limitation (" + usd(ftc.us.ftcLimitUsd) + ") for this year. " + usd(ftc.us.residualDoubleTaxUsd) + " of Indian tax cannot be credited currently and would otherwise be double-taxed.",
              usd(ftc.us.carryoverUsd) + " is eligible to carry over under \xA7904(c) (back 1 year / forward 10), but WISING is a single-year snapshot \u2014 it does NOT persist this carryover across tax years or track it for you. Record " + usd(ftc.us.carryoverUsd) + " on " + d.usFtcFormXbr + " Schedule B this year, and re-enter it as prior-year carryover when you run next year's numbers. Also check whether treaty re-sourcing (Art. 25) could reclassify some income to lift the limitation \u2014 WISING does not test this automatically.",
              ftc.us.residualDoubleTaxUsd,
              [d.usFtcFormXbr, "\xA7904(c)"]
            );
          } else if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && ftc.us.indiaTaxPaidUsd > 0 && ftc.us.ftcAllowedUsd > 0) {
            add(
              "ftc_available",
              "info",
              "credit",
              "Foreign Tax Credit available and within limit",
              "Indian tax of " + usd(ftc.us.indiaTaxPaidUsd) + " is fully creditable against US tax this year (" + usd(ftc.us.ftcAllowedUsd) + " within a " + usd(ftc.us.ftcLimitUsd) + " limitation).",
              "Claim on " + d.usFtcFormXbr + " (US) and file Form 44 (India) before the ITR due date to preserve symmetric relief.",
              ftc.us.ftcAllowedUsd,
              [d.usFtcFormXbr, "Form 44"]
            );
          }
          if (d.usTaxResult.amtUsd > 0) {
            add(
              "amt_applies",
              "warning",
              "credit",
              "US Alternative Minimum Tax applies (+" + usd(d.usTaxResult.amtUsd) + ")",
              "This is a US-only tax (IRC \xA755) \u2014 India has no AMT-equivalent regime. The US tentative minimum tax exceeds the regular US tax, so an additional " + usd(d.usTaxResult.amtUsd) + " is added to the US liability. Common drivers: a large standard-deduction / SALT add-back, private-activity-bond interest, or an ISO exercise.",
              "WISING computes the parallel AMT (Form 6251) and includes it in the US tax total above. Review ISO exercise timing and the state-tax add-back; AMT paid on deferral items can generate a Minimum Tax Credit (Form 8801) usable in later years.",
              d.usTaxResult.amtUsd,
              ["\xA755", "Form 6251", "Form 8801"]
            );
          }
          if (d.indiaIsCompany && d.indiaIsIndianCompanyRaw === false && d.residencyResult.india.status === "ROR") {
            var poemFactors = [];
            if (d.companyBoardOutsideIndiaRaw) poemFactors.push("board meets primarily outside India");
            if (d.companyKeyManagementLocationRaw) poemFactors.push("key management location: " + d.companyKeyManagementLocationRaw);
            if (d.companyDirectorsInIndiaRaw || d.companyDirectorsOutsideIndiaRaw) poemFactors.push(d.companyDirectorsInIndiaRaw + " director(s) in India vs " + d.companyDirectorsOutsideIndiaRaw + " outside");
            add(
              "entity_dual_residency_poem",
              "warning",
              "treaty",
              "Foreign-incorporated company with POEM in India \u2014 entity-level dual residency",
              "This company is on file as NOT incorporated in India, yet its Place of Effective Management facts" + (poemFactors.length ? " (" + poemFactors.join("; ") + ")" : "") + " resolve it to an Indian tax resident (worldwide income in scope) under s.6(3). Being incorporated elsewhere means it doesn't stop being resident there either (most countries, including the US, use place-of-incorporation as their own company-residency test) \u2014 so this entity is very likely resident in BOTH countries at once, with no individual-style Article 4 hierarchy to mechanically resolve it.",
              "Confirm the other country's own company-residency test independently (place of incorporation alone is often sufficient there) \u2014 if it also claims residency, this needs the treaty's company tie-breaker (competent-authority mutual agreement under Article 4(3)), not a self-service test. Revisit the POEM facts too: 'mostly outside India' board meetings alone isn't dispositive if commercial decisions are substantively made elsewhere.",
              0,
              ["DTAA Art. 4(3)", "s.6(3)", "POEM", "Mutual Agreement Procedure"]
            );
          }
          var res = d.residencyResult;
          if (res.dualResident) {
            var tbWinner = d.treatyIndiaResidenceRaw !== "none" ? d.treatyIndiaResidenceRaw : d.treatyUsResidenceRaw !== "none" ? d.treatyUsResidenceRaw : null;
            var usTag = res.us.isCitizen ? "citizen" : d.usHasGreenCardRaw ? "green card" : "SPT met";
            var tb = describeTieBreak({ tieBreakHome: d.tieBreakHomeRaw, tieBreakCvi: d.tieBreakCviRaw, tieBreakAbode: d.tieBreakAbodeRaw, tieBreakNationality: d.tieBreakNationalityRaw });
            if (!tbWinner) {
              if (tb && tb.mapRequired) {
                add(
                  "dual_residency",
                  "critical",
                  "treaty",
                  "Dual tax residency \u2014 Article 4(3) Mutual Agreement Procedure required",
                  "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag + "). The Layer 1 tie-breaker wizard was completed through all four tests \u2014 permanent home, centre of vital interests, habitual abode, and nationality \u2014 and " + tb.reason + ". Article 4(3) hands this to the competent authorities (CBDT and the IRS) for a Mutual Agreement Procedure; it cannot be self-resolved.",
                  "File a MAP request (competent authority assistance) with the IRS and/or CBDT rather than re-running the wizard \u2014 the mechanical tie-breaker has already been exhausted. Both countries continue asserting worldwide taxing rights and only partial FTC relief is available until MAP concludes.",
                  d.mapDoubleTaxedIncomeResult.totalDoublyTaxedUsd,
                  ["DTAA Art. 4(3)", "MAP", "Form 8833", "TRC", "Form 41"]
                );
              } else {
                add(
                  "dual_residency",
                  "critical",
                  "treaty",
                  "Dual tax residency \u2014 Article 4 tie-breaker not yet run",
                  "The taxpayer is resident in BOTH India (" + (res.india.status || "resident") + ") and the US (" + usTag + ") for an overlapping period, and the Layer 1 Article 4 tie-breaker has not been completed. Until it is, both countries assert worldwide taxing rights and only partial FTC relief is available.",
                  "Complete the Layer 1 tie-breaker wizard (permanent home \u2192 centre of vital interests \u2192 habitual abode \u2192 nationality). WISING will then flag Form 8833 (US) and the TRC / Form 41 requirement (India) on the filing checklist for the loser side \u2014 actually preparing and filing those remains a manual step.",
                  d.mapDoubleTaxedIncomeResult.totalDoublyTaxedUsd,
                  ["DTAA Art. 4", "Form 8833", "TRC", "Form 41"]
                );
              }
            } else {
              add(
                "dual_residency_resolved",
                "info",
                "treaty",
                "Dual residency resolved under DTAA Article 4 \u2192 " + String(tbWinner).toUpperCase(),
                "Both India and the US met residency, and the Layer 1 Article 4 tie-breaker resolves treaty residence to " + String(tbWinner).toUpperCase() + " for the overlapping period" + (tb ? " (" + tb.article + ": " + tb.reason + ")" : "") + ". WISING has applied this to the tax and FTC computation below; the loser jurisdiction is taxed on a source basis.",
                "Keep " + (tbWinner === "india" ? "TRC + Form 41 (India) and Form 8833 (US)" : "Form 8833 (US) and TRC + Form 41 (India)") + " on file to support the position.",
                0,
                ["DTAA Art. 4", tbWinner === "india" ? "Form 41" : "Form 8833"]
              );
            }
          }
          return findings;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/findings-batch2-nodes.js
  var require_findings_batch2_nodes = __commonJS({
    "prototypes/graph-pilot/findings-batch2-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      function inr(n) {
        return "\u20B9" + Math.round(n).toLocaleString("en-IN");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      var itrformNodes = require_itrform_nodes().NODES;
      var findingsNodes = require_findings_nodes().NODES;
      var NODES = {};
      Object.keys(itrformNodes).forEach(function(k) {
        NODES[k] = itrformNodes[k];
      });
      Object.keys(findingsNodes).forEach(function(k) {
        if (NODES[k] && NODES[k] !== findingsNodes[k]) throw new Error("true collision merging findings-nodes.js: " + k);
        NODES[k] = findingsNodes[k];
      });
      NODES.chapterXiiaElectedRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "compliance_docs.chapter_xiia_elected", false) === true;
      } };
      NODES.findingsBatch2Result = {
        deps: [
          "crossBasisResult",
          "usFtcFormXbr",
          "indiaItrFormResult",
          "specialRate115bbInr",
          "residencyResult",
          "unexplained115bbeInrAgg",
          "chapterXiiaElectedRaw",
          "capitalGainsComputation"
        ],
        compute: function(d, ctx) {
          var findings = [];
          function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
            findings.push({ id, severity, category, title, detail, recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
          }
          var recon = d.crossBasisResult;
          var dtRows = (recon && recon.rows || []).filter(function(r) {
            return r.doublyTaxed;
          });
          if (dtRows.length > 0) {
            add(
              "cross_basis_summary",
              "info",
              "income",
              dtRows.length + " income head(s) taxed under both codes \u2014 see reconciliation",
              "The same income is taxed in India (its own Act) and the US (the IRC): " + dtRows.map(function(r) {
                return r.label;
              }).join(", ") + ". Overlapping exposure of " + usd(recon.overlapUsd) + " is what the FTC / \xA7159 relief resolves." + (recon.anyEstimate ? " Some heads are planning-grade estimates pending line-item inputs." : ""),
              "Open the Cross-Basis Reconciliation on the Filings tab to see each head on both bases, then relieve the overlap via " + d.usFtcFormXbr + " (US) / Form 44 (India).",
              recon.overlapUsd,
              ["DTAA", d.usFtcFormXbr, "Form 44"]
            );
          }
          var itrM = d.indiaItrFormResult;
          if (itrM && itrM.matchesFrontend === false) {
            add(
              "india_itr_form_mismatch",
              "warning",
              "document",
              "ITR form disagreement: WISING computes " + itrM.form + ", Layer 1 says " + itrM.frontendForm,
              "WISING's own independent eligibility check (income thresholds, residency, capital gains, foreign assets/income, crypto, house-property count, brought-forward losses, speculative/F&O income) computes " + itrM.form + ". Layer 1 India's own recommendation, last computed client-side, was " + itrM.frontendForm + ' ("' + (itrM.frontendExplanation || "no explanation on file") + `"). Common causes: Layer 1's client-side check ran before a later edit (its recommendation is only recomputed when the eligibility function re-runs, not on every field change), or a genuine difference in what each side reads (see computeIndiaItrForm's header comment for three confirmed Layer 1 field bugs this backend check deliberately doesn't inherit).`,
              "Trust WISING's " + itrM.form + " unless you can identify a specific reason Layer 1's client-side check is right and this backend computation is wrong \u2014 re-running Layer 1's eligibility check (revisit the Review/Summary step) after any income or residency edit is the most common fix.",
              0,
              ["ITR eligibility", itrM.form, itrM.frontendForm]
            );
          }
          var specialBBUsd = inrToUsd(d.specialRate115bbInr || 0, ctx);
          if (specialBBUsd > 1) {
            add(
              "special_rate_gaming_winnings",
              d.residencyResult.us.worldwide ? "warning" : "info",
              "income",
              usd(specialBBUsd) + " of lottery/gaming winnings \u2014 flat 30% (s.128/194), no exemptions",
              "This income is taxed at a flat 30% with no basic exemption threshold, no Chapter VI-A deduction and no \xA7156 rebate \u2014 it's now included in the India tax total and the FTC/double-tax figures above." + (d.residencyResult.us.worldwide ? " Because the US taxes worldwide income, the same winnings are very likely also US-taxable as ordinary income \u2014 a real double-tax exposure that the general FTC computation only approximates, since it doesn't specifically match this flat 30% Indian rate against whatever ordinary rate the US applies to it." : ""),
              "Confirm US-side treatment of the same winnings separately from the general FTC computation \u2014 a flat-rate/graduated-rate mismatch on the same income can leave a residual gap the average-rate FTC approximation misses.",
              specialBBUsd,
              ["s.128", "s.194"]
            );
          }
          if ((d.unexplained115bbeInrAgg || 0) > 0) {
            add(
              "s115bbe_unexplained_income",
              "critical",
              "income",
              "Unexplained income on file (s.195) \u2014 not reflected in the India tax computed above",
              "\u20B9" + Math.round(d.unexplained115bbeInrAgg).toLocaleString("en-IN") + " is recorded as unexplained income under s.195. This carries a flat ~39% effective rate (30% tax + 25% surcharge + 4% cess, per Finance Act 2026) and \u2014 unlike any other provision \u2014 denies every deduction, exemption, and loss set-off with no exceptions. The India tax figure above does not include this; it needs to be added separately.",
              "Compute the s.195 addition separately at the full ~39% effective rate before relying on the India tax total above, and confirm the source of these funds is genuinely unexplained rather than misclassified income that belongs under a normal head.",
              0,
              ["s.195"]
            );
          }
          var xiiaHoldingCount = d.capitalGainsComputation.chapterXiiaSfeaHoldingCount || 0;
          var xiiaInvIncomeInr = d.capitalGainsComputation.chapterXiiaInvestmentIncomeInr || 0;
          if (d.chapterXiiaElectedRaw && xiiaHoldingCount === 0) {
            add(
              "chapter_xiia_elected_no_holdings",
              "warning",
              "credit",
              "Chapter XII-A elected, but no Financial Holdings transaction is marked as a specified foreign-exchange asset",
              `The Layer 1 Chapter XII-A election is on, but none of the Financial Holdings transactions on file are flagged as "Specified Foreign Exchange Asset (NRI)" \u2014 s.217/212's flat-rate regime only applies to shares/debentures/deposits/government securities actually purchased in convertible foreign exchange. Either a specified holding exists but wasn't flagged (so its capital gains and investment income are being computed under ordinary rules instead), or the election isn't actually needed this year.`,
              'If a specified holding exists, mark it "Specified Foreign Exchange Asset" on its Financial Holdings entry so it gets the correct s.217/212 treatment. If none exists, consider whether the election is still needed.',
              0,
              ["s.217", "s.212", "Chapter XII-A"]
            );
          } else if (d.chapterXiiaElectedRaw && xiiaHoldingCount > 0 && xiiaInvIncomeInr < 1) {
            add(
              "chapter_xiia_investment_income_missing",
              "warning",
              "credit",
              "Chapter XII-A elected, " + xiiaHoldingCount + " specified holding(s) on file \u2014 but no investment income entered for any of them",
              "The Layer 1 Chapter XII-A election is on, and " + xiiaHoldingCount + ' Financial Holdings transaction(s) are marked as a specified foreign-exchange asset \u2014 but none of them has an "Investment Income This Year" figure entered. A specified debenture or deposit almost always earns some interest, and specified shares may pay dividends; if any of these holdings did, that income is taxed at a flat 20% under s.217/212 (s.115E(1)(a)) \u2014 separate from, and in addition to, any capital gains already reflected below.',
              'Check each specified holding for interest/dividend actually received this year and enter it in the "Investment Income This Year" field \u2014 if genuinely none was received (e.g. a zero-coupon instrument still accruing, or shares that paid no dividend), no action needed.',
              0,
              ["s.217", "s.212", "Chapter XII-A", "s.115E"]
            );
          } else if (d.chapterXiiaElectedRaw && xiiaInvIncomeInr > 0) {
            add(
              "chapter_xiia_investment_income_computed",
              "info",
              "credit",
              "Chapter XII-A investment income of " + inr(xiiaInvIncomeInr) + " included at the flat 20% rate",
              "Interest/dividend entered against your Chapter XII-A specified holdings (" + inr(xiiaInvIncomeInr) + " total) is taxed at the flat 20% s.217/212 (s.115E(1)(a)) rate in the India tax computed below \u2014 no Chapter VI-A deductions or basic exemption apply to this slice, per Chapter XII-A's own rules.",
              "Confirm this figure covers ALL specified holdings' interest/dividend for the year, not just some of them.",
              0,
              ["s.217", "s.212", "Chapter XII-A", "s.115E"]
            );
          }
          return findings;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/apportionment-nodes.js
  var require_apportionment_nodes = __commonJS({
    "prototypes/graph-pilot/apportionment-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(inr, ctx) {
        return num(inr) / fxRate(ctx);
      }
      var incomeNodesIndia = require_aggregateindiaincome_nodes().NODES;
      var incomeNodesUs = require_aggregateusincome_nodes().NODES;
      var NODES = {};
      [incomeNodesIndia, incomeNodesUs].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
          if (NODES[k]) throw new Error("Unexpected node name collision on merge: '" + k + "' \u2014 resolve before combining.");
          NODES[k] = src[k];
        });
      });
      NODES.apportionmentBaseYearRaw = {
        deps: [],
        compute: function(d, ctx) {
          return num(safe(ctx.router, "base_tax_year", safe(ctx.us, "metadata.us_calendar_year", 2025))) || 2025;
        }
      };
      NODES.apportionmentIndiaQuarterlyUsdRaw = {
        deps: [],
        compute: function(d, ctx) {
          var q = safe(ctx.india, "quarters", null);
          if (!q) return null;
          return ["Q1", "Q2", "Q3", "Q4"].map(function(k) {
            var qd = q[k] || {}, di = qd.domestic_income || {}, os = qd.other_sources || {}, cg = qd.capital_gains || {};
            return inrToUsd(
              num(safe(di, "salary.taxable_salary_inr", 0)) + num(safe(di, "salary.gross_salary_inr", 0)) + num(safe(os, "interest_inr", 0)) + num(safe(os, "dividend_inr", 0)) + num(safe(cg, "stcg_111a_inr", 0)) + num(safe(cg, "ltcg_112a_inr", 0)),
              ctx
            );
          });
        }
      };
      NODES.indiaTotalIncomeUsdForApportionment = {
        deps: ["totalIndiaIncomeInr"],
        compute: function(d, ctx) {
          return inrToUsd(d.totalIndiaIncomeInr, ctx);
        }
      };
      NODES.apportionmentResult = {
        deps: ["apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "aggregateUsIncomeResult"],
        compute: function(d) {
          var baseYear = d.apportionmentBaseYearRaw;
          var q = d.apportionmentIndiaQuarterlyUsdRaw;
          var hasQ = !!(q && q.some(function(x) {
            return x > 0;
          }));
          var indiaFyTotal = d.indiaTotalIncomeUsdForApportionment;
          var primaryShare, nextShare;
          if (hasQ) {
            var qTot = q[0] + q[1] + q[2] + q[3] || indiaFyTotal || 1;
            primaryShare = (q[0] + q[1] + q[2]) / qTot;
            nextShare = q[3] / qTot;
          } else {
            primaryShare = 0.75;
            nextShare = 0.25;
          }
          var usCyTotal = d.aggregateUsIncomeResult.usSourceTotal.usd;
          return {
            basis: hasQ ? "Indian quarterly data" : "even-earning assumption (Apr\u2013Dec vs Jan\u2013Mar)",
            fyLabel: "FY " + baseYear + "\u2013" + String(baseYear + 1).slice(2),
            cyPrimary: baseYear,
            cyNext: baseYear + 1,
            indiaFyTotalUsd: indiaFyTotal,
            indiaToCyPrimaryUsd: Math.round(indiaFyTotal * primaryShare),
            indiaToCyNextUsd: Math.round(indiaFyTotal * nextShare),
            primaryShare,
            nextShare,
            usCyTotalUsd: usCyTotal,
            usCyToFyPrimaryUsd: Math.round(usCyTotal * 9 / 12),
            usCyToFyNextUsd: Math.round(usCyTotal * 3 / 12)
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/findings-batch3-nodes.js
  var require_findings_batch3_nodes = __commonJS({
    "prototypes/graph-pilot/findings-batch3-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      function inr(n) {
        return "\u20B9" + Math.round(n).toLocaleString("en-IN");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      var findingsBatch2Nodes = require_findings_batch2_nodes().NODES;
      var apportionmentNodes = require_apportionment_nodes().NODES;
      var NODES = {};
      Object.keys(findingsBatch2Nodes).forEach(function(k) {
        NODES[k] = findingsBatch2Nodes[k];
      });
      Object.keys(apportionmentNodes).forEach(function(k) {
        if (NODES[k] && NODES[k] !== apportionmentNodes[k]) throw new Error("true collision merging apportionment-nodes.js: " + k);
        NODES[k] = apportionmentNodes[k];
      });
      NODES.indiaFinancialHoldingsTxRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "financial_holdings.transactions", []) || [];
      } };
      NODES.hasPERaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "dtaa.has_permanent_establishment_in_india", false) === true;
      } };
      NODES.epfInrRaw = { deps: [], compute: function(d, ctx) {
        return num(safe(ctx.india, "deductions.s80C.epf_employee_inr", 0));
      } };
      NODES.ppfInrRaw = { deps: [], compute: function(d, ctx) {
        return num(safe(ctx.india, "deductions.s80C.ppf_inr", 0));
      } };
      NODES.npsInrRaw = { deps: [], compute: function(d, ctx) {
        return num(safe(ctx.india, "deductions.s80CCC_80CCD1.nps_employee_contribution_inr", 0));
      } };
      NODES.foreignGiftsRaw = {
        deps: [],
        compute: function(d, ctx) {
          return {
            receivedAbove100k: safe(ctx.us, "foreign_gifts_and_trusts.received_foreign_gifts_above_100k", false) === true,
            isTrustBeneficiary: safe(ctx.us, "foreign_gifts_and_trusts.is_us_beneficiary_of_foreign_trust", false) === true,
            receivedFromCoveredExpatriate: safe(ctx.us, "foreign_gifts_and_trusts.received_gift_from_covered_expatriate", false) === true
          };
        }
      };
      NODES.stateResidencyRaw = {
        deps: [],
        compute: function(d, ctx) {
          return {
            domicileJan1: safe(ctx.us, "state_residency.jan_1_domicile_state", null),
            domicileDec31: safe(ctx.us, "state_residency.dec_31_domicile_state", null),
            primaryState: safe(ctx.us, "state_residency.primary_state_of_residence", null),
            footprint: safe(ctx.us, "state_residency.total_states_footprint", []) || [],
            movedStates: safe(ctx.us, "state_residency.moved_states_this_year", false) === true,
            caSafeHarbor: safe(ctx.us, "state_residency.ca_safe_harbor_employment_contract", false) === true,
            caRetainsTies: safe(ctx.us, "state_residency.ca_retains_property_or_voter_reg", false) === true,
            nyDaysPresent: num(safe(ctx.us, "state_residency.ny_actual_days_present", 0)),
            nyPermanentAbode: safe(ctx.us, "state_residency.ny_permanent_place_of_abode", false) === true,
            ny548DayRule: safe(ctx.us, "state_residency.ny_548_day_rule", false) === true
          };
        }
      };
      NODES.nraRaw = {
        deps: [],
        compute: function(d, ctx) {
          return {
            treatyRateClaims: safe(ctx.us, "nra_specific.treaty_rate_claims", []) || [],
            submittedW8ben: safe(ctx.us, "nra_specific.submitted_w8ben", false) === true,
            usRealPropertyDisposed: safe(ctx.us, "nra_specific.us_real_property_disposed", false) === true,
            firptaWithholdingUsd: num(safe(ctx.us, "nra_specific.firpta_withholding_usd", 0))
          };
        }
      };
      NODES.taxableEpfInterestInrAgg = { deps: ["osAgg"], compute: function(d) {
        return num(safe(d.osAgg, "taxable_epf_interest_inr", 0));
      } };
      NODES.taxableNpsWithdrawalInrAgg = { deps: ["osAgg"], compute: function(d) {
        return num(safe(d.osAgg, "taxable_nps_withdrawal_inr", 0));
      } };
      var CONST_IN_B3 = require_constants().CONST.TAX.INDIA;
      var PROMOTER = {
        TARGET_NON_CORP: CONST_IN_B3.PROMOTER_BUYBACK_TARGET_RATE_NON_CORPORATE,
        TARGET_CORP: CONST_IN_B3.PROMOTER_BUYBACK_TARGET_RATE_CORPORATE,
        SURCHARGE_ON_ADDL: CONST_IN_B3.PROMOTER_BUYBACK_SURCHARGE_ON_ADDITIONAL_RATE,
        LTCG_RATE: CONST_IN_B3.LTCG_112_RATE,
        STCG_RATE: CONST_IN_B3.STCG_111A_RATE,
        CESS_RATE: CONST_IN_B3.CESS_RATE
      };
      NODES.promoterBuybackDetail = {
        deps: ["indiaEntityTypeRawV3", "promoterBuybackLtcgInrBoundary", "promoterBuybackStcgInrBoundary"],
        compute: function(d) {
          var isCorporatePromoter = d.indiaEntityTypeRawV3 === "company";
          var targetRate = isCorporatePromoter ? PROMOTER.TARGET_CORP : PROMOTER.TARGET_NON_CORP;
          var ltcgGainInr = d.promoterBuybackLtcgInrBoundary || 0, stcgGainInr = d.promoterBuybackStcgInrBoundary || 0;
          var ltcgAdditionalInr = Math.max(0, ltcgGainInr) * Math.max(0, targetRate - PROMOTER.LTCG_RATE);
          var stcgAdditionalInr = Math.max(0, stcgGainInr) * Math.max(0, targetRate - PROMOTER.STCG_RATE);
          var additionalTaxInr = ltcgAdditionalInr + stcgAdditionalInr;
          if (additionalTaxInr <= 0) return null;
          var surchargeInr = additionalTaxInr * PROMOTER.SURCHARGE_ON_ADDL;
          var cessInr = (additionalTaxInr + surchargeInr) * PROMOTER.CESS_RATE;
          return {
            isCorporatePromoter,
            targetRate,
            ltcgGainInr,
            stcgGainInr,
            additionalTaxInr,
            surchargeInr,
            cessInr,
            totalExtraTaxInr: additionalTaxInr + surchargeInr + cessInr
          };
        }
      };
      NODES.findingsBatch3Result = {
        deps: [
          "taxRegime",
          "businessComputation",
          "indiaIsCompany",
          "indiaIsFirm",
          "indiaIsAop",
          "indiaIsTrust",
          "capitalGainsComputation",
          "hasUsScopeBoundaryFtc",
          "hasIndiaScopeXbr",
          "residencyResult",
          "apportionmentResult",
          "usFtcFormXbr",
          "indiaFinancialHoldingsTxRaw",
          "viaForeignCorpXbr4",
          "bizEntriesAgg",
          "usTaxResult",
          "salaryInr",
          "ftcResult",
          "hasPERaw",
          "epfInrRaw",
          "ppfInrRaw",
          "npsInrRaw",
          "taxableEpfInterestInrAgg",
          "taxableNpsWithdrawalInrAgg",
          "promoterBuybackDetail",
          "foreignGiftsRaw",
          "stateResidencyRaw",
          "treatyIndiaResidenceRaw",
          "treatyUsResidenceRaw",
          "treatyDtaaForcedNrRaw",
          "nraRaw"
        ],
        compute: function(d, ctx) {
          var findings = [];
          function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
            findings.push({ id, severity, category, title, detail, recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
          }
          var res = d.residencyResult;
          if (d.taxRegime === "OLD" && (d.businessComputation.businessInr || 0) > 0 && !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust) {
            add(
              "form_10iea",
              "warning",
              "document",
              "Form 10-IEA required to elect the old regime with business/professional income",
              "The old tax regime is selected and business/professional (PGBP) income is on file. Unlike a salary-only filer, an assessee with PGBP income can't just choose the old regime on the ITR itself \u2014 Form 10-IEA must be filed by the s.139(1) due date, and once withdrawn from the old regime this way, old-regime eligibility is gone for good except for those without PGBP income.",
              "File Form 10-IEA before the ITR due date. Confirm this taxpayer hasn't already exercised and withdrawn the election in a prior year, which would make the old regime unavailable regardless of what's chosen this year.",
              0,
              ["Form 10-IEA", "s.115BAC(6)"]
            );
          }
          if ((d.capitalGainsComputation.vdaSaleConsiderationInr || 0) > 0 && d.hasUsScopeBoundaryFtc) {
            add(
              "form_1099da_awareness",
              "info",
              "document",
              "Crypto/VDA activity on file \u2014 check for US Form 1099-DA broker reporting",
              "Virtual digital asset transactions are recorded on the India side this year. If any of this activity (or other crypto activity not entered here) ran through a US-regulated broker or exchange, that broker owes the taxpayer Form 1099-DA \u2014 gross-proceeds reporting is mandatory for 2025 transactions, and basis reporting becomes mandatory for covered assets from 1 Jan 2026. Indian-exchange-only activity has no US 1099-DA angle at all.",
              "Ask whether any crypto activity this year touched a US-based broker/exchange; if so, reconcile against the 1099-DA received before relying on the capital-gains figures shown elsewhere.",
              0,
              ["Form 1099-DA"]
            );
          }
          if (res.dualResident || d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc) {
            var ap = d.apportionmentResult;
            add(
              "tax_year_mismatch",
              "info",
              "credit",
              "Tax-year apportionment: Indian FY \u2194 US CY (computed)",
              "India taxes Apr\u2013Mar; the US taxes Jan\u2013Dec. WISING splits the Indian FY across US calendar years \u2014 " + usd(ap.indiaToCyPrimaryUsd) + " into CY" + ap.cyPrimary + " and " + usd(ap.indiaToCyNextUsd) + " into CY" + ap.cyNext + " (" + ap.basis + ") \u2014 and apportions the US calendar year into the Indian FY (9/12 + 3/12).",
              "See the FY \u2194 CY Apportionment panel on the Filings tab for the period-matched figures behind Form 44 (India) and " + d.usFtcFormXbr + " (US). Planning-grade \u2014 refine with per-transaction dates at filing.",
              0,
              ["Apr 1 \u2013 Mar 31 (Tax Year)", "Jan 1 \u2013 Dec 31 (Calendar Year)"]
            );
          }
          if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc) {
            add(
              "fx_basis",
              "info",
              "credit",
              "FX conversion basis is an approximation",
              "Cross-border amounts are normalized at a flat 83 INR/USD. Statutory FTC computations require the telegraphic-transfer buying rate on the relevant date (Rule 115 / SBI TTBR).",
              "Re-price each foreign income and tax item at the correct per-transaction rate before filing; the flat rate is for planning visibility only.",
              0,
              ["Rule 115", "SBI TTBR"]
            );
          }
          var sr = d.stateResidencyRaw;
          var hasStateTies = !!(sr.primaryState || sr.domicileDec31 || sr.domicileJan1 || (sr.footprint || []).length > 0);
          var hasFederalTreatyPosture = res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none" || d.treatyDtaaForcedNrRaw;
          if (hasStateTies && hasFederalTreatyPosture) {
            var stateNote = [];
            var flagState = sr.domicileDec31 || sr.primaryState || sr.domicileJan1;
            if (sr.caSafeHarbor || sr.caRetainsTies) stateNote.push("California safe-harbor/retained-ties facts are on file \u2014 CA is aggressive about domicile and does not allow a credit for foreign tax paid.");
            if (sr.ny548DayRule || sr.nyPermanentAbode || sr.nyDaysPresent > 0) stateNote.push("New York statutory-residency facts are on file (183-day + permanent-abode / 548-day rule) \u2014 NY residency is tested independently of the federal position.");
            if (sr.movedStates) stateNote.push("A mid-year state move is on file \u2014 part-year returns may be due in two states.");
            add(
              "state_treaty_not_binding",
              "warning",
              "treaty",
              "State tax residency is not resolved by the DTAA / federal treaty position" + (flagState ? " (" + flagState + ")" : ""),
              "The India-US treaty and the federal residency determination above bind FEDERAL tax only. " + (flagState ? flagState + " " : "The state on file ") + "applies its own domicile or statutory-day residency test, independent of the Article 4 tie-breaker or any \xA7911/1040NR position. A taxpayer can be a federal treaty non-resident while remaining a full worldwide-income STATE resident with Indian income fully taxable and " + (stateNote.length ? "no matching relief in some states." : "little or no state-level foreign tax credit."),
              "Run the state's own residency test (domicile intent + day count) separately from the federal/treaty analysis. " + (stateNote.length ? stateNote.join(" ") : "Check whether the state allows any credit for foreign tax paid \u2014 several do not.") + " Do not assume the federal treaty position carries over.",
              0,
              ["State residency", flagState || "State domicile"]
            );
          }
          var mfCount = d.indiaFinancialHoldingsTxRaw.filter(function(t) {
            return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0;
          }).length;
          if (mfCount > 0 && res.us.isResident) {
            add(
              "pfic",
              "critical",
              "entity",
              "PFIC exposure: Indian mutual funds",
              mfCount + " Indian mutual fund / ETF holding(s) detected. For a US person these are Passive Foreign Investment Companies \u2014 taxed under the punitive \xA71291 excess-distribution regime by default, with a separate Form 8621 per fund.",
              "Evaluate a QEF or Mark-to-Market election (must be timely). Many Indian AMCs cannot supply a PFIC Annual Information Statement, which can force the \xA71291 default \u2014 consider restructuring holdings to US-domiciled funds.",
              0,
              ["Form 8621", "\xA71291", "QEF / MTM"]
            );
          }
          var bizCount = d.bizEntriesAgg.length;
          if (d.viaForeignCorpXbr4 && res.us.isResident) {
            add(
              "cfc",
              "warning",
              "entity",
              "Controlled Foreign Corporation \u2014 Form 5471 required (GILTI/Subpart F not yet quantified)",
              "Layer 1 records the US person owning \u226510% of a foreign corporation" + (bizCount > 0 ? " (Indian company on file)" : "") + ", so Form 5471 applies and GILTI / Subpart F can accelerate US tax on undistributed Indian profits before any dividend is paid. WISING flags the exposure from the ownership data but does NOT yet compute a GILTI/Subpart F inclusion amount \u2014 that requires the entity's tested income, E&P and qualified business asset investment (QBAI), which Layer 1 doesn't collect today.",
              "File Form 5471 regardless. To quantify GILTI/Subpart F (and evaluate the \xA7962 election against India's MAT/credit), collect the Indian company's tested income, E&P and QBAI \u2014 until then, treat this as a required-filing flag, not a computed liability.",
              0,
              ["Form 5471", "GILTI \xA7951A", "Subpart F", "\xA7962 election"]
            );
          } else if (bizCount > 0 && res.us.isResident) {
            add(
              "cfc_below_threshold",
              "info",
              "entity",
              "Indian company held below the 10% CFC threshold",
              bizCount + " Indian business interest(s) on file, but Layer 1 shows US ownership below 10% \u2014 so Form 5471 Category 5 / GILTI do not apply this year.",
              "No 5471 action needed at current ownership. WISING recomputes this every time you re-run the numbers, so update the ownership percentage in Layer 1 as soon as a purchase or reorganization changes it \u2014 this isn't monitored in the background.",
              0,
              ["Form 5471", "10% threshold"]
            );
          }
          if (d.viaForeignCorpXbr4) {
            add(
              "transfer_pricing",
              "warning",
              "document",
              "Related-party cross-border transactions \u2014 transfer pricing documentation may apply",
              "Layer 1 records a related-party cross-border ownership link (US person owning \u226510% of a foreign/Indian corporation). Any transactions between you and that related entity this year \u2014 service fees, cost allocations, loans, guarantees, IP licensing \u2014 must be priced at arm's length under India's s.92-92F and the US's parallel \xA7482 regime. WISING does NOT evaluate whether pricing is arm's-length; it only flags that the relationship exists.",
              "If related-party cross-border transactions occurred this year, confirm Form 3CEB certification and Rule 10D documentation requirements (India side) and \xA7482 documentation (US side) with a transfer-pricing specialist \u2014 penalties for missing documentation run 2% of transaction value, up to 200% for concealment.",
              0,
              ["s.92-92F", "Form 3CEB", "Rule 10D", "\xA7482"]
            );
          }
          if ((d.epfInrRaw > 0 || d.ppfInrRaw > 0 || d.npsInrRaw > 0) && res.us.isResident) {
            var epfInterestUsd = inrToUsd(d.taxableEpfInterestInrAgg || 0, ctx);
            var npsWithdrawalUsd = inrToUsd(d.taxableNpsWithdrawalInrAgg || 0, ctx);
            var hasQuantified = epfInterestUsd > 1 || npsWithdrawalUsd > 1;
            var quantifiedParts = [];
            if (epfInterestUsd > 1) quantifiedParts.push(usd(epfInterestUsd) + " of EPF interest");
            if (npsWithdrawalUsd > 1) quantifiedParts.push(usd(npsWithdrawalUsd) + " of NPS withdrawal");
            add(
              "retirement_mismatch",
              "warning",
              "retirement",
              "Indian retirement accounts (EPF / PPF / NPS) are taxed differently by the US",
              "India treats EPF, PPF and NPS as tax-free (or lightly taxed). The US does not automatically agree: the IRS can tax the interest these accounts earn every year, and may treat PPF like a trust that needs extra forms." + (hasQuantified ? " Layer 1 already records " + quantifiedParts.join(" and ") + " as taxable this year \u2014 WISING has added that amount to the US taxable income and tax figures shown elsewhere on this page (as ordinary foreign-source interest/pension), so it isn't just displayed here without effect." : ""),
              "WISING does NOT determine whether a specific account is a treaty-protected pension under DTAA Art. 20, or whether PPF should be treated as a foreign trust requiring Form 3520/3520-A \u2014 those are legal/factual determinations you need to make yourself; Form 3520 only appears on the filing checklist when the separate PPF/EPF-plus-US-residency trigger fires, not because this specific check ran. Confirm the treaty-protection question and trust classification before relying on the totals above.",
              epfInterestUsd + npsWithdrawalUsd,
              ["DTAA Art. 20", "Form 3520/3520-A", "FBAR"]
            );
          }
          var deemedDivUsd = inrToUsd(d.capitalGainsComputation.deemedDividendInr || 0, ctx);
          if (deemedDivUsd > 1 && res.us.worldwide) {
            add(
              "deemed_dividend_buyback_mismatch",
              "warning",
              "income",
              usd(deemedDivUsd) + " share buyback (Oct 2024 - Mar 2026 window) \u2014 India taxed it as dividend, the US likely as capital gain",
              "Under s.2(40)(f), buy-backs between 1-Oct-2024 and 31-Mar-2026 were taxed by India as the FULL consideration as a deemed dividend at slab rates, with the shares' cost basis becoming a capital LOSS rather than reducing the dividend. The US, by contrast, ordinarily treats a share buyback as a capital transaction \u2014 gain or loss against the shares' cost basis, not dividend income. The same cash is very likely characterized differently by each country, which can distort both the FTC basket (passive/dividend vs. capital gain) and the true amount of relief available. (Budget 2026 reversed this for buy-backs on/after 1-Apr-2026 \u2014 see s.69 instead.)",
              "Don't assume the general FTC computation resolves this cleanly \u2014 confirm how the US side actually reports the buyback (capital transaction vs. dividend) and reconcile the mismatch explicitly, including the capital loss India allows on the extinguished shares, which the US computation won't mirror the same way.",
              deemedDivUsd,
              ["s.2(40)(f)", "Share buyback", "FTC basket"]
            );
          }
          var pb = d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust ? null : d.promoterBuybackDetail;
          if (pb && pb.totalExtraTaxInr > 1) {
            add(
              "promoter_buyback_additional_tax",
              "warning",
              "income",
              "Promoter additional tax on buy-back gains \u2014 " + inr(pb.additionalTaxInr + pb.surchargeInr + pb.cessInr) + " on top of ordinary capital-gains tax",
              "As a promoter (s.69(2)(b)) on this buy-back, the ordinary " + (pb.ltcgGainInr > 0 ? "12.5% LTCG" : "20% STCG") + " tax on the gain is not the end of it: an additional tax brings the combined rate to " + Math.round(pb.targetRate * 100) + "% (" + (pb.isCorporatePromoter ? "corporate promoter" : "non-corporate promoter") + "), and a further 12% surcharge applies on that additional tax specifically \u2014 irrespective of total income. Additional tax: " + inr(pb.additionalTaxInr) + "; surcharge: " + inr(pb.surchargeInr) + "; cess: " + inr(pb.cessInr) + ".",
              "Confirm promoter status (direct/indirect >10% shareholding, or Companies Act/SEBI promoter designation) is correct before relying on this \u2014 the additional tax and surcharge do not apply to non-promoter shareholders in the same buy-back at all.",
              inrToUsd(pb.totalExtraTaxInr, ctx),
              ["s.69(2)(b)", "Promoter additional tax", "Share buyback"]
            );
          }
          var fg = d.foreignGiftsRaw;
          if (fg.receivedAbove100k || fg.isTrustBeneficiary) {
            var giftReasons = [];
            if (fg.receivedAbove100k) giftReasons.push("gift(s) from a foreign person exceeding $100,000 this year");
            if (fg.isTrustBeneficiary) giftReasons.push("US beneficiary of a foreign trust");
            add(
              "foreign_gift_3520",
              "warning",
              "document",
              "Form 3520 required \u2014 foreign gift / trust reporting (no tax due, but real penalty exposure)",
              "Layer 1 records " + giftReasons.join(" and ") + ". Form 3520 is an INFORMATION return \u2014 there is no tax on a bona fide gift \u2014 but the failure-to-file penalty is up to 25% of the unreported amount, and it is one of the most commonly missed filings precisely because no tax is owed to prompt it.",
              "File Form 3520 (and 3520-A if a foreign trust with a US owner) by the return due date, even where no tax results. Confirm the gift is genuinely a gift and not disguised compensation or a loan, and aggregate gifts from related donors.",
              0,
              ["Form 3520", "Form 3520-A"]
            );
          }
          if (fg.receivedFromCoveredExpatriate) {
            add(
              "covered_expat_gift_tax",
              "critical",
              "credit",
              "\xA72801 covered-expatriate gift/bequest tax may apply",
              "A gift or bequest was received from someone Layer 1 flags as a covered expatriate. Unlike an ordinary foreign gift, \xA72801 imposes a special transfer tax on the US RECIPIENT, at the highest gift/estate tax rate, on the value received from a covered expatriate \u2014 this is a real tax liability, not just an information filing.",
              "Confirm the donor's covered-expatriate status and compute the \xA72801 tax on Form 708, finalized January 2026 (TD 10027) with the first return due 15 Jul 2027 for gifts/bequests received in calendar 2025; this is separate from and in addition to the Form 3520 reporting above.",
              0,
              ["\xA72801", "Form 708", "Covered expatriate"]
            );
          }
          var nra = d.nraRaw;
          if ((nra.treatyRateClaims || []).length > 0 && !nra.submittedW8ben) {
            add(
              "nra_w8ben_missing",
              "critical",
              "treaty",
              "Treaty withholding rate claimed without Form W-8BEN on file",
              nra.treatyRateClaims.length + " treaty-rate claim(s) are recorded for US-source FDAP income, but Form W-8BEN (certifying foreign status and the treaty claim to the withholding agent) is not on file. Without it, the payer must withhold at the default 30% rather than the claimed treaty rate.",
              "File Form W-8BEN with each withholding agent to support the claimed treaty rate; without it, expect 30% withholding and a refund claim on the 1040-NR instead of correct withholding at source.",
              0,
              ["Form W-8BEN", "Treaty rate claim"]
            );
          }
          if (nra.usRealPropertyDisposed) {
            add(
              "firpta",
              "warning",
              "document",
              "FIRPTA withholding on US real property disposition",
              "A disposition of US real property by a foreign person is on file" + (nra.firptaWithholdingUsd > 0 ? " with " + usd(nra.firptaWithholdingUsd) + " withheld at closing" : "") + ". FIRPTA generally requires the buyer to withhold 15% of the gross sale price (not the gain) at closing, regardless of the seller's actual tax liability on the transaction.",
              "File Form 8288-A/8288-B as applicable; if 15% of the gross price materially overstates the actual tax on the gain, apply for a withholding certificate (Form 8288-B) BEFORE closing to reduce it, and reconcile the balance on the 1040-NR.",
              nra.firptaWithholdingUsd || 0,
              ["FIRPTA", "Form 8288-A", "Form 8288-B"]
            );
          }
          var businessUsd = inrToUsd(d.businessComputation.businessInr || 0, ctx);
          if (d.hasPERaw && businessUsd > 0) {
            add(
              "pe_article7",
              "warning",
              "treaty",
              "Permanent establishment in India \u2014 Article 7 business profits survive the tie-breaker",
              "A permanent establishment in India is on file alongside " + usd(businessUsd) + " of Indian business/professional income. Even where the DTAA Article 4 tie-breaker resolves general treaty residence away from India, Article 7 still gives India the right to tax profits ATTRIBUTABLE to that PE \u2014 the tie-breaker result doesn't exempt PE profits the way it can exempt other income categories.",
              "Confirm profit attribution to the PE (functions/assets/risks, arm's-length pricing) separately from the general residency analysis, and don't assume a 'ceded' India residence removes India's claim on PE-sourced business profits.",
              0,
              ["DTAA Art. 7", "Permanent establishment"]
            );
          }
          var seTaxUsd = d.usTaxResult.seTaxUsd || 0;
          var salaryUsd = inrToUsd(d.salaryInr || 0, ctx);
          var hasIndiaNexus = res.india.isResident || businessUsd > 0 || salaryUsd > 0;
          if (seTaxUsd > 1 && hasIndiaNexus) {
            add(
              "no_totalization_agreement",
              "warning",
              "credit",
              "No US\u2013India Totalization Agreement \u2014 self-employment tax has no double-coverage relief",
              usd(seTaxUsd) + " of US self-employment tax (Schedule SE) is owed in full. Unlike ~30 countries with a US Totalization Agreement, India has none \u2014 there is no Certificate of Coverage to exempt a self-employed or seconded worker from social-security-style contributions in both countries, and no credit mechanism folds Indian PF/social contributions into the US SE tax computation.",
              "Confirm whether Indian-side EPF/social contributions are also being made on the same work; if so this is uncoordinated double coverage by design (not a filing error) \u2014 the only mitigants are entity structuring (e.g., routing through a foreign corporation to convert SE income to a dividend/salary mix) or accepting the cost.",
              0,
              ["SE tax", "Schedule SE", "No US-India Totalization Agreement"]
            );
          }
          var niitUsd = d.usTaxResult.niitUsd || 0;
          var addlMedUsd = d.usTaxResult.additionalMedicareUsd || 0;
          if ((niitUsd > 1 || addlMedUsd > 1) && d.ftcResult.us.indiaTaxPaidUsd > 0) {
            var surtaxParts = [];
            if (niitUsd > 1) surtaxParts.push("NIIT " + usd(niitUsd) + " (\xA71411, 3.8%)");
            if (addlMedUsd > 1) surtaxParts.push("Additional Medicare " + usd(addlMedUsd) + " (\xA73101(b)(2), 0.9%)");
            add(
              "niit_medicare_not_creditable",
              "warning",
              "credit",
              "NIIT / Additional Medicare surtaxes are not offset by the Foreign Tax Credit",
              surtaxParts.join(" and ") + " applies on top of regular US income tax. Indian income tax can only credit the REGULAR US income tax (\xA7901/\xA7904) \u2014 these two surtaxes are outside the FTC mechanism entirely, so they stand as double taxation even when the rest of the Indian tax is fully credited.",
              "There is no credit path for this residue \u2014 the only levers are reducing MAGI/net investment income (retirement contributions, timing) or, for Additional Medicare, W-4 withholding planning. Make sure the client understands the FTC reconciliation above does not clear this amount.",
              niitUsd + addlMedUsd,
              ["\xA71411", "\xA73101(b)(2)", "Form 8960", "Form 8959"]
            );
          }
          return findings;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/findings-batch4-nodes.js
  var require_findings_batch4_nodes = __commonJS({
    "prototypes/graph-pilot/findings-batch4-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      function inr(n) {
        return "\u20B9" + Math.round(n).toLocaleString("en-IN");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      var findingsBatch3Nodes = require_findings_batch3_nodes().NODES;
      var NODES = {};
      Object.keys(findingsBatch3Nodes).forEach(function(k) {
        NODES[k] = findingsBatch3Nodes[k];
      });
      var S115A_RATES = require_constants().CONST.TAX.INDIA.S115A_RATES;
      function computeS115aStreamDetailed(treaty, incomeType, aggregateTotalInr) {
        var domestic = S115A_RATES[incomeType];
        var docsOk = treaty.trcStatus && treaty.form10fFiled;
        var hasAggregate = aggregateTotalInr != null;
        var remainingInr = hasAggregate ? aggregateTotalInr : 0;
        var claimedInr = 0, taxInr = 0;
        var elections = [];
        (treaty.treatyElections || []).forEach(function(e) {
          if (!e || e.income_type !== incomeType) return;
          var raw = num(e.amount_inr);
          var amt = hasAggregate ? Math.min(raw, Math.max(0, remainingInr)) : raw;
          var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
          var rate = docsOk && electedRate != null ? Math.min(domestic, electedRate) : domestic;
          var electionTaxInr = amt * rate;
          claimedInr += amt;
          taxInr += electionTaxInr;
          elections.push({
            article: e.treaty_article || null,
            requestedAmountInr: raw,
            appliedAmountInr: amt,
            electedRate,
            domesticRate: domestic,
            rateApplied: rate,
            taxInr: electionTaxInr,
            outcome: !docsOk ? "denied_no_docs" : electedRate != null && electedRate < domestic ? "elected_rate_applied" : "domestic_rate_wins"
          });
          if (hasAggregate) remainingInr -= amt;
        });
        var uncapturedInr = hasAggregate ? Math.max(0, remainingInr) : 0;
        var uncapturedTaxInr = uncapturedInr * domestic;
        taxInr += uncapturedTaxInr;
        var totalInr = hasAggregate ? aggregateTotalInr : claimedInr;
        return {
          totalInr,
          taxInr,
          claimedInr,
          uncapturedInr,
          uncapturedTaxInr,
          elections,
          domesticRate: domestic,
          effectiveRate: totalInr > 0 ? taxInr / totalInr : domestic
        };
      }
      function computeNrInterestTreatmentDetailed(treaty, slabs, otherSlabIncomeInr, interestAggregateInr, bracketTax2) {
        var docsOk = treaty.trcStatus && treaty.form10fFiled;
        var remainingInr = interestAggregateInr;
        var elections = [];
        var carvedOutInr = 0, carvedOutTaxInr = 0;
        (treaty.treatyElections || []).forEach(function(e) {
          if (!e || e.income_type !== "interest") return;
          var raw = num(e.amount_inr);
          var amt = Math.min(raw, Math.max(0, remainingInr));
          if (amt <= 0) return;
          remainingInr -= amt;
          var electedRate = e.elected_rate != null ? Number(e.elected_rate) : null;
          var canElect = docsOk && electedRate != null;
          var marginalSlabTaxInr = bracketTax2(otherSlabIncomeInr + interestAggregateInr, slabs) - bracketTax2(otherSlabIncomeInr + interestAggregateInr - amt, slabs);
          var treatyTaxInr = canElect ? amt * electedRate : null;
          var carvedOut = canElect && treatyTaxInr < marginalSlabTaxInr;
          if (carvedOut) {
            carvedOutInr += amt;
            carvedOutTaxInr += treatyTaxInr;
          }
          elections.push({
            article: e.treaty_article || null,
            requestedAmountInr: raw,
            appliedAmountInr: amt,
            electedRate,
            marginalSlabTaxInr,
            treatyTaxInr,
            carvedOut,
            outcome: !docsOk ? "denied_no_docs" : electedRate == null ? "no_rate" : carvedOut ? "treaty_beats_slab" : "slab_beats_treaty"
          });
        });
        var uncapturedInr = Math.max(0, remainingInr);
        return {
          totalInr: interestAggregateInr,
          slabEligibleInr: interestAggregateInr - carvedOutInr,
          carvedOutInr,
          carvedOutTaxInr,
          uncapturedInr,
          elections
        };
      }
      function bracketTax(amount, slabs) {
        var t = Math.max(0, amount), tax = 0, prev = 0;
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            tax += (Math.min(t, cap) - prev) * rate;
            prev = cap;
          } else break;
        }
        return tax;
      }
      function computeLossSetOffDetailed(cfl, buckets) {
        var businessInr = buckets.businessInr, housePropertyInr = buckets.housePropertyInr;
        var otherNormalInr = buckets.otherNormalInr, stcgInr = buckets.stcgInr, ltcgGrossInr = buckets.ltcgGrossInr;
        var speculativeInr = Math.max(0, buckets.speculativeInr || 0);
        var stcgSlabInr = buckets.stcgSlabInr || 0;
        var ltcg197Inr = buckets.ltcg197Inr || 0;
        var businessLossUsed = Math.min(cfl.businessLossAvailableInr || 0, businessInr);
        businessInr -= businessLossUsed;
        var businessLossUnused = (cfl.businessLossAvailableInr || 0) - businessLossUsed;
        var hpLossUsed = Math.min(cfl.housePropertyLossAvailableInr || 0, housePropertyInr);
        housePropertyInr -= hpLossUsed;
        var hpLossUnused = (cfl.housePropertyLossAvailableInr || 0) - hpLossUsed;
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
        var ltcgLossAvail = cfl.ltcgLossAvailableInr || 0;
        var ltcgLossUsedVs197 = Math.min(ltcgLossAvail, ltcg197Inr);
        ltcg197Inr -= ltcgLossUsedVs197;
        var ltcgLossAfter197 = ltcgLossAvail - ltcgLossUsedVs197;
        var ltcgLossUsedVs198 = Math.min(ltcgLossAfter197, ltcgGrossInr);
        ltcgGrossInr -= ltcgLossUsedVs198;
        var ltcgLossUnused = ltcgLossAfter197 - ltcgLossUsedVs198;
        var ltcgLossUsed = ltcgLossUsedVs197 + ltcgLossUsedVs198;
        var speculativeLossAvail = cfl.speculativeLossAvailableInr || 0;
        var speculativeLossUsed = Math.min(speculativeLossAvail, speculativeInr);
        speculativeInr -= speculativeLossUsed;
        var speculativeLossUnused = speculativeLossAvail - speculativeLossUsed;
        var depRemaining = cfl.unabsorbedDepreciationCf || 0;
        var used;
        used = Math.min(depRemaining, businessInr);
        businessInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, housePropertyInr);
        housePropertyInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, stcgSlabInr);
        stcgSlabInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, stcgInr);
        stcgInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, ltcg197Inr);
        ltcg197Inr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, ltcgGrossInr);
        ltcgGrossInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, otherNormalInr);
        otherNormalInr -= used;
        depRemaining -= used;
        used = Math.min(depRemaining, speculativeInr);
        speculativeInr -= used;
        depRemaining -= used;
        var depUsed = (cfl.unabsorbedDepreciationCf || 0) - depRemaining;
        var totalUsedInr = businessLossUsed + hpLossUsed + stcgLossUsedVsStcgSlab + stcgLossUsedVsStcg + stcgLossUsedVsLtcg + ltcgLossUsed + speculativeLossUsed + depUsed;
        var totalUnusedInr = businessLossUnused + hpLossUnused + stcgLossUnused + ltcgLossUnused + speculativeLossUnused + depRemaining;
        return {
          totalUsedInr,
          totalUnusedInr,
          unused: {
            businessInr: businessLossUnused,
            housePropertyInr: hpLossUnused,
            stcgInr: stcgLossUnused,
            ltcgInr: ltcgLossUnused,
            speculativeInr: speculativeLossUnused,
            unabsorbedDepreciationInr: depRemaining
          },
          used: {
            businessInr: businessLossUsed,
            housePropertyInr: hpLossUsed,
            stcgSlabInr: stcgLossUsedVsStcgSlab,
            stcgInr: stcgLossUsedVsStcg,
            ltcgFromStcgLossInr: stcgLossUsedVsLtcg,
            ltcgInr: ltcgLossUsed,
            speculativeInr: speculativeLossUsed,
            unabsorbedDepreciationInr: depUsed
          }
        };
      }
      NODES.carryForwardLossesMetaRaw = {
        deps: [],
        compute: function(d, ctx) {
          return {
            hasBroughtForwardLosses: safe(ctx.india, "carry_forward_losses.has_brought_forward_losses", null),
            businessLossCfCount: (safe(ctx.india, "carry_forward_losses.business_loss_cf", []) || []).length,
            speculativeLossCfCount: (safe(ctx.india, "carry_forward_losses.speculative_loss_cf", []) || []).length,
            stcgLossCfCount: (safe(ctx.india, "carry_forward_losses.stcg_loss_cf", []) || []).length,
            ltcgLossCfCount: (safe(ctx.india, "carry_forward_losses.ltcg_loss_cf", []) || []).length,
            housePropertyLossCfCount: (safe(ctx.india, "carry_forward_losses.house_property_loss_cf", []) || []).length,
            unabsorbedDepreciationCf: num(safe(ctx.india, "carry_forward_losses.unabsorbed_depreciation_cf", 0))
          };
        }
      };
      NODES.s115aDividendDetailed = {
        deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw", "dividendInr"],
        compute: function(d) {
          return d.isNRV3 && !d.isEntityTaxpayer ? computeS115aStreamDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "dividend", d.dividendInr) : null;
        }
      };
      NODES.s115aRoyaltyDetailed = {
        deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
        compute: function(d) {
          return d.isNRV3 && !d.isEntityTaxpayer ? computeS115aStreamDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "royalty", null) : null;
        }
      };
      NODES.s115aFtsDetailed = {
        deps: ["isNRV3", "isEntityTaxpayer", "treatyTrcStatus", "treatyForm10fFiled", "treatyElectionsRaw"],
        compute: function(d) {
          return d.isNRV3 && !d.isEntityTaxpayer ? computeS115aStreamDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, "fts", null) : null;
        }
      };
      NODES.nrInterestDetailed = {
        deps: [
          "isNRV3",
          "isEntityTaxpayer",
          "treatyTrcStatus",
          "treatyForm10fFiled",
          "treatyElectionsRaw",
          "slabs",
          "salaryInr",
          "businessInrBoundaryV3",
          "housePropertyInr",
          "deemedDividendBuybackInrBoundary",
          "otherSourcesMiscInrBoundary",
          "interestInr"
        ],
        compute: function(d) {
          if (!d.isNRV3 || d.isEntityTaxpayer) return null;
          var otherSlabIncomeInr = d.salaryInr + d.businessInrBoundaryV3 + d.housePropertyInr + d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary;
          return computeNrInterestTreatmentDetailed({ trcStatus: d.treatyTrcStatus, form10fFiled: d.treatyForm10fFiled, treatyElections: d.treatyElectionsRaw }, d.slabs, otherSlabIncomeInr, d.interestInr, bracketTax);
        }
      };
      NODES.lossSetOffDetailed = {
        deps: [
          "businessInrBoundaryV3",
          "businessDepreciationInrBoundary",
          "cflBusinessInr",
          "cflSpeculativeInr",
          "cflStcgInr",
          "cflLtcgInr",
          "cflHousePropertyInr",
          "cflUnabsorbedDepreciationInr",
          "housePropertyInr",
          "isNRV3",
          "nrInterest",
          "deemedDividendBuybackInrBoundary",
          "otherSourcesMiscInrBoundary",
          "interestInr",
          "dividendInr",
          "stcgInrBoundary",
          "stcgSlabInrBoundary",
          "ltcgInrBoundary",
          "ltcg197InrBoundary",
          "speculativeIncomeInrBoundaryV3"
        ],
        compute: function(d) {
          var businessInrRaw = d.businessInrBoundaryV3;
          var unabsorbedDepThisYearInr = businessInrRaw < 0 ? Math.min(d.businessDepreciationInrBoundary, -businessInrRaw) : 0;
          var cflForSetOff = {
            businessLossAvailableInr: d.cflBusinessInr,
            speculativeLossAvailableInr: d.cflSpeculativeInr,
            stcgLossAvailableInr: d.cflStcgInr,
            ltcgLossAvailableInr: d.cflLtcgInr,
            housePropertyLossAvailableInr: d.cflHousePropertyInr,
            unabsorbedDepreciationCf: d.cflUnabsorbedDepreciationInr + unabsorbedDepThisYearInr
          };
          var nrInterestSlabEligibleInr = d.nrInterest ? d.nrInterest.slabEligibleInr : 0;
          return computeLossSetOffDetailed(cflForSetOff, {
            businessInr: Math.max(0, businessInrRaw),
            housePropertyInr: d.housePropertyInr,
            otherNormalInr: d.deemedDividendBuybackInrBoundary + d.otherSourcesMiscInrBoundary + (d.isNRV3 ? nrInterestSlabEligibleInr : d.interestInr + d.dividendInr),
            stcgInr: d.stcgInrBoundary,
            stcgSlabInr: d.stcgSlabInrBoundary,
            ltcgGrossInr: d.ltcgInrBoundary,
            ltcg197Inr: d.ltcg197InrBoundary,
            speculativeInr: Math.max(0, d.speculativeIncomeInrBoundaryV3)
          });
        }
      };
      NODES.feieDetailed = {
        deps: ["feieRaw", "feie", "usTaxResult"],
        compute: function(d) {
          var f = d.feieRaw;
          var home = String(f.taxHomeCountry || "").trim().toLowerCase();
          var taxHomeAbroad = d.feie.taxHomeAbroad;
          var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
          var ppMet = !!f.physicalPresence && ppDaysOk;
          var bfMet = !!f.bonaFide;
          var reasons = [];
          if (d.feie.claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
          if (d.feie.claimed && !bfMet && !ppMet) {
            reasons.push(!f.physicalPresence && !f.bonaFide ? "neither the bona-fide-residence nor the physical-presence test is met" : f.physicalPresence && !ppDaysOk ? f.daysInUsTestPeriod + " US days in the test period \u2014 over the ~35-day allowance (330 full days abroad required)" : "bona-fide-residence test not met");
          }
          return {
            claimed: d.feie.claimed,
            amountClaimedUsd: d.feie.amountClaimedUsd,
            taxHomeAbroad,
            testMet: d.feie.testMet,
            eligible: d.feie.eligible,
            reasons,
            appliedUsd: d.usTaxResult.feieAppliedUsd
          };
        }
      };
      NODES.nraFdapIncomeUsdRaw = { deps: [], compute: function(d, ctx) {
        return num(safe(ctx.us, "nra_specific.us_fdap_income_usd", 0));
      } };
      NODES.nraEciIncomeUsdRaw = { deps: [], compute: function(d, ctx) {
        return num(safe(ctx.us, "nra_specific.us_eci_income_usd", 0));
      } };
      NODES.nraFdapDetail = {
        deps: ["nraRaw", "nraFdapIncomeUsdRaw"],
        compute: function(d) {
          var claim = (d.nraRaw.treatyRateClaims || [])[0];
          var rawClaimedRatePct = claim && claim.rate != null ? claim.rate : null;
          var claimedRateFraction = claim && claim.rate != null ? Math.max(0, Math.min(1, Number(claim.rate) / 100)) : null;
          var w8benOnFile = d.nraRaw.submittedW8ben === true;
          var fdapRate = w8benOnFile && claimedRateFraction != null ? claimedRateFraction : 0.3;
          var fdapUsd = d.nraFdapIncomeUsdRaw;
          var gapUsd = !w8benOnFile && claimedRateFraction != null && claimedRateFraction < 0.3 ? fdapUsd * (0.3 - claimedRateFraction) : 0;
          return {
            fdapUsd,
            fdapRate,
            claimedRate: rawClaimedRatePct,
            w8benOnFile,
            fdapTaxUsd: fdapUsd * fdapRate,
            gapUsd,
            // Clamped percentage (computed.usTax.nra.claimedRate * 100, the
            // ROUTED value buildWithholdingSummary's treatyRatePct actually reads,
            // conflicts.js:2413) — DIFFERENT from claimedRate above, which is the
            // raw unclamped Layer 1 value the nra_fdap_flat_rate FINDING's own
            // detail text reads instead (conflicts.js:1025's separate local
            // `claimedRate` var, never clamped there either — both are faithful
            // ports of two genuinely different engine variables with the same
            // name in different scopes, not a duplicate). A garbage/out-of-range
            // claim.rate (e.g. 395) previously passed through unclamped into
            // treatyRatePct — found by run-fuzz.js, SYS-3, 20 Jul 2026.
            claimedRatePctClamped: claimedRateFraction != null ? claimedRateFraction * 100 : null,
            incomeType: claim && claim.income_type || null
          };
        }
      };
      NODES.findingsBatch4Result = {
        deps: [
          "treatyElectionsRaw",
          "treatyIndiaResidenceRaw",
          "treatyUsResidenceRaw",
          "treatyDtaaForcedNrRaw",
          "treatyFiles1040nrRaw",
          "treatyTrcStatus",
          "treatyForm10fFiled",
          "residencyResult",
          "s115aDividendDetailed",
          "s115aRoyaltyDetailed",
          "s115aFtsDetailed",
          "nrInterestDetailed",
          "s6013hElection",
          "nraFdapDetail",
          "nraEciIncomeUsdRaw",
          "lossSetOffDetailed",
          "carryForwardLossesMetaRaw",
          "feieDetailed",
          "usTaxResult",
          "isEntityTaxpayer",
          "usEntityKind"
        ],
        compute: function(d, ctx) {
          var findings = [];
          function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
            findings.push({ id, severity, category, title, detail, recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
          }
          var res = d.residencyResult;
          var treatyElections = d.treatyElectionsRaw;
          var claimsTreaty = d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none" || d.treatyDtaaForcedNrRaw || d.treatyFiles1040nrRaw || treatyElections.length > 0;
          if (claimsTreaty && (!d.treatyTrcStatus || !d.treatyForm10fFiled)) {
            var missing = [];
            if (!d.treatyTrcStatus) missing.push("TRC (IRS Form 6166)");
            if (!d.treatyForm10fFiled) missing.push("Form 41");
            add(
              "treaty_docs_missing",
              "critical",
              "treaty",
              "Treaty relief claimed without supporting documents",
              "A treaty position / DTAA rate is being relied upon, but " + missing.join(" and ") + " is not on file. Indian tax authorities will deny treaty relief u/s 159(8) without a valid TRC, and Form 41 is mandatory u/r 75.",
              "Obtain " + missing.join(" and ") + " before filing. For US residents, request Form 6166 from the IRS (Form 8802 application) well in advance \u2014 it can take 6\u20138 weeks.",
              0,
              ["s.159(8)", "Rule 75 (Income-tax Rules, 2026)", "Form 6166"]
            );
          }
          if (treatyElections.length > 0) {
            var isNrForS115a = res.india.status === "NR";
            var docsShortfall = [];
            if (!d.treatyTrcStatus) docsShortfall.push("TRC (IRS Form 6166)");
            if (!d.treatyForm10fFiled) docsShortfall.push("Form 41");
            var s115aByType = { dividend: d.s115aDividendDetailed, royalty: d.s115aRoyaltyDetailed, fts: d.s115aFtsDetailed };
            var nrInterestElections = d.nrInterestDetailed && d.nrInterestDetailed.elections || [];
            var interestSeen = 0;
            var typeSeen = { dividend: 0, royalty: 0, fts: 0 };
            var COMPUTED_S115A_TYPES = { dividend: true, royalty: true, fts: true };
            var electionParts = treatyElections.filter(function(e) {
              return e && e.income_type;
            }).map(function(e) {
              var pct = e.elected_rate != null ? Math.round(e.elected_rate * 100) + "%" : "unset rate";
              var amtInr = num(e.amount_inr);
              var amtStr = amtInr > 1 ? " on " + inr(amtInr) : " (no amount entered)";
              var computedTag;
              if (!isNrForS115a) {
                computedTag = " [not applied \u2014 taxpayer is not NR, see below]";
              } else if (e.income_type === "capital_gains") {
                computedTag = " [not applied \u2014 no special treaty rate under Art. 13 for capital gains]";
              } else if (amtInr <= 1) {
                computedTag = " [not applied \u2014 no amount entered against this election]";
              } else if (e.income_type === "interest") {
                var ie = nrInterestElections[interestSeen++];
                if (!ie) computedTag = " [not applied]";
                else if (ie.outcome === "denied_no_docs") computedTag = " [election denied \u2014 TRC/Form 41 missing, ordinary slab rates apply to this slice instead]";
                else if (ie.outcome === "treaty_beats_slab") computedTag = " [elected rate applied \u2014 beats the marginal slab rate this slice would otherwise cost]";
                else computedTag = " [not applied \u2014 the marginal slab rate on this slice is already cheaper than the elected treaty rate]";
              } else if (COMPUTED_S115A_TYPES[e.income_type]) {
                var stream = s115aByType[e.income_type];
                var se = stream && stream.elections && stream.elections[typeSeen[e.income_type]++];
                var domestic = S115A_RATES[e.income_type];
                var compareDom = domestic != null ? " (vs " + Math.round(domestic * 100) + "% domestic s.207 rate)" : "";
                if (!se) computedTag = " [not applied]" + compareDom;
                else if (se.outcome === "denied_no_docs") computedTag = " [election denied \u2014 domestic " + Math.round(domestic * 100) + "% rate applied instead, TRC/Form 41 missing]";
                else if (se.outcome === "elected_rate_applied") computedTag = " [elected rate applied to the India tax above" + compareDom + "]";
                else computedTag = " [domestic " + Math.round(domestic * 100) + "% rate applied instead \u2014 it's more beneficial than the elected rate]";
              } else {
                computedTag = " [not applied]";
              }
              return e.income_type + " @ " + pct + (e.treaty_article ? " (" + e.treaty_article + ")" : "") + amtStr + computedTag;
            });
            add(
              "dtaa_treaty_elections",
              docsShortfall.length > 0 ? "warning" : "info",
              "treaty",
              electionParts.length + " DTAA treaty rate election(s) on file",
              "Layer 1 records a claimed treaty rate on the following India-source income stream(s): " + electionParts.join("; ") + "." + (!isNrForS115a ? " This taxpayer is resident (not NR) under India's own domestic law, so s.207 and every election above has NO effect regardless of income type; residents are taxed on this income at slab rates instead. If the taxpayer is genuinely meant to be NR, check the residency determination; if not, these elections are moot." : " Dividend, royalty and FTS elections are compared against the flat domestic s.207 rate (s.159, whichever is lower). Interest is different \u2014 ordinary NRO interest isn't actually s.207 income (that concessional rate is narrow, foreign-currency-borrowing interest only), so it's slab-rate income by default, and an election only helps when the flat treaty rate beats the marginal slab rate on that specific slice. Capital-gains elections are NOT applied \u2014 Art. 13 itself provides no special treaty rate, domestic law governs regardless (see Part H).") + (docsShortfall.length > 0 ? " Layer 1 does NOT show " + docsShortfall.join(" or ") + " on file \u2014 every one of these elections is at risk of being denied and defaulting back to slab/domestic rates without it." : ""),
              docsShortfall.length > 0 ? "Obtain " + docsShortfall.join(" and ") + " before relying on any of these elected rates \u2014 without it, the payer/assessing officer can withhold or assess at the full domestic rate shown above instead." : "Confirm each elected rate against the current India-US DTAA text for that article \u2014 TRC and Form 41 are on file, but that alone doesn't verify the specific article/rate claimed is correct for this income stream.",
              0,
              ["DTAA treaty election", "s.207", "s.159", "s.159(8)"]
            );
          }
          var indiaTotalGapInr = 0;
          if (!d.isEntityTaxpayer) {
            [d.s115aDividendDetailed, d.s115aRoyaltyDetailed, d.s115aFtsDetailed].forEach(function(stream) {
              if (!stream) return;
              (stream.elections || []).forEach(function(e) {
                var docsOk = e.outcome !== "denied_no_docs";
                if (!docsOk && e.electedRate != null && e.electedRate < e.domesticRate) indiaTotalGapInr += e.appliedAmountInr * (e.domesticRate - e.electedRate);
              });
            });
            if (d.nrInterestDetailed) {
              (d.nrInterestDetailed.elections || []).forEach(function(e) {
                var docsOk = e.outcome !== "denied_no_docs";
                var counterfactualTreatyTaxInr = e.electedRate != null ? e.appliedAmountInr * e.electedRate : null;
                if (!docsOk && counterfactualTreatyTaxInr != null && counterfactualTreatyTaxInr < e.marginalSlabTaxInr) indiaTotalGapInr += e.marginalSlabTaxInr - counterfactualTreatyTaxInr;
              });
            }
          }
          var isNraForWh = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.treatyFiles1040nrRaw && !d.s6013hElection;
          var usTotalGapUsd = isNraForWh && d.nraFdapDetail.fdapUsd > 0 ? d.nraFdapDetail.gapUsd : 0;
          var totalGapUsd = inrToUsd(indiaTotalGapInr, ctx) + usTotalGapUsd;
          if (totalGapUsd > 1) {
            var whParts = [];
            if (indiaTotalGapInr > 1) whParts.push(inr(indiaTotalGapInr) + " in India (TRC/Form 41)");
            if (usTotalGapUsd > 1) whParts.push(usd(usTotalGapUsd) + " in the US (Form W-8BEN)");
            add(
              "withholding_documentation_gap",
              "critical",
              "document",
              "Missing documentation is costing " + usd(totalGapUsd) + " in avoidable withholding tax this year",
              "Adding up every income stream where a treaty-reduced rate was claimed but denied for lack of supporting documentation: " + whParts.join(" + ") + " \u2014 " + usd(totalGapUsd) + " total, computed directly from the same rate/amount figures used elsewhere on this page, not estimated. See the Withholding Taxes page for the full row-by-row breakdown of which income and which document.",
              "File the missing documentation (TRC + Form 41 for India s.159 elections; Form W-8BEN with the US withholding agent for FDAP) as soon as possible \u2014 none of this is lost once filed for a FUTURE payment, but the tax already withheld/assessed on past payments this year may require a separate refund claim to recover.",
              totalGapUsd,
              ["Withholding tax", "TRC", "Form 41", "Form W-8BEN"]
            );
          }
          var feieRes = d.usTaxResult.feie;
          if (feieRes && feieRes.claimed && !feieRes.eligible) {
            add(
              "feie_ineligible",
              "critical",
              "credit",
              "FEIE claimed but the taxpayer does not qualify",
              "Form 2555 exclusion was claimed in Layer 1, but the \xA7911 tests fail: " + feieRes.reasons.join("; ") + ". FEIE is only available to someone living abroad \u2014 a US-based taxpayer with foreign income must use the Foreign Tax Credit instead. The engine has computed US tax WITHOUT the exclusion.",
              "Remove the FEIE claim and rely on Form 1116 FTC for the Indian taxes (usually better anyway when Indian rates exceed US rates). If the taxpayer genuinely lives abroad, complete the tax-home and presence-test fields in the US Layer 1 so the exclusion can be applied.",
              d.feieDetailed.amountClaimedUsd || 0,
              ["\xA7911", "Form 2555", "Form 1116"]
            );
          } else if (feieRes && feieRes.claimed && feieRes.eligible && feieRes.appliedUsd > 0) {
            add(
              "feie_applied",
              "info",
              "credit",
              "FEIE applied \u2014 " + usd(feieRes.appliedUsd) + " of foreign wages excluded",
              "The \xA7911 tests are met (foreign tax home + " + (feieRes.testMet ? "presence test" : "") + "), so " + usd(feieRes.appliedUsd) + " of foreign earned income is excluded from US tax. The excluded income and its share of Indian tax were removed from the FTC computation (no-double-dip).",
              "Compare FEIE vs full FTC annually \u2014 for high-tax countries like India, revoking FEIE in favour of FTC can save tax, but a revocation locks you out of FEIE for 5 years.",
              0,
              ["Form 2555", "\xA7911(d)(6)"]
            );
          }
          var isRoutedToNraForFdap = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.treatyFiles1040nrRaw && !d.s6013hElection;
          if (d.treatyFiles1040nrRaw && !d.s6013hElection && d.nraFdapDetail.fdapUsd > 0) {
            var nraDetail = d.nraFdapDetail;
            add(
              "nra_fdap_flat_rate",
              "info",
              "credit",
              "1040-NR: FDAP taxed flat" + (isRoutedToNraForFdap ? " (" + Math.round(nraDetail.fdapRate * 100) + "%)" : "") + ", ECI at graduated rates",
              usd(nraDetail.fdapUsd) + " of FDAP income (interest/dividends/rents not effectively connected with a US trade or business) is taxed flat" + (nraDetail.claimedRate ? " at the claimed " + nraDetail.claimedRate + "% treaty rate" : " at the 30% statutory rate (no treaty rate on file)") + " with no deductions (Schedule NEC), separate from " + usd(d.nraEciIncomeUsdRaw) + " of ECI taxed at graduated brackets with itemized deductions only (NRAs generally can't claim the standard deduction).",
              "Confirm the treaty rate claimed on Form W-8BEN/1040-NR matches the rate used here" + (nraDetail.claimedRate ? "" : " \u2014 no treaty rate is on file, so the default 30% was applied; check whether Article 11/12 of the DTAA reduces it") + ".",
              0,
              ["Form 1040-NR", "Schedule NEC", "FDAP", "ECI"]
            );
          }
          var cfl = d.carryForwardLossesMetaRaw;
          var cflCount = cfl.businessLossCfCount + cfl.speculativeLossCfCount + cfl.stcgLossCfCount + cfl.ltcgLossCfCount + cfl.housePropertyLossCfCount;
          var lso = d.isEntityTaxpayer ? null : d.lossSetOffDetailed;
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
            if (lso.unused.speculativeInr > 1) unusedParts.push(inr(lso.unused.speculativeInr) + " speculative loss (not modeled \u2014 see note)");
            if (lso.unused.unabsorbedDepreciationInr > 1) unusedParts.push(inr(lso.unused.unabsorbedDepreciationInr) + " unabsorbed depreciation");
            if (lso.totalUsedInr > 1 && lso.totalUnusedInr <= 1) {
              add(
                "carry_forward_losses_not_applied",
                "info",
                "credit",
                "Brought-forward losses fully set off this year",
                "All eligible prior-year losses were absorbed against this year's income: " + appliedParts.join("; ") + ". The India tax computed above already reflects this \u2014 no residual carry-forward remains.",
                "Confirm the set-off is reported correctly on Schedule CFL/BFLA of the ITR, matching the ordering above.",
                0,
                ["Loss carry-forward", "s.110", "s.112", "s.111"]
              );
            } else if (lso.totalUsedInr > 1) {
              add(
                "carry_forward_losses_not_applied",
                "warning",
                "credit",
                "Brought-forward losses partially set off \u2014 some still carrying forward",
                "Applied this year: " + appliedParts.join("; ") + ". Still carrying forward (no matching current-year income to absorb it, or \u2014 for speculative loss \u2014 not modeled at all): " + unusedParts.join("; ") + ".",
                "Track the unused amounts on Schedule CFL for future years (subject to the 8-year limit, indefinite for unabsorbed depreciation), and confirm speculative-income figures separately since WISING doesn't model that bucket.",
                0,
                ["Loss carry-forward", "s.110", "s.112", "s.111"]
              );
            } else {
              add(
                "carry_forward_losses_not_applied",
                "warning",
                "credit",
                "Brought-forward losses on file \u2014 none could be set off against this year's income",
                "Prior-year losses are recorded (" + unusedParts.join("; ") + "), but there is no matching current-year income in the same head(s) to absorb any of it \u2014 the India tax computed above is correct as-is; these losses simply carry forward untouched.",
                "Track these on Schedule CFL for a future year with matching income (subject to the 8-year limit for capital/business losses, indefinite for unabsorbed depreciation).",
                0,
                ["Loss carry-forward", "s.110", "s.112", "s.111"]
              );
            }
          }
          return findings;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/findings-batch5-nodes.js
  var require_findings_batch5_nodes = __commonJS({
    "prototypes/graph-pilot/findings-batch5-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      function moneyFromInr(inr, ctx) {
        return { inr, usd: inrToUsd(inr, ctx) };
      }
      function moneyFromUsd(v, ctx) {
        return { usd: v, inr: v * fxRate(ctx) };
      }
      function addMoney(a, b) {
        return { usd: a.usd + b.usd, inr: a.inr + b.inr };
      }
      function zeroMoney() {
        return { usd: 0, inr: 0 };
      }
      function bracketTax(amount, slabs) {
        var t = Math.max(0, amount), tax = 0, prev = 0;
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            tax += (Math.min(t, cap) - prev) * rate;
            prev = cap;
          } else break;
        }
        return tax;
      }
      function bracketBreakdown(amount, slabs) {
        var t = Math.max(0, amount), prev = 0, rows = [];
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            var taxable = Math.min(t, cap) - prev;
            rows.push({ from: prev, to: cap, rate, taxable, tax: taxable * rate });
            prev = cap;
          } else break;
        }
        return rows;
      }
      var findingsBatch4Nodes = require_findings_batch4_nodes().NODES;
      var NODES = {};
      Object.keys(findingsBatch4Nodes).forEach(function(k) {
        NODES[k] = findingsBatch4Nodes[k];
      });
      NODES.equityCompRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "equity_compensation", {}) || {};
      } };
      NODES.esopEventsRaw = { deps: ["diAgg"], compute: function(d) {
        return safe(d.diAgg, "salary.esop_perquisite_events", []) || [];
      } };
      NODES.esopPerquisiteInrRaw = { deps: ["diAgg"], compute: function(d) {
        return num(safe(d.diAgg, "salary.esop_perquisite_inr", 0));
      } };
      NODES.equityCompResult = {
        deps: ["equityCompRaw", "esopEventsRaw", "esopPerquisiteInrRaw"],
        compute: function(d) {
          var ec = d.equityCompRaw;
          var rsuIncomeUsd = 0, nsoIncomeUsd = 0;
          (safe(ec, "rsu_vestings", []) || []).forEach(function(r) {
            rsuIncomeUsd += num(r.gross_income_usd != null ? r.gross_income_usd : num(r.fmv_at_vest_usd) * num(r.shares_vested));
          });
          (safe(ec, "nso_exercises", []) || []).forEach(function(n) {
            nsoIncomeUsd += num(n.ordinary_income_recognized_usd != null ? n.ordinary_income_recognized_usd : Math.max(0, (num(n.fmv_at_exercise_usd) - num(n.strike_price_usd)) * num(n.shares_exercised)));
          });
          var isoCount = (safe(ec, "iso_exercises", []) || []).length;
          var esopEvents = d.esopEventsRaw;
          var esopFromEvents = esopEvents.reduce(function(s, e) {
            return s + num(e.perquisite_value_inr);
          }, 0);
          var esopPerquisiteInr = esopEvents.length > 0 ? esopFromEvents : d.esopPerquisiteInrRaw;
          return {
            hasUsEquityComp: safe(ec, "has_equity_comp", false) === true || rsuIncomeUsd > 0 || nsoIncomeUsd > 0 || isoCount > 0,
            rsuIncomeUsd,
            nsoIncomeUsd,
            isoExerciseCount: isoCount,
            esopPerquisiteInr,
            esopGrantEvents: esopEvents
          };
        }
      };
      var CONST_B5 = require_constants().CONST;
      var US_STATES = CONST_B5.TAX.US_STATES;
      var US_STATES_NJ_NY_SHAPE_EXT = {
        NJ: {
          NAME: "New Jersey",
          FORM_NAME: "Form NJ-1040",
          // NJ Div. of Taxation, TY2024 schedule (unchanged for several years) —
          // best-available figures, see file comment above.
          BRACKETS: {
            single: [[2e4, 0.014], [35e3, 0.0175], [4e4, 0.035], [75e3, 0.05525], [5e5, 0.0637], [1e6, 0.0897], [Infinity, 0.1075]],
            mfj: [[2e4, 0.014], [5e4, 0.0175], [7e4, 0.0245], [8e4, 0.035], [15e4, 0.05525], [5e5, 0.0637], [1e6, 0.0897], [Infinity, 0.1075]]
          },
          // NJ has no standard deduction — a $1,000 personal exemption (filer),
          // another $1,000 if MFJ (spouse), modeled here as the STD_DEDUCTION
          // slot since the dollar effect (subtracted from AGI before bracket tax)
          // is identical; STD_DEDUCTION_LABEL corrects the trace wording.
          STD_DEDUCTION: { single: 1e3, mfj: 2e3 },
          STD_DEDUCTION_LABEL: "personal exemption",
          DEPENDENT_EXEMPTION_USD: 1500,
          DEPENDENT_EXEMPTION_LABEL: "NJ dependent exemption ($1,500/dependent)"
        }
      };
      var NO_INDIVIDUAL_INCOME_TAX_STATES = { AK: 1, FL: 1, NV: 1, SD: 1, TN: 1, TX: 1, WA: 1, WY: 1 };
      var STATE_NAMES = {
        AK: "Alaska",
        FL: "Florida",
        NV: "Nevada",
        SD: "South Dakota",
        TN: "Tennessee",
        TX: "Texas",
        WA: "Washington",
        WY: "Wyoming"
      };
      var US_STATES_EXT = Object.assign({}, US_STATES, US_STATES_NJ_NY_SHAPE_EXT);
      NODES.usStateTaxResult = {
        deps: ["usEntityKind", "treatyFiles1040nrRaw", "s6013hElection", "stateResidencyRaw", "usFilingStatusRaw", "dedUs", "usTaxResult"],
        compute: function(d) {
          var isNra = d.treatyFiles1040nrRaw && !d.s6013hElection;
          if (d.usEntityKind !== "individual" || isNra) return null;
          var sr = d.stateResidencyRaw;
          var stateCode = sr.domicileDec31 || sr.primaryState || sr.domicileJan1;
          if (!stateCode) return null;
          if (NO_INDIVIDUAL_INCOME_TAX_STATES[stateCode]) {
            return {
              state: stateCode,
              stateName: STATE_NAMES[stateCode] || stateCode,
              formName: null,
              filingStatus: d.usFilingStatusRaw === "mfj" ? "mfj" : "single",
              noIncomeTax: true,
              agiUsd: d.usTaxResult.agiUsd,
              standardDeductionUsd: 0,
              dependentExemptionUsd: 0,
              taxableIncomeUsd: 0,
              bracketTaxUsd: 0,
              bracketBreakdown: [],
              surchargeUsd: 0,
              surchargeLabel: null,
              exemptionCreditUsd: 0,
              dependentCreditUsd: 0,
              totalTaxUsd: 0,
              effectiveRate: 0,
              basis: (STATE_NAMES[stateCode] || stateCode) + " has no individual income tax."
            };
          }
          var T = US_STATES_EXT[stateCode];
          if (!T) return null;
          var status = d.usFilingStatusRaw === "mfj" ? "mfj" : "single";
          var brackets = T.BRACKETS[status];
          var standardDeductionUsd = T.STD_DEDUCTION[status];
          var dependents = d.dedUs.dependents || 0;
          var dependentExemptionUsd = (T.DEPENDENT_EXEMPTION_USD || 0) * dependents;
          var taxableIncomeUsd = Math.max(0, d.usTaxResult.agiUsd - standardDeductionUsd - dependentExemptionUsd);
          var bracketTaxUsd = bracketTax(taxableIncomeUsd, brackets);
          var bracketBreakdownRows = bracketBreakdown(taxableIncomeUsd, brackets);
          var surchargeUsd = 0;
          if (T.SURCHARGE_THRESHOLD_USD != null && taxableIncomeUsd > T.SURCHARGE_THRESHOLD_USD) {
            surchargeUsd = (taxableIncomeUsd - T.SURCHARGE_THRESHOLD_USD) * T.SURCHARGE_RATE;
          }
          var exemptionCreditUsd = T.EXEMPTION_CREDIT_USD && T.EXEMPTION_CREDIT_USD[status] || 0;
          var dependentCreditUsd = (T.DEPENDENT_CREDIT_USD || 0) * dependents;
          var totalTaxUsd = Math.max(0, Math.round(bracketTaxUsd + surchargeUsd - exemptionCreditUsd - dependentCreditUsd));
          return {
            state: stateCode,
            stateName: T.NAME,
            formName: T.FORM_NAME,
            filingStatus: status,
            noIncomeTax: false,
            agiUsd: d.usTaxResult.agiUsd,
            standardDeductionUsd,
            dependentExemptionUsd,
            standardDeductionLabel: T.STD_DEDUCTION_LABEL || "standard deduction",
            dependentExemptionLabel: T.DEPENDENT_EXEMPTION_LABEL || T.NAME + " dependent exemption",
            taxableIncomeUsd,
            bracketTaxUsd,
            bracketBreakdown: bracketBreakdownRows,
            surchargeUsd,
            surchargeLabel: T.SURCHARGE_LABEL || null,
            exemptionCreditUsd,
            dependentCreditUsd,
            totalTaxUsd,
            effectiveRate: d.usTaxResult.agiUsd > 0 ? totalTaxUsd / d.usTaxResult.agiUsd : 0,
            basis: "TY2025 rates (returns filed 2026); full-year resident, worldwide income via federal AGI, no foreign tax credit against state tax."
          };
        }
      };
      NODES.taxesPaidUsResult = {
        deps: [],
        compute: function(d, ctx) {
          var we = safe(ctx.us, "withholding_and_estimated", {});
          var usWithholding = num(safe(we, "federal_withholding_total_usd", 0));
          var usEstimated = num(safe(we, "estimated_tax_q1_apr15_usd", 0)) + num(safe(we, "estimated_tax_q2_jun15_usd", 0)) + num(safe(we, "estimated_tax_q3_sep15_usd", 0)) + num(safe(we, "estimated_tax_q4_jan15_usd", 0));
          var priorYearTotalTaxUsdRaw = safe(we, "prior_year_total_tax_usd", null);
          return {
            total: moneyFromUsd(usWithholding + usEstimated, ctx),
            withholding: moneyFromUsd(usWithholding, ctx),
            priorYearTotalTaxUsd: priorYearTotalTaxUsdRaw === null ? null : num(priorYearTotalTaxUsdRaw)
          };
        }
      };
      NODES.bankAccountsRaw = {
        deps: [],
        compute: function(d, ctx) {
          return { india: safe(ctx.india, "bank_accounts", []) || [], us: safe(ctx.us, "bank_accounts", []) || [], usFormFbar: num(safe(ctx.us, "fbar_aggregate_peak_usd", 0)) };
        }
      };
      NODES.aggregatePeakUsdResult = {
        deps: ["bankAccountsRaw", "hasUsScopeBoundaryFtc"],
        compute: function(d, ctx) {
          var indianAccounts = d.bankAccountsRaw.india.map(function(b) {
            return { peak: moneyFromInr(b.peak_balance_inr || 0, ctx) };
          });
          var usDisclosed = d.bankAccountsRaw.us.map(function(b) {
            return { peak: b.peak_balance_usd !== void 0 ? moneyFromUsd(b.peak_balance_usd, ctx) : moneyFromInr(b.peak_balance_inr || 0, ctx) };
          });
          var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
          var formFbar = d.bankAccountsRaw.usFormFbar;
          if (formFbar > 0) return moneyFromUsd(formFbar, ctx);
          if (!d.hasUsScopeBoundaryFtc) return zeroMoney();
          return accounts.reduce(function(acc, a) {
            return addMoney(acc, a.peak);
          }, zeroMoney());
        }
      };
      NODES.limitsRawExtra = {
        deps: ["annualSliceAgg"],
        compute: function(d, ctx) {
          return {
            lrsRemittedInr: num(safe(d.annualSliceAgg, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)) || num(safe(ctx.india, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)),
            trumpAccountsOpened: safe(ctx.us, "profile.trump_accounts_opened", false) === true,
            trumpAccountsNumChildren: num(safe(ctx.us, "profile.trump_accounts_num_children", 0)),
            trumpAccountsSeedEligibleChildren: num(safe(ctx.us, "profile.trump_accounts_children_born_2025_2028", 0)),
            trumpAccountsContributionsUsd: num(safe(ctx.us, "profile.trump_accounts_total_contributions_usd", 0))
          };
        }
      };
      var LIM = CONST_B5.LIMITS;
      function gauge(id, valueUsd, limitUsd) {
        var pct = limitUsd > 0 ? valueUsd / limitUsd : 0;
        var status = pct >= 1 ? "breached" : pct >= 0.8 ? "approaching" : "ok";
        return { id, value: valueUsd, limit: limitUsd, pct, status };
      }
      NODES.findingsBatch5Result = {
        deps: [
          "equityCompResult",
          "usStateTaxResult",
          "taxesPaidUsResult",
          "aggregateUsIncomeResult",
          "aggregatePeakUsdResult",
          "hasUsScopeBoundaryFtc",
          "hasIndiaScopeXbr",
          "limitsRawExtra"
        ],
        compute: function(d, ctx) {
          var findings = [];
          function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
            findings.push({ id, severity, category, title, detail, recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
          }
          var eq = d.equityCompResult;
          if (eq.hasUsEquityComp && eq.esopPerquisiteInr > 0) {
            add(
              "equity_comp_sourcing",
              "warning",
              "income",
              "Equity compensation taxed on both sides \u2014 cross-border sourcing not applied",
              "Both an India ESOP/perquisite event and a US equity-compensation event (RSU vest / NSO exercise) are on file for this year. India taxes the ESOP perquisite in full at exercise/allotment (s.17(1)(vi)); the US taxes RSU vesting / NSO exercise in full as ordinary income in the vesting/exercise year. Absent a workday-based allocation, the same equity award can be fully taxed by BOTH countries rather than apportioned to where the services were actually performed during the vesting period.",
              "Reconstruct the vesting-period workday split between India and the US (DTAA Art. 15/16 dependent-personal-services sourcing) so each country only taxes its proportionate share, then claim FTC/\xA7159 relief on the genuinely overlapping portion rather than the full award twice.",
              0,
              ["DTAA Art. 15", "s.17(1)(vi)", "RSU vesting", "NSO exercise"]
            );
          }
          if (eq.isoExerciseCount > 0) {
            add(
              "iso_3921",
              "info",
              "document",
              "ISO exercise(s) on file \u2014 employer owes you Form 3921",
              eq.isoExerciseCount + " incentive stock option exercise(s) recorded this year. The employer is required to furnish Form 3921 (one per exercise) by January 31 of the following year, reporting the grant/exercise dates, exercise price, and FMV at exercise \u2014 the same figures already driving the AMT preference computed above.",
              "Confirm Form 3921 was received from the employer for each exercise and that its FMV/exercise-price figures match what's on file here before relying on the AMT number.",
              0,
              ["Form 3921", "\xA76039"]
            );
          }
          var st = d.usStateTaxResult;
          if (st && st.totalTaxUsd > 0) {
            add(
              "state_income_tax",
              "warning",
              "credit",
              st.stateName + " state income tax: " + usd(st.totalTaxUsd) + " (" + st.formName + ")",
              st.stateName + " taxes a full-year resident's WORLDWIDE income, including Indian-source income already reported on the federal and Indian returns \u2014 computed here as " + usd(st.taxableIncomeUsd) + " of state taxable income (federal AGI " + usd(st.agiUsd) + " less the " + st.stateName + " standard deduction" + (st.dependentExemptionUsd > 0 ? " and dependent exemption" : "") + ") at " + st.stateName + "'s own bracket rates" + (st.surchargeUsd > 0 ? ", plus " + usd(st.surchargeUsd) + " (" + st.surchargeLabel + ")" : "") + (st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? ", less " + usd(st.exemptionCreditUsd + st.dependentCreditUsd) + " of personal/dependent credits" : "") + ". Neither the Foreign Tax Credit computed above nor any DTAA relief applies here \u2014 " + st.stateName + " is not a party to the India-US treaty and " + (st.state === "CA" ? "grants no credit for tax paid to a foreign country at all." : "does not treat Indian tax as a creditable state-level offset."),
              "File " + st.formName + " alongside the federal return. This is a full-year-resident, TY2025-rates estimate \u2014 it does not split state-source income for a part-year or nonresident allocation, does not model " + st.stateName + "'s own AGI addition/subtraction adjustments beyond the standard deduction" + (st.dependentExemptionUsd > 0 ? "/dependent exemption" : "") + ", and (for California) does not include the local-jurisdiction SDI/VPDI payroll tax. Treat as directional, not filing-ready.",
              st.totalTaxUsd,
              [st.formName, st.stateName + " residency"]
            );
          }
          if (d.hasIndiaScopeXbr && d.hasUsScopeBoundaryFtc && (d.aggregateUsIncomeResult.foreignSourceTotal.usd > 0 || d.taxesPaidUsResult.total.usd > 0)) {
            add(
              "form67_required",
              "info",
              "document",
              "Form 44 \u2014 required for the Indian FTC claim",
              "Foreign income / foreign tax is present, so India requires Form 44 (with Schedule FSI and TR) on or before the ITR due date to allow FTC u/s 90/91.",
              "WISING flags Form 44 (with Schedule FSI/TR) as required on the filing checklist, using the FSI/TR figures already computed above \u2014 actually preparing and e-filing it on the income-tax portal ahead of the ITR due date is still a manual step.",
              0,
              ["Form 44", "Rule 128", "Schedule FSI", "Schedule TR"]
            );
          }
          if (d.hasUsScopeBoundaryFtc) {
            var fbar = gauge("fbar", d.aggregatePeakUsdResult.usd, LIM.FBAR_AGGREGATE_USD);
            if (fbar.status === "breached") {
              add(
                "fbar_limit",
                "critical",
                "limit",
                "FBAR threshold breached",
                "Aggregate peak balance across foreign accounts is " + usd(fbar.value) + ", above the USD 10,000 reporting cliff. EVERY foreign account must be reported, not just those over the limit.",
                "File FinCEN Form 114 by the due date (auto-extended to Oct 15). Non-willful penalties start at ~$10,000 per violation; willful penalties are far higher.",
                0,
                ["FinCEN 114", "FBAR"]
              );
            }
          }
          if (d.hasIndiaScopeXbr) {
            var lrs = gauge("lrs", inrToUsd(d.limitsRawExtra.lrsRemittedInr, ctx), LIM.LRS_ANNUAL_USD);
            if (lrs.status !== "ok") {
              add(
                "lrs_limit",
                lrs.status === "breached" ? "critical" : "warning",
                "limit",
                "LRS remittance " + (lrs.status === "breached" ? "limit breached" : "approaching limit"),
                "Outbound LRS remittances of " + usd(lrs.value) + " are at " + Math.round(lrs.pct * 100) + "% of the USD 250,000 RBI annual cap.",
                lrs.status === "breached" ? "A breach can attract RBI scrutiny and AD-bank refusal. Verify remittances across all banks (the cap is per-PAN, not per-account) and document the source of funds." : "Monitor remaining headroom for the rest of the financial year; TCS at 20% applies above \u20B910 lakh.",
                0,
                ["RBI LRS", "TCS u/s 394(1)"]
              );
            }
          }
          var lr = d.limitsRawExtra;
          if (lr.trumpAccountsOpened) {
            var taChildren = Math.max(1, lr.trumpAccountsNumChildren || 1);
            var trumpAcct = gauge("trump_account", lr.trumpAccountsContributionsUsd, LIM.TRUMP_ACCOUNT_ANNUAL_CAP_USD * taChildren);
            var taSeedEligible = lr.trumpAccountsSeedEligibleChildren || 0;
            var taSeedUsd = LIM.TRUMP_ACCOUNT_FEDERAL_SEED_USD;
            var seedNote = taSeedEligible > 0 ? "A $" + taSeedUsd.toLocaleString("en-US") + " one-time federal seed contribution applies to the " + taSeedEligible + " child(ren) born 2025-2028 \u2014 separate from, and not counted against, the $5,000/year cap." : "No federal seed applies \u2014 that one-time $1,000 contribution is only for children born 2025-2028.";
            if (trumpAcct.status === "breached") {
              add(
                "trump_account_contribution_limit",
                "warning",
                "limit",
                "Trump Account (\xA7530A) contribution cap exceeded",
                "Contributions of " + usd(trumpAcct.value) + " across " + taChildren + " child(ren) exceed the $5,000/child/year cap (combined across all contributors \u2014 parents, family, employer all draw from the same limit). " + seedNote,
                "Excess contributions are not automatically rejected by the custodian in every case \u2014 verify the aggregate against all contributors and consider a corrective withdrawal before the account's growth compounds on an over-contribution.",
                0,
                ["\xA7530A", "Trump Account"]
              );
            } else {
              add(
                "trump_account_contribution_limit",
                "info",
                "limit",
                "Trump Account (\xA7530A) in use",
                "Contributions of " + usd(trumpAcct.value) + " this year are within the $5,000/child/year cap. " + seedNote + " Contributions are nondeductible; account growth is tax-deferred until withdrawal, and the account converts to a Traditional IRA when the beneficiary turns 18.",
                "No action needed while under the cap \u2014 just confirm contributions are tracked in aggregate across every contributor, not just this taxpayer's own deposits.",
                0,
                ["\xA7530A", "Trump Account"]
              );
            }
          }
          return findings;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/findings-batch6-nodes.js
  var require_findings_batch6_nodes = __commonJS({
    "prototypes/graph-pilot/findings-batch6-nodes.js"(exports, module) {
      "use strict";
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      var findingsBatch5Nodes = require_findings_batch5_nodes().NODES;
      var NODES = {};
      Object.keys(findingsBatch5Nodes).forEach(function(k) {
        NODES[k] = findingsBatch5Nodes[k];
      });
      var CONST_B6 = require_constants().CONST;
      var T = CONST_B6.TAX.US;
      var FEIE_MAX_USD = CONST_B6.LIMITS.FEIE_MAX_USD;
      var NIIT_THRESHOLD = CONST_B6.LIMITS.NIIT_THRESHOLD;
      function bracketTax(amount, slabs) {
        var t = Math.max(0, amount), tax = 0, prev = 0;
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            tax += (Math.min(t, cap) - prev) * rate;
            prev = cap;
          } else break;
        }
        return tax;
      }
      function computeSaltCap(agi, status) {
        var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
        var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
        var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
        return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
      }
      function computeSsTaxableUsd(grossSsUsd, otherAgiExclSs, taxExemptInterestUsd, status) {
        if (grossSsUsd <= 0) return 0;
        var baseAmt = T.SS_PROVISIONAL_INCOME_BASE_USD[status] != null ? T.SS_PROVISIONAL_INCOME_BASE_USD[status] : T.SS_PROVISIONAL_INCOME_BASE_USD.single;
        var addlAmt = T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] != null ? T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD[status] : T.SS_PROVISIONAL_INCOME_ADDITIONAL_USD.single;
        var line2 = 0.5 * grossSsUsd;
        var line5 = line2 + Math.max(0, otherAgiExclSs) + Math.max(0, taxExemptInterestUsd);
        var line7 = Math.max(0, line5 - baseAmt);
        if (line7 <= 0) return 0;
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
      function computeUsTaxCore(d, extraLtcgUsd, extraStcgUsd) {
        var inc = d.incUs, ded = d.dedUs, status = d.usFilingStatusRaw, worldwide = d.worldwideUs, feie = d.feie;
        var brackets = T.BRACKETS[status] || T.BRACKETS.single;
        var fW = worldwide ? inc.foreignWages.usd : 0;
        var fSE = worldwide ? inc.foreignSelfEmployment.usd : 0;
        var feieAppliedUsd = 0;
        if (worldwide && feie.claimed && feie.eligible && fW + fSE > 0) {
          var feieEarnedBaseUsd = fW + fSE;
          var feieBase = feie.amountClaimedUsd > 0 ? feie.amountClaimedUsd : feieEarnedBaseUsd;
          feieAppliedUsd = Math.min(feieEarnedBaseUsd, feieBase, FEIE_MAX_USD);
          var feieAppliedToWagesUsd = Math.min(fW, feieAppliedUsd);
          fW = fW - feieAppliedToWagesUsd;
          fSE = fSE - (feieAppliedUsd - feieAppliedToWagesUsd);
        }
        var fI = worldwide ? inc.foreignInterest.usd : 0, fD = worldwide ? inc.foreignDividends.usd : 0;
        var fR = worldwide ? inc.foreignRental.usd : 0, fP = worldwide ? inc.foreignPension.usd : 0;
        var fStcg = worldwide ? inc.foreignStcg.usd + (extraStcgUsd || 0) : 0;
        var fLtcg = worldwide ? inc.foreignLtcg.usd + (extraLtcgUsd || 0) : 0;
        var nonQualDivUs = Math.max(0, inc.ordinaryDividendsUs.usd - inc.qualifiedDividendsUs.usd);
        var ordinaryIncomeExclSs = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0) + inc.interestUs.usd + fI + nonQualDivUs + fD + inc.stcgUs.usd + fStcg + inc.rentalUs.usd + fR + fP + (inc.usRetirementIncomeExclSs ? inc.usRetirementIncomeExclSs.usd : inc.usRetirementIncome ? inc.usRetirementIncome.usd : 0);
        var preferentialIncome = inc.ltcgUs.usd + fLtcg + inc.qualifiedDividendsUs.usd;
        var grossSsUsd = inc.socialSecurityUs && inc.socialSecurityUs.usd || 0;
        var taxExemptInterestUsd = inc.taxExemptInterestUs && inc.taxExemptInterestUs.usd || 0;
        var taxableSsUsd = computeSsTaxableUsd(grossSsUsd, ordinaryIncomeExclSs + preferentialIncome, taxExemptInterestUsd, status);
        var ordinaryIncome = ordinaryIncomeExclSs + taxableSsUsd;
        var totalIncome = ordinaryIncome + preferentialIncome;
        var seNet = (inc.seEarningsUsd || 0) * T.SE_NET_FACTOR;
        var ssWagesAlready = inc.medicareWages || inc.wages.usd || 0;
        var ssBaseRemaining = Math.max(0, T.SS_WAGE_BASE_USD - ssWagesAlready);
        var seTax = seNet > 0 ? T.SE_RATE_SS * Math.min(seNet, ssBaseRemaining) + T.SE_RATE_MEDICARE * seNet : 0;
        var halfSeDeduction = seTax / 2;
        var seHealthDeduction = Math.min(ded.seHealthInsuranceDeductionUsd || 0, Math.max(0, seNet));
        var adjustments = Math.min(ded.studentLoanInterest, 2500) + halfSeDeduction + seHealthDeduction + (ded.seRetirementDeductionUsd || 0);
        var agi = Math.max(0, totalIncome - adjustments);
        var standard = T.STD_DEDUCTION[status] || T.STD_DEDUCTION.single;
        var saltCapUsd = computeSaltCap(agi, status);
        var itemized = Math.min(ded.salt, saltCapUsd) + ded.mortgageInterest + ded.charitable + Math.max(0, ded.medical - 0.075 * agi);
        var deduction = ded.mode === "itemized" ? itemized : ded.mode === "standard" ? standard : Math.max(standard, itemized);
        var taxpayerAge = null;
        if (d.taxpayerDobRaw) {
          var dobYear = new Date(d.taxpayerDobRaw).getFullYear();
          if (!isNaN(dobYear)) taxpayerAge = (d.baseYearUs || 2025) - dobYear;
        }
        var isSenior = taxpayerAge !== null && taxpayerAge >= T.SENIOR_DEDUCTION_MIN_AGE && status !== "mfs";
        var seniorPhaseoutThr = T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD[status] || T.SENIOR_DEDUCTION_PHASEOUT_THRESHOLD_USD.single;
        var seniorDeductionUsd = isSenior ? Math.max(0, Math.round(T.SENIOR_DEDUCTION_PER_PERSON_USD - T.SENIOR_DEDUCTION_PHASEOUT_RATE * Math.max(0, agi - seniorPhaseoutThr))) : 0;
        var isMfs = status === "mfs";
        var tipsOtPhaseoutThr = T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD[status] || T.TIPS_OVERTIME_PHASEOUT_THRESHOLD_USD.single;
        var tipsOtPhaseoutReduction = Math.ceil(Math.max(0, agi - tipsOtPhaseoutThr) / 1e3) * T.TIPS_OVERTIME_PHASEOUT_PER_1000_USD;
        var qualifiedTipsUsd = isMfs ? 0 : inc.qualifiedTipsUsd || 0;
        var qualifiedOvertimeUsd = isMfs ? 0 : inc.qualifiedOvertimeUsd || 0;
        var tipsDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedTipsUsd, T.TIPS_DEDUCTION_MAX_USD) - tipsOtPhaseoutReduction));
        var overtimeMaxUsd = T.OVERTIME_DEDUCTION_MAX_USD[status] || T.OVERTIME_DEDUCTION_MAX_USD.single;
        var overtimeDeductionUsd = isMfs ? 0 : Math.max(0, Math.round(Math.min(qualifiedOvertimeUsd, overtimeMaxUsd) - tipsOtPhaseoutReduction));
        var taxableBeforeQbi = Math.max(0, agi - deduction - seniorDeductionUsd - tipsDeductionUsd - overtimeDeductionUsd);
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
        var prefTaxable = Math.min(preferentialIncome, taxableIncome);
        var ordTaxable = taxableIncome - prefTaxable;
        var ordinaryTax = bracketTax(ordTaxable, brackets);
        var lb = T.LTCG_BRACKETS[status] || T.LTCG_BRACKETS.single;
        var start = ordTaxable;
        var amt0 = Math.max(0, Math.min(lb.br0 - start, prefTaxable));
        var remAfter0 = prefTaxable - amt0;
        var amt15 = Math.max(0, Math.min(lb.br15 - Math.max(start, lb.br0), remAfter0));
        var amt20 = remAfter0 - amt15;
        var preferentialTax = amt15 * 0.15 + amt20 * 0.2;
        var incomeTax = ordinaryTax + preferentialTax;
        var netInvestmentIncome = inc.interestUs.usd + fI + inc.ordinaryDividendsUs.usd + fD + inc.capitalGainsUs.usd + fStcg + fLtcg + inc.rentalUs.usd + fR;
        var niitThreshold = NIIT_THRESHOLD[status] || 2e5;
        var niit = T.NIIT_RATE * Math.min(Math.max(0, netInvestmentIncome), Math.max(0, agi - niitThreshold));
        var addlMedicare = d.additionalMedicareOwedBoundary;
        var usedMode = ded.mode === "itemized" || ded.mode === "standard" ? ded.mode : itemized > standard ? "itemized" : "standard";
        var amtAddback = usedMode === "standard" ? deduction : Math.min(ded.salt, saltCapUsd);
        var amtiUsd = Math.max(0, taxableIncome + amtAddback + (ded.amtPrefs || 0));
        var amtExFull = T.AMT_EXEMPTION[status] || T.AMT_EXEMPTION.single;
        var amtPhase = T.AMT_PHASEOUT[status] || T.AMT_PHASEOUT.single;
        var amtExemption = Math.max(0, amtExFull - T.AMT_PHASEOUT_RATE * Math.max(0, amtiUsd - amtPhase));
        var amtBase = Math.max(0, amtiUsd - amtExemption);
        var amtOrdBase = Math.max(0, amtBase - prefTaxable);
        var amtBrk = status === "mfs" ? T.AMT_RATE_BREAK / 2 : T.AMT_RATE_BREAK;
        var tmtOrd = amtOrdBase <= amtBrk ? amtOrdBase * T.AMT_RATE_LOW : amtBrk * T.AMT_RATE_LOW + (amtOrdBase - amtBrk) * T.AMT_RATE_HIGH;
        var amtOwed = Math.max(0, Math.round(tmtOrd + preferentialTax - incomeTax));
        var magi = agi;
        var eduLo = status === "mfj" ? 16e4 : 8e4, eduHi = status === "mfj" ? 18e4 : 9e4;
        var eduPhase = magi <= eduLo ? 1 : magi >= eduHi ? 0 : 1 - (magi - eduLo) / (eduHi - eduLo);
        var careCap = ded.dependents >= 2 ? 6e3 : 3e3;
        var childCareCredit = 0.2 * Math.min(ded.careExpenses || 0, careCap);
        var aotcCredit = Math.min(ded.aotc || 0, 2500 * Math.max(1, ded.dependents || 1)) * eduPhase;
        var llcCredit = Math.min(ded.lifetimeLearning || 0, 2e3) * eduPhase;
        var otherCreditsUsd = Math.min(Math.round(childCareCredit + aotcCredit + llcCredit), Math.round(incomeTax));
        var numChildrenForCtc = ded.dependents || 0;
        var ctcPhaseoutThr = T.CTC_PHASEOUT_THRESHOLD_USD[status] || T.CTC_PHASEOUT_THRESHOLD_USD.single;
        var ctcMaxTotalUsd = T.CTC_PER_CHILD_USD * numChildrenForCtc;
        var ctcPhaseoutReductionUsd = Math.ceil(Math.max(0, agi - ctcPhaseoutThr) / 1e3) * T.CTC_PHASEOUT_PER_1000_USD;
        var ctcAvailableUsd = Math.max(0, ctcMaxTotalUsd - ctcPhaseoutReductionUsd);
        var remainingTaxAfterOtherCredits = Math.max(0, Math.round(incomeTax) - otherCreditsUsd);
        var ctcNonRefundableUsd = Math.min(ctcAvailableUsd, remainingTaxAfterOtherCredits);
        var ctcUnusedUsd = ctcAvailableUsd - ctcNonRefundableUsd;
        var earnedIncomeUsd = inc.wages.usd + fW + fSE + (inc.businessUs ? inc.businessUs.usd : 0);
        var actcCapUsd = Math.min(T.CTC_REFUNDABLE_MAX_PER_CHILD_USD * numChildrenForCtc, T.CTC_REFUNDABLE_RATE * Math.max(0, earnedIncomeUsd - T.CTC_REFUNDABLE_EARNED_INCOME_FLOOR_USD));
        var ctcRefundableUsd = Math.round(Math.max(0, Math.min(ctcUnusedUsd, actcCapUsd)));
        var creditsUsd = otherCreditsUsd + ctcNonRefundableUsd + ctcRefundableUsd;
        var totalTaxBeforeFtc = incomeTax + niit + addlMedicare + seTax + amtOwed - creditsUsd;
        return { totalTaxBeforeFtcUsd: totalTaxBeforeFtc };
      }
      NODES.holdingPeriodMismatchFindingsResult = {
        deps: [
          "capitalGainsComputation",
          "incUs",
          "dedUs",
          "usFilingStatusRaw",
          "worldwideUs",
          "feie",
          "additionalMedicareOwedBoundary",
          "taxpayerDobRaw",
          "baseYearUs",
          "usEntityKind",
          "treatyFiles1040nrRaw",
          "s6013hElection"
        ],
        compute: function(d) {
          var findings = [];
          function add(id, severity, category, title, detail, recommendation, amountUsd, refs) {
            findings.push({ id, severity, category, title, detail, recommendation, amountUsd: amountUsd || 0, refs: refs || [] });
          }
          var routesAwayFromIndividual = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) >= 0 || d.treatyFiles1040nrRaw && !d.s6013hElection;
          var holdingMismatches = routesAwayFromIndividual ? [] : d.capitalGainsComputation.holdingPeriodMismatches || [];
          holdingMismatches.forEach(function(mm, mi) {
            var asLtcg = computeUsTaxCore(d, mm.gainUsd, 0);
            var asStcg = computeUsTaxCore(d, 0, mm.gainUsd);
            var deltaUsd = asStcg.totalTaxBeforeFtcUsd - asLtcg.totalTaxBeforeFtcUsd;
            if (Math.abs(deltaUsd) < 1) return;
            var correctIsLtcg = mm.usClassification === "ltcg";
            var assetLabel = mm.sourceType === "buyback" ? "buy-back" : "foreign equity holding";
            var ltcgSection = mm.isListed ? "s.198" : "s.197";
            add(
              "holding_period_mismatch_" + mi,
              "warning",
              "treaty",
              mm.companyName + " " + assetLabel + ": " + Math.round(mm.monthsHeld) + " months held \u2014 India says " + mm.indiaClassification.toUpperCase() + ", US says " + mm.usClassification.toUpperCase() + " (" + usd(Math.abs(deltaUsd)) + " at stake)",
              "This " + (mm.isListed ? "listed" : "unlisted") + " " + assetLabel + " was held " + Math.round(mm.monthsHeld) + " months. India requires more than " + mm.indiaThresholdMonths + " months for LTCG on " + (mm.isListed ? "listed" : "unlisted") + " shares, so this is " + mm.indiaClassification.toUpperCase() + " there (taxed " + (mm.indiaClassification === "ltcg" ? "at 12.5%, " + ltcgSection + (mm.isListed ? " (\u20B91,25,000 exemption pool)" : " (no exemption, taxable from \u20B91)") : mm.isListed ? "at 20%, s.196" : "at your India slab rate") + "). The US requires only more than 12 months for LTCG on any asset \u2014 no listed/unlisted distinction \u2014 so the SAME gain is " + mm.usClassification.toUpperCase() + " under US rules. Recomputed your actual US return both ways: treated as LTCG, US tax is " + usd(asLtcg.totalTaxBeforeFtcUsd) + "; treated as STCG (ordinary rates), US tax is " + usd(asStcg.totalTaxBeforeFtcUsd) + " \u2014 a difference of " + usd(Math.abs(deltaUsd)) + ".",
              correctIsLtcg ? "Report this gain as LONG-TERM on the US return (Schedule D) even though it's short-term in India \u2014 using India's label on the US foreign-capital-gains input would cost roughly " + usd(Math.abs(deltaUsd)) + " in overpaid US tax." : "Report this gain as SHORT-TERM on the US return even though it's long-term in India \u2014 using India's label on the US foreign-capital-gains input would understate US tax by roughly " + usd(Math.abs(deltaUsd)) + ".",
              Math.abs(deltaUsd),
              ["Holding period", ltcgSection + " vs IRC \xA71222", mm.sourceType === "buyback" ? "Share buyback" : "Foreign equity"]
            );
          });
          return findings;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/report-batch1-nodes.js
  var require_report_batch1_nodes = __commonJS({
    "prototypes/graph-pilot/report-batch1-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      function moneyFromInr(v, ctx) {
        return { inr: v, usd: inrToUsd(v, ctx) };
      }
      function moneyFromUsd(v, ctx) {
        return { usd: v, inr: v * fxRate(ctx) };
      }
      function addMoney(a, b) {
        return { usd: a.usd + b.usd, inr: a.inr + b.inr };
      }
      function zeroMoney() {
        return { usd: 0, inr: 0 };
      }
      function calc(formula, parts, citation) {
        return { kind: "calc", formula, parts: parts || [], citation: citation || null };
      }
      function source(detail, citation) {
        return { kind: "source", detail, citation: citation || null };
      }
      function holdings(section, note) {
        return { kind: "holdings", section, note: note || null };
      }
      var findingsBatch6Nodes = require_findings_batch6_nodes().NODES;
      var NODES = {};
      Object.keys(findingsBatch6Nodes).forEach(function(k) {
        NODES[k] = findingsBatch6Nodes[k];
      });
      function indiaBusinessTurnoverInr(entries) {
        var totalInr = 0, cashInr = 0;
        (entries || []).forEach(function(b) {
          var digital = num(b.digital_receipts_inr) + num(b.ada_digital_receipts_inr);
          var cash = num(b.cash_receipts_inr) + num(b.ada_cash_receipts_inr);
          var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || digital + cash;
          totalInr += receipts;
          cashInr += cash;
        });
        return { totalInr, cashInr };
      }
      NODES.accountsListResult = {
        deps: ["bankAccountsRaw", "hasUsScopeBoundaryFtc"],
        compute: function(d, ctx) {
          var indianAccounts = d.bankAccountsRaw.india.map(function(b) {
            return { bank: b.bank_name || "Indian Bank", type: b.account_type || "savings", peak: moneyFromInr(b.peak_balance_inr || 0, ctx), country: "India" };
          });
          var usDisclosed = d.bankAccountsRaw.us.map(function(b) {
            return {
              bank: b.bank_name || "Bank",
              type: b.account_type || "savings",
              peak: b.peak_balance_usd !== void 0 ? moneyFromUsd(b.peak_balance_usd, ctx) : moneyFromInr(b.peak_balance_inr || 0, ctx),
              country: b.country || "India"
            };
          });
          var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
          var formFbar = d.bankAccountsRaw.usFormFbar;
          var aggregatePeak = formFbar > 0 ? moneyFromUsd(formFbar, ctx) : !d.hasUsScopeBoundaryFtc ? zeroMoney() : accounts.reduce(function(acc, a) {
            return addMoney(acc, a.peak);
          }, zeroMoney());
          return { accounts, aggregatePeak };
        }
      };
      NODES.taxCreditsIndiaRaw = {
        deps: [],
        compute: function(d, ctx) {
          var tc = safe(ctx.india, "tax_credits", {});
          return {
            q1: num(safe(tc, "advance_tax_q1_15jun_inr", 0)),
            q2: num(safe(tc, "advance_tax_q2_15sep_inr", 0)),
            q3: num(safe(tc, "advance_tax_q3_15dec_inr", 0)),
            q4: num(safe(tc, "advance_tax_q4_15mar_inr", 0)),
            tdsAlreadyDeducted: num(safe(tc, "tds_already_deducted_inr", 0)),
            tds: num(safe(tc, "tds_inr", 0)),
            tcs: num(safe(tc, "tcs_inr", 0))
          };
        }
      };
      NODES.taxesPaidIndiaResult = {
        deps: ["taxCreditsIndiaRaw"],
        compute: function(d, ctx) {
          var tc = d.taxCreditsIndiaRaw;
          var advance = tc.q1 + tc.q2 + tc.q3 + tc.q4;
          var tds = tc.tdsAlreadyDeducted + tc.tds;
          return { advance: moneyFromInr(advance, ctx), tds: moneyFromInr(tds, ctx), tcs: moneyFromInr(tc.tcs, ctx), total: moneyFromInr(advance + tds + tc.tcs, ctx) };
        }
      };
      NODES.entityFormsResult = {
        deps: ["indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "indiaLayer1ItrRaw", "usEntityKind", "treatyFiles1040nrRaw"],
        compute: function(d) {
          var crude = d.indiaIsCompany ? "ITR-6" : d.indiaIsTrust ? "ITR-7" : d.indiaIsFirm || d.indiaIsAop ? "ITR-5" : "ITR-2/3";
          var indiaReturnForm = d.indiaLayer1ItrRaw || crude;
          var usT = d.usEntityKind;
          var usReturnForm = usT === "ccorp" ? "1120" : usT === "scorp" ? "1120-S" : usT === "partnership" ? "1065" : usT === "trust" ? "1041" : d.treatyFiles1040nrRaw ? "1040-NR" : "1040";
          return { indiaReturnForm, usReturnForm };
        }
      };
      NODES.indianMutualFundsResult = {
        deps: ["indiaFinancialHoldingsTxRaw"],
        compute: function(d) {
          return d.indiaFinancialHoldingsTxRaw.filter(function(t) {
            return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0;
          });
        }
      };
      NODES.usPficHoldingsRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "foreign_entities.pfic_holdings", []) || [];
      } };
      NODES.usSecuritiesRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "financial_holdings", []) || [];
      } };
      NODES.usOwnsForeignDisregardedEntityRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "foreign_entities.owns_foreign_disregarded_entity", false) === true;
      } };
      NODES.usSelfEmploymentRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "income_us_source.self_employment", []) || [];
      } };
      NODES.indiaOpt115baaRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "profile.opt_115baa", false) === true;
      } };
      NODES.indiaOpt115babRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.india, "profile.opt_115bab", false) === true;
      } };
      var CONST_B1_LIMITS = require_constants().CONST.LIMITS;
      var FORM_8938 = CONST_B1_LIMITS.FORM_8938;
      NODES.form8938GaugeResult = {
        deps: ["feie", "usFilingStatusRaw", "accountsListResult", "hasUsScopeBoundaryFtc"],
        compute: function(d) {
          if (!d.hasUsScopeBoundaryFtc) return null;
          var isMfj = d.usFilingStatusRaw === "mfj";
          var abroad = d.feie.taxHomeAbroad && d.feie.testMet;
          var tbl = FORM_8938[abroad ? isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE" : isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE"];
          var valueUsd = d.accountsListResult.aggregatePeak.usd;
          var pct = tbl.anyTime > 0 ? valueUsd / tbl.anyTime : 0;
          var status = pct >= 1 ? "breached" : pct >= 0.8 ? "approaching" : "ok";
          return { id: "form8938", value: valueUsd, limit: tbl.anyTime, pct, status };
        }
      };
      NODES.headlineTotalIncomeUsdResult = {
        deps: ["totalIndiaIncomeInr", "aggregateUsIncomeResult"],
        compute: function(d, ctx) {
          return inrToUsd(d.totalIndiaIncomeInr, ctx) + d.aggregateUsIncomeResult.total.usd;
        }
      };
      var DOCUMENTS_CATALOG = [
        { id: "fincen_114", jurisdiction: "US", name: "FinCEN Form 114 (FBAR)", desc: "Report of Foreign Bank and Financial Accounts.", why: "Aggregate peak balance across all foreign (Indian) accounts exceeded USD 10,000.", severity: "critical" },
        { id: "form_8938", jurisdiction: "US", name: "IRS Form 8938 (FATCA)", desc: "Statement of Specified Foreign Financial Assets, filed with Form 1040.", why: "Specified foreign financial assets exceeded the Form 8938 reporting threshold for your filing status/residence.", severity: "critical" },
        { id: "form_1116", jurisdiction: "US", name: "IRS Form 1116 (Foreign Tax Credit)", desc: "Claims credit for income tax paid to India against US tax liability.", why: "Indian income tax was paid on income that is also taxable in the US.", severity: "warning" },
        { id: "form_2555", jurisdiction: "US", name: "IRS Form 2555 (FEIE)", desc: "Foreign Earned Income Exclusion / foreign housing exclusion.", why: "FEIE was elected on foreign earned income.", severity: "info" },
        { id: "form_8833", jurisdiction: "US", name: "IRS Form 8833 (Treaty-Based Position)", desc: "Discloses a treaty-based return position (e.g. Article 4 tie-breaker).", why: "A DTAA tie-breaker or treaty rate is being relied upon to override default US taxation.", severity: "critical" },
        { id: "form_8621", jurisdiction: "US", name: "IRS Form 8621 (PFIC)", desc: "Information return for Passive Foreign Investment Companies \u2014 one per fund.", why: "Holdings in Indian mutual funds / ETFs are PFICs and require annual reporting (punitive \xA71291 regime unless QEF/MTM elected).", severity: "critical" },
        { id: "form_5471", jurisdiction: "US", name: "IRS Form 5471 (CFC)", desc: "Information return for US persons owning \u226510% of a foreign corporation.", why: "You own \u226510% of an Indian company \u2014 potential Subpart F / GILTI inclusion.", severity: "warning" },
        { id: "form_8865", jurisdiction: "US", name: "IRS Form 8865", desc: "Return for US persons with interests in a foreign partnership.", why: "You hold an interest in an Indian partnership/LLP.", severity: "warning" },
        { id: "form_3520", jurisdiction: "US", name: "IRS Form 3520 / 3520-A", desc: "Reporting of foreign gifts and transactions with foreign trusts.", why: "Foreign gift > USD 100,000 received, or you are a grantor/beneficiary of a foreign trust (note: Indian PPF/EPF may be treated as trusts).", severity: "warning" },
        { id: "form_1040nr", jurisdiction: "US", name: "IRS Form 1040-NR", desc: "Non-resident alien income tax return.", why: "You are (or elect to be treated as) a US non-resident alien for this year.", severity: "info" },
        { id: "form_8960", jurisdiction: "US", name: "IRS Form 8960 (NIIT)", desc: "Net Investment Income Tax (3.8%).", why: "MAGI exceeded the NIIT threshold and net investment income is present.", severity: "info" },
        { id: "form_8959", jurisdiction: "US", name: "IRS Form 8959 (Additional Medicare Tax)", desc: "Additional 0.9% Medicare tax on wages/SE income above the filing-status threshold, and reconciles employer over/under-withholding.", why: "Additional Medicare Tax is owed and is not offset by the Foreign Tax Credit.", severity: "info" },
        { id: "form_540", jurisdiction: "US", name: "California Form 540 (Resident Income Tax Return)", desc: "California state income tax return \u2014 computed on worldwide income for a full-year CA resident, including Indian-source income. CA grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to California, and CA taxes worldwide income independently of the federal treaty position.", severity: "warning" },
        { id: "form_it201", jurisdiction: "US", name: "New York Form IT-201 (Resident Income Tax Return)", desc: "New York state income tax return \u2014 computed on worldwide income for a full-year NY resident, including Indian-source income. NY grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to New York, and NY taxes worldwide income independently of the federal treaty position.", severity: "warning" },
        // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.7, 21
        // Jul 2026): new document trigger, no engine equivalent (NJ wasn't
        // modeled at all before this) — see findings-batch5-nodes.js's
        // usStateTaxResult.
        { id: "form_nj1040", jurisdiction: "US", name: "New Jersey Form NJ-1040 (Resident Income Tax Return)", desc: "New Jersey state income tax return \u2014 computed on worldwide income for a full-year NJ resident, including Indian-source income. NJ grants no credit for tax paid to a foreign country.", why: "State-of-residence facts on file point to New Jersey, and NJ taxes worldwide income independently of the federal treaty position.", severity: "warning" },
        // DELIBERATE DAG/engine divergence, same pattern as form_nj1040 above:
        // a brand-new document, not a fixed-up existing trigger, so per the
        // standing frozen-engine policy it's added DAG-only (docs/GAP_TRACKER.md,
        // 22 Jul 2026 audit's catalog-completeness pass). Reg. §1.6038-2 requires
        // Form 8858 from a US person who owns a foreign disregarded entity — Layer
        // 1 US collects TWO real signals for this (foreign_entities.
        // owns_foreign_disregarded_entity, a direct flag; and a Schedule C row
        // with llc_type "foreign_disregarded", the same field normalize.js
        // already reads to route income into foreignSelfEmployment) but the
        // 31-entry catalog had no Form 8858 row at all — confirmed via
        // us_citizen_expat_india (Grace Thomas), who has a real foreign
        // disregarded entity on file (an India-based consulting sole
        // proprietorship) and got no Form 8858 prompt whatsoever.
        { id: "form_8858", jurisdiction: "US", name: "IRS Form 8858 (Foreign Disregarded Entities)", desc: "Information return for US persons who own a foreign disregarded entity or foreign branch.", why: "A foreign disregarded entity is on file (Reg. \xA71.6038-2) \u2014 a single-owner foreign business entity, or a foreign branch of a US business, that isn't itself taxed as a corporation.", severity: "warning" },
        // DELIBERATE DAG/engine divergence, same pattern as form_8858 above — see
        // docs/GAP_TRACKER.md, second (external-research) catalog-completeness
        // pass. This is the ANNUAL RETURN OF THE TRUST ITSELF (or its US agent),
        // separate from form_3520 (the US owner/beneficiary's own return) — a US
        // person treated as the OWNER (not just a beneficiary) of a foreign trust
        // under the grantor-trust rules must ALSO ensure the trust files this.
        // Reuses the same ppfInr/epfInr ownership-signal subset of form_3520's own
        // condition (Indian PPF/EPF accounts are commonly treated as foreign
        // grantor trusts for this purpose) — deliberately NOT the gift-received/
        // beneficiary-distribution subset, since those don't make the US person
        // the trust's "owner."
        { id: "form_3520a", jurisdiction: "US", name: "IRS Form 3520-A (Annual Information Return of Foreign Trust)", desc: "Annual return filed by (or on behalf of) a foreign trust with a US owner \u2014 distinct from Form 3520, which the US owner/beneficiary files themselves.", why: "A US person is treated as the owner of a foreign trust for grantor-trust purposes (e.g. an Indian PPF/EPF account) \u2014 the trust itself (or a US agent) must file this annually, in addition to the owner's own Form 3520.", severity: "warning" },
        // DELIBERATE DAG/engine divergence, same pattern — s.115JB requires a CA-
        // certified book-profit report whenever MAT actually applies. The engine
        // already computes this exact signal (computed.indiaTax.matApplied,
        // computation.js's computeIndiaEntityTax) but never promoted it to a
        // Filings-tab document — same "computed elsewhere, never surfaced as a
        // filing requirement" pattern as form_6251/AMT before Batch B.
        { id: "form_29b", jurisdiction: "IN", name: "Form 29B (MAT Report)", desc: "Chartered Accountant's report certifying book profit under s.115JB, filed when Minimum Alternate Tax applies.", why: "MAT (s.115JB) applies this year \u2014 tax computed on book profit exceeds tax computed under the normal provisions.", severity: "warning" },
        // DELIBERATE DAG/engine divergence, same pattern. An individual/HUF with
        // business/professional income who elects the OLD regime (opting out of
        // the s.115BAC default) must file this declaration by the s.139(1) due
        // date — a salaried/other-income-only filer can just tick a box on the
        // ITR itself instead, no separate form. Reuses the exact condition
        // already independently derived for the (separate, diagnostic-only)
        // "form_10iea" entry in checks-registry-nodes.js.
        { id: "form_10iea", jurisdiction: "IN", name: "Form 10-IEA (Old Regime Election)", desc: "Declaration to opt out of the default new tax regime (s.115BAC) \u2014 or to switch back \u2014 required for an individual/HUF with business/professional income.", why: "The old tax regime is elected on file, and business/professional income is present \u2014 this combination requires a filed Form 10-IEA, not just a checkbox on the ITR.", severity: "info" },
        // DELIBERATE DAG/engine divergence, same pattern — Form 10-IEA's COMPANY-
        // side equivalents. A domestic company opting into the s.115BAA 22%
        // concessional rate (indiaOpt115baaRaw) must file Form 10-IC; a domestic
        // company opting into the s.115BAB 15% new-manufacturing rate
        // (indiaOpt115babRaw) must file Form 10-ID instead — the two elections are
        // mutually exclusive and each has its own form, not a shared one. Both
        // flags already drive entitytax-nodes.js's actual rate/surcharge
        // computation (the india_pvt_ltd demo profile has opt_115baa: true on
        // file already) but neither was ever promoted to a Filings-tab document.
        { id: "form_10ic", jurisdiction: "IN", name: "Form 10-IC (s.115BAA Election)", desc: "Declaration to opt into the 22% concessional corporate tax rate under s.115BAA.", why: "The company has elected the s.115BAA concessional rate on file \u2014 this election requires a filed Form 10-IC (on or before the return due date), not just the rate applied silently.", severity: "info" },
        { id: "form_10id", jurisdiction: "IN", name: "Form 10-ID (s.115BAB Election)", desc: "Declaration to opt into the 15% concessional rate for new manufacturing companies under s.115BAB.", why: "The company has elected the s.115BAB new-manufacturing concessional rate on file \u2014 this election requires a filed Form 10-ID, distinct from (and mutually exclusive with) Form 10-IC.", severity: "info" },
        { id: "form_67", jurisdiction: "IN", name: "Form 44 (India FTC)", desc: "Statement of foreign income & foreign tax, filed before the ITR due date.", why: "Foreign (US) income is being offered to tax in India and FTC u/s 90/91 is claimed. Schedule FSI/TR must accompany the ITR.", severity: "critical" },
        { id: "trc", jurisdiction: "IN", name: "Tax Residency Certificate (TRC)", desc: "Issued by the other contracting state (IRS Form 6166 for the US).", why: "DTAA relief / treaty rate is being claimed \u2014 a TRC is mandatory u/s 159(8).", severity: "critical" },
        { id: "form_10f", jurisdiction: "IN", name: "Form 41", desc: "Self-declaration accompanying the TRC, filed electronically on the ITR portal.", why: "Treaty benefit claimed and the TRC does not contain all particulars required u/r 75.", severity: "warning" },
        { id: "schedule_fa", jurisdiction: "IN", name: "Schedule FA (Foreign Assets)", desc: "Disclosure of foreign assets/accounts in the Indian ITR.", why: "You are Resident & Ordinarily Resident (ROR) and hold US bank accounts, securities or other foreign assets.", severity: "critical" },
        { id: "schedule_fsi_tr", jurisdiction: "IN", name: "Schedule FSI & Schedule TR", desc: "Foreign Source Income and Tax Relief schedules in the ITR.", why: "Foreign income is offered to tax and relief u/s 90/91 is claimed.", severity: "warning" },
        { id: "form_15ca_cb", jurisdiction: "IN", name: "Form 145 / Form 146 (was 15CA / 15CB)", desc: "Remittance certificates for foreign outward remittances.", why: "Outward remittances under LRS / to non-residents were made during the year. Renumbered from Form 15CA/15CB effective 1 Apr 2026 under the Income-tax Rules, 2026 (Rule 220) \u2014 the old numbers still apply to remittances made before that date.", severity: "info" },
        { id: "schedule_al", jurisdiction: "IN", name: "Schedule AL (Assets & Liabilities)", desc: "Disclosure of assets and liabilities at cost, filed with the ITR.", why: "Total income exceeds \u20B950 lakh \u2014 Schedule AL is mandatory at this threshold u/s 139(1) (ITR-2/3/5 filers).", severity: "warning" },
        { id: "form_3cb_3cd", jurisdiction: "IN", name: "Form 3CB / 3CD (Tax Audit Report)", desc: "Chartered Accountant's tax-audit report and statement of particulars, filed before the ITR due date.", why: "Business turnover exceeds the s.44AB tax-audit threshold (\u20B91 crore, or \u20B910 crore where cash receipts and payments are each \u22645% of the total).", severity: "critical" },
        { id: "form_8802", jurisdiction: "US", name: "IRS Form 8802 (Application for US Residency Certification)", desc: "Application to the IRS for Form 6166 \u2014 the US residency certificate India's TRC requirement expects the other contracting state to issue.", why: "DTAA relief is being claimed on Indian-source income \u2014 Form 6166 must be requested via Form 8802 before it can be filed with the Indian TRC/Form 41 paperwork; IRS processing typically takes 4-6+ weeks, so file well ahead of the India due date.", severity: "warning" },
        { id: "form_6251", jurisdiction: "US", name: "IRS Form 6251 (Alternative Minimum Tax)", desc: "Computes AMT and reconciles it against regular tax liability.", why: "AMT preference items (commonly an ISO exercise, or the SALT-cap add-back) push tentative minimum tax above the regular tax for the year.", severity: "warning" },
        { id: "form_8288", jurisdiction: "US", name: "IRS Form 8288 / 8288-A / 8288-B (FIRPTA Withholding)", desc: "Withholding certificate and returns for a foreign person's disposition of US real property.", why: "A US real property interest was disposed of by a foreign person \u2014 15% FIRPTA withholding applies at closing unless a Form 8288-B withholding certificate reduces it.", severity: "warning" },
        { id: "form_3ceb", jurisdiction: "IN", name: "Form 3CEB (Transfer Pricing Certification)", desc: "Chartered Accountant's report on international transactions with associated enterprises, filed before the ITR due date u/s 92E.", why: "A cross-border related-party ownership relationship is on file \u2014 international transactions with that entity must be reported and certified, independent of whether pricing is at arm's length.", severity: "warning" },
        { id: "form_26as_ais_tis", jurisdiction: "IN", name: "Form 26AS / AIS / TIS", desc: "Annual tax-credit statement (26AS) and the Annual/Taxpayer Information Statements \u2014 the pre-filled record every ITR should be reconciled against before filing.", why: "Indian income is on file for this taxpayer \u2014 TDS, advance tax and reported high-value transactions should be cross-checked against these statements before the return is filed.", severity: "info" },
        { id: "form_16_16a", jurisdiction: "IN", name: "Form 16 / Form 16A (TDS Certificates)", desc: "Salary (Form 16) and non-salary (Form 16A) TDS certificates issued by each deductor.", why: "Indian income subject to TDS is on file \u2014 hold the certificate from each deductor to reconcile against Form 26AS/AIS and support the credit claimed in the ITR.", severity: "info" },
        { id: "lrs_form_a2", jurisdiction: "IN", name: "LRS Form A2 (Outward Remittance Declaration)", desc: "Declaration furnished to the remitting bank for each outward remittance under the Liberalised Remittance Scheme.", why: "Outward remittances under LRS were made this year \u2014 each remittance requires its own Form A2 filed with the bank at the time of transfer, separate from the annual Form 145/146 (was 15CA/15CB) return-time reporting.", severity: "info" },
        { id: "form_4868", jurisdiction: "US", name: "IRS Form 4868 (Extension Request)", desc: "Automatic 6-month extension of time to file (not to pay) the US return.", why: "Must be filed by the original due date to legally reach the extended deadline already on your Compliance Calendar \u2014 the extension does not happen automatically.", severity: "info" }
      ];
      NODES.buildDocumentsResult = {
        deps: [
          "residencyResult",
          "accountsListResult",
          "form8938GaugeResult",
          "taxesPaidIndiaResult",
          "entityFormsResult",
          "feieRaw",
          "treatyUsResidenceRaw",
          "treatyFiles1040nrRaw",
          "treatyIndiaResidenceRaw",
          "indianMutualFundsResult",
          "usPficHoldingsRaw",
          "usSecuritiesRaw",
          "usOwnsForeignDisregardedEntityRaw",
          "usSelfEmploymentRaw",
          "bizEntriesAgg",
          "ppfInrRaw",
          "epfInrRaw",
          "foreignGiftsRaw",
          "usTaxResult",
          "headlineTotalIncomeUsdResult",
          "usFilingStatusRaw",
          "aggregateUsIncomeResult",
          "taxesPaidUsResult",
          "hasIndiaScopeXbr",
          "hasUsScopeBoundaryFtc",
          "limitsRawExtra",
          "totalIncomeInrV3",
          "indiaIsCompany",
          "indiaIsFirm",
          "indiaIsAop",
          "indiaIsTrust",
          "viaForeignCorpXbr4",
          "usStateTaxResult",
          "nraRaw",
          "entityTaxResult",
          "taxRegime",
          "businessComputation",
          "indiaOpt115baaRaw",
          "indiaOpt115babRaw"
        ],
        compute: function(d) {
          var res = d.residencyResult;
          var isForm1118 = d.entityFormsResult.usReturnForm === "1120";
          var isUsDomesticEntity = ["1120", "1120-S", "1065", "1041"].indexOf(d.entityFormsResult.usReturnForm) !== -1;
          var isUsPerson = res.us.isResident || isUsDomesticEntity;
          var t = indiaBusinessTurnoverInr(d.bizEntriesAgg);
          var atLeast95PctDigital = t.totalInr > 0 && t.cashInr / t.totalInr <= 0.05;
          var form8938 = d.form8938GaugeResult;
          var triggers = {
            fincen_114: d.accountsListResult.aggregatePeak.usd > 1e4 && isUsPerson,
            form_8938: !!form8938 && form8938.status === "breached" && isUsPerson,
            // NOT broadened to isUsPerson: Form 1118 vs 1116 is a real, C-corp-
            // specific distinction (a pass-through S-corp/partnership's FTC flows
            // to its owners' own 1040/1116, not the entity's own return).
            form_1116: d.taxesPaidIndiaResult.total.usd > 0 && (res.us.isResident || isForm1118),
            form_2555: d.feieRaw.claimed,
            // Same engine/conflicts.js fix: files1040nr alone doesn't mean a
            // treaty position was taken. d.nraRaw.treatyRateClaims is the precise
            // signal (already trusted by the W-8BEN finding).
            form_8833: res.dualResident || d.treatyUsResidenceRaw !== "none" || d.nraRaw && (d.nraRaw.treatyRateClaims || []).length > 0,
            // Was only checking indianMutualFundsResult (India-side financial_
            // holdings filtered for "mutual_fund"), ignoring Layer 1 US's own
            // dedicated "PFIC Holdings" card (usPficHoldingsRaw) entirely — a
            // user who fills in only the US-side card (holds PFICs through a
            // vehicle other than an India-side mutual fund entry, or just didn't
            // duplicate the same holding on both forms) got Form 8621 silently
            // marked N/A despite explicitly saying they hold PFICs. Masked in
            // every demo profile because whoever built them always populated
            // both fields together for the same holding.
            form_8621: (d.indianMutualFundsResult.length > 0 || d.usPficHoldingsRaw.length > 0) && isUsPerson,
            // Was checking d.bizEntriesAgg.length > 0 (India-side domestic
            // business_entries, an unrelated concept) — same engine/conflicts.js
            // bug, fixed the same way: viaForeignCorpXbr4 is the correct CFC-
            // ownership signal (form_3ceb below already uses it). Broadened to
            // isUsPerson (any domestic entity, not just C-corp).
            form_5471: d.viaForeignCorpXbr4 && isUsPerson,
            // Form 8865 hardcoded false: not a wiring bug, a genuine unmodeled-
            // feature gap — no field anywhere represents "owns an interest in a
            // FOREIGN partnership" (docs/GAP_TRACKER.md, 22 Jul 2026 full audit).
            form_8865: false,
            // Was OR'ing receivedAbove100k/isTrustBeneficiary in unconditionally —
            // Form 3520 (IRC §6039F) is US-persons-only; gated the whole trigger
            // behind isUsPerson instead of just the ppfInr/epfInr clause.
            form_3520: isUsPerson && (d.ppfInrRaw > 0 || d.epfInrRaw > 0 || d.foreignGiftsRaw.receivedAbove100k || d.foreignGiftsRaw.isTrustBeneficiary),
            // Only the OWNERSHIP subset of form_3520's own condition — a gift
            // received or a plain beneficiary distribution doesn't make the US
            // person the trust's "owner," so 3520-A (the trust's own return)
            // doesn't apply to those cases the way it does to a PPF/EPF holder.
            form_3520a: isUsPerson && (d.ppfInrRaw > 0 || d.epfInrRaw > 0),
            // Same engine/conflicts.js fix: the OR'd NON_RESIDENT_ALIEN status
            // check was a false positive on every "zero US exposure" placeholder
            // profile — treatyFiles1040nrRaw (the explicit Layer 1 US flag) is
            // the correct, sufficient signal on its own.
            form_1040nr: d.treatyFiles1040nrRaw,
            form_8960: d.headlineTotalIncomeUsdResult > (CONST_B1_LIMITS.NIIT_THRESHOLD[d.usFilingStatusRaw] || 2e5) && d.aggregateUsIncomeResult.interestUs.usd + d.aggregateUsIncomeResult.ordinaryDividendsUs.usd + d.aggregateUsIncomeResult.capitalGainsUs.usd > 0,
            form_8959: d.usTaxResult.additionalMedicareUsd > 0,
            // See engine/conflicts.js's form_67 comment: was the wrong field
            // (foreignSourceTotal, an unrelated US-model concept) OR'd with a bare
            // isResident catch-all — false-positive on 6/12 demo profiles. Fixed
            // to usSourceTotal, properly ANDed with the ROR gate (RNOR/NR aren't
            // taxed on foreign income in India, matching schedule_fa 2 lines down).
            form_67: res.india.status === "ROR" && (d.aggregateUsIncomeResult.usSourceTotal.usd > 0 || d.taxesPaidUsResult.total.usd > 0),
            trc: res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none",
            form_10f: res.dualResident || d.treatyIndiaResidenceRaw !== "none",
            schedule_fa: res.india.status === "ROR" && (d.aggregateUsIncomeResult.usSourceTotal.usd > 0 || d.accountsListResult.accounts.some(function(a) {
              return a.country !== "India";
            }) || d.usSecuritiesRaw.some(function(h) {
              return (h.peak_balance_usd || 0) > 0;
            })),
            // See engine/conflicts.js's schedule_fsi_tr comment: same bug class as
            // form_67 above — no ROR gate, false positive for a plain NR.
            schedule_fsi_tr: res.india.status === "ROR" && (d.taxesPaidUsResult.total.usd > 0 || d.aggregateUsIncomeResult.usSourceTotal.usd > 0),
            form_15ca_cb: d.limitsRawExtra.lrsRemittedInr > 0,
            // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6,
            // 21 Jul 2026): AOP/Trust excluded here too, consistent with how firm
            // is already treated (whether or not firm's own exclusion is itself
            // fully correct is a separate, pre-existing question, out of scope).
            schedule_al: !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust && d.totalIncomeInrV3 > 5e6,
            form_3cb_3cd: d.indiaIsCompany || t.totalInr > 0 && t.totalInr > (atLeast95PctDigital ? 1e8 : 1e7),
            form_8802: res.dualResident || d.treatyIndiaResidenceRaw !== "none" || d.treatyUsResidenceRaw !== "none",
            form_6251: d.usTaxResult.amtUsd > 0,
            form_8288: !!(d.nraRaw.usRealPropertyDisposed && (d.nraRaw.firptaWithholdingUsd || 0) > 0),
            form_3ceb: d.viaForeignCorpXbr4,
            form_26as_ais_tis: d.hasIndiaScopeXbr,
            form_16_16a: d.hasIndiaScopeXbr,
            lrs_form_a2: d.limitsRawExtra.lrsRemittedInr > 0,
            form_4868: d.hasUsScopeBoundaryFtc,
            form_540: !!d.usStateTaxResult && d.usStateTaxResult.state === "CA",
            form_it201: !!d.usStateTaxResult && d.usStateTaxResult.state === "NY",
            form_nj1040: !!d.usStateTaxResult && d.usStateTaxResult.state === "NJ",
            // DELIBERATE DAG/engine divergence, same reasoning as form_nj1040
            // above — see the DOCUMENTS_CATALOG entry for the full explanation.
            form_8858: d.usOwnsForeignDisregardedEntityRaw || d.usSelfEmploymentRaw.some(function(s) {
              return s.llc_type === "foreign_disregarded";
            }),
            // matApplied is only meaningful for the company branch of
            // entityTaxResult (MAT/s.115JB only applies to companies) — gating on
            // indiaIsCompany ensures it's read from the right branch.
            form_29b: d.indiaIsCompany && !!d.entityTaxResult.matApplied,
            // Same condition already independently derived for the diagnostic-
            // only "form_10iea" checks-registry entry (checks-registry-nodes.js) —
            // reused here rather than re-derived, now promoted to a real document.
            form_10iea: d.taxRegime === "OLD" && !d.indiaIsCompany && !d.indiaIsFirm && !d.indiaIsAop && !d.indiaIsTrust && (d.businessComputation.businessInr || 0) > 0,
            // Company-side equivalents of form_10iea — mutually exclusive
            // elections, each with its own form.
            form_10ic: d.indiaIsCompany && d.indiaOpt115baaRaw,
            form_10id: d.indiaIsCompany && d.indiaOpt115babRaw
          };
          return DOCUMENTS_CATALOG.map(function(doc) {
            var triggered = !!triggers[doc.id];
            var name = doc.name, desc = doc.desc, why = doc.why;
            if (doc.id === "form_1116" && isForm1118) {
              name = "IRS Form 1118 (Foreign Tax Credit \u2014 Corporations)";
              desc = "Claims credit for income tax paid to India against US corporate tax liability.";
              why = "This C-corp paid Indian income tax on income that is also taxable in the US. C-corps file Form 1118, not the individual/estate/trust Form 1116.";
            }
            return { id: doc.id, jurisdiction: doc.jurisdiction, name, desc, why, severity: doc.severity, required: triggered, status: triggered ? "required" : "not_triggered" };
          });
        }
      };
      NODES.buildScopeNotesResult = {
        deps: [
          "hasIndiaScopeXbr",
          "hasUsScopeBoundaryFtc",
          "indiaIsCompany",
          "indiaIsFirm",
          "indiaIsAop",
          "indiaIsTrust",
          "usEntityKind",
          "businessComputation",
          "indiaFinancialHoldingsTxRaw",
          "aggregateUsIncomeResult"
        ],
        compute: function(d) {
          var notes = [];
          var hasIndia = d.hasIndiaScopeXbr, hasUs = d.hasUsScopeBoundaryFtc, dual = hasIndia && hasUs;
          var hasIndiaBusiness = d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust || d.usEntityKind !== "individual" || (d.businessComputation.businessInr || 0) > 0;
          var hasSecuritiesTrades = d.indiaFinancialHoldingsTxRaw.length > 0;
          var hasUsWagesOrSe = d.aggregateUsIncomeResult.wages.usd > 0 || (d.aggregateUsIncomeResult.seEarningsUsd || 0) > 0;
          function note(id, area, kind, title, body, relevant) {
            if (relevant) notes.push({ id, area, kind, title, body });
          }
          note(
            "scope_gaar",
            "India",
            "excluded",
            "GAAR is not evaluated",
            "India's General Anti-Avoidance Rule can recharacterize arrangements that lack commercial substance \u2014 a facts-and-circumstances judgment no rules engine can safely make. WISING flags mechanical conflicts only; whether an arrangement invites GAAR scrutiny remains a professional call.",
            hasIndia
          );
          note(
            "scope_stt",
            "India",
            "excluded",
            "STT is not computed as a levy",
            "Securities Transaction Tax charged on trades (raised on F&O by Finance Act 2026) isn't calculated here. The stt_paid flag on each transaction drives the capital-gains regime (s.196/198 vs s.197) \u2014 the levy amount itself is neither a tax credit nor a capital-gains deduction, so nothing downstream depends on it.",
            hasSecuritiesTrades
          );
          note(
            "scope_payer_tds",
            "India",
            "excluded",
            "Your obligations as a TDS deductor aren't tracked",
            "The Withholding page covers tax withheld FROM this taxpayer's income. Duties in the opposite direction \u2014 deducting TDS on payments the business makes to vendors, contractors, or professionals \u2014 aren't monitored as a compliance obligation in their own right, though the resulting s.40(a) expense disallowance for TDS failures (and s.40A(3) cash-payment / s.43B(h) MSME-overdue disallowances) does flow into business income (Phase 1).",
            hasIndiaBusiness
          );
          note(
            "scope_clubbing",
            "India",
            "excluded",
            "Clubbing amounts are taken as entered",
            "Spousal and minor-child clubbed income entered in Layer 1 is taxed as given. WISING doesn't trace asset transfers between family members to detect clubbing that should have been reported but wasn't.",
            hasIndia
          );
          note(
            "scope_fica",
            "United States",
            "excluded",
            "FICA/FUTA levies aren't computed",
            "Employee and employer Social Security/Medicare/unemployment payroll taxes are a separate tax base from income tax. Only the pieces that touch the 1040 are computed: Additional Medicare 0.9%, self-employment tax, and the W-2 withholding shown on the Withholding page.",
            hasUsWagesOrSe
          );
          note(
            "scope_fatca_ch4",
            "Cross-border",
            "excluded",
            "FATCA Chapter 4 withholding is institution-side",
            "The 30% FATCA withholding regime (IRC \xA7\xA71471-1474) applies to payments to non-compliant foreign financial institutions \u2014 banks' problem, not yours directly. Where it touches an individual is the US-person self-certification banks request, which is tracked with your documents.",
            dual
          );
          note(
            "scope_mocked_uploads",
            "App",
            "excluded",
            "Document-upload extraction is simulated",
            'Every "upload to auto-fill" feature in Layer 1 (Form 26AS, Lower-TDS certificate, bank statements, property documents) is a demo simulation with representative values \u2014 not live OCR. Figures sourced from an upload should be treated as manually-entered until real extraction ships.',
            true
          );
          note(
            "scope_mli",
            "Cross-border",
            "assurance",
            "MLI does not affect the India-US treaty",
            "The US never signed the OECD Multilateral Instrument, so the India-US DTAA text is untouched by it \u2014 unlike India's treaties with the UK, Netherlands, or Singapore. Verified; nothing to apply.",
            dual
          );
          note(
            "scope_dtaa_current",
            "Cross-border",
            "assurance",
            "Treaty text current as modeled",
            "The India-US DTAA has not been amended since the 2000 protocol. Every treaty rate and tie-breaker rule in this engine reflects the treaty as it stands.",
            dual
          );
          return notes;
        }
      };
      NODES.buildReturnFormDeterminationResult = {
        deps: ["hasIndiaScopeXbr", "indiaItrFormResult", "entityFormsResult"],
        compute: function(d) {
          var CBDT_CITATION = "CBDT notified the AY 2026-27 ITR forms 2026-03-30 (corrigendum 2026-04-10). Eligibility rules verified against that notification 2026-07-12 \u2014 re-check each filing season, since CBDT re-notifies forms (and sometimes changes eligibility) annually.";
          var itr = d.hasIndiaScopeXbr ? d.indiaItrFormResult : null;
          var reasonsSuffix = itr && itr.disqualifiers.length ? " Reasons: " + itr.disqualifiers.join("; ") + "." : "";
          var indiaTrace;
          if (!itr) {
            indiaTrace = source("No India-side data on file.", null);
          } else if (itr.frontendForm == null) {
            indiaTrace = source(
              (itr.explanation || "Backend-computed eligibility check.") + reasonsSuffix + " Layer 1 India hasn't produced its own recommendation for this profile (itr_recommendation.form is unset) \u2014 this is WISING's own independent computation, run unconditionally, not a hedge pending the frontend.",
              CBDT_CITATION
            );
          } else if (itr.matchesFrontend) {
            indiaTrace = source(
              (itr.explanation || "") + reasonsSuffix + " Cross-checked against Layer 1 India's own recommendation (" + itr.frontendForm + ") \u2014 they agree.",
              CBDT_CITATION
            );
          } else {
            indiaTrace = source(
              "WISING computes " + itr.form + "; Layer 1 India's own recommendation was " + itr.frontendForm + ' ("' + (itr.frontendExplanation || "no explanation on file") + '"). They disagree \u2014 see the india_itr_form_mismatch finding for likely causes.' + reasonsSuffix,
              CBDT_CITATION
            );
          }
          var E = d.entityFormsResult;
          var usDetail = E.usReturnForm === "1120" ? "C-Corp: entity-level return, taxed at 21% flat." : E.usReturnForm === "1120-S" ? "S-Corp: informational return, income passes through via K-1." : E.usReturnForm === "1065" ? "Partnership: informational return, income passes through via K-1." : E.usReturnForm === "1041" ? "Trust/estate return." : E.usReturnForm === "1040-NR" ? "Nonresident alien individual return \u2014 Layer 1 US recorded this taxpayer as filing Form 1040-NR." : "Resident/citizen individual return \u2014 standard Form 1040 (not recorded as an NRA 1040-NR filer).";
          var usTrace = source(usDetail, "IRS form-per-entity-type/residency-status mapping, verified 2026-07-12.");
          return {
            india: { form: itr ? itr.form : E.indiaReturnForm, isRecommendation: !!itr, matchesFrontend: itr ? itr.matchesFrontend : null, trace: indiaTrace },
            us: { form: E.usReturnForm, trace: usTrace }
          };
        }
      };
      NODES.buildFtcReportResult = {
        deps: ["ftcResult", "indiaTotalTaxUsdBoundaryFtc", "indiaTotalIncomeUsdBoundaryFtc", "indiaIncomeTotalUsdBoundaryFtc", "usTaxResult", "usFtcFormXbr"],
        compute: function(d) {
          var ftc = d.ftcResult, indiaTotalTaxUsd = d.indiaTotalTaxUsdBoundaryFtc, usTax = d.usTaxResult;
          var feieRows = ftc.us.feieExcludedUsd > 0 ? [
            {
              label: "Less FEIE-excluded wages (\xA7911)",
              usd: -ftc.us.feieExcludedUsd,
              trace: source("The \xA7911 Foreign Earned Income Exclusion amount claimed on Layer 1 US (Form 2555). Excluded income leaves the FTC computation entirely \u2014 \xA7911(d)(6) no-double-dip.")
            },
            {
              label: "Indian tax disallowed on excluded income",
              usd: -ftc.us.indiaTaxDisallowedUsd,
              trace: calc("Total Indian tax \xD7 (FEIE-excluded wages \xF7 gross Indian-source income) \u2014 the slice of Indian tax attributable to income the US isn't taxing at all can't be credited", [
                { label: "Total India tax (USD)", amount: indiaTotalTaxUsd },
                { label: "FEIE-excluded wages", amount: ftc.us.feieExcludedUsd },
                { label: "Gross Indian-source income (US view)", amount: d.indiaIncomeTotalUsdBoundaryFtc }
              ])
            }
          ] : [];
          return {
            direction_us_claims_india: {
              title: "US " + d.usFtcFormXbr + " \u2014 credit for Indian taxes",
              rows: feieRows.concat([
                {
                  label: "Indian income tax (creditable)",
                  usd: ftc.us.indiaTaxPaidUsd,
                  trace: calc("Total India tax \xD7 creditable fraction (gross Indian income less any FEIE-excluded slice, over gross Indian income)", [
                    { label: "Total India tax (from Tax Computation)", amount: indiaTotalTaxUsd },
                    { label: "Creditable fraction", display: Math.round((indiaTotalTaxUsd > 0 ? ftc.us.indiaTaxPaidUsd / indiaTotalTaxUsd : 1) * 100) + "%" }
                  ])
                },
                {
                  label: "Foreign-source income (US view)",
                  usd: ftc.us.foreignSourceIncomeUsd,
                  trace: holdings("india", ftc.us.feieExcludedUsd > 0 ? "Net of the " + usd(ftc.us.feieExcludedUsd) + " FEIE-excluded wages shown in the row above." : null)
                },
                {
                  label: "US taxable income",
                  usd: ftc.us.taxableIncomeUsd,
                  trace: calc('Same figure as "Taxable income" in the Tax Computation card above', [
                    { label: "US taxable income", amount: ftc.us.taxableIncomeUsd }
                  ])
                },
                {
                  label: "US income tax (pre-credit)",
                  usd: ftc.us.usIncomeTaxUsd,
                  trace: calc("Ordinary-rate tax + preferential LTCG/QDI tax only \u2014 NIIT, Additional Medicare, SE tax and AMT are excluded, they're not creditable against foreign tax by statute", [
                    { label: "Ordinary-rate tax", amount: usTax.ordinaryTaxUsd },
                    { label: "Preferential LTCG/QDI tax", amount: usTax.preferentialTaxUsd }
                  ])
                },
                {
                  label: "FTC limitation = US tax \xD7 foreign/taxable",
                  usd: ftc.us.ftcLimitUsd,
                  trace: calc("\xA7904(a): the credit can't exceed US tax on this income times the same proportion foreign-source income bears to total taxable income", [
                    { label: "US income tax (pre-credit)", amount: ftc.us.usIncomeTaxUsd },
                    { label: "Foreign-source income", amount: ftc.us.foreignSourceIncomeUsd },
                    { label: "US taxable income", amount: ftc.us.taxableIncomeUsd }
                  ])
                },
                {
                  label: "FTC allowed this year",
                  usd: ftc.us.ftcAllowedUsd,
                  emphasis: true,
                  trace: calc("Lesser of Indian tax paid and the \xA7904 limitation", [
                    { label: "Indian income tax (creditable)", amount: ftc.us.indiaTaxPaidUsd },
                    { label: "FTC limitation", amount: ftc.us.ftcLimitUsd }
                  ])
                },
                {
                  label: "Excess credit carried over (\xA7904(c))",
                  usd: ftc.us.carryoverUsd,
                  trace: calc("Indian tax paid in excess of what the \xA7904 limitation allows this year \u2014 carries back 1 year / forward 10 years", [
                    { label: "Indian income tax (creditable)", amount: ftc.us.indiaTaxPaidUsd },
                    { label: "Less FTC allowed this year", amount: -ftc.us.ftcAllowedUsd }
                  ])
                },
                {
                  label: "Residual double tax (unrelieved)",
                  usd: ftc.us.residualDoubleTaxUsd,
                  warn: true,
                  trace: calc("Same as the excess credit carried over \u2014 until it's actually used in a future year this is double taxation the credit hasn't relieved yet", [
                    { label: "Excess credit carried over", amount: ftc.us.carryoverUsd }
                  ])
                }
              ])
            },
            direction_india_relief: {
              title: "India \xA7159 relief \u2014 for US taxes on doubly-taxed income",
              rows: [
                {
                  label: "US-source income (foreign, India view)",
                  usd: ftc.india.foreignSourceIncomeUsd,
                  trace: holdings("us", ftc.india.foreignSourceIncomeUsd === 0 ? "Only counted when the taxpayer is India ROR (worldwide taxation) \u2014 zero here because that isn't the case." : null)
                },
                {
                  label: "US tax on that US-source income",
                  usd: ftc.india.usTaxOnUsSourceUsd,
                  trace: calc("US income tax \xD7 (US-source income \xF7 total US income) \u2014 the slice of US tax attributable to income India also taxes", [
                    { label: "US income tax (pre-credit)", amount: usTax.incomeTaxUsd },
                    { label: "US-source income", amount: usTax.usSourceIncomeUsd },
                    { label: "Total US income", amount: usTax.totalIncomeUsd }
                  ])
                },
                {
                  label: "Indian tax on the doubly-taxed income (cap)",
                  usd: ftc.india.reliefCapUsd,
                  trace: calc("Total India tax \xD7 (US-source income \xF7 total India-view income) \u2014 s.159 relief can never exceed the Indian tax actually attributable to that income", [
                    { label: "Total India tax", amount: indiaTotalTaxUsd },
                    { label: "US-source income (India view)", amount: ftc.india.foreignSourceIncomeUsd },
                    { label: "Total India-view income", amount: d.indiaTotalIncomeUsdBoundaryFtc }
                  ])
                },
                {
                  label: "\xA790 relief allowed",
                  usd: ftc.india.reliefAllowedUsd,
                  emphasis: true,
                  trace: calc("Lesser of the US tax on that income and the Indian-tax cap", [
                    { label: "US tax on the doubly-taxed income", amount: ftc.india.usTaxOnUsSourceUsd },
                    { label: "Indian tax cap", amount: ftc.india.reliefCapUsd }
                  ])
                }
              ]
            },
            headlineNetDoubleTaxUsd: ftc.netUnrelievedDoubleTaxUsd
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/report-batch2-nodes.js
  var require_report_batch2_nodes = __commonJS({
    "prototypes/graph-pilot/report-batch2-nodes.js"(exports, module) {
      "use strict";
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      function calc(formula, parts, citation) {
        return { kind: "calc", formula, parts: parts || [], citation: citation || null };
      }
      function source(detail, citation) {
        return { kind: "source", detail, citation: citation || null };
      }
      function holdings(section, note) {
        return { kind: "holdings", section, note: note || null };
      }
      function bracketParts(breakdown, fmt) {
        function pctLabel(rate) {
          return parseFloat((rate * 100).toFixed(2)) + "%";
        }
        return (breakdown || []).map(function(b) {
          var label = b.to === Infinity ? pctLabel(b.rate) + " above " + fmt(b.from) : pctLabel(b.rate) + " on " + fmt(b.from) + "\u2013" + fmt(b.to);
          return { label, amount: b.tax };
        });
      }
      var reportBatch1Nodes = require_report_batch1_nodes().NODES;
      var NODES = {};
      Object.keys(reportBatch1Nodes).forEach(function(k) {
        NODES[k] = reportBatch1Nodes[k];
      });
      NODES.buildTaxComputationUsResult = {
        deps: ["usTaxResult", "aggregateUsIncomeResult"],
        compute: function(d) {
          var u = d.usTaxResult;
          if (u.isNra) {
            return {
              title: "US federal tax \u2014 Form 1040-NR (ECI graduated / FDAP flat)",
              currency: "USD",
              rows: [
                {
                  label: "ECI (wages + net self-employment)",
                  usd: u.nra.eciUsd,
                  trace: source("Effectively Connected Income \u2014 US wages + net self-employment earnings, entered on Layer 1 US.")
                },
                {
                  label: "Less itemized deductions (no standard deduction for NRAs)",
                  usd: -u.deductionUsd,
                  trace: source("NRAs cannot claim the standard deduction (with narrow treaty exceptions) \u2014 itemized deductions from Layer 1 US only.")
                },
                {
                  label: "Taxable ECI",
                  usd: u.taxableIncomeUsd,
                  trace: calc("ECI less itemized deductions", [
                    { label: "ECI", amount: u.nra.eciUsd },
                    { label: "Less itemized deductions", amount: -u.deductionUsd }
                  ])
                },
                {
                  label: "Tax on ECI (graduated brackets)",
                  usd: u.nra.eciTaxUsd,
                  trace: calc(
                    "Progressive federal brackets (10%-37%, same ladder as a resident filer) applied to $" + Math.round(u.nra.taxableEciUsd).toLocaleString("en-US") + " of taxable ECI",
                    bracketParts(u.nra.eciBracketBreakdown, usd)
                  )
                },
                {
                  label: "FDAP (interest/dividends/rental, Schedule NEC)",
                  usd: u.nra.fdapUsd,
                  trace: source("Fixed, Determinable, Annual or Periodical income \u2014 US-source passive income entered on Layer 1 US, taxed on a gross basis (no deductions).")
                },
                {
                  label: "Tax on FDAP (flat " + Math.round(u.nra.fdapRate * 100) + "%, no deductions)",
                  usd: u.nra.fdapTaxUsd,
                  trace: calc("FDAP \xD7 flat rate (30% statutory default, or a lower treaty rate if a valid W-8BEN treaty claim is on file)", [
                    { label: "FDAP income", amount: u.nra.fdapUsd },
                    { label: "Rate applied", display: Math.round(u.nra.fdapRate * 100) + "%" }
                  ])
                },
                {
                  label: "Additional Medicare tax",
                  usd: u.additionalMedicareUsd,
                  trace: source("Computed directly on Layer 1 US (Form 8959) and taken as-is \u2014 the engine does not recompute it.")
                },
                {
                  label: "Total US tax (pre-FTC)",
                  usd: u.totalTaxBeforeFtcUsd,
                  emphasis: true,
                  trace: calc("Tax on ECI + tax on FDAP + Additional Medicare tax", [
                    { label: "Tax on ECI", amount: u.nra.eciTaxUsd },
                    { label: "Tax on FDAP", amount: u.nra.fdapTaxUsd },
                    { label: "Additional Medicare tax", amount: u.additionalMedicareUsd }
                  ])
                }
              ],
              totalUsd: u.totalTaxBeforeFtcUsd,
              effectiveRate: u.effectiveRate
            };
          }
          if (u.isEntity && u.trustBracketBreakdown !== void 0) {
            var trustRows = [
              {
                label: "Total trust/estate income (distributed + retained)",
                usd: u.totalIncomeUsd,
                trace: source("Beneficiaries' share of income (Layer 1 US, Form 1041 K-1 section) plus any income the trust retained \u2014 entered on Layer 1 US Business.")
              }
            ];
            if (u.trustDistributedUsd > 0) {
              trustRows.push({
                label: "  \u2014 distributed to beneficiaries (not taxed here)",
                usd: -u.trustDistributedUsd,
                trace: source("Offset by the trust's distribution deduction (\xA7651/\xA7661) \u2014 taxed on the beneficiaries' own returns instead, not this entity-level computation.")
              });
            }
            trustRows.push({
              label: "Retained (undistributed) income",
              usd: u.trustRetainedUsd,
              trace: calc("Total trust/estate income less the amount distributed to beneficiaries", [
                { label: "Total income", amount: u.totalIncomeUsd },
                { label: "Less distributed to beneficiaries", amount: -u.trustDistributedUsd }
              ])
            });
            if (u.trustRetainedUsd > 0) {
              trustRows.push({
                label: "Tax on retained income (\xA71(e) compressed brackets)",
                usd: u.ordinaryTaxUsd,
                trace: calc(
                  "Progressive trust/estate brackets (10%-37%, 37% starting around $15,650 \u2014 far more compressed than the individual brackets) applied to $" + Math.round(u.trustRetainedUsd).toLocaleString("en-US") + " of retained income",
                  bracketParts(u.trustBracketBreakdown, usd)
                )
              });
            } else {
              trustRows.push({
                label: "Tax on retained income",
                usd: 0,
                trace: source("No retained income this year \u2014 fully distributed, so no entity-level tax under \xA71(e).")
              });
            }
            trustRows.push({
              label: "Total US tax (pre-FTC)",
              usd: u.totalTaxBeforeFtcUsd,
              emphasis: true,
              trace: calc("Tax on retained income only \u2014 no NIIT, SE tax, AMT, or individual credits apply to a trust's own Form 1041", [
                { label: "Tax", amount: u.totalTaxBeforeFtcUsd }
              ])
            });
            return { title: "US federal tax \u2014 " + u.filingStatus, currency: "USD", rows: trustRows, totalUsd: u.totalTaxBeforeFtcUsd, effectiveRate: u.effectiveRate };
          }
          if (u.isEntity) {
            var entityRatePct = u.taxableIncomeUsd > 0 ? Math.round(u.ordinaryTaxUsd / u.taxableIncomeUsd * 1e3) / 10 : 0;
            return {
              title: "US federal tax \u2014 " + u.filingStatus,
              currency: "USD",
              rows: [
                {
                  label: "Taxable income (Schedule M-1 book-to-tax reconciliation)",
                  usd: u.taxableIncomeUsd,
                  trace: source("Book income from the entity's own books, reconciled to US taxable income on Schedule M-1 \u2014 entered on Layer 1 US Business.")
                },
                u.passthrough ? {
                  label: "Tax (pass-through \u2014 no entity-level federal income tax)",
                  usd: u.ordinaryTaxUsd,
                  trace: source(u.filingStatus + " income passes through to the owners' own returns; no entity-level federal income tax is computed here.")
                } : {
                  label: "Tax at flat " + entityRatePct + "% (\xA711 C-Corp rate)",
                  usd: u.ordinaryTaxUsd,
                  trace: calc("Flat 21% \xD7 taxable income (\xA711 \u2014 no brackets for a C-Corp)", [
                    { label: "Taxable income", amount: u.taxableIncomeUsd },
                    { label: "Rate", display: entityRatePct + "%" }
                  ])
                },
                {
                  label: "Total US tax (pre-FTC)",
                  usd: u.totalTaxBeforeFtcUsd,
                  emphasis: true,
                  trace: calc("Entity-level tax computed above \u2014 no NIIT, SE tax, AMT, or individual credits apply to an entity's own return", [
                    { label: "Tax", amount: u.totalTaxBeforeFtcUsd }
                  ])
                }
              ],
              totalUsd: u.totalTaxBeforeFtcUsd,
              effectiveRate: u.effectiveRate
            };
          }
          var usHoldingsTotalUsd = d.aggregateUsIncomeResult.total.usd;
          var feieAppliedUsd = u.feie && u.feie.appliedUsd || 0;
          var usGapExplainedByFeie = Math.abs(usHoldingsTotalUsd - u.totalIncomeUsd - feieAppliedUsd) < 1;
          var totalIncomeTrace = usGapExplainedByFeie ? holdings("us", feieAppliedUsd > 0 ? "Holdings shows gross foreign wages before the \xA7911 FEIE exclusion (" + usd(feieAppliedUsd) + " excluded here), so this figure is that much lower." : null) : calc("Ordinary income (wages + business/self-employment + interest + non-qualified dividends + STCG + rental + pension" + (u.worldwide ? ", foreign amounts included since this is worldwide taxation" : "") + ") + preferential income (LTCG + qualified dividends)", [
            { label: "Ordinary income", amount: u.ordinaryIncomeUsd },
            { label: "Preferential income (LTCG/QDI)", amount: u.preferentialIncomeUsd }
          ]);
          return {
            title: "US federal income tax (" + u.filingStatus.toUpperCase() + ")",
            currency: "USD",
            rows: [
              { label: "Total income" + (u.worldwide ? " (worldwide)" : " (US-source)"), usd: u.totalIncomeUsd, trace: totalIncomeTrace }
            ].concat(u.retirementEpfInterestUsd > 0 ? [{
              label: "  \u2014 of which taxable EPF interest (India retirement a/c, worldwide taxation)",
              usd: u.retirementEpfInterestUsd,
              trace: source('Entered directly on Layer 1 India \u2192 Other Sources \u2192 "Taxable EPF interest". Included here because worldwide taxation applies to this taxpayer.')
            }] : []).concat(u.retirementNpsWithdrawalUsd > 0 ? [{
              label: "  \u2014 of which taxable NPS withdrawal (India retirement a/c, worldwide taxation)",
              usd: u.retirementNpsWithdrawalUsd,
              trace: source('Entered directly on Layer 1 India \u2192 Other Sources \u2192 "Taxable NPS withdrawal". Included here because worldwide taxation applies to this taxpayer.')
            }] : []).concat([
              {
                label: "Adjusted gross income",
                usd: u.agiUsd,
                trace: calc("Total income less above-the-line adjustments (student-loan interest, capped at $2,500, + half of self-employment tax)", [
                  { label: "Total income", amount: u.totalIncomeUsd },
                  { label: "Less adjustments", amount: -(u.totalIncomeUsd - u.agiUsd) }
                ])
              },
              {
                label: "Less " + u.deductionMode + " deduction",
                usd: -u.deductionUsd,
                trace: calc(u.deductionMode === "standard" ? "Standard deduction for filing status " + u.filingStatus.toUpperCase() + " \u2014 used because it exceeds (or the taxpayer elected) itemizing" : "Itemized: SALT (capped at " + usd(u.saltCapUsd) + " \u2014 OBBBA's $40,000 cap, phased down 30\xA2/$1 of AGI over $500,000, floored at the old $10,000) + mortgage interest + charitable + medical expenses over 7.5% of AGI \u2014 used because it exceeds (or the taxpayer elected) the standard deduction", [
                  { label: "Deduction used", amount: u.deductionUsd }
                ])
              }
            ]).concat(u.seniorDeductionUsd > 0 ? [{
              label: "Less senior deduction (OBBBA \xA770103, age 65+)",
              usd: -u.seniorDeductionUsd,
              trace: calc("$6,000 for a taxpayer age 65+ by year end (TY2025-2028, temporary), on top of the standard/itemized deduction either way, phased out 6\xA2/$1 of AGI over " + usd(u.seniorDetail.phaseoutThresholdUsd) + ". Only the primary taxpayer's age is known \u2014 Layer 1 collects no spouse DOB, so a second $6,000 for an also-65+ spouse isn't modeled.", [
                { label: "Taxpayer age", display: u.seniorDetail.age + " years" },
                { label: "Full amount before phase-out", amount: u.seniorDetail.fullAmountUsd },
                { label: "Senior deduction after phase-out", amount: u.seniorDeductionUsd }
              ])
            }] : []).concat(u.tipsDeductionUsd > 0 ? [{
              label: 'Less "no tax on tips" deduction (OBBBA, 2025-2028)',
              usd: -u.tipsDeductionUsd,
              trace: calc("Lesser of qualified tip income (already included in Box 1 wages above) or the $" + Math.round(u.tipsOvertimeDetail.tipsMaxUsd).toLocaleString("en-US") + " flat cap, less $100 per $1,000 of AGI over " + usd(u.tipsOvertimeDetail.phaseoutThresholdUsd) + ". Not available at all to MFS filers.", [
                { label: "Qualified tip income (Box 1 subset)", amount: u.tipsOvertimeDetail.qualifiedTipsUsd },
                { label: "Flat cap", amount: u.tipsOvertimeDetail.tipsMaxUsd },
                { label: "Less phase-out reduction", amount: -u.tipsOvertimeDetail.phaseoutReductionUsd },
                { label: "Tips deduction after phase-out", amount: u.tipsDeductionUsd }
              ])
            }] : []).concat(u.overtimeDeductionUsd > 0 ? [{
              label: 'Less "no tax on overtime" deduction (OBBBA, 2025-2028)',
              usd: -u.overtimeDeductionUsd,
              trace: calc("Lesser of qualified FLSA \xA77 overtime premium pay (already included in Box 1 wages above) or the $" + Math.round(u.tipsOvertimeDetail.overtimeMaxUsd).toLocaleString("en-US") + " cap (filing status " + u.filingStatus.toUpperCase() + "), less $100 per $1,000 of AGI over " + usd(u.tipsOvertimeDetail.phaseoutThresholdUsd) + ". Not available at all to MFS filers.", [
                { label: "Qualified overtime premium (Box 1 subset)", amount: u.tipsOvertimeDetail.qualifiedOvertimeUsd },
                { label: "Cap for this filing status", amount: u.tipsOvertimeDetail.overtimeMaxUsd },
                { label: "Less phase-out reduction", amount: -u.tipsOvertimeDetail.phaseoutReductionUsd },
                { label: "Overtime deduction after phase-out", amount: u.overtimeDeductionUsd }
              ])
            }] : []).concat(u.qbiDeductionUsd > 0 ? [{
              label: "Less \xA7199A QBI deduction",
              usd: -u.qbiDeductionUsd,
              trace: calc("20% of qualified business income (Sch C/S-corp/partnership pass-through), capped at 20% of (taxable income less net capital gains); phased out for specified service trades above the SSTB income threshold", [
                { label: "QBI deduction", amount: u.qbiDeductionUsd }
              ])
            }] : []).concat([
              {
                label: "Taxable income",
                usd: u.taxableIncomeUsd,
                trace: calc("AGI less deduction" + (u.seniorDeductionUsd > 0 ? " less senior deduction" : "") + (u.tipsDeductionUsd > 0 ? " less tips deduction" : "") + (u.overtimeDeductionUsd > 0 ? " less overtime deduction" : "") + (u.qbiDeductionUsd > 0 ? " less \xA7199A QBI deduction" : ""), [
                  { label: "AGI", amount: u.agiUsd },
                  { label: "Less deduction", amount: -u.deductionUsd }
                ].concat(u.seniorDeductionUsd > 0 ? [{ label: "Less senior deduction", amount: -u.seniorDeductionUsd }] : []).concat(u.tipsDeductionUsd > 0 ? [{ label: "Less tips deduction", amount: -u.tipsDeductionUsd }] : []).concat(u.overtimeDeductionUsd > 0 ? [{ label: "Less overtime deduction", amount: -u.overtimeDeductionUsd }] : []).concat(u.qbiDeductionUsd > 0 ? [{ label: "Less QBI deduction", amount: -u.qbiDeductionUsd }] : []))
              },
              {
                label: "Ordinary-rate tax",
                usd: u.ordinaryTaxUsd,
                trace: calc(
                  "Progressive federal brackets (10%-37%, filing status " + u.filingStatus.toUpperCase() + ") applied to $" + Math.round(u.ordinaryTaxableUsd).toLocaleString("en-US") + " of ordinary taxable income (taxable income less the LTCG/QDI portion, which is taxed separately below)",
                  bracketParts(u.ordinaryBracketBreakdown, usd)
                )
              },
              {
                label: "Preferential LTCG/QDI tax",
                usd: u.preferentialTaxUsd,
                trace: calc("0%/15%/20% long-term capital gains brackets, stacked on top of ordinary taxable income", [
                  { label: "Preferential LTCG/QDI tax", amount: u.preferentialTaxUsd }
                ])
              },
              {
                label: "Net investment income tax (NIIT, \xA71411)",
                usd: u.niitUsd,
                trace: u.niitUsd > 0 && u.niitDetail ? calc("3.8% \xD7 NIIT base (see breakdown below)", [
                  { label: "NIIT base", amount: u.niitDetail.excessUsd },
                  { label: "Rate", display: "3.8%" }
                ]) : calc("Zero \u2014 either no net investment income, or MAGI doesn't exceed the filing-status threshold", [])
              }
            ]).concat(u.niitUsd > 0 && u.niitDetail ? [
              {
                label: "  \u2014 net investment income (interest/div/cap gains/rental)",
                usd: u.niitDetail.netInvestmentIncomeUsd,
                trace: source("Interest + dividends + capital gains + rental income (foreign-source included when worldwide taxation applies) \u2014 from the income already itemized on Layer 1 India/US.")
              },
              {
                label: "  \u2014 MAGI",
                usd: u.niitDetail.magiUsd,
                trace: calc("Equal to AGI in this engine's model (no foreign-earned-income-exclusion add-back scenario is modeled)", [
                  { label: "AGI", amount: u.agiUsd }
                ])
              },
              {
                label: "  \u2014 less filing-status threshold",
                usd: -u.niitDetail.thresholdUsd,
                trace: source("Statutory NIIT threshold by filing status (\xA71411(b)) \u2014 $200,000 single/HoH, $250,000 MFJ, $125,000 MFS. Not indexed for inflation.")
              },
              {
                label: "  \u2014 NIIT base (lesser of NII and MAGI-over-threshold) @ " + (u.niitDetail.rate * 100).toFixed(1) + "%",
                usd: u.niitDetail.excessUsd,
                trace: calc("Lesser of net investment income and (MAGI \u2212 threshold)", [
                  { label: "Net investment income", amount: u.niitDetail.netInvestmentIncomeUsd },
                  { label: "MAGI over threshold", amount: Math.max(0, u.niitDetail.magiUsd - u.niitDetail.thresholdUsd) }
                ])
              }
            ] : []).concat([
              {
                label: "Additional Medicare tax",
                usd: u.additionalMedicareUsd,
                trace: source("Computed directly on Layer 1 US (Form 8959) and taken as-is \u2014 the engine does not recompute it.")
              }
            ]).concat(u.seTaxUsd > 0 ? [{
              label: "Self-employment tax (Schedule SE)",
              usd: u.seTaxUsd,
              trace: calc("92.35% of net SE earnings \xD7 (12.4% Social Security, capped by the wage base less W-2 SS wages already taxed, + 2.9% Medicare, uncapped); half of this is an above-the-line deduction", [
                { label: "Self-employment tax", amount: u.seTaxUsd }
              ])
            }] : []).concat(u.amtUsd > 0 && u.amtDetail ? [
              {
                label: "Alternative Minimum Tax (\xA755)",
                usd: u.amtUsd,
                trace: calc("Tentative minimum tax minus regular tax, when positive (see breakdown below)", [
                  { label: "Tentative minimum tax", amount: u.amtDetail.tmtUsd },
                  { label: "Less regular tax", amount: -u.amtDetail.regularTaxUsd }
                ])
              },
              {
                label: "  \u2014 AMTI (taxable income + standard/SALT addback + preference items)",
                usd: u.amtDetail.amtiUsd,
                trace: calc("Taxable income + disallowed-deduction addback (the full standard deduction, or just the SALT slice if itemized) + AMT preference items (e.g. the ISO exercise bargain-element spread, \xA756(b)(3))", [
                  { label: "Taxable income", amount: u.taxableIncomeUsd },
                  { label: "Addback (standard deduction or SALT)", amount: u.amtDetail.addbackUsd },
                  { label: "AMT preference items", amount: u.amtDetail.amtiUsd - u.taxableIncomeUsd - u.amtDetail.addbackUsd }
                ])
              },
              {
                label: "  \u2014 less AMT exemption (phased out above threshold)",
                usd: -u.amtDetail.exemptionUsd,
                trace: calc("Full statutory exemption reduced 25\xA2 for every $1 of AMTI above the phase-out threshold", [
                  { label: "Full exemption", amount: u.amtDetail.exemptionFullUsd },
                  { label: "AMTI", amount: u.amtDetail.amtiUsd },
                  { label: "Exemption after phase-out", amount: u.amtDetail.exemptionUsd }
                ])
              },
              {
                label: "  \u2014 AMT base",
                usd: u.amtDetail.amtBaseUsd,
                trace: calc("AMTI less the (phased-out) exemption", [
                  { label: "AMTI", amount: u.amtDetail.amtiUsd },
                  { label: "Less exemption", amount: -u.amtDetail.exemptionUsd }
                ])
              },
              {
                label: "  \u2014 tentative minimum tax (26%/28% ordinary + LTCG/QDI at preferential rates)",
                usd: u.amtDetail.tmtUsd,
                trace: calc("26% (28% above the AMT rate breakpoint) on the ordinary AMT base (AMT base less any LTCG/QDI, which keep their preferential rates) + preferential-rate tax on the LTCG/QDI portion", [
                  { label: "Ordinary AMT base", amount: u.amtDetail.ordinaryAmtBaseUsd },
                  { label: "Tax on ordinary AMT base", amount: u.amtDetail.tmtOrdUsd },
                  { label: "Preferential-rate tax (LTCG/QDI, same as above)", amount: u.preferentialTaxUsd }
                ])
              },
              {
                label: "  \u2014 less regular tax (AMT owed = excess of TMT over this)",
                usd: -u.amtDetail.regularTaxUsd,
                trace: calc("Same as ordinary-rate tax + preferential LTCG/QDI tax shown above", [
                  { label: "Ordinary-rate tax", amount: u.ordinaryTaxUsd },
                  { label: "Preferential LTCG/QDI tax", amount: u.preferentialTaxUsd }
                ])
              }
            ] : []).concat(u.otherCreditsUsd > 0 ? [{
              label: "Less other non-refundable credits (care/AOTC/LLC)",
              usd: -u.otherCreditsUsd,
              trace: calc("Child/dependent care credit (20% of qualifying expenses, capped) + American Opportunity + Lifetime Learning education credits (both phased out by MAGI) \u2014 capped at the tax otherwise due", [
                { label: "Credits", amount: u.otherCreditsUsd }
              ])
            }] : []).concat(u.ctcDetail && u.ctcDetail.availableUsd > 0 ? [{
              label: "Less Child Tax Credit (\xA724)",
              usd: -(u.ctcDetail.nonRefundableUsd + u.ctcDetail.refundableUsd),
              trace: calc(`$2,200/child (TY2025-2028, OBBBA), phased out $50 per $1,000 of AGI over the threshold. The portion that doesn't fit against tax owed is refundable (Additional CTC) up to $1,700/child, capped at 15% of earned income over $2,500. "Children" here reuses the same dependents count as the care/AOTC credits above \u2014 Layer 1 doesn't separately track qualifying-child ages.`, [
                { label: "Number of children (Layer 1 dependents count)", display: String(u.ctcDetail.numChildren) },
                { label: "Max CTC before phase-out", amount: u.ctcDetail.maxTotalUsd },
                { label: "Phase-out reduction", amount: -u.ctcDetail.phaseoutReductionUsd },
                { label: "Non-refundable (offsets tax)", amount: u.ctcDetail.nonRefundableUsd },
                { label: "Refundable (Additional CTC)", amount: u.ctcDetail.refundableUsd }
              ])
            }] : []).concat([{
              label: "Total US tax (pre-FTC)",
              usd: u.totalTaxBeforeFtcUsd,
              emphasis: true,
              trace: calc("Income tax (ordinary + preferential) + NIIT + Additional Medicare tax + SE tax + AMT \u2212 non-refundable credits", [
                { label: "Income tax (ordinary + preferential)", amount: u.incomeTaxUsd },
                { label: "NIIT", amount: u.niitUsd },
                { label: "Additional Medicare tax", amount: u.additionalMedicareUsd },
                { label: "SE tax", amount: u.seTaxUsd },
                { label: "AMT", amount: u.amtUsd },
                { label: "Less credits", amount: -u.creditsUsd }
              ])
            }]),
            totalUsd: u.totalTaxBeforeFtcUsd,
            effectiveRate: u.effectiveRate
          };
        }
      };
      NODES.buildTaxComputationUsStateResult = {
        deps: ["usStateTaxResult"],
        compute: function(d) {
          var st = d.usStateTaxResult;
          if (!st) return null;
          if (st.noIncomeTax) {
            return {
              title: st.stateName + " state income tax",
              currency: "USD",
              rows: [{ label: "State income tax", usd: 0, emphasis: true, trace: source(st.basis) }],
              totalUsd: 0,
              effectiveRate: 0,
              basis: st.basis
            };
          }
          return {
            title: st.stateName + " state income tax (" + st.formName + ", " + st.filingStatus.toUpperCase() + ")",
            currency: "USD",
            rows: [
              {
                label: "Federal AGI (starting point)",
                usd: st.agiUsd,
                trace: source("Same federal AGI computed above \u2014 " + st.stateName + " taxes a full-year resident's worldwide income, so no separate state-source recomputation is done.")
              },
              {
                label: "Less " + st.stateName + " " + st.standardDeductionLabel,
                usd: -st.standardDeductionUsd,
                trace: source(st.stateName + "'s own " + st.standardDeductionLabel + " for " + st.filingStatus.toUpperCase() + " \u2014 separate from, and smaller than, the federal one.")
              }
            ].concat(st.dependentExemptionUsd > 0 ? [
              st.state === "NY" ? {
                label: "Less NY dependent exemption ($1,000/dependent)",
                usd: -st.dependentExemptionUsd,
                trace: source("NY dropped the personal exemption for filer/spouse decades ago; only the $1,000-per-dependent exemption survives.")
              } : {
                label: "Less " + st.dependentExemptionLabel,
                usd: -st.dependentExemptionUsd,
                trace: source(st.stateName + "'s per-dependent exemption.")
              }
            ] : []).concat([
              {
                label: "State taxable income",
                usd: st.taxableIncomeUsd,
                trace: calc("Federal AGI less the state standard deduction" + (st.dependentExemptionUsd > 0 ? " and dependent exemption" : ""), [
                  { label: "Federal AGI", amount: st.agiUsd },
                  { label: "Less standard deduction", amount: -st.standardDeductionUsd }
                ].concat(st.dependentExemptionUsd > 0 ? [{ label: "Less dependent exemption", amount: -st.dependentExemptionUsd }] : []))
              },
              {
                label: "Tax at " + st.stateName + " bracket rates",
                usd: st.bracketTaxUsd,
                trace: calc(
                  "Progressive " + st.stateName + " brackets applied to $" + Math.round(st.taxableIncomeUsd).toLocaleString("en-US") + " of state taxable income",
                  bracketParts(st.bracketBreakdown, usd)
                )
              }
            ]).concat(st.surchargeUsd > 0 ? [
              {
                label: st.surchargeLabel,
                usd: st.surchargeUsd,
                trace: calc("1% of state taxable income over $1,000,000 \u2014 this threshold is NOT doubled for MFJ", [
                  { label: "State taxable income over $1,000,000", amount: Math.max(0, st.taxableIncomeUsd - 1e6) },
                  { label: "Surcharge @ 1%", amount: st.surchargeUsd }
                ])
              }
            ] : []).concat(st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? [
              {
                label: "Less personal/dependent exemption credit",
                usd: -(st.exemptionCreditUsd + st.dependentCreditUsd),
                trace: source("California's personal exemption credit ($153 single/MFS/HOH, $307 MFJ) plus $475 per dependent \u2014 a credit against tax, not a deduction from income.")
              }
            ] : []).concat([
              {
                label: "Total " + st.stateName + " tax",
                usd: st.totalTaxUsd,
                emphasis: true,
                trace: calc("Bracket tax" + (st.surchargeUsd > 0 ? " + surcharge" : "") + (st.exemptionCreditUsd + st.dependentCreditUsd > 0 ? " \u2212 exemption/dependent credits" : ""), [
                  { label: "Bracket tax", amount: st.bracketTaxUsd },
                  { label: "Surcharge", amount: st.surchargeUsd },
                  { label: "Less credits", amount: -(st.exemptionCreditUsd + st.dependentCreditUsd) }
                ])
              }
            ]),
            totalUsd: st.totalTaxUsd,
            effectiveRate: st.effectiveRate,
            basis: st.basis
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/india-tax-combined-nodes.js
  var require_india_tax_combined_nodes = __commonJS({
    "prototypes/graph-pilot/india-tax-combined-nodes.js"(exports, module) {
      "use strict";
      var v3Nodes = require_in1_nodes_v3().NODES;
      var entityNodes = require_entitytax_nodes().NODES;
      var NODES = {};
      Object.keys(v3Nodes).forEach(function(k) {
        NODES[k] = v3Nodes[k];
      });
      Object.keys(entityNodes).forEach(function(k) {
        if (NODES[k]) throw new Error("Node name collision on merge: '" + k + "' exists in both subgraphs \u2014 resolve before combining.");
        NODES[k] = entityNodes[k];
      });
      NODES.isEntityTaxpayer = {
        deps: ["indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust"],
        compute: function(d) {
          return d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust;
        }
      };
      NODES.totalTaxInrCombined = {
        deps: ["isEntityTaxpayer", "totalTaxInrV3", "totalTaxInrEntity"],
        compute: function(d) {
          return d.isEntityTaxpayer ? d.totalTaxInrEntity : d.totalTaxInrV3;
        }
      };
      NODES.regimeCombined = {
        deps: ["isEntityTaxpayer", "taxRegime", "entityTaxResult"],
        compute: function(d) {
          return d.isEntityTaxpayer ? d.entityTaxResult.regime : d.taxRegime;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/report-batch3-nodes.js
  var require_report_batch3_nodes = __commonJS({
    "prototypes/graph-pilot/report-batch3-nodes.js"(exports, module) {
      "use strict";
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function inr(n) {
        return "\u20B9" + Math.round(n).toLocaleString("en-IN");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      function calc(formula, parts, citation) {
        return { kind: "calc", formula, parts: parts || [], citation: citation || null };
      }
      function holdings(section, note) {
        return { kind: "holdings", section, note: note || null };
      }
      function source(detail, citation) {
        return { kind: "source", detail, citation: citation || null };
      }
      function s115aParts(stream, fmt) {
        var parts = (stream.elections || []).map(function(e) {
          var artTxt = e.article ? " (" + e.article + ")" : "";
          var label;
          if (e.outcome === "denied_no_docs") {
            label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " denied \u2014 TRC/Form 41 missing, domestic " + Math.round(e.domesticRate * 100) + "% applies instead";
          } else if (e.outcome === "elected_rate_applied") {
            label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " @ " + Math.round(e.rateApplied * 100) + "% treaty rate (beats " + Math.round(e.domesticRate * 100) + "% domestic)";
          } else {
            label = "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " \u2014 domestic " + Math.round(e.domesticRate * 100) + "% still wins over the " + Math.round(e.electedRate * 100) + "% elected rate";
          }
          return { label, amount: e.taxInr };
        });
        if (stream.uncapturedInr > 1) {
          parts.push({ label: "No election covers " + fmt(stream.uncapturedInr) + " \u2014 taxed @ " + Math.round(stream.domesticRate * 100) + "% domestic default", amount: stream.uncapturedTaxInr });
        }
        return parts;
      }
      function nrInterestParts(nrInterest, fmt) {
        return (nrInterest.elections || []).filter(function(e) {
          return e.carvedOut;
        }).map(function(e) {
          var artTxt = e.article ? " (" + e.article + ")" : "";
          return {
            label: "Election" + artTxt + " on " + fmt(e.appliedAmountInr) + " @ " + Math.round(e.electedRate * 100) + "% treaty rate (beats the " + fmt(e.marginalSlabTaxInr) + " it would have cost at the marginal slab rate)",
            amount: e.treatyTaxInr
          };
        });
      }
      var indiaTaxCombinedNodes = require_india_tax_combined_nodes().NODES;
      var NODES = {};
      Object.keys(indiaTaxCombinedNodes).forEach(function(k) {
        NODES[k] = indiaTaxCombinedNodes[k];
      });
      NODES.slabBreakdownV3 = {
        deps: ["totalNormalInr", "slabs"],
        compute: function(d) {
          var t = Math.max(0, d.totalNormalInr), prev = 0, rows = [];
          for (var i = 0; i < d.slabs.length; i++) {
            var cap = d.slabs[i][0], rate = d.slabs[i][1];
            if (t > prev) {
              var taxable = Math.min(t, cap) - prev;
              rows.push({ from: prev, to: cap, rate, taxable, tax: taxable * rate });
              prev = cap;
            } else break;
          }
          return rows;
        }
      };
      NODES.buildTaxComputationIndiaResult = {
        deps: [
          "isEntityTaxpayer",
          "entityTaxResult",
          "entityTaxableInrBoundary",
          "regimeCombined",
          "taxRegime",
          "totalNormalInr",
          "normalSlabInr",
          "lossSetOffV3",
          "cflBusinessInr",
          "cflHousePropertyInr",
          "cflStcgInr",
          "cflLtcgInr",
          "cflUnabsorbedDepreciationInr",
          "ltcgInrBoundary",
          "ltcgTaxableInr",
          "deductionsInrV3",
          "dedS80C",
          "dedS80CCD1B",
          "dedS80D",
          "dedS80CCD2Employer",
          "dedS80TTA_TTB",
          "totalIncomeInrV3",
          "slabTaxInr",
          "slabBreakdownV3",
          "specialTaxInrV3",
          "s115aDividend",
          "s115aRoyalty",
          "s115aFts",
          "isNRV3",
          "nrInterest",
          "ltcg197TaxableInr",
          "vdaGainInrBoundary",
          "vdaTaxInr",
          "specialRate115bbInr",
          "chapterXiiaInvestmentIncomeInrBoundary",
          "rebateInrV3",
          "surchargeInrV3",
          "cessInrV3",
          "totalTaxInrV3"
        ],
        compute: function(d, ctx) {
          var isEntity = d.isEntityTaxpayer;
          var i = isEntity ? {
            isEntity: true,
            regime: d.entityTaxResult.regime,
            grossTotalIncomeInr: d.entityTaxableInrBoundary,
            deductionsInr: 0,
            totalIncomeInr: d.entityTaxableInrBoundary,
            slabTaxInr: d.entityTaxResult.slabTaxInr,
            specialTaxInr: 0,
            rebateInr: 0,
            surchargeInr: d.entityTaxResult.surchargeInr,
            cessInr: d.entityTaxResult.cessInr,
            totalTaxInr: d.entityTaxResult.totalTaxInr,
            totalTaxUsd: inrToUsd(d.entityTaxResult.totalTaxInr, ctx),
            effectiveRate: d.entityTaxableInrBoundary > 0 ? d.entityTaxResult.totalTaxInr / d.entityTaxableInrBoundary : 0
          } : {
            isEntity: false,
            regime: d.regimeCombined,
            // Mirrors the engine's own formula exactly: normalSlabInr (BEFORE
            // Chapter VI-A deductions) plus every special-rate bucket — NOT
            // totalIncomeInrV3, which uses the post-deduction totalNormalInr
            // instead. Same one-term-swapped relationship XBR-6 already used for
            // grossTotalIncomeInrV3.
            grossTotalIncomeInr: d.normalSlabInr + d.lossSetOffV3.stcgInr + d.ltcgTaxableInr + d.ltcg197TaxableInr + d.specialRate115bbInr + d.vdaGainInrBoundary + d.chapterXiiaInvestmentIncomeInrBoundary + (d.nrInterest ? d.nrInterest.carvedOutInr : 0) + (d.s115aDividend ? d.s115aDividend.totalInr : 0) + (d.s115aRoyalty ? d.s115aRoyalty.totalInr : 0) + (d.s115aFts ? d.s115aFts.totalInr : 0),
            deductionsInr: d.deductionsInrV3,
            totalIncomeInr: d.totalIncomeInrV3,
            slabTaxInr: d.slabTaxInr,
            slabBreakdown: d.slabBreakdownV3,
            totalNormalInr: d.totalNormalInr,
            ltcgTaxableInr: d.ltcgTaxableInr,
            ltcg197TaxableInr: d.ltcg197TaxableInr,
            vdaGainInr: d.vdaGainInrBoundary,
            vdaTaxInr: d.vdaTaxInr,
            specialTaxInr: d.specialTaxInrV3,
            rebateInr: d.rebateInrV3,
            surchargeInr: d.surchargeInrV3,
            cessInr: d.cessInrV3,
            totalTaxInr: d.totalTaxInrV3,
            totalTaxUsd: inrToUsd(d.totalTaxInrV3, ctx),
            totalIncomeUsd: inrToUsd(d.totalIncomeInrV3, ctx),
            effectiveRate: d.totalIncomeInrV3 > 0 ? d.totalTaxInrV3 / d.totalIncomeInrV3 : 0,
            lossSetOff: d.lossSetOffV3,
            s115a: d.isNRV3 ? { dividend: d.s115aDividend, royalty: d.s115aRoyalty, fts: d.s115aFts } : null,
            nrInterest: d.nrInterest
          };
          if (i.isEntity) {
            var et = d.entityTaxResult;
            return {
              title: "India income tax \u2014 " + i.regime,
              currency: "INR",
              rows: [
                {
                  label: "Taxable income",
                  inr: i.totalIncomeInr,
                  trace: source("India-source income aggregated for this entity \u2014 entered on Layer 1 India Business/Company.")
                },
                {
                  label: "Tax at entity rate" + (et.matApplied ? " (MAT/AMT floor applies)" : ""),
                  inr: i.slabTaxInr,
                  trace: et.matApplied ? source("The MAT floor (s.115JB, companies) / AMT floor (s.115JC, firms/LLPs) exceeds the normal-rate tax on this taxable income, so the MAT/AMT floor applies instead \u2014 the difference between the two is folded into the surcharge line below.") : calc("Flat statutory rate for " + i.regime + " applied to taxable income \u2014 no slabs, no Chapter VI-A deductions, no \xA7156 rebate; none of those individual/HUF concepts apply to an entity's own return", [
                    { label: "Taxable income", amount: i.totalIncomeInr },
                    { label: "Tax", amount: i.slabTaxInr }
                  ])
                },
                {
                  label: "Surcharge",
                  inr: i.surchargeInr,
                  trace: source("Turnover/income-band surcharge for " + i.regime + (et.matApplied ? ", plus the MAT/AMT-vs-normal-tax difference from the row above" : "") + ".")
                },
                {
                  label: "Health & education cess (4%)",
                  inr: i.cessInr,
                  trace: calc("4% of (tax + surcharge)", [
                    { label: "Tax", amount: i.slabTaxInr },
                    { label: "Surcharge", amount: i.surchargeInr },
                    { label: "Cess rate", display: "4%" }
                  ])
                },
                {
                  label: "Total India tax",
                  inr: i.totalTaxInr,
                  emphasis: true,
                  trace: calc("Tax + surcharge + cess", [
                    { label: "Tax", amount: i.slabTaxInr },
                    { label: "Surcharge", amount: i.surchargeInr },
                    { label: "Cess", amount: i.cessInr }
                  ])
                }
              ],
              totalUsd: i.totalTaxUsd,
              effectiveRate: i.effectiveRate
            };
          }
          var T = { DEDUCTION_CAPS_OLD: { s80C: 15e4, s80CCD1B: 5e4, s80D_self: 25e3, s80D_parents_senior: 5e4 } };
          var dedIndia = {
            s80C: d.dedS80C,
            s80CCD1B: d.dedS80CCD1B,
            s80D: d.dedS80D,
            s80CCD2_employer: d.dedS80CCD2Employer,
            s80TTA_TTB: d.dedS80TTA_TTB
          };
          var cfl = {
            businessLossAvailableInr: d.cflBusinessInr,
            housePropertyLossAvailableInr: d.cflHousePropertyInr,
            stcgLossAvailableInr: d.cflStcgInr,
            ltcgLossAvailableInr: d.cflLtcgInr,
            unabsorbedDepreciationCf: d.cflUnabsorbedDepreciationInr
          };
          var ltcgGrossInrForNote = d.ltcgInrBoundary || 0;
          var ltcgExemptGapInr = Math.max(0, ltcgGrossInrForNote - (i.ltcgTaxableInr || 0));
          var indiaHoldingsNote = ltcgExemptGapInr > 1 ? "Holdings shows gross LTCG before the s.198 exemption \u2014 \u20B9" + Math.round(ltcgExemptGapInr).toLocaleString("en-IN") + " of LTCG is exempt here, so this figure is that much lower." : null;
          var lso = i.lossSetOff;
          var LOSS_ROW_DEFS = [
            { key: "businessInr", label: "  \u2014 brought-forward business loss set off (s.112)", availableKey: "businessLossAvailableInr", rule: "Set off only against business income (s.112)" },
            { key: "housePropertyInr", label: "  \u2014 brought-forward house-property loss set off (s.110)", availableKey: "housePropertyLossAvailableInr", rule: "Set off only against house-property income (s.110) \u2014 unlike current-year HP loss, brought-forward HP loss can't go inter-head" },
            { key: "stcgSlabInr", label: "  \u2014 brought-forward STCG loss set off vs current slab-rate STCG (s.111, s.69 unlisted buy-back)", availableKey: "stcgLossAvailableInr", rule: "STCG loss is set off against slab-rate STCG first \u2014 it's the more tax-expensive bucket to leave un-offset (s.111)" },
            { key: "stcgInr", label: "  \u2014 brought-forward STCG loss set off vs current STCG (s.111)", availableKey: "stcgLossAvailableInr", rule: "STCG loss is set off against current STCG first (s.111)" },
            { key: "ltcgFromStcgLossInr", label: "  \u2014 brought-forward STCG loss set off vs current LTCG (s.111)", availableKey: "stcgLossAvailableInr", rule: "Any STCG loss left after offsetting current STCG can still offset LTCG (s.111)" },
            { key: "ltcgInr", label: "  \u2014 brought-forward LTCG loss set off vs current LTCG (s.111)", availableKey: "ltcgLossAvailableInr", rule: "LTCG loss can only offset LTCG, never STCG (s.111)" },
            { key: "unabsorbedDepreciationInr", label: "  \u2014 unabsorbed depreciation set off (s.33(11))", availableKey: "unabsorbedDepreciationCf", rule: "No time limit; can offset any head except salary (s.33(11))" }
          ];
          var indiaGrossRows = lso && lso.totalUsedInr > 1 ? [
            {
              label: "Current-year income (before brought-forward loss set-off)",
              inr: i.grossTotalIncomeInr + lso.totalUsedInr,
              trace: holdings("india", indiaHoldingsNote)
            }
          ].concat(LOSS_ROW_DEFS.filter(function(dd) {
            return lso.used[dd.key] > 1;
          }).map(function(dd) {
            return {
              label: dd.label,
              inr: -lso.used[dd.key],
              trace: calc(dd.rule + " \u2014 amount used is the lesser of the loss available and the current-year income in that bucket", [
                { label: "Brought-forward loss available", amount: cfl[dd.availableKey] || 0 },
                { label: "Amount actually set off this year", amount: lso.used[dd.key] }
              ])
            };
          })).concat([
            {
              label: "Gross total income (after brought-forward loss set-off)",
              inr: i.grossTotalIncomeInr,
              trace: calc("Current-year income before set-off, less all brought-forward losses set off above", [
                { label: "Before set-off", amount: i.grossTotalIncomeInr + lso.totalUsedInr },
                { label: "Less: total losses set off", amount: -lso.totalUsedInr }
              ])
            }
          ]) : [
            {
              label: "Gross total income",
              inr: i.grossTotalIncomeInr,
              trace: holdings("india", indiaHoldingsNote)
            }
          ];
          var indiaLossCarryRow = lso && lso.totalUnusedInr > 1 ? [
            {
              label: "Losses carried forward to future years (could not be set off this year)",
              inr: lso.totalUnusedInr,
              trace: calc("Brought-forward losses left over after set-off \u2014 different loss categories can only offset specific income heads (s.112/110/111/33(11)), so a category with no matching income this year carries forward untouched (8 years for most heads, no limit for unabsorbed depreciation)", [
                { label: "Total unused this year", amount: lso.totalUnusedInr }
              ])
            }
          ] : [];
          var dedTrace = i.regime === "NEW" ? calc("New regime allows only the employer's NPS contribution under s.124(2) \u2014 s.123/126/124(1B)/153 etc. are not available", [
            { label: "Employer NPS contribution (s.124(2))", amount: dedIndia.s80CCD2_employer || 0 }
          ]) : calc("Old regime: s.123 (cap \u20B91.5L) + s.124(1B) NPS (cap \u20B950k) + s.126 health insurance (cap \u20B975k) + employer NPS s.124(2) (uncapped) + s.153 savings interest (cap \u20B910k)", [
            { label: "s.123 (capped \u20B91.5L)", amount: Math.min(dedIndia.s80C || 0, T.DEDUCTION_CAPS_OLD.s80C) },
            { label: "s.124(1B) NPS (capped \u20B950k)", amount: Math.min(dedIndia.s80CCD1B || 0, T.DEDUCTION_CAPS_OLD.s80CCD1B) },
            { label: "s.126 health insurance (capped \u20B975k)", amount: Math.min(dedIndia.s80D || 0, T.DEDUCTION_CAPS_OLD.s80D_self + T.DEDUCTION_CAPS_OLD.s80D_parents_senior) },
            { label: "Employer NPS s.124(2)", amount: dedIndia.s80CCD2_employer || 0 },
            { label: "s.153 savings interest (capped \u20B910k)", amount: Math.min(dedIndia.s80TTA_TTB || 0, 1e4) }
          ]);
          var dedNeverEntered = !(num(dedIndia.s80C) || num(dedIndia.s80CCD1B) || num(dedIndia.s80D) || num(dedIndia.s80CCD2_employer) || num(dedIndia.s80TTA_TTB));
          var dedCaveat = i.regime === "OLD" && dedNeverEntered ? "Deductions weren't entered for this profile \u2014 Layer 1 India hides this step under NEW regime, so this OLD-regime figure assumes \u20B90 and is understated. Fill in Chapter VI-A on Layer 1 India (regime must be OLD there) for an accurate comparison." : null;
          var REBATE_87A_NEW = { maxRebate: 6e4 }, REBATE_87A_OLD = { maxRebate: 12500 };
          var rebateCap = i.regime === "NEW" ? REBATE_87A_NEW.maxRebate : REBATE_87A_OLD.maxRebate;
          var s115aTraces = i.s115a ? ["dividend", "royalty", "fts"].filter(function(k) {
            return i.s115a[k] && i.s115a[k].totalInr > 1;
          }).map(function(k) {
            var s = i.s115a[k];
            return {
              label: "  \u2014 of which s.207 " + k + " @ " + Math.round(s.effectiveRate * 100) + "% effective",
              inr: s.taxInr,
              trace: calc(
                "Total " + k + " income of " + inr(s.totalInr) + " under s.207 \u2014 each DTAA election (s.159) is taxed at whichever is LOWER of the domestic default or the elected treaty rate, and only when TRC/Form 41 are on file; anything not covered by a valid election falls back to the domestic default",
                s115aParts(s, inr)
              )
            };
          }) : [];
          var nrInterestTrace = i.nrInterest && i.nrInterest.carvedOutInr > 1 ? [
            {
              label: "  \u2014 of which DTAA-carved-out interest (Art 11) taxed separately",
              inr: i.nrInterest.carvedOutTaxInr,
              trace: calc(
                "Ordinary NRO interest is slab-rate income for a non-resident by default (s.207's concessional rate doesn't actually cover it \u2014 that's narrowly limited to foreign-currency-borrowing interest). A specific claimed amount can still be carved out and taxed at the flat treaty rate instead of slab rates, but only when TRC/Form 41 are on file AND it's actually cheaper than the marginal slab rate on that slice (s.159)",
                nrInterestParts(i.nrInterest, inr)
              )
            }
          ] : [];
          var ltcg197Trace = (i.ltcg197TaxableInr || 0) > 1 ? [
            {
              label: "  \u2014 of which s.197 LTCG @ 12.5% (no exemption)",
              inr: (i.ltcg197TaxableInr || 0) * 0.125,
              trace: calc("Same 12.5% rate as s.198, but NO \u20B91,25,000 exemption \u2014 that's textually specific to s.198's listed/STT-paid gains and doesn't pool with s.197, so this whole amount is taxable from the first rupee. Fed by: unlisted buy-back gains, foreign-equity gains (e.g. US stocks), unlisted bonds without STT, non-equity-oriented/non-specified mutual funds (debt MF acquired pre-Apr-2023, 35-65%-equity hybrid funds, international/FoF funds no longer meeting s.50AA's specified-fund test), and Chapter XII-A specified listed equity/debentures/government securities sold to a third party (s.115E's LTCG rate has no exemption either, unlike ordinary s.198) \u2014 all held >24 months, or >12 months for a listed bond, specified debenture/govt security, or specified listed equity", [
                { label: "s.197 LTCG (after loss set-off)", amount: i.ltcg197TaxableInr || 0 },
                { label: "Tax @ 12.5%, no exemption", amount: (i.ltcg197TaxableInr || 0) * 0.125 }
              ])
            }
          ] : [];
          var vdaTrace = (i.vdaGainInr || 0) > 1 ? [
            {
              label: "  \u2014 of which s.115BBH VDA/crypto @ 30% flat",
              inr: i.vdaTaxInr || 0,
              trace: calc("Virtual digital assets (crypto) are taxed at a flat 30% on positive gains only \u2014 no LTCG/STCG distinction, no holding-period threshold, no exemption or indexation, and crucially NO loss set-off is allowed at all, not even against a gain from a different VDA in the same year, and no carry-forward. Any losing VDA transaction is simply excluded, never netted against a gain", [
                { label: "VDA gains (losses excluded, never netted)", amount: i.vdaGainInr || 0 },
                { label: "Tax @ 30% flat", amount: i.vdaTaxInr || 0 }
              ])
            }
          ] : [];
          var rows = indiaGrossRows.concat([
            Object.assign({ label: "Chapter VI-A deductions", inr: -i.deductionsInr, trace: dedTrace }, dedCaveat ? { caveat: dedCaveat } : {}),
            {
              label: "Total income",
              inr: i.totalIncomeInr,
              trace: calc("Gross total income less Chapter VI-A deductions", [
                { label: "Gross total income", amount: i.grossTotalIncomeInr },
                { label: "Less Chapter VI-A deductions", amount: -i.deductionsInr }
              ])
            },
            {
              label: "Tax at slab rates",
              inr: i.slabTaxInr,
              trace: calc(
                "Progressive slab-rate tax under the " + i.regime + " regime, applied to \u20B9" + Math.round(i.totalNormalInr).toLocaleString("en-IN") + " of normal-rate income (salary, house property, business, other sources" + (i.nrInterest ? " \u2014 including ordinary NRO interest, which is slab-rate income by default; only a DTAA-beneficial slice is carved out separately below" : "") + ", after Chapter VI-A deductions and brought-forward loss set-off). Capital gains and other special-rate income are taxed separately, not at slab rates.",
                (i.slabBreakdown || []).map(function(b) {
                  function pctLabel(rate) {
                    return parseFloat((rate * 100).toFixed(2)) + "%";
                  }
                  var label = b.to === Infinity ? pctLabel(b.rate) + " above " + inr(b.from) : pctLabel(b.rate) + " on " + inr(b.from) + "\u2013" + inr(b.to);
                  return { label, amount: b.tax };
                })
              )
            },
            {
              label: "Tax on special-rate income (196/197/198 gains + 115BBH VDA + 128/194 winnings" + (i.s115a ? " + s.207 dividend/royalty/FTS" : "") + (i.nrInterest && i.nrInterest.carvedOutInr > 1 ? " + DTAA-carved-out interest" : "") + ")",
              inr: i.specialTaxInr,
              trace: calc("s.196 STCG @ 20% + s.198 LTCG @ 12.5% (listed/STT-paid, net of the \u20B91,25,000 exemption) + s.197 LTCG @ 12.5% (unlisted/foreign \u2014 no exemption, separate section, does not pool with s.198's threshold) + s.115BBH VDA/crypto @ 30% flat (no set-off, ever) + s.128/194 lottery/betting/gaming winnings @ 30% flat, no exemption" + (i.s115a ? " + s.207 dividend/royalty/FTS at their own rates" : "") + (i.nrInterest && i.nrInterest.carvedOutInr > 1 ? " + any DTAA-carved-out interest at its treaty rate" : "") + " (each broken out below)", [])
            }
          ]).concat(nrInterestTrace).concat(ltcg197Trace).concat(vdaTrace).concat(s115aTraces).concat([
            {
              label: "Less \xA7156 rebate",
              inr: -i.rebateInr,
              trace: calc("Only for a resident individual (not NR, not HUF/AOP/BOI/trust) whose normal-rate income is at or below the threshold \u2014 lesser of tax at slab rates and the statutory cap", [
                { label: "Statutory rebate cap", amount: rebateCap },
                { label: "Rebate actually allowed", amount: i.rebateInr }
              ])
            },
            {
              label: "Surcharge",
              inr: i.surchargeInr,
              trace: calc("Progressive surcharge (10%/15%/25%/37% bands by total income) on tax before cess, with marginal relief so the tax increase never exceeds the income increase over the threshold; capital-gains/dividend-type special-rate income is capped at a 15% surcharge rate", [
                { label: "Surcharge", amount: i.surchargeInr }
              ])
            },
            {
              label: "Health & education cess (4%)",
              inr: i.cessInr,
              trace: calc("4% of (tax after rebate + surcharge)", [
                { label: "Tax after \xA7156 rebate", amount: i.slabTaxInr - i.rebateInr + i.specialTaxInr },
                { label: "Surcharge", amount: i.surchargeInr },
                { label: "Cess rate", display: "4%" }
              ])
            },
            {
              label: "Total India tax",
              inr: i.totalTaxInr,
              emphasis: true,
              trace: calc("Tax at slab rates + tax on special-rate income \u2212 \xA7156 rebate + surcharge + cess", [
                { label: "Tax at slab rates", amount: i.slabTaxInr },
                { label: "Tax on special-rate income", amount: i.specialTaxInr },
                { label: "Less \xA7156 rebate", amount: -i.rebateInr },
                { label: "Surcharge", amount: i.surchargeInr },
                { label: "Cess", amount: i.cessInr }
              ])
            }
          ]).concat(indiaLossCarryRow);
          return {
            title: "India income tax (" + i.regime + " regime)",
            currency: "INR",
            rows,
            totalUsd: i.totalTaxUsd,
            effectiveRate: i.effectiveRate
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/report-batch4-nodes.js
  var require_report_batch4_nodes = __commonJS({
    "prototypes/graph-pilot/report-batch4-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      var fxRate = require_fx_util().fxRate;
      var reportBatch2Nodes = require_report_batch2_nodes().NODES;
      var reportBatch3Nodes = require_report_batch3_nodes().NODES;
      var NODES = {};
      Object.keys(reportBatch3Nodes).forEach(function(k) {
        NODES[k] = reportBatch3Nodes[k];
      });
      Object.keys(reportBatch2Nodes).forEach(function(k) {
        NODES[k] = reportBatch2Nodes[k];
      });
      var LRS_PURPOSE_LABELS = {
        investment: "Investment (Equity/Property)",
        education_own_funds: "Overseas Education (Own Funds)",
        education_loan: "Overseas Education (Loan-Funded)",
        medical: "Medical Treatment Abroad",
        travel: "International Travel (Overseas Tour Package)",
        gift_donation: "Gift or Donation to Non-Resident"
      };
      var LRS_TCS_THRESHOLD_INR = 1e6;
      function computeLrsTcs(lrsOutbound) {
        var total = num(safe(lrsOutbound, "total_lrs_remitted_this_fy_inr", 0));
        var purpose = safe(lrsOutbound, "lrs_purpose", null);
        if (!(total > 0) || !purpose) return null;
        var tcsInr = 0, ratePctLabel = "NIL", note;
        if (purpose === "travel") {
          tcsInr = Math.round(total * 0.02);
          ratePctLabel = "2% flat";
          note = "2% flat TCS on overseas tour packages from the first rupee";
        } else if (total > LRS_TCS_THRESHOLD_INR) {
          var excess = total - LRS_TCS_THRESHOLD_INR;
          if (purpose === "investment" || purpose === "gift_donation") {
            tcsInr = Math.round(excess * 0.2);
            ratePctLabel = "20% on excess";
            note = "20% TCS on general/investment LRS exceeding \u20B910L";
          } else if (purpose === "education_own_funds" || purpose === "medical") {
            tcsInr = Math.round(excess * 0.02);
            ratePctLabel = "2% on excess";
            note = "2% TCS on self-funded education/medical exceeding \u20B910L";
          } else if (purpose === "education_loan") {
            tcsInr = 0;
            ratePctLabel = "0%";
            note = "NIL TCS on education remittance funded via loan";
          }
        } else {
          note = "Remittance is below the \u20B910L base threshold";
        }
        return {
          totalRemittedInr: total,
          purpose,
          purposeLabel: LRS_PURPOSE_LABELS[purpose] || purpose,
          tcsInr,
          ratePctLabel,
          note
        };
      }
      NODES.withholdingDetailIndiaRaw = {
        deps: [],
        compute: function(d, ctx) {
          var tc = safe(ctx.india, "tax_credits", {});
          var props = safe(ctx.india, "property.properties", []) || [];
          var propertyTds = props.filter(function(p) {
            return num(p.buyer_tds_deducted_inr) > 0;
          }).map(function(p) {
            return {
              propertyType: p.property_type || "Property",
              saleDate: p.sale_date || null,
              saleConsiderationInr: num(p.sale_consideration),
              tdsInr: num(p.buyer_tds_deducted_inr)
            };
          });
          return {
            tdsAggregateInr: num(safe(tc, "tds_already_deducted_inr", 0)) + num(safe(tc, "tds_inr", 0)),
            tcsAggregateInr: num(safe(tc, "tcs_inr", 0)),
            lrsTcs: computeLrsTcs(safe(ctx.india, "lrs_outbound", {})),
            propertyTds
          };
        }
      };
      NODES.withholdingDetailUsRaw = {
        deps: [],
        compute: function(d, ctx) {
          return { stateWithholdingUsd: num(safe(ctx.us, "withholding_and_estimated.state_withholding_total_usd", 0)) };
        }
      };
      NODES.vdaSaleConsiderationInrBoundary = { deps: [], compute: function(d, ctx) {
        return num(ctx.model.income.india.vdaSaleConsiderationInr);
      } };
      NODES.buildWithholdingSummaryResult = {
        deps: [
          "s115aDividend",
          "s115aRoyalty",
          "s115aFts",
          "nrInterest",
          "isNRV3",
          "isEntityTaxpayer",
          "withholdingDetailIndiaRaw",
          "withholdingDetailUsRaw",
          "vdaSaleConsiderationInrBoundary",
          "specialRate115bbInr",
          "panAadhaarLinkedRaw",
          "treatyFiles1040nrRaw",
          "s6013hElection",
          "nraRaw",
          "nraFdapDetail",
          "aggregateUsIncomeResult",
          "taxesPaidUsResult",
          "usEntityKind"
        ],
        compute: function(d, ctx) {
          var indiaRows = [];
          var indiaTotalGapInr = 0;
          function pushS115aRows(streamKey, label, citation, stream) {
            if (!stream) return;
            (stream.elections || []).forEach(function(e, idx) {
              var docsOk = e.outcome !== "denied_no_docs";
              var gapInr = !docsOk && e.electedRate != null && e.electedRate < e.domesticRate ? e.appliedAmountInr * (e.domesticRate - e.electedRate) : 0;
              indiaTotalGapInr += gapInr;
              indiaRows.push({
                id: streamKey + "_election_" + idx,
                jurisdiction: "IN",
                category: "treaty_gap",
                label: label + (e.article ? " (" + e.article + ")" : ""),
                grossInr: e.appliedAmountInr,
                domesticRatePct: e.domesticRate * 100,
                treatyRatePct: e.electedRate != null ? e.electedRate * 100 : null,
                docsOk,
                rateAppliedPct: e.rateApplied * 100,
                taxInr: e.taxInr,
                gapInr,
                note: docsOk ? null : "TRC/Form 41 missing \u2014 treaty rate denied, domestic rate applied instead",
                citation
              });
            });
            if ((stream.uncapturedInr || 0) > 1) {
              indiaRows.push({
                id: streamKey + "_unclaimed",
                jurisdiction: "IN",
                category: "treaty_gap",
                label: label + " \u2014 unclaimed (no treaty election on file)",
                grossInr: stream.uncapturedInr,
                domesticRatePct: stream.domesticRate * 100,
                treatyRatePct: null,
                docsOk: null,
                rateAppliedPct: stream.domesticRate * 100,
                taxInr: stream.uncapturedTaxInr,
                gapInr: 0,
                note: "Not a documentation gap \u2014 no treaty rate was ever claimed for this slice, so there's nothing to deny",
                citation
              });
            }
          }
          if (!d.isEntityTaxpayer) {
            pushS115aRows("dividend", "Dividend", "s.207 / s.159", d.s115aDividend);
            pushS115aRows("royalty", "Royalty", "s.207 / s.159", d.s115aRoyalty);
            pushS115aRows("fts", "Fees for Technical Services", "s.207 / s.159", d.s115aFts);
            if (d.nrInterest) {
              (d.nrInterest.elections || []).forEach(function(e, idx) {
                var docsOk = e.outcome !== "denied_no_docs";
                var counterfactualTreatyTaxInr = e.electedRate != null ? e.appliedAmountInr * e.electedRate : null;
                var gapInr = !docsOk && counterfactualTreatyTaxInr != null && counterfactualTreatyTaxInr < e.marginalSlabTaxInr ? e.marginalSlabTaxInr - counterfactualTreatyTaxInr : 0;
                indiaTotalGapInr += gapInr;
                var actualTaxInr = docsOk && e.carvedOut ? e.treatyTaxInr : e.marginalSlabTaxInr;
                indiaRows.push({
                  id: "nrInterest_election_" + idx,
                  jurisdiction: "IN",
                  category: "treaty_gap",
                  label: "NRO Interest" + (e.article ? " (" + e.article + ")" : ""),
                  grossInr: e.appliedAmountInr,
                  domesticRatePct: null,
                  treatyRatePct: e.electedRate != null ? e.electedRate * 100 : null,
                  docsOk,
                  rateAppliedPct: e.appliedAmountInr > 0 ? actualTaxInr / e.appliedAmountInr * 100 : null,
                  taxInr: actualTaxInr,
                  gapInr,
                  note: docsOk ? null : "TRC/Form 41 missing \u2014 treaty carve-out denied, taxed at marginal slab rate instead",
                  citation: "Art 11(2)(b), s.159"
                });
              });
            }
          }
          var wd = { india: d.withholdingDetailIndiaRaw, us: d.withholdingDetailUsRaw };
          if ((wd.india.tdsAggregateInr || 0) > 1) {
            indiaRows.push({
              id: "tds_aggregate",
              jurisdiction: "IN",
              category: "general",
              label: "TDS Already Deducted (Aggregate \u2014 Form 26AS)",
              grossInr: null,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: null,
              taxInr: wd.india.tdsAggregateInr,
              gapInr: 0,
              note: "Single aggregate figure \u2014 Layer 1 doesn't capture a per-source breakdown of income type or rate for this amount",
              citation: "s.199"
            });
          }
          var isNrSellerForPropertyTds = d.isNRV3;
          (wd.india.propertyTds || []).forEach(function(p, idx) {
            var rateAppliedPct = p.saleConsiderationInr > 0 ? p.tdsInr / p.saleConsiderationInr * 100 : null;
            indiaRows.push({
              id: "property_tds_" + idx,
              jurisdiction: "IN",
              category: "general",
              label: "Property Sale TDS \u2014 " + p.propertyType + (p.saleDate ? " (" + p.saleDate + ")" : ""),
              grossInr: p.saleConsiderationInr || null,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct,
              taxInr: p.tdsInr,
              gapInr: 0,
              note: isNrSellerForPropertyTds ? "Buyer-withheld on sale proceeds from an NR seller" : "Buyer-withheld on sale proceeds from a resident seller",
              citation: isNrSellerForPropertyTds ? "s.195" : "s.194-IA"
            });
          });
          if ((wd.india.tcsAggregateInr || 0) > 1) {
            indiaRows.push({
              id: "tcs_aggregate",
              jurisdiction: "IN",
              category: "general",
              label: "TCS Already Collected (Aggregate \u2014 Form 26AS)",
              grossInr: null,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: null,
              taxInr: wd.india.tcsAggregateInr,
              gapInr: 0,
              note: "Tax Collected at Source on outbound payments (not income) \u2014 creditable against final tax liability the same as TDS",
              citation: "s.206C"
            });
          }
          var estimateRows = { india: [], us: [] };
          if (wd.india.lrsTcs) {
            var lrs = wd.india.lrsTcs;
            estimateRows.india.push({
              id: "lrs_tcs_estimate",
              jurisdiction: "IN",
              category: "estimate",
              label: "Expected TCS on LRS Remittance \u2014 " + lrs.purposeLabel,
              grossInr: lrs.totalRemittedInr,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: null,
              taxInr: lrs.tcsInr,
              gapInr: 0,
              note: lrs.note + " \u2014 cross-check against the TCS aggregate above, not a confirmed collection receipt (excluded from totals)",
              citation: "s.206C(1G)"
            });
          }
          var vdaSaleInr = d.vdaSaleConsiderationInrBoundary || 0;
          if (vdaSaleInr > 1e4) {
            estimateRows.india.push({
              id: "vda_194s_estimate",
              jurisdiction: "IN",
              category: "estimate",
              label: "Expected TDS on Crypto/VDA Transfers (s.194S)",
              grossInr: vdaSaleInr,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: 1,
              taxInr: Math.round(vdaSaleInr * 0.01),
              gapInr: 0,
              note: '1% of total transfer consideration (\u20B910,000 floor for most taxpayers, \u20B950,000 for "specified persons" under s.44AB \u2014 not distinguishable from available data) \u2014 not confirmed as actually withheld, may already be inside the aggregate TDS credit above (excluded from totals)',
              citation: "s.194S"
            });
          }
          var winningsInr = d.specialRate115bbInr || 0;
          if (winningsInr > 0) {
            estimateRows.india.push({
              id: "winnings_tds_estimate",
              jurisdiction: "IN",
              category: "estimate",
              label: "Expected TDS on Lottery/Gaming Winnings (s.194B/194BA)",
              grossInr: winningsInr,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: 30,
              taxInr: Math.round(winningsInr * 0.3),
              gapInr: 0,
              note: "30% flat, no basic exemption (s.194B lottery/betting has a \u20B910,000 per-transaction floor; s.194BA online gaming has none \u2014 not distinguishable from this annual aggregate) \u2014 not confirmed as actually withheld, may already be inside the aggregate TDS credit above (excluded from totals)",
              citation: "s.194B / s.194BA"
            });
          }
          var panAadhaarInoperative = d.panAadhaarLinkedRaw === false;
          var usRows = [];
          var usTotalGapUsd = 0;
          var isNra = ["ccorp", "scorp", "partnership", "trust"].indexOf(d.usEntityKind) < 0 && d.treatyFiles1040nrRaw && !d.s6013hElection;
          if (isNra && d.nraFdapDetail.fdapUsd > 0) {
            var n = d.nraFdapDetail;
            var gapUsd = n.gapUsd;
            usTotalGapUsd += gapUsd;
            usRows.push({
              id: "fdap",
              jurisdiction: "US",
              category: "treaty_gap",
              label: "FDAP" + (n.incomeType ? " (" + n.incomeType + ")" : "") + " \u2014 Schedule NEC",
              grossUsd: n.fdapUsd,
              domesticRatePct: 30,
              treatyRatePct: n.claimedRatePctClamped,
              docsOk: n.w8benOnFile,
              rateAppliedPct: n.fdapRate * 100,
              taxUsd: n.fdapTaxUsd,
              gapUsd,
              note: n.w8benOnFile ? null : "Form W-8BEN missing \u2014 treaty rate denied, 30% statutory default withheld instead",
              citation: "IRC \xA71441 / Treas. Reg. \xA71.1441-6"
            });
          }
          var firptaUsd = d.nraRaw.usRealPropertyDisposed ? d.nraRaw.firptaWithholdingUsd || 0 : 0;
          if (firptaUsd > 1) {
            usRows.push({
              id: "firpta",
              jurisdiction: "US",
              category: "treaty_gap",
              label: "FIRPTA \u2014 US real property disposition",
              grossUsd: null,
              domesticRatePct: 15,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: null,
              taxUsd: firptaUsd,
              gapUsd: 0,
              note: "Mandatory withholding on gross proceeds regardless of documentation \u2014 not treaty-rate-dependent",
              citation: "IRC \xA71445"
            });
          }
          var w2Employers = d.aggregateUsIncomeResult.w2Employers || [];
          if (w2Employers.length > 0) {
            w2Employers.forEach(function(w, idx) {
              if (!(w.federalWithheldUsd > 1) && !(w.wagesUsd > 1)) return;
              var rateAppliedPct = w.wagesUsd > 0 ? w.federalWithheldUsd / w.wagesUsd * 100 : null;
              usRows.push({
                id: "w2_" + idx,
                jurisdiction: "US",
                category: "general",
                label: "W-2 Withholding \u2014 " + (w.employerName || "Unnamed Employer"),
                grossUsd: w.wagesUsd || null,
                domesticRatePct: null,
                treatyRatePct: null,
                docsOk: null,
                rateAppliedPct,
                taxUsd: w.federalWithheldUsd,
                gapUsd: 0,
                note: w.stateWithheldUsd > 1 ? "+ " + usd(w.stateWithheldUsd) + " state tax withheld" : null,
                citation: "IRC \xA73402 / Form W-2"
              });
            });
          } else if (d.taxesPaidUsResult.withholding.usd > 1) {
            usRows.push({
              id: "w2_aggregate",
              jurisdiction: "US",
              category: "general",
              label: "Federal Withholding (Aggregate \u2014 Form W-2)",
              grossUsd: null,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: null,
              taxUsd: d.taxesPaidUsResult.withholding.usd,
              gapUsd: 0,
              note: "Single aggregate figure \u2014 no per-employer breakdown on file",
              citation: "IRC \xA73402 / Form W-2"
            });
          }
          var stateWithUsd = d.withholdingDetailUsRaw.stateWithholdingUsd || 0;
          if (stateWithUsd > 1 && w2Employers.length === 0) {
            usRows.push({
              id: "state_withholding_aggregate",
              jurisdiction: "US",
              category: "general",
              label: "State Withholding (Aggregate \u2014 Form W-2 Box 17)",
              grossUsd: null,
              domesticRatePct: null,
              treatyRatePct: null,
              docsOk: null,
              rateAppliedPct: null,
              taxUsd: stateWithUsd,
              gapUsd: 0,
              note: null,
              citation: "Form W-2 Box 17"
            });
          }
          return {
            india: { rows: indiaRows, estimateRows: estimateRows.india, totalGapInr: indiaTotalGapInr, totalGapUsd: indiaTotalGapInr / fxRate(ctx), panAadhaarInoperative },
            us: { rows: usRows, estimateRows: estimateRows.us, totalGapUsd: usTotalGapUsd },
            totalGapUsd: indiaTotalGapInr / fxRate(ctx) + usTotalGapUsd
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/xb7-nodes.js
  var require_xb7_nodes = __commonJS({
    "prototypes/graph-pilot/xb7-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var NODES = {
        routerJurisdiction: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "jurisdiction", null);
        } },
        routerUsSignal: {
          deps: [],
          compute: function(d, ctx) {
            return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true || safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
          }
        },
        // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
        // values — additive synonyms for "single_india"/"single_us".
        hasIndiaScope: { deps: ["routerJurisdiction"], compute: function(d) {
          return d.routerJurisdiction !== "single_us" && d.routerJurisdiction !== "us_only";
        } },
        hasUsScope: {
          deps: ["routerJurisdiction", "routerUsSignal"],
          compute: function(d) {
            return d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only" ? false : d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only" ? true : d.routerUsSignal;
          }
        },
        indiaResidencyStatusRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.final_india_residency_status", null);
        } },
        indiaForeignAssetsDeclaredRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "foreign_assets.has_foreign_assets", null);
        } },
        // ---- Explicit boundary inputs: complex, multi-source aggregates ---------
        accountsBoundary: { deps: [], compute: function(d, ctx) {
          return ctx.model.accounts.accounts || [];
        } },
        usSourceTotalUsdBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.us.usSourceTotal && ctx.model.income.us.usSourceTotal.usd);
        } },
        usSecuritiesBoundary: { deps: [], compute: function(d, ctx) {
          return ctx.model.assets.usSecurities || [];
        } },
        isIndiaRor: { deps: ["indiaResidencyStatusRaw"], compute: function(d) {
          return d.indiaResidencyStatusRaw === "ROR";
        } },
        usHasForeignToIndiaAssets: {
          deps: ["accountsBoundary", "usSourceTotalUsdBoundary"],
          compute: function(d) {
            return d.accountsBoundary.some(function(a) {
              return a.country !== "India";
            }) || d.usSourceTotalUsdBoundary > 0;
          }
        },
        // ---- THE SHARED NODE — same condition the real schedule_fa_inconsistent
        // finding uses, built once here rather than re-derived per finding.
        scheduleFaInconsistentTrigger: {
          deps: ["isIndiaRor", "indiaForeignAssetsDeclaredRaw", "usHasForeignToIndiaAssets"],
          compute: function(d) {
            return d.isIndiaRor && d.indiaForeignAssetsDeclaredRaw === false && d.usHasForeignToIndiaAssets;
          }
        },
        bmaAssetValueUsd: {
          deps: ["scheduleFaInconsistentTrigger", "usSecuritiesBoundary", "accountsBoundary"],
          scopeGate: "scheduleFaInconsistentTrigger",
          outOfScopeValue: 0,
          compute: function(d) {
            return (d.usSecuritiesBoundary || []).reduce(function(s, h) {
              return s + (h.peak_balance_usd || 0);
            }, 0) + (d.accountsBoundary || []).filter(function(a) {
              return a.country !== "India";
            }).reduce(function(s, a) {
              return s + (a.peak && a.peak.usd || 0);
            }, 0);
          }
        },
        bmaMaxTotalUsd: {
          deps: ["scheduleFaInconsistentTrigger", "bmaAssetValueUsd"],
          scopeGate: "scheduleFaInconsistentTrigger",
          outOfScopeValue: 0,
          compute: function(d) {
            var taxUsd = d.bmaAssetValueUsd * 0.3;
            return taxUsd + taxUsd * 3;
          }
        },
        shouldFire: {
          deps: ["scheduleFaInconsistentTrigger", "bmaAssetValueUsd"],
          scopeGate: "scheduleFaInconsistentTrigger",
          outOfScopeValue: false,
          compute: function(d) {
            return d.bmaAssetValueUsd > 0;
          }
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/us1-nodes.js
  var require_us1_nodes = __commonJS({
    "prototypes/graph-pilot/us1-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var NODES = {
        routerJurisdiction: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "jurisdiction", null);
        } },
        routerUsSignal: {
          deps: [],
          compute: function(d, ctx) {
            return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true || safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
          }
        },
        // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
        // values — additive synonyms for "single_india"/"single_us".
        hasUsScope: {
          deps: ["routerJurisdiction", "routerUsSignal"],
          compute: function(d) {
            return d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only" ? false : d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only" ? true : d.routerUsSignal;
          }
        },
        // ---- Genuinely raw leaves: withholding/estimated figures ----------------
        usWithholdingTotalUsd: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "withholding_and_estimated.federal_withholding_total_usd", 0));
        } },
        usEstQ1Usd: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q1_apr15_usd", 0));
        } },
        usEstQ2Usd: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q2_jun15_usd", 0));
        } },
        usEstQ3Usd: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q3_sep15_usd", 0));
        } },
        usEstQ4Usd: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "withholding_and_estimated.estimated_tax_q4_jan15_usd", 0));
        } },
        usPriorYearTaxUsdRaw: { deps: [], compute: function(d, ctx) {
          var v = safe(ctx.us, "withholding_and_estimated.prior_year_total_tax_usd", null);
          return v === null ? null : num(v);
        } },
        // ---- Explicit boundary inputs (deep US-tax/FTC outputs) ------------------
        usTotalTaxBeforeFtcUsdBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.computed.usTax.totalTaxBeforeFtcUsd);
        } },
        usAgiUsdBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.computed.usTax.agiUsd);
        } },
        usFtcAllowedUsdBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.computed.ftc.us.ftcAllowedUsd);
        } },
        usPaidTotalUsd: {
          deps: ["usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"],
          compute: function(d) {
            return d.usWithholdingTotalUsd + d.usEstQ1Usd + d.usEstQ2Usd + d.usEstQ3Usd + d.usEstQ4Usd;
          }
        },
        usTotalTaxUsd: {
          deps: ["usTotalTaxBeforeFtcUsdBoundary", "usFtcAllowedUsdBoundary"],
          compute: function(d) {
            return Math.max(0, d.usTotalTaxBeforeFtcUsdBoundary - d.usFtcAllowedUsdBoundary);
          }
        },
        usCurrentHarborUsd: { deps: ["usTotalTaxUsd"], compute: function(d) {
          return d.usTotalTaxUsd * 0.9;
        } },
        usPriorHarborPct: { deps: ["usAgiUsdBoundary"], compute: function(d) {
          return d.usAgiUsdBoundary > 15e4 ? 1.1 : 1;
        } },
        usPriorHarborUsd: {
          deps: ["usPriorYearTaxUsdRaw", "usPriorHarborPct"],
          compute: function(d) {
            return d.usPriorYearTaxUsdRaw != null ? d.usPriorYearTaxUsdRaw * d.usPriorHarborPct : null;
          }
        },
        usRequiredUsd: {
          deps: ["usCurrentHarborUsd", "usPriorHarborUsd"],
          compute: function(d) {
            return d.usPriorHarborUsd != null ? Math.min(d.usCurrentHarborUsd, d.usPriorHarborUsd) : d.usCurrentHarborUsd;
          }
        },
        usBalanceDueUsd: { deps: ["usTotalTaxUsd", "usPaidTotalUsd"], compute: function(d) {
          return d.usTotalTaxUsd - d.usPaidTotalUsd;
        } },
        us2210PenaltyUsd: {
          deps: ["hasUsScope", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd", "usWithholdingTotalUsd", "usEstQ1Usd", "usEstQ2Usd", "usEstQ3Usd", "usEstQ4Usd"],
          scopeGate: "hasUsScope",
          outOfScopeValue: 0,
          compute: function(d) {
            if (!(d.usBalanceDueUsd > 1e3) || !(d.usPaidTotalUsd < d.usRequiredUsd)) return 0;
            var perQWithholdingUsd = d.usWithholdingTotalUsd / 4;
            var rate = { q1: 0.07, q2: 0.06, q3: 0.07, q4: 0.07 };
            var estByQ = { q1: d.usEstQ1Usd, q2: d.usEstQ2Usd, q3: d.usEstQ3Usd, q4: d.usEstQ4Usd };
            var monthsRemaining = { q1: 12, q2: 10, q3: 7, q4: 3 };
            var penaltyUsd = 0;
            ["q1", "q2", "q3", "q4"].forEach(function(q) {
              var requiredUsd = d.usRequiredUsd / 4;
              var paidUsd = perQWithholdingUsd + estByQ[q];
              var shortUsd = Math.max(0, requiredUsd - paidUsd);
              penaltyUsd += shortUsd * rate[q] * (monthsRemaining[q] / 12);
            });
            return penaltyUsd;
          }
        },
        shouldFire: {
          deps: ["hasUsScope", "us2210PenaltyUsd", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd"],
          scopeGate: "hasUsScope",
          outOfScopeValue: false,
          compute: function(d) {
            return d.usBalanceDueUsd > 1e3 && d.usPaidTotalUsd < d.usRequiredUsd;
          }
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/us5-nodes.js
  var require_us5_nodes = __commonJS({
    "prototypes/graph-pilot/us5-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var NODES = {
        routerJurisdiction: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "jurisdiction", null);
        } },
        routerUsSignal: {
          deps: [],
          compute: function(d, ctx) {
            return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true || safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
          }
        },
        // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
        // values — additive synonyms for "single_india"/"single_us".
        hasUsScope: {
          deps: ["routerJurisdiction", "routerUsSignal"],
          compute: function(d) {
            return d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only" ? false : d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only" ? true : d.routerUsSignal;
          }
        },
        iraDistUsdRaw: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "income_us_source.ira_distributions_usd", 0));
        } },
        dist401kUsdRaw: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.us, "income_us_source.401k_distributions_usd", 0));
        } },
        dobRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "date_of_birth", safe(ctx.india, "profile.date_of_birth", safe(ctx.us, "profile.date_of_birth", null)));
        } },
        baseYear: { deps: [], compute: function(d, ctx) {
          return ctx.model.meta.baseYear;
        } },
        earlyDistUsd: { deps: ["iraDistUsdRaw", "dist401kUsdRaw"], compute: function(d) {
          return d.iraDistUsdRaw + d.dist401kUsdRaw;
        } },
        ageAtYearEndUs: {
          deps: ["dobRaw", "baseYear"],
          compute: function(d) {
            if (!d.dobRaw) return null;
            var dob = new Date(d.dobRaw);
            var yearEnd = new Date(d.baseYear, 11, 31);
            return yearEnd.getFullYear() - dob.getFullYear() - (yearEnd.getMonth() < dob.getMonth() || yearEnd.getMonth() === dob.getMonth() && yearEnd.getDate() < dob.getDate() ? 1 : 0);
          }
        },
        penalty72tUsd: {
          deps: ["hasUsScope", "earlyDistUsd", "ageAtYearEndUs"],
          scopeGate: "hasUsScope",
          outOfScopeValue: 0,
          compute: function(d) {
            return d.earlyDistUsd > 0 && d.ageAtYearEndUs != null && d.ageAtYearEndUs < 59 ? d.earlyDistUsd * 0.1 : 0;
          }
        },
        shouldFire: {
          deps: ["hasUsScope", "earlyDistUsd", "ageAtYearEndUs"],
          scopeGate: "hasUsScope",
          outOfScopeValue: false,
          compute: function(d) {
            return d.earlyDistUsd > 0 && d.ageAtYearEndUs != null && d.ageAtYearEndUs < 59;
          }
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/in1-nodes.js
  var require_in1_nodes = __commonJS({
    "prototypes/graph-pilot/in1-nodes.js"(exports, module) {
      "use strict";
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var NODES = {
        // ---- Leaf nodes: genuinely raw router/india fields ----------------------
        routerJurisdiction: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "jurisdiction", null);
        } },
        routerUsSignal: {
          deps: [],
          compute: function(d, ctx) {
            return num(safe(ctx.router, "us_days", 0)) > 0 || safe(ctx.router, "is_us_citizen", false) === true || safe(ctx.router, "has_green_card", false) === true || safe(ctx.router, "has_us_source_income_or_assets", false) === true;
          }
        },
        indiaResidencyStatusRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "residency_detail.final_india_residency_status", null);
        } },
        dobRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.router, "date_of_birth", safe(ctx.india, "profile.date_of_birth", safe(ctx.us, "profile.date_of_birth", null)));
        } },
        indiaEntityTypeRaw: { deps: [], compute: function(d, ctx) {
          return safe(ctx.india, "profile.entity_type", "individual");
        } },
        advQ1Inr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "tax_credits.advance_tax_q1_15jun_inr", 0));
        } },
        advQ2Inr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "tax_credits.advance_tax_q2_15sep_inr", 0));
        } },
        advQ3Inr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "tax_credits.advance_tax_q3_15dec_inr", 0));
        } },
        advQ4Inr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "tax_credits.advance_tax_q4_15mar_inr", 0));
        } },
        tdsInr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "tax_credits.tds_already_deducted_inr", 0)) + num(safe(ctx.india, "tax_credits.tds_inr", 0));
        } },
        tcsInr: { deps: [], compute: function(d, ctx) {
          return num(safe(ctx.india, "tax_credits.tcs_inr", 0));
        } },
        baseYear: { deps: [], compute: function(d, ctx) {
          return ctx.model.meta.baseYear;
        } },
        // ---- Explicit boundary inputs (see file header) --------------------------
        assessedTaxInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.computed.indiaTax.totalTaxInr);
        } },
        hasValidPresumptiveEntryBoundary: { deps: [], compute: function(d, ctx) {
          return !!ctx.model.income.india.indiaHasValidPresumptiveEntry;
        } },
        hasRegularBooksEntryBoundary: { deps: [], compute: function(d, ctx) {
          return !!ctx.model.income.india.indiaHasRegularBooksEntry;
        } },
        hasPartnerFirmIncomeBoundary: { deps: [], compute: function(d, ctx) {
          return !!ctx.model.income.india.indiaHasPartnerFirmIncome;
        } },
        businessInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.business && ctx.model.income.india.business.inr);
        } },
        speculativeIncomeInrBoundary: { deps: [], compute: function(d, ctx) {
          return num(ctx.model.income.india.speculativeIncomeInr);
        } },
        indianBusinessesBoundary: { deps: [], compute: function(d, ctx) {
          return ctx.model.assets.indianBusinesses || [];
        } },
        // ---- Derived nodes: real logic, ported unchanged from conflicts.js ------
        // "india_only"/"us_only" are the new Layer 0 router's own jurisdiction
        // values — additive synonyms for "single_india"/"single_us" (the 12 demo
        // profiles and the fuzzer only ever produce the original strings).
        hasIndiaScope: {
          deps: ["routerJurisdiction"],
          compute: function(d) {
            return d.routerJurisdiction !== "single_us" && d.routerJurisdiction !== "us_only";
          }
        },
        hasUsScope: {
          deps: ["routerJurisdiction", "routerUsSignal"],
          compute: function(d) {
            return d.routerJurisdiction === "single_india" || d.routerJurisdiction === "india_only" ? false : d.routerJurisdiction === "single_us" || d.routerJurisdiction === "us_only" ? true : d.routerUsSignal;
          }
        },
        isResidentIndia: {
          deps: ["indiaResidencyStatusRaw"],
          compute: function(d) {
            return d.indiaResidencyStatusRaw === "ROR" || d.indiaResidencyStatusRaw === "RNOR";
          }
        },
        ageAtFyEnd: {
          deps: ["dobRaw", "baseYear"],
          compute: function(d) {
            if (!d.dobRaw) return null;
            var dob = new Date(d.dobRaw);
            var fyEnd = new Date(d.baseYear + 1, 2, 31);
            return fyEnd.getFullYear() - dob.getFullYear() - (fyEnd.getMonth() < dob.getMonth() || fyEnd.getMonth() === dob.getMonth() && fyEnd.getDate() < dob.getDate() ? 1 : 0);
          }
        },
        isIndividualTaxpayer: { deps: ["indiaEntityTypeRaw"], compute: function(d) {
          return d.indiaEntityTypeRaw === "individual";
        } },
        indiaIsCompany: { deps: ["indiaEntityTypeRaw"], compute: function(d) {
          return d.indiaEntityTypeRaw === "company";
        } },
        advancePaidInr: {
          deps: ["advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr"],
          compute: function(d) {
            return d.advQ1Inr + d.advQ2Inr + d.advQ3Inr + d.advQ4Inr;
          }
        },
        inTurnoverForAudit: {
          deps: ["indianBusinessesBoundary"],
          compute: function(d) {
            var totalInr = 0, cashInr = 0;
            (d.indianBusinessesBoundary || []).forEach(function(b) {
              var digital = num(b.digital_receipts_inr) + num(b.ada_digital_receipts_inr);
              var cash = num(b.cash_receipts_inr) + num(b.ada_cash_receipts_inr);
              var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || digital + cash;
              totalInr += receipts;
              cashInr += cash;
            });
            return totalInr > 0 && totalInr > (cashInr / totalInr <= 0.05 ? 1e8 : 1e7);
          }
        },
        inIsAuditCase: {
          deps: ["indiaIsCompany", "inTurnoverForAudit"],
          compute: function(d) {
            return d.indiaIsCompany || d.inTurnoverForAudit;
          }
        },
        inS424Months: { deps: ["inIsAuditCase"], compute: function(d) {
          return d.inIsAuditCase ? 7 : 4;
        } },
        hasPgbpIncome: {
          deps: ["businessInrBoundary", "speculativeIncomeInrBoundary", "hasRegularBooksEntryBoundary", "hasValidPresumptiveEntryBoundary", "hasPartnerFirmIncomeBoundary"],
          compute: function(d) {
            return d.businessInrBoundary !== 0 || d.speculativeIncomeInrBoundary !== 0 || d.hasRegularBooksEntryBoundary || d.hasValidPresumptiveEntryBoundary || d.hasPartnerFirmIncomeBoundary;
          }
        },
        assessedTaxInr: {
          deps: ["assessedTaxInrBoundary", "tdsInr", "tcsInr"],
          compute: function(d) {
            return Math.max(0, d.assessedTaxInrBoundary - d.tdsInr - d.tcsInr);
          }
        },
        // s.404 floor + s.207(2) senior carve-out — the actual "first-class
        // symmetry sweep" logic added to conflicts.js earlier this session,
        // ported unchanged.
        inAdvTaxObliged: {
          deps: ["assessedTaxInr", "isIndividualTaxpayer", "isResidentIndia", "ageAtFyEnd", "hasPgbpIncome"],
          compute: function(d) {
            if (d.assessedTaxInr < 1e4) return false;
            if (d.isIndividualTaxpayer && d.isResidentIndia && d.ageAtFyEnd !== null && d.ageAtFyEnd >= 60 && !d.hasPgbpIncome) return false;
            return true;
          }
        },
        inPurelyPresumptive: {
          deps: ["hasValidPresumptiveEntryBoundary", "hasRegularBooksEntryBoundary", "hasPartnerFirmIncomeBoundary"],
          compute: function(d) {
            return !!(d.hasValidPresumptiveEntryBoundary && !d.hasRegularBooksEntryBoundary && !d.hasPartnerFirmIncomeBoundary);
          }
        },
        s424Inr: {
          deps: ["inAdvTaxObliged", "assessedTaxInr", "advancePaidInr", "inS424Months"],
          compute: function(d) {
            if (!d.inAdvTaxObliged || d.assessedTaxInr <= 0 || d.advancePaidInr >= d.assessedTaxInr * 0.9) return 0;
            return (d.assessedTaxInr - d.advancePaidInr) * 0.01 * d.inS424Months;
          }
        },
        s425Inr: {
          deps: ["inAdvTaxObliged", "assessedTaxInr", "inPurelyPresumptive", "advQ1Inr", "advQ2Inr", "advQ3Inr", "advQ4Inr"],
          compute: function(d) {
            if (!d.inAdvTaxObliged || d.assessedTaxInr <= 0) return 0;
            var installments = d.inPurelyPresumptive ? [{ required: 1, paid: d.advQ1Inr + d.advQ2Inr + d.advQ3Inr + d.advQ4Inr, months: 1 }] : [
              { required: 0.15, paid: d.advQ1Inr, months: 3 },
              { required: 0.3, paid: d.advQ2Inr, months: 3 },
              { required: 0.3, paid: d.advQ3Inr, months: 3 },
              { required: 0.25, paid: d.advQ4Inr, months: 1 }
            ];
            return installments.reduce(function(sum, q) {
              var shortInr = Math.max(0, d.assessedTaxInr * q.required - q.paid);
              return sum + shortInr * 0.01 * q.months;
            }, 0);
          }
        },
        // ---- Root outputs: gated ONCE, here, on hasIndiaScope. Nothing above
        // this line needed its own scope check — they're all safe to compute
        // regardless (confirmed: computed.indiaTax/model.income.india always
        // exist, just zeroed, for a hasIndiaScope=false taxpayer) — but the
        // finding itself can only ever fire in-scope. ---------------------------
        totalInterestInr: {
          deps: ["hasIndiaScope", "s424Inr", "s425Inr"],
          scopeGate: "hasIndiaScope",
          outOfScopeValue: 0,
          compute: function(d) {
            return d.s424Inr + d.s425Inr;
          }
        },
        shouldFire: {
          deps: ["hasIndiaScope", "totalInterestInr"],
          scopeGate: "hasIndiaScope",
          outOfScopeValue: false,
          compute: function(d) {
            return d.totalInterestInr > 100;
          }
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/report-batch5-nodes.js
  var require_report_batch5_nodes = __commonJS({
    "prototypes/graph-pilot/report-batch5-nodes.js"(exports, module) {
      "use strict";
      var reportBatch4Nodes = require_report_batch4_nodes().NODES;
      var xb7Nodes = require_xb7_nodes().NODES;
      var us1Nodes = require_us1_nodes().NODES;
      var us5Nodes = require_us5_nodes().NODES;
      var in1Nodes = require_in1_nodes().NODES;
      var NODES = {};
      Object.keys(reportBatch4Nodes).forEach(function(k) {
        NODES[k] = reportBatch4Nodes[k];
      });
      NODES.xb7ShouldFire = xb7Nodes.shouldFire;
      NODES.us1ShouldFire = us1Nodes.shouldFire;
      NODES.us5ShouldFire = us5Nodes.shouldFire;
      NODES.in1ShouldFire = in1Nodes.shouldFire;
      [xb7Nodes, us1Nodes, us5Nodes, in1Nodes].forEach(function(nodes) {
        Object.keys(nodes).forEach(function(k) {
          if (k !== "shouldFire") NODES[k] = nodes[k];
        });
      });
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      function inr(n) {
        return "\u20B9" + Math.round(n).toLocaleString("en-IN");
      }
      var fxRate = require_fx_util().fxRate;
      function inrToUsd(v, ctx) {
        return Number(v) / fxRate(ctx);
      }
      NODES.indiaAdvanceTaxInterestFinding = {
        deps: ["in1ShouldFire", "totalInterestInr", "advancePaidInr", "assessedTaxInr", "s424Inr", "inS424Months", "inIsAuditCase", "s425Inr", "inPurelyPresumptive"],
        compute: function(d, ctx) {
          if (!d.in1ShouldFire) return [];
          var inAdvInterestInr = d.totalInterestInr;
          return [{
            id: "india_advance_tax_interest",
            severity: "warning",
            category: "credit",
            title: "Advance-tax interest exposure \u2014 ss.424/425 (" + inr(inAdvInterestInr) + ")",
            detail: "Advance tax paid (" + inr(d.advancePaidInr) + ") falls short of the assessed tax (" + inr(d.assessedTaxInr) + ") this year. At 1%/month simple interest: " + inr(d.s424Inr) + " under s.424 (shortfall below the 90% floor, " + d.inS424Months + " months to the " + (d.inIsAuditCase ? "audit-case (31 Oct)" : "non-audit (31 Jul)") + " due date) + " + inr(d.s425Inr) + " under s.425 (" + (d.inPurelyPresumptive ? "single 15-Mar installment shortfall \u2014 presumptive-scheme filers owe 100% in one installment, s.425 proviso" : "quarter-by-quarter installment shortfalls") + "). Both keep accruing past the due date until actually paid \u2014 this is the exposure AS OF the due date, not a final number.",
            recommendation: "Pay the shortfall before filing to stop s.424 interest accruing further; s.425's quarter-by-quarter amount is fixed once the year ends and doesn't grow. If the year isn't over yet, revise the remaining installment(s) upward.",
            amountUsd: inrToUsd(inAdvInterestInr, ctx),
            refs: ["s.424", "s.425", "1%/month simple interest"]
          }];
        }
      };
      NODES.underpayment2210Finding = {
        deps: ["us1ShouldFire", "us2210PenaltyUsd", "usPaidTotalUsd", "usCurrentHarborUsd", "usPriorHarborUsd", "usPriorHarborPct"],
        compute: function(d) {
          if (!d.us1ShouldFire) return [];
          var penaltyUsd = d.us2210PenaltyUsd;
          return [{
            id: "underpayment_2210",
            severity: "warning",
            category: "credit",
            title: "US estimated-tax underpayment penalty \u2014 Form 2210 (" + usd(penaltyUsd) + " estimated)",
            detail: "Withholding + estimated payments (" + usd(d.usPaidTotalUsd) + ") fall short of both safe harbors: 90% of this year's tax (" + usd(d.usCurrentHarborUsd) + ") and " + (d.usPriorHarborUsd != null ? Math.round(d.usPriorHarborPct * 100) + "% of last year's tax (" + usd(d.usPriorHarborUsd) + ")" : "the prior-year safe harbor (last year's total tax was never entered, so only the current-year harbor could be checked)") + ", with a balance due over the $1,000 de-minimis. Estimated penalty (simplified regular method, equal quarterly installments, withholding spread evenly, no cross-quarter netting): " + usd(penaltyUsd) + ".",
            recommendation: "Confirm against the real Form 2210 (it can use the Annualized Income Installment Method for uneven income, which this estimate does not model, and could produce a lower number). Paying the shortfall now stops further accrual.",
            amountUsd: Math.max(0, penaltyUsd),
            refs: ["Form 2210", "\xA76654"]
          }];
        }
      };
      NODES.earlyWithdrawalPenalty72tFinding = {
        deps: ["us5ShouldFire", "penalty72tUsd", "earlyDistUsd", "ageAtYearEndUs"],
        compute: function(d) {
          if (!d.us5ShouldFire) return [];
          return [{
            id: "early_withdrawal_penalty_72t",
            severity: "warning",
            category: "credit",
            title: "\xA772(t) 10% early-withdrawal penalty on IRA/401(k) distributions (" + usd(d.penalty72tUsd) + ")",
            detail: usd(d.earlyDistUsd) + " of IRA/401(k) distributions are on file for a taxpayer age " + d.ageAtYearEndUs + " at year-end \u2014 under the 59\xBD threshold. Absent a statutory exception, \xA772(t) adds a flat 10% additional tax (" + usd(d.penalty72tUsd) + ") on top of ordinary income tax already computed on this same income.",
            recommendation: "Confirm whether a real exception applies (death, disability, SEPP under \xA772(t)(2)(A)(iv), first $10,000 for a first-time home purchase, higher education, medical expenses over 7.5% of AGI, qualified birth/adoption up to $5,000) \u2014 none of these are captured by Layer 1 today, so this assumes the full 10% applies until confirmed otherwise.",
            amountUsd: d.penalty72tUsd,
            refs: ["\xA772(t)", "Form 5329"]
          }];
        }
      };
      NODES.scheduleFaInconsistentFinding = {
        deps: ["scheduleFaInconsistentTrigger"],
        compute: function(d) {
          if (!d.scheduleFaInconsistentTrigger) return [];
          return [{
            id: "schedule_fa_inconsistent",
            severity: "critical",
            category: "document",
            title: "Layer 1 forms disagree: India form says 'no foreign assets', US form shows foreign holdings",
            detail: "The India intake form explicitly records NO foreign assets, but the US intake form shows US-source income and/or non-Indian accounts for the same taxpayer \u2014 who is an Indian ROR this year and therefore subject to worldwide Schedule FA disclosure. This is a direct contradiction between the two forms, not just a missing field.",
            recommendation: "Reconcile the two forms before filing: either the India form's 'no foreign assets' answer needs correcting, or the US-side accounts/income need to be re-checked. Schedule FA penalties for non-disclosure are severe and independent of whether any tax is actually due on the asset.",
            amountUsd: 0,
            refs: ["Schedule FA", "Black Money Act"]
          }];
        }
      };
      NODES.blackMoneyActExposureFinding = {
        deps: ["scheduleFaInconsistentTrigger", "xb7ShouldFire", "bmaAssetValueUsd", "bmaMaxTotalUsd"],
        compute: function(d) {
          if (!d.scheduleFaInconsistentTrigger || !d.xb7ShouldFire) return [];
          var bmaTaxUsd = d.bmaAssetValueUsd * 0.3;
          var bmaMaxPenaltyUsd = bmaTaxUsd * 3;
          return [{
            id: "black_money_act_exposure",
            severity: "critical",
            category: "document",
            title: "Black Money Act 2015 exposure on undisclosed foreign assets \u2014 up to " + usd(d.bmaMaxTotalUsd) + " at stake",
            detail: usd(d.bmaAssetValueUsd) + " of foreign asset value is undisclosed on Schedule FA (same forms-disagree fact as above). The Black Money Act imposes a flat 30% tax (" + usd(bmaTaxUsd) + ") on the asset value PLUS a penalty of up to 3x that tax (up to " + usd(bmaMaxPenaltyUsd) + ") \u2014 up to " + usd(d.bmaMaxTotalUsd) + " total (120% of the asset's value) \u2014 PLUS possible prosecution (up to 10 years' rigorous imprisonment for willful evasion), independent of and in addition to the monetary exposure.",
            recommendation: "Correct the Schedule FA disclosure before this compounds further. FAST-DS 2026 (a one-time amnesty window, gap tracker XB-21) offers a much cheaper cure \u2014 30% tax + 30% penalty (60% total) if the asset/income was never taxed, or a flat \u20B91,00,000 fee if it was bought from already-taxed income or acquired while genuinely NRI.",
            amountUsd: d.bmaMaxTotalUsd,
            refs: ["Black Money Act 2015", "s.10", "s.41", "s.51", "Schedule FA"]
          }];
        }
      };
      NODES.buildTaxComputationResult = {
        deps: ["buildTaxComputationIndiaResult", "buildTaxComputationUsResult", "buildTaxComputationUsStateResult"],
        compute: function(d) {
          return { india: d.buildTaxComputationIndiaResult, us: d.buildTaxComputationUsResult, usState: d.buildTaxComputationUsStateResult };
        }
      };
      var FINDING_ADD_ORDER = [
        "dual_residency",
        "dual_residency_resolved",
        "treaty_docs_missing",
        "dtaa_treaty_elections",
        "withholding_documentation_gap",
        "pan_not_linked_aadhaar",
        "ftc_gap",
        "ftc_available",
        "feie_ineligible",
        "feie_applied",
        "amt_applies",
        "india_advance_tax_interest",
        "underpayment_2210",
        "early_withdrawal_penalty_72t",
        "iso_3921",
        "form_10iea",
        "form_1099da_awareness",
        "state_income_tax",
        "niit_medicare_not_creditable",
        "no_totalization_agreement",
        "pe_article7",
        "entity_dual_residency_poem",
        "residency_status_dtaa_conflated_india",
        "residency_status_mismatch_india_company",
        "residency_status_mismatch_india",
        "residency_status_mismatch_india_entity",
        "residency_status_understated_us",
        "residency_status_overstated_us",
        "residency_status_understated_us_entity",
        "residency_status_overstated_us_entity",
        "chapter_xiia_elected_no_holdings",
        "chapter_xiia_investment_income_missing",
        "chapter_xiia_investment_income_computed",
        "special_rate_gaming_winnings",
        "s115bbe_unexplained_income",
        "carry_forward_losses_not_applied",
        "nra_fdap_flat_rate",
        "nra_w8ben_missing",
        "firpta",
        "form67_required",
        "tax_year_mismatch",
        "fx_basis",
        "state_treaty_not_binding",
        "pfic",
        "cfc",
        "cfc_below_threshold",
        "transfer_pricing",
        "retirement_mismatch",
        "deemed_dividend_buyback_mismatch",
        "promoter_buyback_additional_tax",
        "holding_period_mismatch_",
        "schedule_fa_inconsistent",
        "black_money_act_exposure",
        "india_itr_form_mismatch",
        "foreign_gift_3520",
        "covered_expat_gift_tax",
        "lrs_limit",
        "fbar_limit",
        "trump_account_contribution_limit",
        "equity_comp_sourcing",
        "cross_basis_summary"
      ];
      function findingAddOrderIndex(id) {
        var i = FINDING_ADD_ORDER.indexOf(id);
        if (i >= 0) return i;
        return FINDING_ADD_ORDER.indexOf("holding_period_mismatch_");
      }
      NODES.findingsAllResult = {
        deps: [
          "findingsBatch1Result",
          "findingsBatch2Result",
          "findingsBatch3Result",
          "findingsBatch4Result",
          "findingsBatch5Result",
          "holdingPeriodMismatchFindingsResult",
          "residencyConsistencyFindings",
          "indiaAdvanceTaxInterestFinding",
          "underpayment2210Finding",
          "earlyWithdrawalPenalty72tFinding",
          "scheduleFaInconsistentFinding",
          "blackMoneyActExposureFinding"
        ],
        compute: function(d) {
          var all = [].concat(
            d.findingsBatch1Result,
            d.findingsBatch2Result,
            d.findingsBatch3Result,
            d.findingsBatch4Result,
            d.findingsBatch5Result,
            d.holdingPeriodMismatchFindingsResult,
            d.residencyConsistencyFindings,
            d.indiaAdvanceTaxInterestFinding,
            d.underpayment2210Finding,
            d.earlyWithdrawalPenalty72tFinding,
            d.scheduleFaInconsistentFinding,
            d.blackMoneyActExposureFinding
          );
          all.sort(function(a, b) {
            return findingAddOrderIndex(a.id) - findingAddOrderIndex(b.id);
          });
          var weight = { critical: 0, warning: 1, info: 2 };
          all.sort(function(a, b) {
            if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
            return b.amountUsd - a.amountUsd;
          });
          return all;
        }
      };
      NODES.summaryResult = {
        deps: ["findingsAllResult", "buildDocumentsResult"],
        compute: function(d, ctx) {
          var model = ctx.model, computed = ctx.computed;
          var counts = { critical: 0, warning: 0, info: 0 };
          d.findingsAllResult.forEach(function(x) {
            counts[x.severity]++;
          });
          var monitoring = ctx.monitoringBoundary;
          return {
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
            counts,
            requiredDocs: d.buildDocumentsResult.filter(function(doc) {
              return doc.required;
            }).length,
            healthScore: monitoring ? monitoring.health.score : null,
            nextDeadline: monitoring && monitoring.calendar.next ? monitoring.calendar.next.dateLabel : null
          };
        }
      };
      NODES.analyzeResult = {
        deps: [
          "findingsAllResult",
          "buildDocumentsResult",
          "buildFtcReportResult",
          "buildTaxComputationResult",
          "buildWithholdingSummaryResult",
          "buildScopeNotesResult",
          "buildReturnFormDeterminationResult",
          "summaryResult"
        ],
        compute: function(d, ctx) {
          return {
            model: ctx.model,
            computed: ctx.computed,
            findings: d.findingsAllResult,
            documents: d.buildDocumentsResult,
            ftcReport: d.buildFtcReportResult,
            taxComputation: d.buildTaxComputationResult,
            withholding: d.buildWithholdingSummaryResult,
            scopeNotes: d.buildScopeNotesResult,
            returnForms: d.buildReturnFormDeterminationResult,
            monitoring: ctx.monitoringBoundary,
            summary: d.summaryResult
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/report-batch6-nodes.js
  var require_report_batch6_nodes = __commonJS({
    "prototypes/graph-pilot/report-batch6-nodes.js"(exports, module) {
      "use strict";
      var reportBatch5Nodes = require_report_batch5_nodes().NODES;
      var NODES = {};
      Object.keys(reportBatch5Nodes).forEach(function(k) {
        NODES[k] = reportBatch5Nodes[k];
      });
      var DAY = 864e5;
      function addDays(d, n) {
        return new Date(d.getTime() + n * DAY);
      }
      function fmtDate(d) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      function daysBetween(a, b) {
        return Math.round((b - a) / DAY);
      }
      function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
      }
      NODES.monitorAsOfBoundary = {
        deps: [],
        compute: function(d, ctx) {
          return ctx.monitorAsOfBoundary !== void 0 ? new Date(ctx.monitorAsOfBoundary) : /* @__PURE__ */ new Date();
        }
      };
      NODES.monitorProgressResult = {
        deps: ["monitorAsOfBoundary"],
        compute: function(d, ctx) {
          var baseYear = ctx.model.meta.baseYear;
          var today = d.monitorAsOfBoundary;
          var cyStart = new Date(baseYear, 0, 1), cyEnd = new Date(baseYear, 11, 31);
          var fyStart = new Date(baseYear, 3, 1), fyEnd = new Date(baseYear + 1, 2, 31);
          var SIM = 0.62;
          function progress(start, end) {
            var f = (today - start) / (end - start);
            return f > 0.03 && f < 0.98 ? f : SIM;
          }
          var progUS = progress(cyStart, cyEnd);
          var progIN = progress(fyStart, fyEnd);
          var simulated = !((today - cyStart) / (cyEnd - cyStart) > 0.03 && today - cyEnd < 0);
          return { baseYear, today, cyStart, cyEnd, fyStart, fyEnd, progUS, progIN, simulated };
        }
      };
      NODES.residencyMonitorResult = {
        deps: ["monitorProgressResult"],
        compute: function(d, ctx) {
          var model = ctx.model, computed = ctx.computed;
          var prog = d.monitorProgressResult;
          function counter(cfg) {
            var days = cfg.days, threshold = cfg.threshold, p = cfg.prog;
            var already = cfg.isResident || days >= threshold;
            var pace = days / (p * 365);
            var res = {
              kind: "days",
              country: cfg.country,
              flag: cfg.flag,
              test: cfg.test,
              days,
              threshold,
              pct: clamp(days / threshold, 0, 1.5),
              isResident: already,
              projectedFullYear: Math.round(p > 0 ? days / p : days),
              pace
            };
            if (already) {
              var elapsedToCross = pace > 0 ? threshold / pace : 0;
              var crossDate = addDays(cfg.yearStart, Math.min(365, elapsedToCross));
              res.status = "resident";
              res.headline = cfg.worldwide === false ? "Resident (source basis) \u2014 foreign income not taxed here" : "Tax resident \u2014 worldwide income in scope";
              res.dateLabel = "Crossed ~" + fmtDate(crossDate);
            } else if (res.projectedFullYear >= threshold && pace > 0) {
              var elapsedNeeded = (threshold - days) / pace;
              res.status = "will_flip";
              res.flipDate = addDays(prog.today, elapsedNeeded);
              res.headline = threshold - days + " more days \u2192 becomes resident";
              res.dateLabel = "Projected flip ~" + fmtDate(res.flipDate) + " at current pace";
            } else {
              res.status = "safe";
              res.headline = "Non-resident \u2014 " + (threshold - days) + " days of headroom";
              res.dateLabel = "Not projected to cross this year";
            }
            return res;
          }
          function qualitative(cfg) {
            return {
              kind: "qualitative",
              country: cfg.country,
              flag: cfg.flag,
              test: cfg.test,
              status: cfg.isResident ? "resident" : "safe",
              isResident: cfg.isResident,
              headline: cfg.isResident ? cfg.worldwide === false ? "Resident (source basis) \u2014 foreign income not taxed here" : "Tax resident \u2014 worldwide income in scope" : "Non-resident \u2014 this entity type has no day-count or presence test",
              facts: cfg.facts || []
            };
          }
          var E = model.entity || {};
          var indiaKind = E.indiaKind || "individual";
          var indiaEntry;
          if (indiaKind === "individual") {
            indiaEntry = counter({
              country: "India",
              flag: "\u{1F1EE}\u{1F1F3}",
              test: "\u2265182 days in the FY",
              days: model.residency.india.daysCurrentYear,
              threshold: 182,
              prog: prog.progIN,
              isResident: computed.residency.india.isResident,
              worldwide: computed.residency.india.worldwide,
              yearStart: prog.fyStart
            });
          } else if (indiaKind === "company") {
            var isIndianCo = model.residency.india.isIndianCompanyFact;
            var cr = model.companyResidency || {};
            var coFacts = [];
            if (isIndianCo === true) {
              coFacts.push("Incorporated in India \u2014 unconditionally resident regardless of POEM (s.6(3))");
            } else if (isIndianCo === false) {
              coFacts.push("NOT incorporated in India \u2014 residency turns on Place of Effective Management (POEM)");
              coFacts.push(cr.boardMeetingsOutsideIndia ? "Board meets primarily outside India" : "Board meets primarily in India");
              if (cr.keyManagementLocation) coFacts.push("Key management location: " + cr.keyManagementLocation);
              if (cr.directorsInIndia || cr.directorsOutsideIndia) coFacts.push(cr.directorsInIndia + " director(s) in India, " + cr.directorsOutsideIndia + " outside");
            } else {
              coFacts.push("Incorporation status (Indian vs. foreign) not yet answered on Layer 1 India");
            }
            indiaEntry = qualitative({
              country: "India",
              flag: "\u{1F1EE}\u{1F1F3}",
              test: isIndianCo === false ? "Place of Effective Management (POEM) \u2014 s.6(3)" : "Incorporation \u2014 s.6(3)",
              isResident: computed.residency.india.isResident,
              worldwide: computed.residency.india.worldwide,
              facts: coFacts
            });
          } else {
            var wo = model.residency.india.indiaWhollyOutsideIndiaFact;
            var nonIndFacts = [wo === true ? "Control & management of its affairs is wholly outside India" : wo === false ? "Control & management is (at least partly) situated in India" : "Control & management location not yet answered on Layer 1 India"];
            if (indiaKind === "huf" && wo === false) {
              nonIndFacts.push("Karta's own presence this FY (" + model.residency.india.daysCurrentYear + " days) still determines ROR vs. RNOR sub-status, separately from the HUF's own residency");
            }
            indiaEntry = qualitative({
              country: "India",
              flag: "\u{1F1EE}\u{1F1F3}",
              test: "Control & management (s.6(2)/s.6(4)) \u2014 not day-count",
              isResident: computed.residency.india.isResident,
              worldwide: computed.residency.india.worldwide,
              facts: nonIndFacts
            });
          }
          var usEntry;
          var usIsEntityTaxpayer = indiaKind !== "individual" || E.usIsBusiness;
          if (!usIsEntityTaxpayer) {
            usEntry = counter({
              country: "United States",
              flag: "\u{1F1FA}\u{1F1F8}",
              test: "Substantial Presence (\u2265183 weighted)",
              days: model.residency.us.daysCurrentYear,
              threshold: 183,
              prog: prog.progUS,
              isResident: model.residency.us.sptMet || model.residency.us.isCitizen || model.residency.us.hasGreenCard,
              worldwide: computed.residency.us.worldwide,
              yearStart: prog.cyStart
            });
          } else if (E.usIsBusiness) {
            var incUs = E.usIncorporatedInUs, incState = E.usIncorporationState;
            var usFacts = [];
            if (incUs === true) usFacts.push("Organized/incorporated in the United States" + (incState ? " (" + incState + ")" : "") + " \u2014 a domestic entity taxed on worldwide income regardless of where it operates");
            else if (incUs === false) usFacts.push("NOT organized/incorporated in the United States \u2014 a foreign entity for US tax purposes (files Form 1120-F or the analogous foreign-entity return, not modeled here)");
            else usFacts.push("Place of organization/incorporation not yet answered on Layer 1 US");
            usEntry = qualitative({
              country: "United States",
              flag: "\u{1F1FA}\u{1F1F8}",
              test: "Place of organization/incorporation \u2014 not a presence test",
              isResident: incUs === true,
              worldwide: incUs === true,
              facts: usFacts
            });
          } else {
            usEntry = qualitative({
              country: "United States",
              flag: "\u{1F1FA}\u{1F1F8}",
              test: "Place of organization/incorporation \u2014 not a presence test",
              isResident: false,
              worldwide: false,
              facts: ["No US business entity (ccorp/scorp/partnership/trust) organized for this taxpayer on Layer 1 US \u2014 a foreign entity for US tax purposes with no day-count or presence test to run"]
            });
          }
          return [usEntry, indiaEntry];
        }
      };
      NODES.projectionsMonitorResult = {
        deps: ["monitorProgressResult"],
        compute: function(d, ctx) {
          var prog = d.monitorProgressResult;
          return (ctx.computed.limits || []).map(function(g) {
            var p = g.id === "lrs" ? prog.progIN : prog.progUS;
            var yearStart = g.id === "lrs" ? prog.fyStart : prog.cyStart;
            var yearLen = g.id === "lrs" ? (prog.fyEnd - prog.fyStart) / DAY : (prog.cyEnd - prog.cyStart) / DAY;
            var projected = p > 0 ? g.value / p : g.value;
            var out = {
              id: g.id,
              label: g.label,
              current: g.value,
              limit: g.limit,
              pct: g.pct,
              projected,
              projPct: g.limit > 0 ? projected / g.limit : 0,
              note: g.note
            };
            if (g.value >= g.limit) {
              out.status = "breached";
              out.dateLabel = "Already breached";
            } else if (projected >= g.limit && g.value > 0) {
              var f = g.limit * p / g.value;
              out.status = "will_breach";
              out.breachDate = addDays(yearStart, clamp(f, 0, 1) * yearLen);
              out.dateLabel = "Projected to cross ~" + fmtDate(out.breachDate);
            } else {
              out.status = "ok";
              out.dateLabel = "Within limit at current pace";
            }
            return out;
          });
        }
      };
      var US_RETURN_DOCS = [
        "fincen_114",
        "form_8938",
        "form_1116",
        "form_2555",
        "form_8833",
        "form_8621",
        "form_5471",
        "form_8865",
        "form_3520",
        "form_3520a",
        "form_1040nr",
        "form_8960",
        "form_8959",
        "form_6251",
        "form_540",
        "form_it201",
        "form_nj1040",
        "form_8858"
      ];
      var IN_RETURN_DOCS = ["form_67", "trc", "form_10f", "schedule_fa", "schedule_fsi_tr", "schedule_al", "form_3cb_3cd", "form_3ceb", "form_29b", "form_10iea", "form_10ic", "form_10id"];
      function mdate(y, m, day) {
        return new Date(y, m - 1, day);
      }
      var US_FILING_DATES = {
        "1120": { orig: function(by) {
          return mdate(by + 1, 4, 15);
        }, ext: function(by) {
          return mdate(by + 1, 10, 15);
        }, label: "US Form 1120 (C-Corp)" },
        "1120-S": { orig: function(by) {
          return mdate(by + 1, 3, 15);
        }, ext: function(by) {
          return mdate(by + 1, 9, 15);
        }, label: "US Form 1120-S (S-Corp)" },
        "1065": { orig: function(by) {
          return mdate(by + 1, 3, 15);
        }, ext: function(by) {
          return mdate(by + 1, 9, 15);
        }, label: "US Form 1065 (Partnership)" },
        "1041": { orig: function(by) {
          return mdate(by + 1, 4, 15);
        }, ext: function(by) {
          return mdate(by + 1, 9, 30);
        }, label: "US Form 1041 (Trust/Estate)" },
        "1040-NR": { orig: function(by) {
          return mdate(by + 1, 4, 15);
        }, ext: function(by) {
          return mdate(by + 1, 10, 15);
        }, label: "US Form 1040-NR + FBAR" },
        "1040": { orig: function(by) {
          return mdate(by + 1, 4, 15);
        }, ext: function(by) {
          return mdate(by + 1, 10, 15);
        }, label: "US Form 1040 + Form 1116 + FBAR" }
      };
      NODES.calendarMonitorResult = {
        deps: ["monitorProgressResult", "entityFormsResult", "indiaIsCompany", "inIsAuditCase", "inPurelyPresumptive", "viaForeignCorpXbr4"],
        compute: function(d, ctx) {
          var model = ctx.model;
          var prog = d.monitorProgressResult;
          var baseYear = prog.baseYear, today = prog.today;
          var usKind = d.entityFormsResult.usReturnForm;
          var filingCfg = US_FILING_DATES[usKind] || US_FILING_DATES["1040"];
          var usFiling = { orig: filingCfg.orig(baseYear), ext: filingCfg.ext(baseYear), label: filingCfg.label };
          var usQ4 = usKind === "1120" ? { date: mdate(baseYear, 12, 15), label: "US estimated tax \u2014 Q4 (C-Corp)" } : { date: mdate(baseYear + 1, 1, 15), label: "US estimated tax \u2014 Q4" };
          var indiaIsAuditCase = d.inIsAuditCase;
          var indiaFiling = d.viaForeignCorpXbr4 ? { date: mdate(baseYear + 1, 11, 30), label: "India ITR + Form 44 (s.92E/transfer-pricing case)" } : indiaIsAuditCase ? { date: mdate(baseYear + 1, 10, 31), label: "India ITR + Form 44 (audit case)" } : { date: mdate(baseYear + 1, 7, 31), label: "India ITR + Form 44 (non-audit)" };
          var indiaAdvanceTaxRows = d.inPurelyPresumptive ? [
            { name: "India advance tax \u2014 single installment (100%, presumptive scheme)", jur: "IN", date: mdate(baseYear + 1, 3, 15), cat: "Advance tax", docIds: [] }
          ] : [
            { name: "India advance tax \u2014 Q1 (15%)", jur: "IN", date: mdate(baseYear, 6, 15), cat: "Advance tax", docIds: [] },
            { name: "India advance tax \u2014 Q2 (45%)", jur: "IN", date: mdate(baseYear, 9, 15), cat: "Advance tax", docIds: [] },
            { name: "India advance tax \u2014 Q3 (75%)", jur: "IN", date: mdate(baseYear, 12, 15), cat: "Advance tax", docIds: [] },
            { name: "India advance tax \u2014 Q4 (100%)", jur: "IN", date: mdate(baseYear + 1, 3, 15), cat: "Advance tax", docIds: [] }
          ];
          var deadlines = indiaAdvanceTaxRows.concat([
            { name: "US estimated tax \u2014 Q1", jur: "US", date: mdate(baseYear, 4, 15), cat: "Estimated tax", docIds: [] },
            { name: "US estimated tax \u2014 Q2", jur: "US", date: mdate(baseYear, 6, 15), cat: "Estimated tax", docIds: [] },
            { name: "US estimated tax \u2014 Q3", jur: "US", date: mdate(baseYear, 9, 15), cat: "Estimated tax", docIds: [] },
            { name: usQ4.label, jur: "US", date: usQ4.date, cat: "Estimated tax", docIds: [] },
            { name: usFiling.label, jur: "US", date: usFiling.orig, cat: "Filing", docIds: US_RETURN_DOCS },
            { name: indiaFiling.label, jur: "IN", date: indiaFiling.date, cat: "Filing", docIds: IN_RETURN_DOCS },
            { name: "US extended " + usFiling.label.replace(/^US /, "") + " deadline", jur: "US", date: usFiling.ext, cat: "Extension", docIds: US_RETURN_DOCS },
            { name: "India belated / revised ITR", jur: "IN", date: mdate(baseYear + 1, 12, 31), cat: "Extension", docIds: IN_RETURN_DOCS }
          ]).filter(function(x) {
            if (x.jur === "IN") return model.meta.hasIndiaScope !== false;
            if (x.jur === "US") return model.meta.hasUsScope !== false;
            return true;
          }).map(function(x) {
            var du = daysBetween(today, x.date);
            x.daysUntil = du;
            x.status = du < 0 ? "passed" : du <= 30 ? "due_soon" : "upcoming";
            x.dateLabel = fmtDate(x.date);
            return x;
          }).sort(function(a, b) {
            return a.date - b.date;
          });
          var upcoming = deadlines.filter(function(x) {
            return x.status !== "passed";
          });
          var nextDeadline = upcoming[0] || null;
          return { all: deadlines, upcoming, next: nextDeadline };
        }
      };
      NODES.healthAlertsMonitorResult = {
        deps: ["findingsAllResult", "projectionsMonitorResult", "residencyMonitorResult", "calendarMonitorResult"],
        compute: function(d) {
          var findings = d.findingsAllResult, projections = d.projectionsMonitorResult;
          var residency = d.residencyMonitorResult, calendarObj = d.calendarMonitorResult;
          var counts = { critical: 0, warning: 0, info: 0 };
          findings.forEach(function(f) {
            counts[f.severity]++;
          });
          var breachedLimits = projections.filter(function(p) {
            return p.status === "breached";
          }).length;
          var willBreach = projections.filter(function(p) {
            return p.status === "will_breach";
          }).length;
          var overdueFilings = calendarObj.all.filter(function(x) {
            return x.status === "passed" && x.cat === "Filing";
          }).length;
          var score = 100 - 16 * counts.critical - 3 * counts.warning - 8 * breachedLimits - 4 * willBreach;
          score = Math.round(clamp(score, 8, 100));
          var band = score >= 80 ? { label: "Healthy", color: "#10B981" } : score >= 50 ? { label: "Needs attention", color: "#D4AF37" } : { label: "At risk", color: "#ef4444" };
          var alerts = [];
          findings.filter(function(f) {
            return f.severity === "critical";
          }).slice(0, 4).forEach(function(f) {
            alerts.push({ sev: "critical", icon: "\u26D4", text: f.title, meta: f.refs && f.refs[0] ? f.refs[0] : "Conflict" });
          });
          projections.forEach(function(p) {
            if (p.status === "breached") alerts.push({ sev: "critical", icon: "\u{1F6A8}", text: p.label + " threshold breached", meta: p.dateLabel });
            else if (p.status === "will_breach") alerts.push({ sev: "warning", icon: "\u{1F4C8}", text: p.label + " on track to breach", meta: p.dateLabel });
          });
          residency.forEach(function(r) {
            if (r.status === "will_flip") alerts.push({ sev: "warning", icon: "\u{1F9ED}", text: r.country + " residency approaching", meta: r.dateLabel });
            else if (r.status === "resident") alerts.push({ sev: "info", icon: "\u{1F310}", text: r.country + " tax residency active", meta: r.dateLabel });
          });
          calendarObj.upcoming.filter(function(x) {
            return x.daysUntil <= 45;
          }).slice(0, 4).forEach(function(x) {
            alerts.push({ sev: x.daysUntil <= 15 ? "warning" : "info", icon: "\u{1F4C5}", text: x.name + " due", meta: "in " + x.daysUntil + " days (" + x.dateLabel + ")" });
          });
          var sevW = { critical: 0, warning: 1, info: 2 };
          alerts.sort(function(a, b) {
            return sevW[a.sev] - sevW[b.sev];
          });
          return {
            health: { score, band, breachedLimits, willBreach, overdueFilings },
            alerts: alerts.slice(0, 12)
          };
        }
      };
      NODES.monitorResult = {
        deps: ["monitorProgressResult", "residencyMonitorResult", "projectionsMonitorResult", "calendarMonitorResult", "healthAlertsMonitorResult"],
        compute: function(d) {
          var prog = d.monitorProgressResult;
          return {
            asOf: prog.today,
            simulated: prog.simulated,
            baseYear: prog.baseYear,
            progressUS: prog.progUS,
            progressIN: prog.progIN,
            residency: d.residencyMonitorResult,
            projections: d.projectionsMonitorResult,
            calendar: d.calendarMonitorResult,
            health: d.healthAlertsMonitorResult.health,
            alerts: d.healthAlertsMonitorResult.alerts
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/limits-nodes.js
  var require_limits_nodes = __commonJS({
    "prototypes/graph-pilot/limits-nodes.js"(exports, module) {
      "use strict";
      var baseNodes = require_report_batch6_nodes().NODES;
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      var fxRate = require_fx_util().fxRate;
      var L = require_constants().CONST.LIMITS;
      function feieEligibilityFull(f) {
        f = f || {};
        var claimed = !!f.claimed || (f.amountClaimedUsd || 0) > 0;
        var home = String(f.taxHomeCountry || "").trim().toLowerCase();
        var taxHomeAbroad = home !== "" && home !== "us" && home !== "usa" && home !== "united states" && home !== "united states of america";
        var ppDaysOk = (f.daysInUsTestPeriod || 0) <= 35;
        var ppMet = !!f.physicalPresence && ppDaysOk;
        var bfMet = !!f.bonaFide;
        var reasons = [];
        if (claimed && !taxHomeAbroad) reasons.push(home === "" ? "no foreign tax home entered" : "tax home is in the US");
        if (claimed && !bfMet && !ppMet) {
          reasons.push(!f.physicalPresence && !f.bonaFide ? "neither the bona-fide-residence nor the physical-presence test is met" : f.physicalPresence && !ppDaysOk ? f.daysInUsTestPeriod + " US days in the test period \u2014 over the ~35-day allowance (330 full days abroad required)" : "bona-fide-residence test not met");
        }
        return {
          claimed,
          amountClaimedUsd: f.amountClaimedUsd || 0,
          taxHomeAbroad,
          testMet: bfMet || ppMet,
          eligible: taxHomeAbroad && (bfMet || ppMet),
          reasons
        };
      }
      var NODES = {};
      Object.keys(baseNodes).forEach(function(k) {
        NODES[k] = baseNodes[k];
      });
      NODES.feieLimitsRaw = {
        deps: [],
        compute: function(d, ctx) {
          var us = ctx.us;
          return {
            claimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
            amountClaimedUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
            foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
            taxHomeCountry: safe(us, "foreign_earned_income.tax_home_country", ""),
            bonaFide: safe(us, "foreign_earned_income.bona_fide_residence", false) === true,
            physicalPresence: safe(us, "foreign_earned_income.physical_presence", false) === true,
            daysInUsTestPeriod: num(safe(us, "foreign_earned_income.days_in_us_during_test_period", 0))
          };
        }
      };
      NODES.nroCumulativeRepatriatedUsdRaw = {
        deps: [],
        compute: function(d, ctx) {
          return num(safe(ctx.india, "nro_repatriation.cumulative_repatriated_usd_this_fy", 0));
        }
      };
      NODES.hasUsPeRaw = {
        deps: [],
        compute: function(d, ctx) {
          return safe(ctx.us, "nra_specific.has_us_pe", false) === true;
        }
      };
      NODES.form8938RequiredRaw = {
        deps: [],
        compute: function(d, ctx) {
          return safe(ctx.us, "form_8938_required", false) === true;
        }
      };
      NODES.limitsResult = {
        deps: [
          "hasUsScopeBoundaryFtc",
          "hasIndiaScopeXbr",
          "aggregatePeakUsdResult",
          "usFilingStatusRaw",
          "feieLimitsRaw",
          "limitsRawExtra",
          "nroCumulativeRepatriatedUsdRaw"
        ],
        compute: function(d, ctx) {
          var gauges = [];
          function gauge(id, label, valueUsd, limitUsd, unit, note) {
            var pct = limitUsd > 0 ? valueUsd / limitUsd : 0;
            var status = pct >= 1 ? "breached" : pct >= 0.8 ? "approaching" : "ok";
            gauges.push({ id, label, value: valueUsd, limit: limitUsd, pct, status, unit: unit || "USD", note: note || "" });
          }
          var scopeHasUs = d.hasUsScopeBoundaryFtc;
          var scopeHasIndia = d.hasIndiaScopeXbr;
          var aggregatePeakUsd = d.aggregatePeakUsdResult.usd;
          if (scopeHasUs) {
            gauge(
              "fbar",
              "FBAR (FinCEN 114) aggregate",
              aggregatePeakUsd,
              L.FBAR_AGGREGATE_USD,
              "USD",
              "Threshold is a cliff: any breach = full reporting of every foreign account."
            );
          }
          var isMfj = d.usFilingStatusRaw === "mfj";
          var feieEl = feieEligibilityFull(d.feieLimitsRaw);
          var abroad = feieEl.taxHomeAbroad && feieEl.testMet;
          var tbl = L.FORM_8938[abroad ? isMfj ? "ABROAD_MFJ" : "ABROAD_SINGLE" : isMfj ? "US_RESIDENT_MFJ" : "US_RESIDENT_SINGLE"];
          if (scopeHasUs) {
            gauge(
              "form8938",
              "Form 8938 (FATCA) any-time",
              aggregatePeakUsd,
              tbl.anyTime,
              "USD",
              "Threshold shown is the 'any time during year' figure for your status/residence."
            );
          }
          if (scopeHasIndia) {
            gauge(
              "lrs",
              "LRS outbound remittance",
              d.limitsRawExtra.lrsRemittedInr / fxRate(ctx),
              L.LRS_ANNUAL_USD,
              "USD",
              "RBI cap is per individual per financial year; TCS applies above \u20B910L."
            );
          }
          if (scopeHasIndia && d.nroCumulativeRepatriatedUsdRaw > 0) {
            gauge(
              "nro_repatriation",
              "NRO repatriation (this FY)",
              d.nroCumulativeRepatriatedUsdRaw,
              L.NRO_REPATRIATION_ANNUAL_USD,
              "USD",
              "RBI ceiling on NRO-account repatriation abroad, separate from and in addition to the LRS cap above \u2014 each repatriation needs its own Form 15CA/15CB (Form 145/146 from TY2026-27)."
            );
          }
          if (feieEl.claimed || d.feieLimitsRaw.foreignEarnedIncomeUsd > 0) {
            var feieUsed = feieEl.eligible ? Math.min(d.feieLimitsRaw.amountClaimedUsd || d.feieLimitsRaw.foreignEarnedIncomeUsd, L.FEIE_MAX_USD) : 0;
            gauge(
              "feie",
              "FEIE exclusion used",
              feieUsed,
              L.FEIE_MAX_USD,
              "USD",
              feieEl.eligible ? "Excluded foreign earned income cannot also generate FTC \u2014 \xA7911 no-double-dip applied." : feieEl.claimed ? "FEIE claimed but NOT eligible (" + feieEl.reasons.join("; ") + ") \u2014 exclusion set to $0." : "Not claimed."
            );
          }
          if (d.limitsRawExtra.trumpAccountsOpened) {
            var taChildren = Math.max(1, d.limitsRawExtra.trumpAccountsNumChildren || 1);
            gauge(
              "trump_account",
              "Trump Account (\xA7530A) annual contributions",
              d.limitsRawExtra.trumpAccountsContributionsUsd,
              L.TRUMP_ACCOUNT_ANNUAL_CAP_USD * taChildren,
              "USD",
              "Cap is " + L.TRUMP_ACCOUNT_ANNUAL_CAP_USD.toLocaleString("en-US") + "/child/year, combined across all contributors (parents, family, employer) \u2014 shown here as the aggregate across " + taChildren + " child(ren)."
            );
          }
          return gauges;
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/agg10-nodes.js
  var require_agg10_nodes = __commonJS({
    "prototypes/graph-pilot/agg10-nodes.js"(exports, module) {
      "use strict";
      var baseNodes = require_limits_nodes().NODES;
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      var fxRate = require_fx_util().fxRate;
      var NODES = {};
      Object.keys(baseNodes).forEach(function(k) {
        NODES[k] = baseNodes[k];
      });
      NODES.identityResult = {
        deps: ["usFilingStatusRaw"],
        compute: function(d, ctx) {
          var india = ctx.india, us = ctx.us, router = ctx.router;
          return {
            name: safe(router, "full_name", safe(india, "profile.full_name", safe(us, "profile.full_name", "Unnamed Taxpayer"))),
            dob: safe(router, "date_of_birth", safe(india, "profile.date_of_birth", safe(us, "profile.date_of_birth", null))),
            usFilingStatus: d.usFilingStatusRaw,
            indiaEntityType: safe(india, "profile.entity_type", "individual"),
            panAadhaarLinked: safe(india, "profile.pan_aadhaar_linked", null)
          };
        }
      };
      NODES.metaResult = {
        deps: ["hasUsScopeBoundaryFtc", "hasIndiaScopeXbr"],
        compute: function(d, ctx) {
          var india = ctx.india, us = ctx.us, router = ctx.router;
          var scopeHasUs = d.hasUsScopeBoundaryFtc, scopeHasIndia = d.hasIndiaScopeXbr;
          return {
            hasIndia: !!ctx.india && Object.keys(ctx.india || {}).length > 0,
            hasUs: !!ctx.us && Object.keys(ctx.us || {}).length > 0,
            hasRouter: !!ctx.router && Object.keys(ctx.router || {}).length > 0,
            hasIndiaScope: scopeHasIndia,
            hasUsScope: scopeHasUs,
            jurisdiction: scopeHasIndia && scopeHasUs ? "dual" : scopeHasUs ? "single_us" : "single_india",
            baseYear: num(safe(router, "base_tax_year", safe(us, "metadata.us_calendar_year", 2025))) || 2025,
            fxRate: fxRate(ctx),
            indiaSchemaVersion: safe(india, "metadata.schema_version", null),
            usSchemaVersion: safe(us, "metadata.schema_version", null),
            indiaQuarterly: !!safe(india, "quarters", null)
          };
        }
      };
      NODES.entityResult = {
        deps: [],
        compute: function(d, ctx) {
          var india = ctx.india, us = ctx.us;
          var indiaEntityKind = safe(india, "profile.entity_type", "individual");
          var indiaIsCompany = indiaEntityKind === "company";
          var indiaIsFirm = ["firm", "llp", "local"].indexOf(indiaEntityKind) >= 0;
          var indiaIsAop = indiaEntityKind === "aop";
          var indiaIsTrust = indiaEntityKind === "trust";
          var indiaLayer1Itr = safe(india, "itr_recommendation.form", null);
          if (indiaLayer1Itr === "Unknown") indiaLayer1Itr = null;
          var indiaReturnFormCrude = indiaIsCompany ? "ITR-6" : indiaIsTrust ? "ITR-7" : indiaIsFirm || indiaIsAop ? "ITR-5" : "ITR-2/3";
          var indiaReturnForm = indiaLayer1Itr || indiaReturnFormCrude;
          var usT = safe(us, "profile.tax_entity_type", "individual");
          if (usT === "llc") usT = safe(us, "profile.llc_tax_election", "individual");
          var usIsBusiness = ["ccorp", "scorp", "partnership", "trust"].indexOf(usT) >= 0;
          var usIsCorpOrPartnership = ["ccorp", "scorp", "partnership"].indexOf(usT) >= 0;
          var m1 = safe(us, "corporate_financials.schedule_m1", null);
          var m1HasData = usIsCorpOrPartnership && m1 && [
            "net_income_per_books",
            "federal_tax_expense",
            "tax_exempt_interest",
            "tax_depreciation_over_book",
            "meals_disallowed_50",
            "foreign_taxes_credited",
            "interest_expense_limitation",
            "other_additions",
            "other_subtractions"
          ].some(function(k) {
            return num(m1[k]) !== 0;
          });
          var usScheduleM1TaxableIncomeUsd = m1HasData ? num(m1.net_income_per_books) + num(m1.federal_tax_expense) + num(m1.meals_disallowed_50) + num(m1.foreign_taxes_credited) + num(m1.interest_expense_limitation) + num(m1.other_additions) - num(m1.tax_exempt_interest) - num(m1.tax_depreciation_over_book) - num(m1.other_subtractions) : null;
          return {
            indiaKind: indiaEntityKind,
            usKind: usT,
            indiaIsCompany,
            indiaIsFirm,
            indiaIsAop,
            indiaIsTrust,
            indiaOpt115baa: safe(india, "profile.opt_115baa", false) === true,
            indiaOpt115bab: safe(india, "profile.opt_115bab", false) === true,
            indiaOpt115ba: safe(india, "profile.opt_115ba", false) === true,
            indiaTurnoverLte400cr: safe(india, "profile.turnover_lte_400cr", false) === true,
            indiaMatBookProfitInr: safe(india, "profile.mat_book_profit", null),
            indiaIsSection8: safe(india, "profile.is_section_8", false) === true,
            isCompanyDirector: safe(india, "profile.is_company_director", false) === true,
            usIsBusiness,
            usScheduleM1TaxableIncomeUsd,
            usIncorporatedInUs: usIsBusiness ? safe(us, "profile.incorporated_in_us", null) : null,
            usIncorporationState: usIsBusiness ? safe(us, "profile.incorporation_state", null) : null,
            isBusiness: indiaIsCompany || indiaIsFirm || indiaIsAop || indiaIsTrust || usIsBusiness,
            indiaReturnForm,
            indiaReturnFormIsRecommendation: !!indiaLayer1Itr,
            indiaReturnFormExplanation: indiaLayer1Itr ? safe(india, "itr_recommendation.explanation", null) : null,
            usReturnForm: usT === "ccorp" ? "1120" : usT === "scorp" ? "1120-S" : usT === "partnership" ? "1065" : usT === "trust" ? "1041" : safe(us, "nra_specific.files_form_1040nr", false) === true ? "1040-NR" : "1040"
          };
        }
      };
      NODES.residencyModelSliceResult = {
        // Found by run-fuzz.js (randomized differential testing, 20 Jul 2026):
        // this node only ever carried the 4 fields the DAG's own computation
        // reads (status/daysCurrentYear/isIndianCompanyFact/
        // indiaWhollyOutsideIndiaFact) — no fixed fixture's run-agg10.js/
        // test-adapter.mjs check ever deep-compared model.residency.india's FULL
        // shape, so the other 9 raw pass-through fields (normalize.js:2354,
        // 2380-2394 — taxRegime, the individual s.6(1)/s.6(1A) residency-solver
        // facts, dtaaWorldwideCeded) plus domesticStatusDerived went unnoticed as
        // missing. All raw reads, same style as the 4 already here; only
        // domesticStatusDerived is an actual re-derivation, already ported
        // (residency-nodes.js's indiaDomesticStatusDerived, XBR-1) — reused, not
        // duplicated.
        deps: ["indiaDomesticStatusDerived"],
        compute: function(d, ctx) {
          var india = ctx.india, us = ctx.us;
          return {
            india: {
              status: safe(india, "residency_detail.final_india_residency_status", null),
              daysCurrentYear: num(safe(india, "residency_detail.days_in_india_current_year", 0)),
              taxRegime: safe(india, "profile.tax_regime", "NEW"),
              isIndianCompanyFact: safe(india, "residency_detail.is_indian_company", null),
              indiaWhollyOutsideIndiaFact: safe(india, "residency_detail.is_wholly_outside_india", null),
              daysPreceding4YearsGte365: safe(india, "residency_detail.days_in_india_preceding_4_years_gte_365", null),
              employmentOrCrewStatus: safe(india, "residency_detail.employment_or_crew_status", null),
              cameOnVisitPioCitizen: safe(india, "residency_detail.came_on_visit_to_india_pio_citizen", null),
              nrYearsLast10Gte9: safe(india, "residency_detail.nr_years_last_10_gte_9", null),
              daysLast7YearsLte729: safe(india, "residency_detail.days_in_india_last_7_years_lte_729", null),
              indiaSourceIncomeAbove15L: safe(india, "residency_detail.india_source_income_above_15l", null),
              liableToTaxElsewhereAsIndianCitizen: safe(india, "residency_detail.liable_to_tax_in_another_country_being_indian_citizen", false) === true,
              dtaaWorldwideCeded: safe(india, "residency_detail.dtaa_worldwide_ceded", false) === true,
              domesticStatusDerived: d.indiaDomesticStatusDerived
            },
            us: {
              status: safe(us, "us_residency_detail.final_us_residency_status", null),
              isCitizen: safe(us, "us_residency_detail.is_us_citizen", false) === true,
              hasGreenCard: safe(us, "us_residency_detail.has_green_card", false) === true,
              sptMet: safe(us, "us_residency_detail.spt_test_met", false) === true,
              daysCurrentYear: num(safe(us, "us_residency_detail.us_days_current_year", 0))
            }
          };
        }
      };
      NODES.companyResidencyResult = {
        deps: [],
        compute: function(d, ctx) {
          var india = ctx.india;
          return {
            isActiveBusiness: safe(india, "company_residency.is_active_business", false) === true,
            boardMeetingsOutsideIndia: safe(india, "company_residency.board_meetings_primarily_outside_india", false) === true,
            keyManagementLocation: safe(india, "company_residency.key_management_location", null),
            managementDelegatedOutsideIndia: safe(india, "company_residency.management_delegated_outside_india", false) === true,
            directorsInIndia: num(safe(india, "company_residency.directors_in_india_count", 0)),
            directorsOutsideIndia: num(safe(india, "company_residency.directors_outside_india_count", 0))
          };
        }
      };
      NODES.treatyModelResult = {
        deps: [],
        compute: function(d, ctx) {
          var india = ctx.india, us = ctx.us;
          return {
            trcStatus: safe(india, "dtaa.trc_status", false) === true || safe(india, "compliance_docs.trc.document_uploaded", false) === true,
            form10fFiled: safe(india, "compliance_docs.form_10f.is_filed", false) === true,
            treatyResidence: safe(india, "dtaa.dtaa_treaty_residence", "none"),
            dtaaForcedNr: safe(india, "dtaa.dtaa_forced_nr", false) === true,
            hasPE: safe(india, "dtaa.has_permanent_establishment_in_india", false) === true,
            usTreatyResidence: safe(us, "us_residency_detail.dtaa_treaty_residence", "none"),
            files1040nr: safe(us, "nra_specific.files_form_1040nr", false) === true,
            form8833Implied: safe(us, "us_residency_detail.dtaa_treaty_residence", "none") !== "none",
            chapterXiiaElected: safe(india, "compliance_docs.chapter_xiia_elected", false) === true,
            tieBreakHome: safe(india, "dtaa.tb_home", null),
            tieBreakCvi: safe(india, "dtaa.tb_cvi", null),
            tieBreakAbode: safe(india, "dtaa.tb_abode", null),
            tieBreakNationality: safe(india, "dtaa.tb_nationality", null),
            treatyElections: safe(india, "dtaa.treaty_elections", []) || []
          };
        }
      };
      NODES.headlineResult = {
        deps: [
          "identityResult",
          "metaResult",
          "totalIndiaIncomeInr",
          "aggregateUsIncomeResult",
          "totalTaxInrCombined",
          "usTaxResult",
          "residencyResult",
          "ftcResult"
        ],
        compute: function(d, ctx) {
          var usTotalIncomeUsd = d.usTaxResult.isEntity ? d.usTaxResult.totalIncomeUsd : d.aggregateUsIncomeResult.total.usd;
          return {
            name: d.identityResult.name,
            baseYear: d.metaResult.baseYear,
            jurisdiction: d.metaResult.jurisdiction,
            totalIncomeUsd: usTotalIncomeUsd + d.totalIndiaIncomeInr / fxRate(ctx),
            indiaTaxUsd: d.totalTaxInrCombined / fxRate(ctx),
            usTaxUsd: d.usTaxResult.totalTaxBeforeFtcUsd,
            combinedTaxBeforeReliefUsd: d.totalTaxInrCombined / fxRate(ctx) + d.usTaxResult.totalTaxBeforeFtcUsd,
            worldwideOverlap: d.residencyResult.worldwideOverlap,
            netUnrelievedDoubleTaxUsd: d.ftcResult.netUnrelievedDoubleTaxUsd
          };
        }
      };
      NODES.usEntityKind = { deps: ["entityResult"], compute: function(d) {
        return d.entityResult.usKind;
      } };
      NODES.baseYearUs = { deps: ["metaResult"], compute: function(d) {
        return d.metaResult.baseYear;
      } };
      NODES.vdaSaleConsiderationInrBoundary = { deps: ["capitalGainsComputation"], compute: function(d) {
        return d.capitalGainsComputation.vdaSaleConsiderationInr;
      } };
      function withSyntheticCtx(orig, extraDeps, buildCtx) {
        return {
          deps: orig.deps.concat(extraDeps),
          scopeGate: orig.scopeGate,
          outOfScopeValue: orig.outOfScopeValue,
          compute: function(d, ctx) {
            return orig.compute(d, buildCtx(d, ctx));
          }
        };
      }
      NODES.monitorProgressResult = withSyntheticCtx(baseNodes.monitorProgressResult, ["metaResult"], function(d, ctx) {
        return { model: { meta: d.metaResult }, monitorAsOfBoundary: ctx.monitorAsOfBoundary };
      });
      NODES.residencyMonitorResult = withSyntheticCtx(
        baseNodes.residencyMonitorResult,
        ["entityResult", "metaResult", "residencyModelSliceResult", "companyResidencyResult", "residencyResult"],
        function(d) {
          return {
            model: { entity: d.entityResult, meta: d.metaResult, residency: d.residencyModelSliceResult, companyResidency: d.companyResidencyResult },
            computed: { residency: d.residencyResult }
          };
        }
      );
      NODES.projectionsMonitorResult = withSyntheticCtx(baseNodes.projectionsMonitorResult, ["limitsResult"], function(d) {
        return { computed: { limits: d.limitsResult } };
      });
      NODES.calendarMonitorResult = withSyntheticCtx(baseNodes.calendarMonitorResult, ["metaResult"], function(d) {
        return { model: { meta: d.metaResult } };
      });
      NODES.summaryResult = withSyntheticCtx(
        baseNodes.summaryResult,
        ["identityResult", "metaResult", "residencyResult", "headlineResult", "monitorResult"],
        function(d) {
          return {
            model: { identity: d.identityResult, meta: d.metaResult },
            computed: { residency: d.residencyResult, headline: d.headlineResult },
            monitoringBoundary: d.monitorResult
          };
        }
      );
      NODES.baseYear = { deps: ["metaResult"], compute: function(d) {
        return d.metaResult.baseYear;
      } };
      NODES.assessedTaxInrBoundary = { deps: ["totalTaxInrCombined"], compute: function(d) {
        return num(d.totalTaxInrCombined);
      } };
      NODES.hasValidPresumptiveEntryBoundary = { deps: ["businessComputation"], compute: function(d) {
        return !!d.businessComputation.indiaHasValidPresumptiveEntry;
      } };
      NODES.hasRegularBooksEntryBoundary = { deps: ["businessComputation"], compute: function(d) {
        return !!d.businessComputation.indiaHasRegularBooksEntry;
      } };
      NODES.hasPartnerFirmIncomeBoundary = { deps: ["businessComputation"], compute: function(d) {
        return !!d.businessComputation.indiaHasPartnerFirmIncome;
      } };
      NODES.businessInrBoundary = { deps: ["businessComputation"], compute: function(d) {
        return num(d.businessComputation.businessInr);
      } };
      NODES.speculativeIncomeInrBoundary = { deps: ["speculativeIncomeInrAgg"], compute: function(d) {
        return num(d.speculativeIncomeInrAgg);
      } };
      NODES.indianBusinessesBoundary = { deps: ["annualSliceAgg"], compute: function(d) {
        return safe(d.annualSliceAgg.domestic_income || {}, "business_income.business_entries", []);
      } };
      NODES.usTotalTaxBeforeFtcUsdBoundary = { deps: ["usTaxResult"], compute: function(d) {
        return num(d.usTaxResult.totalTaxBeforeFtcUsd);
      } };
      NODES.usAgiUsdBoundary = { deps: ["usTaxResult"], compute: function(d) {
        return num(d.usTaxResult.agiUsd);
      } };
      NODES.usFtcAllowedUsdBoundary = { deps: ["ftcResult"], compute: function(d) {
        return num(d.ftcResult.us.ftcAllowedUsd);
      } };
      NODES.us1ShouldFire = {
        deps: ["hasUsScope", "us2210PenaltyUsd", "usBalanceDueUsd", "usPaidTotalUsd", "usRequiredUsd", "usTaxResult"],
        scopeGate: "hasUsScope",
        outOfScopeValue: false,
        compute: function(d) {
          if (d.usTaxResult.isEntity) return false;
          return d.usBalanceDueUsd > 1e3 && d.usPaidTotalUsd < d.usRequiredUsd;
        }
      };
      NODES.accountsBoundary = {
        deps: ["bankAccountsRaw"],
        compute: function(d, ctx) {
          var indianAccounts = d.bankAccountsRaw.india.map(function(b) {
            return {
              bank: b.bank_name || "Indian Bank",
              type: b.account_type || "savings",
              peak: { inr: num(b.peak_balance_inr), usd: num(b.peak_balance_inr) / fxRate(ctx) },
              country: "India"
            };
          });
          var usDisclosed = d.bankAccountsRaw.us.map(function(b) {
            return {
              bank: b.bank_name || "Bank",
              type: b.account_type || "savings",
              peak: b.peak_balance_usd !== void 0 ? { usd: num(b.peak_balance_usd), inr: num(b.peak_balance_usd) * fxRate(ctx) } : { inr: num(b.peak_balance_inr), usd: num(b.peak_balance_inr) / fxRate(ctx) },
              country: b.country || "India"
            };
          });
          return indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
        }
      };
      NODES.usSourceTotalUsdBoundary = { deps: ["aggregateUsIncomeResult"], compute: function(d) {
        return num(d.aggregateUsIncomeResult.usSourceTotal.usd);
      } };
      NODES.usSecuritiesBoundary = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "financial_holdings", []) || [];
      } };
      NODES.modelEchoBoundary = { deps: [], compute: function(d, ctx) {
        return ctx.model || null;
      } };
      NODES.computedEchoBoundary = { deps: [], compute: function(d, ctx) {
        return ctx.computed || null;
      } };
      NODES.analyzeResult = withSyntheticCtx(
        baseNodes.analyzeResult,
        ["modelEchoBoundary", "computedEchoBoundary", "monitorResult"],
        function(d) {
          return { model: d.modelEchoBoundary, computed: d.computedEchoBoundary, monitoringBoundary: d.monitorResult };
        }
      );
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/ustax-full-nodes.js
  var require_ustax_full_nodes = __commonJS({
    "prototypes/graph-pilot/ustax-full-nodes.js"(exports, module) {
      "use strict";
      var baseNodes = require_agg10_nodes().NODES;
      var CONST = require_constants().CONST;
      var T = CONST.TAX.US;
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function bracketTax(amount, slabs) {
        var t = Math.max(0, amount), tax = 0, prev = 0;
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            tax += (Math.min(t, cap) - prev) * rate;
            prev = cap;
          } else break;
        }
        return tax;
      }
      function bracketBreakdown(amount, slabs) {
        var t = Math.max(0, amount), prev = 0, rows = [];
        for (var i = 0; i < slabs.length; i++) {
          var cap = slabs[i][0], rate = slabs[i][1];
          if (t > prev) {
            var taxable = Math.min(t, cap) - prev;
            rows.push({ from: prev, to: cap, rate, taxable, tax: taxable * rate });
            prev = cap;
          } else break;
        }
        return rows;
      }
      function usd(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
      }
      function computeSaltCap(agi, status) {
        var base = T.SALT_CAP_BASE_USD[status] || T.SALT_CAP_BASE_USD.single;
        var threshold = T.SALT_CAP_PHASEOUT_THRESHOLD_USD[status] || T.SALT_CAP_PHASEOUT_THRESHOLD_USD.single;
        var reduced = base - T.SALT_CAP_PHASEOUT_RATE * Math.max(0, agi - threshold);
        return Math.max(T.SALT_CAP_FLOOR_USD, Math.min(base, reduced));
      }
      var NODES = {};
      Object.keys(baseNodes).forEach(function(k) {
        NODES[k] = baseNodes[k];
      });
      var TRUST_ESTATE_BRACKETS = [[3150, 0.1], [11450, 0.24], [15650, 0.35], [Infinity, 0.37]];
      NODES.nraRaw = {
        deps: [],
        compute: function(d, ctx) {
          var us = ctx.us;
          return {
            hasUsPe: safe(us, "nra_specific.has_us_pe", false) === true,
            submittedW8ben: safe(us, "nra_specific.submitted_w8ben", false) === true,
            eciIncomeUsd: num(safe(us, "nra_specific.us_eci_income_usd", 0)),
            fdapIncomeUsd: num(safe(us, "nra_specific.us_fdap_income_usd", 0)),
            treatyRateClaims: safe(us, "nra_specific.treaty_rate_claims", []) || [],
            usRealPropertyDisposed: safe(us, "nra_specific.us_real_property_disposed", false) === true,
            firptaWithholdingUsd: num(safe(us, "nra_specific.firpta_withholding_usd", 0)),
            s6013hElection: safe(us, "nra_specific.s6013h_joint_election", false) === true
          };
        }
      };
      NODES.trustRetainedIncomeUsdRaw = { deps: [], compute: function(d, ctx) {
        return num(safe(ctx.us, "profile.trust_retained_income_usd", 0));
      } };
      NODES.usEntityTaxResult = {
        deps: ["usEntityKind", "entityResult", "aggregateUsIncomeResult", "trustRetainedIncomeUsdRaw"],
        compute: function(d) {
          var kind = d.usEntityKind;
          var m1Taxable = d.entityResult.usScheduleM1TaxableIncomeUsd;
          var taxable = m1Taxable != null ? m1Taxable : d.aggregateUsIncomeResult.total.usd;
          function usEntityResult(taxableUsd, tax2, label, passthrough) {
            return {
              filingStatus: label,
              isEntity: true,
              passthrough,
              worldwide: true,
              totalIncomeUsd: taxableUsd,
              agiUsd: taxableUsd,
              deductionUsd: 0,
              deductionMode: "n/a",
              taxableIncomeUsd: taxableUsd,
              ordinaryTaxUsd: tax2,
              preferentialTaxUsd: 0,
              incomeTaxUsd: tax2,
              niitUsd: 0,
              additionalMedicareUsd: 0,
              seTaxUsd: 0,
              qbiDeductionUsd: 0,
              amtUsd: 0,
              creditsUsd: 0,
              totalTaxBeforeFtcUsd: tax2,
              // DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H —
              // "entity-agnostic audit", 21 Jul 2026): the engine reads
              // model.income.us.foreignSourceTotal/usSourceTotal here — the
              // INDIVIDUAL-shaped aggregate (wages+interest+dividends+...), which
              // is always $0 for an entity, since an entity's own income is
              // Schedule M-1 book-to-tax reconciled (taxableUsd, above), a
              // completely separate figure Layer 1 never folds into that
              // individual aggregate. That $0 cascades into real wrong numbers,
              // not just display: India's own s.90 FTC relief for US tax paid
              // zeroes out entirely (ftc-nodes.js's usSourceTotalUsdBoundaryFtc
              // reads the same field), and the FY<->CY apportionment card shows
              // $0 for the whole US side. Fixed here at the source: this engine
              // model has no data splitting an entity's OWN M-1 income into
              // US-source vs foreign-source pieces (that's a distinct, separately-
              // tracked GILTI/CFC inclusion on model.assets.businessEntities, not
              // part of this entity's own return) — worldwide:true already three
              // lines up encodes the same "tax the whole M-1 figure, no further
              // split" assumption this model already makes for entity taxpayers,
              // so treating the full taxableUsd as US-source (zero foreign-source)
              // is the same assumption stated consistently, not a new one.
              foreignSourceIncomeUsd: 0,
              usSourceIncomeUsd: taxableUsd,
              effectiveRate: taxableUsd > 0 ? tax2 / taxableUsd : 0
            };
          }
          if (kind === "ccorp") {
            var tax = taxable * T.C_CORP_RATE;
            return usEntityResult(taxable, tax, "C-Corp (1120, 21%)", false);
          }
          if (kind === "trust") {
            var retainedUsd = d.trustRetainedIncomeUsdRaw;
            var distributedUsd = taxable;
            var totalTrustIncomeUsd = distributedUsd + retainedUsd;
            var trustTax = bracketTax(retainedUsd, TRUST_ESTATE_BRACKETS);
            var r = usEntityResult(totalTrustIncomeUsd, trustTax, "Trust/Estate (1041)" + (retainedUsd > 0 ? " \u2014 retained income at compressed \xA71(e) rates" : " \xB7 pass-through (fully distributed)"), retainedUsd <= 0);
            r.taxableIncomeUsd = retainedUsd;
            r.trustDistributedUsd = distributedUsd;
            r.trustRetainedUsd = retainedUsd;
            r.trustBracketBreakdown = bracketBreakdown(retainedUsd, TRUST_ESTATE_BRACKETS);
            return r;
          }
          return usEntityResult(taxable, 0, (kind === "scorp" ? "S-Corp (1120-S)" : "Partnership (1065)") + " \xB7 pass-through", true);
        }
      };
      var ENTITY_STATE_CCORP_RATES = {
        CA: { rate: 0.0884, name: "California", label: "California's flat 8.84% corporate franchise tax rate \u2014 excludes the $800 minimum franchise tax and the 10.84% financial-corporation rate" },
        NY: { rate: 0.0725, name: "New York", label: "New York's 7.25% Article 9-A top-bracket business income base rate \u2014 excludes the lower 6.5% bracket (ENI \u2264 $5M), the fixed-dollar-minimum tax based on NY receipts, and the MTA surcharge" },
        NJ: { rate: 0.09, name: "New Jersey", label: "New Jersey's 9% Corporation Business Tax top-bracket rate \u2014 excludes the lower 6.5%/7.5% brackets and the temporary 2.5% surtax on income over $1M" }
      };
      var ENTITY_NO_INCOME_TAX_REAL_REGIME = {
        TX: "Texas has no corporate income tax, but levies its own Franchise (Margin) Tax \u2014 a gross-receipts/margin-based tax, structurally different from an income tax. Not modeled here \u2014 do not assume $0 state tax exposure.",
        WA: "Washington has no corporate income tax, but levies its own Business & Occupation (B&O) Tax \u2014 a gross-receipts tax on most business activity, structurally different from an income tax. Not modeled here \u2014 do not assume $0 state tax exposure."
      };
      NODES.usEntityStateOfDomicileRaw = { deps: [], compute: function(d, ctx) {
        return safe(ctx.us, "profile.state_of_domicile", null);
      } };
      NODES.usEntityStateTaxResult = {
        deps: ["usEntityKind", "usEntityStateOfDomicileRaw", "usEntityTaxResult"],
        compute: function(d) {
          if (d.usEntityKind === "individual") return null;
          var stateCode = d.usEntityStateOfDomicileRaw;
          if (!stateCode) return null;
          var kind = d.usEntityKind;
          var base = { state: stateCode, kind };
          if (ENTITY_NO_INCOME_TAX_REAL_REGIME[stateCode]) {
            return Object.assign({}, base, {
              modeled: false,
              stateName: stateCode === "TX" ? "Texas" : "Washington",
              reason: ENTITY_NO_INCOME_TAX_REAL_REGIME[stateCode]
            });
          }
          if (kind === "scorp" || kind === "partnership") {
            return Object.assign({}, base, {
              modeled: false,
              stateName: null,
              reason: "Pass-through at the state level too, same as federal \u2014 no entity-level state income tax by default. Not checked here: whether " + stateCode + " offers a PTET (pass-through entity tax) election, which shifts state tax liability onto the entity as a federal-SALT-cap workaround."
            });
          }
          if (kind === "trust") {
            return Object.assign({}, base, {
              modeled: false,
              stateName: null,
              reason: "State fiduciary income tax has its own throwback/accumulation-distribution rules, materially different from the federal \xA71(e) brackets computed above \u2014 not modeled."
            });
          }
          var T2 = ENTITY_STATE_CCORP_RATES[stateCode];
          if (!T2) {
            return Object.assign({}, base, {
              modeled: false,
              stateName: null,
              reason: "State-level C-Corp income tax is not modeled for " + stateCode + " \u2014 do not assume $0 exposure."
            });
          }
          var taxableUsd = Math.max(0, d.usEntityTaxResult.taxableIncomeUsd);
          var totalTaxUsd = Math.round(taxableUsd * T2.rate);
          return Object.assign({}, base, {
            modeled: true,
            stateName: T2.name,
            rate: T2.rate,
            rateLabel: T2.label,
            taxableIncomeUsd: taxableUsd,
            totalTaxUsd,
            basis: "TY2025 rates (returns filed 2026); " + T2.label + ". Single-state, no apportionment (assumes 100% of federal taxable income is allocated to " + T2.name + ")."
          });
        }
      };
      NODES.findingsAllResult = {
        deps: baseNodes.findingsAllResult.deps.concat(["usEntityStateTaxResult"]),
        compute: function(d, ctx) {
          var all = baseNodes.findingsAllResult.compute(d, ctx).slice();
          var est = d.usEntityStateTaxResult;
          if (est) {
            if (est.modeled) {
              all.push({
                id: "us_entity_state_tax",
                severity: "warning",
                category: "credit",
                title: est.stateName + " state entity-level tax: " + usd(est.totalTaxUsd) + " (C-Corp)",
                detail: est.stateName + " taxes this entity's own net income at the entity level, separate from and in addition to the 21% federal corporate rate \u2014 computed here as " + usd(est.totalTaxUsd) + " on " + usd(est.taxableIncomeUsd) + " of federal taxable income at " + est.rateLabel + ".",
                recommendation: "File the entity's " + est.stateName + " corporate return (in addition to Form 1120) alongside the federal return. This is a simplified top-bracket-rate, single-state estimate \u2014 confirm the exact minimum-tax/surtax/apportionment figures with a preparer before relying on it.",
                amountUsd: est.totalTaxUsd,
                refs: [est.stateName + " corporate income tax", "Form 1120"]
              });
            } else {
              all.push({
                id: "us_entity_state_tax_not_modeled",
                severity: "info",
                category: "credit",
                title: (est.stateName || est.state) + " entity-level state tax exposure \u2014 not modeled",
                detail: est.reason,
                recommendation: "Confirm this entity's actual state-level tax exposure in " + (est.stateName || est.state) + " with a preparer \u2014 WISING does not compute it here, and this is NOT a confirmed-zero result.",
                amountUsd: 0,
                refs: [est.stateName || est.state]
              });
            }
            var weight = { critical: 0, warning: 1, info: 2 };
            all.sort(function(a, b) {
              if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
              return b.amountUsd - a.amountUsd;
            });
          }
          return all;
        }
      };
      NODES.nraTaxResult = {
        deps: ["nraRaw", "usFilingStatusRaw", "dedUs", "additionalMedicareOwedBoundary"],
        compute: function(d) {
          var nra = d.nraRaw;
          var status = d.usFilingStatusRaw === "mfj" ? "mfj" : "single";
          var brackets = T.BRACKETS[status] || T.BRACKETS.single;
          var ded = d.dedUs;
          var eciUsd = nra.eciIncomeUsd || 0;
          var fdapUsd = nra.fdapIncomeUsd || 0;
          var claim = (nra.treatyRateClaims || [])[0];
          var claimedRate = claim && claim.rate != null ? Math.max(0, Math.min(1, Number(claim.rate) / 100)) : null;
          var w8benOnFile = nra.submittedW8ben === true;
          var fdapRate = w8benOnFile && claimedRate != null ? claimedRate : 0.3;
          var itemized = Math.min(ded.salt, computeSaltCap(eciUsd, status)) + ded.mortgageInterest + ded.charitable + Math.max(0, ded.medical - 0.075 * eciUsd);
          var taxableEciUsd = Math.max(0, eciUsd - itemized);
          var eciTaxUsd = bracketTax(taxableEciUsd, brackets);
          var eciBracketBreakdown = bracketBreakdown(taxableEciUsd, brackets);
          var fdapTaxUsd = fdapUsd * fdapRate;
          var addlMedicare = d.additionalMedicareOwedBoundary || 0;
          var totalTax = eciTaxUsd + fdapTaxUsd + addlMedicare;
          return {
            filingStatus: status,
            worldwide: false,
            isNra: true,
            totalIncomeUsd: eciUsd + fdapUsd,
            agiUsd: eciUsd,
            deductionUsd: itemized,
            deductionMode: "itemized (NRA \u2014 no standard deduction)",
            taxableIncomeUsd: taxableEciUsd,
            ordinaryTaxUsd: eciTaxUsd,
            preferentialTaxUsd: 0,
            incomeTaxUsd: eciTaxUsd + fdapTaxUsd,
            niitUsd: 0,
            additionalMedicareUsd: addlMedicare,
            seTaxUsd: 0,
            qbiDeductionUsd: 0,
            amtUsd: 0,
            creditsUsd: 0,
            totalTaxBeforeFtcUsd: totalTax,
            foreignSourceIncomeUsd: 0,
            usSourceIncomeUsd: eciUsd + fdapUsd,
            nra: {
              eciUsd,
              fdapUsd,
              fdapRate,
              eciTaxUsd,
              fdapTaxUsd,
              taxableEciUsd,
              eciBracketBreakdown,
              claimedRate,
              w8benOnFile,
              incomeType: claim && claim.income_type || null
            },
            feie: { claimed: false, eligible: false, taxHomeAbroad: false, testMet: false, reasons: [], appliedUsd: 0 },
            effectiveRate: eciUsd + fdapUsd > 0 ? totalTax / (eciUsd + fdapUsd) : 0
          };
        }
      };
      NODES.usTaxIndividualResult = baseNodes.usTaxResult;
      NODES.usTaxResult = {
        deps: ["usEntityKind", "files1040nr", "s6013hElection", "usEntityTaxResult", "nraTaxResult", "usTaxIndividualResult"],
        compute: function(d) {
          var ek = d.usEntityKind;
          if (ek === "ccorp" || ek === "scorp" || ek === "partnership" || ek === "trust") return d.usEntityTaxResult;
          if (d.files1040nr && !d.s6013hElection) return d.nraTaxResult;
          return d.usTaxIndividualResult;
        }
      };
      NODES.apportionmentResult = {
        deps: ["apportionmentBaseYearRaw", "apportionmentIndiaQuarterlyUsdRaw", "indiaTotalIncomeUsdForApportionment", "usTaxResult", "aggregateUsIncomeResult"],
        compute: function(d) {
          var baseYear = d.apportionmentBaseYearRaw;
          var q = d.apportionmentIndiaQuarterlyUsdRaw;
          var hasQ = !!(q && q.some(function(x) {
            return x > 0;
          }));
          var indiaFyTotal = d.indiaTotalIncomeUsdForApportionment;
          var primaryShare, nextShare;
          if (hasQ) {
            var qTot = q[0] + q[1] + q[2] + q[3] || indiaFyTotal || 1;
            primaryShare = (q[0] + q[1] + q[2]) / qTot;
            nextShare = q[3] / qTot;
          } else {
            primaryShare = 0.75;
            nextShare = 0.25;
          }
          var usCyTotal = d.usTaxResult.isEntity ? d.usTaxResult.usSourceIncomeUsd : d.aggregateUsIncomeResult.usSourceTotal.usd;
          return {
            basis: hasQ ? "Indian quarterly data" : "even-earning assumption (Apr\u2013Dec vs Jan\u2013Mar)",
            fyLabel: "FY " + baseYear + "\u2013" + String(baseYear + 1).slice(2),
            cyPrimary: baseYear,
            cyNext: baseYear + 1,
            indiaFyTotalUsd: indiaFyTotal,
            indiaToCyPrimaryUsd: Math.round(indiaFyTotal * primaryShare),
            indiaToCyNextUsd: Math.round(indiaFyTotal * nextShare),
            primaryShare,
            nextShare,
            usCyTotalUsd: usCyTotal,
            usCyToFyPrimaryUsd: Math.round(usCyTotal * 9 / 12),
            usCyToFyNextUsd: Math.round(usCyTotal * 3 / 12)
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/assets-nodes.js
  var require_assets_nodes = __commonJS({
    "prototypes/graph-pilot/assets-nodes.js"(exports, module) {
      "use strict";
      var baseNodes = require_ustax_full_nodes().NODES;
      var NODES = {};
      Object.keys(baseNodes).forEach(function(k) {
        NODES[k] = baseNodes[k];
      });
      function safe(obj, path, dflt) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
          if (cur == null) return dflt;
          cur = cur[parts[i]];
        }
        return cur === void 0 || cur === null ? dflt : cur;
      }
      function num(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
      }
      var fxRate = require_fx_util().fxRate;
      function calc(formula, parts, citation) {
        return { kind: "calc", formula, parts: parts || [], citation: citation || null };
      }
      function source(detail, citation) {
        return { kind: "source", detail, citation: citation || null };
      }
      var CONST_ASSETS = require_constants().CONST;
      var ASSET_CLASS_RATES_INDIA = CONST_ASSETS.TAX.INDIA.ASSET_CLASS_RATES_INDIA;
      function computeSelfEmploymentNetProfitUsd(s) {
        var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
        var grossProfit = num(s.gross_receipts_usd) - num(s.returns_and_allowances_usd) - cogs;
        return grossProfit + num(s.other_income_usd) - num(s.expenses_usd);
      }
      function selfEmploymentNetProfitUsd(s, depreciationUsd) {
        var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
        if (explicit !== void 0 && explicit !== null) return num(explicit);
        return computeSelfEmploymentNetProfitUsd(s) - num(depreciationUsd || 0);
      }
      function selfEmploymentIncomeTrace(s, depreciationPlanEntry) {
        var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
        if (explicit !== void 0 && explicit !== null) {
          return source("Net self-employment earnings entered directly on Layer 1 US for this business (not derived from gross receipts and expenses).");
        }
        var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
        var parts = [{ label: "Gross receipts", amount: num(s.gross_receipts_usd) }];
        if (num(s.returns_and_allowances_usd) > 0) parts.push({ label: "Less: returns & allowances", amount: -num(s.returns_and_allowances_usd) });
        if (cogs > 0) parts.push({ label: "Less: cost of goods sold", amount: -cogs });
        if (num(s.other_income_usd) > 0) parts.push({ label: "Plus: other business income", amount: num(s.other_income_usd) });
        if (num(s.expenses_usd) > 0) parts.push({ label: "Less: business expenses", amount: -num(s.expenses_usd) });
        (depreciationPlanEntry ? depreciationPlanEntry.assets : []).forEach(function(a) {
          var label = "Asset (" + a.class + ", yr " + a.yearN + ")";
          if (a.sec179Usd > 0) parts.push({ label: label + " \u2014 \xA7179", amount: -a.sec179Usd });
          if (a.bonusUsd > 0) parts.push({ label: label + " \u2014 100% bonus depreciation", amount: -a.bonusUsd });
          if (a.macrsUsd > 0) parts.push({ label: label + " \u2014 MACRS", amount: -a.macrsUsd });
        });
        return calc("Schedule C: gross receipts less returns/COGS, plus other income, less expenses, less asset depreciation (\xA7179 / 100% bonus, permanent under OBBBA / MACRS \u2014 computed from each asset's own class and placed-in-service date, not Layer 1's own first-year-only preview). Home-office isn't netted yet (Phase 1).", parts);
      }
      function computeFarmGrossIncomeUsd(f) {
        var inc = safe(f, "itemized_income", {}) || {};
        var gross = num(inc.sales_livestock_produce_raised) + num(inc.sales_livestock_produce_purchased) + num(inc.cooperative_distributions) + num(inc.agricultural_program_payments) + num(inc.ccc_loans) + num(inc.crop_insurance_proceeds) + num(inc.custom_hire_income) + num(inc.other_income);
        if (f.accounting_method === "accrual") {
          var inv = safe(f, "inventory", {}) || {};
          gross -= num(inv.beginning_inventory) + num(inv.cost_of_purchases) - num(inv.ending_inventory);
        }
        return gross;
      }
      function computeFarmNetProfitUsd(f) {
        return computeFarmGrossIncomeUsd(f) - num(f.expenses_usd);
      }
      function farmNetProfitUsd(f, depreciationUsd) {
        if (f.net_profit_usd !== void 0 && f.net_profit_usd !== null) return num(f.net_profit_usd);
        if (f.gross_income_usd !== void 0 && f.gross_income_usd !== null) return num(f.gross_income_usd) - num(f.expenses_usd) - num(depreciationUsd || 0);
        return computeFarmNetProfitUsd(f) - num(depreciationUsd || 0);
      }
      function farmIncomeTrace(f, depreciationPlanEntry) {
        if (f.net_profit_usd !== void 0 && f.net_profit_usd !== null) {
          return source("Net farm profit entered directly on Layer 1 US for this farm (not derived from Schedule F line items).");
        }
        if (f.gross_income_usd !== void 0 && f.gross_income_usd !== null) {
          return source("Gross farm income entered directly on Layer 1 US for this farm (gross_income_usd), net of expenses_usd and asset depreciation.");
        }
        var inc = safe(f, "itemized_income", {}) || {};
        var parts = [];
        [
          ["sales_livestock_produce_raised", "Sales of livestock/produce raised"],
          ["sales_livestock_produce_purchased", "Sales of livestock/produce bought for resale"],
          ["cooperative_distributions", "Cooperative distributions"],
          ["agricultural_program_payments", "Agricultural program payments"],
          ["ccc_loans", "CCC loans"],
          ["crop_insurance_proceeds", "Crop insurance proceeds"],
          ["custom_hire_income", "Custom hire income"],
          ["other_income", "Other farm income"]
        ].forEach(function(pair) {
          if (num(inc[pair[0]]) !== 0) parts.push({ label: pair[1], amount: num(inc[pair[0]]) });
        });
        if (f.accounting_method === "accrual") {
          var inv = safe(f, "inventory", {}) || {};
          var invAdj = num(inv.beginning_inventory) + num(inv.cost_of_purchases) - num(inv.ending_inventory);
          if (invAdj !== 0) parts.push({ label: "Less: cost of livestock/items purchased for resale (accrual inventory)", amount: -invAdj });
        }
        if (num(f.expenses_usd) !== 0) parts.push({ label: "Less: farm operating expenses", amount: -num(f.expenses_usd) });
        (depreciationPlanEntry ? depreciationPlanEntry.assets : []).forEach(function(a) {
          var label = "Asset (" + a.class + ", yr " + a.yearN + ")";
          if (a.sec179Usd > 0) parts.push({ label: label + " \u2014 \xA7179", amount: -a.sec179Usd });
          if (a.bonusUsd > 0) parts.push({ label: label + " \u2014 100% bonus depreciation", amount: -a.bonusUsd });
          if (a.macrsUsd > 0) parts.push({ label: label + " \u2014 MACRS", amount: -a.macrsUsd });
        });
        return calc("Schedule F: sum of itemized farm income lines, less accrual inventory adjustment (if applicable), less expenses, less asset depreciation (\xA7179 / 100% bonus / MACRS).", parts);
      }
      var PRESUMPTIVE_CEILING_CITATION = "s.44AD/44ADA turnover ceilings (Rs.2cr/Rs.3cr and Rs.50L/Rs.75L, the higher figure requiring digital receipts \u226595% of total) verified 2026-07-12, matched to Layer 1 India's own live eligibility check \u2014 re-check each Finance Act cycle.";
      var PRESUMPTIVE_RESIDENCY_CITATION = "s.44AD/44ADA residency and entity-type eligibility (ROR-only; 44AD additionally excludes firms/LLPs/companies/AOPs/trusts/local authorities/co-ops, 44ADA further excludes HUFs) verified 2026-07-12, matched to Layer 1 India's own live eligibility check.";
      function isUnder180DaysAdditionInr(additionDateStr) {
        if (!additionDateStr) return false;
        var d = new Date(additionDateStr);
        if (isNaN(d.getTime())) return false;
        var month = d.getMonth(), date = d.getDate();
        return month === 9 && date >= 4 || month > 9 || month <= 2;
      }
      function computeAssetBlockNormalDepreciationInr(block) {
        var rate = ASSET_CLASS_RATES_INDIA[block.asset_class];
        if (!rate) return 0;
        var opening = num(block.opening_wdv_inr), additions = num(block.additions_during_year_inr), sale = num(block.sale_consideration_inr);
        var wdvBeforeDep = opening + additions - sale;
        if (wdvBeforeDep <= 0) return 0;
        var halfYear = additions > 0 && isUnder180DaysAdditionInr(block.addition_date);
        if (!halfYear) return wdvBeforeDep * rate;
        var fullRateBase = Math.max(0, opening - sale);
        var saleAgainstAdditions = Math.max(0, sale - opening);
        var halfRateBase = Math.max(0, additions - saleAgainstAdditions);
        return Math.min(wdvBeforeDep, fullRateBase * rate + halfRateBase * rate * 0.5);
      }
      function additionalDepreciationEligibleInr(india, entry) {
        var entityType = safe(india, "profile.entity_type", null) || safe(india, "domestic_income.business_income.entity_type", "individual");
        var isCompany = entityType === "company";
        var isConcessionalCompany = isCompany && (safe(india, "profile.opt_115baa", false) === true || safe(india, "profile.opt_115bab", false) === true || safe(india, "profile.opt_115ba", false) === true);
        var isNewRegimeIndHuf = (entityType === "individual" || entityType === "huf") && (safe(india, "profile.tax_regime", "NEW") || "NEW").toUpperCase() !== "OLD";
        var regimeDisallows = isConcessionalCompany || isNewRegimeIndHuf;
        var hasMfgOrPowerGen = entry.business_code === "01000" || entry.business_code === "power_gen";
        return hasMfgOrPowerGen && !regimeDisallows;
      }
      function computeAssetBlockAdditionalDepreciationInr(block, india, entry) {
        if (block.asset_class !== "plant_machinery_general" || block.is_new_manufacturing_asset !== true) return 0;
        var additions = num(block.additions_during_year_inr);
        if (additions <= 0) return 0;
        if (!additionalDepreciationEligibleInr(india, entry)) return 0;
        var rate = isUnder180DaysAdditionInr(block.addition_date) ? 0.1 : 0.2;
        return additions * rate;
      }
      function aggregateEntryDepreciationInr(entryIdx, assetBlocks, india, entry) {
        var total = 0;
        (assetBlocks || []).forEach(function(block) {
          if (block.unit_biz_idx !== entryIdx) return;
          total += computeAssetBlockNormalDepreciationInr(block);
          total += computeAssetBlockAdditionalDepreciationInr(block, india, entry);
        });
        return total;
      }
      function computeMsmeDisallowanceInr(entryIdx, msmePayables) {
        var total = 0, today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        (msmePayables || []).forEach(function(m) {
          if (m.unit_biz_idx !== entryIdx) return;
          var amt = num(m.amount_inr);
          if (!m.invoice_date || amt <= 0) return;
          var invDate = new Date(m.invoice_date);
          invDate.setHours(0, 0, 0, 0);
          if (isNaN(invDate.getTime())) return;
          var dueDate = new Date(invDate);
          dueDate.setDate(dueDate.getDate() + (m.has_written_agreement === true ? 45 : 15));
          var refDate = m.payment_date ? new Date(m.payment_date) : today;
          refDate.setHours(0, 0, 0, 0);
          if (refDate > dueDate) total += amt;
        });
        return total;
      }
      function aggregateEntryDisallowancesInr(entryIdx, exp, msmePayables) {
        var s40aI = num(exp.payments_to_non_residents_no_tds_inr);
        var s40aIa = Math.round(num(exp.payments_to_residents_no_tds_inr) * 0.3);
        var s40A3 = num(exp.total_cash_payments_exceeding_limit_inr) + num(exp.total_cash_payments_exceeding_35k_inr);
        var s43Bh = computeMsmeDisallowanceInr(entryIdx, msmePayables);
        return s40aI + s40aIa + s40A3 + s43Bh;
      }
      function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
        var total = digitalInr + cashInr;
        var atLeast95PctDigital = total > 0 && cashInr / total <= 0.05;
        if (scheme === "s44AD") return atLeast95PctDigital ? 3e7 : 2e7;
        if (scheme === "s44ADA") return atLeast95PctDigital ? 75e5 : 5e6;
        return Infinity;
      }
      function usesRegularBooksInr(b, eligibility) {
        var scheme = b.presumptive_scheme;
        if (scheme === "s44AD") {
          var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
          return !(eligibility.eligible44AD && dig + csh <= presumptiveCeilingInr("s44AD", dig, csh));
        }
        if (scheme === "s44ADA") {
          var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
          var adaReceipts = num(b.gross_receipts_inr) || adaDig + adaCsh;
          return !(eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh));
        }
        if (scheme === "s44AE") return false;
        return true;
      }
      function computeBusinessEntryNetProfitInr(b, eligibility, depreciationInr, disallowancesInr) {
        eligibility = eligibility || { eligible44AD: true, eligible44ADA: true };
        var scheme = b.presumptive_scheme;
        var adaReceipts;
        if (scheme === "s44AD") {
          var dig44AD = num(b.digital_receipts_inr), csh44AD = num(b.cash_receipts_inr);
          if (eligibility.eligible44AD && dig44AD + csh44AD <= presumptiveCeilingInr("s44AD", dig44AD, csh44AD)) return dig44AD * 0.06 + csh44AD * 0.08;
        } else if (scheme === "s44ADA") {
          var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
          adaReceipts = num(b.gross_receipts_inr) || adaDig + adaCsh;
          if (eligibility.eligible44ADA && adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)) return adaReceipts * 0.5;
        } else if (scheme === "s44AE") return null;
        var exp = b.expenses || {};
        var pfEsiDeductibleInr = exp.employer_pf_esi_paid_before_due_date === true ? num(exp.employer_pf_esi_contribution_inr) : 0;
        var deductibleBeforeDisallowances = num(exp.rent_for_business_premises_inr) + num(exp.repairs_maintenance_inr) + num(exp.employee_salary_wages_inr) + num(exp.employee_bonus_commission_inr) + num(exp.interest_on_borrowed_capital_inr) + num(exp.insurance_premium_inr) + num(exp.bad_debts_written_off_inr) + num(exp.other_business_expenses_inr) + num(exp.ca_professional_fees_inr) + pfEsiDeductibleInr;
        var deductible = Math.max(0, deductibleBeforeDisallowances - num(disallowancesInr));
        var dig = num(b.digital_receipts_inr), csh = num(b.cash_receipts_inr);
        var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || (scheme === "s44AD" ? dig + csh : 0) || (scheme === "s44ADA" ? adaReceipts : 0);
        return receipts - deductible - num(depreciationInr);
      }
      function businessEntryIncomeTrace(b, eligibility, depreciationInr, disallowancesInr) {
        eligibility = eligibility || { eligible44AD: true, eligible44ADA: true };
        var explicit = b.net_profit_inr != null ? b.net_profit_inr : b.net_profit;
        if (explicit !== void 0 && explicit !== null) {
          return source("Net profit entered directly on Layer 1 India for this business entry (not derived from a presumptive rate or books).");
        }
        var scheme = b.presumptive_scheme, ceilingNote = null, ceilingCitation = null;
        var dig44AD, csh44AD, adaDig, adaCsh, adaReceipts;
        if (scheme === "s44AD") {
          dig44AD = num(b.digital_receipts_inr);
          csh44AD = num(b.cash_receipts_inr);
          var ceiling44AD = presumptiveCeilingInr("s44AD", dig44AD, csh44AD);
          if (eligibility.eligible44AD && dig44AD + csh44AD <= ceiling44AD) {
            return calc("Presumptive income under s.44AD: digital/banking receipts \xD7 6% + cash receipts \xD7 8%", [
              { label: "Digital / banking receipts", amount: dig44AD },
              { label: "Rate", display: "6%" },
              { label: "Cash receipts", amount: csh44AD },
              { label: "Rate", display: "8%" }
            ], PRESUMPTIVE_CEILING_CITATION);
          }
          if (!eligibility.eligible44AD) {
            var why44AD = eligibility.rorFails ? "this taxpayer's India residency status is " + (eligibility.indiaStatus || "not on file") + ", not Resident & Ordinarily Resident (ROR)" : "this taxpayer's entity type (" + eligibility.entityType + ") is one s.44AD excludes (firms/LLPs/companies/AOPs/trusts/local authorities/co-ops)";
            ceilingNote = "s.44AD is only available to Resident & Ordinarily Resident (ROR) individuals/HUFs and eligible firms \u2014 " + why44AD + ", so the presumptive election is invalid and regular books apply instead:";
            ceilingCitation = PRESUMPTIVE_RESIDENCY_CITATION;
          } else {
            ceilingNote = "Total receipts (\u20B9" + Math.round(dig44AD + csh44AD).toLocaleString("en-IN") + ") exceed the s.44AD turnover ceiling for this cash-receipts mix (\u20B9" + Math.round(ceiling44AD).toLocaleString("en-IN") + ") \u2014 the presumptive election is invalid above this, so regular books apply instead:";
            ceilingCitation = PRESUMPTIVE_CEILING_CITATION;
          }
        } else if (scheme === "s44ADA") {
          adaDig = num(b.ada_digital_receipts_inr);
          adaCsh = num(b.ada_cash_receipts_inr);
          adaReceipts = num(b.gross_receipts_inr) || adaDig + adaCsh;
          var ceiling44ADA = presumptiveCeilingInr("s44ADA", adaDig, adaCsh);
          if (eligibility.eligible44ADA && adaReceipts <= ceiling44ADA) {
            return calc("Presumptive income under s.44ADA: gross receipts \xD7 50% (professionals)", [
              { label: "Gross receipts", amount: adaReceipts },
              { label: "Rate", display: "50%" }
            ], PRESUMPTIVE_CEILING_CITATION);
          }
          if (!eligibility.eligible44ADA) {
            var why44ADA = eligibility.rorFails ? "this taxpayer's India residency status is " + (eligibility.indiaStatus || "not on file") + ", not Resident & Ordinarily Resident (ROR)" : "this taxpayer's entity type is HUF, which s.44ADA excludes";
            ceilingNote = "s.44ADA is only available to Resident & Ordinarily Resident (ROR) individuals \u2014 " + why44ADA + ", so the presumptive election is invalid and regular books apply instead:";
            ceilingCitation = PRESUMPTIVE_RESIDENCY_CITATION;
          } else {
            ceilingNote = "Gross receipts (\u20B9" + Math.round(adaReceipts).toLocaleString("en-IN") + ") exceed the s.44ADA turnover ceiling for this cash-receipts mix (\u20B9" + Math.round(ceiling44ADA).toLocaleString("en-IN") + ") \u2014 the presumptive election is invalid above this, so regular books apply instead:";
            ceilingCitation = PRESUMPTIVE_CEILING_CITATION;
          }
        } else if (scheme === "s44AE") {
          return source("s.44AE tonnage-based presumptive income (goods carriages) is computed once from the Goods Vehicles schedule and rolled into the total business income figure above \u2014 it isn't split per vehicle here, so this entry shows \u20B90 on its own.");
        }
        var exp = b.expenses || {};
        var expenseFields = [
          ["rent_for_business_premises_inr", "Rent for business premises"],
          ["repairs_maintenance_inr", "Repairs & maintenance"],
          ["employee_salary_wages_inr", "Employee salary & wages"],
          ["employee_bonus_commission_inr", "Employee bonus & commission"],
          ["interest_on_borrowed_capital_inr", "Interest on borrowed capital"],
          ["insurance_premium_inr", "Insurance premium"],
          ["bad_debts_written_off_inr", "Bad debts written off"],
          ["other_business_expenses_inr", "Other business expenses"],
          ["ca_professional_fees_inr", "CA / professional fees"]
        ];
        var fallbackReceipts = num(b.gross_receipts_inr) || num(b.turnover_inr) || (scheme === "s44AD" ? dig44AD + csh44AD : 0) || (scheme === "s44ADA" ? adaReceipts : 0);
        var parts = [{ label: "Gross receipts / turnover", amount: fallbackReceipts }];
        expenseFields.forEach(function(f) {
          var v = num(exp[f[0]]);
          if (v > 0) parts.push({ label: "Less: " + f[1], amount: -v });
        });
        if (exp.employer_pf_esi_paid_before_due_date === true && num(exp.employer_pf_esi_contribution_inr) > 0) {
          parts.push({ label: "Less: Employer PF/ESI contribution (paid before due date, s.43B(d))", amount: -num(exp.employer_pf_esi_contribution_inr) });
        }
        if (num(disallowancesInr) > 0) {
          parts.push({ label: "Add back: statutory disallowances (s.40A(3) cash / s.40(a) TDS default / s.43B(h) MSME overdue)", amount: num(disallowancesInr) });
        }
        if (num(depreciationInr) > 0) {
          parts.push({ label: "Less: current-year depreciation (s.32, asset blocks)", amount: -num(depreciationInr) });
        }
        var netProfitInr = parts.reduce(function(s, p) {
          return s + (p.amount || 0);
        }, 0);
        parts.push({ label: "Net profit (this entry)", amount: netProfitInr });
        var formula = ceilingNote || "Regular books: gross receipts/turnover less the itemized deductible expenses on file, less statutory disallowances (s.40A(3)/40(a)/43B(h)) already included in those expenses, less current-year depreciation (s.32 WDV method + s.32(1)(iia) additional depreciation). F&O-specific costs and s.35/35D/35DDA amortization aren't modeled yet (Phase 1 follow-on \u2014 see gap tracker IN-22/26), so this is still a floor, not the final figure.";
        return calc(formula, parts, ceilingCitation);
      }
      function businessEntitiesResult(d, ctx) {
        var us = ctx.us, india = ctx.india;
        var list = [];
        var ui = d.uiAgg;
        var entityKind = safe(us, "profile.tax_entity_type", "individual");
        var indiaIsCompanyOrFirm = d.indiaIsCompany || d.indiaIsFirm || d.indiaIsAop || d.indiaIsTrust;
        if (["ccorp", "scorp", "partnership"].indexOf(entityKind) >= 0 || safe(us, "profile.incorporated_in_us", false) === true) {
          var m1ForTrace = safe(us, "corporate_financials.schedule_m1", null);
          var m1SelfInc = m1ForTrace ? num(m1ForTrace.net_income_per_books) + num(m1ForTrace.federal_tax_expense) + num(m1ForTrace.meals_disallowed_50) + num(m1ForTrace.foreign_taxes_credited) + num(m1ForTrace.interest_expense_limitation) + num(m1ForTrace.other_additions) - num(m1ForTrace.tax_exempt_interest) - num(m1ForTrace.tax_depreciation_over_book) - num(m1ForTrace.other_subtractions) : 0;
          var selfInc = m1SelfInc !== 0 ? m1SelfInc : num(safe(ui, "business_income_usd", 0));
          var selfForm = entityKind === "ccorp" ? "1120 (C-Corp, 21% flat)" : entityKind === "scorp" ? "1120-S (pass-through)" : entityKind === "partnership" ? "1065 (pass-through)" : "1120";
          if (selfInc !== 0) list.push({
            country: "US",
            type: entityKind === "ccorp" ? "C-Corp (Form 1120)" : entityKind === "scorp" ? "S-Corp (Form 1120-S)" : entityKind === "partnership" ? "Partnership (Form 1065)" : "C-Corp (Form 1120)",
            name: safe(us, "profile.full_name", "US entity"),
            incomeUsd: selfInc,
            corp: true,
            filesOwnReturn: true,
            returnForm: "Form " + selfForm + " \u2014 entity-level return",
            calcTrace: m1SelfInc !== 0 ? calc("Schedule M-1 book-to-tax reconciliation (this entity's own return, not a K-1 received from another entity).", [
              { label: "Net income per books", amount: num(m1ForTrace.net_income_per_books) },
              { label: "Plus: federal tax expense", amount: num(m1ForTrace.federal_tax_expense) },
              { label: "Plus: meals & entertainment disallowed", amount: num(m1ForTrace.meals_disallowed_50) },
              { label: "Plus: foreign taxes deducted (not credited)", amount: num(m1ForTrace.foreign_taxes_credited) },
              { label: "Plus: s.163(j) interest expense limitation", amount: num(m1ForTrace.interest_expense_limitation) },
              { label: "Plus: other additions", amount: num(m1ForTrace.other_additions) },
              { label: "Less: tax-exempt interest", amount: -num(m1ForTrace.tax_exempt_interest) },
              { label: "Less: tax depreciation over book depreciation", amount: -num(m1ForTrace.tax_depreciation_over_book) },
              { label: "Less: other subtractions", amount: -num(m1ForTrace.other_subtractions) }
            ]) : source("Entity-level taxable income as entered on Layer 1 US (business_income_usd) \u2014 no Schedule M-1 data on file for this entity.")
          });
        }
        var seDeprPlanForTrace = d.usBusinessDepreciationPlan;
        (safe(ui, "self_employment", []) || []).forEach(function(s, seIdx) {
          var seDeprEntry = seDeprPlanForTrace.byBusiness["se" + seIdx];
          var seDeprUsd = seDeprEntry ? seDeprEntry.totalUsd : 0;
          list.push({
            country: "US",
            type: "Self-employment (Sch C)",
            name: s.business_name || s.name || "Self-employment",
            incomeUsd: selfEmploymentNetProfitUsd(s, seDeprUsd),
            se: true,
            qbi: true,
            filesOwnReturn: false,
            returnForm: "Schedule C + Schedule SE (Form 1040)",
            calcTrace: selfEmploymentIncomeTrace(s, seDeprEntry)
          });
        });
        (safe(ui, "farming_schedule_f", []) || []).forEach(function(f, farmIdx) {
          var farmDeprEntry = seDeprPlanForTrace.byBusiness["farm" + farmIdx];
          var farmDeprUsd = farmDeprEntry ? farmDeprEntry.totalUsd : 0;
          list.push({
            country: "US",
            type: "Farm (Sch F)",
            name: f.business_name || f.name || "Farm",
            incomeUsd: farmNetProfitUsd(f, farmDeprUsd),
            se: true,
            qbi: true,
            filesOwnReturn: false,
            returnForm: "Schedule F (Form 1040)",
            calcTrace: farmIncomeTrace(f, farmDeprEntry)
          });
        });
        (safe(ui, "partnerships_k1", []) || []).forEach(function(k) {
          var ord = num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0), gp = num(k.guaranteed_payments_usd || 0), s179 = num(k.sec179_deduction_usd || 0);
          list.push({
            country: "US",
            type: "Partnership K-1 (1065)",
            name: k.business_name || k.partnership_name || k.name || "Partnership",
            incomeUsd: ord + gp - s179,
            se: true,
            qbi: true,
            filesOwnReturn: false,
            returnForm: "Form 1065 (partnership return, informational) \u2192 Schedule E + Schedule SE (Form 1040)",
            calcTrace: calc("Ordinary business income (K-1 Box 1) + guaranteed payments (K-1 Box 4) \u2212 s.179 deduction (K-1 Box 12). Guaranteed payments count for SE tax but are excluded from the \xA7199A QBI base. Interest/dividend/capital-gain/rental/royalty boxes on this K-1, if any, are folded into this taxpayer's general investment-income totals, not shown per-entity here.", [
              { label: "Ordinary business income (Box 1)", amount: ord },
              { label: "Guaranteed payments (Box 4)", amount: gp },
              { label: "Less: s.179 deduction (Box 12)", amount: -s179 }
            ])
          });
        });
        (safe(ui, "s_corporations_k1", []) || []).forEach(function(s) {
          var ord = num(s.ordinary_income_usd || s.scorp_income_usd || s.ordinary_business_income_usd || 0), s179 = num(s.sec179_deduction_usd || 0);
          list.push({
            country: "US",
            type: "S-Corp K-1 (1120-S)",
            name: s.business_name || s.corp_name || s.name || "S-Corporation",
            incomeUsd: ord - s179,
            se: false,
            qbi: true,
            filesOwnReturn: false,
            returnForm: "Form 1120-S (S-corp return, informational) \u2192 Schedule E (Form 1040)",
            calcTrace: calc("Ordinary business income (K-1 Box 1, ordinary_income_usd \u2014 the real Layer 1 US field; scorp_income_usd/ordinary_business_income_usd are legacy fallbacks that don't exist on the live form) \u2212 s.179 deduction (Box 11). S-corp distributions aren't subject to SE tax.", [
              { label: "Ordinary business income (Box 1)", amount: ord },
              { label: "Less: s.179 deduction (Box 11)", amount: -s179 }
            ])
          });
        });
        (safe(ui, "trusts_estates_k1", []) || []).forEach(function(t) {
          var ord = num(t.ordinary_income_usd || 0), og = num(t.ordinary_gain_usd || 0);
          list.push({
            country: "US",
            type: "Trust/Estate K-1 (1041)",
            name: t.business_name || "Trust/Estate",
            incomeUsd: ord + og,
            se: false,
            qbi: true,
            filesOwnReturn: false,
            returnForm: "Form 1041 (fiduciary return, informational) \u2192 Schedule E (Form 1040)",
            calcTrace: calc("Ordinary income (K-1 Box 1) + ordinary gain (Box 8 sub-line). Interest/dividend/capital-gain/rental/royalty boxes on this K-1, if any, are folded into this taxpayer's general investment-income totals, not shown per-entity here.", [
              { label: "Ordinary income (Box 1)", amount: ord },
              { label: "Ordinary gain (Box 8)", amount: og }
            ])
          });
        });
        (safe(ui, "c_corporations_1120", []) || []).forEach(function(c) {
          list.push({
            country: "US",
            type: "C-Corp (Form 1120)",
            name: c.corp_name || c.name || "C-Corporation",
            incomeUsd: num(c.taxable_income_usd || c.net_income_usd || 0),
            corp: true,
            filesOwnReturn: true,
            returnForm: "Form 1120 (C-Corp \u2014 entity-level return, 21% flat)",
            calcTrace: source("Entity-level taxable income as entered on Layer 1 US for this C-corp (taxable_income_usd, or net_income_usd if that field wasn't used). Taxed at 21% at the entity; not on a personal return until distributed.")
          });
        });
        var bizEligibility = d.presumptiveEligibilityAgg;
        var indiaReturnFormCrude = d.indiaIsCompany ? "ITR-6" : d.indiaIsTrust ? "ITR-7" : d.indiaIsFirm || d.indiaIsAop ? "ITR-5" : "ITR-2/3";
        (d.bizEntriesAgg || []).forEach(function(b, bIdx) {
          var netProfitInr = b.net_profit_inr || b.net_profit;
          var isRegularBooksForTrace = usesRegularBooksInr(b, bizEligibility);
          var entryDepreciationInrForTrace = isRegularBooksForTrace ? aggregateEntryDepreciationInr(bIdx, d.bizAssetBlocksAgg, india, b) : 0;
          var entryDisallowancesInrForTrace = isRegularBooksForTrace ? aggregateEntryDisallowancesInr(bIdx, b.expenses || {}, d.bizMsmePayablesAgg) : 0;
          if (netProfitInr === void 0 || netProfitInr === null) netProfitInr = computeBusinessEntryNetProfitInr(b, bizEligibility, entryDepreciationInrForTrace, entryDisallowancesInrForTrace);
          netProfitInr = num(netProfitInr);
          var entryReturnForm = indiaIsCompanyOrFirm ? indiaReturnFormCrude : isRegularBooksForTrace ? "Regular books (this entry) \u2014 feeds the taxpayer's overall return form; see Filings \u2192 Return Form for the checked ITR" : "Valid presumptive election (this entry) \u2014 feeds the taxpayer's overall return form; see Filings \u2192 Return Form for the checked ITR";
          list.push({
            country: "IN",
            type: "Business / Profession (PGBP)",
            name: b.business_name || b.trade_name || b.name || "Indian business",
            incomeUsd: netProfitInr / fxRate(ctx),
            inr: netProfitInr,
            filesOwnReturn: indiaIsCompanyOrFirm,
            returnForm: entryReturnForm,
            calcTrace: businessEntryIncomeTrace(b, bizEligibility, entryDepreciationInrForTrace, entryDisallowancesInrForTrace)
          });
        });
        (d.usForeignCorpsRaw || []).forEach(function(c) {
          var country = c.country != null ? c.country : c.country_of_incorporation;
          var corpName = c.corp_name || c.corporation_name;
          var ownershipPct = num(c.ownership_pct != null ? c.ownership_pct : c.ownership_percentage);
          list.push({
            country: country === "IN" ? "IN" : "US",
            type: "Foreign corporation (CFC)",
            name: corpName || "Foreign corporation",
            incomeUsd: num(c.gilti_income_usd || 0),
            cfc: true,
            gilti: num(c.gilti_income_usd || 0),
            ownershipPct,
            filesOwnReturn: true,
            returnForm: "Foreign local return (not modeled) + Form 5471 (informational, US) + GILTI on Schedule 1 (Form 1040)",
            calcTrace: source("GILTI inclusion as entered on Layer 1 US for this CFC (gilti_income_usd) \u2014 a hand-entered estimate, since full GILTI/QBAI/tested-income computation from the CFC's own books isn't modeled yet (see gap tracker). Ownership: " + Math.round(ownershipPct) + "%. This is a US inclusion only \u2014 the entity's own foreign-country income tax return is separate and not shown here.")
          });
        });
        var byName = {}, order = [];
        list.forEach(function(e) {
          var key = String(e.name || "").toLowerCase().replace(/\s+/g, " ").trim();
          if (!byName[key]) {
            byName[key] = e;
            order.push(key);
            return;
          }
          var ex = byName[key];
          if (e.cfc) {
            ex.cfc = true;
            ex.gilti = Math.max(ex.gilti || 0, e.gilti || 0);
            ex.ownershipPct = ex.ownershipPct || e.ownershipPct;
            if (!ex.incomeUsd) ex.incomeUsd = e.incomeUsd;
          } else if (ex.cfc) {
            e.cfc = ex.cfc;
            e.gilti = ex.gilti;
            e.ownershipPct = ex.ownershipPct;
            byName[key] = e;
          } else {
            ex.incomeUsd = Math.max(ex.incomeUsd || 0, e.incomeUsd || 0);
          }
        });
        return order.map(function(k) {
          return byName[k];
        });
      }
      NODES.assetsModelResult = {
        deps: [
          "indianMutualFundsResult",
          "indiaFinancialHoldingsTxRaw",
          "indianBusinessesBoundary",
          "usForeignCorpsRaw",
          "usOwns10PctForeignCorpRaw",
          "usSecuritiesBoundary",
          "epfInrRaw",
          "ppfInrRaw",
          "npsInrRaw",
          "taxableEpfInterestInrAgg",
          "taxableNpsWithdrawalInrAgg",
          "uiAgg",
          "usBusinessDepreciationPlan",
          "bizEntriesAgg",
          "bizAssetBlocksAgg",
          "bizMsmePayablesAgg",
          "presumptiveEligibilityAgg",
          "indiaIsCompany",
          "indiaIsFirm",
          "indiaIsAop",
          "indiaIsTrust"
        ],
        compute: function(d, ctx) {
          return {
            indianMutualFunds: d.indianMutualFundsResult,
            indianSecurities: d.indiaFinancialHoldingsTxRaw,
            usPficHoldings: safe(ctx.us, "foreign_entities.pfic_holdings", []),
            indianBusinesses: d.indianBusinessesBoundary,
            usForeignCorps: d.usForeignCorpsRaw,
            usOwns10PctForeignCorp: d.usOwns10PctForeignCorpRaw,
            indianProperties: safe(ctx.india, "property.properties", []),
            epfInr: d.epfInrRaw,
            ppfInr: d.ppfInrRaw,
            npsInr: d.npsInrRaw,
            taxableEpfInterestInr: d.taxableEpfInterestInrAgg,
            taxableNpsWithdrawalInr: d.taxableNpsWithdrawalInrAgg,
            usSecurities: d.usSecuritiesBoundary,
            usProperties: safe(ctx.us, "real_estate.properties", []) || [],
            usRetirement: safe(ctx.us, "retirement_accounts", {}) || {},
            businessEntities: businessEntitiesResult(d, ctx)
          };
        }
      };
      module.exports = { NODES };
    }
  });

  // prototypes/graph-pilot/analyze.js
  var require_analyze = __commonJS({
    "prototypes/graph-pilot/analyze.js"(exports, module) {
      (function(root) {
        require_constants();
        require_sample_data();
        require_profiles();
        var WISING = root.WISING = root.WISING || {};
        var createGraph = require_graph().createGraph;
        var fxRate = require_fx_util().fxRate;
        var residencyUtil = require_residency_nodes();
        var NODES = require_assets_nodes().NODES;
        var graph = createGraph(NODES);
        var TARGET_IDS = [
          "entityResult",
          "metaResult",
          "identityResult",
          "treatyModelResult",
          "residencyModelSliceResult",
          "companyResidencyResult",
          "indiaIncomeModelResult",
          "aggregateUsIncomeResult",
          "accountsBoundary",
          "assetsModelResult",
          "totalTaxInrCombined",
          "regimeCombined",
          "isEntityTaxpayer",
          "usTaxResult",
          "residencyResult",
          "ftcResult",
          "crossBasisResult",
          "limitsResult",
          "headlineResult",
          "apportionmentResult",
          "s115aDividend",
          "s115aRoyalty",
          "s115aFts",
          "isNRV3",
          "analyzeResult",
          // model.deductions.india — in1-nodes-v3.js's aggregateIndiaDeductions
          // port, one raw-fact node per section (no single combined node exists).
          "dedS80C",
          "dedS80CCD1B",
          "dedS80CCD2Employer",
          "dedS80D",
          "dedS80TTA_TTB",
          "dedS80DD",
          "dedS80DDB",
          "dedS80U",
          "dedS80E",
          "dedS80EEA_EE",
          "dedS80GGB_GGC",
          "dedS80GGRentPaidInr",
          // model.deductions.us — ustax-nodes.js's dedUs, already one combined node.
          "dedUs",
          // computed.indiaTax.deductionsInr — in1-nodes-v3.js's final combined
          // deduction total (post-caps), read by the same fixture test above.
          "deductionsInrV3"
        ];
        function assembleModel(out) {
          return {
            entity: out.entityResult,
            meta: out.metaResult,
            identity: out.identityResult,
            treaty: out.treatyModelResult,
            residency: out.residencyModelSliceResult,
            companyResidency: out.companyResidencyResult,
            income: { india: out.indiaIncomeModelResult, us: out.aggregateUsIncomeResult },
            accounts: { accounts: out.accountsBoundary, aggregatePeak: null },
            assets: out.assetsModelResult,
            deductions: {
              india: {
                s80C: out.dedS80C,
                s80CCD1B: out.dedS80CCD1B,
                s80CCD2_employer: out.dedS80CCD2Employer,
                s80D: out.dedS80D,
                s80TTA_TTB: out.dedS80TTA_TTB,
                s80DD: out.dedS80DD,
                s80DDB: out.dedS80DDB,
                s80U: out.dedS80U,
                s80E: out.dedS80E,
                s80EEA_EE: out.dedS80EEA_EE,
                s80GGB_GGC: out.dedS80GGB_GGC,
                s80GG_rentPaidInr: out.dedS80GGRentPaidInr
              },
              us: out.dedUs
            }
          };
        }
        function assembleComputed(out, ctx) {
          var usTax = Object.assign({}, out.usTaxResult);
          delete usTax.feieAppliedUsd;
          return {
            indiaTax: {
              totalTaxInr: out.totalTaxInrCombined,
              totalTaxUsd: out.totalTaxInrCombined / fxRate(ctx),
              regime: out.regimeCombined,
              isEntity: out.isEntityTaxpayer,
              deductionsInr: out.deductionsInrV3,
              // s115a is the object ONLY for a non-entity NR (computeIndiaTax's
              // `isNR ? {...} : null`); null for a resident individual; absent
              // entirely on the entity path (computeIndiaEntityTax returns no
              // s115a key at all) — null and absent are equivalent to every
              // consumer here (truthiness-gated) and to a deep-equal comparator.
              s115a: out.isNRV3 && !out.isEntityTaxpayer ? { dividend: out.s115aDividend, royalty: out.s115aRoyalty, fts: out.s115aFts } : null
            },
            usTax,
            residency: out.residencyResult,
            ftc: out.ftcResult,
            reconciliation: out.crossBasisResult,
            limits: out.limitsResult,
            headline: out.headlineResult,
            apportionment: out.apportionmentResult
          };
        }
        function resolveAll(opts) {
          opts = opts || {};
          var ctx = { router: opts.router, india: opts.india, us: opts.us };
          if (opts.monitorAsOf !== void 0) ctx.monitorAsOfBoundary = opts.monitorAsOf;
          if (opts.fxRateOverride !== void 0) ctx.fxRateOverride = opts.fxRateOverride;
          return { out: graph.resolve(TARGET_IDS, ctx).values, ctx };
        }
        function analyze(opts) {
          var r = resolveAll(opts);
          return Object.assign({}, r.out.analyzeResult, {
            model: assembleModel(r.out),
            computed: assembleComputed(r.out, r.ctx)
          });
        }
        function normalize(opts) {
          return assembleModel(resolveAll(opts).out);
        }
        WISING.analyze = analyze;
        WISING.normalize = normalize;
        WISING.util = {
          deriveIndiaDomesticStatus: residencyUtil.deriveIndiaDomesticStatus,
          deriveCompanyPoem: residencyUtil.deriveCompanyPoem
        };
        module.exports = { analyze, normalize };
      })(typeof window !== "undefined" ? window : globalThis);
    }
  });
  require_analyze();
})();

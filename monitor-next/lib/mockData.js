/* ============================================================================
 * Mock data layer — INCOME-TAX semantics (WISING India ⇄ US).
 *
 * This is NOT sales-tax nexus. A "region" is a tax jurisdiction (a country, or
 * a US state on drill-down). Exposure is driven by two real inputs:
 *
 *   1. RESIDENCY  — days physically present vs the jurisdiction's residency
 *      test (US Substantial Presence ≥183 weighted · India ≥182 · UK SRT ·
 *      state ≥183-day domicile). Sourced from a travel / immigration day-log.
 *   2. REPORTING  — a binding statutory money threshold for that jurisdiction
 *      (FBAR $10k · Form 8938 · LRS $250k · state-source income). Sourced from
 *      a bank / brokerage aggregator (Plaid-style).
 *
 * Thresholds mirror engine/constants.js so the demo is truthful, not invented.
 * ==========================================================================*/

// Provenance metadata (shown in the UI to make the "data sync" story concrete).
// Replaces the sales-tax Stripe/Deel feeds with income-tax data sources.
export const SOURCES = {
  financial: { name: "Plaid", kind: "Bank / brokerage feed", lastSync: "2026-06-30T22:00:00Z" },
  presence: { name: "Travel log", kind: "Immigration / day-count", lastSync: "2026-06-30T22:00:00Z" }
};

// Statutory thresholds (USD) — from engine/constants.js LIMITS.
export const THRESHOLDS = {
  FBAR_AGGREGATE: 10000,     // FinCEN 114 — cliff
  FORM_8938: 200000,         // "any time" figure, US-resident single (illustrative)
  LRS_ANNUAL: 250000,        // RBI Liberalised Remittance Scheme
  FEIE_MAX: 130000,          // Form 2555 max exclusion
  US_SPT_DAYS: 183,          // Substantial Presence (weighted)
  INDIA_DAYS: 182,           // ≥182 days in the FY
  UK_SRT_DAYS: 183,          // Statutory Residence Test (illustrative)
  STATE_RESIDENCY_DAYS: 183, // 183-day statutory residency (many states)
  STATE_SOURCE_INCOME: 250000 // large-filer / apportionment marker (illustrative)
};

// ------- Country-level regions (light up on the world map) -------
// `taxable` = the jurisdiction levies NET income tax on this person after DTAA/FTC.
//   → US is a resident jurisdiction here, but foreign tax credits zero out the US
//     tax, so net US liability = $0. The FBAR/8938/1040 filings are still MANDATORY.
//     That is the textbook "Nexus Triggered" case: obligation without liability.
export const COUNTRIES = [
  {
    id: "IN",
    name: "India",
    mapName: "India",                 // world-atlas properties.name
    iso3: "IND",
    flag: "🇮🇳",
    continent: "Asia",
    type: "country",
    taxable: true,                    // resident → worldwide income taxed in India
    resident: true,
    report: {
      test: "≥182 days in the FY",
      days: 215, dayThreshold: THRESHOLDS.INDIA_DAYS,
      metric: "LRS outbound remittance",
      reportedUsd: 268000, limitUsd: THRESHOLDS.LRS_ANNUAL
    },
    incomeInScopeUsd: 342000,
    triggerDate: "2025-08-14",        // residency crossed
    estimatedLiabilityUsd: 68400,
    financialSource: "Plaid",
    presenceSource: "Travel log"
  },
  {
    id: "US",
    name: "United States",
    mapName: "United States of America",
    iso3: "USA",
    flag: "🇺🇸",
    continent: "US",
    type: "country",
    hasStates: true,                  // drill-down enabled
    taxable: false,                   // resident, BUT FTC fully relieves US tax → $0 net
    resident: true,
    report: {
      test: "Substantial Presence (≥183 wtd)",
      days: 240, dayThreshold: THRESHOLDS.US_SPT_DAYS,
      metric: "FBAR aggregate (FinCEN 114)",
      reportedUsd: 128000, limitUsd: THRESHOLDS.FBAR_AGGREGATE
    },
    incomeInScopeUsd: 342000,
    triggerDate: "2025-05-02",        // SPT met
    estimatedLiabilityUsd: 0,         // FTC-relieved
    financialSource: "Plaid",
    presenceSource: "Travel log"
  },
  {
    id: "GB",
    name: "United Kingdom",
    mapName: "United Kingdom",
    iso3: "GBR",
    flag: "🇬🇧",
    continent: "Europe",
    type: "country",
    taxable: true,                    // would tax worldwide income once resident
    resident: false,                  // not yet — day-count still building
    report: {
      test: "Statutory Residence Test",
      days: 128, dayThreshold: THRESHOLDS.UK_SRT_DAYS,
      metric: "UK-source / remittance income",
      reportedUsd: 41000, limitUsd: 90000
    },
    incomeInScopeUsd: 41000,
    triggerDate: null,                // projected flip, not yet crossed
    estimatedLiabilityUsd: 0,
    financialSource: "Plaid",
    presenceSource: "Travel log"
  },
  {
    id: "AE",
    name: "United Arab Emirates",
    mapName: "United Arab Emirates",
    iso3: "ARE",
    flag: "🇦🇪",
    continent: "Middle East",
    type: "country",
    taxable: false,                   // no personal income tax
    resident: true,                   // present > 183 days
    report: {
      test: "≥183 days present",
      days: 196, dayThreshold: 183,
      metric: "Days present (no income tax)",
      reportedUsd: 0, limitUsd: 100000
    },
    incomeInScopeUsd: 96000,
    triggerDate: "2025-07-09",        // residency established
    estimatedLiabilityUsd: 0,
    financialSource: "Plaid",
    presenceSource: "Travel log"
  }
];

// ------- US state-level regions (shown when the user drills into the US) -------
// Re-skinned to STATE INDIVIDUAL INCOME TAX:
//   taxable:false = states with NO individual income tax (TX, FL, WA) → residency
//   there creates a filing/domicile footprint but $0 state income-tax liability =
//   "Nexus Triggered (purple)". taxable:true + resident/over = "Exposed (red)".
export const US_STATES = [
  { id: "CA", name: "California", mapName: "California", abbr: "CA", flag: "🇺🇸", type: "state", taxable: true,
    resident: true, triggerDate: "2025-03-11", estimatedLiabilityUsd: 74500, incomeInScopeUsd: 512000,
    report: { test: "State residency (≥183 days)", days: 210, dayThreshold: 183, metric: "CA-source income", reportedUsd: 512000, limitUsd: 250000 } },
  { id: "IL", name: "Illinois", mapName: "Illinois", abbr: "IL", flag: "🇺🇸", type: "state", taxable: true,
    resident: true, triggerDate: "2025-05-20", estimatedLiabilityUsd: 41200, incomeInScopeUsd: 610000,
    report: { test: "State residency (≥183 days)", days: 198, dayThreshold: 183, metric: "IL-source income", reportedUsd: 610000, limitUsd: 250000 } },
  { id: "NY", name: "New York", mapName: "New York", abbr: "NY", flag: "🇺🇸", type: "state", taxable: true,
    resident: false, triggerDate: null, estimatedLiabilityUsd: 0, incomeInScopeUsd: 190000,
    report: { test: "State residency (≥183 days)", days: 96, dayThreshold: 183, metric: "NY-source income", reportedUsd: 190000, limitUsd: 250000 } },
  { id: "NJ", name: "New Jersey", mapName: "New Jersey", abbr: "NJ", flag: "🇺🇸", type: "state", taxable: true,
    resident: false, triggerDate: null, estimatedLiabilityUsd: 0, incomeInScopeUsd: 155000,
    report: { test: "State residency (≥183 days)", days: 70, dayThreshold: 183, metric: "NJ-source income", reportedUsd: 155000, limitUsd: 250000 } },
  { id: "MA", name: "Massachusetts", mapName: "Massachusetts", abbr: "MA", flag: "🇺🇸", type: "state", taxable: true,
    resident: false, triggerDate: null, estimatedLiabilityUsd: 0, incomeInScopeUsd: 180000,
    report: { test: "State residency (≥183 days)", days: 60, dayThreshold: 183, metric: "MA-source income", reportedUsd: 180000, limitUsd: 250000 } },
  { id: "GA", name: "Georgia", mapName: "Georgia", abbr: "GA", flag: "🇺🇸", type: "state", taxable: true,
    resident: false, triggerDate: null, estimatedLiabilityUsd: 0, incomeInScopeUsd: 120000,
    report: { test: "State residency (≥183 days)", days: 45, dayThreshold: 183, metric: "GA-source income", reportedUsd: 120000, limitUsd: 250000 } },
  { id: "CO", name: "Colorado", mapName: "Colorado", abbr: "CO", flag: "🇺🇸", type: "state", taxable: true,
    resident: false, triggerDate: null, estimatedLiabilityUsd: 0, incomeInScopeUsd: 210000,
    report: { test: "State residency (≥183 days)", days: 130, dayThreshold: 183, metric: "CO-source income", reportedUsd: 210000, limitUsd: 250000 } },
  { id: "TX", name: "Texas", mapName: "Texas", abbr: "TX", flag: "🇺🇸", type: "state", taxable: false,
    resident: true, triggerDate: "2025-02-27", estimatedLiabilityUsd: 0, incomeInScopeUsd: 910000,
    report: { test: "State residency (≥183 days)", days: 240, dayThreshold: 183, metric: "TX-source income (no state tax)", reportedUsd: 910000, limitUsd: 250000 } },
  { id: "FL", name: "Florida", mapName: "Florida", abbr: "FL", flag: "🇺🇸", type: "state", taxable: false,
    resident: true, triggerDate: "2025-07-01", estimatedLiabilityUsd: 0, incomeInScopeUsd: 430000,
    report: { test: "State residency (≥183 days)", days: 190, dayThreshold: 183, metric: "FL-source income (no state tax)", reportedUsd: 430000, limitUsd: 250000 } },
  { id: "WA", name: "Washington", mapName: "Washington", abbr: "WA", flag: "🇺🇸", type: "state", taxable: false,
    resident: true, triggerDate: "2025-06-05", estimatedLiabilityUsd: 0, incomeInScopeUsd: 560000,
    report: { test: "State residency (≥183 days)", days: 200, dayThreshold: 183, metric: "WA-source income (no state tax)", reportedUsd: 560000, limitUsd: 250000 } }
];

// Jurisdictions offered in the header dropdown. Only these continents carry data.
export const REGION_FILTERS = ["All", "Asia", "Europe", "Middle East", "United States", "India"];

export function getCountries() { return COUNTRIES; }
export function getUsStates() { return US_STATES; }

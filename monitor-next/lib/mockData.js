/* ============================================================================
 * Mock data layer — simulates pulling from a billing system (Stripe) and an
 * HR system (physical presence / headcount). In production these become live
 * connectors; the shape here is what the UI + logic consume.
 *
 * A "region" is either a country (India, United States) or a US state. Each
 * carries: product taxability, an economic threshold (volume $ + txn count)
 * sourced from billing, and a physical-presence flag sourced from HR.
 * ==========================================================================*/

// Provenance metadata (shown in the UI to make the "data sync" story concrete)
export const SOURCES = {
  billing: { name: "Stripe", kind: "Billing", lastSync: "2026-06-30T22:00:00Z" },
  hr: { name: "Deel", kind: "HR / Payroll", lastSync: "2026-06-30T22:00:00Z" }
};

// ------- Country-level regions (light up on the world map) -------
export const COUNTRIES = [
  {
    id: "IN",
    name: "India",
    mapName: "India",                 // matches world-atlas properties.name
    iso3: "IND",
    flag: "🇮🇳",
    continent: "Asia",
    type: "country",
    taxable: true,
    economic: { volumeUsd: 512000, volumeLimitUsd: 300000, txnCount: 420, txnLimit: 200 },
    physicalPresence: true,
    triggerDate: "2025-06-18",
    estimatedLiabilityUsd: 68400,
    billingSource: "Stripe",
    hrSource: "Deel"
  },
  {
    id: "US",
    name: "United States",
    mapName: "United States of America",
    iso3: "USA",
    flag: "🇺🇸",
    continent: "US",
    type: "country",
    taxable: true,
    hasStates: true,                  // drill-down enabled
    economic: { volumeUsd: 1840000, volumeLimitUsd: 1000000, txnCount: 1290, txnLimit: 800 },
    physicalPresence: true,
    triggerDate: "2025-04-02",
    estimatedLiabilityUsd: 152300,
    billingSource: "Stripe",
    hrSource: "Deel"
  }
];

// ------- US state-level regions (shown when the user drills into the US) -------
// `taxable:false` = states with NO individual income tax (TX, FL, WA, NV, TN, ...)
// → physical presence there triggers nexus/filing consideration but $0 income-tax
//   liability = "Nexus Triggered (purple)".
export const US_STATES = [
  { id: "CA", name: "California", mapName: "California", abbr: "CA", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 820000, volumeLimitUsd: 500000, txnCount: 610, txnLimit: 200 },
    physicalPresence: true, triggerDate: "2025-03-11", estimatedLiabilityUsd: 74500 },
  { id: "NY", name: "New York", mapName: "New York", abbr: "NY", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 392000, volumeLimitUsd: 500000, txnCount: 148, txnLimit: 200 },
    physicalPresence: false, triggerDate: null, estimatedLiabilityUsd: 0 },
  { id: "IL", name: "Illinois", mapName: "Illinois", abbr: "IL", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 610000, volumeLimitUsd: 500000, txnCount: 240, txnLimit: 200 },
    physicalPresence: false, triggerDate: "2025-05-20", estimatedLiabilityUsd: 41200 },
  { id: "NJ", name: "New Jersey", mapName: "New Jersey", abbr: "NJ", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 355000, volumeLimitUsd: 500000, txnCount: 165, txnLimit: 200 },
    physicalPresence: false, triggerDate: null, estimatedLiabilityUsd: 0 },
  { id: "MA", name: "Massachusetts", mapName: "Massachusetts", abbr: "MA", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 250000, volumeLimitUsd: 500000, txnCount: 90, txnLimit: 200 },
    physicalPresence: false, triggerDate: null, estimatedLiabilityUsd: 0 },
  { id: "GA", name: "Georgia", mapName: "Georgia", abbr: "GA", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 120000, volumeLimitUsd: 500000, txnCount: 60, txnLimit: 200 },
    physicalPresence: false, triggerDate: null, estimatedLiabilityUsd: 0 },
  { id: "TX", name: "Texas", mapName: "Texas", abbr: "TX", flag: "🇺🇸", taxable: false,
    economic: { volumeUsd: 910000, volumeLimitUsd: 500000, txnCount: 540, txnLimit: 200 },
    physicalPresence: true, triggerDate: "2025-02-27", estimatedLiabilityUsd: 0 },
  { id: "FL", name: "Florida", mapName: "Florida", abbr: "FL", flag: "🇺🇸", taxable: false,
    economic: { volumeUsd: 430000, volumeLimitUsd: 500000, txnCount: 210, txnLimit: 200 },
    physicalPresence: true, triggerDate: "2025-07-01", estimatedLiabilityUsd: 0 },
  { id: "WA", name: "Washington", mapName: "Washington", abbr: "WA", flag: "🇺🇸", taxable: false,
    economic: { volumeUsd: 560000, volumeLimitUsd: 500000, txnCount: 300, txnLimit: 200 },
    physicalPresence: false, triggerDate: "2025-06-05", estimatedLiabilityUsd: 0 },
  { id: "CO", name: "Colorado", mapName: "Colorado", abbr: "CO", flag: "🇺🇸", taxable: true,
    economic: { volumeUsd: 300000, volumeLimitUsd: 500000, txnCount: 130, txnLimit: 200 },
    physicalPresence: false, triggerDate: null, estimatedLiabilityUsd: 0 }
];

// Continents offered in the header dropdown (spec parity). Only Asia & US carry data.
export const REGION_FILTERS = ["All", "Asia", "Canada", "Europe", "Latin America", "United States", "India"];

export function getCountries() { return COUNTRIES; }
export function getUsStates() { return US_STATES; }

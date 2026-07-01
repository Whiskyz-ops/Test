/* ============================================================================
 * Mock data — INCOME-TAX semantics (India ⇄ US individual cross-border).
 *
 * Data sources are a day/trip tracker (physical presence) and account feeds
 * (FBAR/8938 balances, LRS remittances) — not a billing system. A "region" is
 * a taxing jurisdiction the client is exposed to: India, the United States, and
 * US states (for state residency).
 *
 * Per region we track:
 *   - residency: physical-presence day-count vs the residency-test threshold
 *   - taxesWorldwide: does this jurisdiction tax a resident's worldwide income?
 *   - reporting: the dominant $ reporting limit (FBAR aggregate / LRS remitted)
 *   - estimatedTaxUsd / incomeExposedUsd
 * Numbers mirror the demo taxpayer used across the engine (Aarav Sharma).
 * ==========================================================================*/

export const CLIENT = { name: "Aarav Sharma", period: "FY2025-26 / TY2025" };

export const SOURCES = {
  trips: { name: "Trip Log", kind: "Physical presence / day-count", lastSync: "2026-06-30" },
  accounts: { name: "Account feeds", kind: "FBAR / 8938 balances · LRS", lastSync: "2026-06-30" },
  income: { name: "Payroll · 1099 · AIS", kind: "Income", lastSync: "2026-06-30" }
};

// ---------- Country-level jurisdictions ----------
export const COUNTRIES = [
  {
    id: "IN", name: "India", mapName: "India", iso3: "IND", flag: "🇮🇳", continent: "Asia", type: "country",
    taxesWorldwide: true, // ROR is taxed on worldwide income
    residency: { days: 210, threshold: 182, test: "182-day residency (ITA s.6)" },
    reporting: { label: "LRS remitted", value: 204819, limit: 250000, unit: "$" },
    physicalPresence: true,
    triggerDate: "2025-10-14",
    estimatedTaxUsd: 23307,
    incomeExposedUsd: 85783,
    reason: null
  },
  {
    id: "US", name: "United States", mapName: "United States of America", iso3: "USA", flag: "🇺🇸", continent: "US", type: "country",
    taxesWorldwide: true, hasStates: true,
    residency: { days: 330, threshold: 183, test: "Substantial Presence (≥183 weighted)" },
    reporting: { label: "FBAR aggregate", value: 56626, limit: 10000, unit: "$" },
    physicalPresence: true,
    triggerDate: "2025-05-06",
    estimatedTaxUsd: 36585,
    incomeExposedUsd: 245395,
    reason: null
  }
];

// ---------- US state residency ----------
// taxesWorldwide:false = states with NO individual income tax → presence there is a
// domicile/filing consideration but $0 state income tax = "Nexus Triggered" (purple).
export const US_STATES = [
  { id:"CA", name:"California", mapName:"California", abbr:"CA", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:205, threshold:183, test:"CA statutory residency (183-day)" }, reporting:null,
    physicalPresence:true, triggerDate:"2025-07-05", estimatedTaxUsd:18500, incomeExposedUsd:165000, reason:null },
  { id:"IL", name:"Illinois", mapName:"Illinois", abbr:"IL", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:190, threshold:183, test:"IL residency (183-day)" }, reporting:null,
    physicalPresence:false, triggerDate:"2025-06-28", estimatedTaxUsd:9200, incomeExposedUsd:120000, reason:null },
  { id:"NY", name:"New York", mapName:"New York", abbr:"NY", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:160, threshold:183, test:"NY statutory residency (183-day + abode)" }, reporting:null,
    physicalPresence:true, triggerDate:null, estimatedTaxUsd:0, incomeExposedUsd:0, reason:null },
  { id:"NJ", name:"New Jersey", mapName:"New Jersey", abbr:"NJ", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:150, threshold:183, test:"NJ residency (183-day)" }, reporting:null,
    physicalPresence:false, triggerDate:null, estimatedTaxUsd:0, incomeExposedUsd:0, reason:null },
  { id:"CO", name:"Colorado", mapName:"Colorado", abbr:"CO", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:130, threshold:183, test:"CO residency (183-day)" }, reporting:null,
    physicalPresence:false, triggerDate:null, estimatedTaxUsd:0, incomeExposedUsd:0, reason:null },
  { id:"MA", name:"Massachusetts", mapName:"Massachusetts", abbr:"MA", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:121, threshold:183, test:"MA residency (183-day)" }, reporting:null,
    physicalPresence:false, triggerDate:null, estimatedTaxUsd:0, incomeExposedUsd:0, reason:null },
  { id:"GA", name:"Georgia", mapName:"Georgia", abbr:"GA", flag:"🇺🇸", type:"state", taxesWorldwide:true,
    residency:{ days:70, threshold:183, test:"GA residency (183-day)" }, reporting:null,
    physicalPresence:false, triggerDate:null, estimatedTaxUsd:0, incomeExposedUsd:0, reason:null },
  { id:"TX", name:"Texas", mapName:"Texas", abbr:"TX", flag:"🇺🇸", type:"state", taxesWorldwide:false,
    residency:{ days:200, threshold:183, test:"TX presence (no income tax)" }, reporting:null,
    physicalPresence:true, triggerDate:"2025-06-10", estimatedTaxUsd:0, incomeExposedUsd:0,
    reason:"No state income tax — domicile & filing check only" },
  { id:"FL", name:"Florida", mapName:"Florida", abbr:"FL", flag:"🇺🇸", type:"state", taxesWorldwide:false,
    residency:{ days:190, threshold:183, test:"FL presence (no income tax)" }, reporting:null,
    physicalPresence:true, triggerDate:"2025-07-01", estimatedTaxUsd:0, incomeExposedUsd:0,
    reason:"No state income tax — domicile check only" },
  { id:"WA", name:"Washington", mapName:"Washington", abbr:"WA", flag:"🇺🇸", type:"state", taxesWorldwide:false,
    residency:{ days:184, threshold:183, test:"WA presence (no income tax)" }, reporting:null,
    physicalPresence:false, triggerDate:"2025-06-30", estimatedTaxUsd:0, incomeExposedUsd:0,
    reason:"No income tax; WA capital-gains excise check" }
];

export const REGION_FILTERS = ["All", "Asia", "Canada", "Europe", "Latin America", "United States", "India"];

export function getCountries() { return COUNTRIES; }
export function getUsStates() { return US_STATES; }

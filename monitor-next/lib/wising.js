/* ============================================================================
 * Bridge between the shared engine (lib/engine/*.js) and the Monitor UI.
 * The engine files are plain IIFEs that attach to `window.WISING`; we import
 * them for side-effects (in dependency order) and expose typed helpers that
 * map the engine's computed output onto the Monitor's region shape.
 * Client-only (the engine reads window/localStorage at call time).
 *
 * profiles.js is deliberately imported from ./dag/ (the live, DAG-synced
 * mirror of prototypes/graph-pilot/profiles.js), NOT ./engine/ (the
 * permanently-frozen 23 Jul 2026 snapshot, docs/DAG_MIGRATION_TRACKER.md
 * §J) — every other file here stays frozen (Engine mode's own compute
 * logic must not change), but the DEMO PROFILE LIST is fixture data, not
 * logic, and new/updated demo profiles built on the DAG side (e.g. IN-6's
 * s44AD_last_exit_ay, IN-26's s.44BBB entry) should reach both Engine and
 * DAG mode's "Switch client" dropdown, not just the standalone Layer 0/1
 * HTML pages (which already load prototypes/graph-pilot/profiles.js
 * directly, per §J). Both files are the identical IIFE shape (same
 * WISING.PROFILES/.loadProfile/.listProfiles/.activeProfileId API, ported
 * verbatim when profiles.js moved out of engine/), so this is a clean
 * drop-in swap, not a behavioral change to how profiles are loaded. Engine
 * mode processing the newer fixture data through frozen (pre-fix) logic on
 * those 2 profiles specifically is expected and deliberate — the same
 * "DAG has it, frozen engine doesn't" divergence this migration has
 * documented throughout, not a bug. */
"use client";
import "./engine/constants.js";
import "./engine/normalize.js";
import "./engine/computation.js";
import "./engine/monitoring.js";
import "./engine/conflicts.js";
import "./engine/sample-data.js";
import "./dag/profiles.js";

export function getWISING() {
  return typeof window !== "undefined" ? window.WISING : null;
}

export function listProfiles() {
  const W = getWISING();
  return W && W.listProfiles ? W.listProfiles() : [];
}
export function loadProfile(id) {
  const W = getWISING();
  return W && W.loadProfile ? W.loadProfile(id) : false;
}
export function activeProfileId() {
  const W = getWISING();
  return W && W.activeProfileId ? W.activeProfileId() : null;
}

// "+ Add Client" — registers a new, empty client in the persisted registry
// (separate from the 12 static demo profiles, and separate from the single
// shared "Live" localStorage slot) and returns its id. The caller opens
// router.html?client=<id> in a new tab; every Layer 0/1 write on that page
// (and any router.html/layer1_*.html page reached from it) is scoped to
// this one client's own namespaced keys — see constants.js's ClientRegistry
// header comment for the full mechanism.
export function createClient() {
  const W = getWISING();
  return W && W.ClientRegistry ? W.ClientRegistry.create() : null;
}

// Removes a registry client from this browser (its router / India / US
// data and its registry entry). A spouse still linked to it is unlinked
// first (us.profile.spouse_client_id cleared, as the US form does on unlink),
// so no remaining client points at a client that no longer exists.
export function removeClient(id) {
  const W = getWISING();
  if (!W || !W.ClientRegistry || !id) return false;
  try {
    W.ClientRegistry.list().forEach((c) => {
      if (c.id === id) return;
      const key = "wising_client_" + c.id + "_us"; // the registry's per-client key (constants.js clientScopedKey)
      const us = JSON.parse(window.localStorage.getItem(key) || "null");
      if (us && us.profile && us.profile.spouse_client_id === id) {
        us.profile.spouse_client_id = null;
        window.localStorage.setItem(key, JSON.stringify(us));
      }
    });
  } catch (e) { /* storage blocked: still remove below */ }
  W.ClientRegistry.remove(id);
  return true;
}

// A registry client's raw {router,india,us} — read directly from its own
// namespaced keys, bypassing the shared global slot entirely. Used to view
// a SPECIFIC client's Monitor without disturbing whatever "Live"/demo state
// the shared slot currently holds.
export function getClientRawState(id) {
  const W = getWISING();
  return W && W.ClientRegistry ? W.ClientRegistry.getRawState(id) : { router: {}, india: {}, us: {} };
}

export function isRegistryClientId(id) {
  const W = getWISING();
  if (!W || !W.ClientRegistry) return false;
  return W.ClientRegistry.list().some((c) => c.id === id);
}

// Full analyze() result for a SPECIFIC profile id, regardless of which
// client is currently active/loaded — used to merge a linked (owned)
// entity's own compliance calendar/documents into the active client's
// Filings tab (docs/GAP_TRACKER.md section H.11) without switching away
// from the active client's Layer 1 data in localStorage. Engine-mode
// counterpart to dag-adapter.js's analyzeProfileByIdDag.
export function analyzeProfileById(id) {
  const W = getWISING();
  if (!W || !W.PROFILES) return null;
  const p = W.PROFILES.find((x) => x.id === id);
  if (!p) return null;
  return W.analyze({ router: p.router, india: p.india, us: p.us });
}

function summarizeEngine(W, id, label, story, tags, raw, isRegistryClient) {
  let r;
  try { r = W.analyze(raw); } catch (e) { return null; }
  const s = r.summary;
  return {
    id, label, story, tags, isRegistryClient: !!isRegistryClient,
    // The taxpayer's actual name — see dag-adapter.js's summarize() for why
    // this is distinct from `label` (a scenario description for demo
    // profiles, not a person's name).
    name: s.name,
    isBusiness: r.model.entity ? r.model.entity.isBusiness : false,
    indiaStatus: s.indiaStatus, usStatus: s.usStatus, dualResident: s.dualResident,
    totalIncomeUsd: s.totalIncomeUsd, netDoubleTaxUsd: s.netDoubleTaxUsd,
    // After each country's relief for the other's tax (engine headline).
    combinedTaxUsd: (r.computed && r.computed.headline && r.computed.headline.combinedTaxAfterReliefUsd != null)
      ? r.computed.headline.combinedTaxAfterReliefUsd : (s.indiaTaxUsd || 0) + (s.usTaxUsd || 0),
    critical: s.counts.critical, warning: s.counts.warning,
    requiredDocs: s.requiredDocs, healthScore: s.healthScore,
    nextDeadline: r.monitoring && r.monitoring.calendar.next ? r.monitoring.calendar.next : null
  };
}

// Run the engine over every profile → compact summaries for the Clients
// portfolio. Also includes every registry client added via "+ Add Client" —
// see dag-adapter.js's allClientSummariesDag for the full rationale; kept in
// sync here so the Engine-mode fallback shows the same client list too.
export function allClientSummaries() {
  const W = getWISING();
  if (!W || !W.PROFILES) return [];
  const demo = W.PROFILES.map((p) => summarizeEngine(W, p.id, p.label, p.story, p.tags, { router: p.router, india: p.india, us: p.us })).filter(Boolean);
  const registry = (W.ClientRegistry ? W.ClientRegistry.list() : []).map((c) => {
    const raw = W.ClientRegistry.getRawState(c.id);
    return summarizeEngine(W, c.id, c.label || "New client", "Added by this practice — not a demo profile.", ["live"], raw, true);
  }).filter(Boolean);
  return demo.concat(registry);
}

export function hasLiveLayer1() {
  const W = getWISING();
  if (!W) return false;
  try {
    return !!(localStorage.getItem(W.CONST.STORAGE_KEYS.INDIA) || localStorage.getItem(W.CONST.STORAGE_KEYS.US));
  } catch (e) { return false; }
}

// source: "demo" | "live" | { india, us, router }
export function analyzeSource(source) {
  const W = getWISING();
  if (!W) return null;
  let opts = {};
  if (source === "demo") opts = { router: W.SAMPLE.router, india: W.SAMPLE.india, us: W.SAMPLE.us };
  else if (source === "live") opts = {};
  else if (source && typeof source === "object") opts = source;
  return W.analyze(opts);
}

function crossedDate(resEntry) {
  if (resEntry && resEntry.status === "resident" && resEntry.dateLabel) {
    return resEntry.dateLabel.replace("Crossed ~", "");
  }
  return null;
}

// "Resident since" for an individual, as a legal start rather than the day
// the day-count crossed its threshold (which is what crossedDate reports and
// isn't when residency starts): India's residential status covers the whole
// financial year; a US citizen / green-card holder is resident all year; a
// substantial-presence resident is resident from their first US day of the
// year (IRC 7701(b)(2)(A)(iii)). Entities keep crossedDate's answer.
function residentSinceIndia(result, entry) {
  if (!entry || entry.kind !== "days") return crossedDate(entry);
  const r = result.computed.residency.india;
  if (!r.isResident) return null;
  const y = result.model.meta.baseYear;
  return y ? `All of FY ${y}-${String(y + 1).slice(-2)} (${r.status})` : `Whole financial year (${r.status})`;
}
function residentSinceUs(result, entry) {
  if (!entry || entry.kind !== "days") return crossedDate(entry);
  const u = result.model.residency.us, y = result.model.meta.baseYear;
  if (!result.computed.residency.us.isResident) return null;
  if (u.isCitizen) return `All of ${y || "the year"} (US citizen)`;
  if (u.hasGreenCard) return `All of ${y || "the year"} (green card)`;
  if (u.sptMet) return `First US day of ${y || "the year"} (substantial presence)`;
  return crossedDate(entry);
}

// The same legal start, for a country's residency counter entry — the
// Residency tab shows it in place of the "Crossed ~<date>" estimate.
export function residentSinceFor(result, entry) {
  if (!result || !entry) return null;
  return entry.country === "India" ? residentSinceIndia(result, entry) : residentSinceUs(result, entry);
}

// FBAR and Form 8938 are US-person reporting (citizen, resident alien, or a
// US domestic entity) — a non-resident alien's gauges aren't obligations, so
// the Monitor hides them (the engine already skips the FBAR finding and the
// documents list for them).
const US_PERSON_REPORTING_GAUGES = ["fbar", "form8938"];
export function isUsPersonResult(result) {
  if (!result || !result.computed || !result.computed.residency) return true;
  const kind = result.model && result.model.entity ? result.model.entity.usKind : null;
  return !!result.computed.residency.us.isResident || ["ccorp", "scorp", "partnership", "trust"].includes(kind);
}
export function isUsPersonOnlyGauge(id) { return US_PERSON_REPORTING_GAUGES.includes(id); }

// India's taxable base for the region row. For a resident taxed on worldwide
// income, India's tax also covers the US income Layer 1 US holds (and a US
// employer's pay for India work), which model.income.india.total (Layer 1
// India only) leaves out — so use the India tax card's own gross total
// income there, keeping "tax vs income exposed" on the same base.
function indiaIncomeExposedUsd(result) {
  const base = result.model.income.india.total.usd;
  if (!result.computed.residency.india.worldwide) return base;
  const rows = (result.taxComputation && result.taxComputation.india && result.taxComputation.india.rows) || [];
  const gti = rows.find((r) => typeof r.label === "string" && r.label.indexOf("Gross total income") === 0 && typeof r.inr === "number");
  const fx = result.model.meta && result.model.meta.fxRate;
  return gti && fx ? Math.max(base, gti.inr / fx) : base;
}

// Engine result → the two country region rows the Monitor renders.
export function countriesFromEngine(result) {
  const c = result.computed, model = result.model, m = result.monitoring;
  const byCountry = {};
  (m.residency || []).forEach((r) => { byCountry[r.country] = r; });
  const proj = {};
  (m.projections || []).forEach((p) => { proj[p.id] = p; });

  // Day-count only makes sense for an individual's own presence test — a
  // company/HUF/firm/entity's residency entry (monitoring.js) carries
  // kind: "qualitative" instead, with no days/threshold at all. Pulling
  // days/threshold/test from the SAME entry this table's "Days Present"
  // column reads keeps both surfaces in sync instead of re-deriving a
  // fabricated day-count independently here.
  const inEntry = byCountry["India"], usEntry = byCountry["United States"];
  const india = {
    id: "IN", name: "India", mapName: "India", iso3: "IND", flag: "🇮🇳", continent: "Asia", type: "country",
    taxesWorldwide: c.residency.india.worldwide,
    residency: inEntry && inEntry.kind === "days"
      ? { days: inEntry.days, threshold: inEntry.threshold, test: inEntry.test }
      : { days: null, threshold: null, test: inEntry ? inEntry.test : "Entity-level residency (not day-count)", isResident: inEntry ? inEntry.isResident : false },
    reporting: proj.lrs ? { label: "LRS remitted", value: Math.round(proj.lrs.current), limit: proj.lrs.limit, unit: "$" } : null,
    physicalPresence: inEntry && inEntry.kind === "days" ? model.residency.india.daysCurrentYear > 0 : null,
    triggerDate: residentSinceIndia(result, inEntry),
    estimatedTaxUsd: Math.round(c.indiaTax.totalTaxUsd),
    incomeExposedUsd: Math.round(indiaIncomeExposedUsd(result)),
    reason: null
  };
  const us = {
    id: "US", name: "United States", mapName: "United States of America", iso3: "USA", flag: "🇺🇸", continent: "US", type: "country", hasStates: true,
    taxesWorldwide: c.residency.us.worldwide,
    residency: usEntry && usEntry.kind === "days"
      ? { days: usEntry.days, threshold: usEntry.threshold, test: usEntry.test }
      : { days: null, threshold: null, test: usEntry ? usEntry.test : "Entity-level residency (not day-count)", isResident: usEntry ? usEntry.isResident : false },
    reporting: proj.fbar ? { label: "FBAR aggregate", value: Math.round(proj.fbar.current), limit: proj.fbar.limit, unit: "$" } : null,
    physicalPresence: usEntry && usEntry.kind === "days" ? model.residency.us.daysCurrentYear > 0 : null,
    triggerDate: residentSinceUs(result, usEntry),
    estimatedTaxUsd: Math.round(c.usTax.totalTaxBeforeFtcUsd),
    // model.income.us.total is the INDIVIDUAL-shaped aggregate (wages +
    // interest + dividends + business_us + ...) — genuinely empty for a US
    // business entity (ccorp/scorp/partnership/trust), whose own income is
    // Schedule M-1 book-to-tax reconciled (entity.usScheduleM1TaxableIncomeUsd
    // -> computed.usTax.totalIncomeUsd, the same figure the Business tab's
    // model.assets.businessEntities row shows), not an individual 1040
    // aggregate at all. Reading model.income.us.total for an entity taxpayer
    // showed a fabricated $0 "Income Exposed" on the US country card even
    // when the Business tab (same profile) showed real income — e.g.
    // us_ccorp_indian_sub: $0 shown vs $4.26M in computed.usTax.totalIncomeUsd.
    // Scoped strictly to c.usTax.isEntity (the entity-path marker
    // computeUsEntityTax already sets) rather than switching every profile
    // to computed.usTax.totalIncomeUsd: for an NRA or an FEIE-electing
    // individual that figure is deliberately NARROWER than the gross
    // aggregate (ECI+FDAP only / net of the §911 exclusion) — a legitimate,
    // separate distinction ("taxed" vs "exposed") this fix isn't touching.
    incomeExposedUsd: Math.round(c.usTax.isEntity ? c.usTax.totalIncomeUsd : model.income.us.total.usd),
    reason: null
  };
  // Scope — see model.meta.hasIndiaScope/hasUsScope (normalize.js): a
  // taxpayer with no real exposure in one country (e.g. an India-only CA
  // client with zero US days/citizenship/income) isn't just "on track" in
  // that country, they're not a taxpayer there at all. Omitting it here
  // (rather than including it as STATUS.NONE, which renders as a green
  // "On track" jurisdiction) lets the map/KPI counts fall through to their
  // existing "not tracked" treatment for any country with no status entry,
  // instead of implying the US is being actively monitored for a client who
  // has nothing to monitor there.
  const out = [];
  if (model.meta.hasIndiaScope !== false) out.push(india);
  if (model.meta.hasUsScope !== false) out.push(us);
  return out;
}

// Convenience: full engine-derived snapshot for the Monitor.
export function monitorSnapshot(source) {
  const result = analyzeSource(source);
  if (!result) return null;
  return {
    result,
    countries: countriesFromEngine(result),
    healthScore: result.summary.healthScore,
    clientName: result.summary.name,
    baseYear: result.summary.baseYear
  };
}

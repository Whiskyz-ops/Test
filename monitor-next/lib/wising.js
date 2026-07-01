/* ============================================================================
 * Bridge between the shared engine (lib/engine/*.js) and the Monitor UI.
 * The engine files are plain IIFEs that attach to `window.WISING`; we import
 * them for side-effects (in dependency order) and expose typed helpers that
 * map the engine's computed output onto the Monitor's region shape.
 * Client-only (the engine reads window/localStorage at call time).
 * ==========================================================================*/
"use client";
import "./engine/constants.js";
import "./engine/normalize.js";
import "./engine/computation.js";
import "./engine/monitoring.js";
import "./engine/conflicts.js";
import "./engine/sample-data.js";

export function getWISING() {
  return typeof window !== "undefined" ? window.WISING : null;
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

// Engine result → the two country region rows the Monitor renders.
export function countriesFromEngine(result) {
  const c = result.computed, model = result.model, m = result.monitoring;
  const byCountry = {};
  (m.residency || []).forEach((r) => { byCountry[r.country] = r; });
  const proj = {};
  (m.projections || []).forEach((p) => { proj[p.id] = p; });

  const india = {
    id: "IN", name: "India", mapName: "India", iso3: "IND", flag: "🇮🇳", continent: "Asia", type: "country",
    taxesWorldwide: c.residency.india.worldwide,
    residency: { days: model.residency.india.daysCurrentYear, threshold: 182, test: "182-day residency (ITA s.6)" },
    reporting: proj.lrs ? { label: "LRS remitted", value: Math.round(proj.lrs.current), limit: proj.lrs.limit, unit: "$" } : null,
    physicalPresence: model.residency.india.daysCurrentYear > 0,
    triggerDate: crossedDate(byCountry["India"]),
    estimatedTaxUsd: Math.round(c.indiaTax.totalTaxUsd),
    incomeExposedUsd: Math.round(model.income.india.total.usd),
    reason: null
  };
  const us = {
    id: "US", name: "United States", mapName: "United States of America", iso3: "USA", flag: "🇺🇸", continent: "US", type: "country", hasStates: true,
    taxesWorldwide: c.residency.us.worldwide,
    residency: { days: model.residency.us.daysCurrentYear, threshold: 183, test: "Substantial Presence (≥183 weighted)" },
    reporting: proj.fbar ? { label: "FBAR aggregate", value: Math.round(proj.fbar.current), limit: proj.fbar.limit, unit: "$" } : null,
    physicalPresence: model.residency.us.daysCurrentYear > 0,
    triggerDate: crossedDate(byCountry["United States"]),
    estimatedTaxUsd: Math.round(c.usTax.totalTaxBeforeFtcUsd),
    incomeExposedUsd: Math.round(model.income.us.total.usd),
    reason: null
  };
  return [india, us];
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

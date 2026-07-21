/* ============================================================================
 * Core business logic — INCOME-TAX exposure. Status classification, KPI
 * rollups, and automated alert utilities. Pure functions (the notifier logs).
 * ==========================================================================*/

export const STATUS = { EXPOSED: "exposed", APPROACHING: "approaching", NEXUS: "nexus", NONE: "none" };

// Dark-theme chips: vivid fill for maps/dots, darker tint for chip bg, lighter
// variant for chip text (legible on dark). Validated (CVD red↔amber ΔE 30.9).
export const STATUS_META = {
  exposed:     { label: "Exposed",     color: "#ef4444", soft: "rgba(239,68,68,.15)",   text: "#fca5b5" },
  approaching: { label: "Approaching", color: "#f5a623", soft: "rgba(245,166,35,.15)",  text: "#fcd34d" },
  nexus:       { label: "Filing-only", color: "#3b82f6", soft: "rgba(59,130,246,.15)",  text: "#93c5fd" },
  none:        { label: "On track",    color: "#22c55e", soft: "rgba(34,197,94,.14)",   text: "#86efac" }
};

// Shared WISING palette — one source of truth for inline colors across views.
export const PAL = {
  // WISING brand: emerald (#34d399) + blue (#60a5fa) on black
  accent: "#34d399", accent2: "#60a5fa", teal: "#34d399",
  panel: "#161616", panelInk: "#ffffff",
  // functional / status (reserved, used sparingly)
  exposed: "#ef4444", approaching: "#f5a623", filing: "#60a5fa", positive: "#34d399",
  // on-dark text variants of the above (for small labels / values)
  redText: "#fca5b5", amberText: "#fcd34d", blueText: "#93c5fd", greenText: "#6ee7b7",
  // white ink
  head: "#ffffff", body: "#c7cbd2", muted: "#8b8f99", faint: "#6b6f78",
  navy: "#1a1a1a",
  // jurisdiction accents (US = brand blue, IN = brand emerald)
  jurUS: "#60a5fa", jurIN: "#34d399",
  // validated two-series chart fills (dark-mode categorical, dataviz validator):
  // deep emerald + brand blue — clear, colour-blind-safe split.
  seriesIN: "#12996a", seriesUS: "#3b82f6"
};

// Residency day-count fraction (physical-presence test) — or, for a
// company/HUF/firm/entity taxpayer (no day-count test applies at all), the
// qualitative resident/non-resident fact collapsed to 1/0 so classify()'s
// "threshold crossed" check still means the right thing for an entity: IS
// it resident, not "have enough days accrued" (a concept that doesn't
// exist for it).
export function residencyPct(r) {
  const d = r.residency || {};
  if (!d.threshold) return d.isResident ? 1 : 0;
  return d.days / d.threshold;
}
// Reporting-limit fraction (FBAR / LRS), if the region has one.
export function reportingPct(r) {
  const rep = r.reporting;
  return rep && rep.limit ? rep.value / rep.limit : 0;
}
// A jurisdiction's threshold is crossed if the residency day-count is met OR a
// hard reporting limit (FBAR / LRS) is breached.
export function isBreached(r) {
  return residencyPct(r) >= 1 || reportingPct(r) >= 1;
}

// Classification:
//  Exposed      = any real, accruing tax liability in the jurisdiction — whether
//                 from worldwide-resident taxation after a threshold crossing, or
//                 from source-basis taxation of a non-resident (e.g. NR India-source
//                 income, or an owned entity's own tax) that never depends on the
//                 individual's own residency/reporting threshold at all.
//  Approaching  = taxes worldwide income, threshold NOT crossed → heading toward residency
//  Filing-only  = threshold crossed but $0 tax → filing/disclosure only, no liability
//  On track     = neither: no liability, no threshold crossed
export function classify(r) {
  const breached = isBreached(r);
  const hasTax = (r.estimatedTaxUsd || 0) > 0;
  // A real liability is Exposed regardless of why it exists — gating this on
  // `breached` hid genuine non-resident source-basis tax (e.g. an NR's India-source
  // income, or tax owed by an entity the taxpayer owns) behind "On track".
  if (hasTax) return STATUS.EXPOSED;
  if (r.taxesWorldwide && !breached) return STATUS.APPROACHING;
  if (breached) return STATUS.NEXUS;
  return STATUS.NONE;
}

// "How close" — max of the residency and reporting fractions.
export function approachPct(r) { return Math.max(residencyPct(r), reportingPct(r)); }

export function withStatus(regions) {
  return regions.map((r) => ({ ...r, status: classify(r), pct: approachPct(r) }));
}

export function computeKpis(regions) {
  const s = withStatus(regions);
  return {
    exposed: s.filter((r) => r.status === STATUS.EXPOSED).length,
    approaching: s.filter((r) => r.status === STATUS.APPROACHING).length,
    nexus: s.filter((r) => r.status === STATUS.NEXUS).length,
    all: s.length,
    totalTax: s.reduce((a, r) => a + (r.estimatedTaxUsd || 0), 0)
  };
}

export function statusByMapName(regions) {
  const out = {};
  withStatus(regions).forEach((r) => { out[r.mapName] = r.status; });
  return out;
}

/* --------------------------- AUTOMATED ALERTS --------------------------- */
// Which metric is driving the region toward its threshold (for the message).
function driver(r) {
  const rp = residencyPct(r), fp = reportingPct(r);
  if (fp >= rp && r.reporting) {
    return { label: r.reporting.label, pct: fp, detail: `${fmtUsd(r.reporting.value)} / ${fmtUsd(r.reporting.limit)}` };
  }
  return { label: r.residency.test, pct: rp, detail: `${r.residency.days} / ${r.residency.threshold} days` };
}

export function buildAlert(region, kind) {
  const base = { kind, regionId: region.id, region: region.name, createdAt: new Date().toISOString(), channel: "email" };
  if (kind === "approaching_60") {
    const d = driver(region);
    return {
      ...base, severity: "warning",
      subject: `⚠️ ${region.name} at ${Math.round(d.pct * 100)}% of ${d.label}`,
      body: `${region.name} has reached ${Math.round(d.pct * 100)}% of the ${d.label} threshold (${d.detail}). ` +
            `Plan travel / remittances before crossing to avoid an unplanned residency or reporting trigger.`
    };
  }
  if (kind === "became_exposed") {
    return {
      ...base, severity: "critical",
      subject: `🚨 ${region.name} — now a tax resident; worldwide income in scope`,
      body: `${region.name} crossed its residency threshold and taxes worldwide income. ` +
            `Estimated tax: ${fmtUsd(region.estimatedTaxUsd)} (since ${region.triggerDate || "today"}). ` +
            `Confirm treaty tie-breaker / FTC and begin the required filings.`
    };
  }
  return base;
}

// Fires when a worldwide-taxing region passes 60% of its threshold but hasn't crossed.
export function approachingAlerts(regions, threshold = 0.6) {
  return withStatus(regions)
    .filter((r) => r.status === STATUS.APPROACHING && r.pct >= threshold)
    .map((r) => buildAlert(r, "approaching_60"));
}
// Fires when a region newly becomes "exposed".
export function transitionAlerts(prevRegions, currRegions) {
  const prev = {}; withStatus(prevRegions).forEach((r) => (prev[r.id] = r.status));
  return withStatus(currRegions)
    .filter((r) => r.status === STATUS.EXPOSED && prev[r.id] && prev[r.id] !== STATUS.EXPOSED)
    .map((r) => buildAlert(r, "became_exposed"));
}
// Mock notifier — production hook for email/Slack.
export function sendNotification(alert) {
  // eslint-disable-next-line no-console
  console.info(`[WISING alert:${alert.severity}] → ${alert.channel}: ${alert.subject}`);
  return { ...alert, sentAt: new Date().toISOString(), delivered: true };
}
export function runAlertScan(regions, prevRegions) {
  const alerts = [...approachingAlerts(regions), ...(prevRegions ? transitionAlerts(prevRegions, regions) : [])];
  alerts.forEach(sendNotification);
  return alerts;
}

export function fmtUsd(n) { return "$" + Math.round(n || 0).toLocaleString("en-US"); }

/* ============================================================================
 * Core business logic — INCOME-TAX exposure. Status classification, KPI
 * rollups, and automated alert utilities. Pure functions (the notifier logs).
 * ==========================================================================*/

export const STATUS = { EXPOSED: "exposed", APPROACHING: "approaching", NEXUS: "nexus", NONE: "none" };

export const STATUS_META = {
  exposed:     { label: "Exposed",         color: "#ef4444", soft: "rgba(239,68,68,.14)",  text: "#fca5a5" },
  approaching: { label: "Approaching",     color: "#f59e0b", soft: "rgba(245,158,11,.14)", text: "#fcd34d" },
  nexus:       { label: "Filing-only",     color: "#a855f7", soft: "rgba(168,85,247,.16)", text: "#d8b4fe" },
  none:        { label: "Monitored",       color: "#52525b", soft: "rgba(82,82,91,.16)",   text: "#a1a1aa" }
};

// Residency day-count fraction (physical-presence test).
export function residencyPct(r) {
  const d = r.residency || {};
  return d.threshold ? d.days / d.threshold : 0;
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
//  Exposed      = taxes worldwide income AND threshold crossed  → liability accruing
//  Approaching  = taxes worldwide income, threshold NOT crossed → heading toward residency
//  Filing-only  = threshold crossed but jurisdiction does NOT tax worldwide income → $0 tax, filing/disclosure only
//  Monitored    = neither
export function classify(r) {
  const breached = isBreached(r);
  if (r.taxesWorldwide && breached) return STATUS.EXPOSED;
  if (r.taxesWorldwide && !breached) return STATUS.APPROACHING;
  if (!r.taxesWorldwide && breached) return STATUS.NEXUS;
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

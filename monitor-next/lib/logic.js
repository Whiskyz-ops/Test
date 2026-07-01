/* ============================================================================
 * Core business logic: status classification, KPI rollups, and automated
 * alert utilities. Pure functions — no React, no side effects (except the
 * mock notifier which just logs).
 * ==========================================================================*/

export const STATUS = { EXPOSED: "exposed", APPROACHING: "approaching", NEXUS: "nexus", NONE: "none" };

export const STATUS_META = {
  exposed:     { label: "Exposed",         color: "#ef4444", soft: "rgba(239,68,68,.14)",  text: "#fca5a5" },
  approaching: { label: "Approaching",     color: "#f59e0b", soft: "rgba(245,158,11,.14)", text: "#fcd34d" },
  nexus:       { label: "Nexus Triggered", color: "#a855f7", soft: "rgba(168,85,247,.16)", text: "#d8b4fe" },
  none:        { label: "Monitored",       color: "#52525b", soft: "rgba(82,82,91,.16)",   text: "#a1a1aa" }
};

// A region's threshold is breached if the ECONOMIC limit (volume $ or txn count)
// is hit, OR there is PHYSICAL presence (which can independently create nexus).
export function isEconomicBreached(r) {
  const e = r.economic || {};
  return (e.volumeUsd >= e.volumeLimitUsd) || (e.txnCount >= e.txnLimit);
}
export function isBreached(r) {
  return isEconomicBreached(r) || !!r.physicalPresence;
}

// Classification per the spec.
export function classify(r) {
  const breached = isBreached(r);
  if (r.taxable && breached) return STATUS.EXPOSED;      // liability accruing
  if (r.taxable && !breached) return STATUS.APPROACHING; // taxable, not yet over
  if (!r.taxable && breached) return STATUS.NEXUS;       // over threshold, $0 liability
  return STATUS.NONE;
}

// How close an "approaching" region is to its limit (max of volume% and txn%).
export function approachPct(r) {
  const e = r.economic || {};
  const v = e.volumeLimitUsd ? e.volumeUsd / e.volumeLimitUsd : 0;
  const t = e.txnLimit ? e.txnCount / e.txnLimit : 0;
  return Math.max(v, t);
}

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
    totalLiability: s.reduce((a, r) => a + (r.estimatedLiabilityUsd || 0), 0)
  };
}

// Build a lookup { mapName: status } for choropleth colouring.
export function statusByMapName(regions) {
  const out = {};
  withStatus(regions).forEach((r) => { out[r.mapName] = r.status; });
  return out;
}

/* ---------------------------------------------------------------------------
 * AUTOMATED ALERTS
 * -------------------------------------------------------------------------*/
export function buildAlert(region, kind, extra) {
  const base = {
    kind,
    regionId: region.id,
    region: region.name,
    createdAt: new Date().toISOString(),
    channel: "email"
  };
  if (kind === "approaching_60") {
    return {
      ...base,
      severity: "warning",
      subject: `⚠️ ${region.name} is at ${Math.round(approachPct(region) * 100)}% of its threshold`,
      body: `${region.name} has reached ${Math.round(approachPct(region) * 100)}% of its economic nexus threshold ` +
            `(volume ${fmtUsd(region.economic.volumeUsd)} / ${fmtUsd(region.economic.volumeLimitUsd)}). ` +
            `Register before you cross to avoid back-dated liability.`,
      ...extra
    };
  }
  if (kind === "became_exposed") {
    return {
      ...base,
      severity: "critical",
      subject: `🚨 ${region.name} is now EXPOSED — liability is accruing`,
      body: `${region.name} crossed its threshold and the product is taxable there. ` +
            `Estimated liability: ${fmtUsd(region.estimatedLiabilityUsd)} as of ${region.triggerDate || "today"}. ` +
            `Begin registration immediately.`,
      ...extra
    };
  }
  return base;
}

// Trigger when a taxable region passes 60% of its threshold but hasn't breached.
export function approachingAlerts(regions, threshold = 0.6) {
  return withStatus(regions)
    .filter((r) => r.status === STATUS.APPROACHING && r.pct >= threshold)
    .map((r) => buildAlert(r, "approaching_60"));
}

// Trigger when a region newly enters the "exposed" category (state transition).
export function transitionAlerts(prevRegions, currRegions) {
  const prev = {}; withStatus(prevRegions).forEach((r) => (prev[r.id] = r.status));
  return withStatus(currRegions)
    .filter((r) => r.status === STATUS.EXPOSED && prev[r.id] && prev[r.id] !== STATUS.EXPOSED)
    .map((r) => buildAlert(r, "became_exposed"));
}

// Mock notifier — in production this calls an email/Slack service.
export function sendNotification(alert) {
  // eslint-disable-next-line no-console
  console.info(`[WISING alert:${alert.severity}] → ${alert.channel}: ${alert.subject}`);
  return { ...alert, sentAt: new Date().toISOString(), delivered: true };
}

// Convenience: evaluate all alerts for the current dataset.
export function runAlertScan(regions, prevRegions) {
  const alerts = [
    ...approachingAlerts(regions),
    ...(prevRegions ? transitionAlerts(prevRegions, regions) : [])
  ];
  alerts.forEach(sendNotification);
  return alerts;
}

export function fmtUsd(n) {
  return "$" + Math.round(n || 0).toLocaleString("en-US");
}

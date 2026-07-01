/* ============================================================================
 * Core business logic — INCOME-TAX exposure classification, KPI rollups, and
 * automated alert utilities. Pure functions — no React, no side effects (except
 * the mock notifier which just logs).
 *
 * A jurisdiction is "breached" when EITHER a statutory reporting money threshold
 * (FBAR / 8938 / LRS / state-source income) is crossed, OR tax residency is
 * established (day-count ≥ the residency test). Residency alone creates exposure.
 * ==========================================================================*/

export const STATUS = { EXPOSED: "exposed", APPROACHING: "approaching", NEXUS: "nexus", NONE: "none" };

export const STATUS_META = {
  exposed:     { label: "Exposed",         color: "#ef4444", soft: "rgba(239,68,68,.14)",  text: "#fca5a5" },
  approaching: { label: "Approaching",     color: "#f59e0b", soft: "rgba(245,158,11,.14)", text: "#fcd34d" },
  nexus:       { label: "Nexus Triggered", color: "#a855f7", soft: "rgba(168,85,247,.16)", text: "#d8b4fe" },
  none:        { label: "Monitored",       color: "#52525b", soft: "rgba(82,82,91,.16)",   text: "#a1a1aa" }
};

// The REPORTING money threshold (FBAR / LRS / 8938 / state-source income) is hit.
export function isReportBreached(r) {
  const g = r.report || {};
  return g.limitUsd ? g.reportedUsd >= g.limitUsd : false;
}
// Tax residency established (day-count ≥ residency test, or already resident).
export function isResidencyBreached(r) {
  const g = r.report || {};
  return !!r.resident || (g.dayThreshold ? g.days >= g.dayThreshold : false);
}
// A jurisdiction is in scope if EITHER dimension is crossed.
export function isBreached(r) {
  return isReportBreached(r) || isResidencyBreached(r);
}

// Classification — same shape as the spec, income-tax meaning:
//   Exposed      = taxable jurisdiction AND threshold/residency crossed → tax accruing.
//   Approaching  = taxable, but neither residency nor reporting threshold hit yet.
//   Nexus        = threshold/residency crossed but NOT taxable → filing owed, $0 tax
//                  (FBAR/8938 informational filings; no-income-tax states / UAE).
export function classify(r) {
  const breached = isBreached(r);
  if (r.taxable && breached) return STATUS.EXPOSED;
  if (r.taxable && !breached) return STATUS.APPROACHING;
  if (!r.taxable && breached) return STATUS.NEXUS;
  return STATUS.NONE;
}

// How close a jurisdiction is to exposure (max of reporting% and residency-day%).
export function approachPct(r) {
  const g = r.report || {};
  const v = g.limitUsd ? g.reportedUsd / g.limitUsd : 0;
  const d = g.dayThreshold ? g.days / g.dayThreshold : 0;
  return Math.max(v, d);
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
  const g = region.report || {};
  const base = {
    kind,
    regionId: region.id,
    region: region.name,
    createdAt: new Date().toISOString(),
    channel: "email"
  };
  if (kind === "approaching_60") {
    const pct = Math.round(approachPct(region) * 100);
    return {
      ...base,
      severity: "warning",
      subject: `⚠️ ${region.name} is at ${pct}% of its residency / reporting threshold`,
      body: `${region.name}: ${g.days}/${g.dayThreshold} days present (${g.test}) and ` +
            `${g.metric} at ${fmtUsd(g.reportedUsd)} / ${fmtUsd(g.limitUsd)}. ` +
            `Plan the day-count / remittances before crossing to avoid worldwide-income exposure.`,
      ...extra
    };
  }
  if (kind === "became_exposed") {
    return {
      ...base,
      severity: "critical",
      subject: `🚨 ${region.name} is now EXPOSED — income-tax liability is accruing`,
      body: `${region.name} crossed its residency / reporting threshold and levies income tax. ` +
            `Estimated liability: ${fmtUsd(region.estimatedLiabilityUsd)} as of ${region.triggerDate || "today"}. ` +
            `File / pay estimated tax and reconcile foreign tax credits.`,
      ...extra
    };
  }
  return base;
}

// Trigger when a taxable jurisdiction passes 60% of residency/reporting threshold.
export function approachingAlerts(regions, threshold = 0.6) {
  return withStatus(regions)
    .filter((r) => r.status === STATUS.APPROACHING && r.pct >= threshold)
    .map((r) => buildAlert(r, "approaching_60"));
}

// Trigger when a jurisdiction newly enters the "exposed" category (state transition).
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

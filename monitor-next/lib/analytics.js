/* ============================================================================
 * UAT analytics — vendor-neutral, privacy-light usage tracking for the
 * User Assessment Testing programme.
 *
 * OFF by default. Enable for a UAT build only:
 *   NEXT_PUBLIC_UAT_ENABLED=1
 * Optionally forward events to a collector you control (a Google Apps Script
 * webhook, PostHog capture URL, your own endpoint, …):
 *   NEXT_PUBLIC_UAT_ANALYTICS_URL=https://…
 *
 * Tag a tester by handing them a link with a participant id:
 *   https://your-uat-url/?uat=priya-01
 * That id is stored and attached to every event, so results tie back to a
 * specific user in the results tracker.
 *
 * With no endpoint set, events still buffer in localStorage — call
 * exportEvents() (or the browser console) to pull them at the end of a session.
 * No third-party scripts, no cookies. Client-only.
 * ==========================================================================*/
"use client";

const ENABLED = process.env.NEXT_PUBLIC_UAT_ENABLED === "1";
const ENDPOINT = process.env.NEXT_PUBLIC_UAT_ANALYTICS_URL || "";
const BUF_KEY = "uat_events";
const SID_KEY = "uat_session_id";
const PID_KEY = "uat_participant_id";
const MAX_BUFFER = 1000;

function store() { try { return window.localStorage; } catch (e) { return null; } }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

// Participant id comes from ?uat=<id> (persisted) so every tester's link tags them.
export function uatParticipant() {
  if (typeof window === "undefined") return null;
  const s = store();
  try {
    const q = new URLSearchParams(window.location.search).get("uat");
    if (q && s) s.setItem(PID_KEY, q);
    return s ? s.getItem(PID_KEY) : q || null;
  } catch (e) { return null; }
}

function sessionId() {
  const s = store();
  if (!s) return uid();
  let v = s.getItem(SID_KEY);
  if (!v) { v = uid(); s.setItem(SID_KEY, v); }
  return v;
}

// Record one event. No-op unless the UAT build flag is on.
export function track(event, props = {}) {
  if (!ENABLED || typeof window === "undefined") return;
  const rec = {
    event, props,
    t: new Date().toISOString(),
    sid: sessionId(),
    pid: uatParticipant(),
    path: (typeof location !== "undefined" ? location.pathname : "")
  };
  const s = store();
  if (s) {
    try {
      const buf = JSON.parse(s.getItem(BUF_KEY) || "[]");
      buf.push(rec);
      s.setItem(BUF_KEY, JSON.stringify(buf.slice(-MAX_BUFFER)));
    } catch (e) { /* quota / parse — ignore */ }
  }
  // eslint-disable-next-line no-console
  console.debug("[uat]", event, props);
  if (ENDPOINT) {
    try {
      const body = JSON.stringify(rec);
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, body);
      else fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    } catch (e) { /* network — ignore, event is still buffered */ }
  }
}

// Pull the locally-buffered events (for manual collection at session end).
export function exportEvents() {
  const s = store();
  if (!s) return [];
  try { return JSON.parse(s.getItem(BUF_KEY) || "[]"); } catch (e) { return []; }
}
export function clearEvents() { const s = store(); if (s) s.removeItem(BUF_KEY); }

// Expose a console helper on the UAT build so a facilitator can dump events.
if (ENABLED && typeof window !== "undefined") {
  window.__uat = { export: exportEvents, clear: clearEvents, participant: uatParticipant };
}

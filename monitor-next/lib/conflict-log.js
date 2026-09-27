// Conflict resolution log for the Monitor's Conflicts & Mismatches panel.
//
// A preparer marks a finding Resolved / Accepted risk / Not applicable with a
// written reason; every action is appended (never edited or deleted) to a
// per-client log, which is the audit trail. A finding's current state is the
// last event for its id, except that a resolution goes stale — and the
// finding shows as open again — when its amount has moved since it was
// resolved (the numbers it was resolved against no longer hold).
//
// Storage is this browser's localStorage (the prototype has no server): the
// log is per client, per browser. Keys start "wising_conflict_", which
// profiles.js's loadProfile() leaves alone when it clears Layer 0/1 state.

export const ACTIONS = {
  resolved: "Resolved",
  accepted_risk: "Accepted risk",
  not_applicable: "Not applicable",
  reopened: "Reopened"
};
export const CLOSING_ACTIONS = ["resolved", "accepted_risk", "not_applicable"];
export const MIN_REASON_CHARS = 10;

const PREFIX = "wising_conflict_log_";
const PREPARER_KEY = "wising_conflict_preparer";

function storage() {
  try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch (e) { return null; }
}

export function logKey(clientKey) { return PREFIX + (clientKey || "default"); }

export function loadLog(clientKey) {
  const s = storage();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(logKey(clientKey)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

// Appends one event and returns the new log. Throws on an invalid event so
// the form can't save a resolution without a reason.
export function appendEvent(clientKey, event, now = new Date()) {
  const e = validateEvent(event);
  const log = loadLog(clientKey).concat([{ ...e, at: now.toISOString() }]);
  const s = storage();
  if (s) { try { s.setItem(logKey(clientKey), JSON.stringify(log)); } catch (err) { /* storage full / blocked */ } }
  return log;
}

export function validateEvent(event) {
  if (!event || !event.findingId) throw new Error("findingId required");
  if (!ACTIONS[event.action]) throw new Error("unknown action");
  const reason = String(event.reason || "").trim();
  if (reason.length < MIN_REASON_CHARS) throw new Error(`reason must be at least ${MIN_REASON_CHARS} characters`);
  const by = String(event.by || "").trim();
  if (!by) throw new Error("name required");
  return {
    findingId: event.findingId, action: event.action, reason, by,
    title: event.title || null,
    amountUsd: typeof event.amountUsd === "number" ? event.amountUsd : 0
  };
}

// An amount counts as changed when it moved by more than $1 and 1%.
export function amountChanged(then, now) {
  const a = then || 0, b = now || 0;
  const diff = Math.abs(a - b);
  return diff > 1 && diff > 0.01 * Math.max(Math.abs(a), Math.abs(b));
}

// Current state of one finding given the log:
//   { state: "open" }                                  never actioned / reopened by hand
//   { state: "closed", event }                         resolved and still valid
//   { state: "stale", event }                          resolved, but the amount has moved since
export function statusOf(log, finding) {
  let last = null;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].findingId === finding.id) { last = log[i]; break; }
  }
  if (!last || last.action === "reopened") return { state: "open", event: last };
  if (amountChanged(last.amountUsd, finding.amountUsd)) return { state: "stale", event: last };
  return { state: "closed", event: last };
}

// Splits findings into the ones still needing attention (open + stale) and
// the ones closed by a still-valid resolution.
export function partition(log, findings) {
  const open = [], closed = [];
  (findings || []).forEach((f) => {
    const st = statusOf(log, f);
    (st.state === "closed" ? closed : open).push({ finding: f, status: st });
  });
  return { open, closed };
}

export function loadPreparer() {
  const s = storage();
  try { return (s && s.getItem(PREPARER_KEY)) || ""; } catch (e) { return ""; }
}
export function savePreparer(name) {
  const s = storage();
  try { if (s) s.setItem(PREPARER_KEY, String(name || "").trim()); } catch (e) { /* ignore */ }
}

"use client";

import { create } from "zustand";
import { createDefaultUsState } from "./schema";

// Mirrors prototypes/graph-pilot/constants.js's ClientRegistry.storageKeyFor
// ('US') exactly: plain "wising_us_state" normally, or
// "wising_client_<id>_us" when a ?client=<id> query param is present. This
// keeps the multi-client isolation feature working identically, and — more
// importantly — writes to the exact key lib/dag-adapter.js's readRaw()
// already reads, so the existing DAG compute paths need zero changes to
// pick up state saved from this React form.
function storageKey() {
  if (typeof window === "undefined") return "wising_us_state";
  try {
    const id = new URLSearchParams(window.location.search).get("client");
    return id ? `wising_client_${id}_us` : "wising_us_state";
  } catch {
    return "wising_us_state";
  }
}

function loadFromStorage() {
  if (typeof window === "undefined") return createDefaultUsState();
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return createDefaultUsState();
    const parsed = JSON.parse(raw);
    // Shallow-merge onto defaults per top-level section so a saved state
    // from an older schema version doesn't crash on a since-added field.
    const defaults = createDefaultUsState();
    const merged = { ...defaults };
    for (const key of Object.keys(defaults)) {
      merged[key] =
        parsed[key] && typeof parsed[key] === "object" && !Array.isArray(parsed[key]) && !Array.isArray(defaults[key])
          ? { ...defaults[key], ...parsed[key] }
          : key in parsed
            ? parsed[key]
            : defaults[key];
    }
    return merged;
  } catch {
    return createDefaultUsState();
  }
}

function persist(data) {
  if (typeof window === "undefined") return;
  try {
    data.metadata.last_updated_at = new Date().toISOString();
    window.localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    // localStorage can throw (quota, private mode) — original file's
    // saveStateAndSync() swallows this too; matched here deliberately.
  }
}

function getAtPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function setAtPath(obj, path, value) {
  const keys = path.split(".");
  const next = { ...obj };
  let cursor = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cursor[k] = Array.isArray(cursor[k]) ? [...cursor[k]] : { ...cursor[k] };
    cursor = cursor[k];
  }
  cursor[keys[keys.length - 1]] = value;
  return next;
}

export const useUsLayer1Store = create((set, get) => ({
  usState: typeof window === "undefined" ? createDefaultUsState() : loadFromStorage(),

  // ---- scalar field access -------------------------------------------
  // setField("profile.filing_status", "mfj")
  setField: (path, value) =>
    set((s) => {
      const usState = setAtPath(s.usState, path, value);
      persist(usState);
      return { usState };
    }),
  getField: (path) => getAtPath(get().usState, path),

  // ---- repeatable-row array helpers -----------------------------------
  // addRow("bank_accounts", row) / addRow("income_us_source.self_employment", row)
  addRow: (path, row) =>
    set((s) => {
      const arr = getAtPath(s.usState, path) || [];
      const usState = setAtPath(s.usState, path, [...arr, row]);
      persist(usState);
      return { usState };
    }),
  removeRow: (path, index) =>
    set((s) => {
      const arr = getAtPath(s.usState, path) || [];
      const usState = setAtPath(
        s.usState,
        path,
        arr.filter((_, i) => i !== index)
      );
      persist(usState);
      return { usState };
    }),
  updateRow: (path, index, patch) =>
    set((s) => {
      const arr = getAtPath(s.usState, path) || [];
      const nextArr = arr.map((row, i) => (i === index ? { ...row, ...patch } : row));
      const usState = setAtPath(s.usState, path, nextArr);
      persist(usState);
      return { usState };
    }),

  // ---- bulk replace (hydration / reset) --------------------------------
  replaceAll: (usState) =>
    set(() => {
      persist(usState);
      return { usState };
    }),
  reset: () =>
    set(() => {
      const usState = createDefaultUsState();
      persist(usState);
      return { usState };
    }),
}));

// Onboarding "setup" checkboxes: in the original file these are read
// straight off the DOM (document.getElementById('setup-w2')?.checked) and
// were never part of usState — they're pure wizard-gating UI state, not
// tax data, so they deliberately don't live in the schema/localStorage
// blob feeding the DAG engine either. Kept as a tiny separate store slice
// for the same reason, and mirrored into the XState machine's context via
// SYNC_CONTEXT (see components/layer1-us usage).
export const useOnboardingSetup = create((set) => ({
  setupW2: false,
  setupBiz: false,
  setupProp: false,
  setupRetirement: false,
  setupEquity: false,
  setupPassiveAny: false,
  setupForeignAny: false,
  setFlag: (key, value) => set({ [key]: value }),
}));

"use client";

import { create } from "zustand";
import { createDefaultUsState } from "./schema";
import { applyDerivations } from "./derive";

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
    return applyDerivations(merged);
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

// ARCHITECTURE: every mutator below runs applyDerivations() on the result
// before persisting/returning — this is the fix for derived fields (most
// importantly us_residency_detail.final_us_residency_status) only being
// correct while one particular step's component happened to be mounted.
// The original layer1_us.html calls evaluateUSResidencyLock() from every
// relevant field handler regardless of which panel is visible
// (recalculateDerivedFields()-style "always runs"); doing it here, once, in
// the one place every field write already passes through, reproduces that
// exactly — and means the XState machine's guards (machine.js) and any
// component (RightPanel, sidebar lock badges, etc.) can read
// usState.us_residency_detail.final_us_residency_status directly at any
// time and get a value that's never more than one mutation stale.
function finalize(usState) {
  const derived = applyDerivations(usState);
  persist(derived);
  return derived;
}

export const useUsLayer1Store = create((set, get) => ({
  usState: typeof window === "undefined" ? createDefaultUsState() : loadFromStorage(),

  // ---- scalar field access -------------------------------------------
  // setField("profile.filing_status", "mfj")
  setField: (path, value) =>
    set((s) => ({ usState: finalize(setAtPath(s.usState, path, value)) })),
  getField: (path) => getAtPath(get().usState, path),

  // ---- repeatable-row array helpers -----------------------------------
  // addRow("bank_accounts", row) / addRow("income_us_source.self_employment", row)
  addRow: (path, row) =>
    set((s) => {
      const arr = getAtPath(s.usState, path) || [];
      return { usState: finalize(setAtPath(s.usState, path, [...arr, row])) };
    }),
  removeRow: (path, index) =>
    set((s) => {
      const arr = getAtPath(s.usState, path) || [];
      return {
        usState: finalize(setAtPath(s.usState, path, arr.filter((_, i) => i !== index))),
      };
    }),
  updateRow: (path, index, patch) =>
    set((s) => {
      const arr = getAtPath(s.usState, path) || [];
      const nextArr = arr.map((row, i) => (i === index ? { ...row, ...patch } : row));
      return { usState: finalize(setAtPath(s.usState, path, nextArr)) };
    }),

  // ---- bulk replace (hydration / reset) --------------------------------
  replaceAll: (usState) => set(() => ({ usState: finalize(usState) })),
  reset: () => set(() => ({ usState: finalize(createDefaultUsState()) })),
}));

// Onboarding "setup" checkboxes: in the original file these are read
// straight off the DOM (document.getElementById('setup-w2')?.checked) and
// were never part of usState — they're pure wizard-gating UI state, not
// tax data, so they deliberately don't live in the schema/localStorage
// blob feeding the DAG engine either.
//
// ARCHITECTURE FIX: an earlier pass mirrored this into the XState machine's
// context via a useEffect keyed on a manually-maintained dependency array —
// a real staleness risk (miss one field in the array and the guard silently
// uses an outdated value). machine.js's guards now call
// useOnboardingSetup.getState() directly (zustand's vanilla API works
// outside React, so this needs no hook/effect/subscription) — there is no
// copy to keep in sync anymore.
export const useOnboardingSetup = create((set) => ({
  setupW2: false,
  setupBiz: false,
  setupProp: false,
  setupRetirement: false,
  setupEquity: false,
  setupPassiveAny: false,
  setupForeignAny: false,
  // Nested sub-checkboxes under the "International" and "Investments"
  // setup cards (layer1_us.html:844-968). BUG FIX: these used to be local
  // useState inside OnboardingStep.jsx only — invisible to the sidebar and
  // to machine.js, so the per-step visibility rules ported from
  // updateSidebarVisibility()'s toggleBtn() calls (layer1_us.html:6287-6314)
  // had no real state to read. Lifted into this shared store so they're
  // reachable the same way the 7 top-level flags already are.
  setupForeignAssets: false,
  setupForeignFeie: false,
  setupForeignEntities: false,
  setupForeignGifts: false,
  setupPassiveIntDiv: false,
  setupPassiveCapGains: false,
  setFlag: (key, value) => set({ [key]: value }),
}));

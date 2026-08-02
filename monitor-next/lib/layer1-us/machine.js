import { createMachine, assign } from "xstate";
import { useUsLayer1Store, useOnboardingSetup } from "./store";

// Ported from layer1_us.html's isStepLocked() (layer1_us.html:6473-6530) and
// switchStep() (layer1_us.html:6434-6463). The original wizard is NOT a
// linear step-index flow — every step is reachable via direct sidebar jump,
// gated by a lock predicate computed from prior answers (entity type,
// onboarding "setup" checkboxes, and residency status). That predicate is
// the real state-machine logic already in the codebase; this file just
// gives it a home as XState guards instead of an ad-hoc DOM-reading
// function, and drops the vestigial 'step-k1' branch (dead reference in the
// source — no matching panel/button exists anywhere in layer1_us.html).
//
// ARCHITECTURE FIX: an earlier pass kept a COPY of entityType/residencyStatus
// /setup flags inside the machine's own context, refreshed via a
// page.jsx useEffect keyed on a hand-maintained dependency array —
// SYNC_CONTEXT below. That's a real staleness/lag risk: miss one field in
// the array, or let a render land between a store mutation and the sync
// effect firing, and isStepLocked() silently evaluates against a
// stale value. Since zustand stores expose a vanilla getState() that works
// outside React (no hook, no subscription needed), guards now call
// getLockContext() to read BOTH stores fresh at the exact moment a GOTO is
// evaluated — there is no copy to fall out of sync. usState.us_residency_
// detail.final_us_residency_status is itself always current too, because
// store.js now runs applyDerivations() (lib/layer1-us/derive.js) after
// every single mutation, not just while ProfileStep happens to be mounted.

export function isStepLocked(ctx, stepName) {
  const lock = ctx.residencyStatus || "UNKNOWN";
  const taxType = ctx.entityType || "individual";
  const effectiveType = taxType === "llc" ? ctx.llcElection || "individual" : taxType;
  const isCorpOrPartnership = ["ccorp", "scorp", "partnership"].includes(effectiveType);

  const {
    setupW2 = false,
    setupBiz = false,
    setupProp = false,
    setupRetirement = false,
    setupEquity = false,
    setupPassiveAny = false,
    setupForeignAny = false,
  } = ctx.setup || {};

  if (isCorpOrPartnership) {
    if (["step-income-us", "step-retirement", "step-real-estate", "step-equity"].includes(stepName)) return true;
    if (stepName === "step-business") return !setupBiz;
    if (stepName === "step-passive") return !setupPassiveAny;
    if (stepName === "step-capgains") return !(setupPassiveAny || setupEquity);
    if (stepName === "step-entities") return !setupForeignAny;
    return false;
  }

  if (stepName === "step-income-us" && !setupW2) return true;
  if (stepName === "step-business" && !setupBiz) return true;
  if (stepName === "step-passive" && !setupPassiveAny) return true;
  if (stepName === "step-capgains" && !(setupPassiveAny || setupEquity)) return true;
  if (stepName === "step-real-estate" && !setupProp) return true;
  if (stepName === "step-entities" && !setupForeignAny) return true;
  if (stepName === "step-income-foreign") {
    if (!setupForeignAny) return true;
    return !["US_CITIZEN", "RESIDENT_ALIEN", "DUAL_STATUS"].includes(lock);
  }
  if (stepName === "step-feie") {
    const hasGreenCard = ctx.hasGreenCard === true;
    if (lock !== "US_CITIZEN" && !hasGreenCard) return true;
    if (!(setupForeignAny && (setupW2 || setupBiz))) return true;
    return false;
  }
  if (stepName === "step-banks" && !setupForeignAny) return true;
  if (stepName === "step-gifts" && !setupForeignAny) return true;
  if (stepName === "step-retirement" && !setupRetirement) return true;
  if (stepName === "step-equity" && !setupEquity) return true;
  if (stepName === "step-nra") return lock !== "NON_RESIDENT_ALIEN";

  return false;
}

// Reads both stores' CURRENT state (not a synced copy) and normalizes it
// into the shape isStepLocked() expects. Call this fresh anywhere a lock
// decision is needed — guards, the sidebar's lock badges, etc.
export function getLockContext() {
  const usState = useUsLayer1Store.getState().usState;
  const setup = useOnboardingSetup.getState();
  return {
    entityType: usState.profile.tax_entity_type,
    llcElection: usState.profile.llc_tax_election,
    residencyStatus: usState.us_residency_detail.final_us_residency_status,
    hasGreenCard: usState.us_residency_detail.has_green_card,
    primaryStateOfResidence: usState.state_residency.primary_state_of_residence,
    setup: {
      setupW2: setup.setupW2,
      setupBiz: setup.setupBiz,
      setupProp: setup.setupProp,
      setupRetirement: setup.setupRetirement,
      setupEquity: setup.setupEquity,
      setupPassiveAny: setup.setupPassiveAny,
      setupForeignAny: setup.setupForeignAny,
      // Nested sub-checkboxes (layer1_us.html:844-968) — control individual
      // step-button visibility within the "International"/"Investments"
      // phase groups, see isStepButtonVisible() below.
      setupForeignAssets: setup.setupForeignAssets,
      setupForeignFeie: setup.setupForeignFeie,
      setupForeignEntities: setup.setupForeignEntities,
      setupForeignGifts: setup.setupForeignGifts,
      setupPassiveIntDiv: setup.setupPassiveIntDiv,
      setupPassiveCapGains: setup.setupPassiveCapGains,
    },
  };
}

// Convenience wrapper most call sites actually want: "is this step locked
// right now" without the two-step getLockContext()+isStepLocked() dance.
export function isStepLockedNow(stepName) {
  return isStepLocked(getLockContext(), stepName);
}

// ── Phase/step VISIBILITY (distinct from LOCKING above). Ported from
// updateSidebarVisibility() (layer1_us.html:6225-6316): isStepLocked()
// governs whether a reachable-looking button can actually be clicked;
// these two functions govern whether the button/phase-group is even
// rendered in the sidebar at all. The source hides whole phase groups via
// `group.style.display = 'none'` (toggleGroup, layer1_us.html:6251-6276)
// and hides individual step buttons within a group via
// `btn.classList.add('hidden')` (toggleBtn, layer1_us.html:6287-6296) — an
// earlier pass of this port only had the lock layer, so every phase/step
// was always visible (just greyed out with a lock icon when locked)
// instead of not appearing at all until relevant.

// isPhaseVisible(gateFlag, ctx): a phase with no gateFlag (Setup, Core
// Profile, Data Integration, Wrap-up & Taxes — layer1_us.html's
// nav-group-setup/core/data/wrapup have no `style="display:none"` and no
// toggleGroup() call at all) is always visible. A gated phase
// (Employment/International/Retirement/Business/RealEstate/Investments/
// Equity) is visible only once its setup card is checked.
export function isPhaseVisible(gateFlag, ctx) {
  if (!gateFlag) return true;
  return !!ctx.setup?.[gateFlag];
}

// isStepButtonVisible(stepId, ctx): only 6 of the 21 numbered steps have
// their own nested visibility gate beyond their phase's — the rest are
// visible whenever their phase is. Ported from the toggleBtn() call list
// (layer1_us.html:6298-6314).
export function isStepButtonVisible(stepId, ctx) {
  const setup = ctx.setup || {};
  if (stepId === "step-feie") {
    // allowFeie (layer1_us.html:6298-6308): the nested "Lived or worked
    // outside the US" checkbox alone, further narrowed to US taxpayers
    // living abroad ONCE a primary state of residence has been recorded —
    // before that's known, the checkbox alone is enough (source's own
    // `if (primaryState) {...} else { allowFeie = setupForeignFEIE }`).
    if (!setup.setupForeignFeie) return false;
    if (!ctx.primaryStateOfResidence) return true;
    const isUsTaxpayer = ["US_CITIZEN", "RESIDENT_ALIEN"].includes(ctx.residencyStatus);
    const isLivingAbroad = ctx.primaryStateOfResidence === "OTHER";
    return isUsTaxpayer && isLivingAbroad;
  }
  if (stepId === "step-banks") return !!setup.setupForeignAssets;
  if (stepId === "step-entities") return !!setup.setupForeignEntities;
  if (stepId === "step-gifts") return !!setup.setupForeignGifts;
  if (stepId === "step-passive") return !!setup.setupPassiveIntDiv;
  if (stepId === "step-capgains") return !!setup.setupPassiveCapGains;
  // BUG FIX (found by the step-by-step map audit): a DIFFERENT function,
  // updateTaxEntityLogic() (layer1_us.html:7071-7138 — not the toggleBtn()
  // list this docstring otherwise cites), hides the NRA sidebar button
  // entirely for corp/partnership/trust filers: `btnNra.style.display =
  // isIndividual ? 'flex' : 'none'` (layer1_us.html:7138), where
  // `isIndividual = ['individual','sole_prop','farming'].includes(type)`
  // (layer1_us.html:7086) — this is NOT the same as isStepLocked's own
  // NRA-status lock check just above, it's a second, independent
  // entity-type-driven visibility gate. Previously missing here, so the
  // NRA button stayed visible (though usually locked) for every entity
  // type. Fixed to match exactly.
  if (stepId === "step-nra") {
    const effective = ctx.entityType === "llc" ? ctx.llcElection || "individual" : ctx.entityType || "individual";
    return ["individual", "sole_prop", "farming"].includes(effective);
  }
  return true;
}

export const wizardMachine = createMachine(
  {
    id: "layer1UsWizard",
    context: {
      // Only genuinely machine-owned state lives here — which step is
      // active, and whether the onboarding confirmation has fired. Entity
      // type/residency/setup flags are NOT duplicated into context; guards
      // read them live via getLockContext() instead (see above).
      activeStep: "step-onboarding",
      intakeCompleted: false,
    },
    on: {
      GOTO: {
        guard: "canEnterStep",
        actions: "assignActiveStep",
      },
      CONFIRM_INTAKE: {
        // Mirrors confirmIntakeAndProceed() (layer1_us.html:6477-6482):
        // unconditionally allowed, always lands on step-state.
        actions: ["markIntakeCompleted", "setIntakeCompletedField", "assignStepState"],
      },
    },
  },
  {
    guards: {
      canEnterStep: ({ event }) =>
        event.step === "step-onboarding" || !isStepLocked(getLockContext(), event.step),
    },
    actions: {
      assignActiveStep: assign({
        activeStep: ({ event }) => event.step,
      }),
      markIntakeCompleted: assign({ intakeCompleted: true }),
      // BUG FIX: confirmIntakeAndProceed() (layer1_us.html:6477-6482) sets
      // usState.metadata.intake_completed = true as its FIRST line, before
      // navigating — this machine's own `intakeCompleted` context flag
      // (above) is a separate, XState-internal value that never wrote back
      // to the shared usState/schema field, so `metadata.intake_completed`
      // stayed permanently false regardless of how far a user got.
      setIntakeCompletedField: () => {
        useUsLayer1Store.getState().setField("metadata.intake_completed", true);
      },
      assignStepState: assign({ activeStep: "step-state" }),
    },
  }
);

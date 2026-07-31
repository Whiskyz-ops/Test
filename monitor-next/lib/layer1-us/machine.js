import { createMachine, assign } from "xstate";

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
// Deliberately NOT modeling all ~900 form fields inside this machine's
// context — that's the store's (lib/layer1-us/store.js) job. This machine
// only tracks the small slice isStepLocked() actually reads: entity type,
// the 7 onboarding setup flags, and residency status/green-card.

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

const defaultSetup = {
  setupW2: false,
  setupBiz: false,
  setupProp: false,
  setupRetirement: false,
  setupEquity: false,
  setupPassiveAny: false,
  setupForeignAny: false,
};

export const wizardMachine = createMachine(
  {
    id: "layer1UsWizard",
    context: {
      activeStep: "step-onboarding",
      entityType: "individual",
      llcElection: "individual",
      residencyStatus: "NON_RESIDENT_ALIEN",
      hasGreenCard: false,
      intakeCompleted: false,
      setup: { ...defaultSetup },
    },
    on: {
      GOTO: {
        guard: "canEnterStep",
        actions: "assignActiveStep",
      },
      SYNC_CONTEXT: {
        actions: "mergeSyncedContext",
      },
      CONFIRM_INTAKE: {
        // Mirrors confirmIntakeAndProceed() (layer1_us.html:6465-6470):
        // unconditionally allowed, always lands on step-state.
        actions: ["markIntakeCompleted", "assignStepState"],
      },
    },
  },
  {
    guards: {
      canEnterStep: ({ context, event }) =>
        event.step === "step-onboarding" || !isStepLocked(context, event.step),
    },
    actions: {
      assignActiveStep: assign({
        activeStep: ({ context, event }) => event.step,
      }),
      mergeSyncedContext: assign(({ context, event }) => ({
        ...context,
        ...event.patch,
        setup: { ...context.setup, ...(event.patch?.setup || {}) },
      })),
      markIntakeCompleted: assign({ intakeCompleted: true }),
      assignStepState: assign({ activeStep: "step-state" }),
    },
  }
);

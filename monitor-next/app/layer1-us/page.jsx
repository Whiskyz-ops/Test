"use client";
import { useEffect, useMemo } from "react";
import { useMachine } from "@xstate/react";
import { wizardMachine, isStepLocked } from "@/lib/layer1-us/machine";
import { STEP_IDS, STEP_LABELS } from "@/lib/layer1-us/schema";
import { useUsLayer1Store, useOnboardingSetup } from "@/lib/layer1-us/store";
import Layer1UsSidebar from "@/components/layer1-us/Layer1UsSidebar";

import OnboardingStep from "@/components/layer1-us/steps/OnboardingStep";
import ProfileStep from "@/components/layer1-us/steps/ProfileStep";
import IncomeUsStep from "@/components/layer1-us/steps/IncomeUsStep";
import IncomeForeignStep from "@/components/layer1-us/steps/IncomeForeignStep";
import BusinessStep from "@/components/layer1-us/steps/BusinessStep";
import CapGainsStep from "@/components/layer1-us/steps/CapGainsStep";
import RealEstateStep from "@/components/layer1-us/steps/RealEstateStep";
import PassiveStep from "@/components/layer1-us/steps/PassiveStep";
import RetirementStep from "@/components/layer1-us/steps/RetirementStep";
import EquityStep from "@/components/layer1-us/steps/EquityStep";
import DeductionsStep from "@/components/layer1-us/steps/DeductionsStep";
import FeieStep from "@/components/layer1-us/steps/FeieStep";
import FtcStep from "@/components/layer1-us/steps/FtcStep";
import AmtNiitStep from "@/components/layer1-us/steps/AmtNiitStep";
import NraStep from "@/components/layer1-us/steps/NraStep";
import StateStep from "@/components/layer1-us/steps/StateStep";
import EntitiesStep from "@/components/layer1-us/steps/EntitiesStep";
import GiftsStep from "@/components/layer1-us/steps/GiftsStep";
import WithholdingStep from "@/components/layer1-us/steps/WithholdingStep";
import BanksStep from "@/components/layer1-us/steps/BanksStep";
import BankSyncStep from "@/components/layer1-us/steps/BankSyncStep";
import OutputStep from "@/components/layer1-us/steps/OutputStep";

// STRUCTURALLY COMPLETE, NOT FIELD-PARITY-VERIFIED. See the migration gap
// report (docs/LAYER1_US_REACT_PORT_GAPS.md) before treating this page's
// output as a drop-in replacement for layer1_us.html against the dag_py /
// JS-DAG compute paths — several computed/derived totals here are
// deliberately simplified ports, flagged inline in their own files.
const STEP_COMPONENTS = {
  "step-onboarding": OnboardingStep,
  "step-profile": ProfileStep,
  "step-income-us": IncomeUsStep,
  "step-income-foreign": IncomeForeignStep,
  "step-business": BusinessStep,
  "step-capgains": CapGainsStep,
  "step-real-estate": RealEstateStep,
  "step-passive": PassiveStep,
  "step-retirement": RetirementStep,
  "step-equity": EquityStep,
  "step-deductions": DeductionsStep,
  "step-feie": FeieStep,
  "step-ftc": FtcStep,
  "step-amt-niit": AmtNiitStep,
  "step-nra": NraStep,
  "step-state": StateStep,
  "step-entities": EntitiesStep,
  "step-gifts": GiftsStep,
  "step-withholding": WithholdingStep,
  "step-banks": BanksStep,
  "step-bank-sync": BankSyncStep,
  "step-output": OutputStep,
};

export default function Layer1UsWizardPage() {
  const usState = useUsLayer1Store((s) => s.usState);
  const setup = useOnboardingSetup();
  const [state, send] = useMachine(wizardMachine);

  // Keep the XState machine's small gating-relevant context slice in sync
  // with the real form state, mirroring what isStepLocked() (originally a
  // DOM-reading function, layer1_us.html:6473-6530) needs on every change.
  useEffect(() => {
    send({
      type: "SYNC_CONTEXT",
      patch: {
        entityType: usState.profile.tax_entity_type,
        llcElection: usState.profile.llc_tax_election,
        residencyStatus: usState.us_residency_detail.final_us_residency_status,
        hasGreenCard: usState.us_residency_detail.has_green_card,
        setup: {
          setupW2: setup.setupW2,
          setupBiz: setup.setupBiz,
          setupProp: setup.setupProp,
          setupRetirement: setup.setupRetirement,
          setupEquity: setup.setupEquity,
          setupPassiveAny: setup.setupPassiveAny,
          setupForeignAny: setup.setupForeignAny,
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    usState.profile.tax_entity_type,
    usState.profile.llc_tax_election,
    usState.us_residency_detail.final_us_residency_status,
    usState.us_residency_detail.has_green_card,
    setup.setupW2,
    setup.setupBiz,
    setup.setupProp,
    setup.setupRetirement,
    setup.setupEquity,
    setup.setupPassiveAny,
    setup.setupForeignAny,
  ]);

  const activeStep = state.context.activeStep;
  const ActiveComponent = STEP_COMPONENTS[activeStep] || OnboardingStep;

  const { prevStep, nextStep } = useMemo(() => {
    const idx = STEP_IDS.indexOf(activeStep);
    const reachable = (i) => STEP_IDS[i] && !isStepLocked(state.context, STEP_IDS[i]);
    let prev = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (reachable(i)) {
        prev = STEP_IDS[i];
        break;
      }
    }
    let next = null;
    for (let i = idx + 1; i < STEP_IDS.length; i++) {
      if (reachable(i)) {
        next = STEP_IDS[i];
        break;
      }
    }
    return { prevStep: prev, nextStep: next };
  }, [activeStep, state.context]);

  return (
    <div className="flex bg-ink min-h-screen">
      <Layer1UsSidebar
        activeStep={activeStep}
        machineContext={state.context}
        onNavigate={(step) => send({ type: "GOTO", step })}
      />
      <main className="flex-1 max-w-5xl mx-auto px-6 lg:px-10 py-10 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-muted font-semibold">
            US Layer 1 &middot; {STEP_LABELS[activeStep]}
          </div>
          <div className="text-[10px] text-muted/60 font-mono">
            {STEP_IDS.indexOf(activeStep) + 1} / {STEP_IDS.length}
          </div>
        </div>

        <ActiveComponent />

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
          <button
            type="button"
            disabled={!prevStep}
            onClick={() => prevStep && send({ type: "GOTO", step: prevStep })}
            className={
              "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all " +
              (prevStep ? "text-body hover:text-head hover:bg-white/[0.06]" : "text-white/15 cursor-not-allowed")
            }
          >
            ← Back
          </button>
          {activeStep === "step-onboarding" ? (
            <button
              type="button"
              onClick={() => send({ type: "CONFIRM_INTAKE" })}
              className="px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide text-[#04120f]"
              style={{ background: "linear-gradient(135deg,#34d399 0%,#60a5fa 100%)" }}
            >
              Start Intake →
            </button>
          ) : (
            <button
              type="button"
              disabled={!nextStep}
              onClick={() => nextStep && send({ type: "GOTO", step: nextStep })}
              className={
                "px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all " +
                (nextStep ? "text-[#04120f]" : "text-white/15 cursor-not-allowed bg-white/5")
              }
              style={nextStep ? { background: "linear-gradient(135deg,#34d399 0%,#60a5fa 100%)" } : undefined}
            >
              Continue →
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

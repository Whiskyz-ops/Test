"use client";
import { useState } from "react";
import { PHASES, STEP_LABELS, STEP_NUMBERS } from "@/lib/layer1-us/schema";
import { isStepLocked } from "@/lib/layer1-us/machine";
import WisingLogo from "@/components/WisingLogo";

// BUG FIX (chrome/structure verification pass): the previous version was a
// flat, ungrouped list with invented labels/ordering that didn't match the
// source at all. Real structure ported from layer1_us.html:417-622
// ("LEFT SIDEBAR: STEP PROGRESS") — 11 collapsible "Compliance Steps"
// phase groups (toggleSidebarGroup(), layer1_us.html:425 etc.), each
// containing its real numbered step buttons (updateSidebarBadges()'s
// 🔒/ACTIVE badge pattern, layer1_us.html:6532-6549), plus an unnumbered
// "Generate Output" CTA at the very end of the last phase
// (layer1_us.html:615-617).
export default function Layer1UsSidebar({ activeStep, machineContext, onNavigate }) {
  const [openPhases, setOpenPhases] = useState(() => {
    const init = {};
    for (const phase of PHASES) init[phase.id] = phase.defaultOpen;
    return init;
  });

  const togglePhase = (id) => setOpenPhases((s) => ({ ...s, [id]: !s[id] }));

  return (
    <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-2 h-screen sticky top-0 overflow-y-auto bg-canvas border-r border-inkline text-white z-20">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-inkline">
        <WisingLogo height={22} className="shrink-0" />
        <div className="font-serif font-bold tracking-[0.18em] text-[14px] leading-none text-head">
          US LAYER 1
        </div>
      </div>

      <div className="text-[10px] font-black uppercase tracking-widest text-white/40 px-5 pt-3">
        Compliance Steps
      </div>

      <nav className="flex flex-col px-3 pb-4">
        {PHASES.map((phase) => {
          const open = openPhases[phase.id];
          return (
            <div key={phase.id} className="flex flex-col mb-2">
              <button
                onClick={() => togglePhase(phase.id)}
                className="text-[9px] font-black uppercase tracking-widest text-accent2/70 mb-1 px-2 w-full text-left flex justify-between items-center outline-none cursor-pointer"
              >
                <span>{phase.label}</span>
                <span
                  className={"text-[8px] opacity-50 transition-transform duration-300" + (open ? "" : " -rotate-90")}
                >
                  ▼
                </span>
              </button>
              {open && (
                <div className="flex flex-col space-y-1">
                  {phase.steps.map((id) => (
                    <StepButton
                      key={id}
                      id={id}
                      active={id === activeStep}
                      machineContext={machineContext}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function StepButton({ id, active, machineContext, onNavigate }) {
  const locked = isStepLocked(machineContext, id) && id !== "step-onboarding";
  const number = STEP_NUMBERS[id];
  const isOutputCta = id === "step-output";

  if (isOutputCta) {
    // Matches layer1_us.html:615-617 — unnumbered, styled as a standalone
    // CTA button with a border accent rather than a normal nav row.
    return (
      <button
        disabled={locked}
        onClick={() => !locked && onNavigate(id)}
        className={
          "text-left px-4 py-3 mt-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all border " +
          (active
            ? "text-[#04120f] border-transparent"
            : locked
              ? "text-white/25 border-white/5 cursor-not-allowed"
              : "text-accent2 border-accent2/30 hover:bg-accent2/10")
        }
        style={active ? { background: "linear-gradient(135deg,#34d399 0%,#60a5fa 100%)" } : undefined}
      >
        {STEP_LABELS[id]}
      </button>
    );
  }

  return (
    <button
      disabled={locked}
      onClick={() => !locked && onNavigate(id)}
      className={
        "flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-bold tracking-wide uppercase text-left transition-all " +
        (active
          ? "text-[#04120f]"
          : locked
            ? "text-white/25 cursor-not-allowed"
            : "text-white/70 hover:text-white hover:bg-white/[0.06]")
      }
      style={active ? { background: "linear-gradient(135deg,#34d399 0%,#60a5fa 100%)" } : undefined}
    >
      <span className="flex-1 truncate">
        {number}. {STEP_LABELS[id]}
      </span>
      <span
        className={
          "text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0 " +
          (active
            ? "bg-black/20 text-[#04120f]"
            : locked
              ? "border border-white/10 bg-white/5 text-white/40"
              : "bg-brandGreen/20 border border-brandGreen/40 text-brandGreen font-black")
        }
      >
        {locked ? "🔒" : active ? "●" : "ACTIVE"}
      </span>
    </button>
  );
}

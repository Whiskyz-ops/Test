"use client";
import { STEP_IDS, STEP_LABELS } from "@/lib/layer1-us/schema";
import { isStepLocked } from "@/lib/layer1-us/machine";
import WisingLogo from "@/components/WisingLogo";

// Visual port of layer1_us.html's left sidebar (updateSidebarBadges(),
// layer1_us.html:6532-6549): 🔒 badge for locked steps, ACTIVE badge for
// unlocked ones, direct-jump navigation (not linear) gated by the same
// isStepLocked predicate now living in lib/layer1-us/machine.js.
export default function Layer1UsSidebar({ activeStep, machineContext, onNavigate }) {
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-canvas border-r border-inkline flex flex-col text-white z-20 overflow-y-auto">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-inkline">
        <WisingLogo height={22} className="shrink-0" />
        <div className="font-serif font-bold tracking-[0.18em] text-[14px] leading-none text-head">
          US LAYER 1
        </div>
      </div>
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {STEP_IDS.map((id) => {
          const locked = isStepLocked(machineContext, id) && id !== "step-onboarding";
          const active = id === activeStep;
          return (
            <button
              key={id}
              disabled={locked}
              onClick={() => !locked && onNavigate(id)}
              className={
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold text-left transition-all " +
                (active
                  ? "text-[#04120f]"
                  : locked
                    ? "text-white/25 cursor-not-allowed"
                    : "text-white/60 hover:text-white hover:bg-white/[0.06]")
              }
              style={active ? { background: "linear-gradient(135deg,#34d399 0%,#60a5fa 100%)" } : undefined}
            >
              <span className="flex-1 truncate">{STEP_LABELS[id]}</span>
              <span
                className={
                  "text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0 " +
                  (active
                    ? "bg-black/20 text-[#04120f]"
                    : locked
                      ? "border border-white/10 bg-white/5 text-white/40"
                      : "bg-brandGreen/20 border border-brandGreen/40 text-brandGreen font-black uppercase")
                }
              >
                {locked ? "🔒" : active ? "●" : "OPEN"}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

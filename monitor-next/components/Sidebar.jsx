"use client";

const MAIN = [
  { id: "monitor", label: "Monitor", icon: "📡" },
  { id: "clients", label: "Clients", icon: "👥" },
  { id: "residency", label: "Residency", icon: "🧭" },
  { id: "filings", label: "Filings", icon: "📄" },
  { id: "documents", label: "Documents", icon: "📁" },
  { id: "accounts", label: "Accounts", icon: "🏦" },
  { id: "integrations", label: "Integrations", icon: "🔌" }
];
const FOOTER = ["Personal details", "Account settings", "Knowledge base"];

export default function Sidebar({ active = "monitor", onNavigate, badges = {} }) {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 glass-black border-r border-inkline flex flex-col text-white z-20">
      {/* Logo — teal→emerald signature glyph + serif wordmark */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[#04120f] font-black shadow-[0_0_22px_rgba(45,212,191,0.55)]"
          style={{ background: "linear-gradient(135deg,#2dd4bf 0%,#34d399 100%)" }}>W</div>
        <div>
          <div className="font-serif font-semibold tracking-[0.32em] text-[15px] leading-none text-white">WISING</div>
          <div className="text-[9px] text-white/35 tracking-[0.22em] uppercase mt-1.5">Exposure Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {MAIN.map((l) => {
          const isActive = active === l.id;
          const badge = badges[l.id];
          return (
            <button key={l.id} onClick={() => onNavigate && onNavigate(l.id)}
              className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all " +
                (isActive
                  ? "text-[#04120f] shadow-[0_6px_20px_-4px_rgba(45,212,191,0.55)]"
                  : "text-white/55 hover:text-white hover:bg-white/[0.06]")}
              style={isActive ? { background: "linear-gradient(135deg,#2dd4bf 0%,#34d399 100%)" } : undefined}>
              <span className="text-[15px] w-5 text-center opacity-90">{l.icon}</span>
              <span className="flex-1 text-left">{l.label}</span>
              {badge != null && badge.text !== 0 && badge.text !== "" && (
                <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " +
                  (isActive
                    ? "bg-black/20 text-[#04120f]"
                    : (badge.tone === "alert" ? "bg-exposed/25 text-[#fca5b5]" : "bg-white/10 text-white/60"))}>{badge.text}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-inkline space-y-0.5">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-white/45">
          <span className="w-1.5 h-1.5 rounded-full bg-positive pulse-dot" /> Engine online · syncing Layer 1
        </div>
        {FOOTER.map((l) => (
          <button key={l} className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-white/40 hover:text-white/80 hover:bg-white/[0.05]">{l}</button>
        ))}
        <div className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-inkline">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#04120f] font-black text-xs"
            style={{ background: "linear-gradient(135deg,#2dd4bf,#3b82f6)" }}>PM</div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold truncate text-white/90">Priya Menon</div>
            <div className="text-[10px] text-white/40 truncate">Verité Tax Advisors</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

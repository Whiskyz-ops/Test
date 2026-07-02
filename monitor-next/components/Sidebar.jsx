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
    <aside className="w-60 shrink-0 h-screen sticky top-0 glass-black border-r border-inkline flex flex-col text-white">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-white font-black shadow-[0_0_20px_rgba(109,94,247,0.5)]">W</div>
        <div>
          <div className="font-display font-extrabold tracking-[0.2em] text-[13px] leading-none">WISING</div>
          <div className="text-[9px] text-white/35 tracking-[0.2em] uppercase mt-1">Exposure Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {MAIN.map((l) => {
          const isActive = active === l.id;
          const badge = badges[l.id];
          return (
            <button key={l.id} onClick={() => onNavigate && onNavigate(l.id)}
              className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all " +
                (isActive ? "bg-accent text-white shadow-[0_4px_16px_rgba(109,94,247,0.35)]" : "text-white/60 hover:text-white hover:bg-white/[0.06]")}>
              <span className="text-[15px] w-5 text-center opacity-90">{l.icon}</span>
              <span className="flex-1 text-left">{l.label}</span>
              {badge != null && badge.text !== 0 && badge.text !== "" && (
                <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " +
                  (isActive ? "bg-white/25 text-white" : (badge.tone === "alert" ? "bg-exposed/20 text-[#ff8ea3]" : "bg-white/10 text-white/60"))}>{badge.text}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-inkline space-y-0.5">
        {FOOTER.map((l) => (
          <button key={l} className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-white/40 hover:text-white/80 hover:bg-white/[0.05]">{l}</button>
        ))}
        <div className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-inkline">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-filing flex items-center justify-center text-white font-black text-xs">PM</div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold truncate text-white/90">Priya Menon</div>
            <div className="text-[10px] text-white/40 truncate">Verité Tax Advisors</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

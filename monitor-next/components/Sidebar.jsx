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

const FOOTER = [
  { label: "Personal details", icon: "🪪" },
  { label: "Account settings", icon: "⚙️" },
  { label: "Knowledge base", icon: "📚" }
];

export default function Sidebar({ active = "monitor", onNavigate, badges = {} }) {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-panel border-r border-line flex flex-col">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-line">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brandGold to-brandCyan flex items-center justify-center text-black font-black">W</div>
        <div>
          <div className="font-display font-extrabold tracking-wide leading-none">WISING</div>
          <div className="text-[10px] text-white/40 tracking-widest uppercase mt-0.5">Exposure Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {MAIN.map((l) => {
          const isActive = active === l.id;
          const badge = badges[l.id];
          return (
            <button
              key={l.id}
              onClick={() => onNavigate && onNavigate(l.id)}
              className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors " +
                (isActive ? "bg-white/10 text-white" : "text-white/55 hover:text-white hover:bg-white/5")}
            >
              <span className="text-base w-5 text-center">{l.icon}</span>
              <span className="flex-1 text-left">{l.label}</span>
              {badge != null && badge !== 0 && (
                <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " + (badge.tone === "alert" ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60")}>{badge.text}</span>
              )}
              {isActive && badge == null && <span className="w-1.5 h-1.5 rounded-full bg-brandCyan" />}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-line space-y-1">
        {FOOTER.map((l) => (
          <button key={l.label} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] text-white/45 hover:text-white hover:bg-white/5">
            <span className="w-5 text-center">{l.icon}</span>
            <span className="text-left">{l.label}</span>
          </button>
        ))}
        <div className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-line">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brandCyan to-brandGold flex items-center justify-center text-black font-black text-xs">PM</div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold truncate">Priya Menon</div>
            <div className="text-[10px] text-white/40 truncate">Verité Tax Advisors</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

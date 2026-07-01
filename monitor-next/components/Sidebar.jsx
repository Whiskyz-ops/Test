const MAIN = [
  { label: "Monitor", icon: "📡", active: true },
  { label: "Clients", icon: "👥" },
  { label: "Residency", icon: "🧭" },
  { label: "Filings", icon: "📄" },
  { label: "Documents", icon: "📁" },
  { label: "Accounts", icon: "🏦" },
  { label: "Integrations", icon: "🔌" }
];

const FOOTER = [
  { label: "Personal details", icon: "🪪" },
  { label: "Account settings", icon: "⚙️" },
  { label: "Knowledge base", icon: "📚" }
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-panel border-r border-line flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-line">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brandGold to-brandCyan flex items-center justify-center text-black font-black">W</div>
        <div>
          <div className="font-display font-extrabold tracking-wide leading-none">WISING</div>
          <div className="text-[10px] text-white/40 tracking-widest uppercase mt-0.5">Exposure Monitor</div>
        </div>
      </div>

      {/* Main links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {MAIN.map((l) => (
          <a
            key={l.label}
            href="#"
            className={
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors " +
              (l.active
                ? "bg-white/10 text-white"
                : "text-white/55 hover:text-white hover:bg-white/5")
            }
          >
            <span className="text-base w-5 text-center">{l.icon}</span>
            {l.label}
            {l.active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brandCyan" />}
          </a>
        ))}
      </nav>

      {/* Footer links */}
      <div className="px-3 py-3 border-t border-line space-y-1">
        {FOOTER.map((l) => (
          <a key={l.label} href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] text-white/45 hover:text-white hover:bg-white/5">
            <span className="w-5 text-center">{l.icon}</span>
            {l.label}
          </a>
        ))}

        {/* User profile card */}
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

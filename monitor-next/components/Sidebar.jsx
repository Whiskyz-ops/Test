"use client";
import { Radar, Users, Compass, FileText, FolderOpen, Wallet, Building2, Landmark, Plug } from "lucide-react";

const MAIN = [
  { id: "monitor", label: "Monitor", icon: Radar },
  { id: "clients", label: "Clients", icon: Users },
  { id: "residency", label: "Residency", icon: Compass },
  { id: "filings", label: "Filings", icon: FileText },
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "holdings", label: "Holdings", icon: Wallet },
  { id: "business", label: "Business", icon: Building2 },
  { id: "accounts", label: "Accounts", icon: Landmark },
  { id: "integrations", label: "Integrations", icon: Plug }
];
const FOOTER = ["Personal details", "Account settings", "Knowledge base"];

export default function Sidebar({ active = "monitor", onNavigate, badges = {} }) {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 glass-black border-r border-inkline flex flex-col text-white z-20">
      {/* Logo — silver-chrome W↗ mark (WISING brand) + Manrope wordmark */}
      <div className="px-5 py-5 flex items-center gap-3">
        <svg width="38" height="32" viewBox="0 0 52 44" fill="none" className="shrink-0">
          <defs>
            <linearGradient id="chrome" x1="4" y1="6" x2="48" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#f6f7f9" />
              <stop offset="0.3" stopColor="#aeb3bd" />
              <stop offset="0.5" stopColor="#f0f1f4" />
              <stop offset="0.72" stopColor="#8f95a1" />
              <stop offset="1" stopColor="#d9dce2" />
            </linearGradient>
          </defs>
          <path d="M6 12 L15 35 L24 20 L31 35 L47 13" stroke="url(#chrome)" strokeWidth="5.2" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M47 13 L47 22" stroke="url(#chrome)" strokeWidth="5.2" strokeLinecap="round" />
          <path d="M47 13 L37.5 13" stroke="url(#chrome)" strokeWidth="5.2" strokeLinecap="round" />
        </svg>
        <div>
          <div className="font-sans font-extrabold tracking-[0.22em] text-[15px] leading-none text-white">WISING</div>
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
                  ? "text-[#04120f] shadow-[0_6px_20px_-4px_rgba(52,211,153,0.55)]"
                  : "text-white/55 hover:text-white hover:bg-white/[0.06]")}
              style={isActive ? { background: "linear-gradient(135deg,#34d399 0%,#60a5fa 100%)" } : undefined}>
              <span className="w-5 flex items-center justify-center opacity-90"><l.icon size={17} strokeWidth={2} /></span>
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
            style={{ background: "linear-gradient(135deg,#34d399,#3b82f6)" }}>PM</div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold truncate text-white/90">Priya Menon</div>
            <div className="text-[10px] text-white/40 truncate">Verité Tax Advisors</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

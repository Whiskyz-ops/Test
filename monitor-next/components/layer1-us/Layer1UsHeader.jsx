"use client";

// Ported from layer1_us.html:361-407 (header, "Workspace Switcher" pill +
// hamburger jurisdiction links). An earlier pass of this port had NO
// India/US toggle anywhere — this was a real, visible missing feature, not
// a cosmetic gap: the source lets a preparer jump between the India and US
// Layer 1 intake forms from every screen. layer1_india.html has no React
// port yet, so this links out to the static file directly (same as the
// source, which is also a plain <a href> between two standalone HTML
// pages, not a client-side route change).
export default function Layer1UsHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-md border-b border-inkline">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-accent2 rounded flex items-center justify-center text-black font-black text-[10px] tracking-wider">
            L1
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-head">US Specialist</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Workspace Switcher — layer1_us.html:389-391 */}
          <div className="flex items-center bg-white/5 border border-line p-0.5 rounded-xl text-[9px] font-black uppercase tracking-widest">
            <a
              href="/layer1_india.html"
              className="px-3 py-1.5 text-white/40 hover:text-amber-300 transition-all rounded-lg"
            >
              India L1
            </a>
            <span className="px-3 py-1.5 bg-accent2 text-black rounded-lg shadow-sm">US L1</span>
          </div>
          <a
            href="/router.html"
            className="hidden md:inline text-[9px] font-black uppercase tracking-widest text-muted hover:text-head transition-all"
          >
            Jurisdiction Router
          </a>
        </div>
      </div>
    </header>
  );
}

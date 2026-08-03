"use client";

import { useState } from "react";

// Ported from layer1_us.html:361-407 (header, "Workspace Switcher" pill +
// hamburger jurisdiction links). An earlier pass of this port had NO
// India/US toggle anywhere — this was a real, visible missing feature, not
// a cosmetic gap: the source lets a preparer jump between the India and US
// Layer 1 intake forms from every screen. layer1_india.html has no React
// port yet, so this links out to the static file directly (same as the
// source, which is also a plain <a href> between two standalone HTML
// pages, not a client-side route change).

// "The Vault" is a stubbed year-round-mobile-companion pitch in the source
// too (layer1_us.html:370/384: both instances are just a browser alert()
// with this exact copy, no real feature behind either) — ported verbatim
// rather than as a dead-looking no-op button, since that's what the
// original actually does.
const VAULT_MESSAGE =
  "The Vault is our year-round mobile companion. Users snap photos of receipts and forward 1099 emails throughout the year. The AI categorizes them in real-time, so when they log into this Layer 1 Intake Hub at year-end, 100% of the data is already prepopulated!";

export default function Layer1UsHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [taxNerdMode, setTaxNerdMode] = useState(false);

  const toggleTaxNerdMode = () => {
    const next = !taxNerdMode;
    setTaxNerdMode(next);
    document.body.classList.toggle("tax-nerd-active", next);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-md border-b border-inkline">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Hamburger jurisdiction menu — layer1_us.html:361-376 */}
          <div
            className="relative"
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="text-white flex flex-col justify-center items-start gap-1 py-2 focus:outline-none"
              aria-label="Jurisdiction menu"
              aria-expanded={menuOpen}
            >
              <span className="w-5 h-[2px] bg-current rounded-full" />
              <span className="w-3.5 h-[2px] bg-current rounded-full" />
              <span className="w-5 h-[2px] bg-current rounded-full" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full w-72 bg-black border border-line rounded-xl shadow-2xl z-50 py-2">
                <div className="flex flex-col text-[11px] font-bold tracking-[0.15em] uppercase text-white/50">
                  <a href="/router.html" className="flex items-center px-6 py-3 hover:bg-white/5 transition-colors">
                    Jurisdiction Router
                  </a>
                  <button
                    type="button"
                    onClick={() => window.alert(VAULT_MESSAGE)}
                    className="flex items-center px-6 py-3 hover:bg-white/5 transition-colors text-white text-left"
                  >
                    The Vault (Year-Round)
                  </button>
                  <div className="h-px bg-line my-2 mx-6" />
                  <a
                    href="/layer1_india.html"
                    className="flex items-center px-6 py-3 hover:bg-white/5 transition-colors text-amber-300/80 hover:text-amber-300"
                  >
                    India Specialist L1
                  </a>
                  <a href="/layer1_us.html" className="flex items-center px-6 py-3 bg-white/[0.06] transition-colors text-accent2">
                    US Specialist L1
                  </a>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-accent2 rounded flex items-center justify-center text-black font-black text-[10px] tracking-wider">
              L1
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-head">US Specialist</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* The Vault header button — layer1_us.html:383-387 */}
          <button
            type="button"
            onClick={() => window.alert(VAULT_MESSAGE)}
            className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-accent2/10 hover:bg-accent2/20 border border-accent2/30 text-accent2 rounded-xl transition-all cursor-pointer"
          >
            <span className="text-sm">📥</span>
            <span className="text-[9px] font-black uppercase tracking-widest">The Vault</span>
          </button>
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
          {/* Tax Nerd Mode toggle — layer1_us.html:394-401/22875-22890 */}
          <div className="hidden lg:flex items-center gap-3 bg-white/5 border border-line px-3 py-1.5 rounded-xl">
            <span className="text-[9px] font-black tracking-widest text-white/60 uppercase">Tax Nerd Mode</span>
            <button
              type="button"
              onClick={toggleTaxNerdMode}
              aria-pressed={taxNerdMode}
              className={
                "relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none " +
                (taxNerdMode ? "bg-[#fb7185]" : "bg-white/10")
              }
            >
              <span className="sr-only">Toggle Tax Nerd Mode</span>
              <span
                className={
                  "inline-block h-3 w-3 rounded-full bg-white transition-transform " +
                  (taxNerdMode ? "translate-x-4" : "translate-x-0.5")
                }
              />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

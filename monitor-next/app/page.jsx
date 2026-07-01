"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import KpiCards from "@/components/KpiCards";
import DetailTable from "@/components/DetailTable";
import { US_STATES, COUNTRIES, SOURCES } from "@/lib/mockData";
import { STATUS, withStatus, computeKpis, statusByMapName, runAlertScan } from "@/lib/logic";
import { monitorSnapshot, hasLiveLayer1 } from "@/lib/wising";

const WorldMap = dynamic(() => import("@/components/WorldMap"), {
  ssr: false, loading: () => <div className="h-[360px] flex items-center justify-center text-white/30 text-sm">Loading world map…</div>
});
const UsStatesMap = dynamic(() => import("@/components/UsStatesMap"), {
  ssr: false, loading: () => <div className="h-[360px] flex items-center justify-center text-white/30 text-sm">Loading US map…</div>
});

function scopeToCountries(countries, scope) {
  if (scope === "India") return countries.filter((c) => c.id === "IN");
  if (scope === "Asia") return countries.filter((c) => c.continent === "Asia");
  if (["Canada", "Europe", "Latin America"].includes(scope)) return [];
  return countries; // All
}

export default function MonitorPage() {
  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState(STATUS.EXPOSED);
  const [mode, setMode] = useState("demo");            // "demo" | "live"
  const [countries, setCountries] = useState(COUNTRIES); // engine-computed India/US (fallback = mock)
  const [engineReady, setEngineReady] = useState(false);

  // Run the shared engine on the client and map its output to region rows.
  const recompute = useCallback((preferred) => {
    const wantLive = preferred === "live" || (preferred == null && hasLiveLayer1());
    const source = wantLive && hasLiveLayer1() ? "live" : "demo";
    const snap = monitorSnapshot(source);
    if (snap && snap.countries && snap.countries.length) {
      setCountries(snap.countries);
      setMode(source);
      setEngineReady(true);
    }
  }, []);

  useEffect(() => { recompute(null); }, [recompute]);

  // Live data wins: re-read when forms are saved (same-origin) or on focus.
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || e.key.indexOf("wising_") === 0) recompute(null);
    };
    const onFocus = () => { if (hasLiveLayer1()) recompute("live"); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); };
  }, [recompute]);

  const isUsDrill = region === "United States";
  const dataset = isUsDrill ? US_STATES : scopeToCountries(countries, region);

  const kpis = useMemo(() => computeKpis(dataset), [dataset]);
  const statusMap = useMemo(() => statusByMapName(dataset), [dataset]);
  const rows = useMemo(() => {
    const s = withStatus(dataset);
    return category === "all" ? s : s.filter((r) => r.status === category);
  }, [dataset, category]);
  const alerts = useMemo(() => runAlertScan(dataset), [dataset]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6">
        <Header region={region} onRegionChange={setRegion} />

        {/* engine + data-source strip */}
        <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-white/45">
          <span className="px-2 py-0.5 rounded-md font-bold" style={{ background: engineReady ? "rgba(16,185,129,.15)" : "rgba(255,255,255,.08)", color: engineReady ? "#34d399" : "#a1a1aa" }}>
            {engineReady ? (mode === "live" ? "LIVE · engine" : "DEMO · engine") : "loading engine…"}
          </span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> {SOURCES.trips.name} · {SOURCES.trips.kind}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> {SOURCES.accounts.name} · {SOURCES.accounts.kind}</span>
          <span className="text-white/30">India + US country rows are computed by the shared engine from Layer 1 · US states are illustrative</span>
        </div>

        {/* source controls + Layer 1 intake links */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button onClick={() => recompute("live")} className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-brandGreen/15 text-brandGreen border border-brandGreen/30 hover:bg-brandGreen/25">↻ Refresh from Layer 1</button>
          <button onClick={() => { setCountries(monitorSnapshot("demo").countries); setMode("demo"); setEngineReady(true); }} className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-brandCyan/15 text-brandCyan border border-brandCyan/30 hover:bg-brandCyan/25">Load demo taxpayer</button>
          <span className="text-white/25 text-[11px] mx-1">Layer 1 intake:</span>
          <a href="/router.html" className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-white/5 border border-line text-white/70 hover:bg-white/10">Router (L0)</a>
          <a href="/layer1_india.html" className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-white/5 border border-line text-brandGold/80 hover:bg-white/10">India L1</a>
          <a href="/layer1_us.html" className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-white/5 border border-line text-brandCyan/80 hover:bg-white/10">US L1</a>
        </div>

        {/* automated alerts */}
        {alerts.length > 0 && (
          <div className="mb-5 rounded-xl border border-approaching/30 bg-approaching/10 p-3">
            <div className="text-[11px] uppercase tracking-widest text-approaching font-bold mb-1">
              {alerts.length} automated alert{alerts.length > 1 ? "s" : ""}
            </div>
            <ul className="space-y-0.5">
              {alerts.slice(0, 4).map((a, i) => <li key={i} className="text-[12px] text-white/70">{a.subject}</li>)}
            </ul>
          </div>
        )}

        {/* map */}
        <section className="rounded-2xl border border-line bg-panel p-4 mb-6">
          {isUsDrill ? (
            <UsStatesMap statusByName={statusMap} onBack={() => setRegion("All")} onSelectState={() => {}} />
          ) : (
            <WorldMap statusByName={statusMap} onSelectCountry={(id) => id === "US" && setRegion("United States")} />
          )}
          {!isUsDrill && (
            <p className="text-[11px] text-white/35 mt-2">Tip: click the United States on the map (or pick it in the dropdown) to drill into state-level residency exposure.</p>
          )}
        </section>

        <div className="mb-6"><KpiCards kpis={kpis} active={category} onSelect={setCategory} /></div>
        <DetailTable category={category} regions={rows} />
      </main>
    </div>
  );
}

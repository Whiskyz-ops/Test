"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import KpiCards from "@/components/KpiCards";
import DetailTable from "@/components/DetailTable";
import { ConflictsPanel, ResidencyView, FilingsView, DocumentsView, AccountsView, ClientsView, IntegrationsView, HoldingsView, BusinessView } from "@/components/Views";
import { US_STATES, COUNTRIES, SOURCES } from "@/lib/mockData";
import { STATUS, withStatus, computeKpis, statusByMapName, runAlertScan, PAL } from "@/lib/logic";
import { monitorSnapshot, hasLiveLayer1, listProfiles, loadProfile, activeProfileId, allClientSummaries } from "@/lib/wising";

const WorldMap = dynamic(() => import("@/components/WorldMap"), { ssr: false, loading: () => <div className="h-[360px] flex items-center justify-center text-white/30 text-sm">Loading world map…</div> });
const UsStatesMap = dynamic(() => import("@/components/UsStatesMap"), { ssr: false, loading: () => <div className="h-[360px] flex items-center justify-center text-white/30 text-sm">Loading US map…</div> });

function scopeToCountries(countries, scope) {
  if (scope === "India") return countries.filter((c) => c.id === "IN");
  if (scope === "Asia") return countries.filter((c) => c.continent === "Asia");
  if (["Canada", "Europe", "Latin America"].includes(scope)) return [];
  return countries;
}

export default function MonitorPage() {
  const [view, setView] = useState("monitor");
  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState(STATUS.EXPOSED);
  const [mode, setMode] = useState("demo");
  const [countries, setCountries] = useState(COUNTRIES);
  const [engineReady, setEngineReady] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [clientName, setClientName] = useState(null);
  const [result, setResult] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [clientSummaries, setClientSummaries] = useState([]);

  const recompute = useCallback((preferred) => {
    const wantLive = preferred === "live" || (preferred == null && hasLiveLayer1());
    const source = wantLive && hasLiveLayer1() ? "live" : "demo";
    const snap = monitorSnapshot(source);
    if (snap && snap.countries && snap.countries.length) {
      setCountries(snap.countries); setMode(source); setEngineReady(true); setResult(snap.result);
      if (snap.clientName) setClientName(snap.clientName);
      setActiveProfile(activeProfileId());
    }
  }, []);

  useEffect(() => { setProfiles(listProfiles()); setClientSummaries(allClientSummaries()); recompute(null); }, [recompute]);
  const onPickProfile = useCallback((id) => { if (id && loadProfile(id)) { recompute("live"); } }, [recompute]);

  useEffect(() => {
    const onStorage = (e) => { if (!e.key || e.key.indexOf("wising_") === 0) recompute(null); };
    const onFocus = () => { if (hasLiveLayer1()) recompute("live"); };
    window.addEventListener("storage", onStorage); window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); };
  }, [recompute]);

  const isUsDrill = region === "United States";
  const dataset = isUsDrill ? US_STATES : scopeToCountries(countries, region);
  const kpis = useMemo(() => computeKpis(dataset), [dataset]);
  const statusMap = useMemo(() => statusByMapName(dataset), [dataset]);
  const rows = useMemo(() => { const s = withStatus(dataset); return category === "all" ? s : s.filter((r) => r.status === category); }, [dataset, category]);
  const alerts = useMemo(() => runAlertScan(dataset), [dataset]);

  const badges = {
    monitor: result ? { text: result.summary.counts.critical + result.summary.counts.warning, tone: result.summary.counts.critical > 0 ? "alert" : "" } : null,
    clients: { text: profiles.length },
    documents: result ? { text: result.summary.requiredDocs } : null,
    filings: result && result.summary.nextDeadline ? { text: (result.monitoring && result.monitoring.calendar.next ? "in " + result.monitoring.calendar.next.daysUntil + "d" : "") } : null
  };

  const pickFromClients = (id) => { onPickProfile(id); setView("monitor"); };

  return (
    <div className="relative flex min-h-screen">
      <div className="starfield" />
      <Sidebar active={view} onNavigate={setView} badges={badges} />
      <main className="relative z-10 flex-1 min-w-0 px-8 py-6">
        <Header region={region} onRegionChange={setRegion} clientName={clientName} />

        {/* shared: engine + source strip */}
        <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-muted">
          <span className="px-2 py-0.5 rounded-md font-bold border" style={{ background: engineReady ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)", borderColor: engineReady ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)", color: engineReady ? PAL.greenText : PAL.muted }}>
            {engineReady ? (mode === "live" ? "LIVE · engine" : "DEMO · engine") : "loading engine…"}
          </span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PAL.positive }} /> {SOURCES.trips.name}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PAL.positive }} /> {SOURCES.accounts.name}</span>
          <span className="text-muted/70">India + US computed by the shared engine from Layer 1 · US states illustrative</span>
        </div>

        {/* shared: source + profile controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button onClick={() => recompute("live")} className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-surface border border-line text-body shadow-card hover:border-accent/50">↻ Refresh from Layer 1</button>
          <select onChange={(e) => onPickProfile(e.target.value)} value={activeProfile || ""} title="Load a coherent India+US test taxpayer"
            className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg text-[#04120f] border border-accent cursor-pointer shadow-card"
            style={{ background: "linear-gradient(135deg,#2dd4bf,#34d399)" }}>
            <option value="" className="bg-[#0c0f18] text-head">Load test profile…</option>
            {profiles.map((p) => <option key={p.id} value={p.id} className="bg-[#0c0f18] text-head">{p.label}</option>)}
          </select>
          <span className="text-muted text-[11px] mx-1">Layer 1 intake:</span>
          <a href="router.html" className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-surface border border-line text-body shadow-card hover:border-accent/50">Router</a>
          <a href="layer1_india.html" className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-surface border border-line text-body shadow-card hover:border-accent/50">India L1</a>
          <a href="layer1_us.html" className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-surface border border-line text-body shadow-card hover:border-accent/50">US L1</a>
        </div>

        {/* ============ MONITOR (overview) ============ */}
        {view === "monitor" && (
          <>
            {alerts.length > 0 && (
              <div className="mb-5 rounded-xl border border-approaching/30 bg-approaching/10 p-3">
                <div className="text-[11px] uppercase tracking-widest font-bold mb-1" style={{ color: PAL.amberText }}>{alerts.length} automated alert{alerts.length > 1 ? "s" : ""}</div>
                <ul className="space-y-0.5">{alerts.slice(0, 4).map((a, i) => <li key={i} className="text-[12px] text-body">{a.subject}</li>)}</ul>
              </div>
            )}
            <div className="mb-8">
              {isUsDrill
                ? <UsStatesMap statusByName={statusMap} onBack={() => setRegion("All")} onSelectState={() => {}} />
                : <WorldMap statusByName={statusMap} onSelectCountry={(id) => id === "US" && setRegion("United States")} />}
              {!isUsDrill && <p className="text-[11px] text-muted mt-2 text-center">Tip: click the United States (or use the dropdown) to drill into state-level residency.</p>}
            </div>
            <div className="mb-6"><KpiCards kpis={kpis} active={category} onSelect={setCategory} /></div>
            <DetailTable category={category} regions={rows} />
            {!isUsDrill && result && (
              <section className="mt-8">
                <h3 className="font-display font-bold text-lg text-head mb-4">Conflicts &amp; Mismatches</h3>
                <ConflictsPanel findings={result.findings} />
              </section>
            )}
          </>
        )}

        {view === "clients" && <ClientsView clients={clientSummaries} activeId={activeProfile} onPick={pickFromClients} />}
        {view === "holdings" && <HoldingsView result={result} />}
        {view === "business" && <BusinessView result={result} />}
        {view === "residency" && <ResidencyView result={result} />}
        {view === "filings" && <FilingsView result={result} />}
        {view === "documents" && <DocumentsView result={result} />}
        {view === "accounts" && <AccountsView result={result} />}
        {view === "integrations" && <IntegrationsView />}
      </main>
    </div>
  );
}

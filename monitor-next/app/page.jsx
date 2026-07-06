"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import StatMeter from "@/components/StatMeter";
import CapsuleChart from "@/components/CapsuleChart";
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
  const meters = useMemo(() => deriveMeters(result), [result]);
  const reconRows = result && result.computed && result.computed.reconciliation ? result.computed.reconciliation.rows : [];

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
              <div className="mb-5 rounded-2xl border border-approaching/30 bg-approaching/10 p-3.5">
                <div className="text-[11px] uppercase tracking-widest font-bold mb-1" style={{ color: PAL.amberText }}>{alerts.length} automated alert{alerts.length > 1 ? "s" : ""}</div>
                <ul className="space-y-0.5">{alerts.slice(0, 4).map((a, i) => <li key={i} className="text-[12px] text-body">{a.subject}</li>)}</ul>
              </div>
            )}

            {/* pill-tab status filter */}
            <StatusPills kpis={kpis} active={category} onSelect={setCategory} />

            {/* segmented pill-meter cards — residency budgets & reporting limits */}
            {meters.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {meters.map((m, i) => <StatMeter key={i} {...m} />)}
              </div>
            )}

            {/* full-width exposure map */}
            <div className="mb-8">
              {isUsDrill
                ? <UsStatesMap statusByName={statusMap} onBack={() => setRegion("All")} onSelectState={() => {}} />
                : <WorldMap statusByName={statusMap} onSelectCountry={(id) => id === "US" && setRegion("United States")} />}
              {!isUsDrill && <p className="text-[11px] text-muted mt-2 text-center">Tip: click the United States (or use the dropdown) to drill into state-level residency.</p>}
            </div>

            {/* capsule statistics chart — real cross-basis data */}
            {!isUsDrill && reconRows.length > 0 && (
              <div className="mb-8"><CapsuleChart rows={reconRows} /></div>
            )}

            <DetailTable category={category} regions={rows} />

            {!isUsDrill && result && (
              <section className="mt-8">
                <h3 className="font-display font-bold text-lg text-head mb-4">Conflicts &amp; Mismatches</h3>
                <ConflictsPanel findings={result.findings} />
              </section>
            )}

            {/* resource rail — reference's Community / Academy / Help cards */}
            <ResourceStrip />
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

// Residency day-count budgets + reporting-limit projections → StatMeter cards.
// Every value is engine-derived (model.residency + monitoring.projections).
function deriveMeters(result) {
  if (!result || !result.model) return [];
  const m = result.model, mon = result.monitoring || {};
  // A corporation has no personal "days present" — only individuals get the
  // residency-budget meters; entities lead with their reporting limits.
  const isEntity = !!(result.computed && result.computed.usTax && result.computed.usTax.isEntity);
  const usDays = Math.round(m.residency.us.daysCurrentYear || 0);
  const inDays = Math.round(m.residency.india.daysCurrentYear || 0);
  const res = isEntity ? [] : [
    { icon: "🇺🇸", label: "US days present", value: usDays, limit: 183, unit: "days", pct: usDays / 183,
      status: usDays >= 183 ? "breached" : usDays >= 128 ? "will_breach" : "ok",
      note: "Substantial Presence — ≥183 weighted days makes a US tax resident", highlight: true },
    { icon: "🇮🇳", label: "India days present", value: inDays, limit: 182, unit: "days", pct: inDays / 182,
      status: inDays >= 182 ? "breached" : inDays >= 127 ? "will_breach" : "ok",
      note: "182-day residency test (Income-tax Act s.6)" }
  ];
  const ICON = { fbar: "🏦", form8938: "📄", lrs: "💸", feie: "✈️" };
  const proj = (mon.projections || []).map((p) => ({
    icon: ICON[p.id] || "📊", label: p.label, value: p.current, limit: p.limit, unit: "$",
    pct: p.pct, status: p.status === "breached" ? "breached" : p.status === "will_breach" ? "will_breach" : "ok",
    note: p.note || p.dateLabel
  }));
  // residency budgets first, then the highest-utilisation reporting limits.
  proj.sort((a, b) => (b.pct || 0) - (a.pct || 0));
  return res.concat(proj.slice(0, isEntity ? 4 : 2));
}

// Pill-tab status filter (reference's Organization / Teams pill bar).
function StatusPills({ kpis, active, onSelect }) {
  const items = [
    { key: "all", label: "All jurisdictions", count: kpis.all, color: PAL.accent },
    { key: STATUS.EXPOSED, label: "Exposed", count: kpis.exposed, color: PAL.exposed },
    { key: STATUS.APPROACHING, label: "Approaching", count: kpis.approaching, color: PAL.approaching },
    { key: STATUS.NEXUS, label: "Filing-only", count: kpis.nexus, color: PAL.filing }
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {items.map((it) => {
        const on = active === it.key;
        return (
          <button key={it.key} onClick={() => onSelect(it.key)}
            className={"inline-flex items-center gap-2 pl-3.5 pr-2.5 py-2 rounded-full text-[12.5px] font-semibold transition-all border " +
              (on ? "text-[#04120f] border-transparent shadow-[0_6px_18px_-6px_rgba(45,212,191,0.6)]" : "text-body bg-surface border-line hover:border-white/20")}
            style={on ? { background: "linear-gradient(135deg,#2dd4bf,#34d399)" } : undefined}>
            <span className="w-2 h-2 rounded-full" style={{ background: it.color, boxShadow: `0 0 8px ${it.color}` }} />
            {it.label}
            <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " + (on ? "bg-black/20 text-[#04120f]" : "bg-white/10 text-muted")}>{it.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// Resource cards — wired to the real Layer 1 intake pages + generated docs.
const RESOURCES = [
  { icon: "🧭", title: "Router — start intake", sub: "Triage a new client into the right Layer 1", href: "router.html" },
  { icon: "🇮🇳", title: "India Layer 1", sub: "Residency, income by head, assets & LRS", href: "layer1_india.html" },
  { icon: "🇺🇸", title: "US Layer 1", sub: "Filing status, W-2/Sch C, FBAR/8938 & FEIE", href: "layer1_us.html" },
  { icon: "📚", title: "Docs & coverage", sub: "Field coverage, architecture & handoff", href: "docs.html" }
];
function ResourceStrip() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
      {RESOURCES.map((r) => (
        <a key={r.title} href={r.href} className="block text-left rounded-[22px] p-4 bg-surface border border-line shadow-card hover:border-accent/40 hover:-translate-y-0.5 transition-all group">
          <div className="flex items-start justify-between">
            <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-[15px] border" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" }}>{r.icon}</span>
            <span className="text-muted group-hover:text-accent transition-colors text-sm">↗</span>
          </div>
          <div className="text-[13px] font-bold text-head mt-3">{r.title}</div>
          <div className="text-[11px] text-muted mt-0.5 leading-snug">{r.sub}</div>
        </a>
      ))}
    </div>
  );
}

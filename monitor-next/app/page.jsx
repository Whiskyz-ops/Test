"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Landmark, FileText, Send, Plane, BarChart3 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import StatMeter from "@/components/StatMeter";
import KpiCards from "@/components/KpiCards";
import DetailTable from "@/components/DetailTable";
import { ConflictsPanel, ResidencyView, FilingsView, DocumentsView, AccountsView, ClientsView, IntegrationsView, HoldingsView, BusinessView } from "@/components/Views";
import { US_STATES, COUNTRIES } from "@/lib/mockData";
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
  const [baseYear, setBaseYear] = useState(null);
  const [result, setResult] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [clientSummaries, setClientSummaries] = useState([]);
  const [holdingsHighlight, setHoldingsHighlight] = useState(null);

  const goToHoldings = useCallback((section) => { setView("holdings"); setHoldingsHighlight(section); }, []);

  const recompute = useCallback((preferred) => {
    const wantLive = preferred === "live" || (preferred == null && hasLiveLayer1());
    const source = wantLive && hasLiveLayer1() ? "live" : "demo";
    const snap = monitorSnapshot(source);
    if (snap && snap.countries && snap.countries.length) {
      setCountries(snap.countries); setMode(source); setEngineReady(true); setResult(snap.result);
      if (snap.clientName) setClientName(snap.clientName);
      if (snap.baseYear) setBaseYear(snap.baseYear);
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
        <Header region={region} onRegionChange={setRegion} clientName={clientName} baseYear={baseYear} />

        {/* single, compact utility bar — status + actions */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 pb-4 border-b border-line text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: engineReady ? PAL.greenText : PAL.muted }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: engineReady ? PAL.positive : PAL.muted, boxShadow: engineReady ? `0 0 6px ${PAL.positive}` : "none" }} />
            {engineReady ? (mode === "live" ? "Live" : "Demo") : "Loading…"}
          </span>
          <button onClick={() => recompute("live")} className="font-semibold text-body hover:text-head transition-colors">↻ Refresh</button>
          <div className="relative">
            <select onChange={(e) => onPickProfile(e.target.value)} value={activeProfile || ""} title="Load a coherent India+US test taxpayer"
              className="appearance-none pl-2.5 pr-7 py-1 text-[12px] font-semibold rounded-lg text-[#04120f] cursor-pointer"
              style={{ background: "linear-gradient(135deg,#34d399,#60a5fa)" }}>
              <option value="" className="bg-[#161616] text-head">Load test profile…</option>
              {profiles.map((p) => <option key={p.id} value={p.id} className="bg-[#161616] text-head">{p.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#04120f]/60 text-[9px]">▾</span>
          </div>
          <span className="ml-auto flex items-center gap-3 text-body">
            <span className="text-muted">Layer 1:</span>
            <a href="router.html" className="font-semibold hover:text-accent transition-colors">Router</a>
            <a href="layer1_india.html" className="font-semibold hover:text-accent transition-colors">India</a>
            <a href="layer1_us.html" className="font-semibold hover:text-accent transition-colors">US</a>
          </span>
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

            {/* full-width exposure map */}
            <div className="mb-8">
              {isUsDrill
                ? <UsStatesMap statusByName={statusMap} onBack={() => setRegion("All")} onSelectState={() => {}} />
                : <WorldMap statusByName={statusMap} onSelectCountry={(id) => id === "US" && setRegion("United States")} />}
              {!isUsDrill && <p className="text-[11px] text-muted mt-2 text-center">Tip: click the United States (or use the dropdown) to drill into state-level residency.</p>}
            </div>

            {/* KPI cards — status filter, right above the region table */}
            <div className="mb-6"><KpiCards kpis={kpis} active={category} onSelect={setCategory} /></div>

            <DetailTable category={category} regions={rows} />

            {!isUsDrill && result && (
              <section className="mt-8">
                <h3 className="font-display font-bold text-lg text-head mb-4">Conflicts &amp; Mismatches</h3>
                <ConflictsPanel findings={result.findings} />
              </section>
            )}

            {/* segmented pill-meter cards — residency budgets & reporting limits */}
            {meters.length > 0 && (
              <section className="mt-8">
                <h3 className="font-display font-bold text-lg text-head mb-4">Residency &amp; Reporting Limits</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {meters.map((m, i) => <StatMeter key={i} {...m} />)}
                </div>
              </section>
            )}
          </>
        )}

        {view === "clients" && <ClientsView clients={clientSummaries} activeId={activeProfile} onPick={pickFromClients} />}
        {view === "holdings" && <HoldingsView result={result} highlight={holdingsHighlight} onHighlightDone={() => setHoldingsHighlight(null)} />}
        {view === "business" && <BusinessView result={result} />}
        {view === "residency" && <ResidencyView result={result} />}
        {view === "filings" && <FilingsView result={result} onGoToHoldings={goToHoldings} />}
        {view === "documents" && <DocumentsView result={result} />}
        {view === "accounts" && <AccountsView result={result} />}
        {view === "integrations" && <IntegrationsView />}
      </main>
    </div>
  );
}

// Residency day-count budgets + reporting-limit projections → StatMeter cards.
// Every value is engine-derived (monitoring.residency + monitoring.projections).
// The filled capsules are the real current value; projPct/projLabel carry the
// engine's planning-grade "at current pace" projection (labelled as an estimate).
function deriveMeters(result) {
  if (!result || !result.model) return [];
  const mon = result.monitoring || {};
  // A corporation has no personal "days present" — only individuals get the
  // residency-budget meters; entities lead with their reporting limits.
  const isEntity = !!(result.computed && result.computed.usTax && result.computed.usTax.isEntity);
  const stMap = { resident: "breached", will_flip: "will_breach", safe: "ok" };
  const res = isEntity ? [] : (mon.residency || []).map((c, i) => ({
    icon: c.flag, label: c.country + " days present", value: c.days, limit: c.threshold, unit: "days",
    pct: c.pct, status: stMap[c.status] || "ok",
    projPct: c.threshold ? (c.projectedFullYear || 0) / c.threshold : 0,
    projLabel: c.status === "will_flip" ? c.dateLabel
      : c.status === "safe" ? ("proj. " + (c.projectedFullYear || 0) + " days by year-end at current pace") : null,
    note: c.test, highlight: i === 0
  }));
  const ICON = { fbar: Landmark, form8938: FileText, lrs: Send, feie: Plane };
  const proj = (mon.projections || []).map((p) => {
    const Ic = ICON[p.id] || BarChart3;
    return {
      icon: <Ic size={17} strokeWidth={2} />, label: p.label, value: p.current, limit: p.limit, unit: "$",
      pct: p.pct, status: p.status === "breached" ? "breached" : p.status === "will_breach" ? "will_breach" : "ok",
      projPct: p.projPct, projLabel: p.status === "will_breach" ? p.dateLabel : null,
      note: p.note || p.dateLabel
    };
  });
  // residency budgets first, then the highest-utilisation reporting limits.
  proj.sort((a, b) => (b.pct || 0) - (a.pct || 0));
  return res.concat(proj.slice(0, isEntity ? 4 : 2));
}


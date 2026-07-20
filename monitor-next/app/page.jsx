"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Landmark, FileText, Send, Plane, BarChart3, ArrowLeftRight } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import StatMeter from "@/components/StatMeter";
import KpiCards from "@/components/KpiCards";
import DetailTable from "@/components/DetailTable";
import { ConflictsPanel, ChecksRegistryPanel, ResidencyView, FilingsView, ReconciliationView, AccountsView, ClientsView, IntegrationsView, HoldingsView, BusinessView, WithholdingView, ScopeNotesCard } from "@/components/Views";
import { US_STATES, COUNTRIES } from "@/lib/mockData";
import { STATUS, withStatus, computeKpis, statusByMapName, runAlertScan, PAL } from "@/lib/logic";
import { monitorSnapshot, hasLiveLayer1, listProfiles, loadProfile, activeProfileId, allClientSummaries } from "@/lib/wising";
import { monitorSnapshotDag } from "@/lib/dag-adapter";
import { runShadow, getShadowLog, clearShadowLog } from "@/lib/shadow";
import ShadowBadge from "@/components/ShadowBadge";
import WhatIfBar from "@/components/WhatIfBar";

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
  const [reconHighlight, setReconHighlight] = useState(null);
  // DAG-vs-engine comparison toggle (docs/DAG_MIGRATION_TRACKER.md, 40/40
  // rows ported, run-fuzz.js clean at CI scale with a 2-item allowlist —
  // both text-wording-only, no known value/logic divergence) — DAG is now
  // the default compute source; ?engine=engine or the header pill falls
  // back to the original hand-written engine live, same countries/result
  // shape either way (monitorSnapshotDag mirrors monitorSnapshot exactly —
  // see lib/dag-adapter.js). The pill stays so a fallback is always one
  // click away, not a code change.
  //
  // Always initialize to "dag", matching the server's render exactly (no
  // window there either) — see the ?engine=dag hydration-mismatch bug this
  // same pattern fixed on the OTHER side, 20 Jul 2026: reading
  // window.location in the lazy useState initializer produces a different
  // value on the server's render vs the client's first (hydrating) one
  // whenever the URL carries a query param that flips it, which React logs
  // as a hydration error. Reading the query param in an effect instead
  // means the FIRST client render matches the server unconditionally;
  // recompute's own effect below re-fires automatically once this flips,
  // since recompute is a useCallback keyed on engineSource.
  const [engineSource, setEngineSource] = useState("dag");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("engine") === "engine") setEngineSource("engine");
  }, []);
  // Shadow mode: on every recompute, run the OTHER compute path silently and
  // deep-compare the whole product surface (lib/shadow.js). On by default;
  // ?shadow=0 disables it (e.g. to isolate primary-path perf). Runs
  // regardless of which side is primary (engineSource) — it always compares
  // the real engine against the DAG, so it stays meaningful whichever one
  // the toggle currently shows.
  const [shadowOn] = useState(() =>
    typeof window === "undefined" || new URLSearchParams(window.location.search).get("shadow") !== "0");
  const [shadowRun, setShadowRun] = useState(null);
  const [shadowLog, setShadowLog] = useState(null);

  // What-if tool: regime/FX/FEIE overrides, DAG-only (no plumbing exists in
  // the legacy engine — see WhatIfBar.jsx's header comment). null/undefined
  // means "no override, use whatever the loaded profile/live data says";
  // shadow mode never sees these (runShadow always compares baseline
  // engine-vs-DAG, unaffected by what-if state) so it stays a meaningful
  // parity check regardless of what the what-if bar is set to.
  const [regimeOverride, setRegimeOverride] = useState(null);
  const [fxRateOverride, setFxRateOverride] = useState(null);
  const [feieOverride, setFeieOverride] = useState(null);
  const whatIfActive = regimeOverride !== null || fxRateOverride !== null || feieOverride !== null;

  const goToRecon = useCallback((section) => { setView("reconciliation"); setReconHighlight(section); }, []);

  const recompute = useCallback((preferred) => {
    const wantLive = preferred === "live" || (preferred == null && hasLiveLayer1());
    const source = wantLive && hasLiveLayer1() ? "live" : "demo";
    const overrides = engineSource === "dag" ? {
      regimeOverride: regimeOverride === null ? undefined : regimeOverride,
      fxRateOverride: fxRateOverride === null ? undefined : fxRateOverride,
      feieOverride: feieOverride === null ? undefined : feieOverride
    } : undefined;
    const snap = engineSource === "dag" ? monitorSnapshotDag(source, overrides) : monitorSnapshot(source);
    if (snap && snap.countries && snap.countries.length) {
      setCountries(snap.countries); setMode(source); setEngineReady(true); setResult(snap.result);
      if (snap.clientName) setClientName(snap.clientName);
      if (snap.baseYear) setBaseYear(snap.baseYear);
      setActiveProfile(activeProfileId());
    }
    // Kick the shadow comparison off the render path: the primary result is
    // already committed above, so this deferred tick never delays what the user
    // sees. runShadow runs BOTH engine and DAG (pinned to one "now") and records
    // any divergence — see lib/shadow.js.
    if (shadowOn) {
      const defer = typeof window !== "undefined" && window.requestIdleCallback
        ? window.requestIdleCallback : (fn) => setTimeout(fn, 0);
      defer(() => {
        const rec = runShadow(source);
        if (rec) { setShadowRun(rec); setShadowLog(getShadowLog()); }
      });
    }
  }, [engineSource, shadowOn, regimeOverride, fxRateOverride, feieOverride]);

  useEffect(() => { setProfiles(listProfiles()); setClientSummaries(allClientSummaries()); recompute(null); }, [recompute]);
  const onPickProfile = useCallback((id) => { if (id && loadProfile(id)) { recompute("live"); } }, [recompute]);
  const onWhatIfReset = useCallback(() => { setRegimeOverride(null); setFxRateOverride(null); setFeieOverride(null); }, []);

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
    filings: result && result.summary.nextDeadline ? { text: (result.monitoring && result.monitoring.calendar.next ? "in " + result.monitoring.calendar.next.daysUntil + "d" : "") } : null,
    withholding: result && result.withholding && result.withholding.totalGapUsd > 1
      ? { text: "$" + Math.round(result.withholding.totalGapUsd).toLocaleString("en-US"), tone: "alert" } : null
  };

  const pickFromClients = (id) => { onPickProfile(id); setView("monitor"); };

  return (
    <div className="relative flex min-h-screen">
      <div className="starfield" />
      <Sidebar active={view} onNavigate={setView} badges={badges} />
      <main className="relative z-10 flex-1 min-w-0 px-8 py-6">
        <Header region={region} onRegionChange={setRegion} clientName={clientName} baseYear={baseYear} entity={result ? result.model.entity : null} scope={result ? result.model.meta : null} />

        {/* single, compact utility bar — status + actions */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 pb-4 border-b border-line text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: engineReady ? PAL.greenText : PAL.muted }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: engineReady ? PAL.positive : PAL.muted, boxShadow: engineReady ? `0 0 6px ${PAL.positive}` : "none" }} />
            {engineReady ? (mode === "live" ? "Live" : "Demo") : "Loading…"}
          </span>
          <button onClick={() => recompute("live")} className="font-semibold text-body hover:text-head transition-colors">↻ Refresh</button>
          <button
            onClick={() => setEngineSource((s) => (s === "dag" ? "engine" : "dag"))}
            title="Compute source: the hand-written engine (engine/*.js) or the verified dependency-graph replacement (prototypes/graph-pilot — docs/DAG_MIGRATION_TRACKER.md, 40/40 rows ported). Same result shape either way."
            className="font-semibold px-2 py-0.5 rounded-full border transition-colors"
            style={engineSource === "dag"
              ? { color: PAL.greenText, borderColor: PAL.positive + "55", background: PAL.positive + "18" }
              : { color: PAL.muted, borderColor: "currentColor", opacity: 0.6 }}
          >
            ⚙ {engineSource === "dag" ? "DAG" : "Engine"}
          </button>
          {shadowOn && (
            <ShadowBadge
              run={shadowRun}
              log={shadowLog}
              onClear={() => { const cleared = clearShadowLog(); setShadowLog(cleared); setShadowRun(null); }}
            />
          )}
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
                <ChecksRegistryPanel checks={result.checksRegistry} />
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

            {/* recorded engine boundaries — what these numbers deliberately don't cover */}
            {result && result.scopeNotes && result.scopeNotes.length > 0 && (
              <section className="mt-8">
                <ScopeNotesCard notes={result.scopeNotes} />
              </section>
            )}
          </>
        )}

        {view === "clients" && <ClientsView clients={clientSummaries} activeId={activeProfile} onPick={pickFromClients} />}
        {view === "holdings" && <HoldingsView result={result} />}
        {view === "business" && <BusinessView result={result} />}
        {view === "residency" && <ResidencyView result={result} />}
        {view === "filings" && <FilingsView result={result} />}
        {view === "reconciliation" && (
          <>
            <WhatIfBar
              regime={regimeOverride !== null ? regimeOverride : (result && result.computed.indiaTax.regime) || "NEW"}
              onRegimeChange={setRegimeOverride}
              fxRate={fxRateOverride !== null ? fxRateOverride : (result && result.model.meta.fxRate) || 83}
              onFxRateChange={setFxRateOverride}
              feieClaimed={feieOverride !== null ? feieOverride : !!(result && result.computed.usTax.feie && result.computed.usTax.feie.claimed)}
              onFeieChange={setFeieOverride}
              active={whatIfActive}
              onReset={onWhatIfReset}
              disabled={engineSource !== "dag"}
            />
            <ReconciliationView result={result} highlight={reconHighlight} onHighlightDone={() => setReconHighlight(null)} onJump={goToRecon} />
          </>
        )}
        {view === "withholding" && <WithholdingView result={result} />}
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
  const stMap = { resident: "breached", will_flip: "will_breach", safe: "ok" };
  // Day-count presence tests (US SPT, India s.6(1)) are an INDIVIDUAL-only
  // concept — a company/HUF/firm/trust has its own qualitative test instead
  // (incorporation/POEM, control & management) and monitoring.js already
  // tags each country's entry with which kind applies (kind: "days" vs
  // "qualitative" — engine/monitoring.js's own counter()/qualitative()).
  // Filtering per-COUNTRY on that real signal, not a single US-entity-only
  // proxy: computed.usTax.isEntity is undefined for an India-only entity
  // (an HUF has no US taxpayer type at all), so the old check showed a
  // fabricated "NaN days" bar for it, and would do the same for the INDIA
  // side of a mixed profile (US individual + Indian company) even though
  // the US side is legitimately day-count. Filtering here instead of
  // gating the whole array keeps a genuinely mixed profile's individual
  // country card while dropping only the qualitative one(s).
  const res = (mon.residency || []).filter((c) => c.kind === "days").map((c, i) => ({
    icon: c.flag, label: c.country + " days present", value: c.days, limit: c.threshold, unit: "days",
    pct: c.pct, status: stMap[c.status] || "ok",
    projPct: c.threshold ? (c.projectedFullYear || 0) / c.threshold : 0,
    projLabel: c.status === "will_flip" ? c.dateLabel
      : c.status === "safe" ? ("proj. " + (c.projectedFullYear || 0) + " days by year-end at current pace") : null,
    note: c.test, highlight: i === 0
  }));
  const ICON = { fbar: Landmark, form8938: FileText, lrs: Send, feie: Plane, nro_repatriation: ArrowLeftRight };
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
  // No day-count meters at all (every jurisdiction on file is qualitative)
  // → lead with more reporting-limit cards instead of leaving empty space.
  proj.sort((a, b) => (b.pct || 0) - (a.pct || 0));
  return res.concat(proj.slice(0, res.length === 0 ? 4 : 2));
}


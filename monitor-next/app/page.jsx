"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import KpiCards from "@/components/KpiCards";
import DetailTable from "@/components/DetailTable";

// react-simple-maps is client-only — load without SSR to avoid prerender issues.
const WorldMap = dynamic(() => import("@/components/WorldMap"), {
  ssr: false,
  loading: () => <div className="h-[360px] flex items-center justify-center text-white/30 text-sm">Loading world map…</div>
});
const UsStatesMap = dynamic(() => import("@/components/UsStatesMap"), {
  ssr: false,
  loading: () => <div className="h-[360px] flex items-center justify-center text-white/30 text-sm">Loading US map…</div>
});
import { COUNTRIES, US_STATES, SOURCES } from "@/lib/mockData";
import {
  STATUS, withStatus, computeKpis, statusByMapName, approachingAlerts, runAlertScan
} from "@/lib/logic";

function scopeToCountries(scope) {
  if (scope === "India") return COUNTRIES.filter((c) => c.id === "IN");
  if (scope === "Asia") return COUNTRIES.filter((c) => c.continent === "Asia");
  if (["Canada", "Europe", "Latin America"].includes(scope)) return [];
  return COUNTRIES; // All
}

export default function MonitorPage() {
  const [region, setRegion] = useState("All");     // dropdown scope
  const [category, setCategory] = useState(STATUS.EXPOSED);

  const isUsDrill = region === "United States";
  const dataset = isUsDrill ? US_STATES : scopeToCountries(region);

  const kpis = useMemo(() => computeKpis(dataset), [dataset]);
  const statusMap = useMemo(() => statusByMapName(dataset), [dataset]);
  const rows = useMemo(() => {
    const s = withStatus(dataset);
    return category === "all" ? s : s.filter((r) => r.status === category);
  }, [dataset, category]);

  // Automated alert scan (approaching >60% + any exposed transitions).
  const alerts = useMemo(() => runAlertScan(dataset), [dataset]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-8 py-6">
        <Header region={region} onRegionChange={setRegion} />

        {/* data source strip */}
        <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] text-white/45">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> {SOURCES.billing.name} · {SOURCES.billing.kind}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> {SOURCES.hr.name} · {SOURCES.hr.kind}</span>
          <span className="text-white/30">synced daily · last sync 30 Jun 2026</span>
        </div>

        {/* automated alerts banner */}
        {alerts.length > 0 && (
          <div className="mb-5 rounded-xl border border-approaching/30 bg-approaching/10 p-3">
            <div className="text-[11px] uppercase tracking-widest text-approaching font-bold mb-1">
              {alerts.length} automated alert{alerts.length > 1 ? "s" : ""}
            </div>
            <ul className="space-y-0.5">
              {alerts.slice(0, 4).map((a, i) => (
                <li key={i} className="text-[12px] text-white/70">{a.subject}</li>
              ))}
            </ul>
          </div>
        )}

        {/* map panel */}
        <section className="rounded-2xl border border-line bg-panel p-4 mb-6">
          {isUsDrill ? (
            <UsStatesMap statusByName={statusMap} onBack={() => setRegion("All")} onSelectState={() => {}} />
          ) : (
            <WorldMap statusByName={statusMap} onSelectCountry={(id) => id === "US" && setRegion("United States")} />
          )}
          {!isUsDrill && (
            <p className="text-[11px] text-white/35 mt-2">
              Tip: click the United States on the map (or pick it in the dropdown) to drill into state-level exposure.
            </p>
          )}
        </section>

        {/* KPI cards */}
        <div className="mb-6">
          <KpiCards kpis={kpis} active={category} onSelect={setCategory} />
        </div>

        {/* detail table */}
        <DetailTable category={category} regions={rows} />
      </main>
    </div>
  );
}

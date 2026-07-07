"use client";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import worldTopo from "world-atlas/countries-110m.json";
import { STATUS_META, PAL } from "@/lib/logic";

// world-atlas country names we care about + label anchor coords [lon,lat]
const HAS_DATA = { India: "IN", "United States of America": "US" };
const COORD = { India: [80, 22], "United States of America": [-98, 40] };

// A floating risk tag anchored to a tracked country — echoes the WISING globe.
function RiskTag({ name, status }) {
  const c = COORD[name];
  const m = STATUS_META[status];
  if (!c || !m) return null;
  return (
    <Marker coordinates={c}>
      <circle r={3.2} fill={m.color} stroke="#05070e" strokeWidth={1} style={{ filter: `drop-shadow(0 0 5px ${m.color})` }} />
      <g transform="translate(7,-6)">
        <rect rx={3} ry={3} width={m.label.length * 5.4 + 12} height={15}
          fill={m.color} fillOpacity={0.16} stroke={m.color} strokeOpacity={0.55} strokeWidth={0.6} />
        <text x={6} y={10.5} fontSize={8} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing={0.4} fill={m.text} style={{ textTransform: "uppercase" }}>{m.label}</text>
      </g>
    </Marker>
  );
}

export default function WorldMap({ statusByName, onSelectCountry }) {
  return (
    <div className="w-full">
      <ComposableMap
        projection="geoEquirectangular"
        width={900} height={420}
        projectionConfig={{ scale: 145 }}
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup center={[12, 8]} zoom={1} minZoom={1} maxZoom={4}>
          <Geographies geography={worldTopo}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name;
                const status = statusByName[name];
                const hasData = !!HAS_DATA[name];
                const fill = status ? STATUS_META[status].color : PAL.navy;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => hasData && onSelectCountry && onSelectCountry(HAS_DATA[name])}
                    style={{
                      default: { fill, stroke: "rgba(255,255,255,0.12)", strokeWidth: 0.4, outline: "none", cursor: hasData ? "pointer" : "default", filter: status ? `drop-shadow(0 0 6px ${fill})` : "none" },
                      hover: { fill: hasData ? fill : "#242a44", stroke: "rgba(255,255,255,0.25)", strokeWidth: 0.5, outline: "none", filter: status ? `drop-shadow(0 0 10px ${fill})` : "none" },
                      pressed: { fill, outline: "none" }
                    }}
                  >
                    <title>{name}{status ? ` — ${STATUS_META[status].label}` : ""}</title>
                  </Geography>
                );
              })
            }
          </Geographies>
          {Object.entries(statusByName).map(([name, status]) => HAS_DATA[name] ? <RiskTag key={name} name={name} status={status} /> : null)}
        </ZoomableGroup>
      </ComposableMap>
      <Legend />
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-3 px-1">
      {["exposed", "approaching", "nexus"].map((s) => (
        <div key={s} className="flex items-center gap-2 text-[11px] text-body font-medium">
          <span className="w-3 h-3 rounded-sm" style={{ background: STATUS_META[s].color, boxShadow: `0 0 8px ${STATUS_META[s].color}` }} />
          {STATUS_META[s].label}
        </div>
      ))}
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="w-3 h-3 rounded-sm" style={{ background: PAL.navy }} /> Not tracked
      </div>
    </div>
  );
}

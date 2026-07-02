"use client";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import worldTopo from "world-atlas/countries-110m.json";
import { STATUS_META } from "@/lib/logic";

// world-atlas country names we care about
const HAS_DATA = { India: "IN", "United States of America": "US" };

export default function WorldMap({ statusByName, onSelectCountry }) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 135 }}
        style={{ width: "100%", height: "auto", maxHeight: "380px" }}
      >
        <ZoomableGroup center={[10, 25]} zoom={1} minZoom={1} maxZoom={4}>
          <Geographies geography={worldTopo}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name;
                const status = statusByName[name];
                const hasData = !!HAS_DATA[name];
                const fill = status ? STATUS_META[status].color : "#2b2950";
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => hasData && onSelectCountry && onSelectCountry(HAS_DATA[name])}
                    style={{
                      default: { fill, stroke: "#ffffff", strokeWidth: 0.5, outline: "none", cursor: hasData ? "pointer" : "default" },
                      hover: { fill: hasData ? fill : "#3a3766", stroke: "#ffffff", strokeWidth: 0.6, outline: "none", filter: hasData ? "brightness(1.08)" : "none" },
                      pressed: { fill, outline: "none" }
                    }}
                  >
                    <title>{name}{status ? ` — ${STATUS_META[status].label}` : ""}</title>
                  </Geography>
                );
              })
            }
          </Geographies>
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
          <span className="w-3 h-3 rounded-sm" style={{ background: STATUS_META[s].color }} />
          {STATUS_META[s].label}
        </div>
      ))}
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="w-3 h-3 rounded-sm" style={{ background: "#2b2950" }} /> Not tracked
      </div>
    </div>
  );
}

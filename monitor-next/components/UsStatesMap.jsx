"use client";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import usTopo from "us-atlas/states-10m.json";
import { STATUS_META } from "@/lib/logic";
import { Legend } from "./WorldMap";

export default function UsStatesMap({ statusByName, onBack, onSelectState }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-surface border border-line text-body hover:border-accent/40 shadow-card"
        >
          ← Back to world
        </button>
        <span className="text-[11px] text-muted">United States · state-level exposure</span>
      </div>
      <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 780 }} style={{ width: "100%", height: "auto", maxHeight: "380px" }} className="max-w-2xl mx-auto block">
        <Geographies geography={usTopo}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties.name;
              const status = statusByName[name];
              const fill = status ? STATUS_META[status].color : "#2b2950";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => status && onSelectState && onSelectState(name)}
                  style={{
                    default: { fill, stroke: "#ffffff", strokeWidth: 0.6, outline: "none", cursor: status ? "pointer" : "default" },
                    hover: { fill, stroke: "#ffffff", strokeWidth: 0.7, outline: "none", filter: status ? "brightness(1.08)" : "none" },
                    pressed: { fill, outline: "none" }
                  }}
                >
                  <title>{name}{status ? ` — ${STATUS_META[status].label}` : ""}</title>
                </Geography>
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <Legend />
    </div>
  );
}

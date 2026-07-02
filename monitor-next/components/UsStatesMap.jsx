"use client";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import usTopo from "us-atlas/states-10m.json";
import { STATUS_META, PAL } from "@/lib/logic";
import { Legend } from "./WorldMap";

export default function UsStatesMap({ statusByName, onBack, onSelectState }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-surface border border-line text-body hover:border-accent/50 shadow-card"
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
              const fill = status ? STATUS_META[status].color : PAL.navy;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => status && onSelectState && onSelectState(name)}
                  style={{
                    default: { fill, stroke: "rgba(255,255,255,0.12)", strokeWidth: 0.5, outline: "none", cursor: status ? "pointer" : "default", filter: status ? `drop-shadow(0 0 6px ${fill})` : "none" },
                    hover: { fill, stroke: "rgba(255,255,255,0.28)", strokeWidth: 0.6, outline: "none", filter: status ? `drop-shadow(0 0 10px ${fill})` : "none" },
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

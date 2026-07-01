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
          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-white/5 border border-line text-white/70 hover:bg-white/10"
        >
          ← Back to world
        </button>
        <span className="text-[11px] text-white/40">United States · state-level exposure</span>
      </div>
      <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 780 }} style={{ width: "100%", height: "auto", maxHeight: "380px" }} className="max-w-2xl mx-auto block">
        <Geographies geography={usTopo}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties.name;
              const status = statusByName[name];
              const fill = status ? STATUS_META[status].color : "#1d1d21";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => status && onSelectState && onSelectState(name)}
                  style={{
                    default: { fill, stroke: "#0a0a0c", strokeWidth: 0.5, outline: "none", cursor: status ? "pointer" : "default" },
                    hover: { fill, stroke: "#0a0a0c", strokeWidth: 0.6, outline: "none", filter: status ? "brightness(1.15)" : "none" },
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

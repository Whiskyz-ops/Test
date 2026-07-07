"use client";
import { useCallback, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import { ZoomIn, ZoomOut } from "lucide-react";
import worldTopo from "world-atlas/countries-110m.json";
import { STATUS_META, PAL } from "@/lib/logic";

// world-atlas country names we care about + label anchor coords [lon,lat]
const HAS_DATA = { India: "IN", "United States of America": "US" };
const COORD = { India: [80, 22], "United States of America": [-98, 40] };
const MAP_CENTER = [12, 8];
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;
const MAP_WIDTH = 900;
const MAP_HEIGHT = 420;
// Clamp panning to the map's own canvas so a drag can't take the content
// fully off-screen — d3-zoom keeps this rectangle from leaving the viewport.
const TRANSLATE_EXTENT = [[0, 0], [MAP_WIDTH, MAP_HEIGHT]];

// Country fills read as jewel-tone washes, not neon blocks — full-saturation
// color is reserved for the small marker dot (an accent mark), per the "never
// a saturated block on a large shape" rule.
const FILL_WASH = {
  exposed: "rgba(239,68,68,0.62)",
  approaching: "rgba(245,166,35,0.62)",
  nexus: "rgba(59,130,246,0.62)",
  none: "rgba(34,197,94,0.62)"
};
const HOVER_WASH = {
  exposed: "rgba(239,68,68,0.78)",
  approaching: "rgba(245,166,35,0.78)",
  nexus: "rgba(59,130,246,0.78)",
  none: "rgba(34,197,94,0.78)"
};
// A tight, small-radius edge glow on tracked countries' borders only (never
// the fill) — a few px of blur, not the old 6-10px halo, so it reads as a
// crisp highlighted outline rather than a neon sticker.
const GLOW_STROKE = {
  exposed: "#ef4444", approaching: "#f5a623", nexus: "#3b82f6", none: "#22c55e"
};

// A floating risk tag anchored to a tracked country — a frosted "liquid glass"
// callout (blurred backdrop + translucent tint + soft top sheen) with a single
// colored dot carrying identity, not a colored badge (text never wears the
// status color; the dot beside it does the identifying).
function RiskTag({ name, status }) {
  const c = COORD[name];
  const m = STATUS_META[status];
  if (!c || !m) return null;
  const w = m.label.length * 5.4 + 12;
  return (
    <Marker coordinates={c}>
      <circle className="wising-pulse-ring" r={3.5} fill="none" stroke={m.color} strokeWidth={1.2} style={{ opacity: 0.55 }} />
      <circle r={3} fill={m.color} stroke="#05070e" strokeWidth={1} />
      <g transform="translate(7,-6)">
        <rect rx={4} ry={4} width={w} height={15}
          fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.32)" strokeWidth={0.7}
          style={{
            backdropFilter: "blur(6px) saturate(160%)",
            WebkitBackdropFilter: "blur(6px) saturate(160%)",
            filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.45))"
          }} />
        <rect x={0.6} y={0.8} rx={3.4} ry={3.4} width={w - 1.2} height={6.5}
          fill="rgba(255,255,255,0.16)" style={{ pointerEvents: "none" }} />
        <text x={6} y={10.5} fontSize={8} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing={0.4} fill="#ffffff" style={{ textTransform: "uppercase", textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}>{m.label}</text>
      </g>
    </Marker>
  );
}

export default function WorldMap({ statusByName, onSelectCountry }) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [center, setCenter] = useState(MAP_CENTER);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, +(z * ZOOM_STEP).toFixed(3))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, +(z / ZOOM_STEP).toFixed(3))), []);
  // Drag-to-pan stays on; only the scroll-wheel zoom gesture is disabled, so
  // hovering the map to scroll the page no longer gets hijacked into a zoom.
  const filterZoomEvent = useCallback((event) => event.type !== "wheel", []);

  return (
    <div className="w-full relative">
      <style>{`
        @keyframes wisingPulseRing {
          0%   { r: 3.5; opacity: 0.55; }
          70%  { r: 13; opacity: 0; }
          100% { r: 13; opacity: 0; }
        }
        .wising-pulse-ring { animation: wisingPulseRing 2.4s cubic-bezier(0.4,0,0.6,1) infinite; transform-box: fill-box; transform-origin: center; }
      `}</style>
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
        <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in"
          className="w-8 h-8 rounded-xl bg-surface border border-line text-muted hover:text-head hover:border-accent/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-card transition-colors">
          <ZoomIn size={14} strokeWidth={2} />
        </button>
        <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out"
          className="w-8 h-8 rounded-xl bg-surface border border-line text-muted hover:text-head hover:border-accent/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-card transition-colors">
          <ZoomOut size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="rounded-2xl overflow-hidden">
        <ComposableMap
          projection="geoEquirectangular"
          width={MAP_WIDTH} height={MAP_HEIGHT}
          projectionConfig={{ scale: 145 }}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup
            center={center}
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            translateExtent={TRANSLATE_EXTENT}
            filterZoomEvent={filterZoomEvent}
            onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates); setZoom(z); }}
          >
            <Geographies geography={worldTopo}>
              {({ geographies }) =>
                geographies.filter((geo) => geo.properties.name !== "Antarctica").map((geo) => {
                  const name = geo.properties.name;
                  const status = statusByName[name];
                  const hasData = !!HAS_DATA[name];
                  const fill = status ? FILL_WASH[status] : PAL.navy;
                  const hoverFill = status ? HOVER_WASH[status] : "#242a44";
                  const stroke = status ? GLOW_STROKE[status] : "rgba(255,255,255,0.14)";
                  const glow = status ? `drop-shadow(0 0 2px ${GLOW_STROKE[status]})` : "none";
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => hasData && onSelectCountry && onSelectCountry(HAS_DATA[name])}
                      style={{
                        default: { fill, stroke, strokeWidth: status ? 0.9 : 0.5, outline: "none", cursor: hasData ? "pointer" : "default", filter: glow },
                        hover: { fill: hoverFill, stroke, strokeWidth: status ? 1.1 : 0.6, outline: "none", filter: glow },
                        pressed: { fill: hoverFill, stroke, outline: "none", filter: glow }
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
      </div>
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

/* Rebuilds lib/countries-110m-india-view.json — the Monitor's world map
 * (components/WorldMap.jsx).
 *
 * Source: Natural Earth v5.1.2 admin-0 countries, India point of view
 * (ne_10m_admin_0_countries_ind — public domain). Boundaries follow India's
 * official map: all of Jammu & Kashmir and Ladakh including Pakistan-
 * occupied Kashmir, Gilgit-Baltistan, Aksai Chin and the Shaksgam Valley,
 * and Arunachal Pradesh. The default world-atlas map (de facto boundaries)
 * showed those areas as Pakistan / China.
 *
 * Simplified to about the detail of world-atlas's countries-110m (same
 * object name "countries", same names and ISO numeric ids, so nothing else
 * in the app changes).
 *
 * Usage (needs network for the download and npx):
 *   node scripts/build-world-map.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries_ind.geojson";
const OUT = path.join(__dirname, "..", "lib", "countries-110m-india-view.json");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "world-map-"));
const src = path.join(tmp, "ne_10m_ind.geojson"), raw = path.join(tmp, "raw.json");

execFileSync("curl", ["-sSfL", "-o", src, SRC], { stdio: "inherit" });
execFileSync("npx", ["-y", "mapshaper@0.6", src,
  "-filter-fields", "NAME,ISO_N3,ADM0_A3",
  "-filter-islands", "min-area=150km2", "remove-empty",
  "-simplify", "1.5%", "keep-shapes",
  "-rename-layers", "countries",
  "-o", "format=topojson", "quantization=100000", raw, "force"], { stdio: "inherit" });

// Names and ids as world-atlas countries-110m has them (matched on ISO
// numeric code, else on name), so status lookups by name keep working.
const topo = require("topojson-client");
const old = require("world-atlas/countries-110m.json");
const oldFeat = topo.feature(old, old.objects.countries).features;
const byId = new Map(oldFeat.map((f) => [String(f.id), f.properties.name]));
const byName = new Set(oldFeat.map((f) => f.properties.name));
const t = JSON.parse(fs.readFileSync(raw, "utf8"));
t.objects.countries.geometries.forEach((g) => {
  const p = g.properties, iso = p.ISO_N3 && p.ISO_N3 !== "-99" ? String(p.ISO_N3).padStart(3, "0") : null;
  const name = (iso && byId.get(iso)) || (byName.has(p.NAME) ? p.NAME : p.NAME);
  if (iso) g.id = iso;
  g.properties = { name };
});
fs.writeFileSync(OUT, JSON.stringify(t));
console.log(`[build-world-map] wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);

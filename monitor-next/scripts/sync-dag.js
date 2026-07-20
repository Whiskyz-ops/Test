/* Copies prototypes/graph-pilot/*-nodes.js + graph.js (the DAG — NOT the
 * run-*.js test harnesses, which hardcode a repo-root absolute path and
 * only make sense under Node) into lib/dag, so the Next app can require()
 * them client-side. Rewrites each file's require("../../engine/constants.js")
 * to require("../engine/constants.js") — lib/dag and lib/engine are siblings
 * here, two levels up from prototypes/graph-pilot's own location at the repo
 * root. Runs on predev/prebuild, right after sync-engine (which must land
 * lib/engine/constants.js first — the DAG's shared-constants import,
 * SYS-1, needs it there). Tolerant like sync-engine: if the source dir
 * isn't present, keeps the existing copy. */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "prototypes", "graph-pilot");
const dst = path.join(__dirname, "..", "lib", "dag");

if (!fs.existsSync(src)) {
  console.log("[sync-dag] prototypes/graph-pilot not found — using existing lib/dag copy.");
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });

const files = fs.readdirSync(src).filter((f) => f.endsWith(".js") && !f.startsWith("run-") && f !== "run.js");
let n = 0;
files.forEach((f) => {
  let content = fs.readFileSync(path.join(src, f), "utf8");
  content = content.split('"../../engine/constants.js"').join('"../engine/constants.js"');
  fs.writeFileSync(path.join(dst, f), content);
  n++;
});
console.log(`[sync-dag] synced ${n} DAG node files → lib/dag`);

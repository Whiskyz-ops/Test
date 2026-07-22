/* Bundles prototypes/graph-pilot/analyze.js — the standalone, engine-free
 * WISING.analyze() entry point — into a single browser-ready IIFE, so plain
 * static HTML pages (index.html) can load the DAG the same way they load
 * engine/*.js today: a <script> tag, no Node require() at runtime.
 *
 * The DAG's own node files are plain CommonJS with relative sibling
 * require("./x.js") calls (no Node built-ins beyond that), so esbuild can
 * bundle the whole graph verbatim — no shims, no externals.
 *
 * Run: node scripts/build-dag-bundle.js  (or npm run build:dag-bundle)
 */
const esbuild = require("esbuild");
const path = require("path");

const entry = path.join(__dirname, "..", "prototypes", "graph-pilot", "analyze.js");
const outfile = path.join(__dirname, "..", "assets", "dag-analyze.bundle.js");

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2018",
  outfile: outfile,
});

console.log("[build-dag-bundle] wrote assets/dag-analyze.bundle.js");

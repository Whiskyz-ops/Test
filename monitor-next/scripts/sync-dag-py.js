/* Copies the two static assets the Python DAG (Pyodide, dag_py/) browser
 * loader needs into public/dag-py/, so Next.js serves them at
 * /dag-py/wising_dag-0.0.0-py3-none-any.whl and /dag-py/pyodide_adapter.py — fetchable at
 * runtime by lib/py-dag-loader.js's own micropip.install()/runPythonAsync()
 * calls. Neither file is webpack-bundled (unlike sync-dag.js's lib/dag/
 * copy, imported as ES modules): the wheel is a binary micropip needs a
 * URL for, and the adapter's source text is exec'd directly inside the
 * Pyodide runtime, not imported by webpack at all.
 *
 * Runs on predev/prebuild. Tolerant: if a source file isn't present (e.g.
 * `npm run build:dag-wheel` hasn't been run yet in this checkout), keeps
 * whatever copy already exists in public/dag-py/ and logs rather than
 * failing the whole build — same discipline as sync-engine.js/sync-dag.js. */
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const dst = path.join(__dirname, "..", "public", "dag-py");
fs.mkdirSync(dst, { recursive: true });

const FILES = [
  { from: path.join(repoRoot, "assets", "wising_dag-0.0.0-py3-none-any.whl"), to: path.join(dst, "wising_dag-0.0.0-py3-none-any.whl") },
  { from: path.join(repoRoot, "dag_py", "adapter", "pyodide_adapter.py"), to: path.join(dst, "pyodide_adapter.py") },
];

let n = 0;
FILES.forEach(({ from, to }) => {
  if (fs.existsSync(from)) { fs.copyFileSync(from, to); n++; }
  else console.log(`[sync-dag-py] ${from} not found — skipping (run "npm run build:dag-wheel" at repo root first).`);
});
console.log(`[sync-dag-py] synced ${n}/${FILES.length} Python DAG assets → public/dag-py`);

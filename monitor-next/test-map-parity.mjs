/* ============================================================================
 * Map / KPI parity: JS DAG vs Python DAG.
 *
 * The Monitor builds its country and state rows (status, tax after credits,
 * paid, balance, refund, money at risk, overdue returns, late instalments)
 * with one function, snapshotFromResult() in lib/dag-adapter.js, for both
 * engine modes. This runs every demo profile and the example household
 * (Rohan & Priya Mehta) through both engines on the same date and fails if
 * any row differs — so a status change made for one mode shows up in the
 * other, or CI goes red.
 *
 * The Python side runs dag_py directly (python3, no dependencies), not
 * through Pyodide — analyze_with_extras(), the same entry point the
 * browser's Pyodide adapter calls; lib/py-dag-adapter.js passes the same
 * result shape on.
 *
 * Usage: node test-map-parity.mjs
 * ==========================================================================*/
import { createRequire } from "module";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const AS_OF = "2026-10-01T12:00:00";

globalThis.window = globalThis;
await import("./lib/engine/constants.js");
await import("./lib/engine/profiles.js");
const { monitorSnapshotDag, snapshotFromResult, attachRaw } = await import("./lib/dag-adapter.js");
const { withStatus } = await import("./lib/logic.js");
const HOUSEHOLD = require(path.join(ROOT, "prototypes", "graph-pilot", "household-seed-data.js"));

const clients = {};
globalThis.WISING.PROFILES.forEach((p) => { clients[p.id] = { router: p.router, india: p.india, us: p.us }; });
Object.keys(HOUSEHOLD).filter((k) => k.startsWith("c_")).forEach((k) => {
  const p = HOUSEHOLD[k];
  clients[k] = { router: p.router, india: p.india, us: p.us };
});
const clone = (o) => JSON.parse(JSON.stringify(o));

const PY = `
import json, sys
sys.path.insert(0, sys.argv[1])
from wising_dag.analyze import analyze_with_extras
data = json.load(sys.stdin)
out = {k: analyze_with_extras(dict(raw, monitorAsOf=data["asOf"])) for k, raw in data["clients"].items()}
json.dump(out, sys.stdout, default=lambda o: o.isoformat() if hasattr(o, "isoformat") else str(o))
`;
const py = JSON.parse(execFileSync("python3", ["-c", PY, path.join(ROOT, "dag_py", "src")], {
  input: JSON.stringify({ asOf: AS_OF, clients }), maxBuffer: 256 * 1024 * 1024
}).toString());

const FIELDS = ["status", "taxAfterCreditsUsd", "paidUsd", "balanceUsd", "refundUsd", "atRiskUsd", "overdueFilings", "lateInstallments", "filingRequired", "reason"];
const r0 = (v) => (typeof v === "number" ? Math.round(v) : v);
const rows = (snap) => withStatus(snap.countries).concat(withStatus(snap.states || []));
let failures = 0;
for (const [id, raw] of Object.entries(clients)) {
  const js = rows(monitorSnapshotDag(clone(raw), { monitorAsOf: new Date(AS_OF) }));
  const pyRows = rows(snapshotFromResult(attachRaw(py[id], clone(raw))));
  const ids = new Set(js.map((r) => r.id).concat(pyRows.map((r) => r.id)));
  const diffs = [];
  ids.forEach((rid) => {
    const a = js.find((r) => r.id === rid), b = pyRows.find((r) => r.id === rid);
    if (!a || !b) { diffs.push(rid + ": only in " + (a ? "JS" : "Python")); return; }
    FIELDS.forEach((f) => { if (r0(a[f]) !== r0(b[f])) diffs.push(`${rid}.${f} JS=${r0(a[f])} Python=${r0(b[f])}`); });
  });
  failures += diffs.length;
  console.log((diffs.length ? "  FAIL " : "  ok   ") + id + (diffs.length ? "\n         " + diffs.join("\n         ") : " — " + js.map((r) => r.id + " " + r.status).join(", ")));
}
console.log(failures ? `\n${failures} difference(s) between the JS and Python map rows` : "\nJS and Python map rows agree for every client");
process.exit(failures ? 1 : 0);

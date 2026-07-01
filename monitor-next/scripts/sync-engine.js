/* Copies the repo-root engine (the shared "converting layer") into
 * lib/engine so the Next app and the vanilla dashboard use the SAME source.
 * Runs on predev/prebuild. Tolerant: if the root engine isn't present
 * (e.g. the subdir is deployed alone), it keeps the existing copy. */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "engine");
const dst = path.join(__dirname, "..", "lib", "engine");
const FILES = ["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js", "sample-data.js"];

if (!fs.existsSync(src)) {
  console.log("[sync-engine] root engine not found — using existing lib/engine copy.");
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });
let n = 0;
FILES.forEach((f) => {
  const from = path.join(src, f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(dst, f)); n++; }
});
console.log(`[sync-engine] synced ${n} engine files → lib/engine`);

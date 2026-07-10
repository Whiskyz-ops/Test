/* Copies the repo-root engine (the shared "converting layer") into
 * lib/engine so the Next app and the vanilla dashboard use the SAME source.
 * Runs on predev/prebuild. Tolerant: if the root engine isn't present
 * (e.g. the subdir is deployed alone), it keeps the existing copy. */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "engine");
const dst = path.join(__dirname, "..", "lib", "engine");
const FILES = ["constants.js", "normalize.js", "computation.js", "monitoring.js", "conflicts.js", "sample-data.js", "profiles.js"];

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

/* Also mirror the same engine files, plus the standalone Layer 0/1 HTML
 * pages, into public/ — Next.js serves public/ at the site root, so a
 * deployed monitor-next app serves /router.html, /layer1_us.html,
 * /layer1_india.html, and /engine/*.js from THESE copies, not the repo-root
 * originals. Without this second copy, root-file edits (rates, fields,
 * constants) silently don't reach the deployed standalone pages. */
const repoRoot = path.join(__dirname, "..", "..");
const publicDir = path.join(__dirname, "..", "public");
const publicEngineDir = path.join(publicDir, "engine");
const HTML_FILES = ["router.html", "layer1_india.html", "layer1_us.html"];

fs.mkdirSync(publicEngineDir, { recursive: true });
let nEngine = 0;
FILES.forEach((f) => {
  const from = path.join(src, f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(publicEngineDir, f)); nEngine++; }
});
let nHtml = 0;
HTML_FILES.forEach((f) => {
  const from = path.join(repoRoot, f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(publicDir, f)); nHtml++; }
});
console.log(`[sync-engine] mirrored ${nEngine} engine files + ${nHtml} HTML pages → public/`);

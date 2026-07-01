/* ============================================================================
 * Build a single self-contained dashboard file: dashboard-standalone.html
 * ----------------------------------------------------------------------------
 * Inlines assets/tailwind.css and all engine/*.js into dtaa_bridge.html so the
 * file opens with a plain double-click (file://) — no web server, no CDN, no
 * wifi. Demo data renders immediately. (The live router -> forms -> dashboard
 * flow still needs a server because browsers sandbox localStorage under
 * file://; use start.command / start.bat for that.)
 *
 * Run: npm run build:standalone   (after npm run build:css)
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let html = read("dtaa_bridge.html");

// 1) Inline the compiled Tailwind CSS.
const css = read("assets/tailwind.css");
html = html.replace(
  /<link rel="stylesheet" href="assets\/tailwind\.css"\/>/,
  "<style>\n" + css + "\n</style>"
);

// 2) Inline each engine script in order.
["constants", "normalize", "computation", "monitoring", "conflicts", "sample-data"].forEach((name) => {
  const js = read("engine/" + name + ".js");
  const tag = '<script src="engine/' + name + '.js"></script>';
  if (html.indexOf(tag) < 0) throw new Error("Could not find script tag for " + name);
  html = html.replace(tag, "<script>\n" + js + "\n</script>");
});

// 3) Banner so it's obvious this is the offline single-file build.
html = html.replace(
  /<title>[^<]*<\/title>/,
  "<title>WISING — Standalone Dashboard (offline, double-click)</title>"
);

const out = path.join(root, "dashboard-standalone.html");
fs.writeFileSync(out, html);
console.log("Wrote dashboard-standalone.html (" + Math.round(html.length / 1024) + " KB, fully self-contained)");

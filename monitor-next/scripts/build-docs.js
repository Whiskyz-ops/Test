/* Render the repo's markdown docs into a single self-contained, dark-themed
 * public/docs.html so the Monitor's "Docs & coverage" resource card has a real
 * destination that works offline (file://) and on Vercel. Runs at prebuild, so
 * the page always mirrors docs/*.md — no hand-maintained fork.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const DOCS_DIR = path.join(REPO, "docs");
const OUT = path.resolve(__dirname, "..", "public", "docs.html");
const FILES = ["COVERAGE_AND_ARCHITECTURE.md", "DEVELOPER_HANDOFF.md", "US_LAYER1_COVERAGE.md"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// inline: `code`, **bold**, *italic*, [text](url)
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  while (i < lines.length) {
    let line = lines[i];
    // fenced code block
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++; out.push("<pre><code>" + buf.join("\n") + "</code></pre>"); continue;
    }
    // table: header row then |---| separator
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line); i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      out.push('<div class="tbl"><table><thead><tr>' + head.map((h) => "<th>" + inline(h) + "</th>").join("") + "</tr></thead><tbody>" +
        body.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
      continue;
    }
    // headings
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { const lv = m[1].length, t = m[2].replace(/\s*#*\s*$/, ""); out.push("<h" + lv + ' id="' + slug(t) + '">' + inline(t) + "</h" + lv + ">"); i++; continue; }
    // hr
    if (/^\s*---\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
    // blockquote
    if (/^\s*>\s?/.test(line)) { const buf = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(inline(lines[i].replace(/^\s*>\s?/, ""))); i++; } out.push("<blockquote>" + buf.join("<br/>") + "</blockquote>"); continue; }
    // list (ordered or unordered)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const buf = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { buf.push("<li>" + inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")) + "</li>"); i++; }
      out.push((ordered ? "<ol>" : "<ul>") + buf.join("") + (ordered ? "</ol>" : "</ul>"));
      continue;
    }
    // blank
    if (/^\s*$/.test(line)) { i++; continue; }
    // paragraph (gather until blank / block)
    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|\s*>|\s*([-*]|\d+\.)\s|\s*---\s*$)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) { buf.push(inline(lines[i])); i++; }
    out.push("<p>" + buf.join(" ") + "</p>");
  }
  return out.join("\n");
}

const sections = FILES.filter((f) => fs.existsSync(path.join(DOCS_DIR, f))).map((f) => {
  const md = fs.readFileSync(path.join(DOCS_DIR, f), "utf8");
  return { file: f, id: f.replace(/\.md$/, "").toLowerCase(), html: renderMarkdown(md) };
});

const nav = sections.map((s) => '<a href="#' + s.id + '">' + s.file + "</a>").join("");
const body = sections.map((s) => '<section id="' + s.id + '">' + s.html + "</section>").join('<hr class="big"/>');

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WISING — Docs & Coverage</title>
<style>
:root{--bg:#05070e;--surface:#0c0f18;--line:rgba(255,255,255,.08);--head:#f3f4f8;--body:#c3c7d4;--muted:#8a8fa3;--accent:#2dd4bf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:32px 22px 120px}
.top{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.glyph{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#04120f;font-weight:900;background:linear-gradient(135deg,#2dd4bf,#34d399);box-shadow:0 0 22px rgba(45,212,191,.5)}
.brand{font-weight:700;letter-spacing:.3em;color:#fff}
.back{color:var(--accent);text-decoration:none;font-weight:700;font-size:13px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 26px}
nav a{font-size:12px;font-weight:700;color:var(--body);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:7px 13px;text-decoration:none}
nav a:hover{border-color:var(--accent)}
h1{color:var(--head);font-size:30px;line-height:1.15;margin:1.4em 0 .5em}
h2{color:var(--head);font-size:22px;margin:1.5em 0 .5em;padding-top:8px}
h3{color:var(--head);font-size:17px;margin:1.4em 0 .4em}
h4,h5,h6{color:var(--head);margin:1.2em 0 .3em}
a{color:var(--accent)}
code{background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:6px;padding:1px 6px;font:13px ui-monospace,"SF Mono",Menlo,monospace;color:#a7f3e4}
pre{background:#0a0d16;border:1px solid var(--line);border-radius:14px;padding:16px;overflow-x:auto}
pre code{background:none;border:none;padding:0;color:var(--body)}
blockquote{border-left:3px solid var(--accent);margin:1em 0;padding:.3em 0 .3em 16px;color:var(--muted)}
hr{border:none;border-top:1px solid var(--line);margin:1.6em 0}
hr.big{border-top:2px solid var(--line);margin:3em 0}
.tbl{overflow-x:auto;margin:1em 0}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{border:1px solid var(--line);padding:7px 11px;text-align:left;vertical-align:top}
th{background:rgba(255,255,255,.04);color:var(--head)}
ul,ol{padding-left:22px}li{margin:.2em 0}
</style></head><body><div class="wrap">
<div class="top"><div class="glyph">W</div><div class="brand">WISING</div><a class="back" href="index.html">← Back to Monitor</a></div>
<p style="color:var(--muted);font-size:12px;margin:0 0 4px">Coverage audit, architecture & developer handoff — generated from <code>docs/*.md</code>.</p>
<nav>${nav}</nav>
${body}
</div></body></html>`;

fs.writeFileSync(OUT, page);
console.log("[build-docs] wrote " + path.relative(REPO, OUT) + " (" + sections.length + " docs, " + Math.round(page.length / 1024) + " KB)");

#!/usr/bin/env node
/* ============================================================================
 * WISING — merge-base finder
 * ----------------------------------------------------------------------------
 * A 3-way merge (see three-way-merge.js) needs a common ancestor: the
 * historical version of layer1_india.html (or layer1_us.html) that an
 * incoming, independently-edited copy was originally forked from. Nobody
 * hands you that commit hash directly, so this script finds it mechanically:
 * it diffs the incoming file against EVERY historical version of the tracked
 * file in git log, and reports which one is textually closest (fewest
 * changed lines). That closest match is the best available merge-base
 * candidate.
 *
 * This is a heuristic, not a proof — if the incoming file was built from a
 * version of the form that never existed as a commit in this repo (e.g.
 * hand-edited from an even older export), the "best" match may still be a
 * poor base. The line-count-changed figure is printed for every candidate
 * specifically so that can be judged, not hidden behind a single verdict.
 *
 * Usage:
 *   node scripts/merge/find-base-commit.js <path-to-incoming-file> [options]
 *
 * Options:
 *   --file <tracked-path>   Tracked file to compare against (default: layer1_india.html)
 *   --top <n>               How many candidates to print (default: 5)
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const repoRoot = path.join(__dirname, "..", "..");

function parseArgs(argv) {
  const out = { file: "layer1_india.html", top: 5, incoming: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--top") out.top = parseInt(argv[++i], 10);
    else rest.push(a);
  }
  out.incoming = rest[0] || null;
  return out;
}

// Some historical commits used CRLF line endings, others LF (the file was
// normalized partway through this repo's history). Left unnormalized, every
// single line looks "different" across that boundary and swamps the real
// content diff — normalize both sides to LF before comparing.
function normalizeCRLF(buf) {
  return buf.toString("utf8").replace(/\r\n/g, "\n");
}

function countChangedLines(pathA, pathB) {
  try {
    execFileSync("diff", ["-u0", pathA, pathB], { maxBuffer: 200 * 1024 * 1024 });
    return 0; // identical
  } catch (e) {
    const stdout = (e.stdout || Buffer.from("")).toString("utf8");
    let n = 0;
    for (const line of stdout.split("\n")) {
      if ((line.startsWith("+") && !line.startsWith("+++")) ||
          (line.startsWith("-") && !line.startsWith("---"))) n++;
    }
    return n;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.incoming) {
    console.error("Usage: node scripts/merge/find-base-commit.js <path-to-incoming-file> [--file layer1_india.html] [--top 5]");
    process.exit(2);
  }
  const incomingPath = path.resolve(args.incoming);
  if (!fs.existsSync(incomingPath)) {
    console.error(`Incoming file not found: ${incomingPath}`);
    process.exit(2);
  }

  const log = execFileSync(
    "git", ["log", "--follow", "--format=%H|%ct|%s", "--", args.file],
    { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 }
  ).toString("utf8").trim();
  if (!log) {
    console.error(`No history found for tracked file: ${args.file}`);
    process.exit(2);
  }
  const commits = log.split("\n").map((line) => {
    const [hash, ts, ...rest] = line.split("|");
    return { hash, date: new Date(parseInt(ts, 10) * 1000).toISOString().slice(0, 10), subject: rest.join("|") };
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wising-basefind-"));
  const normalizedIncomingPath = path.join(tmpDir, "incoming.normalized.html");
  const incomingRaw = fs.readFileSync(incomingPath);
  const incomingHadCRLF = incomingRaw.toString("utf8").includes("\r\n");
  fs.writeFileSync(normalizedIncomingPath, normalizeCRLF(incomingRaw));

  const results = [];
  let anyCRLF = incomingHadCRLF;
  for (const c of commits) {
    const content = execFileSync("git", ["show", `${c.hash}:${args.file}`], { cwd: repoRoot, maxBuffer: 200 * 1024 * 1024 });
    if (content.toString("utf8").includes("\r\n")) anyCRLF = true;
    const normalized = normalizeCRLF(content);
    const tmpFile = path.join(tmpDir, `${c.hash}.html`);
    fs.writeFileSync(tmpFile, normalized);
    const changed = countChangedLines(normalizedIncomingPath, tmpFile);
    const totalLines = normalized.split("\n").length;
    results.push({ ...c, changed, totalLines, pctChanged: totalLines ? (changed / totalLines * 100) : 0 });
    fs.unlinkSync(tmpFile);
  }
  fs.unlinkSync(normalizedIncomingPath);
  fs.rmdirSync(tmpDir);
  if (anyCRLF) {
    console.log("(Note: line endings were normalized to LF before comparing — this repo's history mixes CRLF and LF versions of this file.)\n");
  }

  results.sort((a, b) => a.changed - b.changed);

  console.log(`Compared incoming file against ${results.length} historical version(s) of ${args.file}:\n`);
  console.log("rank  changed-lines  %-of-file  date        commit    subject");
  results.slice(0, args.top).forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)}  ${String(r.changed).padStart(13)}  ${r.pctChanged.toFixed(1).padStart(8)}%  ${r.date}  ${r.hash.slice(0, 8)}  ${r.subject}`
    );
  });

  const best = results[0];
  console.log(`\nBest candidate base commit: ${best.hash} (${best.date}) — "${best.subject}"`);
  console.log(`  ${best.changed} changed line(s), ${best.pctChanged.toFixed(1)}% of that version's file.`);
  if (best.pctChanged > 15) {
    console.log(
      "\n  WARNING: even the closest match differs substantially. This may not be a real\n" +
      "  common ancestor — verify manually before trusting a 3-way merge based on it\n" +
      "  (check whether the incoming file was actually derived from this repo's history\n" +
      "  at all, e.g. from an older export or a hand-rebuilt copy)."
    );
  }
  console.log(`\nNext: node scripts/merge/three-way-merge.js <incoming-file> ${best.hash}`);
}

main();

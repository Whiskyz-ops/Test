#!/usr/bin/env node
/* ============================================================================
 * WISING — fix regression check
 * ----------------------------------------------------------------------------
 * A clean 3-way merge (0 conflicts) is NOT proof that every historical fix
 * survived — git merge-file only flags OVERLAPPING line edits. If an
 * incoming file deleted a whole function, or an independent rewrite
 * happened to reformat a fixed block without touching the exact same lines
 * the repo's fix touched, there's no conflict to surface, yet the fix is
 * gone. This script closes that gap by checking, mechanically, whether the
 * actual lines every historical fix commit ADDED are still present in a
 * given target file.
 *
 * Method: for every commit in this repo's history that touched the tracked
 * file (auto-discovered via `git log`, nothing hand-curated — this stays
 * correct as new fix commits land, with no maintenance step), extract the
 * lines that commit's diff added, filter out lines too short/generic to be
 * a meaningful signature (bare braces, blank lines, etc.), and check
 * whether each surviving line is still present in the target file
 * (whitespace-normalized, so re-indentation alone doesn't cause a false
 * miss). Report per-commit match percentage; flag anything below threshold
 * as a candidate for manual review, with the exact missing lines listed so
 * it's actionable rather than just a score.
 *
 * This is a heuristic like the other audit scripts, not a proof: it can
 * false-flag a fix that was deliberately superseded/refactored in a
 * legitimate way, and (in principle, rarely) miss a fix whose lines were
 * coincidentally reintroduced by unrelated text. Treat flagged commits as a
 * prioritized reading list, same discipline as field-coverage.js.
 *
 * Usage:
 *   node scripts/audit/fix-regression-check.js <target-file> [options]
 *
 * Options:
 *   --file <tracked-path>   Tracked file whose history to check (default: layer1_india.html)
 *   --since <commit>        Only check commits AFTER this one (use the base commit
 *                           three-way-merge.js merged from, to check just the fixes
 *                           that could plausibly be missing from the incoming file)
 *   --threshold <0-1>       Match ratio below which a commit is flagged (default: 0.9)
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.join(__dirname, "..", "..");

function parseArgs(argv) {
  const out = { file: "layer1_india.html", since: null, threshold: 0.9, target: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--since") out.since = argv[++i];
    else if (a === "--threshold") out.threshold = parseFloat(argv[++i]);
    else rest.push(a);
  }
  out.target = rest[0] || null;
  return out;
}

function normalizeWs(line) {
  return line.trim().replace(/\s+/g, " ");
}

// Lines too short/generic to be a trustworthy signature on their own
// (bare braces/brackets, lone punctuation, single common keywords).
function isMeaningfulSignature(line) {
  const t = line.trim();
  if (t.length < 8) return false;
  const alnum = (t.match(/[a-zA-Z0-9]/g) || []).length;
  if (alnum < 6) return false;
  if (/^[{}()\[\];,]+$/.test(t)) return false;
  return true;
}

function getCommitList(file, since) {
  const range = since ? `${since}..HEAD` : "";
  const log = execFileSync(
    "git",
    ["log", "--follow", "--format=%H|%s", range, "--", file].filter(Boolean),
    { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 }
  ).toString("utf8").trim();
  if (!log) return [];
  return log.split("\n").map((line) => {
    const idx = line.indexOf("|");
    return { hash: line.slice(0, idx), subject: line.slice(idx + 1) };
  });
}

function getAddedLines(hash, file) {
  const diff = execFileSync(
    "git", ["show", hash, "--format=", "--unified=0", "--", file],
    { cwd: repoRoot, maxBuffer: 200 * 1024 * 1024 }
  ).toString("utf8");
  const added = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++")) continue;
    if (line.startsWith("+")) added.push(line.slice(1));
  }
  return added;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error("Usage: node scripts/audit/fix-regression-check.js <target-file> [--file layer1_india.html] [--since <commit>] [--threshold 0.9]");
    process.exit(2);
  }
  const targetPath = path.resolve(args.target);
  if (!fs.existsSync(targetPath)) {
    console.error(`Target file not found: ${targetPath}`);
    process.exit(2);
  }
  const targetLines = fs.readFileSync(targetPath, "utf8").split("\n");
  const targetLineSet = new Set(targetLines.map(normalizeWs));
  const targetStripped = targetLines.map((l) => l.replace(/\s+/g, "")).join("\n");

  const commits = getCommitList(args.file, args.since);
  if (commits.length === 0) {
    console.log(args.since
      ? `No commits touched ${args.file} after ${args.since} — nothing to check.`
      : `No history found for ${args.file}.`);
    process.exit(0);
  }

  const flagged = [];
  let checkedCount = 0;

  for (const c of commits) {
    const addedRaw = getAddedLines(c.hash, args.file);
    const signatures = addedRaw.filter(isMeaningfulSignature);
    if (signatures.length === 0) continue; // nothing this commit added is checkable (e.g. pure deletion/reformat)
    checkedCount++;

    const missing = [];
    for (const sig of signatures) {
      const norm = normalizeWs(sig);
      if (targetLineSet.has(norm)) continue;
      const strippedSig = sig.replace(/\s+/g, "");
      if (strippedSig.length > 0 && targetStripped.includes(strippedSig)) continue;
      missing.push(sig.trim());
    }
    const matched = signatures.length - missing.length;
    const ratio = matched / signatures.length;
    if (ratio < args.threshold) {
      flagged.push({ ...c, total: signatures.length, matched, ratio, missing });
    }
  }

  console.log(`Checked ${checkedCount} fix commit(s) touching ${args.file}${args.since ? ` since ${args.since.slice(0, 8)}` : ""} against ${args.target}\n`);

  if (flagged.length === 0) {
    console.log("All historical fixes' signature lines are present. No regressions detected.");
    process.exit(0);
  }

  console.log(`${flagged.length} commit(s) flagged (< ${(args.threshold * 100).toFixed(0)}% of their added lines found in target):\n`);
  for (const f of flagged) {
    console.log(`  ${f.hash.slice(0, 8)}  ${(f.ratio * 100).toFixed(0)}% (${f.matched}/${f.total})  ${f.subject}`);
    const shown = f.missing.slice(0, 8);
    for (const m of shown) console.log(`      missing: ${m.length > 100 ? m.slice(0, 100) + "..." : m}`);
    if (f.missing.length > shown.length) console.log(`      ...and ${f.missing.length - shown.length} more`);
  }
  console.log("\nTreat these as a prioritized reading list, not a proof of breakage — verify each");
  console.log("in context before deciding to reapply it.");
  process.exit(1);
}

main();

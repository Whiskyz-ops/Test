#!/usr/bin/env node
/* ============================================================================
 * WISING — 3-way mechanical merge for an incoming Layer 1 form
 * ----------------------------------------------------------------------------
 * Reconciles an independently-edited copy of a Layer 1 form with the current
 * git version, keeping the incoming file's own new changes while pulling in
 * every fix/change made in this repo since the base it was forked from.
 *
 * This is a real 3-way merge (git merge-file, the same primitive `git merge`
 * uses under the hood): it applies the diff (base -> current) onto the
 * incoming file. Non-overlapping changes merge automatically and correctly —
 * that part IS mechanically guaranteed. Where the incoming file and the
 * current repo both touched the same lines, git merge-file cannot know which
 * behavior is correct without semantic judgment, so it leaves standard
 * <<<<<<< / ======= / >>>>>>> conflict markers instead of guessing. This
 * script's guarantee is that it will never silently pick a side on those —
 * every overlap is surfaced, not resolved for you.
 *
 * Requires a base commit — the historical version the incoming file was
 * forked from. If you don't know it, run find-base-commit.js first.
 *
 * After merging, run scripts/audit/fix-regression-check.js against the
 * output to confirm every historical fix is actually present (a clean merge
 * with 0 conflicts is NOT the same as "every fix survived" — e.g. if the
 * incoming file deleted a whole function outright, there's no line-level
 * overlap for git merge-file to flag as a conflict, but the fix is still
 * gone).
 *
 * Usage:
 *   node scripts/merge/three-way-merge.js <incoming-file> <base-commit> [options]
 *
 * Options:
 *   --file <tracked-path>    Tracked file being merged (default: layer1_india.html)
 *   --current-ref <ref>      Git ref for the "current" side (default: working tree file on disk)
 *   --out <path>              Output path (default: <incoming-file>.merged.html)
 *   --diff3                   Use diff3-style conflict markers (shows the base text too)
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "..", "..");

// This repo's history mixes CRLF and LF versions of the tracked file (it was
// normalized to LF partway through). Left unnormalized, git merge-file's diff3
// sees every line as different across that boundary and collapses the whole
// file into one giant conflict instead of real, localized ones.
function normalizeCRLF(buf) {
  return buf.toString("utf8").replace(/\r\n/g, "\n");
}

function parseArgs(argv) {
  const out = { file: "layer1_india.html", currentRef: null, out: null, diff3: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--current-ref") out.currentRef = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--diff3") out.diff3 = true;
    else rest.push(a);
  }
  out.incoming = rest[0] || null;
  out.baseCommit = rest[1] || null;
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.incoming || !args.baseCommit) {
    console.error(
      "Usage: node scripts/merge/three-way-merge.js <incoming-file> <base-commit> " +
      "[--file layer1_india.html] [--current-ref HEAD] [--out path] [--diff3]"
    );
    console.error("\nDon't know the base commit? Run scripts/merge/find-base-commit.js first.");
    process.exit(2);
  }

  const incomingPath = path.resolve(args.incoming);
  if (!fs.existsSync(incomingPath)) {
    console.error(`Incoming file not found: ${incomingPath}`);
    process.exit(2);
  }

  let baseContent;
  try {
    baseContent = execFileSync("git", ["show", `${args.baseCommit}:${args.file}`], { cwd: repoRoot, maxBuffer: 200 * 1024 * 1024 });
  } catch (e) {
    console.error(`Could not read ${args.file} at commit ${args.baseCommit}: ${e.message}`);
    process.exit(2);
  }

  let currentContent;
  if (args.currentRef) {
    currentContent = execFileSync("git", ["show", `${args.currentRef}:${args.file}`], { cwd: repoRoot, maxBuffer: 200 * 1024 * 1024 });
  } else {
    currentContent = fs.readFileSync(path.join(repoRoot, args.file));
  }

  const incomingContent = fs.readFileSync(incomingPath);
  const anyCRLF = [incomingContent, baseContent, currentContent].some((b) => b.toString("utf8").includes("\r\n"));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wising-3waymerge-"));
  const normIncomingPath = path.join(tmpDir, "incoming.html");
  const basePath = path.join(tmpDir, "base.html");
  const currentPath = path.join(tmpDir, "current.html");
  fs.writeFileSync(normIncomingPath, normalizeCRLF(incomingContent));
  fs.writeFileSync(basePath, normalizeCRLF(baseContent));
  fs.writeFileSync(currentPath, normalizeCRLF(currentContent));

  if (anyCRLF) {
    console.log("(Note: line endings normalized to LF before merging — this repo's history mixes CRLF and LF versions of this file.)");
  }

  const mergeArgs = ["merge-file", "-p"];
  if (args.diff3) mergeArgs.push("--diff3");
  mergeArgs.push(
    "-L", "INCOMING (your uploaded file)",
    "-L", `BASE (${args.baseCommit.slice(0, 8)})`,
    "-L", `CURRENT (${args.currentRef || "working tree"})`,
    normIncomingPath, basePath, currentPath
  );

  const result = spawnSync("git", mergeArgs, { cwd: repoRoot, maxBuffer: 200 * 1024 * 1024 });
  const merged = result.stdout.toString("utf8");
  const outPath = args.out ? path.resolve(args.out) : `${incomingPath}.merged.html`;
  fs.writeFileSync(outPath, merged);

  fs.unlinkSync(normIncomingPath);
  fs.unlinkSync(basePath);
  fs.unlinkSync(currentPath);
  fs.rmdirSync(tmpDir);

  const conflictBlocks = (merged.match(/^<{7} /gm) || []).length;
  console.log(`Merged output written to: ${outPath}`);
  console.log(`Conflict blocks: ${conflictBlocks}`);
  if (conflictBlocks > 0) {
    console.log("\nEvery conflict below needs a human/semantic decision — these are places where");
    console.log("your incoming file and the current repo both changed the same lines:\n");
    const lines = merged.split("\n");
    let blockNum = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("<<<<<<< ")) {
        blockNum++;
        console.log(`  Conflict #${blockNum} at output line ${i + 1}`);
      }
    }
  } else {
    console.log("\nNo line-level conflicts. This does NOT by itself prove every historical fix");
    console.log("survived (a whole function could have been deleted with no overlapping line");
    console.log("to conflict on) — run the regression check next:");
  }
  console.log(`\nNext: node scripts/audit/fix-regression-check.js ${outPath} --since ${args.baseCommit} --file ${args.file}`);
  process.exit(conflictBlocks > 0 ? 1 : 0);
}

main();

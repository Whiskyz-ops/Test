import { describe, it, expect, beforeEach } from "vitest";
import { appendEvent, loadLog, statusOf, partition, amountChanged, logKey } from "./conflict-log.js";

describe("conflict resolution log", () => {
  beforeEach(() => { window.localStorage.clear(); });

  const f = { id: "salary_not_taxable_india_tds", title: "Indian TDS…", amountUsd: 11432, severity: "critical" };

  it("requires a reason and a name", () => {
    expect(() => appendEvent("c1", { findingId: f.id, action: "resolved", reason: "short", by: "AK" })).toThrow();
    expect(() => appendEvent("c1", { findingId: f.id, action: "resolved", reason: "Employer confirmed TDS stopped", by: "" })).toThrow();
    expect(loadLog("c1")).toEqual([]);
  });

  it("appends, never overwrites, and is per client", () => {
    appendEvent("c1", { findingId: f.id, action: "resolved", reason: "Employer confirmed TDS stopped from Oct", by: "AK", amountUsd: f.amountUsd });
    appendEvent("c1", { findingId: f.id, action: "reopened", reason: "Client says TDS still deducted", by: "AK", amountUsd: f.amountUsd });
    expect(loadLog("c1").map((e) => e.action)).toEqual(["resolved", "reopened"]);
    expect(loadLog("c2")).toEqual([]);
    expect(window.localStorage.getItem(logKey("c1"))).toContain("Client says TDS still deducted");
  });

  it("closes a finding until its amount moves, then shows it stale", () => {
    const log = appendEvent("c1", { findingId: f.id, action: "accepted_risk", reason: "Client accepts the exposure this year", by: "AK", amountUsd: 11432 });
    expect(statusOf(log, f).state).toBe("closed");
    expect(statusOf(log, { ...f, amountUsd: 11432.4 }).state).toBe("closed");
    expect(statusOf(log, { ...f, amountUsd: 12500 }).state).toBe("stale");
    const p = partition(log, [f, { id: "ftc_gap", amountUsd: 5292 }]);
    expect(p.closed.map((x) => x.finding.id)).toEqual([f.id]);
    expect(p.open.map((x) => x.finding.id)).toEqual(["ftc_gap"]);
  });

  it("treats small moves as unchanged", () => {
    expect(amountChanged(0, 0)).toBe(false);
    expect(amountChanged(100000, 100500)).toBe(false);
    expect(amountChanged(100, 150)).toBe(true);
  });
});

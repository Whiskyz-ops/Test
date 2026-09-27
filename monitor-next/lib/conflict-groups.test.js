import { describe, it, expect } from "vitest";
import { groupFindings, groupOf, AT_RISK_IDS } from "./conflict-groups";

describe("conflict root-cause grouping", () => {
  const findings = [
    { id: "fbar_limit", severity: "critical", amountUsd: 0 },
    { id: "salary_us_work_india_tax", severity: "critical", amountUsd: 117958 },
    { id: "ftc_gap", severity: "critical", amountUsd: 8877 },
    { id: "state_income_tax", severity: "warning", amountUsd: 43123 },
    { id: "holding_period_mismatch_2", severity: "warning", amountUsd: 0 },
    { id: "some_new_rule", severity: "info", amountUsd: 5 }
  ];

  it("groups by root cause and sums only tax actually at risk", () => {
    const g = groupFindings(findings);
    const dbl = g.find((x) => x.key === "double_tax");
    expect(dbl.items.map((f) => f.id)).toEqual(["salary_us_work_india_tax", "ftc_gap"]);
    expect(dbl.atRiskUsd).toBe(117958 + 8877);
    expect(g.find((x) => x.key === "us_only").atRiskUsd).toBe(0); // a state's total tax isn't "at risk"
  });

  it("puts the costliest critical group first", () => {
    expect(groupFindings(findings)[0].key).toBe("double_tax");
  });

  it("never drops a finding: prefixed and unknown ids still land somewhere", () => {
    expect(groupOf("holding_period_mismatch_7")).toBe("mismatch");
    expect(groupOf("residency_status_mismatch_india")).toBe("residency");
    expect(groupOf("some_new_rule")).toBe("other");
    const total = groupFindings(findings).reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(findings.length);
    expect(AT_RISK_IDS.has("state_income_tax")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { compute } from "./dag/india-filing-obligation.js";

// Same cases the Python engine runs (dag_py/tests/test_india_filing_obligation.py).
const { cases } = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "dag_py", "tests", "fixtures", "india-filing-obligation-cases.json"), "utf8"));

describe("Indian return compulsory (indiaFilingObligationResult)", () => {
  cases.forEach((c) => {
    it(c.name, () => {
      const out = compute(c.d, { india: { domestic_income: { business_income: { nature_of_business: c.natures } } } });
      expect(out.required).toBe(c.expect.required);
      expect(out.reasons.map((r) => r.code)).toEqual(c.expect.codes);
      expect(out.notes.length).toBe(c.expect.notes);
      if (c.expect.textIncludes) expect(out.reasons.some((r) => r.text.includes(c.expect.textIncludes))).toBe(true);
    });
  });
});

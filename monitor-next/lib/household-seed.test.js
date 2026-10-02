import { describe, it, expect } from "vitest";
import seed from "./dag/household-seed.js";
import data from "./dag/household-seed-data.js";

// Plain in-memory stand-in for localStorage.
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const W = { householdSeedData: data };
const key = (id, part) => "wising_client_" + id + "_" + part;

describe("investor mode's Reset example (household-seed.js)", () => {
  it("a freshly added example household isn't edited", () => {
    const s = memoryStorage();
    seed.ensureMehtaHousehold(W, s);
    expect(seed.mehtaHouseholdEdited(W, s)).toBe(false);
  });
  it("a changed form value is an edit; resetting puts the example back", () => {
    const s = memoryStorage();
    seed.ensureMehtaHousehold(W, s);
    const india = JSON.parse(s.getItem(key(seed.PRIYA_ID, "india")));
    india.tax_credits.tds_already_deducted_inr = 500000;
    s.setItem(key(seed.PRIYA_ID, "india"), JSON.stringify(india));
    expect(seed.mehtaHouseholdEdited(W, s)).toBe(true);
    seed.seedMehtaHousehold(W, s);
    expect(seed.mehtaHouseholdEdited(W, s)).toBe(false);
    expect(JSON.parse(s.getItem(key(seed.PRIYA_ID, "india"))).tax_credits.tds_entries[0].tds_inr).toBe(37440);
  });
  it("opening a form (it stamps times and a request id in metadata) isn't an edit", () => {
    const s = memoryStorage();
    seed.ensureMehtaHousehold(W, s);
    const us = JSON.parse(s.getItem(key(seed.PRIYA_ID, "us")));
    us.metadata = Object.assign({}, us.metadata, { created_at: "2026-10-02T12:00:00Z", last_updated_at: "2026-10-02T12:00:01Z", request_id: "x" });
    s.setItem(key(seed.PRIYA_ID, "us"), JSON.stringify(us));
    expect(seed.mehtaHouseholdEdited(W, s)).toBe(false);
  });
  it("a re-save that only reorders keys isn't an edit", () => {
    const s = memoryStorage();
    seed.ensureMehtaHousehold(W, s);
    const router = JSON.parse(s.getItem(key(seed.ROHAN_ID, "router")));
    const reordered = Object.fromEntries(Object.entries(router).reverse());
    s.setItem(key(seed.ROHAN_ID, "router"), JSON.stringify(reordered));
    expect(seed.mehtaHouseholdEdited(W, s)).toBe(false);
  });
  it("a client not saved yet isn't edited (it gets added as the example)", () => {
    expect(seed.mehtaHouseholdEdited(W, memoryStorage())).toBe(false);
  });
});

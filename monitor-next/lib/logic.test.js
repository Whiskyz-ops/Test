/* ============================================================================
 * Tests for the two confirmed-live bugs in logic.js / page.jsx's usage of it:
 *
 * 1. scopeToCountries (page.jsx) has no memoization and creates a brand-new
 *    array reference on every call for identical inputs whenever a filtered
 *    scope is active. That reference feeds `dataset`, which several
 *    `useMemo(..., [dataset])` calls in page.jsx depend on -- including
 *    `runAlertScan`, whose only real side effect (sendNotification) is
 *    documented as "production hook for email/Slack." As written today,
 *    an unrelated re-render while a filtered scope (e.g. "India") is active
 *    would re-fire every currently-approaching alert again.
 *
 * 2. runAlertScan is only ever called with one argument in page.jsx
 *    (runAlertScan(dataset), no prevRegions) -- so transitionAlerts's
 *    "became_exposed" critical-alert path can never fire in the running
 *    app, even though the function itself supports it.
 *
 * scopeToCountries itself lives inline in app/page.jsx (not exported from
 * logic.js), so it's reproduced verbatim here rather than imported -- see
 * the note above the copy below. If page.jsx's version changes, this copy
 * must be updated to match, and is the one thing that could silently drift.
 * ============================================================================*/
import { describe, it, expect, vi } from "vitest";
import { runAlertScan, sendNotification, approachingAlerts, transitionAlerts, STATUS } from "./logic";

// Verbatim copy of app/page.jsx's scopeToCountries (not exported from there).
function scopeToCountries(countries, scope) {
  if (scope === "India") return countries.filter((c) => c.id === "IN");
  if (scope === "Asia") return countries.filter((c) => c.continent === "Asia");
  if (["Canada", "Europe", "Latin America"].includes(scope)) return [];
  return countries;
}

const APPROACHING_REGION = {
  id: "IN", name: "India", continent: "Asia", mapName: "India",
  taxesWorldwide: true, estimatedTaxUsd: 0,
  residency: { test: "day-count", days: 180, threshold: 182 },
  reporting: null
};

describe("scopeToCountries (page.jsx) reference stability", () => {
  it("returns a NEW array reference on every call for identical inputs when a filter is active", () => {
    const countries = [APPROACHING_REGION];
    const first = scopeToCountries(countries, "India");
    const second = scopeToCountries(countries, "India");
    // Same content...
    expect(second).toEqual(first);
    // ...but NOT the same reference -- this is exactly what makes
    // `useMemo(() => runAlertScan(dataset), [dataset])` recompute (and
    // re-send every alert) on every unrelated re-render while this scope
    // is active. If this assertion ever fails because someone memoized
    // scopeToCountries, that's the fix landing -- update this test to
    // assert the opposite (same reference) instead of deleting it.
    expect(second).not.toBe(first);
  });

  it("does NOT create a new reference for the unfiltered ('All') case (informational -- shows the bug is scope-dependent)", () => {
    const countries = [APPROACHING_REGION];
    const first = scopeToCountries(countries, "All");
    const second = scopeToCountries(countries, "All");
    // "All" returns the same `countries` array unchanged (no .filter()
    // call) -- so this specific case is stable. The bug is specific to
    // "India"/"Asia"/the empty-array scopes, which all wrap or replace
    // the reference on every call.
    expect(second).toBe(first);
  });
});

describe("runAlertScan duplicate-notification bug (feeds the useMemo instability above)", () => {
  it("re-sends the same approaching alert every time it's called with a new (but equivalent) regions array", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const regionsCallA = scopeToCountries([APPROACHING_REGION], "India");
    const regionsCallB = scopeToCountries([APPROACHING_REGION], "India"); // different reference, same content
    expect(regionsCallB).not.toBe(regionsCallA);

    const alertsA = runAlertScan(regionsCallA);
    const alertsB = runAlertScan(regionsCallB);

    expect(alertsA).toHaveLength(1);
    expect(alertsB).toHaveLength(1);
    expect(alertsA[0].subject).toBe(alertsB[0].subject);
    // Two calls, two identical notifications actually "sent" -- this is the
    // concrete, observable consequence of the useMemo/reference-instability
    // bug: in the running app, every unrelated re-render while a filtered
    // scope is active would trigger exactly this duplicate call.
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("never fires transitionAlerts's 'became_exposed' alert, because page.jsx never calls runAlertScan with a second argument", () => {
    const prevRegions = [{ ...APPROACHING_REGION, estimatedTaxUsd: 0 }]; // was not exposed
    const currRegions = [{ ...APPROACHING_REGION, estimatedTaxUsd: 5000 }]; // now exposed

    // The function itself supports this correctly when called with both args:
    const direct = transitionAlerts(prevRegions, currRegions);
    expect(direct).toHaveLength(1);
    expect(direct[0].kind).toBe("became_exposed");

    // But runAlertScan as ACTUALLY called in page.jsx (single argument,
    // matching `runAlertScan(dataset)` at app/page.jsx) never passes
    // prevRegions, so this path is unreachable in the running app:
    const asActuallyCalledInPageJsx = runAlertScan(currRegions);
    expect(asActuallyCalledInPageJsx.some((a) => a.kind === "became_exposed")).toBe(false);
  });
});

describe("sendNotification (sanity check on the mock notifier itself)", () => {
  it("marks an alert as delivered and stamps a sentAt time", () => {
    const alert = { severity: "warning", channel: "email", subject: "test" };
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const sent = sendNotification(alert);
    expect(sent.delivered).toBe(true);
    expect(sent.sentAt).toBeTruthy();
    spy.mockRestore();
  });
});

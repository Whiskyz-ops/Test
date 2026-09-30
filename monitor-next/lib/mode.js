/* Investor mode — the default on the shared demo link.
 *
 * demo.wising.app shows only the built-in Rohan & Priya Mehta household (the
 * one example audited end to end: every value from the forms, both engines
 * agreeing — scripts/check-example-household.js). Demo profiles, "Add
 * Client" and the forms' example / create-profile buttons are hidden, so a
 * visitor exploring on their own can't land on unaudited data or create
 * half-filled profiles.
 *
 * ?mode=full switches this browser to the full demo (all profiles, every
 * control) and remembers it; ?mode=investor switches back. The forms
 * (router.html, layer1_india.html, layer1_us.html) read the same saved value.
 */
export const MODE_KEY = "wising_mode";
export const INVESTOR_CLIENT_IDS = ["c_rohan_mehta", "c_priya_mehta"];

export function resolveMode() {
  if (typeof window === "undefined") return "investor";
  let mode = null;
  try {
    const p = new URLSearchParams(window.location.search).get("mode");
    if (p === "full" || p === "investor") { mode = p; window.localStorage.setItem(MODE_KEY, p); }
    if (!mode) mode = window.localStorage.getItem(MODE_KEY);
  } catch (e) { /* storage blocked: default below */ }
  return mode === "full" ? "full" : "investor";
}

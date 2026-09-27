// W-2 work location for a US non-resident alien — the form-side mirror of
// prototypes/graph-pilot/aggregateusincome-nodes.js's w2WorkLocation (keep
// the two in step). An NRA is taxed by the US only on US-source income, and
// wages are US-source only for work done in the US, so a W-2 for work done
// from India isn't US income (ECI). Per row: entered workdays win; else 0 US
// days (confirmed by the Router) => all outside the US; 365+ => all in the
// US; else US days / 365 (estimate). Not an NRA => all US.

// Router state for the client this form is editing: mirrors store.js's
// storageKey() (plain key, or the ?client=<id> namespaced one).
export function readRouterState() {
  if (typeof window === "undefined") return {};
  try {
    const id = new URLSearchParams(window.location.search).get("client");
    const key = id ? `wising_client_${id}_router` : "wising_router_state";
    return JSON.parse(window.localStorage.getItem(key) || "{}") || {};
  } catch {
    return {};
  }
}

export function isNonResidentAlien(usState) {
  const rd = (usState && usState.us_residency_detail) || {};
  const nra = (usState && usState.nra_specific) || {};
  return rd.is_us_citizen !== true && rd.has_green_card !== true &&
    (rd.final_us_residency_status === "NON_RESIDENT_ALIEN" || nra.files_form_1040nr === true);
}

// Effective US days: null when unknown, and 0 only when the Router agrees
// (Layer 1 US defaults the field to 0 before its residency step is filled).
export function effectiveUsDays(usState, router) {
  const raw = usState && usState.us_residency_detail ? usState.us_residency_detail.us_days_current_year : null;
  let usDays = raw === null || raw === undefined || raw === "" ? null : Number(raw) || 0;
  const r = router || {};
  const zeroConfirmed = r.us_days === 0 || r.us_days === "0" || r.was_in_us_this_year === false;
  if (usDays === 0 && !zeroConfirmed) usDays = null;
  return usDays;
}

// { usShare, basis } for one W-2 row.
export function w2UsShare(row, usState, router) {
  if (!isNonResidentAlien(usState)) return { usShare: 1, basis: "not_nra" };
  const inUs = Number(row && row.workdays_in_us) || 0;
  const outUs = Number(row && row.workdays_outside_us) || 0;
  if (inUs + outUs > 0) return { usShare: inUs / (inUs + outUs), basis: "workdays" };
  const usDays = effectiveUsDays(usState, router);
  if (usDays === 0) return { usShare: 0, basis: "auto_outside_us" };
  if (usDays !== null && usDays >= 365) return { usShare: 1, basis: "auto_in_us" };
  if (usDays !== null) return { usShare: usDays / 365, basis: "estimated_days_present", usDays };
  return { usShare: 1, basis: "unanswered" };
}

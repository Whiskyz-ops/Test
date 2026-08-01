// Centralized derivation layer — pure functions computing cross-cutting
// values from the full usState tree.
//
// ARCHITECTURE FIX: the original layer1_us.html calls
// evaluateUSResidencyLock() (layer1_us.html:9256-9544) from EVERY relevant
// updateResidencyField()/updateProfileField() handler, so
// final_us_residency_status is always fresh no matter which panel is
// visible — the right-hand "Your Current Residency Status" certificate
// panel reads it live regardless of step. An earlier pass of this port
// computed it only inside ProfileStep.jsx's own useEffect, so it went stale
// the instant that step unmounted — the exact bug class that made the
// XState wizard machine's step-lock guards untrustworthy (they read a
// value that was only correct while one particular step happened to be
// mounted). store.js now calls applyDerivations() after every mutation, so
// this is always current, and both the XState guards (machine.js) and any
// component (RightPanel, ProfileStep, etc.) can read it directly off
// usState with no separate sync step required.

// ── evaluateResidencyLock() — ported from layer1_us.html:9256-9544. Drops
// two fields the canonical schema (schema.js) doesn't carry
// (us_days_excluded_*/_reason offset inputs, and the plain-SPT
// dual_status_arrival/departure_date pair) — noted inline, not silently
// dropped.
export function evaluateResidencyLock(usState) {
  const profile = usState.profile;
  const details = usState.us_residency_detail;

  const selectedType = profile.tax_entity_type || "individual";
  const entityType = selectedType === "llc" ? profile.llc_tax_election || "individual" : selectedType;
  const isCorpEntity = !["individual", "sole_prop", "farming"].includes(entityType);

  if (isCorpEntity) {
    const isDomestic = profile.incorporated_in_us === true;
    return {
      final_us_residency_status: isDomestic ? "DOMESTIC_ENTITY" : "FOREIGN_ENTITY",
      spt_day_count_weighted: details.spt_day_count_weighted,
      spt_test_met: details.spt_test_met,
      residency_start_date: null,
      residency_end_date: null,
      closer_connection_claim: details.closer_connection_claim,
      isExemptCurrentYear: false,
      exemptReason: "",
      cyDaysCount: 0,
      py1DaysCount: 0,
      py2DaysCount: 0,
    };
  }

  const py1Factor = 1 / 3;
  const py2Factor = 1 / 6;

  // simplified from layer1_us.html:9298-9300 — excluded-days offset fields
  // aren't in the canonical schema; weighted count uses raw day counts only.
  let cyDays = Math.max(0, details.us_days_current_year || 0);
  let py1Days = Math.max(0, details.us_days_minus_1_year || 0);
  let py2Days = Math.max(0, details.us_days_minus_2_years || 0);

  let isExemptCurrentYear = false;
  let exemptReason = "";
  const priorYears = details.exempt_prior_years_count || 0;

  if (details.exempt_individual_status === "f_student") {
    if (priorYears >= 5) {
      isExemptCurrentYear = !!details.exempt_student_closer_conn_exception;
      exemptReason = isExemptCurrentYear
        ? "Student tax-exemption extended beyond 5 years (Form 8843 Closer Connection claimed)"
        : `Student tax-exemption expired (5-year limit exceeded: ${priorYears} prior years; requires Closer Connection claim below)`;
    } else {
      isExemptCurrentYear = true;
      exemptReason = `Student tax-exemption active (Year ${priorYears + 1} of 5-year limit)`;
    }
  } else if (details.exempt_individual_status === "j_scholar") {
    if (priorYears >= 2) {
      isExemptCurrentYear = !!details.exempt_scholar_lookback_exception;
      exemptReason = isExemptCurrentYear
        ? "Scholar tax-exemption extended beyond 2 years (lookback rules exception active)"
        : `Scholar tax-exemption expired (2-year limit exceeded: ${priorYears} prior years; requires lookback exception below)`;
    } else {
      isExemptCurrentYear = true;
      exemptReason = `Scholar tax-exemption active (Year ${priorYears + 1} of 2-year limit)`;
    }
  } else if (details.exempt_individual_status === "g_diplomat") {
    isExemptCurrentYear = true;
    exemptReason = "Government/Diplomat tax-exemption active (indefinite limit)";
  } else if (details.exempt_individual_status === "professional_athlete") {
    isExemptCurrentYear = true;
    exemptReason = "Professional Athlete tax-exemption active (sports event days excluded)";
  }

  const cyDaysCount = cyDays;
  const py1DaysCount = py1Days;
  const py2DaysCount = py2Days;

  if (isExemptCurrentYear) {
    cyDays = 0;
    py1Days = 0;
    py2Days = 0;
  }

  const weighted = cyDays + py1Days * py1Factor + py2Days * py2Factor;
  const spt_day_count_weighted = Math.round(weighted * 100) / 100;
  const spt_test_met = (details.us_days_current_year || 0) >= 31 && weighted >= 183;

  const closer_connection_claim =
    spt_test_met && (details.us_days_current_year || 0) < 183 ? details.closer_connection_claim || false : null;

  let lock = "NON_RESIDENT_ALIEN";
  if (details.is_us_citizen) {
    lock = "US_CITIZEN";
  } else if (details.dtaa_treaty_residence === "india") {
    lock = "NON_RESIDENT_ALIEN";
  } else if (details.has_green_card && !details.i407_surrendered_date) {
    lock = "RESIDENT_ALIEN";
  } else if (spt_test_met && !closer_connection_claim) {
    // simplified from layer1_us.html:9448-9458 — original branches to
    // DUAL_STATUS here if dual_status_arrival_date/departure_date is set.
    // Those two fields aren't in the canonical schema, so a plain SPT pass
    // always resolves to full-year RESIDENT_ALIEN here.
    lock = "RESIDENT_ALIEN";
  } else if (details.first_year_choice_election || (details.has_green_card && details.i407_surrendered_date)) {
    lock = "DUAL_STATUS";
  }

  const calendarYear = usState.metadata?.us_calendar_year || new Date().getFullYear();
  let residency_start_date = null;
  let residency_end_date = null;
  if (lock === "US_CITIZEN" || lock === "RESIDENT_ALIEN") {
    residency_start_date = `${calendarYear}-01-01`;
    residency_end_date = `${calendarYear}-12-31`;
  } else if (lock === "DUAL_STATUS") {
    if (details.has_green_card && details.green_card_grant_date) {
      residency_start_date = details.green_card_grant_date;
    } else if (details.first_year_choice_election && details.first_year_choice_entry_date) {
      residency_start_date = details.first_year_choice_entry_date;
    }
    if (details.has_green_card && details.i407_surrendered_date) {
      residency_end_date = details.i407_surrendered_date;
    }
  }

  return {
    final_us_residency_status: lock,
    spt_day_count_weighted,
    spt_test_met,
    residency_start_date,
    residency_end_date,
    closer_connection_claim,
    isExemptCurrentYear,
    exemptReason,
    cyDaysCount,
    py1DaysCount,
    py2DaysCount,
  };
}

// ── applyNraFilingStatusGating() — ported from layer1_us.html:9607-9663.
// Force-reverts an already-set mfj/hoh/qss filing status back to "single"
// the instant the residency lock recomputes to NON_RESIDENT_ALIEN without a
// valid MFJ unlock (§6013(g) or §6013(h) election). This is a *side effect*
// of recompute, not just a gate on new selections — it has to run in the
// same central place the lock itself recomputes, or a filing status that
// becomes invalid because some OTHER field changed (e.g. unchecking "US
// Citizen") never gets corrected.
function applyNraFilingStatusGating(usState, lockResult) {
  if (lockResult.final_us_residency_status !== "NON_RESIDENT_ALIEN") return usState.profile.filing_status;
  const mfjUnlocked =
    usState.us_residency_detail.s6013g_joint_election === true ||
    usState.nra_specific?.s6013h_joint_election === true;
  const invalid =
    ["hoh", "qss"].includes(usState.profile.filing_status) ||
    (usState.profile.filing_status === "mfj" && !mfjUnlocked);
  return invalid ? "single" : usState.profile.filing_status;
}

// applyDerivations(usState) -> usState (new object, same shape, with every
// centrally-derived field refreshed). Called by store.js after every
// mutation. Only overwrites fields that actually changed to keep re-renders
// cheap, mirroring the original's "only touch the DOM node if the value
// differs" discipline.
export function applyDerivations(usState) {
  const lockResult = evaluateResidencyLock(usState);
  const details = usState.us_residency_detail;

  const detailsPatch = {
    final_us_residency_status: lockResult.final_us_residency_status,
    spt_day_count_weighted: lockResult.spt_day_count_weighted,
    spt_test_met: lockResult.spt_test_met,
    residency_start_date: lockResult.residency_start_date,
    residency_end_date: lockResult.residency_end_date,
    closer_connection_claim: lockResult.closer_connection_claim,
  };

  let detailsChanged = false;
  for (const [k, v] of Object.entries(detailsPatch)) {
    if (details[k] !== v) detailsChanged = true;
  }

  const nextFilingStatus = applyNraFilingStatusGating(usState, lockResult);
  const filingStatusChanged = nextFilingStatus !== usState.profile.filing_status;

  if (!detailsChanged && !filingStatusChanged) return usState;

  return {
    ...usState,
    us_residency_detail: detailsChanged ? { ...details, ...detailsPatch } : details,
    profile: filingStatusChanged ? { ...usState.profile, filing_status: nextFilingStatus } : usState.profile,
  };
}

// ── calculateComplexity() — ported from layer1_us.html:6343-6368. Purely
// cosmetic (drives the 5-segment "Estimated Complexity" meter on
// Onboarding), no tax logic depends on it. The original counts 11 distinct
// checkboxes (7 top-level setup cards PLUS 4 nested sub-checkboxes under
// "Investments" and "International" that this port's simplified 7-flag
// setup model doesn't have individual state for) via fixed count
// thresholds (>=1 -> lvl1, >=3 -> lvl2, >=4 -> lvl3, >=6 -> lvl4, ==8(of 8
// "real" checks) -> lvl5 — note the original's own comment block only
// meaningfully uses 8 of its 11 checks). Approximated here by scaling the
// same tier shape down to this port's 7 flags rather than fabricating
// sub-checkbox state — flagged as a simplification, not a silent guess.
export function calculateComplexity(setup) {
  const selectedCount = [
    setup.setupW2,
    setup.setupBiz,
    setup.setupProp,
    setup.setupRetirement,
    setup.setupEquity,
    setup.setupPassiveAny,
    setup.setupForeignAny,
  ].filter(Boolean).length;

  let meterLevel = 0;
  if (selectedCount >= 1) meterLevel = 1;
  if (selectedCount >= 2) meterLevel = 2;
  if (selectedCount >= 3) meterLevel = 3;
  if (selectedCount >= 5) meterLevel = 4;
  if (selectedCount >= 7) meterLevel = 5;
  return meterLevel;
}

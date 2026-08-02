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

  let next = usState;
  if (detailsChanged || filingStatusChanged) {
    next = {
      ...usState,
      us_residency_detail: detailsChanged ? { ...details, ...detailsPatch } : details,
      profile: filingStatusChanged ? { ...usState.profile, filing_status: nextFilingStatus } : usState.profile,
    };
  }

  return applyBusinessIncomeDerivations(next);
}

// ── Self-employment (Schedule C) derived aggregates — ported from
// layer1_us.html:13569-13658's syncSeState(). Two things the live form
// recomputes on every keystroke that a naive controlled-input binding would
// otherwise lose entirely:
//   1. expenses_usd — the flat scalar aggregate_us_income.py's
//      _compute_self_employment_net_profit_usd() actually reads (line 58) —
//      is a SUM of itemized_expenses{}, never something a user fills in
//      directly.
//   2. The "Self-Employed Above-The-Line Deductions" card's flat
//      se_health_insurance_deduction_usd/se_retirement_deduction_usd fields
//      (what ustax.py:661-662 actually reads for the Schedule 1 deduction)
//      are fed by summing every business row's own se_health_insurance_usd/
//      se_retirement_contrib_usd; the flat card's own manual entry only
//      stands if no business reports either amount — matching the source's
//      own comment at layer1_us.html:13638-13646 ("without this, per-business
//      entries were pure decoration, silently discarded").
const SE_ITEMIZED_EXPENSE_KEYS = [
  "advertising",
  "contract_labor",
  "insurance",
  "legal_professional",
  "business_meals",
  "office_expenses",
  "rent_lease",
  "repairs_maintenance",
  "supplies",
  "utilities",
  "taxes_and_licenses",
  "travel",
  "commissions",
  "other",
];

// ── Farm (Schedule F) — ported from layer1_us.html:14148-14195's
// syncFarmState(): expenses_usd is likewise a flat sum of itemized_expenses{}
// (aggregate_us_income.py:82's _compute_farm_net_profit_usd reads it the same
// way SE's does). No above-the-line-deduction feeder equivalent exists for
// farm rows in the source.
const FARM_ITEMIZED_EXPENSE_KEYS = [
  "chemicals",
  "conservation",
  "custom_hire",
  "employee_benefits",
  "feed",
  "fertilizers",
  "freight",
  "gas_fuel_oil",
  "insurance",
  "interest_mortgage",
  "interest_other",
  "labor_hired",
  "pension",
  "rent_machinery",
  "rent_other",
  "repairs",
  "seeds",
  "storage",
  "supplies",
  "taxes",
  "utilities",
  "veterinary",
  "other",
];

function deriveItemizedExpenseRows(rows, keys) {
  let changed = false;
  const next = rows.map((row) => {
    const itemized = row.itemized_expenses || {};
    const sum = keys.reduce((s, k) => s + (Number(itemized[k]) || 0), 0);
    if ((Number(row.expenses_usd) || 0) === sum) return row;
    changed = true;
    return { ...row, expenses_usd: sum };
  });
  return { rows: next, changed };
}

function applyBusinessIncomeDerivations(usState) {
  const iu = usState.income_us_source || {};
  const seRows = iu.self_employment || [];
  const farmRows = iu.farming_schedule_f || [];
  if (seRows.length === 0 && farmRows.length === 0) return usState;

  const { rows: nextSeRows, changed: seRowsChanged } = deriveItemizedExpenseRows(seRows, SE_ITEMIZED_EXPENSE_KEYS);
  const { rows: nextFarmRows, changed: farmRowsChanged } = deriveItemizedExpenseRows(farmRows, FARM_ITEMIZED_EXPENSE_KEYS);

  const healthSum = nextSeRows.reduce((s, r) => s + (Number(r.se_health_insurance_usd) || 0), 0);
  const retSum = nextSeRows.reduce((s, r) => s + (Number(r.se_retirement_contrib_usd) || 0), 0);

  const nextHealthDed = healthSum > 0 ? healthSum : iu.se_health_insurance_deduction_usd;
  const nextRetDed = retSum > 0 ? retSum : iu.se_retirement_deduction_usd;

  const iuChanged =
    seRowsChanged ||
    farmRowsChanged ||
    nextHealthDed !== iu.se_health_insurance_deduction_usd ||
    nextRetDed !== iu.se_retirement_deduction_usd;

  if (!iuChanged) return usState;

  return {
    ...usState,
    income_us_source: {
      ...iu,
      self_employment: nextSeRows,
      farming_schedule_f: nextFarmRows,
      se_health_insurance_deduction_usd: nextHealthDed,
      se_retirement_deduction_usd: nextRetDed,
    },
  };
}

// ── deriveSetupFlags() — ported from layer1_us.html:20738-20828 (a
// behavioral-diff fix dated 25 Jul 2026 in the source itself, whose own
// comment says it was confirmed via a real profile diff that omitting this
// "silently dropped a trust K-1's $4,900 from AGI/AMTI/NIIT" because the
// gating flag never derived true for data that didn't arrive via wizard
// clicks). The 7 top-level + 6 nested "setup" checkboxes gate which sidebar
// phases/steps are even visible (isPhaseVisible/isStepButtonVisible in
// machine.js) — they're pure UI-gating state, not tax data, so they live in
// useOnboardingSetup, not usState. But if they're only ever set by a user's
// own clicks, any usState arriving another way (a saved session reloaded
// fresh, a persona/profile prefill) leaves real data sitting behind a
// hidden, still-locked phase. This derives every flag from the actual
// underlying data so the gate reopens itself; callers OR this with
// whatever's already set (see useOnboardingSetup's hydrateFromUsState) so
// an explicit manual check on an otherwise-empty section still holds.
export function deriveSetupFlags(usState) {
  const iu = usState.income_us_source || {};
  const hasForeignAssets = !!(
    (usState.bank_accounts || []).some((b) => b.country && b.country !== "US" && b.country !== "United States") ||
    (usState.fbar_aggregate_peak_usd || 0) > 0
  );
  // Source also ORs in `foreign_entities.has_pfics`, a field this schema
  // doesn't have at all — PFIC data lives on financial_holdings[] instead
  // (see BanksStep.jsx), already covered by hasForeignAssets above for the
  // FBAR/FATCA gate that data actually feeds. Adapted to the two real
  // foreign-entity-ownership fields this schema has instead.
  const fe = usState.foreign_entities || {};
  const hasForeignEntities = !!(
    fe.owns_10_percent_foreign_corp ||
    fe.owns_10_percent_foreign_partnership ||
    (fe.foreign_corporations && fe.foreign_corporations.length) ||
    (fe.foreign_partnerships && fe.foreign_partnerships.length)
  );
  const hasForeignFeie = !!(usState.foreign_earned_income && usState.foreign_earned_income.claims_feie);
  const fgt = usState.foreign_gifts_and_trusts || {};
  const hasForeignGifts = !!(
    fgt.received_foreign_gifts_above_100k ||
    fgt.received_gift_from_covered_expatriate ||
    fgt.is_us_beneficiary_of_foreign_trust ||
    (fgt.foreign_trust_details && fgt.foreign_trust_details.length)
  );
  const hasPassiveIntDiv = (iu.interest_us_source_usd || 0) > 0 || (iu.ordinary_dividends_us_source_usd || 0) > 0;
  const hasPassiveCapGains = (iu.ltcg_us_source_usd || 0) > 0;

  return {
    setupW2: !!(iu.has_employment_income || (iu.wages_w2 && iu.wages_w2.length > 0)),
    setupBiz: !!(
      (iu.self_employment && iu.self_employment.length) ||
      (iu.partnerships_k1 && iu.partnerships_k1.length) ||
      (iu.s_corporations_k1 && iu.s_corporations_k1.length) ||
      (iu.c_corporations_1120 && iu.c_corporations_1120.length) ||
      (iu.farming_schedule_f && iu.farming_schedule_f.length) ||
      (iu.trusts_estates_k1 && iu.trusts_estates_k1.length)
    ),
    setupPassiveAny: hasPassiveIntDiv || hasPassiveCapGains,
    setupProp: !!(usState.real_estate && usState.real_estate.has_real_estate_transaction),
    setupForeignAny: hasForeignAssets || hasForeignEntities || hasForeignFeie || hasForeignGifts,
    setupRetirement: !!(
      usState.retirement_accounts &&
      Object.keys(usState.retirement_accounts).some((k) => (usState.retirement_accounts[k] || 0) > 0)
    ),
    setupEquity: !!(
      usState.equity_compensation &&
      ((usState.equity_compensation.iso_exercises && usState.equity_compensation.iso_exercises.length) ||
        (usState.equity_compensation.rsu_vestings && usState.equity_compensation.rsu_vestings.length) ||
        (usState.equity_compensation.espp_purchases && usState.equity_compensation.espp_purchases.length))
    ),
    setupForeignAssets: hasForeignAssets,
    setupForeignFeie: hasForeignFeie,
    setupForeignEntities: hasForeignEntities,
    setupForeignGifts: hasForeignGifts,
    setupPassiveIntDiv: hasPassiveIntDiv,
    setupPassiveCapGains: hasPassiveCapGains,
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

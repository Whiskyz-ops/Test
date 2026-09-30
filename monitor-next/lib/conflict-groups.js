// Root-cause grouping for the Monitor's Conflicts & Mismatches panel.
//
// The engine emits ~70 independent findings; several usually share one cause
// (e.g. salary taxed by both countries surfaces as the US-work salary
// conflict, an FTC shortfall and an FEIE issue). This groups them by root
// cause so the panel leads with "what is costing this client money, and what
// to do", with the individual checks underneath. Display-only: the engine and
// its findings are unchanged.

export const GROUPS = [
  { key: "double_tax", title: "Same income taxed by both countries",
    action: "Claim the relief that's missing: the US credit (Form 1116), or India's relief / refund (§159 and Form 44, DTAA)." },
  { key: "payments", title: "Penalties, interest & payment deadlines",
    action: "Pay the shortfall or advance tax before the next due date to stop interest building." },
  { key: "docs", title: "Missing treaty paperwork & documents",
    action: "File the missing forms (TRC, Form 41 (formerly Form 10F), W-8BEN, PAN–Aadhaar link) to unlock treaty rates and refunds." },
  { key: "residency", title: "Residency & treaty position",
    action: "Settle residency in each country and the treaty tie-break — every other figure depends on it." },
  { key: "feie", title: "Foreign earned income exclusion",
    action: "Confirm FEIE eligibility, or switch to the foreign tax credit." },
  { key: "mismatch", title: "Income treated differently by each country",
    action: "Align how each country classifies, times and values this income before filing." },
  { key: "disclosure", title: "Foreign asset & entity reporting",
    action: "File the disclosure returns (FBAR, Form 8938, Schedule FA, 5471, 3520) — penalties apply even with no tax due." },
  { key: "us_only", title: "US-only taxes & contribution limits",
    action: "Review these US-side items; the other country gives no relief for them." },
  { key: "other", title: "Other checks", action: "Review each item below." }
];

const BY_ID = {
  double_tax: ["joint_return_spouse_income_india", "india_tds_refund_due", "joint_return_household_linked", "joint_return_spouse_profile_missing", "joint_return_spouse_two_earner_signs", "joint_return_nra_spouse_no_election", "joint_return_spouse_id_missing", "joint_return_spouse_unknown", "salary_not_taxable_india_tds", "us_withholding_outside_us_wages", "salary_us_work_india_tax", "ftc_gap", "ftc_available", "form67_required", "niit_medicare_not_creditable",
    "no_totalization_agreement", "cross_basis_summary"],
  payments: ["india_advance_tax_interest", "underpayment_2210", "early_withdrawal_penalty_72t"],
  docs: ["treaty_docs_missing", "withholding_documentation_gap", "pan_not_linked_aadhaar", "form_10iea", "india_itr_form_mismatch",
    "iso_3921", "nra_w8ben_missing", "itin_application_required", "us_pension_withholding_no_w8ben"],
  residency: ["dtaa_16_2_short_stay_us", "dtaa_16_2_short_stay_india", "dual_residency", "dual_residency_resolved", "entity_dual_residency_poem", "dtaa_treaty_elections", "pe_article7",
    "state_treaty_not_binding", "treaty_rate_not_recognized", "us_dual_status_split_year", "nra_fdap_flat_rate",
    "nra_article_21_2_standard_deduction", "nra_eci_fdap_classification_check", "nra_j1_article_21_2_review",
    "treaty_saving_clause_citizen", "greencard_treaty_nonresident"],
  feie: ["feie_ineligible", "feie_applied"],
  mismatch: ["tax_year_mismatch", "fx_basis", "retirement_mismatch", "deemed_dividend_buyback_mismatch", "equity_comp_sourcing",
    "promoter_buyback_additional_tax", "special_rate_gaming_winnings", "chapter_xiia_elected_no_holdings",
    "chapter_xiia_investment_income_missing", "chapter_xiia_investment_income_computed", "s115bbe_unexplained_income",
    "carry_forward_losses_not_applied", "presumptive_lockin_active_india", "msme_disallowance_s43Bh_india",
    "us_social_security_india_exempt", "nra_art15_services_exempt"],
  disclosure: ["fbar_limit", "schedule_fa_inconsistent", "pfic", "cfc", "cfc_below_threshold", "transfer_pricing", "foreign_gift_3520",
    "covered_expat_gift_tax", "black_money_act_exposure", "form_1099da_awareness", "lrs_limit", "firpta",
    "us_covered_expatriate_exit_tax", "us_ltr_expatriation_not_covered"],
  us_only: ["nra_us_interest_exempt", "amt_applies", "state_income_tax", "us_entity_state_tax", "us_entity_state_tax_not_modeled", "retirement_excess_elective_deferral",
    "retirement_excess_ira_contribution", "hsa_excess_contribution", "retirement_rmd_required", "trump_account_contribution_limit"]
};
const GROUP_OF = {};
Object.keys(BY_ID).forEach((g) => BY_ID[g].forEach((id) => { GROUP_OF[id] = g; }));

// Findings whose amount is tax actually lost or avoidable (unrelieved double
// tax, penalties/interest, avoidable withholding) — what "at risk" sums.
// Others carry amounts that aren't losses (a state's total tax, an income
// figure, an exposure) and are shown per row but not added up.
export const AT_RISK_IDS = new Set(["salary_not_taxable_india_tds", "us_withholding_outside_us_wages", "salary_us_work_india_tax", "ftc_gap", "withholding_documentation_gap",
  "us_pension_withholding_no_w8ben",
  "india_advance_tax_interest", "underpayment_2210", "early_withdrawal_penalty_72t"]);

export function groupOf(id) {
  if (GROUP_OF[id]) return GROUP_OF[id];
  if (/^holding_period_mismatch/.test(id)) return "mismatch";
  if (/^residency_status_/.test(id)) return "residency";
  return "other";
}

const SEV_RANK = { critical: 3, warning: 2, info: 1 };

export function groupFindings(findings) {
  const map = {};
  (findings || []).forEach((f) => {
    const key = groupOf(f.id);
    if (!map[key]) map[key] = [];
    map[key].push(f);
  });
  return GROUPS.filter((g) => map[g.key]).map((g) => {
    const items = map[g.key];
    const severity = items.reduce((s, f) => (SEV_RANK[f.severity] > SEV_RANK[s] ? f.severity : s), "info");
    const atRiskUsd = items.reduce((s, f) => s + (AT_RISK_IDS.has(f.id) ? f.amountUsd || 0 : 0), 0);
    return { ...g, items, severity, atRiskUsd };
  }).sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (b.atRiskUsd - a.atRiskUsd) || (b.items.length - a.items.length));
}

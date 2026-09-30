/* ============================================================================
 * household-link.js — spouse link between two clients (docs/HOUSEHOLD_DESIGN.md
 * sections 1-2, build step 1). Python mirror: dag_py/src/wising_dag/household/link.py.
 *
 * Each spouse is their own client; us.profile.spouse_client_id on each points
 * at the other. checkHouseholdLink(a, b) takes the two clients
 * ({id, router, india, us}; b null when the linked id doesn't exist) and returns
 *   { linked, status, errors: [{code, message}], tiers: {<id>: "light"|"full"} }.
 * Every error blocks the household calculation (build step 3).
 *
 * Shared items (section 3, build step 2): the same bank account, holding or
 * property in both profiles, an invalid co-owner share, and — on a joint
 * return — household items in both profiles or in the profile that isn't
 * meant to hold them.
 *
 * Spouse tier (decision 2, option B): a spouse with no amounts entered outside
 * identity/residency and no Indian side is a "light" profile (lower price or
 * free); any income, account or Indian return makes it "full".
 * ==========================================================================*/
(function (root) {
  "use strict";

  var LINK_STATUSES = { mfj: true, mfs: true };
  // Sections that describe the person, not work to be done on a return.
  var IDENTITY_SECTIONS = { profile: true, us_residency_detail: true, state_residency: true, metadata: true, nra_specific: true };

  function get(o, path, dflt) {
    var cur = o;
    var parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return dflt;
      cur = cur[parts[i]];
    }
    return cur === undefined ? dflt : cur;
  }

  function filingStatus(c) {
    var s = String(get(c, "us.profile.filing_status", "single") || "single").toLowerCase();
    if (s === "married_filing_jointly") return "mfj";
    if (s === "married_filing_separately") return "mfs";
    if (s === "head_of_household") return "hoh";
    return s;
  }

  function taxYear(c) {
    var y = get(c, "router.base_tax_year", null);
    if (y == null) y = get(c, "us.metadata.us_calendar_year", null);
    return y == null ? null : Number(y);
  }

  function isCitizen(c) {
    return get(c, "us.us_residency_detail.is_us_citizen", false) === true || get(c, "router.is_us_citizen", false) === true;
  }

  function isNra(c) {
    if (isCitizen(c) || get(c, "us.us_residency_detail.has_green_card", false) === true) return false;
    return get(c, "us.us_residency_detail.final_us_residency_status", null) === "NON_RESIDENT_ALIEN" ||
      get(c, "us.nra_specific.files_form_1040nr", false) === true;
  }

  // Nothing answered yet on US residency (a new spouse profile): Layer 0
  // (where citizenship / green card are answered) is blank, the US form holds
  // only its defaults (no "yes" anywhere) and there are no US days — reported
  // as "fill this in", not as a non-resident alien.
  function residencyUnanswered(c) {
    var answered = function (v) { return v === true || v === false; };
    if (answered(get(c, "router.is_us_citizen", null)) || answered(get(c, "router.has_green_card", null))) return false;
    if (get(c, "us.us_residency_detail.is_us_citizen", null) === true || get(c, "us.us_residency_detail.has_green_card", null) === true) return false;
    return !(Number(get(c, "router.us_days", 0)) > 0) && !(Number(get(c, "us.us_residency_detail.us_days_current_year", 0)) > 0);
  }

  function hasJointElection(c) {
    return get(c, "us.nra_specific.s6013h_joint_election", false) === true ||
      get(c, "us.us_residency_detail.s6013g_joint_election", false) === true;
  }

  // Any positive amount anywhere under v (numbers or numeric strings).
  function anyAmount(v) {
    if (v == null) return false;
    if (typeof v === "number") return v > 0;
    if (typeof v === "string") { var n = Number(v.replace(/,/g, "")); return v.trim() !== "" && isFinite(n) && n > 0; }
    if (Array.isArray(v)) return v.some(anyAmount);
    if (typeof v === "object") return Object.keys(v).some(function (k) { return anyAmount(v[k]); });
    return false;
  }

  function spouseTier(c) {
    var j = String(get(c, "router.primary_jurisdiction", get(c, "router.jurisdiction", "")) || "");
    var indiaSide = j === "india" || j === "cross_border" || j === "single_india" || j === "dual" || anyAmount(c.india);
    var us = c.us || {};
    var usWork = Object.keys(us).some(function (k) { return !IDENTITY_SECTIONS[k] && anyAmount(us[k]); });
    return indiaSide || usWork ? "full" : "light";
  }

  function name(c) {
    return get(c, "router.full_name", null) || get(c, "us.profile.full_name", null) || (c && c.label) || (c && c.id) || "the spouse";
  }

  // Shared items (docs/HOUSEHOLD_DESIGN.md section 3). Household-level items
  // are entered in ONE profile of a joint return. SALT is left out: the form's
  // single field mixes each person's state income tax with shared property tax.
  var HOUSEHOLD_FIELDS = [
    "us.profile.dependents_count",
    "us.itemized_deductions_and_credits.mortgage_interest_paid_usd",
    "us.itemized_deductions_and_credits.charitable_contributions_cash_usd",
    "us.itemized_deductions_and_credits.charitable_contributions_appreciated_usd",
    "us.itemized_deductions_and_credits.medical_expenses_usd",
    "us.itemized_deductions_and_credits.child_and_dependent_care_expenses_usd",
    "us.itemized_deductions_and_credits.child_tax_credit_dependents",
    "us.itemized_deductions_and_credits.credit_for_other_dependents",
    "us.itemized_deductions_and_credits.education_credits_aotc_usd",
    "us.itemized_deductions_and_credits.education_credits_llc_usd",
    "us.itemized_deductions_and_credits.529_contributions_usd",
    "us.withholding_and_estimated.estimated_tax_q1_apr15_usd",
    "us.withholding_and_estimated.estimated_tax_q2_jun15_usd",
    "us.withholding_and_estimated.estimated_tax_q3_sep15_usd",
    "us.withholding_and_estimated.estimated_tax_q4_jan15_usd",
    "us.withholding_and_estimated.prior_year_total_tax_usd"
  ];

  function hasHouseholdItems(c) {
    return HOUSEHOLD_FIELDS.some(function (f) { return anyAmount(get(c, f, null)); });
  }

  function norm(v) { return String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]/g, ""); }

  // Identity keys of the rows that must not appear in both profiles.
  function sharedKeys(c) {
    var out = [];
    (get(c, "us.bank_accounts", []) || []).forEach(function (r) {
      if (r && norm(r.account_number_last_four) && norm(r.bank_name)) out.push({ key: "bank:" + norm(r.bank_name) + ":" + norm(r.account_number_last_four), label: "bank account " + r.bank_name + " ••" + r.account_number_last_four });
    });
    (get(c, "us.financial_holdings", []) || []).forEach(function (r) {
      if (r && norm(r.broker_or_institution) && norm(r.asset_name)) out.push({ key: "holding:" + norm(r.broker_or_institution) + ":" + norm(r.asset_name), label: "holding " + r.asset_name + " at " + r.broker_or_institution });
    });
    (get(c, "us.real_estate.properties", []) || []).forEach(function (r) {
      if (r && norm(r.property_description)) out.push({ key: "property:" + norm(r.property_description), label: "property " + r.property_description });
    });
    return out;
  }

  function jointRows(c) {
    var rows = [];
    ["us.bank_accounts", "us.financial_holdings", "us.real_estate.properties"].forEach(function (p) {
      (get(c, p, []) || []).forEach(function (r) { if (r && r.is_joint_owner_spouse === true) rows.push(r); });
    });
    return rows;
  }

  // Audit row F8: interest on India accounts held jointly — each spouse
  // enters the full interest and their share of the money; the two entries
  // must agree, or the interest is taxed twice or not at all.
  function jointInterest(c) {
    var total = Number(get(c, "india.other_sources.joint_account_interest_inr", 0)) || 0;
    if (!(total > 0)) return null;
    var p = get(c, "india.other_sources.joint_account_own_share_percent", null);
    p = p == null || p === "" || !isFinite(Number(p)) ? 100 : Number(p);
    return { total: total, pct: p };
  }
  function jointTds(c) {
    var tds = Number(get(c, "india.tax_credits.joint_account_tds_inr", 0)) || 0;
    if (!(tds > 0)) return null;
    return { tds: tds, first: get(c, "india.tax_credits.joint_account_first_holder", null), declared: get(c, "india.tax_credits.joint_account_tds_37ba_declared", null) === true };
  }
  function checkJointInterest(a, b, err) {
    var ta = jointTds(a), tb = jointTds(b);
    if (ta && tb) {
      if (Math.abs(ta.tds - tb.tds) > 1) {
        err("joint_tds_mismatch", "TDS on the joint accounts differs: ₹" + ta.tds + " on " + name(a) + "'s India profile, ₹" + tb.tds + " on " + name(b) + "'s. Both should show the full TDS in the first holder's Form 26AS.");
      } else if (!ta.first || !tb.first || ta.first === tb.first) {
        err("joint_tds_first_holder", "The joint accounts' first holder must be set on both India profiles — \"self\" on one and \"spouse\" on the other.");
      } else if (ta.declared !== tb.declared) {
        err("joint_tds_declaration_mismatch", "One India profile says the rule 37BA declaration was filed with the bank and the other says it wasn't. The TDS credit follows the declaration, so both must agree.");
      }
    }
    var ja = jointInterest(a), jb = jointInterest(b);
    if (ja && jb) {
      if (Math.abs(ja.total - jb.total) > 1) {
        err("joint_interest_mismatch", "Joint-account interest differs: ₹" + ja.total + " on " + name(a) + "'s India profile, ₹" + jb.total + " on " + name(b) + "'s. Both should show the full interest credited.");
      } else if (Math.abs(ja.pct + jb.pct - 100) > 0.5) {
        err("joint_interest_share_sum", "Shares of the joint-account money add up to " + (ja.pct + jb.pct) + "% (" + name(a) + " " + ja.pct + "%, " + name(b) + " " + jb.pct + "%). They must add up to 100%.");
      }
      return;
    }
    [[a, ja, b], [b, jb, a]].forEach(function (t) {
      if (t[1] && t[1].pct < 100 && get(t[2], "india.other_sources.has_other_sources_income", false) === true) {
        err("joint_interest_missing_on_spouse", name(t[0]) + " is taxed on " + t[1].pct + "% of ₹" + t[1].total + " joint-account interest; the other " + (100 - t[1].pct) + "% isn't on " + name(t[2]) + "'s India profile.");
      }
    });
  }

  function checkSharedItems(a, b, err) {
    var seen = {};
    sharedKeys(a).forEach(function (k) { seen[k.key] = k.label; });
    var dup = {};
    sharedKeys(b).forEach(function (k) {
      if (seen[k.key] && !dup[k.key]) {
        dup[k.key] = true;
        err("duplicate_shared_item", "The " + k.label + " is entered in both profiles. Enter it once, in the owner's profile, marked co-owned with the spouse.");
      }
    });
    [a, b].forEach(function (c) {
      jointRows(c).forEach(function (r) {
        var v = r.owner_share_percent;
        if (v != null && !(Number(v) > 0 && Number(v) <= 100)) {
          err("joint_share_invalid", name(c) + ": a co-owned item has a share of " + v + "%. The share must be above 0 and at most 100.");
        }
      });
    });
    checkJointInterest(a, b, err);
    if (filingStatus(a) !== "mfj" || filingStatus(b) !== "mfj") return;
    var oa = get(a, "us.profile.household_items_owner", null), ob = get(b, "us.profile.household_items_owner", null);
    if (oa && ob && oa === ob) {
      err("household_owner_conflict", "Both profiles say household items are entered in " + (oa === "self" ? "their own" : "the other") + " profile. Pick one profile for them.");
    }
    var ha = hasHouseholdItems(a), hb = hasHouseholdItems(b);
    if (ha && hb) {
      err("household_items_both", "Household items (dependents, childcare, charity, mortgage interest, estimated payments, last year's tax) are entered in both profiles. On a joint return enter them once, in one profile.");
    } else {
      [[a, ha, oa], [b, hb, ob]].forEach(function (t) {
        if (t[1] && t[2] === "spouse") {
          err("household_items_in_non_owner", name(t[0]) + "'s profile has household items, but household items were set to be entered in the spouse's profile.");
        }
      });
    }
  }

  function checkHouseholdLink(a, b) {
    var spouseId = get(a, "us.profile.spouse_client_id", null);
    var out = { linked: false, status: filingStatus(a), spouseId: spouseId, errors: [], tiers: {} };
    if (!spouseId) return out;
    out.linked = true;
    function err(code, message) { out.errors.push({ code: code, message: message }); }

    if (spouseId === a.id) { err("self_link", "The spouse link points at this client itself."); return out; }
    if (!b) { err("missing_spouse", "The linked spouse profile no longer exists. Re-link or remove the link."); return out; }
    out.tiers[b.id] = spouseTier(b);

    if (get(b, "us.profile.spouse_client_id", null) !== a.id) {
      err("half_link", name(b) + "'s profile doesn't link back to this client. Both profiles must point at each other.");
    }
    var sa = filingStatus(a), sb = filingStatus(b);
    if (!LINK_STATUSES[sa]) {
      err("status_not_married", "Filing status is " + sa.toUpperCase() + "; a spouse link needs married filing jointly or separately.");
    } else if (sa !== sb) {
      err("status_mismatch", "Filing status differs: " + sa.toUpperCase() + " here, " + sb.toUpperCase() + " on " + name(b) + "'s profile.");
    }
    var ya = taxYear(a), yb = taxYear(b);
    if (ya != null && yb != null && ya !== yb) {
      err("year_mismatch", "Tax year differs: " + ya + " here, " + yb + " on " + name(b) + "'s profile.");
    }
    if (sa === "mfj" && sb === "mfj") {
      [a, b].forEach(function (c) {
        if (residencyUnanswered(c)) {
          err("spouse_residency_incomplete", name(c) + "'s US residency isn't filled in yet (citizenship, green card, days in the US). Complete it in their US profile — if they turn out to be a non-resident alien, a joint return also needs the §6013(g) or §6013(h) election.");
        } else if (isNra(c) && !hasJointElection(a) && !hasJointElection(b)) {
          err("nra_spouse_no_election", name(c) + " is a non-resident alien. A joint return needs the §6013(g) or §6013(h) election (IRC §6013(a)(1)).");
        }
      });
    }
    [a, b].forEach(function (c) {
      if (isCitizen(c) && get(c, "us.us_residency_detail.final_us_residency_status", null) === "NON_RESIDENT_ALIEN") {
        err("citizen_marked_nra", name(c) + " is a US citizen but marked non-resident alien. A citizen is always taxed as a US person (DTAA Art. 1(3) saving clause).");
      }
    });
    checkSharedItems(a, b, err);
    return out;
  }

  var api = { checkHouseholdLink: checkHouseholdLink, spouseTier: spouseTier };
  var W = root.WISING = root.WISING || {};
  W.householdLink = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

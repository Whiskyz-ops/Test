/* ============================================================================
 * household-seed.js — an example married household as two real (registry)
 * clients: Rohan Mehta (a copy of the us_resident_indian_income demo's data)
 * and his spouse Priya Mehta (invented for this example), linked both ways
 * (docs/HOUSEHOLD_DESIGN.md). The Monitor's "Add Rohan & Priya Mehta" button
 * writes (or resets) them in the browser's client registry, and
 * ensureMehtaHousehold adds them automatically on every page load when this
 * browser doesn't have them yet; the demo profile is left untouched.
 *
 * Priya: green-card holder in New York, $90,000 W-2 with an $8,000 401(k)
 * deferral; non-resident of India with ₹1,20,000 of NRO fixed-deposit
 * interest (her own Indian return). Joint US return; household items
 * (none on file yet) are entered in Rohan's profile.
 *
 * The data written is household-seed-data.js: both clients exactly as the
 * forms save them. buildOriginalMehtaHousehold is the hand-written starting
 * point that data was captured from (kept only to regenerate it).
 * ==========================================================================*/
(function (root) {
  "use strict";

  var ROHAN_ID = "c_rohan_mehta";
  var PRIYA_ID = "c_priya_mehta";

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // The two clients as the forms save them (household-seed-data.js).
  function buildMehtaHousehold(W) {
    var data = (W && W.householdSeedData) || (typeof require === "function" ? require("./household-seed-data.js") : null);
    if (!data) return buildOriginalMehtaHousehold(W);
    return [[ROHAN_ID, "Rohan Mehta"], [PRIYA_ID, "Priya Mehta"]].map(function (t) {
      var c = data[t[0]];
      return { id: t[0], label: t[1], router: clone(c.router), india: clone(c.india), us: clone(c.us) };
    });
  }

  function buildOriginalMehtaHousehold(W) {
    var demo = (W.PROFILES || []).filter(function (p) { return p.id === "us_resident_indian_income"; })[0];
    if (!demo) throw new Error("us_resident_indian_income demo profile not loaded");
    var rohan = { id: ROHAN_ID, label: "Rohan Mehta", router: clone(demo.router), india: clone(demo.india), us: clone(demo.us) };
    rohan.us.profile.filing_status = "mfj";
    rohan.us.profile.spouse_client_id = PRIYA_ID;
    rohan.us.profile.household_items_owner = "self";
    rohan.us.profile.spouse_is_us_person = true;

    var year = rohan.router.base_tax_year || 2026;
    var priya = {
      id: PRIYA_ID, label: "Priya Mehta",
      router: {
        jurisdiction: "dual", base_tax_year: year, full_name: "Priya Mehta", date_of_birth: "1987-07-14",
        is_us_citizen: false, has_green_card: true, us_days: 350, has_us_source_income_or_assets: true
      },
      india: {
        profile: { full_name: "Priya Mehta", entity_type: "individual", date_of_birth: "1987-07-14", pan: "BQXPM4411K", tax_regime: "NEW", pan_aadhaar_linked: true },
        residency_detail: { days_in_india_current_year: 12, india_work_days_current_year: 0, final_india_residency_status: "NR" },
        bank_accounts: [{ bank_name: "HDFC Bank (NRO)", account_type: "nro", peak_balance_inr: 1500000 }],
        domestic_income: { salary: { has_salary_income: false } },
        other_sources: { has_other_sources_income: true, interest_fd_rd_inr: 120000 },
        deductions: {},
        tax_credits: { tds_entries: [{ source: "interest", payer_name: "HDFC Bank (NRO fixed deposit)", income_inr: 120000, tds_inr: 37440 }] },
        metadata: { schema_version: "layer1_india_v5_1", financial_year: "TY" + year + "-" + String(year + 1).slice(2) }
      },
      us: {
        profile: { tax_entity_type: "individual", full_name: "Priya Mehta", date_of_birth: "1987-07-14", filing_status: "mfj", ssn_or_itin_type: "ssn",
          spouse_client_id: ROHAN_ID, household_items_owner: "spouse", spouse_is_us_person: true },
        us_residency_detail: { is_us_citizen: false, has_green_card: true, us_days_current_year: 350, spt_test_met: true, final_us_residency_status: "RESIDENT_ALIEN", dtaa_treaty_residence: "none" },
        state_residency: { primary_state_of_residence: "NY" },
        income_us_source: { has_employment_income: true, wages_w2: [{ employer_name: "Mount Sinai Health System", wages_box1_usd: 90000,
          tax_details_collapsed_by_default: { federal_tax_withheld_usd: 11000, medicare_wages_box5_usd: 98000 } }] },
        income_foreign_source: { foreign_interest_usd: 1446 },
        retirement_accounts: { "401k_employee_contribution_usd": 8000 },
        bank_accounts: [{ bank_name: "HDFC Bank (NRO)", account_number_last_four: "7788", account_type: "nro", country: "India", peak_balance_usd: 18072, ownership_type: "individual", is_joint_owner_spouse: false }],
        fbar_aggregate_peak_usd: 18072,
        withholding_and_estimated: { federal_withholding_total_usd: 11000 },
        nra_specific: { files_form_1040nr: false },
        metadata: { schema_version: "layer1_us_v1", us_calendar_year: year }
      }
    };
    return [rohan, priya];
  }

  // Writes the two clients into this browser's client registry (idempotent:
  // re-running refreshes their data). Returns Rohan's client id.
  function seedMehtaHousehold(W, storage) {
    var clients = buildMehtaHousehold(W);
    var key = "wising_client_registry";
    var list = [];
    try { list = JSON.parse(storage.getItem(key) || "[]"); } catch (e) { list = []; }
    clients.forEach(function (c) {
      if (!list.some(function (r) { return r.id === c.id; })) list.push({ id: c.id, label: c.label, createdAt: new Date().toISOString() });
      storage.setItem("wising_client_" + c.id + "_router", JSON.stringify(c.router));
      storage.setItem("wising_client_" + c.id + "_india", JSON.stringify(c.india));
      storage.setItem("wising_client_" + c.id + "_us", JSON.stringify(c.us));
    });
    storage.setItem(key, JSON.stringify(list));
    return ROHAN_ID;
  }

  // Rohan and Priya are built into the demo: every page (Monitor, Layer 0,
  // India and US forms) calls this before reading storage, so the two
  // clients exist in any browser without clicking "Add". Only a client
  // missing from this browser is written — edits already made here are
  // never overwritten. Returns the ids it added.
  function ensureMehtaHousehold(W, storage) {
    if (!storage || !W) return [];
    var key = "wising_client_registry", list = [];
    try { list = JSON.parse(storage.getItem(key) || "[]"); } catch (e) { list = []; }
    var has = function (id) { return list.some(function (r) { return r.id === id; }) || storage.getItem("wising_client_" + id + "_router") != null; };
    var missing = [ROHAN_ID, PRIYA_ID].filter(function (id) { return !has(id); });
    if (!missing.length) return [];
    var clients;
    try { clients = buildMehtaHousehold(W); } catch (e) { return []; }
    clients.forEach(function (c) {
      var inList = list.some(function (r) { return r.id === c.id; });
      if (!inList) list.push({ id: c.id, label: c.label, createdAt: new Date().toISOString() });
      if (missing.indexOf(c.id) === -1) return;
      storage.setItem("wising_client_" + c.id + "_router", JSON.stringify(c.router));
      storage.setItem("wising_client_" + c.id + "_india", JSON.stringify(c.india));
      storage.setItem("wising_client_" + c.id + "_us", JSON.stringify(c.us));
    });
    storage.setItem(key, JSON.stringify(list));
    return missing;
  }

  // Has either client's saved data been changed from the example (a form
  // edit in this browser)? Compared value by value, so a re-save that only
  // reorders keys doesn't count. A client not saved yet isn't "edited" —
  // ensureMehtaHousehold adds it as the example.
  function sortedJson(v) {
    if (Array.isArray(v)) return "[" + v.map(sortedJson).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + sortedJson(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  // Opening a form stamps its metadata (times, request id) without any
  // edit — the same fields the example data leaves out — so they don't
  // count as an edit.
  function withoutStamps(section) {
    var c = clone(section || {});
    if (c.metadata) ["created_at", "last_updated_at", "request_id"].forEach(function (k) { delete c.metadata[k]; });
    return c;
  }

  function mehtaHouseholdEdited(W, storage) {
    if (!storage || !W) return false;
    var clients;
    try { clients = buildMehtaHousehold(W); } catch (e) { return false; }
    return clients.some(function (c) {
      return ["router", "india", "us"].some(function (part) {
        var saved = storage.getItem("wising_client_" + c.id + "_" + part);
        if (saved == null) return false;
        try { return sortedJson(withoutStamps(JSON.parse(saved))) !== sortedJson(withoutStamps(c[part])); } catch (e) { return true; }
      });
    });
  }

  var api = { mehtaHouseholdEdited: mehtaHouseholdEdited, buildMehtaHousehold: buildMehtaHousehold, buildOriginalMehtaHousehold: buildOriginalMehtaHousehold, seedMehtaHousehold: seedMehtaHousehold, ensureMehtaHousehold: ensureMehtaHousehold, ROHAN_ID: ROHAN_ID, PRIYA_ID: PRIYA_ID };
  var WW = root.WISING = root.WISING || {};
  WW.householdSeed = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

/* ============================================================================
 * WISING — Layer 2 Engine :: normalize.js
 * ----------------------------------------------------------------------------
 * Reads the two Layer 1 intake states (India + US) plus the Layer 0 router
 * state, and folds them into ONE currency-normalized "unified taxpayer model"
 * that the computation and conflict engines consume.
 *
 * Field paths here are matched to what the Layer 1 forms ACTUALLY persist:
 *   - India income is stored per-quarter under state.quarters.Q1..Q4; the
 *     top-level domestic_income is only the active quarter. We aggregate the
 *     four quarters into an annual figure (mirrors the form's
 *     aggregateAnnualState()).
 *   - US wages live in income_us_source.wages_w2[] as { wages_box1_usd,
 *     tax_details_collapsed_by_default: { federal_tax_withheld_usd, ... } }.
 *   - Filing status is 'single' | 'mfj' | 'mfs' | 'hoh'.
 *
 * We never mutate the Layer 1 states — we project them into a flat, predictable
 * shape and attach both INR and USD to every monetary node.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};
  var CONST = WISING.CONST;

  // -- small helpers ---------------------------------------------------------
  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function inrToUsd(inr) { return num(inr) / CONST.FX.INR_PER_USD; }
  function usdToInr(usd) { return num(usd) * CONST.FX.INR_PER_USD; }
  function moneyFromInr(inr) { var i = num(inr); return { inr: i, usd: inrToUsd(i) }; }
  function moneyFromUsd(usd) { var u = num(usd); return { usd: u, inr: usdToInr(u) }; }
  function addMoney(a, b) { return { usd: a.usd + b.usd, inr: a.inr + b.inr }; }
  function zeroMoney() { return { usd: 0, inr: 0 }; }

  // Same trace shape conflicts.js uses for Tax Computation / FTC rows —
  // { kind: "calc", formula, parts, citation } or { kind: "source", detail,
  // citation } — so the Business tab can reuse the existing
  // TraceRow/TracePopup UI unchanged. citation is an optional dated pointer
  // to an externally-verified rule (as opposed to pure internal math).
  function calc(formula, parts, citation) { return { kind: "calc", formula: formula, parts: parts || [], citation: citation || null }; }
  function source(detail, citation) { return { kind: "source", detail: detail, citation: citation || null }; }

  function safe(obj, path, dflt) {
    var cur = obj, parts = path.split("."), i;
    for (i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return dflt;
      cur = cur[parts[i]];
    }
    return (cur === undefined || cur === null) ? dflt : cur;
  }

  function normalizeFilingStatus(s) {
    s = (s || "single").toLowerCase();
    if (s === "married_filing_jointly" || s === "mfj") return "mfj";
    if (s === "married_filing_separately" || s === "mfs") return "mfs";
    if (s === "head_of_household" || s === "hoh") return "hoh";
    return "single";
  }

  /* ------------------------------------------------------------------------
   * loadRawStates — pull the three states out of localStorage (or accept
   * explicitly-passed objects, used for sample data / tests).
   * ----------------------------------------------------------------------*/
  function loadRawStates(opts) {
    opts = opts || {};
    function read(key, override) {
      if (override !== undefined) return override;
      try {
        var raw = root.localStorage && root.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    return {
      router: read(CONST.STORAGE_KEYS.ROUTER, opts.router),
      india: read(CONST.STORAGE_KEYS.INDIA, opts.india),
      us: read(CONST.STORAGE_KEYS.US, opts.us)
    };
  }

  /* ------------------------------------------------------------------------
   * indiaAnnualSlice — return the annual {domestic_income, other_sources,
   * capital_gains, lrs_outbound} by summing the four quarters. Falls back to
   * the top-level objects when no quarterly structure is present.
   * ----------------------------------------------------------------------*/
  function indiaAnnualSlice(india) {
    var quarters = safe(india, "quarters", null);
    if (!quarters) {
      return {
        domestic_income: safe(india, "domestic_income", {}),
        other_sources: safe(india, "other_sources", {}),
        capital_gains: safe(india, "capital_gains", {}),
        lrs_outbound: safe(india, "lrs_outbound", {})
      };
    }
    // Deep-sum numbers across quarters; OR booleans; index-merge arrays.
    function merge(target, source) {
      for (var k in source) {
        if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
        var sv = source[k];
        if (sv === null || sv === undefined) continue;
        if (typeof sv === "number") target[k] = (target[k] || 0) + sv;
        else if (typeof sv === "boolean") target[k] = target[k] || sv;
        else if (Array.isArray(sv)) {
          if (!Array.isArray(target[k])) target[k] = [];
          sv.forEach(function (el, i) {
            if (el && typeof el === "object") {
              target[k][i] = target[k][i] || {};
              merge(target[k][i], el);
            } else if (target[k].indexOf(el) < 0) {
              target[k].push(el);
            }
          });
        } else if (typeof sv === "object") {
          target[k] = target[k] || {};
          merge(target[k], sv);
        } else {
          target[k] = sv;
        }
      }
      return target;
    }
    var out = { domestic_income: {}, other_sources: {}, capital_gains: {}, lrs_outbound: {} };
    ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) {
      var qs = quarters[q]; if (!qs) return;
      if (qs.domestic_income) merge(out.domestic_income, qs.domestic_income);
      if (qs.other_sources) merge(out.other_sources, qs.other_sources);
      if (qs.capital_gains) merge(out.capital_gains, qs.capital_gains);
      if (qs.lrs_outbound) merge(out.lrs_outbound, qs.lrs_outbound);
    });
    return out;
  }

  /* ------------------------------------------------------------------------
   * s.58 (old 44AD/44ADA) presumptive rate + regular-books net profit per
   * business_entries[] item. Replaces a phantom net_profit_inr field the
   * engine used to read that layer1_india.html never actually sets (see
   * docs/BUSINESS_ENTITY_ARCHITECTURE.md §0/§2.1 — every real filer
   * previously computed ₹0 business income; only hand-authored demo
   * profiles worked, by injecting the field directly).
   *
   * Deliberately Phase-0 scoped: presumptive schemes are computed in full,
   * but regular-books net profit only nets out the unambiguous, generically
   * -deductible expense categories. Depreciation (asset_blocks[]),
   * F&O-specific costs, s.35/35D/35DDA amortization, and s.40A(3)/40(a)/
   * 43B(h) disallowances are Phase 1 work (gap tracker IN-22..25) —
   * deliberately excluded here rather than guessed at. Branch-level
   * (business_entries[].branches[]) revenue/expense breakdowns are also not
   * yet folded in — entry-level totals only.
   * ----------------------------------------------------------------------*/
  // s.44AD/s.44ADA turnover-eligibility ceilings — verified 2026-07-12, and
  // matched exactly (including the boundary) to Layer 1 India's own live
  // validator (validateS44ADEligibility()/validateS44ADAEligibility() in
  // layer1_india.html, which already force-reverts an over-ceiling election
  // with an alert): 44AD Rs.2 crore (Rs.3 crore when digital receipts are
  // AT LEAST 95% of total — cash <= 5%, inclusive, per Layer 1's own
  // `dig >= 0.95 * total` check); 44ADA Rs.50 lakh (Rs.75 lakh under the
  // same >=95%-digital condition). This engine-side check is a safety net
  // for state that didn't pass through that live validator (hand-authored
  // profiles, imports) — real Layer 1 usage should never actually reach the
  // fallback branch below, since the election is reverted before it's ever
  // saved. cashInr/digitalInr both zero defaults to the lower ceiling,
  // since the higher one requires proving the digital-receipts condition.
  function presumptiveCeilingInr(scheme, digitalInr, cashInr) {
    var total = digitalInr + cashInr;
    var atLeast95PctDigital = total > 0 && (cashInr / total) <= 0.05;
    if (scheme === "s44AD") return atLeast95PctDigital ? 30000000 : 20000000;
    if (scheme === "s44ADA") return atLeast95PctDigital ? 7500000 : 5000000;
    return Infinity;
  }

  function computeBusinessEntryNetProfitInr(b) {
    var scheme = b.presumptive_scheme;
    if (scheme === "s44AD") {
      // s.58 table (old s.44AD): 6% of digital receipts, 8% of cash receipts.
      var dig44AD = num(b.digital_receipts_inr), csh44AD = num(b.cash_receipts_inr);
      if (dig44AD + csh44AD <= presumptiveCeilingInr("s44AD", dig44AD, csh44AD)) {
        return dig44AD * 0.06 + csh44AD * 0.08;
      }
      // Over the ceiling — election invalid, falls through to regular books.
    } else if (scheme === "s44ADA") {
      // s.58 table (old s.44ADA): flat 50% of gross receipts, no digital/cash
      // rate differential (unlike s44AD).
      var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
      var adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
      if (adaReceipts <= presumptiveCeilingInr("s44ADA", adaDig, adaCsh)) {
        return adaReceipts * 0.50;
      }
      // Over the ceiling — same fallback.
    } else if (scheme === "s44AE") {
      return null; // computed once from goods_vehicles[] at the aggregate level, not per-entry
    }
    // Regular books — gross receipts less the clean, unambiguous general PGBP
    // expense categories only (see the Phase-0 scoping note above). Also the
    // fallback when a presumptive scheme was selected but receipts exceed
    // its turnover ceiling above.
    var exp = b.expenses || {};
    var deductible =
      num(exp.rent_for_business_premises_inr) + num(exp.repairs_maintenance_inr) +
      num(exp.employee_salary_wages_inr) + num(exp.employee_bonus_commission_inr) +
      num(exp.interest_on_borrowed_capital_inr) + num(exp.insurance_premium_inr) +
      num(exp.bad_debts_written_off_inr) + num(exp.other_business_expenses_inr) +
      num(exp.ca_professional_fees_inr) + num(exp.employer_pf_esi_contribution_inr);
    // A presumptive entry that fell through here for exceeding its ceiling
    // may never have had gross_receipts_inr/turnover_inr filled in at all —
    // the preparer only entered the scheme-specific digital/cash split. Fall
    // back to that known total rather than silently treating receipts as 0.
    var receipts = num(b.gross_receipts_inr) || num(b.turnover_inr) ||
      (scheme === "s44AD" ? (dig44AD + csh44AD) : 0) ||
      (scheme === "s44ADA" ? adaReceipts : 0);
    return receipts - deductible;
  }

  // s.58 table (old s.44AE), goods-carriage presumptive income — rates stable
  // since the 2018 Budget amendment, re-verify periodically (see gap tracker
  // maintenance note): heavy (>12MT) = Rs1,000/ton/month; other = Rs7,500/month
  // flat, either way pro-rated by months owned (part of a month counts whole).
  function computeGoodsVehiclePresumptiveInr(vehicles) {
    var total = 0;
    (vehicles || []).forEach(function (v) {
      var months = num(v.months_owned);
      if (!(months > 0)) return;
      if (v.vehicle_type === "heavy") {
        total += 1000 * num(v.gvw_tonnes) * months;
      } else if (v.vehicle_type === "light") {
        total += 7500 * months;
      }
    });
    return total;
  }

  var PRESUMPTIVE_CEILING_CITATION = "s.44AD/44ADA turnover ceilings (Rs.2cr/Rs.3cr and Rs.50L/Rs.75L, the higher figure requiring digital receipts ≥95% of total) verified 2026-07-12, matched to Layer 1 India's own live eligibility check — re-check each Finance Act cycle.";

  /* Mirrors computeBusinessEntryNetProfitInr's branches exactly, but returns
   * the "show your work" trace instead of the number, for the Business tab. */
  function businessEntryIncomeTrace(b) {
    var explicit = b.net_profit_inr != null ? b.net_profit_inr : b.net_profit;
    if (explicit !== undefined && explicit !== null) {
      return source("Net profit entered directly on Layer 1 India for this business entry (not derived from a presumptive rate or books).");
    }
    var scheme = b.presumptive_scheme, ceilingNote = null;
    if (scheme === "s44AD") {
      var dig44AD = num(b.digital_receipts_inr), csh44AD = num(b.cash_receipts_inr);
      var ceiling44AD = presumptiveCeilingInr("s44AD", dig44AD, csh44AD);
      if (dig44AD + csh44AD <= ceiling44AD) {
        return calc("Presumptive income under s.44AD: digital/banking receipts × 6% + cash receipts × 8%", [
          { label: "Digital / banking receipts", amount: dig44AD },
          { label: "Rate", display: "6%" },
          { label: "Cash receipts", amount: csh44AD },
          { label: "Rate", display: "8%" }
        ], PRESUMPTIVE_CEILING_CITATION);
      }
      ceilingNote = "Total receipts (₹" + Math.round(dig44AD + csh44AD).toLocaleString("en-IN") + ") exceed the s.44AD turnover ceiling for this cash-receipts mix (₹" + Math.round(ceiling44AD).toLocaleString("en-IN") + ") — the presumptive election is invalid above this, so regular books apply instead:";
    } else if (scheme === "s44ADA") {
      var adaDig = num(b.ada_digital_receipts_inr), adaCsh = num(b.ada_cash_receipts_inr);
      var adaReceipts = num(b.gross_receipts_inr) || (adaDig + adaCsh);
      var ceiling44ADA = presumptiveCeilingInr("s44ADA", adaDig, adaCsh);
      if (adaReceipts <= ceiling44ADA) {
        return calc("Presumptive income under s.44ADA: gross receipts × 50% (professionals)", [
          { label: "Gross receipts", amount: adaReceipts },
          { label: "Rate", display: "50%" }
        ], PRESUMPTIVE_CEILING_CITATION);
      }
      ceilingNote = "Gross receipts (₹" + Math.round(adaReceipts).toLocaleString("en-IN") + ") exceed the s.44ADA turnover ceiling for this cash-receipts mix (₹" + Math.round(ceiling44ADA).toLocaleString("en-IN") + ") — the presumptive election is invalid above this, so regular books apply instead:";
    } else if (scheme === "s44AE") {
      return source("s.44AE tonnage-based presumptive income (goods carriages) is computed once from the Goods Vehicles schedule and rolled into the total business income figure above — it isn't split per vehicle here, so this entry shows ₹0 on its own.");
    }
    var exp = b.expenses || {};
    var expenseFields = [
      ["rent_for_business_premises_inr", "Rent for business premises"],
      ["repairs_maintenance_inr", "Repairs & maintenance"],
      ["employee_salary_wages_inr", "Employee salary & wages"],
      ["employee_bonus_commission_inr", "Employee bonus & commission"],
      ["interest_on_borrowed_capital_inr", "Interest on borrowed capital"],
      ["insurance_premium_inr", "Insurance premium"],
      ["bad_debts_written_off_inr", "Bad debts written off"],
      ["other_business_expenses_inr", "Other business expenses"],
      ["ca_professional_fees_inr", "CA / professional fees"],
      ["employer_pf_esi_contribution_inr", "Employer PF/ESI contribution"]
    ];
    var fallbackReceipts = num(b.gross_receipts_inr) || num(b.turnover_inr) ||
      (scheme === "s44AD" ? (dig44AD + csh44AD) : 0) ||
      (scheme === "s44ADA" ? adaReceipts : 0);
    var parts = [{ label: "Gross receipts / turnover", amount: fallbackReceipts }];
    expenseFields.forEach(function (f) {
      var v = num(exp[f[0]]);
      if (v > 0) parts.push({ label: "Less: " + f[1], amount: -v });
    });
    var formula = ceilingNote || "Regular books: gross receipts/turnover less the itemized deductible expenses on file. Depreciation, F&O-specific costs and other disallowances aren't modeled yet (Phase 1 — see gap tracker IN-22..25), so this is a floor, not the final figure.";
    return calc(formula, parts, ceilingNote ? PRESUMPTIVE_CEILING_CITATION : null);
  }

  /* ------------------------------------------------------------------------
   * India income aggregation (annual), normalized to {inr, usd} per head.
   * ----------------------------------------------------------------------*/
  function aggregateIndiaIncome(india, annual) {
    var di = annual.domestic_income || {};
    var os = annual.other_sources || {};

    var salaryTaxable = num(safe(di, "salary.taxable_salary_inr", null)) ||
                        num(safe(di, "salary.gross_salary_inr", 0));
    var salary = moneyFromInr(salaryTaxable);

    var bizEntries = safe(di, "business_income.business_entries", []);
    var business = zeroMoney();
    (bizEntries || []).forEach(function (b) {
      // net_profit_inr/net_profit are honored first ONLY because hand-authored
      // demo profiles (engine/profiles.js) inject them directly, bypassing the
      // real form — layer1_india.html itself never sets either field, so for
      // every real filer this falls through to the real computation below.
      var netProfitInr = b.net_profit_inr || b.net_profit;
      if (netProfitInr === undefined || netProfitInr === null) {
        netProfitInr = computeBusinessEntryNetProfitInr(b);
      }
      business = addMoney(business, moneyFromInr(num(netProfitInr)));
    });
    // s.58/44AE goods-carriage presumptive income — computed once from the
    // shared goods_vehicles[] list, not per business_entries[] item.
    business = addMoney(business, moneyFromInr(computeGoodsVehiclePresumptiveInr(safe(di, "business_income.goods_vehicles", []))));

    var hpProps = safe(di, "house_property.properties", []);
    var houseProperty = zeroMoney();
    (hpProps || []).forEach(function (p) {
      houseProperty = addMoney(houseProperty, moneyFromInr(
        p.annual_value_inr || p.net_income_inr || p.gross_rent_received_inr || 0
      ));
    });

    var interest = moneyFromInr(
      num(safe(os, "interest_savings_inr", 0)) +
      num(safe(os, "interest_fd_rd_inr", 0)) +
      num(safe(os, "interest_bonds_inr", 0)) +
      num(safe(os, "interest_on_it_refund_inr", 0)) +
      num(safe(di, "other_sources.interest_inr", 0))
    );
    // Deemed dividend on share buyback (s.2(40)(f) — window: 1-Oct-2024 to
    // 31-Mar-2026 ONLY): the FULL buyback consideration is taxed as a
    // dividend at slab rates in the shareholder's hands (the acquisition
    // cost instead becomes a capital loss). This is a genuine
    // characterization mismatch candidate — the US almost certainly treats
    // the same cash as capital gain/return of capital, not dividend income.
    // Budget 2026 REVERSED this for buy-backs on/after 1-Apr-2026 (s.69,
    // Tax Year 2026-27 onward) — those are capital gains in India too now,
    // folded into stcg/ltcg below instead (listed shares only — see there).
    //
    // Two sources feed this, since either can be present depending on how the
    // model got here: (a) the raw per-transaction array (india.share_buyback.
    // transactions) that the live Layer 1 form persists — Layer 1's own
    // preview computes these totals locally for its own on-page estimate but
    // does NOT persist the aggregated totals, only the raw transactions, so
    // this aggregates them itself; (b) demo/test profiles that set the
    // aggregated capital_gains.buyback_*_inr / other_sources.deemed_dividend_
    // from_buyback_inr fields directly, bypassing the transaction UI
    // entirely. Both are summed in — real data will only ever populate one.
    var buybackTxs = safe(india, "share_buyback.transactions", []) || [];
    var deemedDividendInr = num(safe(os, "deemed_dividend_from_buyback_inr", 0));
    var buybackLtcgInr = num(safe(annual.capital_gains, "buyback_ltcg_inr", 0));
    var buybackStcgInr = num(safe(annual.capital_gains, "buyback_stcg_inr", 0));
    var buybackStcgSlabInr = num(safe(os, "buyback_stcg_slab_inr", 0));
    // Unlisted buy-back LTCG (>24mo) is s.197 territory — no s.198
    // exemption (that's listed/STT-paid only, see ltcg197Inr below).
    // Listed buy-back LTCG (>12mo) stays in buybackLtcgInr/the ordinary
    // "ltcg" bucket below since it IS s.198-eligible.
    var buybackLtcg197Inr = 0;
    // s.69(2)(b) promoter additional tax applies only to the promoter's OWN
    // slice of flat-rate (LTCG/STCG) buy-back gains — tracked separately so
    // computeUsTax's... no, computeIndiaTax's caller can layer the extra
    // promoter tax on top without double-taxing the base gain (which is
    // already included in buybackLtcgInr/buybackLtcg197Inr/buybackStcgInr
    // above).
    var promoterBuybackLtcgInr = 0, promoterBuybackStcgInr = 0;
    // Holding-period characterization mismatch candidates: India uses a
    // 24-month LTCG threshold for UNLISTED shares/securities (12 months for
    // listed); the US uses a uniform >12 months for LTCG on any asset, no
    // listed/unlisted distinction. An unlisted asset held 12-24 months is
    // therefore short-term (slab rate) in India but long-term (preferential
    // rate) in the US — same transaction, different character in each
    // country. Applies to both unlisted buy-backs (below) and foreign
    // equity holdings (further down) — same underlying rule, two sources.
    // Flagged here as raw data; conflicts.js computes the actual US tax
    // dollar impact (it has access to computeUsTax, normalize.js doesn't)
    // and turns this into a finding.
    var holdingPeriodMismatches = [];
    function monthsBetween(fromStr, toStr) {
      if (!fromStr || !toStr) return null;
      var a = new Date(fromStr), b = new Date(toStr);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
      var days = (b - a) / (1000 * 60 * 60 * 24);
      return days / 30.436875;
    }
    buybackTxs.forEach(function (bb) {
      if (bb.buyback_pre_or_post_oct2024 === "post_oct2024") {
        deemedDividendInr += num(bb.consideration_received_inr);
      } else if (bb.buyback_pre_or_post_oct2024 === "capital_gains_era") {
        var g = num(bb.capital_gain_or_loss);
        if (bb.gain_classification === "ltcg") {
          if (bb.is_listed) {
            buybackLtcgInr += g; // s.198-eligible (listed, >12mo)
          } else {
            buybackLtcg197Inr += g; // s.197, no exemption (unlisted, >24mo)
          }
          if (bb.is_promoter && g > 0) promoterBuybackLtcgInr += g;
        } else if (bb.gain_classification === "stcg") {
          buybackStcgInr += g;
          if (bb.is_promoter && g > 0) promoterBuybackStcgInr += g;
        } else if (bb.gain_classification === "stcg_slab") {
          buybackStcgSlabInr += g;
          // Promoter additional tax is scoped to the flat-rate LTCG/STCG
          // gains only (see constants.js) — not applied to this slab-rate
          // slice even if is_promoter is set.
        }
        // no gain_classification (e.g. acquisition date left blank) — not
        // enough information to classify LTCG vs STCG, so it's dropped
        // rather than guessed at; matches Layer 1's own (conservative, if
        // silent) handling of that same gap.

        var months = monthsBetween(bb.original_acquisition_date, bb.buyback_date);
        if (months !== null && g > 0 && bb.gain_classification) {
          var usClassification = months > 12 ? "ltcg" : "stcg";
          var indiaClassification = bb.gain_classification === "ltcg" ? "ltcg" : "stcg"; // stcg_slab counts as short-term too
          if (usClassification !== indiaClassification) {
            holdingPeriodMismatches.push({
              companyName: bb.company_name || "Unnamed company",
              isListed: !!bb.is_listed,
              monthsHeld: months,
              gainInr: g,
              gainUsd: inrToUsd(g),
              indiaClassification: indiaClassification,
              usClassification: usClassification,
              indiaThresholdMonths: bb.is_listed ? 12 : 24,
              sourceType: "buyback"
            });
          }
        }
      }
    });

    // Foreign equity (US stocks etc.) held directly — not listed on a
    // RECOGNIZED INDIAN exchange, so India treats it as an "unlisted
    // foreign security" regardless of whether it's listed on a foreign
    // exchange: >24 months for LTCG (s.197, 12.5%, NO s.198 exemption —
    // that's listed+STT-paid only), <=24 months is STCG at slab rate (same
    // principle as any other non-STT unlisted-share STCG — s.111/s.70/s.74
    // loss-set-off eligible, joins the same stcgSlabInr pool buy-backs use).
    // This is general, pre-existing Indian law — NOT specific to the s.69
    // buy-back regime, though the mechanics (24mo threshold, slab-rate
    // STCG) are identical.
    //
    // UNLIKE the buy-back gain above (an INDIAN company, so India-source and
    // taxable for any residency status including NR), a foreign stock sale is
    // FOREIGN-source income — India only taxes that on a worldwide basis for
    // a ROR (Resident & Ordinarily Resident). RNOR is taxed only on
    // India-source income plus foreign BUSINESS income controlled from India
    // (a capital gain on a personal shareholding isn't that), and NR is
    // taxed on India-source income only. So this whole block only applies
    // when the taxpayer is a ROR this year — otherwise the gain isn't in
    // India's tax net at all, and neither is a "characterization mismatch"
    // (India isn't taxing it, so there's nothing to characterize).
    var isIndiaRor = safe(india, "residency_detail.final_india_residency_status", null) === CONST.INDIA_STATUS.ROR;
    var financialHoldingsTxs = isIndiaRor ? (safe(india, "financial_holdings.transactions", []) || []) : [];
    var foreignEquityLtcg197Inr = 0, foreignEquityStcgSlabInr = 0;
    function toInrAtCurrency(amount, currency) {
      var amt = num(amount);
      if (!currency || currency === "INR") return amt;
      if (currency === "USD") return usdToInr(amt);
      // EUR/GBP: no FX rate modeled anywhere in this engine (only INR/USD) —
      // dropped rather than guessed at, same convention as the buy-back
      // classification gap above.
      return null;
    }
    financialHoldingsTxs.forEach(function (tx) {
      if (tx.asset_class !== "foreign_equity_unlisted") return;
      if (!tx.sale_date || tx.sale_value === null || tx.sale_value === undefined || tx.sale_value === "") return; // still holding — no taxable event yet
      var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency);
      var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency);
      if (saleInr === null || purchaseInr === null) return; // EUR/GBP — uncomputed gap, not guessed
      var months = monthsBetween(tx.acquisition_date, tx.sale_date);
      if (months === null) return; // no acquisition date — can't classify, don't guess
      var g = saleInr - purchaseInr - num(tx.transfer_expenses);
      var indiaClassification = months > 24 ? "ltcg" : "stcg";
      if (indiaClassification === "ltcg") {
        foreignEquityLtcg197Inr += g;
      } else {
        foreignEquityStcgSlabInr += g;
      }
      if (g > 0) {
        var usClassification = months > 12 ? "ltcg" : "stcg";
        if (usClassification !== indiaClassification) {
          holdingPeriodMismatches.push({
            companyName: tx.asset_name_or_ticker || "Unnamed foreign holding",
            isListed: false,
            monthsHeld: months,
            gainInr: g,
            gainUsd: inrToUsd(g),
            indiaClassification: indiaClassification,
            usClassification: usClassification,
            indiaThresholdMonths: 24,
            sourceType: "foreign_equity"
          });
        }
      }
    });
    // Every other Financial Holdings asset class — UNLIKE foreign equity
    // (above), these are all India-issued/registered instruments (even a
    // mutual fund investing abroad is an Indian-AMC unit, India-source
    // regardless of what it holds), so no residency gate applies here;
    // taxable for any status. Multi-source-verified (TY2026-27 rules):
    //
    //  GROUP_A — s.198/196 equity-preferential (12mo threshold, STT paid):
    //    listed_equity, equity_mutual_fund, hybrid_mf_equity (>=65% equity),
    //    reit_invit (business trust units — s.112A/111A both explicitly
    //    cover "a unit of a business trust"), etf (equity ETF — Layer 1
    //    doesn't sub-type ETFs by underlying, so this is the most common
    //    case, not a universal one; a gold/debt ETF should really be
    //    GROUP_E/GROUP_C — flagged as a follow-up Layer 1 dropdown split,
    //    same pattern as the earlier "Foreign Equity" split-out).
    //    LTCG >12mo -> the s.198 `ltcg` bucket (12.5%, up to ₹1.25L exempt).
    //    STCG <=12mo -> the flat-20% `stcg` bucket (s.196).
    //    If STT was NOT paid (tx.stt_paid === false), s.111A/112A's
    //    preferential RATE+exemption requires STT — falls back to GROUP_E
    //    treatment (still a "listed security", 12mo threshold, but no
    //    exemption and no 20% flat STCG rate).
    //  GROUP_C — general "other capital asset" (s.112/197, 24mo threshold):
    //    debt_mutual_fund_pre_apr23 (grandfathered out of s.50AA by
    //    acquisition date — s.50AA only ever applies to funds ACQUIRED
    //    on/after 1-Apr-2023), hybrid_mf_debt (35-65% equity — meets
    //    neither the equity-oriented 65%+ test nor s.50AA's specified-fund
    //    test), international_mf and fof (Finance Act 2024 redefined
    //    "Specified Mutual Fund" under s.50AA from a <=35%-equity test to a
    //    >65%-debt/money-market test for transfers from FY2025-26/TY2026-27
    //    onward — a fund investing predominantly in FOREIGN EQUITY or
    //    diversified holdings no longer meets that test purely by holding
    //    little Indian equity, so these fall to ordinary s.112/197
    //    treatment instead of s.50AA's always-short-term rule).
    //    LTCG >24mo -> ltcg197Inr (12.5%, NO exemption — s.198's exemption
    //    is textually specific to that section, doesn't pool with s.197).
    //    STCG <=24mo -> the slab-rate stcgSlabInr bucket.
    //  GROUP_D — s.50AA specified debt fund: ALWAYS short-term, ANY holding
    //    period, slab rate — no LTCG path exists for this class at all.
    //    debt_mutual_fund_post_apr23 (acquired on/after 1-Apr-2023, assumed
    //    to meet the current >65%-debt/MMI test, consistent with what
    //    "Debt MF" means as a label).
    //  GROUP_E — listed security without STT-preferential-rate eligibility
    //    (12mo threshold like GROUP_A, but taxed like GROUP_C — s.112's
    //    12.5%-no-exemption LTCG, slab-rate STCG, since s.111A/112A
    //    specifically require STT-paid equity/equity-fund/business-trust-
    //    unit transactions, which a plain bond never has):
    //    bond_listed (assumed plain-vanilla, not a Market-Linked Debenture
    //    — MLDs are unconditionally short-term at slab under s.50AA
    //    regardless of holding period, but Layer 1 doesn't distinguish
    //    MLDs from ordinary listed bonds), and any GROUP_A class where
    //    tx.stt_paid === false.
    //  GROUP_G — VDA/crypto (s.115BBH): a completely separate, flat 30%
    //    tax on POSITIVE gains only — no LTCG/STCG concept, no holding-
    //    period threshold, no exemption or indexation, and critically NO
    //    loss set-off allowed AT ALL, not even against a gain from a
    //    DIFFERENT VDA in the same year (confirmed: the statute bars set-
    //    off against income "under any provision of this Act"), and no
    //    carry-forward. A losing VDA transaction is simply dropped, never
    //    netted against anything.
    //  GROUP_XIIA — Chapter XII-A "specified assets" (ss.115C-115I old Act,
    //    §212-221 ITA 2025): shares of an Indian company, debentures of a
    //    public Indian company, deposits with a public Indian company, and
    //    Central Government securities, all purchased in convertible
    //    foreign exchange by an NRI (tx.is_specified_foreign_exchange_asset
    //    === true). Multi-source-verified (second research pass):
    //    - LISTED equity (listed_equity, SFEA=true): still the ordinary
    //      12mo threshold (s.115C(d) defers entirely to general s.2(42A)
    //      classification), but the s.115E(1)(b) LTCG rate has NO
    //      ₹1,25,000 exemption — unlike ordinary s.198 — so this
    //      OVERRIDES the GROUP_A routing above for LTCG specifically (STCG
    //      is unaffected — Chapter XII-A has no special short-term rate,
    //      so s.111A/20% still applies as normal). A taxpayer can opt out
    //      under s.115I if ordinary treatment is more beneficial (it is,
    //      for listed equity specifically, since the exemption is worth
    //      more) — Layer 1's chapterXiiaElected checkbox is presented as
    //      that considered, flexible year-end choice, so it's trusted here
    //      rather than second-guessed.
    //    - Specified DEPOSITS (nri_specified_company_deposit): a deposit is
    //      not a transferable security — its only "exit" is maturity/
    //      withdrawal, and repayment of principal is not a "transfer"
    //      under s.2(47) at all (well-established, no contrary authority
    //      found). NO capital gain EVER arises on a specified deposit —
    //      only interest, taxed as Chapter XII-A "investment income" under
    //      s.115E's other limb (see chapterXiiaInvestmentIncomeInr below —
    //      that IS computed, separately from capital gains). So this class
    //      is unconditionally excluded from capital-gains classification,
    //      not a "don't know" gap — deliberately, confidently, zero.
    //    - Specified DEBENTURES / Government securities: CAN generate
    //      capital gains, but ONLY on an actual sale to a third party — a
    //      real Tribunal precedent (Khushaal C. Thackersey v. ACIT, ITAT
    //      Mumbai, 15-Apr-2024, TS-293-ITAT-2024(Mum)) holds that
    //      REDEMPTION AT MATURITY of a debenture is "mere realisation of a
    //      debt," not a transfer — any maturity premium is interest
    //      income, not a capital gain. Layer 1's generic Sale Date/Sale
    //      Value fields can't currently distinguish "sold on the market"
    //      from "redeemed/matured" for these two classes specifically — so
    //      this block only computes a gain when tx.nri_exit_type ===
    //      "sold_to_third_party" (a NEW field, not yet in Layer 1 — flagged
    //      to the user as a follow-up form addition); absent that signal,
    //      it's dropped rather than guessed, same convention as EUR/GBP
    //      currency and missing acquisition dates elsewhere in this
    //      function. Once present: LISTED (tx.stt_paid !== false) gets the
    //      ordinary 12mo threshold, LTCG -> ltcg197Inr (s.115E(1)(b)/
    //      s.112, 12.5%, no exemption — the two converge to the same rate
    //      for a listed debt instrument), STCG -> slab (s.111A doesn't
    //      cover debentures/govt securities). UNLISTED and sold on/after
    //      23-Jul-2024 is s.50AA-deemed short-term regardless of holding
    //      period (Finance (No.2) Act 2024, inserted into s.50AA
    //      alongside the MLD rule) — this is a legal fiction that a
    //      logical reading of s.115C(d) can't satisfy ("long-term capital
    //      gains" requires NOT being short-term), so it falls out of
    //      Chapter XII-A's LTCG path entirely and lands at slab rate, same
    //      bucket as GROUP_D/E's STCG (this specific "falls out entirely"
    //      conclusion is the research's own reasoned inference, not a
    //      directly-sourced authority — flagged as such, but the
    //      underlying s.50AA deeming fact itself is high-confidence).
    //      UNLISTED and sold before 23-Jul-2024 falls back to the general,
    //      pre-amendment 24mo threshold (an edge case for older
    //      transaction dates, included for completeness).
    //
    // Chapter XII-A "investment income" (s.115C(c)/s.115E(1)(a), §214 ITA
    // 2025): interest on a specified debenture/deposit, or dividend on
    // specified shares — a flat 20% (multi-source-verified unchanged
    // through TY2026-27: incometaxindia.gov.in, TaxGuru, callmyca, and
    // TaxTMI's new-vs-old §214/s.115E comparison all confirm the LTCG leg
    // moved 10%->12.5% in 2024 but this leg was untouched), NO Chapter
    // VI-A deductions, no basic exemption — applies to the gross amount.
    // This is completely separate from capital gains (accrues every year
    // regardless of whether the holding is sold), and doesn't participate
    // in loss set-off (it isn't a capital gain at all). Layer 1 captures
    // it as a per-holding "Investment Income This Year" field on any
    // SFEA-marked transaction (interest for debentures/deposits, dividend
    // for specified shares) — a preparer entering ₹0 or leaving it blank
    // for a holding that plausibly earned something is a real, separate
    // risk (see the conflicts.js finding), but that's a data-completeness
    // question, not something this engine can second-guess.
    var chapterXiiaElected = safe(india, "compliance_docs.chapter_xiia_elected", false) === true;
    var GROUP_A_CLASSES = ["listed_equity", "equity_mutual_fund", "hybrid_mf_equity", "reit_invit", "etf"];
    var GROUP_C_CLASSES = ["debt_mutual_fund_pre_apr23", "hybrid_mf_debt", "international_mf", "fof"];
    var S50AA_UNLISTED_DEBT_CUTOFF = "2024-07-23";
    var otherLtcg198Inr = 0, otherStcg20Inr = 0, otherLtcg197Inr = 0, otherStcgSlabInr = 0, vdaGainInr = 0, vdaSaleConsiderationInr = 0;
    var chapterXiiaInvestmentIncomeInr = 0, chapterXiiaSfeaHoldingCount = 0;
    (safe(india, "financial_holdings.transactions", []) || []).forEach(function (tx) {
      var cls = tx.asset_class;
      if (!cls || cls === "foreign_equity_unlisted") return; // handled above, or uncategorized (legacy transactions predating asset_class)

      // Investment income accrues every year regardless of whether the
      // holding is sold this year, so this runs before the sale-status
      // check below (which only gates the CAPITAL GAINS classification).
      if (chapterXiiaElected && tx.is_specified_foreign_exchange_asset === true) {
        chapterXiiaSfeaHoldingCount += 1;
        var invIncomeInr = toInrAtCurrency(tx.investment_income_this_year, tx.investment_income_currency || "INR");
        if (invIncomeInr !== null) chapterXiiaInvestmentIncomeInr += num(invIncomeInr);
      }

      if (cls === "nri_specified_company_deposit") return; // maturity is never a "transfer" — never generates capital gains, unconditionally
      if (!tx.sale_date || tx.sale_value === null || tx.sale_value === undefined || tx.sale_value === "") return; // still holding — no taxable event yet
      var saleInr = toInrAtCurrency(tx.sale_value, tx.sale_currency);
      var purchaseInr = toInrAtCurrency(tx.purchase_value, tx.purchase_currency);
      if (saleInr === null || purchaseInr === null) return; // EUR/GBP — uncomputed gap, not guessed

      if (cls === "vda_crypto") {
        // s.194S TDS applies to the TRANSFER CONSIDERATION, not the gain —
        // unlike vdaGainInr (positive gains only), every sale counts here.
        vdaSaleConsiderationInr += saleInr;
        var vg = saleInr - purchaseInr - num(tx.transfer_expenses);
        if (vg > 0) vdaGainInr += vg;
        return;
      }

      if ((cls === "nri_specified_debenture" || cls === "nri_specified_govt_security") && tx.nri_exit_type !== "sold_to_third_party") {
        return; // redeemed at maturity, or exit type not yet recorded — not a "transfer", or not enough info to say either way
      }

      var months = monthsBetween(tx.acquisition_date, tx.sale_date);
      if (months === null) return; // no acquisition date — can't classify, don't guess

      // Grandfathered cost basis for pre-1-Feb-2018 listed-equity/equity-MF
      // acquisitions (s.55(2)(ac)): higher of actual cost, or (lower of FMV
      // as on 31-Jan-2018 and sale price). Layer 1 only collects the FMV
      // field for these two classes (the only ones where s.112A's
      // grandfathering transition applies).
      var costBasisInr = purchaseInr;
      if ((cls === "listed_equity" || cls === "equity_mutual_fund") && tx.fmv_31jan2018_per_unit_inr && tx.quantity) {
        var fmvTotalInr = num(tx.fmv_31jan2018_per_unit_inr) * num(tx.quantity);
        costBasisInr = Math.max(purchaseInr, Math.min(fmvTotalInr, saleInr));
      }
      var g = saleInr - costBasisInr - num(tx.transfer_expenses);

      var isChapterXiiaListedEquity = cls === "listed_equity" && chapterXiiaElected && tx.is_specified_foreign_exchange_asset === true;

      if (cls === "debt_mutual_fund_post_apr23") {
        otherStcgSlabInr += g; // GROUP_D — always short-term, any holding period
      } else if (cls === "nri_specified_debenture" || cls === "nri_specified_govt_security") {
        if (tx.stt_paid !== false) {
          if (months > 12) otherLtcg197Inr += g; else otherStcgSlabInr += g; // listed: 12mo threshold, Chapter XII-A/s.112 rate (no exemption)
        } else if (tx.sale_date >= S50AA_UNLISTED_DEBT_CUTOFF) {
          otherStcgSlabInr += g; // unlisted, sold on/after 23-Jul-2024 -> s.50AA deems short-term, any holding period
        } else if (months > 24) {
          otherLtcg197Inr += g; // unlisted, sold before the amendment -> general pre-amendment 24mo threshold
        } else {
          otherStcgSlabInr += g;
        }
      } else if (isChapterXiiaListedEquity && months > 12) {
        otherLtcg197Inr += g; // Chapter XII-A LTCG override: no exemption, unlike ordinary s.198
      } else if (isChapterXiiaListedEquity) {
        otherStcg20Inr += g; // STCG is unaffected by the election — s.111A/20% still applies as normal
      } else if (GROUP_A_CLASSES.indexOf(cls) !== -1 && tx.stt_paid !== false) {
        if (months > 12) otherLtcg198Inr += g; else otherStcg20Inr += g; // GROUP_A
      } else if (GROUP_A_CLASSES.indexOf(cls) !== -1) {
        if (months > 12) otherLtcg197Inr += g; else otherStcgSlabInr += g; // GROUP_A, STT not paid -> GROUP_E fallback
      } else if (cls === "bond_listed") {
        if (months > 12) otherLtcg197Inr += g; else otherStcgSlabInr += g; // GROUP_E
      } else if (GROUP_C_CLASSES.indexOf(cls) !== -1) {
        if (months > 24) otherLtcg197Inr += g; else otherStcgSlabInr += g; // GROUP_C
      }
      // Unrecognized asset_class — intentionally not classified.
    });

    var deemedDividendBuyback = moneyFromInr(deemedDividendInr);
    // Slab-rate STCG (<=24mo, no s.198/s.196 exemption or flat rate — taxed
    // at the taxpayer's own slab rate, but still Capital Gains head income,
    // s.70/s.74 loss-set-off eligible): unlisted buy-backs, foreign equity
    // holdings, and every other GROUP_C/D/E-classified Financial Holdings
    // asset land here, joining the normal-slab bucket (like the deemed
    // dividend above) only AFTER computeLossSetOff, not before.
    var unlistedStcgSlabInr = buybackStcgSlabInr + foreignEquityStcgSlabInr + otherStcgSlabInr;
    var dividend = moneyFromInr(num(safe(os, "dividend_inr", 0)));

    // Capital gains — Layer 1 stores transaction data; surface the simple
    // short-term figure the form exposes, plus any annual capital_gains slice.
    // Listed-share buyback capital gains (s.69, buy-backs on/after 1-Apr-2026
    // — see the deemedDividendBuyback comment above) fold in here too, at the
    // same s.196/198 STCG/LTCG rates as any other listed-equity gain.
    //
    // ltcg (this bucket) is s.198-ELIGIBLE ONLY: listed shares/equity-MF/
    // business-trust units with STT paid, >12mo — gets the ₹1,25,000 annual
    // exemption. ltcg197Inr (below, NOT included here) is everything else
    // long-term: unlisted buy-back LTCG (>24mo) and foreign-equity LTCG
    // (>24mo) — s.197, same 12.5% rate, but NO exemption, taxable from the
    // first rupee. These are NOT interchangeable and must not be pooled —
    // multi-source-verified (CBDT FAQ via PIB, ClearTax, Bajaj Finserv,
    // Tax2win, KPMG) that the exemption is textually embedded in s.112A/
    // s.198 itself and does not extend to or pool with s.112/s.197.
    var stcg = moneyFromInr(num(safe(di, "capital_gains.short_term_15_pct", 0)) +
                            num(safe(annual.capital_gains, "stcg_111a_inr", 0)) +
                            buybackStcgInr + otherStcg20Inr);
    var ltcg = moneyFromInr(num(safe(annual.capital_gains, "ltcg_112a_inr", 0)) +
                            buybackLtcgInr + otherLtcg198Inr);
    var ltcg197Inr = buybackLtcg197Inr + foreignEquityLtcg197Inr + otherLtcg197Inr;

    // Special-rate "other sources" income — flat 30% under s.128 (lottery/
    // betting) and s.194 (online gaming), no basic exemption, no Chapter
    // VI-A deduction, no §156 rebate. This was previously completely
    // uncounted anywhere in the model (invisible to total income, FTC, and
    // cross-basis reconciliation) despite being real, taxable, and a genuine
    // cross-border double-tax candidate if the same winnings are also
    // US-taxable.
    var specialRate115bb = moneyFromInr(
      num(safe(os, "winnings_lottery_gaming_inr", 0)) +
      num(safe(os, "online_gaming_winnings_inr", 0))
    );
    // s.195 unexplained-income addition: flat 30% + 25% surcharge + cess
    // (effective ~39%, per Finance Act 2026 — was 60%/~78% pre-TY2026-27),
    // and uniquely denies ANY deduction/exemption/loss set-off — tracked
    // separately (not folded into specialRate115bb) since its rate and
    // total denial of relief are qualitatively different and this pass
    // only flags it rather than computing it.
    var unexplained115bbeInr = num(safe(os, "unexplained_income_115BBE_inr", 0));

    var total = [salary, business, houseProperty, interest, dividend, stcg, ltcg, specialRate115bb, deemedDividendBuyback,
                 moneyFromInr(unlistedStcgSlabInr), moneyFromInr(ltcg197Inr), moneyFromInr(vdaGainInr),
                 moneyFromInr(chapterXiiaInvestmentIncomeInr)].reduce(addMoney, zeroMoney());

    return {
      salary: salary, business: business, houseProperty: houseProperty,
      interest: interest, dividend: dividend,
      stcg: stcg, ltcg: ltcg, ltcg197Inr: ltcg197Inr,
      capitalGains: addMoney(addMoney(stcg, ltcg), moneyFromInr(ltcg197Inr)),
      specialRate115bb: specialRate115bb,
      deemedDividendBuyback: deemedDividendBuyback,
      // Slab-rate STCG (<=24mo unlisted — buy-backs, foreign equity, and
      // every other GROUP_C/D/E Financial Holdings asset feed this),
      // s.70/s.74 loss-set-off eligible.
      stcgSlabInr: unlistedStcgSlabInr,
      // s.115BBH VDA/crypto gain — flat 30%, positive gains only, NEVER
      // loss-set-off eligible (not even VDA-vs-VDA), no carry-forward.
      // Kept completely separate from every capital-gains bucket above.
      vdaGainInr: vdaGainInr,
      // s.194S TDS base — total transfer consideration across every VDA
      // sale this year, gain or loss (contrast vdaGainInr above).
      vdaSaleConsiderationInr: vdaSaleConsiderationInr,
      // s.115E(1)(a) Chapter XII-A investment income — flat 20%, no
      // deductions, no exemption, not a capital gain (no loss set-off).
      chapterXiiaInvestmentIncomeInr: chapterXiiaInvestmentIncomeInr,
      chapterXiiaSfeaHoldingCount: chapterXiiaSfeaHoldingCount,
      promoterBuybackLtcgInr: promoterBuybackLtcgInr,
      promoterBuybackStcgInr: promoterBuybackStcgInr,
      holdingPeriodMismatches: holdingPeriodMismatches,
      unexplained115bbeInr: unexplained115bbeInr,
      total: total
    };
  }

  /* India deduction inputs (Chapter VI-A) for the tax engine. */
  function aggregateIndiaDeductions(india) {
    var d = safe(india, "deductions", {});
    return {
      s80C: num(safe(d, "s80C.epf_employee_inr", 0)) + num(safe(d, "s80C.ppf_inr", 0)) +
            num(safe(d, "s80C.elss_inr", 0)) + num(safe(d, "s80C.life_insurance_premium_inr", 0)) +
            num(safe(d, "s80C.principal_home_loan_inr", 0)) + num(safe(d, "s80C.tuition_fees_inr", 0)) +
            num(safe(d, "s80C.nsc_inr", 0)) + num(safe(d, "s80C.tax_saving_fd_inr", 0)) +
            num(safe(d, "s80C.sukanya_samriddhi_inr", 0)),
      s80CCD1B: num(safe(d, "s80CCD_1B.nps_additional_inr", 0)),
      s80CCD2_employer: num(safe(india, "domestic_income.salary.employer_nps_contribution_inr", 0)),
      s80D: num(safe(d, "s80D.self_family_premium_inr", 0)) + num(safe(d, "s80D.parents_premium_inr", 0)),
      s80TTA_TTB: num(safe(d, "s80TTA_TTB.savings_interest_inr", 0))
    };
  }

  /* Layer 1 US's self-employment form (income_us_source.self_employment[])
   * never actually sets self_employment_earnings_usd or net_profit_usd — it
   * only persists gross_receipts_usd, returns_and_allowances_usd, COGS
   * components, other_income_usd and expenses_usd (see
   * docs/BUSINESS_ENTITY_ARCHITECTURE.md). Reading only those two phantom
   * fields meant every real filer's self-employment income silently
   * computed to $0; only hand-authored demo profiles worked, by injecting
   * self_employment_earnings_usd directly. Mirrors the India IN-21 fix.
   * Phase-0 scoped: home-office and asset depreciation aren't netted here. */
  function computeSelfEmploymentNetProfitUsd(s) {
    var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
    var grossProfit = num(s.gross_receipts_usd) - num(s.returns_and_allowances_usd) - cogs;
    return grossProfit + num(s.other_income_usd) - num(s.expenses_usd);
  }
  function selfEmploymentNetProfitUsd(s) {
    var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
    return (explicit === undefined || explicit === null) ? computeSelfEmploymentNetProfitUsd(s) : num(explicit);
  }
  function selfEmploymentIncomeTrace(s) {
    var explicit = s.self_employment_earnings_usd != null ? s.self_employment_earnings_usd : s.net_profit_usd;
    if (explicit !== undefined && explicit !== null) {
      return source("Net self-employment earnings entered directly on Layer 1 US for this business (not derived from gross receipts and expenses).");
    }
    var cogs = num(s.cogs_beginning_inventory) + num(s.cogs_purchases) + num(s.cogs_labor) + num(s.cogs_materials) - num(s.cogs_ending_inventory);
    var parts = [{ label: "Gross receipts", amount: num(s.gross_receipts_usd) }];
    if (num(s.returns_and_allowances_usd) > 0) parts.push({ label: "Less: returns & allowances", amount: -num(s.returns_and_allowances_usd) });
    if (cogs > 0) parts.push({ label: "Less: cost of goods sold", amount: -cogs });
    if (num(s.other_income_usd) > 0) parts.push({ label: "Plus: other business income", amount: num(s.other_income_usd) });
    if (num(s.expenses_usd) > 0) parts.push({ label: "Less: business expenses", amount: -num(s.expenses_usd) });
    return calc("Schedule C: gross receipts less returns/COGS, plus other income, less expenses. Home-office and asset depreciation aren't netted yet (Phase 1).", parts);
  }

  /* ------------------------------------------------------------------------
   * US income aggregation — keeps the us-source / foreign-source split that
   * drives the FTC limitation, and a qualified/ordinary dividend split that
   * drives the preferential-rate computation.
   * ----------------------------------------------------------------------*/
  function aggregateUsIncome(us, annual) {
    var ui = safe(us, "income_us_source", {});
    var fi = safe(us, "income_foreign_source", {});

    // Wages: wages_w2[].wages_box1_usd  (+ fallbacks for older shapes)
    var wages = zeroMoney(), w2with = 0, medicareWages = 0;
    // OBBBA "no tax on tips" / "no tax on overtime" — the qualified subset is
    // already included in Box 1 wages above, these are informational fields
    // used only to size the above-the-line deduction, not additional income.
    var qualifiedTipsUsd = 0, qualifiedOvertimeUsd = 0;
    // Per-employer breakdown — kept alongside the summed w2with total above
    // (which every existing tax computation still consumes) so a withholding
    // view can show "$X withheld by employer Y" instead of just one lump sum.
    var w2Employers = [];
    var w2 = safe(ui, "wages_w2", null);
    if (Array.isArray(w2)) {
      w2.forEach(function (w) {
        var wagesUsd = num(w.wages_box1_usd || w.wages_tips_compensation_usd || 0);
        wages = addMoney(wages, moneyFromUsd(wagesUsd));
        var adv = w.tax_details_collapsed_by_default || w;
        var fedWithUsd = num(adv.federal_tax_withheld_usd || adv.federal_income_tax_withheld_usd || 0);
        w2with += fedWithUsd;
        medicareWages += num(adv.medicare_wages_box5_usd || w.wages_box1_usd || 0);
        qualifiedTipsUsd += num(w.qualified_tip_income_usd || 0);
        qualifiedOvertimeUsd += num(w.qualified_overtime_premium_usd || 0);
        var stateWithUsd = 0;
        (safe(w, "state_and_local_taxes", []) || []).forEach(function (st) { stateWithUsd += num(st.state_tax_withheld_box17_usd || 0); });
        w2Employers.push({ employerName: w.employer_name || null, wagesUsd: wagesUsd, federalWithheldUsd: fedWithUsd, stateWithheldUsd: stateWithUsd });
      });
    }

    var foreignWages = zeroMoney();
    (safe(fi, "foreign_wages", []) || []).forEach(function (w) {
      foreignWages = addMoney(foreignWages, moneyFromUsd(
        w.wages_usd || w.amount_usd || w.wages_box1_usd || w.wages_tips_compensation_usd || 0
      ));
    });

    // Corporate / pass-through business income (for business-POV entities).
    var businessUs = moneyFromUsd(num(safe(ui, "business_income_usd", 0)));
    (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) {
      businessUs = addMoney(businessUs, moneyFromUsd(c.taxable_income_usd || c.net_income_usd || 0));
    });
    (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
      // Guaranteed payments (Box 4) are real income to the partner regardless
      // of general/limited status — they were previously dropped entirely.
      businessUs = addMoney(businessUs, moneyFromUsd(
        num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) + num(k.guaranteed_payments_usd || 0)
      ));
    });
    (safe(ui, "self_employment", []) || []).forEach(function (s) {
      businessUs = addMoney(businessUs, moneyFromUsd(selfEmploymentNetProfitUsd(s)));
    });
    (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) {
      businessUs = addMoney(businessUs, moneyFromUsd(s.scorp_income_usd || s.ordinary_business_income_usd || 0));
    });

    // Self-employment-TAX-subject earnings (Sch C + Sch F + general-partner SE):
    // NOT S-corp/C-corp wages/distributions. Drives Schedule SE.
    var seEarnings = 0;
    (safe(ui, "self_employment", []) || []).forEach(function (s) { seEarnings += selfEmploymentNetProfitUsd(s); });
    (safe(ui, "schedule_c_businesses", []) || []).forEach(function (s) { seEarnings += num(s.net_profit_usd || s.net_earnings_usd || 0); });
    (safe(ui, "farming_schedule_f", []) || []).forEach(function (s) { seEarnings += num(s.net_profit_usd || 0); });
    // QBI-eligible pass-through business income (§199A): SE + S-corp + partnership
    // ordinary (excludes C-corp and wages). SSTB flag if any business is flagged.
    // Seeded from seEarnings BEFORE partnership Box 14A is added below — Box
    // 14A can include guaranteed payments (QBI-ineligible under §199A) and
    // would otherwise double-count the ordinary-income slice added explicitly
    // via ordinary_business_income_usd two lines down.
    var qbiIncome = seEarnings, sstb = false;
    (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { qbiIncome += num(s.scorp_income_usd || s.ordinary_business_income_usd || 0); });
    (safe(ui, "partnerships_k1", []) || []).forEach(function (k) { qbiIncome += num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0); });
    [].concat(safe(ui, "self_employment", []) || [], safe(ui, "schedule_c_businesses", []) || [], safe(ui, "s_corporations_k1", []) || [], safe(ui, "partnerships_k1", []) || [])
      .forEach(function (x) { if (x && (x.is_sstb === true || x.sstb === true)) sstb = true; });
    // Partnership K-1 Box 14A (self_employment_earnings_usd) is the
    // authoritative SE-tax base as actually reported on the K-1 — already
    // partner-type-aware (a limited partner's distributive share of ordinary
    // income is excluded from SE tax per s.1402(a)(13); guaranteed payments
    // for services are not, for either partner type). Previously not read at
    // all, so partnership SE tax was unconditionally $0. Falls back to
    // guaranteed payments (+ ordinary income for a general partner only)
    // when Box 14A itself wasn't entered. Added to seEarnings only AFTER
    // qbiIncome is seeded above, so it never leaks into the QBI base.
    (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
      var box14a = k.self_employment_earnings_usd;
      if (box14a === null || box14a === undefined || box14a === "") {
        box14a = num(k.guaranteed_payments_usd || 0) + (k.partner_type === "general" ? num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0) : 0);
      }
      seEarnings += num(box14a);
    });

    // US retirement / pension income (US-source, ordinary): IRA & 401(k)
    // distributions, Social Security, and pension.
    var usRetirementIncome = moneyFromUsd(
      num(safe(ui, "ira_distributions_usd", 0)) +
      num(safe(ui, "401k_distributions_usd", 0)) +
      num(safe(ui, "social_security_benefits_usd", 0)) +
      num(safe(ui, "pension_income_usd", 0))
    );

    var interestUs = moneyFromUsd(safe(ui, "interest_us_source_usd", 0));
    var ordDivUs = moneyFromUsd(safe(ui, "ordinary_dividends_us_source_usd", 0));
    var qualDivUs = moneyFromUsd(safe(ui, "qualified_dividends_us_source_usd", 0));
    var ltcgUs = moneyFromUsd(safe(ui, "ltcg_us_source_usd", 0));
    var stcgUs = moneyFromUsd(safe(ui, "stcg_us_source_usd", 0));
    var rentalUs = moneyFromUsd(safe(ui, "rental_income_us_source_usd", 0));

    var foreignInterest = moneyFromUsd(safe(fi, "foreign_interest_usd", 0));
    var foreignDividends = moneyFromUsd(safe(fi, "foreign_dividends_usd", 0));
    var foreignRental = moneyFromUsd(safe(fi, "foreign_rental_income_usd", 0));
    var foreignPension = moneyFromUsd(safe(fi, "foreign_pension_income_usd", 0));
    var foreignStcg = moneyFromUsd(safe(fi, "foreign_stcg_usd", 0));
    var foreignLtcg = moneyFromUsd(safe(fi, "foreign_ltcg_usd", 0));

    // India-side "this is taxable in the US" amounts (Layer 1 India's own
    // other_sources fields) — previously only ever displayed inside the
    // retirement_mismatch finding text, never actually added to US income.
    // The retirement_mismatch finding gates on res.us.isResident, matching
    // the same worldwide-taxation condition applied to foreignInterest/
    // foreignPension below, so folding them in here doesn't change when
    // they count, only that they now actually count.
    var taxableEpfInterestUsd = 0, taxableNpsWithdrawalUsd = 0;
    if (annual) {
      taxableEpfInterestUsd = inrToUsd(num(safe(annual.other_sources, "taxable_epf_interest_inr", 0)));
      taxableNpsWithdrawalUsd = inrToUsd(num(safe(annual.other_sources, "taxable_nps_withdrawal_inr", 0)));
      foreignInterest = addMoney(foreignInterest, moneyFromUsd(taxableEpfInterestUsd));
      foreignPension = addMoney(foreignPension, moneyFromUsd(taxableNpsWithdrawalUsd));
    }

    var usSourceTotal = [wages, businessUs, interestUs, ordDivUs, ltcgUs, stcgUs, rentalUs, usRetirementIncome].reduce(addMoney, zeroMoney());
    var foreignSourceTotal = [foreignWages, foreignInterest, foreignDividends, foreignRental, foreignPension, foreignStcg, foreignLtcg].reduce(addMoney, zeroMoney());

    return {
      wages: wages, businessUs: businessUs, w2Withholding: w2with, w2Employers: w2Employers, medicareWages: medicareWages,
      qualifiedTipsUsd: qualifiedTipsUsd, qualifiedOvertimeUsd: qualifiedOvertimeUsd,
      seEarningsUsd: seEarnings, qbiIncomeUsd: Math.max(0, qbiIncome), qbiIsSSTB: sstb,
      usRetirementIncome: usRetirementIncome,
      interestUs: interestUs, ordinaryDividendsUs: ordDivUs, qualifiedDividendsUs: qualDivUs,
      ltcgUs: ltcgUs, stcgUs: stcgUs, capitalGainsUs: addMoney(ltcgUs, stcgUs), rentalUs: rentalUs,
      foreignWages: foreignWages, foreignInterest: foreignInterest, foreignDividends: foreignDividends,
      foreignRental: foreignRental, foreignPension: foreignPension,
      foreignStcg: foreignStcg, foreignLtcg: foreignLtcg,
      foreignCapitalGains: addMoney(foreignStcg, foreignLtcg),
      retirementEpfInterestUsd: taxableEpfInterestUsd,
      retirementNpsWithdrawalUsd: taxableNpsWithdrawalUsd,
      usSourceTotal: usSourceTotal, foreignSourceTotal: foreignSourceTotal,
      total: addMoney(usSourceTotal, foreignSourceTotal)
    };
  }

  /* US deduction inputs for the tax engine. */
  function aggregateUsDeductions(us) {
    var it = safe(us, "itemized_deductions_and_credits", {});
    // ISO exercises generate an AMT preference item (the bargain element —
    // FMV-at-exercise less strike — is excluded from regular income but added
    // back for AMT, §56(b)(3)). Each row's amt_preference_spread_usd is the
    // form's own (fmv - strike) * shares computation; sum across all exercises.
    var isoAmtPrefUsd = 0;
    (safe(us, "equity_compensation.iso_exercises", []) || []).forEach(function (ex) {
      isoAmtPrefUsd += num(ex.amt_preference_spread_usd != null
        ? ex.amt_preference_spread_usd
        : Math.max(0, (num(ex.fmv_at_exercise_usd) - num(ex.strike_price_usd)) * num(ex.shares_exercised)));
    });
    return {
      mode: safe(it, "use_standard_or_itemized", "auto"),
      salt: num(safe(it, "state_and_local_taxes_paid_usd", 0)),
      mortgageInterest: num(safe(it, "mortgage_interest_paid_usd", 0)),
      charitable: num(safe(it, "charitable_contributions_cash_usd", 0)) + num(safe(it, "charitable_contributions_appreciated_usd", 0)),
      medical: num(safe(it, "medical_expenses_usd", 0)),
      studentLoanInterest: num(safe(it, "student_loan_interest_usd", 0)),
      // AMT preference / adjustment items (§57): private-activity-bond interest,
      // ISO bargain element / other preference spread.
      isoAmtPrefUsd: isoAmtPrefUsd,
      amtPrefs: num(safe(it, "private_activity_bond_interest_usd", 0)) +
                num(safe(it, "amt_preference_spread_usd", 0)) +
                num(safe(us, "amt.private_activity_bond_interest_usd", 0)) +
                num(safe(us, "amt.amt_preference_spread_usd", 0)) +
                num(safe(us, "amt_items_usd", 0)) +
                isoAmtPrefUsd,
      // Non-refundable personal credits
      careExpenses: num(safe(it, "dependent_care_expenses_usd", 0)),
      aotc: num(safe(it, "education_credits_aotc_usd", 0)),
      lifetimeLearning: num(safe(it, "education_credits_llc_usd", 0)),
      dependents: num(safe(us, "profile.dependents_count", 0)) || num(safe(it, "dependents_count", 0))
    };
  }

  /* ------------------------------------------------------------------------
   * Equity compensation — cross-border sourcing signal. India's ESOP
   * perquisite (s.17(1)(vi), already folded into taxable_salary_inr — this is
   * a breakdown figure, not additive) and the US RSU/NSO/ISO events are two
   * views into what is often the SAME multi-year vesting equity award, split
   * by whichever country the employee was in when each tranche vested /
   * exercised. When both sides show equity-comp activity in the same year, a
   * single award is very likely being sourced (and taxed) independently by
   * each country with no coordinated day-count allocation.
   * ----------------------------------------------------------------------*/
  function aggregateEquityComp(annualDomesticIncome, us) {
    var ec = safe(us, "equity_compensation", {});
    var rsuIncomeUsd = 0, nsoIncomeUsd = 0;
    (safe(ec, "rsu_vestings", []) || []).forEach(function (r) { rsuIncomeUsd += num(r.gross_income_usd != null ? r.gross_income_usd : num(r.fmv_at_vest_usd) * num(r.shares_vested)); });
    (safe(ec, "nso_exercises", []) || []).forEach(function (n) { nsoIncomeUsd += num(n.ordinary_income_recognized_usd != null ? n.ordinary_income_recognized_usd : Math.max(0, (num(n.fmv_at_exercise_usd) - num(n.strike_price_usd)) * num(n.shares_exercised))); });
    var isoCount = (safe(ec, "iso_exercises", []) || []).length;
    // ESOP: prefer the per-grant events array (grant/vest dates + a raw,
    // user-entered perquisite value per grant) over the older single annual
    // total, when the taxpayer has actually itemized grants — the array is
    // both more precise and is what a future cross-border sourcing check
    // (matching against US RSU grant dates) will need.
    var esopEvents = safe(annualDomesticIncome, "salary.esop_perquisite_events", []) || [];
    var esopFromEvents = esopEvents.reduce(function (s, e) { return s + num(e.perquisite_value_inr); }, 0);
    var esopPerquisiteInr = esopEvents.length > 0 ? esopFromEvents : num(safe(annualDomesticIncome, "salary.esop_perquisite_inr", 0));
    return {
      hasUsEquityComp: safe(ec, "has_equity_comp", false) === true || rsuIncomeUsd > 0 || nsoIncomeUsd > 0 || isoCount > 0,
      rsuIncomeUsd: rsuIncomeUsd, nsoIncomeUsd: nsoIncomeUsd, isoExerciseCount: isoCount,
      esopPerquisiteInr: esopPerquisiteInr,
      esopGrantEvents: esopEvents
    };
  }

  /* Foreign accounts (FBAR / 8938 / Schedule FA). */
  function aggregateAccounts(india, us) {
    var indianAccounts = (safe(india, "bank_accounts", []) || []).map(function (b) {
      return { bank: b.bank_name || "Indian Bank", type: b.account_type || "savings",
               peak: moneyFromInr(b.peak_balance_inr || 0), country: "India" };
    });
    var usDisclosed = (safe(us, "bank_accounts", []) || []).map(function (b) {
      return { bank: b.bank_name || "Bank", type: b.account_type || "savings",
               peak: b.peak_balance_usd !== undefined ? moneyFromUsd(b.peak_balance_usd) : moneyFromInr(b.peak_balance_inr || 0),
               country: b.country || "India" };
    });
    var accounts = indianAccounts.length >= usDisclosed.length ? indianAccounts : usDisclosed;
    // Prefer the US-form computed FBAR peak if present (it filters US accounts).
    var formFbar = num(safe(us, "fbar_aggregate_peak_usd", 0));
    var aggregatePeak = formFbar > 0
      ? moneyFromUsd(formFbar)
      : accounts.reduce(function (acc, a) { return addMoney(acc, a.peak); }, zeroMoney());
    return { accounts: accounts, aggregatePeak: aggregatePeak };
  }

  /* Taxes already paid (raw material for FTC; distinct from computed tax). */
  function aggregateTaxesPaid(india, us) {
    var tc = safe(india, "tax_credits", {});
    var indiaAdvance =
      num(safe(tc, "advance_tax_q1_15jun_inr", 0)) + num(safe(tc, "advance_tax_q2_15sep_inr", 0)) +
      num(safe(tc, "advance_tax_q3_15dec_inr", 0)) + num(safe(tc, "advance_tax_q4_15mar_inr", 0));
    var indiaTds = num(safe(tc, "tds_already_deducted_inr", 0)) + num(safe(tc, "tds_inr", 0));
    var indiaTcs = num(safe(tc, "tcs_inr", 0));
    var indiaPaid = moneyFromInr(indiaAdvance + indiaTds + indiaTcs);

    var we = safe(us, "withholding_and_estimated", {});
    var usWithholding = num(safe(we, "federal_withholding_total_usd", 0));
    var usEstimated =
      num(safe(we, "estimated_tax_q1_apr15_usd", 0)) + num(safe(we, "estimated_tax_q2_jun15_usd", 0)) +
      num(safe(we, "estimated_tax_q3_sep15_usd", 0)) + num(safe(we, "estimated_tax_q4_jan15_usd", 0));
    var usPaid = moneyFromUsd(usWithholding + usEstimated);

    return {
      india: { advance: moneyFromInr(indiaAdvance), tds: moneyFromInr(indiaTds), total: indiaPaid },
      us: { withholding: moneyFromUsd(usWithholding), estimated: moneyFromUsd(usEstimated), total: usPaid }
    };
  }

  /* ------------------------------------------------------------------------
   * General withholding detail — every withholding-tax data point Layer 1
   * captures REGARDLESS of residency status (unlike the NR/NRA
   * treaty-election machinery in computation.js, which only fires for
   * non-residents). Feeds the Withholding Taxes page's "here's everything
   * that's been withheld" view, as distinct from the narrower "here's what
   * missing documentation is costing you" conflict subset.
   * ----------------------------------------------------------------------*/
  var LRS_PURPOSE_LABELS = {
    investment: "Investment (Equity/Property)", education_own_funds: "Overseas Education (Own Funds)",
    education_loan: "Overseas Education (Loan-Funded)", medical: "Medical Treatment Abroad",
    travel: "International Travel (Overseas Tour Package)", gift_donation: "Gift or Donation to Non-Resident"
  };
  var LRS_TCS_THRESHOLD_INR = 1000000;

  /* s.206C(1G) TCS on LRS outbound remittances — mirrors updateLrsTcs() in
   * layer1_india.html EXACTLY (₹10L base threshold, 2% flat on tour
   * packages from the first rupee, 20% on excess for investment/gift, 2% on
   * excess for self-funded education/medical, 0% for loan-funded
   * education). That function only ever renders a DOM preview and never
   * persisted the figure to state, so the engine never had access to it —
   * this is the same deterministic formula, re-run over the same inputs. */
  function computeLrsTcs(lrsOutbound) {
    var total = num(safe(lrsOutbound, "total_lrs_remitted_this_fy_inr", 0));
    var purpose = safe(lrsOutbound, "lrs_purpose", null);
    if (!(total > 0) || !purpose) return null;
    var tcsInr = 0, ratePctLabel = "NIL", note;
    if (purpose === "travel") {
      tcsInr = Math.round(total * 0.02);
      ratePctLabel = "2% flat";
      note = "2% flat TCS on overseas tour packages from the first rupee";
    } else if (total > LRS_TCS_THRESHOLD_INR) {
      var excess = total - LRS_TCS_THRESHOLD_INR;
      if (purpose === "investment" || purpose === "gift_donation") {
        tcsInr = Math.round(excess * 0.20); ratePctLabel = "20% on excess";
        note = "20% TCS on general/investment LRS exceeding ₹10L";
      } else if (purpose === "education_own_funds" || purpose === "medical") {
        tcsInr = Math.round(excess * 0.02); ratePctLabel = "2% on excess";
        note = "2% TCS on self-funded education/medical exceeding ₹10L";
      } else if (purpose === "education_loan") {
        tcsInr = 0; ratePctLabel = "0%";
        note = "NIL TCS on education remittance funded via loan";
      }
    } else {
      note = "Remittance is below the ₹10L base threshold";
    }
    return {
      totalRemittedInr: total, purpose: purpose, purposeLabel: LRS_PURPOSE_LABELS[purpose] || purpose,
      tcsInr: tcsInr, ratePctLabel: ratePctLabel, note: note
    };
  }

  function aggregateWithholdingDetail(india, us) {
    var tc = safe(india, "tax_credits", {});
    var props = safe(india, "property.properties", []) || [];
    var propertyTds = props.filter(function (p) { return num(p.buyer_tds_deducted_inr) > 0; }).map(function (p) {
      return {
        propertyType: p.property_type || "Property",
        saleDate: p.sale_date || null,
        saleConsiderationInr: num(p.sale_consideration),
        tdsInr: num(p.buyer_tds_deducted_inr)
      };
    });
    var we = safe(us, "withholding_and_estimated", {});
    return {
      india: {
        // Single un-decomposable aggregate — Layer 1's "26AS upload" is a
        // demo simulation (hardcoded value), not real per-source extraction,
        // so there is no source/rate breakdown available for this figure.
        tdsAggregateInr: num(safe(tc, "tds_already_deducted_inr", 0)) + num(safe(tc, "tds_inr", 0)),
        // TCS (Ch. XVII-BB) is a DIFFERENT mechanism from TDS — collected on
        // money going OUT (e.g. LRS remittances), not withheld from income
        // coming in — but is equally creditable against final tax liability.
        tcsAggregateInr: num(safe(tc, "tcs_inr", 0)),
        lrsTcs: computeLrsTcs(safe(india, "lrs_outbound", {})),
        propertyTds: propertyTds
      },
      us: {
        stateWithholdingUsd: num(safe(we, "state_withholding_total_usd", 0))
      }
    };
  }

  /* ------------------------------------------------------------------------
   * normalize — the public entry point.
   * ----------------------------------------------------------------------*/
  function normalize(opts) {
    var raw = loadRawStates(opts);
    var india = raw.india || {};
    var us = raw.us || {};
    var router = raw.router || {};
    var annual = indiaAnnualSlice(india);

    // Resolved once, shared by entity.indiaReturnForm and each India business
    // entity's per-row returnForm below, so they never disagree with each
    // other. Layer 1 India's evaluateITRForm() runs a real 7-form eligibility
    // check (income thresholds, residency, capital gains, foreign
    // assets/income, directorship, crypto, multiple house properties, etc.)
    // and persists its verdict to itr_recommendation.form — read that when
    // present; only fall back to the crude entity-type-only mapping when
    // Layer 1 hasn't run it (e.g. a hand-authored profile that never went
    // through the browser form).
    var indiaEntityKind = safe(india, "profile.entity_type", "individual");
    var indiaIsCompany = indiaEntityKind === "company";
    var indiaIsFirm = ["firm", "llp", "local"].indexOf(indiaEntityKind) >= 0;
    var indiaLayer1Itr = safe(india, "itr_recommendation.form", null);
    if (indiaLayer1Itr === "Unknown") indiaLayer1Itr = null;
    var indiaReturnFormCrude = indiaIsCompany ? "ITR-6" : (indiaIsFirm ? "ITR-5" : "ITR-2/3");
    var indiaReturnForm = indiaLayer1Itr || indiaReturnFormCrude;

    return {
      meta: {
        hasIndia: !!raw.india,
        hasUs: !!raw.us,
        hasRouter: !!raw.router,
        jurisdiction: safe(router, "jurisdiction", (raw.india && raw.us) ? "dual" : (raw.india ? "single_india" : "single_us")),
        baseYear: num(safe(router, "base_tax_year", safe(us, "metadata.us_calendar_year", 2025))) || 2025,
        fxRate: CONST.FX.INR_PER_USD,
        indiaSchemaVersion: safe(india, "metadata.schema_version", null),
        usSchemaVersion: safe(us, "metadata.schema_version", null),
        indiaQuarterly: !!safe(india, "quarters", null)
      },
      periods: {
        // India FY quarters in USD (Q1=Apr-Jun … Q4=Jan-Mar); null when the form
        // has no quarterly data (apportionment then assumes even earning).
        indiaQuarterlyUsd: (function () {
          var q = safe(india, "quarters", null);
          if (!q) return null;
          return ["Q1", "Q2", "Q3", "Q4"].map(function (k) {
            var qd = q[k] || {}, di = qd.domestic_income || {}, os = qd.other_sources || {}, cg = qd.capital_gains || {};
            return inrToUsd(
              num(safe(di, "salary.taxable_salary_inr", 0)) + num(safe(di, "salary.gross_salary_inr", 0)) +
              num(safe(os, "interest_inr", 0)) + num(safe(os, "dividend_inr", 0)) +
              num(safe(cg, "stcg_111a_inr", 0)) + num(safe(cg, "ltcg_112a_inr", 0))
            );
          });
        })()
      },
      identity: {
        name: safe(router, "full_name", safe(india, "profile.full_name", safe(us, "profile.full_name", "Unnamed Taxpayer"))),
        dob: safe(router, "date_of_birth", safe(india, "profile.date_of_birth", safe(us, "profile.date_of_birth", null))),
        usFilingStatus: normalizeFilingStatus(safe(us, "profile.filing_status", "single")),
        indiaEntityType: safe(india, "profile.entity_type", "individual"),
        // Raw fact (not derived) — captured by Layer 1's PAN/Aadhaar toggle but
        // never read anywhere in the engine before this. null when the field
        // has never been touched (don't want to flag an unanswered toggle the
        // same as an explicit "not linked").
        panAadhaarLinked: safe(india, "profile.pan_aadhaar_linked", null)
      },
      entity: (function () {
        var usT = safe(us, "profile.tax_entity_type", "individual");
        if (usT === "llc") usT = safe(us, "profile.llc_tax_election", "individual");
        var usIsBusiness = ["ccorp", "scorp", "partnership", "trust"].indexOf(usT) >= 0;
        // A profile is "business POV" when either side is a non-individual entity.
        return {
          indiaKind: indiaEntityKind, usKind: usT,
          indiaIsCompany: indiaIsCompany, indiaIsFirm: indiaIsFirm,
          indiaOpt115baa: safe(india, "profile.opt_115baa", false) === true,
          indiaTurnoverLte400cr: safe(india, "profile.turnover_lte_400cr", false) === true,
          usIsBusiness: usIsBusiness,
          isBusiness: indiaIsCompany || indiaIsFirm || usIsBusiness,
          indiaReturnForm: indiaReturnForm,
          indiaReturnFormIsRecommendation: !!indiaLayer1Itr,
          indiaReturnFormExplanation: indiaLayer1Itr ? safe(india, "itr_recommendation.explanation", null) : null,
          // 1040-NR when Layer 1 US recorded the taxpayer as filing the NRA
          // return, else the standard resident/citizen 1040 (or the entity
          // forms above for a business-mode US profile).
          usReturnForm: usT === "ccorp" ? "1120" : usT === "scorp" ? "1120-S" : usT === "partnership" ? "1065" : usT === "trust" ? "1041" :
            (safe(us, "nra_specific.files_form_1040nr", false) === true ? "1040-NR" : "1040")
        };
      })(),
      residency: {
        india: {
          status: safe(india, "residency_detail.final_india_residency_status", null),
          daysCurrentYear: num(safe(india, "residency_detail.days_in_india_current_year", 0)),
          taxRegime: safe(india, "profile.tax_regime", "NEW"),
          // Raw fact (not derived): is this a company incorporated in India?
          // An Indian company is unconditionally resident regardless of POEM
          // (place of incorporation controls); POEM only determines residency
          // for a company that is NOT Indian-incorporated. Null when unset
          // (e.g. not a company entity).
          isIndianCompanyFact: safe(india, "residency_detail.is_indian_company", null)
        },
        us: {
          status: safe(us, "us_residency_detail.final_us_residency_status", null),
          isCitizen: safe(us, "us_residency_detail.is_us_citizen", false) === true,
          hasGreenCard: safe(us, "us_residency_detail.has_green_card", false) === true,
          sptMet: safe(us, "us_residency_detail.spt_test_met", false) === true,
          daysCurrentYear: num(safe(us, "us_residency_detail.us_days_current_year", 0))
        }
      },
      // US state residency — the DTAA/IRC treaty machinery above governs FEDERAL
      // tax only. States are not parties to the India-US treaty, so a federal
      // treaty tie-breaker or NR position does not bind a state; a taxpayer can
      // remain a full worldwide-income state tax resident (domicile or
      // statutory-residency test) even after "winning" the federal tie-breaker.
      stateResidency: {
        domicileJan1: safe(us, "state_residency.jan_1_domicile_state", null),
        domicileDec31: safe(us, "state_residency.dec_31_domicile_state", null),
        primaryState: safe(us, "state_residency.primary_state_of_residence", null),
        footprint: safe(us, "state_residency.total_states_footprint", []) || [],
        movedStates: safe(us, "state_residency.moved_states_this_year", false) === true,
        caSafeHarbor: safe(us, "state_residency.ca_safe_harbor_employment_contract", false) === true,
        caRetainsTies: safe(us, "state_residency.ca_retains_property_or_voter_reg", false) === true,
        nyDaysPresent: num(safe(us, "state_residency.ny_actual_days_present", 0)),
        nyPermanentAbode: safe(us, "state_residency.ny_permanent_place_of_abode", false) === true,
        ny548DayRule: safe(us, "state_residency.ny_548_day_rule", false) === true
      },
      // Company POEM raw facts (only meaningful when entity.indiaIsCompany).
      // The form's own solver derives a suggested POEM conclusion from these
      // for UI purposes (same pattern as the individual residency wizard),
      // but the engine reads the raw facts directly for its own findings
      // rather than re-deriving POEM a second time.
      companyResidency: {
        isActiveBusiness: safe(india, "company_residency.is_active_business", false) === true,
        boardMeetingsOutsideIndia: safe(india, "company_residency.board_meetings_primarily_outside_india", false) === true,
        keyManagementLocation: safe(india, "company_residency.key_management_location", null),
        managementDelegatedOutsideIndia: safe(india, "company_residency.management_delegated_outside_india", false) === true,
        directorsInIndia: num(safe(india, "company_residency.directors_in_india_count", 0)),
        directorsOutsideIndia: num(safe(india, "company_residency.directors_outside_india_count", 0))
      },
      treaty: {
        trcStatus: safe(india, "dtaa.trc_status", false) === true ||
                   safe(india, "compliance_docs.trc.document_uploaded", false) === true,
        form10fFiled: safe(india, "compliance_docs.form_10f.is_filed", false) === true,
        treatyResidence: safe(india, "dtaa.dtaa_treaty_residence", "none"),
        dtaaForcedNr: safe(india, "dtaa.dtaa_forced_nr", false) === true,
        hasPE: safe(india, "dtaa.has_permanent_establishment_in_india", false) === true,
        usTreatyResidence: safe(us, "us_residency_detail.dtaa_treaty_residence", "none"),
        files1040nr: safe(us, "nra_specific.files_form_1040nr", false) === true,
        form8833Implied: safe(us, "us_residency_detail.dtaa_treaty_residence", "none") !== "none",
        chapterXiiaElected: safe(india, "compliance_docs.chapter_xiia_elected", false) === true,
        // Article 4 tie-breaker raw answers (permanent home -> centre of vital
        // interests -> habitual abode -> nationality). Layer 1's own wizard
        // (evaluateTieBreaker() in layer1_india.html) records these as it asks
        // each question in sequence; the engine previously only ever read the
        // final winner (treatyResidence above) and dropped WHICH step decided
        // it — surfaced via describeTieBreak() in conflicts.js.
        tieBreakHome: safe(india, "dtaa.tb_home", null),
        tieBreakCvi: safe(india, "dtaa.tb_cvi", null),
        tieBreakAbode: safe(india, "dtaa.tb_abode", null),
        tieBreakNationality: safe(india, "dtaa.tb_nationality", null),
        // Per-income-stream treaty elections (e.g. Art 11(2)(b) 15% on
        // interest, Art 12(2)(a)(ii) 15% on royalty/FTS) — captured by Layer 1
        // but never read anywhere in the engine before this.
        treatyElections: safe(india, "dtaa.treaty_elections", []) || []
      },
      equityComp: aggregateEquityComp(annual.domestic_income, us),
      // NRA-specific (Form 1040-NR) facts. Layer 1 already splits FDAP vs ECI
      // and tracks treaty-rate claims / W-8BEN / FIRPTA, but none of it was
      // read before this pass — the engine ran every filer through the same
      // resident-style graduated-bracket computation.
      nra: {
        hasUsPe: safe(us, "nra_specific.has_us_pe", false) === true,
        submittedW8ben: safe(us, "nra_specific.submitted_w8ben", false) === true,
        eciIncomeUsd: num(safe(us, "nra_specific.us_eci_income_usd", 0)),
        fdapIncomeUsd: num(safe(us, "nra_specific.us_fdap_income_usd", 0)),
        treatyRateClaims: safe(us, "nra_specific.treaty_rate_claims", []) || [],
        usRealPropertyDisposed: safe(us, "nra_specific.us_real_property_disposed", false) === true,
        firptaWithholdingUsd: num(safe(us, "nra_specific.firpta_withholding_usd", 0)),
        s6013hElection: safe(us, "nra_specific.s6013h_joint_election", false) === true
      },
      // India's own Schedule FA self-report — used to cross-check against what
      // the US Layer 1 form actually shows (see the schedule_fa_inconsistent
      // finding: the two intake forms can flatly disagree about whether
      // foreign assets exist).
      indiaForeignAssetsDeclared: safe(india, "foreign_assets.has_foreign_assets", null),
      // Carry-forward losses — WISING now actually sequences the set-off
      // against current-year income (see computeLossSetOff in computation.js)
      // rather than only flagging that they exist. Layer 1 already resolves
      // per-entry eligibility (late-filing denial, new-regime HP/business-
      // depreciation restrictions) into final_allowed_amount_inr; sum that
      // (falling back to amount_inr for entries without it, e.g. hand-built
      // test data) to get what's actually available to set off this year.
      carryForwardLosses: (function () {
        function sumAllowed(arr) {
          return (arr || []).reduce(function (s, e) {
            var v = (e && e.final_allowed_amount_inr != null) ? e.final_allowed_amount_inr : num(e && e.amount_inr);
            return s + num(v);
          }, 0);
        }
        var businessArr = safe(india, "carry_forward_losses.business_loss_cf", []) || [];
        var specArr = safe(india, "carry_forward_losses.speculative_loss_cf", []) || [];
        var stcgArr = safe(india, "carry_forward_losses.stcg_loss_cf", []) || [];
        var ltcgArr = safe(india, "carry_forward_losses.ltcg_loss_cf", []) || [];
        var hpArr = safe(india, "carry_forward_losses.house_property_loss_cf", []) || [];
        return {
          hasBroughtForwardLosses: safe(india, "carry_forward_losses.has_brought_forward_losses", null),
          businessLossCfCount: businessArr.length,
          speculativeLossCfCount: specArr.length,
          stcgLossCfCount: stcgArr.length,
          ltcgLossCfCount: ltcgArr.length,
          housePropertyLossCfCount: hpArr.length,
          businessLossAvailableInr: sumAllowed(businessArr),
          speculativeLossAvailableInr: sumAllowed(specArr),
          stcgLossAvailableInr: sumAllowed(stcgArr),
          ltcgLossAvailableInr: sumAllowed(ltcgArr),
          housePropertyLossAvailableInr: sumAllowed(hpArr),
          unabsorbedDepreciationCf: num(safe(india, "carry_forward_losses.unabsorbed_depreciation_cf", 0))
        };
      })(),
      foreignGifts: {
        receivedAbove100k: safe(us, "foreign_gifts_and_trusts.received_foreign_gifts_above_100k", false) === true,
        isTrustBeneficiary: safe(us, "foreign_gifts_and_trusts.is_us_beneficiary_of_foreign_trust", false) === true,
        receivedFromCoveredExpatriate: safe(us, "foreign_gifts_and_trusts.received_gift_from_covered_expatriate", false) === true
      },
      income: {
        india: aggregateIndiaIncome(india, annual),
        us: aggregateUsIncome(us, annual)
      },
      deductions: {
        india: aggregateIndiaDeductions(india),
        us: aggregateUsDeductions(us)
      },
      accounts: aggregateAccounts(india, us),
      taxesPaid: aggregateTaxesPaid(india, us),
      withholdingDetail: aggregateWithholdingDetail(india, us),
      assets: {
        indianMutualFunds: (safe(india, "financial_holdings.transactions", []) || []).filter(function (t) {
          return t.asset_type && String(t.asset_type).toLowerCase().indexOf("mutual_fund") >= 0;
        }),
        indianSecurities: safe(india, "financial_holdings.transactions", []) || [],
        usPficHoldings: safe(us, "foreign_entities.pfic_holdings", []),
        indianBusinesses: safe(annual.domestic_income, "business_income.business_entries", []),
        usForeignCorps: safe(us, "foreign_entities.foreign_corporations", []),
        usOwns10PctForeignCorp: safe(us, "foreign_entities.owns_10_percent_foreign_corp", false) === true,
        indianProperties: safe(india, "property.properties", []),
        epfInr: num(safe(india, "deductions.s80C.epf_employee_inr", 0)),
        ppfInr: num(safe(india, "deductions.s80C.ppf_inr", 0)),
        npsInr: num(safe(india, "deductions.s80CCC_80CCD1.nps_employee_contribution_inr", 0)),
        // Actual taxable withdrawal/interest amounts (as opposed to just
        // whether an account exists) — lets the retirement-mismatch finding
        // quantify the US-taxable exposure precisely instead of a generic
        // warning with no dollar figure.
        taxableEpfInterestInr: num(safe(annual.other_sources, "taxable_epf_interest_inr", 0)),
        taxableNpsWithdrawalInr: num(safe(annual.other_sources, "taxable_nps_withdrawal_inr", 0)),
        // US-side holdings the Layer 1 US form captures
        usSecurities: safe(us, "financial_holdings", []) || [],
        usProperties: safe(us, "real_estate.properties", []) || [],
        usRetirement: safe(us, "retirement_accounts", {}) || {},
        // Per-entity business breakdown (for the Business tab). One row per real
        // entity: a company the taxpayer merely OWNS is a foreign corp (CFC),
        // not their personal PGBP income, so same-named entries are merged
        // (income counted once) and CFC/GILTI attach as flags — no double count.
        businessEntities: (function () {
          var list = [], ui = safe(us, "income_us_source", {});
          var entityKind = safe(us, "profile.tax_entity_type", "individual");
          var indiaIsCompanyOrFirm = indiaIsCompany || indiaIsFirm;
          // The US entity's OWN return income (e.g. a C-Corp's 1120 income).
          if (entityKind === "ccorp" || safe(us, "profile.incorporated_in_us", false) === true) {
            var selfInc = num(safe(ui, "business_income_usd", 0));
            if (selfInc > 0) list.push({ country: "US", type: "C-Corp (Form 1120)", name: safe(us, "profile.full_name", "US C-Corp"), incomeUsd: selfInc, corp: true,
              filesOwnReturn: true, returnForm: "Form 1120 (C-Corp — entity-level return, 21% flat)",
              calcTrace: source("Entity-level taxable income as entered on Layer 1 US (business_income_usd). Taxed at 21% at the entity; not on a personal return until distributed as a dividend.") }); }
          (safe(ui, "self_employment", []) || []).forEach(function (s) { list.push({ country: "US", type: "Self-employment (Sch C)", name: s.business_name || s.name || "Self-employment", incomeUsd: selfEmploymentNetProfitUsd(s), se: true, qbi: true,
            filesOwnReturn: false, returnForm: "Schedule C + Schedule SE (Form 1040)",
            calcTrace: selfEmploymentIncomeTrace(s) }); });
          (safe(ui, "schedule_c_businesses", []) || []).forEach(function (s) { list.push({ country: "US", type: "Schedule C", name: s.business_name || s.name || "Sole proprietorship", incomeUsd: num(s.net_profit_usd || s.net_earnings_usd || 0), se: true, qbi: true,
            filesOwnReturn: false, returnForm: "Schedule C (Form 1040)",
            calcTrace: source("Net profit as entered directly on Layer 1 US for this Schedule C business (net_profit_usd, or net_earnings_usd if that field wasn't used).") }); });
          (safe(ui, "farming_schedule_f", []) || []).forEach(function (s) { list.push({ country: "US", type: "Farm (Sch F)", name: s.name || "Farm", incomeUsd: num(s.net_profit_usd || 0), se: true, qbi: true,
            filesOwnReturn: false, returnForm: "Schedule F (Form 1040)",
            calcTrace: source("Net farm profit as entered directly on Layer 1 US for this farm (net_profit_usd).") }); });
          (safe(ui, "partnerships_k1", []) || []).forEach(function (k) {
            var ord = num(k.ordinary_business_income_usd || k.ordinary_income_usd || 0), gp = num(k.guaranteed_payments_usd || 0);
            list.push({ country: "US", type: "Partnership K-1 (1065)", name: k.partnership_name || k.name || "Partnership", incomeUsd: ord + gp, se: true, qbi: true,
              filesOwnReturn: false, returnForm: "Form 1065 (partnership return, informational) → Schedule E + Schedule SE (Form 1040)",
              calcTrace: calc("Ordinary business income (K-1 Box 1) + guaranteed payments (K-1 Box 4). Guaranteed payments count for SE tax but are excluded from the §199A QBI base.", [
                { label: "Ordinary business income (Box 1)", amount: ord },
                { label: "Guaranteed payments (Box 4)", amount: gp }
              ]) });
          });
          (safe(ui, "s_corporations_k1", []) || []).forEach(function (s) { list.push({ country: "US", type: "S-Corp K-1 (1120-S)", name: s.corp_name || s.name || "S-Corporation", incomeUsd: num(s.scorp_income_usd || s.ordinary_business_income_usd || 0), se: false, qbi: true,
            filesOwnReturn: false, returnForm: "Form 1120-S (S-corp return, informational) → Schedule E (Form 1040)",
            calcTrace: source("Ordinary business income as entered on Layer 1 US from this S-corp's K-1 (scorp_income_usd, or ordinary_business_income_usd if that field wasn't used). S-corp distributions aren't subject to SE tax.") }); });
          (safe(ui, "c_corporations_1120", []) || []).forEach(function (c) { list.push({ country: "US", type: "C-Corp (Form 1120)", name: c.corp_name || c.name || "C-Corporation", incomeUsd: num(c.taxable_income_usd || c.net_income_usd || 0), corp: true,
            filesOwnReturn: true, returnForm: "Form 1120 (C-Corp — entity-level return, 21% flat)",
            calcTrace: source("Entity-level taxable income as entered on Layer 1 US for this C-corp (taxable_income_usd, or net_income_usd if that field wasn't used). Taxed at 21% at the entity; not on a personal return until distributed.") }); });
          (safe(annual.domestic_income, "business_income.business_entries", []) || []).forEach(function (b) {
            var netProfitInr = b.net_profit_inr || b.net_profit;
            if (netProfitInr === undefined || netProfitInr === null) netProfitInr = computeBusinessEntryNetProfitInr(b);
            netProfitInr = num(netProfitInr);
            // Same resolved form as entity.indiaReturnForm — Layer 1's real
            // eligibility check when it ran, else a business-aware crude
            // guess (never "ITR-2", since ITR-2 can't carry PGBP income at
            // all — a presumptive entry defaults to ITR-4, everything else
            // to ITR-3, both still labeled as a guess pending the real check).
            var entryReturnForm = indiaLayer1Itr ? indiaReturnForm :
              (indiaIsCompanyOrFirm ? indiaReturnFormCrude :
                (["s44AD", "s44ADA", "s44AE"].indexOf(b.presumptive_scheme) >= 0
                  ? "ITR-4 (Sugam) if eligible, else ITR-3 — presumptive scheme"
                  : "ITR-3 — regular books"));
            list.push({ country: "IN", type: "Business / Profession (PGBP)", name: b.trade_name || b.name || "Indian business", incomeUsd: inrToUsd(netProfitInr), inr: netProfitInr,
              filesOwnReturn: indiaIsCompanyOrFirm, returnForm: entryReturnForm,
              calcTrace: businessEntryIncomeTrace(b) });
          });
          (safe(us, "foreign_entities.foreign_corporations", []) || []).forEach(function (c) { list.push({ country: c.country === "IN" ? "IN" : "US", type: "Foreign corporation (CFC)", name: c.corp_name || "Foreign corporation", incomeUsd: num(c.gilti_income_usd || 0), cfc: true, gilti: num(c.gilti_income_usd || 0), ownershipPct: num(c.ownership_pct || 0),
            filesOwnReturn: true, returnForm: "Foreign local return (not modeled) + Form 5471 (informational, US) + GILTI on Schedule 1 (Form 1040)",
            calcTrace: source("GILTI inclusion as entered on Layer 1 US for this CFC (gilti_income_usd) — a hand-entered estimate, since full GILTI/QBAI/tested-income computation from the CFC's own books isn't modeled yet (see gap tracker). Ownership: " + Math.round(num(c.ownership_pct || 0)) + "%. This is a US inclusion only — the entity's own foreign-country income tax return is separate and not shown here.") }); });
          // Merge same-named entities so income is counted once; CFC/GILTI flags
          // fold onto the entity's real income row.
          var byName = {}, order = [];
          list.forEach(function (e) {
            var key = String(e.name || "").toLowerCase().replace(/\s+/g, " ").trim();
            if (!byName[key]) { byName[key] = e; order.push(key); return; }
            var ex = byName[key];
            if (e.cfc) { ex.cfc = true; ex.gilti = Math.max(ex.gilti || 0, e.gilti || 0); ex.ownershipPct = ex.ownershipPct || e.ownershipPct; if (!ex.incomeUsd) ex.incomeUsd = e.incomeUsd; }
            else if (ex.cfc) { e.cfc = ex.cfc; e.gilti = ex.gilti; e.ownershipPct = ex.ownershipPct; byName[key] = e; }
            else { ex.incomeUsd = Math.max(ex.incomeUsd || 0, e.incomeUsd || 0); }
          });
          return order.map(function (k) { return byName[k]; });
        })()
      },
      limitsRaw: {
        lrsRemittedInr: num(safe(annual.lrs_outbound, "total_lrs_remitted_this_fy_inr", 0)) ||
                        num(safe(india, "lrs_outbound.total_lrs_remitted_this_fy_inr", 0)),
        feieClaimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
        feieAmountUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
        fbarFormFlag: num(safe(us, "fbar_aggregate_peak_usd", 0)),
        form8938Flag: safe(us, "form_8938_required", false) === true,
        additionalMedicareOwed: num(safe(us, "withholding_and_estimated.additional_medicare_tax_owed_usd", 0)),
        trumpAccountsOpened: safe(us, "profile.trump_accounts_opened", false) === true,
        trumpAccountsNumChildren: num(safe(us, "profile.trump_accounts_num_children", 0)),
        trumpAccountsSeedEligibleChildren: num(safe(us, "profile.trump_accounts_children_born_2025_2028", 0)),
        trumpAccountsContributionsUsd: num(safe(us, "profile.trump_accounts_total_contributions_usd", 0))
      },
      // FEIE (Form 2555) eligibility inputs — the exclusion is only available to a
      // taxpayer whose TAX HOME is abroad AND who meets the bona-fide-residence or
      // physical-presence (>=330 days abroad, i.e. <=35 US days) test. Someone
      // living in the US cannot claim it, so we capture the qualification facts.
      feie: {
        claimed: safe(us, "foreign_earned_income.claims_feie", false) === true,
        amountClaimedUsd: num(safe(us, "foreign_earned_income.feie_amount_claimed_usd", 0)),
        foreignEarnedIncomeUsd: num(safe(us, "foreign_earned_income.foreign_earned_income_usd", 0)),
        taxHomeCountry: safe(us, "foreign_earned_income.tax_home_country", ""),
        bonaFide: safe(us, "foreign_earned_income.bona_fide_residence", false) === true,
        physicalPresence: safe(us, "foreign_earned_income.physical_presence", false) === true,
        daysInUsTestPeriod: num(safe(us, "foreign_earned_income.days_in_us_during_test_period", 0))
      },
      _raw: raw
    };
  }

  WISING.normalize = normalize;
  WISING.util = {
    num: num, inrToUsd: inrToUsd, usdToInr: usdToInr,
    moneyFromInr: moneyFromInr, moneyFromUsd: moneyFromUsd,
    addMoney: addMoney, zeroMoney: zeroMoney, safe: safe,
    normalizeFilingStatus: normalizeFilingStatus
  };
})(typeof window !== "undefined" ? window : globalThis);

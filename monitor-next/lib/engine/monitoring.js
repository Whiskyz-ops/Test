/* ============================================================================
 * WISING — Layer 2 Engine :: monitoring.js
 * ----------------------------------------------------------------------------
 * The "always-on" layer (Sphere-style). Where computation.js/conflicts.js give
 * a point-in-time picture, this adds the TIME DIMENSION:
 *
 *   1. Residency day-counters + predicted "flip" date (US SPT / India 182-day).
 *   2. Threshold breach PROJECTIONS — at the current run-rate, when does each
 *      limit (FBAR / 8938 / LRS / FEIE) get crossed?
 *   3. A compliance calendar of filing deadlines with countdowns.
 *   4. A compliance-health score + an alerts feed of what needs attention.
 *
 * Monitoring is forward-looking within an in-progress tax year. When "today"
 * falls outside the base tax year (e.g. reviewing a past year in a demo), we
 * simulate an in-year "as-of" point so projections stay illustrative. All
 * projected figures are clearly labelled "at current pace".
 * ==========================================================================*/
(function (root) {
  "use strict";

  var WISING = root.WISING = root.WISING || {};
  var CONST = WISING.CONST;
  var U = WISING.util;

  var DAY = 86400000;
  function addDays(d, n) { return new Date(d.getTime() + n * DAY); }
  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function monitor(model, computed, opts) {
    opts = opts || {};
    var baseYear = model.meta.baseYear;
    var today = opts.asOf ? new Date(opts.asOf) : new Date();

    // ---- as-of progress through each tax-year calendar ----
    var cyStart = new Date(baseYear, 0, 1), cyEnd = new Date(baseYear, 11, 31);
    var fyStart = new Date(baseYear, 3, 1), fyEnd = new Date(baseYear + 1, 2, 31);
    var SIM = 0.62; // simulated mid-year point when today is outside the year
    function progress(start, end) {
      var f = (today - start) / (end - start);
      return (f > 0.03 && f < 0.98) ? f : SIM;
    }
    var progUS = progress(cyStart, cyEnd);
    var progIN = progress(fyStart, fyEnd);
    var simulated = !((today - cyStart) / (cyEnd - cyStart) > 0.03 && (today - cyEnd) < 0);

    // ================= 1. RESIDENCY DAY-COUNTERS =================
    function counter(cfg) {
      var days = cfg.days, threshold = cfg.threshold, prog = cfg.prog;
      var already = cfg.isResident || days >= threshold;
      var pace = days / (prog * 365);         // residency-days accrued per calendar day
      var res = {
        country: cfg.country, flag: cfg.flag, test: cfg.test,
        days: days, threshold: threshold, pct: clamp(days / threshold, 0, 1.5),
        isResident: already, projectedFullYear: Math.round(prog > 0 ? days / prog : days),
        pace: pace
      };
      if (already) {
        // approx date the count crossed the threshold
        var elapsedToCross = pace > 0 ? (threshold / pace) : 0;
        var crossDate = addDays(cfg.yearStart, Math.min(365, elapsedToCross));
        res.status = "resident";
        res.headline = cfg.worldwide === false
          ? "Resident (source basis) — foreign income not taxed here"
          : "Tax resident — worldwide income in scope";
        res.dateLabel = "Crossed ~" + fmtDate(crossDate);
      } else if (res.projectedFullYear >= threshold && pace > 0) {
        var elapsedNeeded = (threshold - days) / pace;
        res.status = "will_flip";
        res.flipDate = addDays(today, elapsedNeeded);
        res.headline = (threshold - days) + " more days → becomes resident";
        res.dateLabel = "Projected flip ~" + fmtDate(res.flipDate) + " at current pace";
      } else {
        res.status = "safe";
        res.headline = "Non-resident — " + (threshold - days) + " days of headroom";
        res.dateLabel = "Not projected to cross this year";
      }
      return res;
    }

    var residency = [
      counter({
        country: "United States", flag: "🇺🇸", test: "Substantial Presence (≥183 weighted)",
        days: model.residency.us.daysCurrentYear, threshold: 183, prog: progUS,
        isResident: model.residency.us.sptMet || model.residency.us.isCitizen || model.residency.us.hasGreenCard,
        worldwide: computed.residency.us.worldwide, yearStart: cyStart
      }),
      counter({
        country: "India", flag: "🇮🇳", test: "≥182 days in the FY",
        days: model.residency.india.daysCurrentYear, threshold: 182, prog: progIN,
        isResident: computed.residency.india.isResident, worldwide: computed.residency.india.worldwide, yearStart: fyStart
      })
    ];

    // ================= 2. THRESHOLD BREACH PROJECTIONS =================
    var projections = computed.limits.map(function (g) {
      var prog = g.id === "lrs" ? progIN : progUS;
      var yearStart = g.id === "lrs" ? fyStart : cyStart;
      var yearLen = g.id === "lrs" ? (fyEnd - fyStart) / DAY : (cyEnd - cyStart) / DAY;
      var projected = prog > 0 ? g.value / prog : g.value;
      var out = {
        id: g.id, label: g.label, current: g.value, limit: g.limit,
        pct: g.pct, projected: projected, projPct: g.limit > 0 ? projected / g.limit : 0,
        note: g.note
      };
      if (g.value >= g.limit) { out.status = "breached"; out.dateLabel = "Already breached"; }
      else if (projected >= g.limit && g.value > 0) {
        var f = (g.limit * prog) / g.value;                 // fraction of year at crossing
        out.status = "will_breach";
        out.breachDate = addDays(yearStart, clamp(f, 0, 1) * yearLen);
        out.dateLabel = "Projected to cross ~" + fmtDate(out.breachDate);
      } else { out.status = "ok"; out.dateLabel = "Within limit at current pace"; }
      return out;
    });

    // ================= 3. COMPLIANCE CALENDAR =================
    // docIds ties each deadline to the specific CONST.DOCUMENTS that are filed
    // on/by that date, so the UI can show a precise document subset per deadline
    // (intersected with what this client actually triggers) instead of "every
    // document for the jurisdiction". Payment installments (advance / estimated
    // tax) carry no informational forms. Note Form 15CA/CB and Form 8802 are
    // deliberately absent — both are filed ahead of / independent from the
    // return's own due date, not "with" it on a single fixed day.
    var US_RETURN_DOCS = ["fincen_114", "form_8938", "form_1116", "form_2555", "form_8833",
      "form_8621", "form_5471", "form_8865", "form_3520", "form_1040nr", "form_8960", "form_8959", "form_6251"];
    var IN_RETURN_DOCS = ["form_67", "trc", "form_10f", "schedule_fa", "schedule_fsi_tr", "schedule_al", "form_3cb_3cd", "form_3ceb"];
    function d(y, m, day) { return new Date(y, m - 1, day); }

    // ---- entity-aware filing dates -----------------------------------
    // The Return Form card already resolves which US/India return this
    // taxpayer files (model.entity.usReturnForm / indiaIsCompany|indiaIsFirm);
    // the calendar used to hardcode individual 1040 / ITR-2,3 dates
    // regardless. Business/entity returns carry their own statutory due
    // dates — wire the calendar to the same determination instead of a
    // second, disagreeing guess.
    var usKind = model.entity ? model.entity.usReturnForm : "1040";
    // Calendar-year statutory due dates (original / extended). 1120 and
    // 1040/1040-NR coincide (Apr 15 / Oct 15) so only the label differs for
    // C-corps; 1120-S/1065 and 1041 have their own earlier dates.
    var US_FILING_DATES = {
      "1120":    { orig: d(baseYear + 1, 4, 15), ext: d(baseYear + 1, 10, 15), label: "US Form 1120 (C-Corp)" },
      "1120-S":  { orig: d(baseYear + 1, 3, 15), ext: d(baseYear + 1, 9, 15), label: "US Form 1120-S (S-Corp)" },
      "1065":    { orig: d(baseYear + 1, 3, 15), ext: d(baseYear + 1, 9, 15), label: "US Form 1065 (Partnership)" },
      "1041":    { orig: d(baseYear + 1, 4, 15), ext: d(baseYear + 1, 9, 30), label: "US Form 1041 (Trust/Estate)" },
      "1040-NR": { orig: d(baseYear + 1, 4, 15), ext: d(baseYear + 1, 10, 15), label: "US Form 1040-NR + FBAR" },
      "1040":    { orig: d(baseYear + 1, 4, 15), ext: d(baseYear + 1, 10, 15), label: "US Form 1040 + Form 1116 + FBAR" }
    };
    var usFiling = US_FILING_DATES[usKind] || US_FILING_DATES["1040"];
    // A C-corp pays its own estimated tax on its own calendar (Apr/Jun/Sep/Dec
    // of the SAME year — no Jan-of-next-year quarter, unlike individuals).
    // Pass-through entities (S-corp/partnership) don't pay entity-level
    // estimated tax at all — their owners do, on the individual Apr/Jun/Sep/
    // Jan schedule already below — so only ccorp's Q4 date/label differs.
    var usQ4 = usKind === "1120" ? { date: d(baseYear, 12, 15), label: "US estimated tax — Q4 (C-Corp)" }
                                  : { date: d(baseYear + 1, 1, 15), label: "US estimated tax — Q4" };

    // India: a company (ITR-6) is unconditionally an audit case; an
    // individual/firm business crosses into one only above the s.44AB
    // turnover threshold (₹1cr, or ₹10cr where cash receipts are ≤5% of the
    // total) — same threshold and field-fallback chain as buildDocuments'
    // form_3cb_3cd trigger in conflicts.js, kept in sync deliberately rather
    // than shared, since monitoring.js and conflicts.js don't otherwise
    // depend on each other.
    var inTurnover = (function () {
      var totalInr = 0, cashInr = 0;
      (model.assets && model.assets.indianBusinesses || []).forEach(function (b) {
        var digital = U.num(b.digital_receipts_inr) + U.num(b.ada_digital_receipts_inr);
        var cash = U.num(b.cash_receipts_inr) + U.num(b.ada_cash_receipts_inr);
        var receipts = U.num(b.gross_receipts_inr) || U.num(b.turnover_inr) || (digital + cash);
        totalInr += receipts; cashInr += cash;
      });
      return { totalInr: totalInr, cashInr: cashInr };
    })();
    var inTurnoverAuditCase = inTurnover.totalInr > 0 &&
      inTurnover.totalInr > ((inTurnover.cashInr / inTurnover.totalInr) <= 0.05 ? 100000000 : 10000000);
    var indiaIsAuditCase = (model.entity && model.entity.indiaIsCompany) || inTurnoverAuditCase;
    var indiaFiling = indiaIsAuditCase
      ? { date: d(baseYear + 1, 10, 31), label: "India ITR + Form 44 (audit case)" }
      : { date: d(baseYear + 1, 7, 31), label: "India ITR + Form 44 (non-audit)" };

    var deadlines = [
      { name: "India advance tax — Q1 (15%)", jur: "IN", date: d(baseYear, 6, 15), cat: "Advance tax", docIds: [] },
      { name: "India advance tax — Q2 (45%)", jur: "IN", date: d(baseYear, 9, 15), cat: "Advance tax", docIds: [] },
      { name: "India advance tax — Q3 (75%)", jur: "IN", date: d(baseYear, 12, 15), cat: "Advance tax", docIds: [] },
      { name: "India advance tax — Q4 (100%)", jur: "IN", date: d(baseYear + 1, 3, 15), cat: "Advance tax", docIds: [] },
      { name: "US estimated tax — Q1", jur: "US", date: d(baseYear, 4, 15), cat: "Estimated tax", docIds: [] },
      { name: "US estimated tax — Q2", jur: "US", date: d(baseYear, 6, 15), cat: "Estimated tax", docIds: [] },
      { name: "US estimated tax — Q3", jur: "US", date: d(baseYear, 9, 15), cat: "Estimated tax", docIds: [] },
      { name: usQ4.label, jur: "US", date: usQ4.date, cat: "Estimated tax", docIds: [] },
      { name: usFiling.label, jur: "US", date: usFiling.orig, cat: "Filing", docIds: US_RETURN_DOCS },
      { name: indiaFiling.label, jur: "IN", date: indiaFiling.date, cat: "Filing", docIds: IN_RETURN_DOCS },
      { name: "US extended " + usFiling.label.replace(/^US /, "") + " deadline", jur: "US", date: usFiling.ext, cat: "Extension", docIds: US_RETURN_DOCS },
      { name: "India belated / revised ITR", jur: "IN", date: d(baseYear + 1, 12, 31), cat: "Extension", docIds: IN_RETURN_DOCS }
    ].map(function (x) {
      var du = daysBetween(today, x.date);
      x.daysUntil = du;
      x.status = du < 0 ? "passed" : (du <= 30 ? "due_soon" : "upcoming");
      x.dateLabel = fmtDate(x.date);
      return x;
    }).sort(function (a, b) { return a.date - b.date; });

    var upcoming = deadlines.filter(function (x) { return x.status !== "passed"; });
    var nextDeadline = upcoming[0] || null;

    // ================= 4. HEALTH SCORE + ALERTS =================
    var counts = { critical: 0, warning: 0, info: 0 };
    computed && (computed.__x = 0);
    (opts.findings || []).forEach(function (f) { counts[f.severity]++; });
    var breachedLimits = projections.filter(function (p) { return p.status === "breached"; }).length;
    var willBreach = projections.filter(function (p) { return p.status === "will_breach"; }).length;
    var overdueFilings = deadlines.filter(function (x) { return x.status === "passed" && x.cat === "Filing"; }).length;

    var score = 100 - 16 * counts.critical - 3 * counts.warning - 8 * breachedLimits - 4 * willBreach;
    score = Math.round(clamp(score, 8, 100)); // floor so "at risk" never reads as a broken 0
    var band = score >= 80 ? { label: "Healthy", color: "#10B981" }
             : score >= 50 ? { label: "Needs attention", color: "#D4AF37" }
             : { label: "At risk", color: "#ef4444" };

    // alerts feed
    var alerts = [];
    (opts.findings || []).filter(function (f) { return f.severity === "critical"; }).slice(0, 4).forEach(function (f) {
      alerts.push({ sev: "critical", icon: "⛔", text: f.title, meta: f.refs && f.refs[0] ? f.refs[0] : "Conflict" });
    });
    projections.forEach(function (p) {
      if (p.status === "breached") alerts.push({ sev: "critical", icon: "🚨", text: p.label + " threshold breached", meta: U.zeroMoney ? p.dateLabel : "" });
      else if (p.status === "will_breach") alerts.push({ sev: "warning", icon: "📈", text: p.label + " on track to breach", meta: p.dateLabel });
    });
    residency.forEach(function (r) {
      if (r.status === "will_flip") alerts.push({ sev: "warning", icon: "🧭", text: r.country + " residency approaching", meta: r.dateLabel });
      else if (r.status === "resident") alerts.push({ sev: "info", icon: "🌐", text: r.country + " tax residency active", meta: r.dateLabel });
    });
    upcoming.filter(function (x) { return x.daysUntil <= 45; }).slice(0, 4).forEach(function (x) {
      alerts.push({ sev: x.daysUntil <= 15 ? "warning" : "info", icon: "📅", text: x.name + " due", meta: "in " + x.daysUntil + " days (" + x.dateLabel + ")" });
    });
    var sevW = { critical: 0, warning: 1, info: 2 };
    alerts.sort(function (a, b) { return sevW[a.sev] - sevW[b.sev]; });

    return {
      asOf: today, simulated: simulated, baseYear: baseYear,
      progressUS: progUS, progressIN: progIN,
      residency: residency,
      projections: projections,
      calendar: { all: deadlines, upcoming: upcoming, next: nextDeadline },
      health: { score: score, band: band, breachedLimits: breachedLimits, willBreach: willBreach, overdueFilings: overdueFilings },
      alerts: alerts.slice(0, 12)
    };
  }

  WISING.monitor = monitor;
})(typeof window !== "undefined" ? window : globalThis);

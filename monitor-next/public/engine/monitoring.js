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
        res.headline = "Tax resident — worldwide income in scope";
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
        yearStart: cyStart
      }),
      counter({
        country: "India", flag: "🇮🇳", test: "≥182 days in the FY",
        days: model.residency.india.daysCurrentYear, threshold: 182, prog: progIN,
        isResident: computed.residency.india.isResident, yearStart: fyStart
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
    function d(y, m, day) { return new Date(y, m - 1, day); }
    var deadlines = [
      { name: "India advance tax — Q1 (15%)", jur: "IN", date: d(baseYear, 6, 15), cat: "Advance tax" },
      { name: "India advance tax — Q2 (45%)", jur: "IN", date: d(baseYear, 9, 15), cat: "Advance tax" },
      { name: "India advance tax — Q3 (75%)", jur: "IN", date: d(baseYear, 12, 15), cat: "Advance tax" },
      { name: "India advance tax — Q4 (100%)", jur: "IN", date: d(baseYear + 1, 3, 15), cat: "Advance tax" },
      { name: "US estimated tax — Q1", jur: "US", date: d(baseYear, 4, 15), cat: "Estimated tax" },
      { name: "US estimated tax — Q2", jur: "US", date: d(baseYear, 6, 15), cat: "Estimated tax" },
      { name: "US estimated tax — Q3", jur: "US", date: d(baseYear, 9, 15), cat: "Estimated tax" },
      { name: "US estimated tax — Q4", jur: "US", date: d(baseYear + 1, 1, 15), cat: "Estimated tax" },
      { name: "US Form 1040 + Form 1116 + FBAR", jur: "US", date: d(baseYear + 1, 4, 15), cat: "Filing" },
      { name: "India ITR + Form 67 (non-audit)", jur: "IN", date: d(baseYear + 1, 7, 31), cat: "Filing" },
      { name: "US extended 1040 / FBAR deadline", jur: "US", date: d(baseYear + 1, 10, 15), cat: "Extension" },
      { name: "India belated / revised ITR", jur: "IN", date: d(baseYear + 1, 12, 31), cat: "Extension" }
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

"use strict";
/* ============================================================================
 * LIM-7: monitor() — the "always-on" monitoring layer (monitoring.js,
 * ~350 lines). Genuinely new territory for this migration: the first node
 * file built around date/calendar math rather than tax computation. Four
 * pieces, read in full from source before writing anything
 * (monitoring.js:33-384):
 *   1. Residency day-counters + a predicted "flip" date (US SPT / India
 *      182-day) for individuals, or a qualitative fact list for entities.
 *   2. Threshold breach PROJECTIONS off computed.limits (LIM-1..6,
 *      separately tracked — read here as a boundary, same as every other
 *      computed.* field throughout this migration, not re-derived).
 *   3. A compliance calendar of filing deadlines with countdowns,
 *      entity-aware (ccorp/scorp/partnership/trust/1040-NR/1040 filing
 *      dates, India audit-case vs. non-audit, presumptive-only s.425
 *      single-installment).
 *   4. A compliance-health score + a capped alerts feed, built from
 *      findings + the three pieces above.
 *
 * `opts.asOf` and `opts.findings` are genuine caller-supplied inputs (not
 * derivable from model/computed) — analyze() passes `findings` (the exact
 * array this migration's own findingsAllResult already reproduces, batch
 * 5) and `asOf` (defaulting to `new Date()` when absent). asOf is read
 * here as an explicit boundary (monitorAsOfBoundary) so verification can
 * pin it to the exact instant a real WISING.analyze() call used, instead
 * of two live `new Date()` calls racing a day boundary.
 *
 * The India audit-case test (inIsAuditCase) and the presumptive-only s.425
 * test (inPurelyPresumptive) are BYTE-IDENTICAL to the same two tests
 * conflicts.js's india_advance_tax_interest finding already uses — already
 * ported (in1-nodes.js, merged in since batch 5) and reused directly here
 * rather than re-derived a second time.
 * ==========================================================================*/
var reportBatch5Nodes = require("./report-batch5-nodes.js").NODES;
var NODES = {};
Object.keys(reportBatch5Nodes).forEach(function (k) { NODES[k] = reportBatch5Nodes[k]; });

var DAY = 86400000;
function addDays(d, n) { return new Date(d.getTime() + n * DAY); }
function fmtDate(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function daysBetween(a, b) { return Math.round((b - a) / DAY); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* Explicit boundary — the caller-supplied "as of" instant. Defaults to
 * new Date() exactly like the engine, but a verifier can pin it via
 * ctx.monitorAsOfBoundary to reproduce a specific real run exactly. */
NODES.monitorAsOfBoundary = {
  deps: [],
  compute: function (d, ctx) { return ctx.monitorAsOfBoundary !== undefined ? new Date(ctx.monitorAsOfBoundary) : new Date(); }
};

NODES.monitorProgressResult = {
  deps: ["monitorAsOfBoundary"],
  compute: function (d, ctx) {
    var baseYear = ctx.model.meta.baseYear;
    var today = d.monitorAsOfBoundary;
    var cyStart = new Date(baseYear, 0, 1), cyEnd = new Date(baseYear, 11, 31);
    var fyStart = new Date(baseYear, 3, 1), fyEnd = new Date(baseYear + 1, 2, 31);
    var SIM = 0.62;
    function progress(start, end) {
      var f = (today - start) / (end - start);
      return (f > 0.03 && f < 0.98) ? f : SIM;
    }
    var progUS = progress(cyStart, cyEnd);
    var progIN = progress(fyStart, fyEnd);
    var simulated = !((today - cyStart) / (cyEnd - cyStart) > 0.03 && (today - cyEnd) < 0);
    return { baseYear: baseYear, today: today, cyStart: cyStart, cyEnd: cyEnd, fyStart: fyStart, fyEnd: fyEnd, progUS: progUS, progIN: progIN, simulated: simulated };
  }
};

/* ================= 1. RESIDENCY DAY-COUNTERS ================= */
NODES.residencyMonitorResult = {
  deps: ["monitorProgressResult"],
  compute: function (d, ctx) {
    var model = ctx.model, computed = ctx.computed;
    var prog = d.monitorProgressResult;

    function counter(cfg) {
      var days = cfg.days, threshold = cfg.threshold, p = cfg.prog;
      var already = cfg.isResident || days >= threshold;
      var pace = days / (p * 365);
      var res = {
        kind: "days",
        country: cfg.country, flag: cfg.flag, test: cfg.test,
        days: days, threshold: threshold, pct: clamp(days / threshold, 0, 1.5),
        isResident: already, projectedFullYear: Math.round(p > 0 ? days / p : days),
        pace: pace
      };
      if (already) {
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
        res.flipDate = addDays(prog.today, elapsedNeeded);
        res.headline = (threshold - days) + " more days → becomes resident";
        res.dateLabel = "Projected flip ~" + fmtDate(res.flipDate) + " at current pace";
      } else {
        res.status = "safe";
        res.headline = "Non-resident — " + (threshold - days) + " days of headroom";
        res.dateLabel = "Not projected to cross this year";
      }
      return res;
    }
    function qualitative(cfg) {
      return {
        kind: "qualitative",
        country: cfg.country, flag: cfg.flag, test: cfg.test,
        status: cfg.isResident ? "resident" : "safe", isResident: cfg.isResident,
        headline: cfg.isResident
          ? (cfg.worldwide === false ? "Resident (source basis) — foreign income not taxed here" : "Tax resident — worldwide income in scope")
          : "Non-resident — this entity type has no day-count or presence test",
        facts: cfg.facts || []
      };
    }

    var E = model.entity || {};
    var indiaKind = E.indiaKind || "individual";

    var indiaEntry;
    if (indiaKind === "individual") {
      indiaEntry = counter({
        country: "India", flag: "🇮🇳", test: "≥182 days in the FY",
        days: model.residency.india.daysCurrentYear, threshold: 182, prog: prog.progIN,
        isResident: computed.residency.india.isResident, worldwide: computed.residency.india.worldwide, yearStart: prog.fyStart
      });
    } else if (indiaKind === "company") {
      var isIndianCo = model.residency.india.isIndianCompanyFact;
      var cr = model.companyResidency || {};
      var coFacts = [];
      if (isIndianCo === true) {
        coFacts.push("Incorporated in India — unconditionally resident regardless of POEM (s.6(3))");
      } else if (isIndianCo === false) {
        coFacts.push("NOT incorporated in India — residency turns on Place of Effective Management (POEM)");
        coFacts.push(cr.boardMeetingsOutsideIndia ? "Board meets primarily outside India" : "Board meets primarily in India");
        if (cr.keyManagementLocation) coFacts.push("Key management location: " + cr.keyManagementLocation);
        if (cr.directorsInIndia || cr.directorsOutsideIndia) coFacts.push(cr.directorsInIndia + " director(s) in India, " + cr.directorsOutsideIndia + " outside");
      } else {
        coFacts.push("Incorporation status (Indian vs. foreign) not yet answered on Layer 1 India");
      }
      indiaEntry = qualitative({
        country: "India", flag: "🇮🇳", test: isIndianCo === false ? "Place of Effective Management (POEM) — s.6(3)" : "Incorporation — s.6(3)",
        isResident: computed.residency.india.isResident, worldwide: computed.residency.india.worldwide, facts: coFacts
      });
    } else {
      var wo = model.residency.india.indiaWhollyOutsideIndiaFact;
      var nonIndFacts = [wo === true ? "Control & management of its affairs is wholly outside India" :
        wo === false ? "Control & management is (at least partly) situated in India" :
        "Control & management location not yet answered on Layer 1 India"];
      if (indiaKind === "huf" && wo === false) {
        nonIndFacts.push("Karta's own presence this FY (" + model.residency.india.daysCurrentYear + " days) still determines ROR vs. RNOR sub-status, separately from the HUF's own residency");
      }
      indiaEntry = qualitative({
        country: "India", flag: "🇮🇳", test: "Control & management (s.6(2)/s.6(4)) — not day-count",
        isResident: computed.residency.india.isResident, worldwide: computed.residency.india.worldwide, facts: nonIndFacts
      });
    }

    var usEntry;
    var usIsEntityTaxpayer = indiaKind !== "individual" || E.usIsBusiness;
    if (!usIsEntityTaxpayer) {
      usEntry = counter({
        country: "United States", flag: "🇺🇸", test: "Substantial Presence (≥183 weighted)",
        days: model.residency.us.daysCurrentYear, threshold: 183, prog: prog.progUS,
        isResident: model.residency.us.sptMet || model.residency.us.isCitizen || model.residency.us.hasGreenCard,
        worldwide: computed.residency.us.worldwide, yearStart: prog.cyStart
      });
    } else if (E.usIsBusiness) {
      var incUs = E.usIncorporatedInUs, incState = E.usIncorporationState;
      var usFacts = [];
      if (incUs === true) usFacts.push("Organized/incorporated in the United States" + (incState ? " (" + incState + ")" : "") + " — a domestic entity taxed on worldwide income regardless of where it operates");
      else if (incUs === false) usFacts.push("NOT organized/incorporated in the United States — a foreign entity for US tax purposes (files Form 1120-F or the analogous foreign-entity return, not modeled here)");
      else usFacts.push("Place of organization/incorporation not yet answered on Layer 1 US");
      usEntry = qualitative({
        country: "United States", flag: "🇺🇸", test: "Place of organization/incorporation — not a presence test",
        isResident: incUs === true, worldwide: incUs === true, facts: usFacts
      });
    } else {
      usEntry = qualitative({
        country: "United States", flag: "🇺🇸", test: "Place of organization/incorporation — not a presence test",
        isResident: false, worldwide: false,
        facts: ["No US business entity (ccorp/scorp/partnership/trust) organized for this taxpayer on Layer 1 US — a foreign entity for US tax purposes with no day-count or presence test to run"]
      });
    }

    return [usEntry, indiaEntry];
  }
};

/* ================= 2. THRESHOLD BREACH PROJECTIONS ================= */
NODES.projectionsMonitorResult = {
  deps: ["monitorProgressResult"],
  compute: function (d, ctx) {
    var prog = d.monitorProgressResult;
    return (ctx.computed.limits || []).map(function (g) {
      var p = g.id === "lrs" ? prog.progIN : prog.progUS;
      var yearStart = g.id === "lrs" ? prog.fyStart : prog.cyStart;
      var yearLen = g.id === "lrs" ? (prog.fyEnd - prog.fyStart) / DAY : (prog.cyEnd - prog.cyStart) / DAY;
      var projected = p > 0 ? g.value / p : g.value;
      var out = {
        id: g.id, label: g.label, current: g.value, limit: g.limit,
        pct: g.pct, projected: projected, projPct: g.limit > 0 ? projected / g.limit : 0,
        note: g.note
      };
      if (g.value >= g.limit) { out.status = "breached"; out.dateLabel = "Already breached"; }
      else if (projected >= g.limit && g.value > 0) {
        var f = (g.limit * p) / g.value;
        out.status = "will_breach";
        out.breachDate = addDays(yearStart, clamp(f, 0, 1) * yearLen);
        out.dateLabel = "Projected to cross ~" + fmtDate(out.breachDate);
      } else { out.status = "ok"; out.dateLabel = "Within limit at current pace"; }
      return out;
    });
  }
};

/* ================= 3. COMPLIANCE CALENDAR ================= */
var US_RETURN_DOCS = ["fincen_114", "form_8938", "form_1116", "form_2555", "form_8833",
  "form_8621", "form_5471", "form_8865", "form_3520", "form_1040nr", "form_8960", "form_8959", "form_6251",
  "form_540", "form_it201", "form_nj1040"];
var IN_RETURN_DOCS = ["form_67", "trc", "form_10f", "schedule_fa", "schedule_fsi_tr", "schedule_al", "form_3cb_3cd", "form_3ceb"];
function mdate(y, m, day) { return new Date(y, m - 1, day); }
var US_FILING_DATES = {
  "1120":    { orig: function (by) { return mdate(by + 1, 4, 15); }, ext: function (by) { return mdate(by + 1, 10, 15); }, label: "US Form 1120 (C-Corp)" },
  "1120-S":  { orig: function (by) { return mdate(by + 1, 3, 15); }, ext: function (by) { return mdate(by + 1, 9, 15); }, label: "US Form 1120-S (S-Corp)" },
  "1065":    { orig: function (by) { return mdate(by + 1, 3, 15); }, ext: function (by) { return mdate(by + 1, 9, 15); }, label: "US Form 1065 (Partnership)" },
  "1041":    { orig: function (by) { return mdate(by + 1, 4, 15); }, ext: function (by) { return mdate(by + 1, 9, 30); }, label: "US Form 1041 (Trust/Estate)" },
  "1040-NR": { orig: function (by) { return mdate(by + 1, 4, 15); }, ext: function (by) { return mdate(by + 1, 10, 15); }, label: "US Form 1040-NR + FBAR" },
  "1040":    { orig: function (by) { return mdate(by + 1, 4, 15); }, ext: function (by) { return mdate(by + 1, 10, 15); }, label: "US Form 1040 + Form 1116 + FBAR" }
};

NODES.calendarMonitorResult = {
  deps: ["monitorProgressResult", "entityFormsResult", "indiaIsCompany", "inIsAuditCase", "inPurelyPresumptive"],
  compute: function (d, ctx) {
    var model = ctx.model;
    var prog = d.monitorProgressResult;
    var baseYear = prog.baseYear, today = prog.today;

    var usKind = d.entityFormsResult.usReturnForm;
    var filingCfg = US_FILING_DATES[usKind] || US_FILING_DATES["1040"];
    var usFiling = { orig: filingCfg.orig(baseYear), ext: filingCfg.ext(baseYear), label: filingCfg.label };
    var usQ4 = usKind === "1120" ? { date: mdate(baseYear, 12, 15), label: "US estimated tax — Q4 (C-Corp)" }
                                  : { date: mdate(baseYear + 1, 1, 15), label: "US estimated tax — Q4" };

    var indiaIsAuditCase = d.inIsAuditCase;
    var indiaFiling = indiaIsAuditCase
      ? { date: mdate(baseYear + 1, 10, 31), label: "India ITR + Form 44 (audit case)" }
      : { date: mdate(baseYear + 1, 7, 31), label: "India ITR + Form 44 (non-audit)" };

    var indiaAdvanceTaxRows = d.inPurelyPresumptive ? [
      { name: "India advance tax — single installment (100%, presumptive scheme)", jur: "IN", date: mdate(baseYear + 1, 3, 15), cat: "Advance tax", docIds: [] }
    ] : [
      { name: "India advance tax — Q1 (15%)", jur: "IN", date: mdate(baseYear, 6, 15), cat: "Advance tax", docIds: [] },
      { name: "India advance tax — Q2 (45%)", jur: "IN", date: mdate(baseYear, 9, 15), cat: "Advance tax", docIds: [] },
      { name: "India advance tax — Q3 (75%)", jur: "IN", date: mdate(baseYear, 12, 15), cat: "Advance tax", docIds: [] },
      { name: "India advance tax — Q4 (100%)", jur: "IN", date: mdate(baseYear + 1, 3, 15), cat: "Advance tax", docIds: [] }
    ];
    var deadlines = indiaAdvanceTaxRows.concat([
      { name: "US estimated tax — Q1", jur: "US", date: mdate(baseYear, 4, 15), cat: "Estimated tax", docIds: [] },
      { name: "US estimated tax — Q2", jur: "US", date: mdate(baseYear, 6, 15), cat: "Estimated tax", docIds: [] },
      { name: "US estimated tax — Q3", jur: "US", date: mdate(baseYear, 9, 15), cat: "Estimated tax", docIds: [] },
      { name: usQ4.label, jur: "US", date: usQ4.date, cat: "Estimated tax", docIds: [] },
      { name: usFiling.label, jur: "US", date: usFiling.orig, cat: "Filing", docIds: US_RETURN_DOCS },
      { name: indiaFiling.label, jur: "IN", date: indiaFiling.date, cat: "Filing", docIds: IN_RETURN_DOCS },
      { name: "US extended " + usFiling.label.replace(/^US /, "") + " deadline", jur: "US", date: usFiling.ext, cat: "Extension", docIds: US_RETURN_DOCS },
      { name: "India belated / revised ITR", jur: "IN", date: mdate(baseYear + 1, 12, 31), cat: "Extension", docIds: IN_RETURN_DOCS }
    ]).filter(function (x) {
      if (x.jur === "IN") return model.meta.hasIndiaScope !== false;
      if (x.jur === "US") return model.meta.hasUsScope !== false;
      return true;
    }).map(function (x) {
      var du = daysBetween(today, x.date);
      x.daysUntil = du;
      x.status = du < 0 ? "passed" : (du <= 30 ? "due_soon" : "upcoming");
      x.dateLabel = fmtDate(x.date);
      return x;
    }).sort(function (a, b) { return a.date - b.date; });

    var upcoming = deadlines.filter(function (x) { return x.status !== "passed"; });
    var nextDeadline = upcoming[0] || null;

    return { all: deadlines, upcoming: upcoming, next: nextDeadline };
  }
};

/* ================= 4. HEALTH SCORE + ALERTS ================= */
NODES.healthAlertsMonitorResult = {
  deps: ["findingsAllResult", "projectionsMonitorResult", "residencyMonitorResult", "calendarMonitorResult"],
  compute: function (d) {
    var findings = d.findingsAllResult, projections = d.projectionsMonitorResult;
    var residency = d.residencyMonitorResult, calendarObj = d.calendarMonitorResult;

    var counts = { critical: 0, warning: 0, info: 0 };
    findings.forEach(function (f) { counts[f.severity]++; });
    var breachedLimits = projections.filter(function (p) { return p.status === "breached"; }).length;
    var willBreach = projections.filter(function (p) { return p.status === "will_breach"; }).length;
    var overdueFilings = calendarObj.all.filter(function (x) { return x.status === "passed" && x.cat === "Filing"; }).length;

    var score = 100 - 16 * counts.critical - 3 * counts.warning - 8 * breachedLimits - 4 * willBreach;
    score = Math.round(clamp(score, 8, 100));
    var band = score >= 80 ? { label: "Healthy", color: "#10B981" }
             : score >= 50 ? { label: "Needs attention", color: "#D4AF37" }
             : { label: "At risk", color: "#ef4444" };

    var alerts = [];
    findings.filter(function (f) { return f.severity === "critical"; }).slice(0, 4).forEach(function (f) {
      alerts.push({ sev: "critical", icon: "⛔", text: f.title, meta: f.refs && f.refs[0] ? f.refs[0] : "Conflict" });
    });
    projections.forEach(function (p) {
      if (p.status === "breached") alerts.push({ sev: "critical", icon: "🚨", text: p.label + " threshold breached", meta: p.dateLabel });
      else if (p.status === "will_breach") alerts.push({ sev: "warning", icon: "📈", text: p.label + " on track to breach", meta: p.dateLabel });
    });
    residency.forEach(function (r) {
      if (r.status === "will_flip") alerts.push({ sev: "warning", icon: "🧭", text: r.country + " residency approaching", meta: r.dateLabel });
      else if (r.status === "resident") alerts.push({ sev: "info", icon: "🌐", text: r.country + " tax residency active", meta: r.dateLabel });
    });
    calendarObj.upcoming.filter(function (x) { return x.daysUntil <= 45; }).slice(0, 4).forEach(function (x) {
      alerts.push({ sev: x.daysUntil <= 15 ? "warning" : "info", icon: "📅", text: x.name + " due", meta: "in " + x.daysUntil + " days (" + x.dateLabel + ")" });
    });
    var sevW = { critical: 0, warning: 1, info: 2 };
    alerts.sort(function (a, b) { return sevW[a.sev] - sevW[b.sev]; });

    return {
      health: { score: score, band: band, breachedLimits: breachedLimits, willBreach: willBreach, overdueFilings: overdueFilings },
      alerts: alerts.slice(0, 12)
    };
  }
};

NODES.monitorResult = {
  deps: ["monitorProgressResult", "residencyMonitorResult", "projectionsMonitorResult", "calendarMonitorResult", "healthAlertsMonitorResult"],
  compute: function (d) {
    var prog = d.monitorProgressResult;
    return {
      asOf: prog.today, simulated: prog.simulated, baseYear: prog.baseYear,
      progressUS: prog.progUS, progressIN: prog.progIN,
      residency: d.residencyMonitorResult,
      projections: d.projectionsMonitorResult,
      calendar: d.calendarMonitorResult,
      health: d.healthAlertsMonitorResult.health,
      alerts: d.healthAlertsMonitorResult.alerts
    };
  }
};

module.exports = { NODES: NODES };

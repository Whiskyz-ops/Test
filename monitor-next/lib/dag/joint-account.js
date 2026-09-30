/* joint-account.js — India bank accounts / FDs held jointly with the spouse
 * (docs/MARRIED_FILING_AUDIT.md row F8). Python mirror:
 * dag_py/src/wising_dag/india/joint_interest.py.
 *
 * Interest is taxed to whoever's money it is: each spouse enters the full
 * interest credited (other_sources.joint_account_interest_inr) and their
 * share of the money (joint_account_own_share_percent, 100 when blank).
 *
 * TDS on that interest is deducted in the first holder's name and shows in
 * their Form 26AS. Rule 37BA(2) of the Income-tax Rules lets the credit go
 * to the person the income is assessable to, but only if the first holder
 * files a declaration with the bank and the bank reports the TDS in that
 * person's name. So: declaration filed -> credit by share; otherwise the
 * whole credit stays with the first holder and the other spouse gets none.
 * Fields: tax_credits.joint_account_tds_inr (full TDS),
 * tax_credits.joint_account_first_holder ("self" / "spouse"),
 * tax_credits.joint_account_tds_37ba_declared (true / false). With no first
 * holder given, the credit follows the share (never counted twice). */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function safe(obj, path, dflt) {
  var cur = obj;
  for (var parts = path.split("."), i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== "object") return dflt;
    cur = cur[parts[i]];
  }
  return cur === undefined || cur === null ? dflt : cur;
}

// This person's share (0-100) of the money in the joint accounts.
function jointAccountSharePct(india, os) {
  var pct = safe(india, "other_sources.joint_account_own_share_percent", null);
  if (pct == null && os) pct = safe(os, "joint_account_own_share_percent", null);
  return pct == null || pct === "" || !isFinite(Number(pct)) ? 100 : Math.min(100, Math.max(0, Number(pct)));
}

// The profile's own other_sources value comes first: a percentage is never
// summed across quarterly slices (os may be the quarter-merged block).
function jointAccountInterestShareInr(os, india) {
  var total = num(safe(os, "joint_account_interest_inr", 0));
  if (!(total > 0)) return 0;
  return total * jointAccountSharePct(india, os) / 100;
}

function jointAccountTdsCreditInr(india) {
  var tds = num(safe(india, "tax_credits.joint_account_tds_inr", 0));
  if (!(tds > 0)) return 0;
  var declared = safe(india, "tax_credits.joint_account_tds_37ba_declared", null) === true;
  var first = safe(india, "tax_credits.joint_account_first_holder", null);
  if (!declared && first === "self") return tds;
  if (!declared && first === "spouse") return 0;
  return tds * jointAccountSharePct(india, null) / 100;
}

module.exports = { jointAccountInterestShareInr: jointAccountInterestShareInr, jointAccountTdsCreditInr: jointAccountTdsCreditInr, jointAccountSharePct: jointAccountSharePct };

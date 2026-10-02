/* treaty-art21.js — DTAA Art. 21(1) (students and business apprentices) and
 * the saving clause's exception for it. Python mirror:
 * dag_py/src/wising_dag/us/treaty_art21.py.
 *
 * Art. 21(1): payments a student or business apprentice receives for
 * maintenance, education or training are exempt from US tax when the
 * person was resident in India immediately before coming to the US, is in
 * the US solely for education or training, and the payments come from
 * outside the US (a stipend, scholarship or allowance from India). No time
 * limit. Art. 1(4)(b) keeps Art. 21 for a US resident who is neither a
 * citizen nor a green-card holder; a citizen or green-card holder is taxed
 * on these payments as foreign income. A non-resident alien isn't taxed on
 * foreign-source payments in the first place. Money from family is a gift,
 * not income, and doesn't belong here.
 *
 * Layer 1 US (us_residency_detail): article_21_student_claim,
 * article_21_foreign_payments_usd (this year's payments from outside the
 * US, entered only here — not also under foreign wages). */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

function art21(us) {
  var r = (us && us.us_residency_detail) || {};
  if (r.article_21_student_claim !== true) return null;
  var paymentsUsd = Math.max(0, num(r.article_21_foreign_payments_usd));
  var blockedBy = r.is_us_citizen === true ? "citizen" : r.has_green_card === true ? "green_card" : null;
  // Exempt unless blocked; when blocked the payments are foreign income.
  return { paymentsUsd: paymentsUsd, exemptUsd: blockedBy ? 0 : paymentsUsd, taxableUsd: blockedBy ? paymentsUsd : 0, blockedBy: blockedBy };
}

module.exports = { art21: art21 };

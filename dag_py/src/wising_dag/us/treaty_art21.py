"""DTAA Art. 21(1) (students and business apprentices) and the saving
clause's exception for it. Mirror of prototypes/graph-pilot/treaty-art21.js (see its header)."""
from __future__ import annotations

from ..core.util import num


def art21(us):
    r = ((us or {}).get("us_residency_detail") or {}) if isinstance(us, dict) else {}
    if r.get("article_21_student_claim") is not True:
        return None
    payments_usd = max(0.0, num(r.get("article_21_foreign_payments_usd")))
    blocked_by = "citizen" if r.get("is_us_citizen") is True else "green_card" if r.get("has_green_card") is True else None
    return {"paymentsUsd": payments_usd, "exemptUsd": 0.0 if blocked_by else payments_usd,
            "taxableUsd": payments_usd if blocked_by else 0.0, "blockedBy": blocked_by}

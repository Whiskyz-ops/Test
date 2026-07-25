"""Shared finding-object constructor — the Python equivalent of the local
`add(id, severity, category, title, detail, recommendation, amountUsd, refs)`
closure duplicated at the top of every findings-batchN-nodes.js compute()
function. Used by india/findings.py, us/findings.py, crossborder/findings.py."""
from __future__ import annotations

from typing import Any


def make_finding(
    id: str, severity: str, category: str, title: str, detail: str,
    recommendation: str, amount_usd: float = 0, refs: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": id, "severity": severity, "category": category, "title": title,
        "detail": detail, "recommendation": recommendation,
        "amountUsd": amount_usd or 0, "refs": refs or [],
    }

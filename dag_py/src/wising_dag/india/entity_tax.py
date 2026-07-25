"""computeIndiaEntityTax — company/firm/LLP rate schedules. Port of
prototypes/graph-pilot/entitytax-nodes.js.

`entityTaxableInrBoundary` here is an EXPLICIT BOUNDARY INPUT (reads
`ctx["model"]...`, which does not exist in the real `{router, india, us}`
ctx shape) — it is never actually resolved as-is; india_full.py overrides
it to read from the merged aggregate-income subgraph instead, exactly
mirroring india-full-nodes.js's own override of the same node id.

DELIBERATE DAG/engine divergence (docs/GAP_TRACKER.md section H.6):
AOP/BOI and Trust/NGO/Political Party get real tax treatment here (s.167B
Maximum Marginal Rate / exemption-claiming respectively) instead of
silently falling through to individual slab rates the way the frozen
engine's own routing condition does — see the JS file's header comment for
the full legal reasoning.
"""
from __future__ import annotations

from ..core.graph import NodeDef
from ..core.util import num, safe
from . import constants as C

INDIA_MMR_TOP_SLAB_RATE = 0.30
INDIA_MMR_TOP_SURCHARGE_RATE = 0.37
INDIA_MMR_CESS_RATE = 0.04


def _entity_result(base: float, sur: float, cess: float, label: str, mat: bool) -> dict:
    total = base + sur + cess
    return {"regime": label, "matApplied": mat, "totalTaxInr": total, "slabTaxInr": base, "surchargeInr": sur, "cessInr": cess}


def _compute_entity_tax_result(d, ctx):
    taxable = d["entityTaxableInrBoundary"]

    if d["indiaIsAop"]:
        aop_base = taxable * INDIA_MMR_TOP_SLAB_RATE
        aop_sur = aop_base * INDIA_MMR_TOP_SURCHARGE_RATE
        aop_cess = (aop_base + aop_sur) * INDIA_MMR_CESS_RATE
        return _entity_result(aop_base, aop_sur, aop_cess, "AOP/BOI ITR-5 (Maximum Marginal Rate, s.167B)", False)

    if d["indiaIsTrust"]:
        return _entity_result(0, 0, 0, "Trust/NGO/Political Party ITR-7 (exempt — s.11/12A or s.13A, compliance unverified)", False)

    if d["indiaIsCompany"]:
        if d["isIndianCompanyFact"] is False:
            fc = C.INDIA_COMPANY_FOREIGN
            rate_f = fc["RATE"]
            base_tax_f = taxable * rate_f
            sur_rate_f = fc["SURCHARGE_OVER_10CR"] if taxable > 100000000 else (fc["SURCHARGE_OVER_1CR"] if taxable > 10000000 else 0)
            normal_f = base_tax_f + base_tax_f * sur_rate_f
            mat_base_inr_f = d["indiaMatBookProfitInr"] if d["indiaMatBookProfitInr"] is not None else taxable
            mat_f = mat_base_inr_f * fc["MAT_RATE"]
            mat_applied_f = bool(d["hasIndiaPE"]) and normal_f < mat_f
            pre_cess_f = mat_f if mat_applied_f else normal_f
            cess_f = pre_cess_f * fc["CESS_RATE"]
            regime_f = (
                f"Foreign Company ITR-6 ({round(rate_f * 100)}%"
                + (", MAT" if mat_applied_f else ("" if d["hasIndiaPE"] else ", MAT-exempt (no India PE)"))
                + ")"
            )
            return _entity_result(base_tax_f, pre_cess_f - base_tax_f, cess_f, regime_f, mat_applied_f)

        c = C.INDIA_COMPANY
        rate = (
            c["RATE_115BAB"] if d["indiaOpt115bab"] else
            c["RATE_115BAA"] if d["indiaOpt115baa"] else
            c["RATE_115BA"] if d["indiaOpt115ba"] else
            (c["RATE_TURNOVER_LTE_400CR"] if d["indiaTurnoverLte400cr"] else c["RATE_DEFAULT"])
        )
        base_tax = taxable * rate
        concessional115 = d["indiaOpt115bab"] or d["indiaOpt115baa"]
        sur_rate = (
            (c["SURCHARGE_115BAB"] if d["indiaOpt115bab"] else c["SURCHARGE_115BAA"]) if concessional115
            else (c["SURCHARGE_OVER_10CR"] if taxable > 100000000 else (c["SURCHARGE_OVER_1CR"] if taxable > 10000000 else 0))
        )
        normal = base_tax + base_tax * sur_rate
        mat_base_inr = d["indiaMatBookProfitInr"] if d["indiaMatBookProfitInr"] is not None else taxable
        mat = mat_base_inr * c["MAT_RATE"]
        mat_applied = (not concessional115) and normal < mat
        pre_cess = mat if mat_applied else normal
        cess_c = pre_cess * c["CESS_RATE"]
        regime = (
            f"Corporate ITR-6 ({round(rate * 100)}%"
            + (" §115BAB" if d["indiaOpt115bab"] else " §200" if d["indiaOpt115baa"] else " §115BA" if d["indiaOpt115ba"] else "")
            + (", MAT" if mat_applied else "")
            + ")"
        )
        return _entity_result(base_tax, pre_cess - base_tax, cess_c, regime, mat_applied)

    # firm / LLP
    f = C.INDIA_FIRM
    ftax = taxable * f["RATE"]
    fsur_rate = f["SURCHARGE_OVER_1CR"] if taxable > 10000000 else 0
    fsur = ftax * fsur_rate
    fcess = (ftax + fsur) * f["CESS_RATE"]
    return _entity_result(ftax, fsur, fcess, "Firm/LLP ITR-5 (30%)", False)


NODES = {
    "indiaEntityTypeRaw": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.entity_type", "individual"), layer1_fields=("india.profile.entity_type",)),
    "indiaIsCompany": NodeDef(deps=("indiaEntityTypeRaw",), compute=lambda d, ctx: d["indiaEntityTypeRaw"] == "company"),
    "indiaIsFirm": NodeDef(deps=("indiaEntityTypeRaw",), compute=lambda d, ctx: d["indiaEntityTypeRaw"] in ("firm", "llp", "local")),
    "indiaIsAop": NodeDef(deps=("indiaEntityTypeRaw",), compute=lambda d, ctx: d["indiaEntityTypeRaw"] == "aop"),
    "indiaIsTrust": NodeDef(deps=("indiaEntityTypeRaw",), compute=lambda d, ctx: d["indiaEntityTypeRaw"] == "trust"),
    "isIndianCompanyFact": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "residency_detail.is_indian_company", None), layer1_fields=("india.residency_detail.is_indian_company",)),
    "indiaOpt115baa": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.opt_115baa", False) is True, layer1_fields=("india.profile.opt_115baa",)),
    "indiaOpt115bab": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.opt_115bab", False) is True, layer1_fields=("india.profile.opt_115bab",)),
    "indiaOpt115ba": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.opt_115ba", False) is True, layer1_fields=("india.profile.opt_115ba",)),
    "indiaTurnoverLte400cr": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.turnover_lte_400cr", False) is True, layer1_fields=("india.profile.turnover_lte_400cr",)),
    "indiaMatBookProfitInr": NodeDef(deps=(), compute=lambda d, ctx: safe(ctx.get("india"), "profile.mat_book_profit", None), layer1_fields=("india.profile.mat_book_profit",)),
    "hasIndiaPE": NodeDef(deps=(), compute=lambda d, ctx: bool(safe(ctx.get("india"), "dtaa.has_permanent_establishment_in_india", False)), layer1_fields=("india.dtaa.has_permanent_establishment_in_india",)),

    # ---- the one boundary input: the entity's total India income ----------
    "entityTaxableInrBoundary": NodeDef(
        deps=(),
        compute=lambda d, ctx: num(safe(ctx, "model.income.india.total.inr", None)),
    ),

    "entityTaxResult": NodeDef(
        deps=(
            "indiaIsCompany", "indiaIsFirm", "indiaIsAop", "indiaIsTrust", "isIndianCompanyFact",
            "indiaOpt115baa", "indiaOpt115bab", "indiaOpt115ba", "indiaTurnoverLte400cr",
            "indiaMatBookProfitInr", "hasIndiaPE", "entityTaxableInrBoundary",
        ),
        compute=_compute_entity_tax_result,
    ),
    "totalTaxInrEntity": NodeDef(deps=("entityTaxResult",), compute=lambda d, ctx: d["entityTaxResult"]["totalTaxInr"]),
}


def build(base):
    r = base.extend()
    for node_id, node in NODES.items():
        r.register(node_id, node)
    return r

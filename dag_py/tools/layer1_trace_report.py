#!/usr/bin/env python3
"""
Generates a node-id -> Layer 1 field(s) -> step trace report for the Python
DAG — the answer to "how do I map this node back to Layer 1 India/US and
find the field responsible for a bug" without hand-walking deps chains.

Three columns per node:
  - own_layer1_fields:         fields this exact node reads directly
  - transitive_layer1_fields:  every field feeding into it, through any
                                number of intermediate nodes (walks the full
                                dependency closure — see
                                NodeRegistry.transitive_layer1_fields())
  - steps:                     the Layer 1 India/US intake step(s) each
                                transitive field belongs to (see
                                core/layer1_steps.py)

Run: python dag_py/tools/layer1_trace_report.py [--format json|text] [node_id ...]
With no node_id arguments, reports on every node in the graph.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from wising_dag.core.layer1_steps import step_for_field  # noqa: E402
from wising_dag.core.registry import NodeRegistry  # noqa: E402
from wising_dag.india import itr_form  # noqa: E402


def build_current_registry() -> NodeRegistry:
    """The fullest registry buildable so far in the migration. Swap this for
    core.registry.build_full_registry() once every domain (Phase 7) exists —
    everything else in this tool is domain-agnostic."""
    return itr_form.build(NodeRegistry()).freeze()


def report_for_node(registry: NodeRegistry, node_id: str) -> dict:
    node = registry.get(node_id)
    if node is None:
        return {"node_id": node_id, "error": "unknown node"}
    transitive = registry.transitive_layer1_fields(node_id)
    return {
        "node_id": node_id,
        "deps": list(node.deps),
        "own_layer1_fields": list(node.layer1_fields),
        "transitive_layer1_fields": list(transitive),
        "steps": sorted({s for f in transitive if (s := step_for_field(f)) is not None}),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("node_ids", nargs="*", help="Specific node ids to report on (default: all)")
    parser.add_argument("--format", choices=["json", "text"], default="text")
    args = parser.parse_args()

    registry = build_current_registry()
    node_ids = args.node_ids or sorted(registry._nodes.keys())  # noqa: SLF001 — introspection tool, not runtime code

    reports = [report_for_node(registry, nid) for nid in node_ids]

    if args.format == "json":
        print(json.dumps(reports, indent=2))
        return

    for r in reports:
        print(f"\n{r['node_id']}")
        if "error" in r:
            print(f"  ERROR: {r['error']}")
            continue
        print(f"  deps: {', '.join(r['deps']) or '(none)'}")
        if r["own_layer1_fields"]:
            print("  own Layer 1 fields:")
            for f in r["own_layer1_fields"]:
                print(f"    - {f}")
        if r["transitive_layer1_fields"]:
            print(f"  transitive Layer 1 fields ({len(r['transitive_layer1_fields'])}):")
            for f in r["transitive_layer1_fields"]:
                print(f"    - {f}")
        if r["steps"]:
            print(f"  Layer 1 steps touched: {', '.join(r['steps'])}")


if __name__ == "__main__":
    main()

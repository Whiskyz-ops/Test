"""WISING tax-computation DAG — Python port of prototypes/graph-pilot.

Public surface: `analyze(opts) -> dict` (added in analyze.py once the full
domain chain exists). Nothing under this package may import pyodide/js/
browser globals — that coupling lives only in dag_py/adapter/.
"""

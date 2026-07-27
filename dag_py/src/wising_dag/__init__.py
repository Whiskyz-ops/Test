"""WISING tax-computation DAG — Python port of prototypes/graph-pilot.

Public surface: `analyze(opts) -> dict`, `normalize(opts) -> dict`. Nothing
under this package may import pyodide/js/browser globals — that coupling
lives only in dag_py/adapter/.
"""
from .analyze import analyze, normalize

__all__ = ["analyze", "normalize"]

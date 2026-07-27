"""CI-lint guard (plan §4's "hard rule"): nothing under
`wising_dag/**` may import `pyodide`/`js`, or read `window`/`localStorage` —
that coupling is confined to `adapter/pyodide_adapter.py`, the one file this
test explicitly excludes.
"""
import ast
import pathlib

SRC_ROOT = pathlib.Path(__file__).resolve().parent.parent / "src" / "wising_dag"
FORBIDDEN_MODULES = {"pyodide", "js"}
FORBIDDEN_NAMES = {"window", "localStorage"}


def _iter_python_files():
    return sorted(SRC_ROOT.rglob("*.py"))


def test_no_pyodide_or_js_imports_under_wising_dag():
    violations = []
    for path in _iter_python_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".")[0] in FORBIDDEN_MODULES:
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.split(".")[0] in FORBIDDEN_MODULES:
                    violations.append(f"{path}: from {node.module} import ...")
    assert violations == [], "pyodide/js imports leaked outside adapter/: " + "; ".join(violations)


def test_no_window_or_localstorage_names_under_wising_dag():
    violations = []
    for path in _iter_python_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
                violations.append(f"{path}:{node.lineno}: {node.id}")
            if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_NAMES:
                violations.append(f"{path}:{node.lineno}: .{node.attr}")
    assert violations == [], "window/localStorage reads leaked outside adapter/: " + "; ".join(violations)

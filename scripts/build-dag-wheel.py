#!/usr/bin/env python3
"""Builds dag_py/ into a pure-Python wheel at assets/wising_dag.whl —
occupies the same pipeline slot scripts/build-dag-bundle.js (esbuild)
does for the JS DAG's own bundle, just for the Python port instead.

The wheel is deployment-target-agnostic: the same file installs client-side
via micropip (adapter/pyodide_adapter.py) or server-side via pip (a future
adapter/http_adapter.py) unchanged — see docs/PYTHON_DAG_MIGRATION_TRACKER.md's
Phase 7 section.

Run: python3 scripts/build-dag-wheel.py  (or npm run build:dag-wheel)
"""
from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DAG_PY = REPO_ROOT / "dag_py"
ASSETS = REPO_ROOT / "assets"
OUT_WHEEL = ASSETS / "wising_dag.whl"


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "wheel", str(DAG_PY), "--no-deps", "-w", tmp],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            sys.stderr.write(result.stdout)
            sys.stderr.write(result.stderr)
            return result.returncode

        built = list(pathlib.Path(tmp).glob("wising_dag-*.whl"))
        if len(built) != 1:
            sys.stderr.write(f"[build-dag-wheel] expected exactly one wising_dag-*.whl, found {built}\n")
            return 1

        ASSETS.mkdir(exist_ok=True)
        # Fixed output filename (not the versioned build artifact name) —
        # micropip.install() in adapter code references a stable path,
        # same "stable filename, versioned contents" convention
        # assets/dag-analyze.bundle.js already uses.
        shutil.copyfile(built[0], OUT_WHEEL)

    print(f"[build-dag-wheel] wrote {OUT_WHEEL.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

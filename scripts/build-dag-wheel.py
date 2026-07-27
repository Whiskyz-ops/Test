#!/usr/bin/env python3
"""Builds dag_py/ into a pure-Python wheel at
assets/wising_dag-0.0.0-py3-none-any.whl — occupies the same pipeline slot
scripts/build-dag-bundle.js (esbuild) does for the JS DAG's own bundle, just
for the Python port instead.

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
# Fixed, permanently-pinned version/tag segment — NOT dag_py/pyproject.toml's
# real version. micropip.install(url) parses name/version/tags straight out
# of the wheel FILENAME (packaging.utils.parse_wheel_filename); a bare
# "wising_dag.whl" has no such segments and micropip raises
# InvalidWheelFilename before it ever reads the file's contents (confirmed
# by an actual Pyodide-in-Chromium run — see
# docs/PYTHON_DAG_MIGRATION_TRACKER.md's Phase 7 browser-verification
# section). Keeping this segment permanently fixed (independent of the
# project's real version) is what preserves the "stable filename, versioned
# contents" convention the rest of this script's comments describe —
# adapter/pyodide_adapter.py's caller never needs to change this literal
# string on a version bump.
OUT_WHEEL = ASSETS / "wising_dag-0.0.0-py3-none-any.whl"


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
        # assets/dag-analyze.bundle.js already uses. See OUT_WHEEL's own
        # comment above for why that stable name still has to be a
        # micropip-parseable wheel filename, not a bare basename.
        shutil.copyfile(built[0], OUT_WHEEL)

    print(f"[build-dag-wheel] wrote {OUT_WHEEL.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

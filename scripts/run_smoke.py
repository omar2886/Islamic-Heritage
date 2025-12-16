#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sample_path = repo_root / "samples" / "echo.json"
    cli_path = repo_root / "scripts" / "calc_cli.php"

    payload = sample_path.read_text(encoding="utf-8")

    process = subprocess.run(
        ["php", str(cli_path)],
        input=payload,
        text=True,
        capture_output=True,
        check=False,
    )

    if process.returncode != 0:
        sys.stderr.write(process.stderr)
        raise SystemExit(process.returncode)

    try:
        data = json.loads(process.stdout)
    except json.JSONDecodeError as exc:  # pragma: no cover - debug helper
        sys.stderr.write(f"Invalid JSON output: {exc}\n")
        sys.stderr.write(process.stdout)
        raise SystemExit(1)

    if "version" not in data:
        sys.stderr.write("Missing 'version' in CLI response\n")
        raise SystemExit(1)

    if "echo" not in data:
        sys.stderr.write("Missing 'echo' in CLI response\n")
        raise SystemExit(1)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

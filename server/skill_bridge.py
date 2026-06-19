"""可选：调用本机 Odaily Skill run.py（若已安装）。"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

_SKILL_DIR: Path | None | bool = False  # False = 未探测


def find_skill_dir() -> Path | None:
    global _SKILL_DIR
    if _SKILL_DIR is not False:
        return _SKILL_DIR  # type: ignore[return-value]

    env = os.environ.get("ODAILY_SKILL_DIR")
    if env:
        p = Path(env)
        if (p / "run.py").exists():
            _SKILL_DIR = p
            return p

    candidates = [
        Path.home() / ".openclaw" / "skills" / "odaily-skill",
        Path.home() / ".claude" / "skills" / "odaily-skill",
    ]
    for p in candidates:
        if (p / "run.py").exists():
            _SKILL_DIR = p
            return p

    _SKILL_DIR = None
    return None


def run_tool(tool: str, params: dict[str, Any] | None = None) -> Any | None:
    skill_dir = find_skill_dir()
    if not skill_dir:
        return None
    payload = json.dumps(params or {}, ensure_ascii=False)
    try:
        proc = subprocess.run(
            [sys.executable, "run.py", tool, payload],
            cwd=skill_dir,
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    text = proc.stdout.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text, "tool": tool}


def skill_status() -> dict[str, Any]:
    skill_dir = find_skill_dir()
    return {
        "installed": skill_dir is not None,
        "path": str(skill_dir) if skill_dir else None,
    }

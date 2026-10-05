#!/usr/bin/env python3
"""PreToolUse hook for file writes: protect the shipped SQLite schema.

`0001_initial.sql` runs on every launch against databases that installed apps
already created, and `CREATE TABLE IF NOT EXISTS` skips existing tables, so a
column added only there never reaches those installs. Editing a committed
migration asks the user; new migration files pass. Parse failures fail open.
Bash-based writes (sed -i, heredocs, Set-Content) are not covered.
"""
from __future__ import annotations

import json
import subprocess
import sys
from fnmatch import fnmatchcase
from pathlib import Path

PATH_KEYS = ("file_path", "notebook_path", "relative_path")
MIGRATIONS = "apps/desktop/src-tauri/src/db/migrations/*.sql"


def git(cwd: str | Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True)


def repo_path(tool_input: dict, cwd: str) -> str | None:
    root = Path(git(cwd, "rev-parse", "--show-toplevel").stdout.strip())
    for key in PATH_KEYS:
        if tool_input.get(key):
            raw = Path(tool_input[key])
            full = raw if raw.is_absolute() else Path(cwd) / raw
            try:
                return full.resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                return None
    return None


def decide(payload: dict) -> str | None:
    cwd = payload.get("cwd") or "."
    path = repo_path(payload.get("tool_input") or {}, cwd)
    if not path or not fnmatchcase(path, MIGRATIONS):
        return None
    if git(cwd, "cat-file", "-e", f"HEAD:{path}").returncode != 0:
        return None
    return (
        f"`{path}` already runs on installed apps, and `CREATE TABLE IF NOT EXISTS` skips their "
        "existing tables. A new column here also needs an `ensure_table_column` call in `migrate()` "
        "(apps/desktop/src-tauri/src/services/storage.rs); approve once that is part of the change."
    )


def main() -> None:
    try:
        reason = decide(json.load(sys.stdin))
    except Exception:
        return
    if reason:
        json.dump(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": reason,
                }
            },
            sys.stdout,
        )


if __name__ == "__main__":
    main()

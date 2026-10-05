#!/usr/bin/env python3
"""Restrict subagent file writes to a declared scope.

The parent session declares globs before delegating; while a scope is set, any
file-writing tool call made from inside a subagent (hook payload carries
`agent_id`) outside those globs is denied. The main session is never restricted,
and with no scope set nothing is restricted. `*` matches across `/`.

    python3 .claude/hooks/write_scope.py set 'apps/desktop/src-tauri/src/services/scanner.rs' 'apps/desktop/src/app/detection*'
    python3 .claude/hooks/write_scope.py show
    python3 .claude/hooks/write_scope.py clear

With no arguments it runs as a PreToolUse hook (payload on stdin).
Limitation: Bash-based writes (sed -i, heredocs, Set-Content) are not covered.
"""
from __future__ import annotations

import json
import subprocess
import sys
from fnmatch import fnmatchcase
from pathlib import Path

PATH_KEYS = ("file_path", "notebook_path", "relative_path")


def git(cwd: str | Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True, check=True
    ).stdout.strip()


def scope_file(cwd: str | Path) -> Path:
    # common dir, so worktree-isolated subagents see the same scope
    common = Path(git(cwd, "rev-parse", "--git-common-dir"))
    if not common.is_absolute():
        common = Path(cwd) / common
    return common / "claude-write-scope"


def load_globs(cwd: str | Path) -> list[str] | None:
    f = scope_file(cwd)
    if not f.exists():
        return None
    return [ln.strip() for ln in f.read_text(encoding="utf-8").splitlines() if ln.strip()]


def target_path(tool_input: dict, cwd: str) -> str | None:
    for key in PATH_KEYS:
        if tool_input.get(key):
            raw = Path(tool_input[key])
            full = raw if raw.is_absolute() else Path(cwd) / raw
            root = Path(git(cwd, "rev-parse", "--show-toplevel"))
            try:
                return full.resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                return full.resolve().as_posix()
    return None


def decide(payload: dict) -> str | None:
    if not payload.get("agent_id"):
        return None
    cwd = payload.get("cwd") or "."
    globs = load_globs(cwd)
    if globs is None:
        return None
    path = target_path(payload.get("tool_input") or {}, cwd)
    if path is None:
        return f"Write scope is active and {payload.get('tool_name')} has no single target path."
    if any(fnmatchcase(path, g) for g in globs):
        return None
    return (
        f"`{path}` is outside this task's write scope ({', '.join(globs)}). "
        "Report back to the parent instead of editing it."
    )


def hook() -> None:
    try:
        payload = json.load(sys.stdin)
        reason = decide(payload)
    except Exception:
        return
    if reason:
        json.dump(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            },
            sys.stdout,
        )


def main(argv: list[str]) -> int:
    if not argv:
        hook()
        return 0
    f = scope_file(".")
    if argv[0] == "set" and argv[1:]:
        f.write_text("\n".join(argv[1:]) + "\n", encoding="utf-8")
    elif argv[0] == "clear":
        f.unlink(missing_ok=True)
    elif argv[0] != "show":
        print(__doc__)
        return 2
    print(f.read_text(encoding="utf-8") if f.exists() else "no write scope set", end="")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

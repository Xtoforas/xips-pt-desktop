#!/usr/bin/env python3
"""Path-scoped verification gate.

`verify` runs the checks for each area with uncommitted changes and, on success,
records a marker keyed to the exact working-tree content it checked. The Bash
guard hook refuses `git commit` while any staged area lacks a matching marker.

    python3 .claude/hooks/gate.py status
    python3 .claude/hooks/gate.py verify [area ...]
    python3 .claude/hooks/gate.py versions   # the `version` area's check
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

DESKTOP = "apps/desktop"
TAURI = f"{DESKTOP}/src-tauri"
MANIFEST = f"{TAURI}/Cargo.toml"

# area -> (paths, [(cwd relative to repo root, argv)])
AREAS: dict[str, tuple[list[str], list[tuple[str, list[str]]]]] = {
    # same three steps CI runs on the renderer
    "web": (
        [f"{DESKTOP}/src", f"{DESKTOP}/index.html", f"{DESKTOP}/package.json",
         f"{DESKTOP}/tsconfig.json", f"{DESKTOP}/vite.config.ts",
         f"{DESKTOP}/vitest.contract.config.ts", "packages", "package.json",
         "package-lock.json", "tsconfig.base.json"],
        [(".", ["npm", "run", "typecheck"]), (".", ["npm", "test"]), (".", ["npm", "run", "build"])],
    ),
    # CI only runs `cargo check`; `cargo test` compiles the same code and runs the unit tests
    "native": ([TAURI], [(".", ["cargo", "test", "--manifest-path", MANIFEST])]),
    # README: the three version fields must stay identical (the lock follows Cargo.toml)
    "version": (
        [f"{DESKTOP}/package.json", MANIFEST, f"{TAURI}/Cargo.lock", f"{TAURI}/tauri.conf.json"],
        [(".", [sys.executable, str(Path(__file__).resolve()), "versions"])],
    ),
}


def git(root: Path, *args: str, env: dict[str, str] | None = None) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True,
        encoding="utf-8", errors="replace", check=True, env=env,
    ).stdout


def repo_root(cwd: str | Path = ".") -> Path:
    return Path(git(Path(cwd), "rev-parse", "--show-toplevel").strip())


def existing(root: Path, paths: list[str]) -> list[str]:
    return [p for p in paths if (root / p).exists() or git(root, "ls-files", "--", p).strip()]


def is_dirty(root: Path, paths: list[str]) -> bool:
    return bool(git(root, "status", "--porcelain", "--", *paths).strip())


def content_key(root: Path, paths: list[str]) -> str:
    """Hash of the working-tree content (tracked + untracked, minus ignored) under paths."""
    paths = existing(root, paths)
    with tempfile.TemporaryDirectory() as tmp:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(tmp) / "index")}
        git(root, "read-tree", "HEAD", env=env)
        git(root, "add", "-A", "--", *paths, env=env)
        tree = git(root, "write-tree", env=env).strip()
        listing = git(root, "ls-tree", tree, "--", *paths)
    return hashlib.sha256(listing.encode()).hexdigest()


def marker(root: Path, area: str) -> Path:
    return root / git(root, "rev-parse", "--git-path", f"claude-gate/{area}").strip()


def dirty_areas(root: Path) -> list[str]:
    return [area for area, (paths, _) in AREAS.items() if is_dirty(root, paths)]


def staged_areas(root: Path) -> list[str]:
    return [
        area for area, (paths, _) in AREAS.items()
        if git(root, "diff", "--cached", "--name-only", "--", *paths).strip()
    ]


def unverified(cwd: str | Path = ".", only_staged: bool = False) -> list[str]:
    """Dirty areas whose current content has not passed `verify`.

    With only_staged, just the areas the next commit would include.
    """
    root = repo_root(cwd)
    stale = []
    for area in staged_areas(root) if only_staged else dirty_areas(root):
        m = marker(root, area)
        if not m.exists() or m.read_text().strip() != content_key(root, AREAS[area][0]):
            stale.append(area)
    return stale


def run_step(cwd: Path, argv: list[str]) -> bool:
    # Windows needs the full path to resolve npm.cmd / cargo.exe
    exe = shutil.which(argv[0]) or argv[0]
    try:
        return subprocess.run([exe, *argv[1:]], cwd=cwd).returncode == 0
    except OSError as exc:
        print(f"could not run {argv[0]}: {exc}", flush=True)
        return False


def verify(root: Path, areas: list[str]) -> bool:
    ok = True
    for area in areas:
        paths, steps = AREAS[area]
        before = content_key(root, paths)
        print(f"== {area}", flush=True)
        passed = all(run_step(root / rel, argv) for rel, argv in steps)
        if passed and content_key(root, paths) == before:
            m = marker(root, area)
            m.parent.mkdir(parents=True, exist_ok=True)
            m.write_text(before)
            print(f"== {area}: verified", flush=True)
        else:
            ok = False
            why = "checks failed" if not passed else "files changed during the run"
            print(f"== {area}: NOT verified ({why})", flush=True)
    return ok


def versions(root: Path) -> dict[str, str | None]:
    def read(rel: str) -> str:
        return (root / rel).read_text(encoding="utf-8")

    package = tomllib.loads(read(MANIFEST)).get("package", {})
    locked = tomllib.loads(read(f"{TAURI}/Cargo.lock")).get("package", [])
    return {
        f"{DESKTOP}/package.json": json.loads(read(f"{DESKTOP}/package.json")).get("version"),
        f"{TAURI}/tauri.conf.json": json.loads(read(f"{TAURI}/tauri.conf.json")).get("version"),
        MANIFEST: package.get("version"),
        f"{TAURI}/Cargo.lock": next(
            (p.get("version") for p in locked if p.get("name") == package.get("name")), None
        ),
    }


def check_versions(root: Path) -> int:
    found = versions(root)
    for path, version in found.items():
        print(f"{version or 'MISSING'}  {path}")
    if len(set(found.values())) == 1 and None not in found.values():
        return 0
    print("versions differ; bump all of them together (Cargo.lock follows `cargo check`)")
    return 1


def main(argv: list[str]) -> int:
    root = repo_root()
    cmd, args = (argv[0], argv[1:]) if argv else ("status", [])
    if cmd == "status":
        stale = unverified(root)
        for area in dirty_areas(root):
            print(f"{area}: {'UNVERIFIED' if area in stale else 'verified'}")
        return 1 if stale else 0
    if cmd == "versions":
        return check_versions(root)
    if cmd == "verify":
        unknown = [a for a in args if a not in AREAS]
        if unknown:
            print(f"unknown area(s): {', '.join(unknown)}; choose from {', '.join(AREAS)}")
            return 2
        areas = args or dirty_areas(root)
        if not areas:
            print("nothing to verify: no dirty areas")
            return 0
        return 0 if verify(root, areas) else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

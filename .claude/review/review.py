#!/usr/bin/env python3
"""Narrow-agent review pipeline.

Stages: context selection -> eligibility/cost gate -> read-only lanes (parallel)
-> schema/line validation -> confidence threshold + dedup -> staged report
-> human label into the eval set. Only the model lanes use a model; everything
else is deterministic.

    python3 .claude/review/review.py run [--base REF] [--lanes a,b] [--render] [--min-confidence 0.5] [--dry-run]
    python3 .claude/review/review.py show
    python3 .claude/review/review.py label <finding-id> accept|reject [note ...]

`--base` defaults to the upstream branch (or HEAD~1 when nothing is unpushed); the
diff is base vs the working tree, so uncommitted changes are reviewed too.
The render lane is opt-in (`--render`): it drives the renderer with Playwright at
APP_URL, the Vite dev server (`npm run dev --workspace @xips/desktop`), where the
browser mock client stands in for Tauri.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from fnmatch import fnmatchcase
from pathlib import Path

EVALS = Path(__file__).parent / "evals" / "findings.jsonl"
RULES_FILE = Path("CLAUDE.md")  # AGENTS.md is gitignored in this repo
SEVERITIES = {"high", "med", "low"}
LINE_TOLERANCE = 2
DEDUP_LINES = 3
MAX_BUNDLE_CHARS = 150_000
APP_URL = "http://localhost:1420"
# native Windows can't spawn npx directly as a stdio MCP server
NPX = ["cmd", "/c", "npx"] if os.name == "nt" else ["npx"]
PLAYWRIGHT_MCP = json.dumps(
    {"mcpServers": {"playwright": {"type": "stdio", "command": NPX[0], "args": [*NPX[1:], "-y", "@playwright/mcp@latest"]}}}
)

D = "apps/desktop"
T = f"{D}/src-tauri"
SKIP = [
    "docs/*", "*.md", "examples/*", ".claude/*", "tasks/*", ".playwright-mcp/*", "*/dist/*",
    f"{T}/gen/*", f"{T}/icons/*", f"{T}/target/*", "*package-lock.json", "*Cargo.lock", "*.lock",
    "*.tsbuildinfo", "*.csv", "*.png", "*.jpg", "*.svg", "*.ico", "*.icns",
]
TESTS = ["*.test.ts", "*.test.tsx", "*.contract-test.ts"]
LANES: dict[str, dict] = {
    "upload": {
        "globs": [
            f"{T}/src/services/scanner.rs", f"{T}/src/services/storage.rs",
            f"{T}/src/services/background_queue.rs", f"{T}/src/services/api_client.rs",
            f"{T}/src/services/file_watcher.rs", f"{T}/src/models/*", f"{T}/src/db/*",
            "packages/api-contract/*", f"{D}/src/app/queue-model.ts", f"{D}/src/app/desktop-client.ts",
        ],
        "exclude": TESTS,
        "min_lines": 1,
    },
    "correctness": {
        "globs": [f"{D}/src/*", f"{T}/src/*", "packages/api-contract/src/*"],
        "exclude": TESTS + ["*.css"],
        "min_lines": 20,  # opus lane: not worth it for tiny diffs
    },
    "perf": {
        "globs": [
            f"{T}/src/services/*", f"{T}/src/commands/*", f"{T}/src/main.rs",
            f"{T}/src/app_state.rs", f"{D}/src/app/*",
        ],
        "exclude": TESTS + ["*.css"],
        "min_lines": 5,
    },
    "security": {
        "globs": [
            f"{T}/src/commands/*", f"{T}/src/services/api_client.rs", f"{T}/src/services/storage.rs",
            f"{T}/src/main.rs", f"{T}/src/app_state.rs", f"{T}/capabilities/*", f"{T}/tauri*.conf.json",
            f"{T}/Cargo.toml", f"{T}/build.rs", f"{D}/index.html", f"{D}/vite.config.ts",
            f"{D}/src/app/desktop-client.ts", f"{D}/src/app/DesktopContext.tsx", "*package.json",
            ".github/workflows/*", "run-xips-pt-desktop-windows.bat",
        ],
        "exclude": TESTS,
        "rules": "Security Rules",
        "min_lines": 1,
    },
    "render": {
        "globs": [f"{D}/src/app/*", f"{D}/src/main.tsx", f"{D}/index.html"],
        "exclude": TESTS,
        "rules": "Frontend Rules",
        "min_lines": 1,
        "opt_in": True,
        # rendered problems rarely sit on the changed line; require only a changed file
        "anchor_lines": False,
        "extra_args": ["--mcp-config", PLAYWRIGHT_MCP, "--allowedTools", "mcp__playwright"],
    },
}


@dataclass
class FileDiff:
    path: str
    text: str = ""
    added: set[int] = field(default_factory=set)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", check=True
    ).stdout


def default_base() -> str:
    try:
        upstream = git("rev-parse", "--verify", "-q", "@{upstream}").strip()
        if upstream and upstream != git("rev-parse", "HEAD").strip():
            return upstream
    except subprocess.CalledProcessError:
        pass
    return "HEAD~1"


# --- context selection -------------------------------------------------------

def parse_diff(diff: str) -> dict[str, FileDiff]:
    files: dict[str, FileDiff] = {}
    current: FileDiff | None = None
    new_line = 0
    for line in diff.splitlines():
        if line.startswith("diff --git "):
            path = line.split(" b/", 1)[1]
            current = files.setdefault(path, FileDiff(path))
        if current is None:
            continue
        current.text += line + "\n"
        m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
        if m:
            new_line = int(m.group(1))
        elif line.startswith("+") and not line.startswith("+++"):
            current.added.add(new_line)
            new_line += 1
        elif line.startswith(" "):
            new_line += 1
    for f in list(files.values()):
        if f.text and "\n+++ /dev/null" in f.text:
            del files[f.path]  # deletions have nothing to review
    return files


def matches(path: str, globs: list[str]) -> bool:
    return any(fnmatchcase(path, g) for g in globs)


def rules_section(name: str) -> str:
    if not RULES_FILE.exists():
        return ""
    text = RULES_FILE.read_text(encoding="utf-8")
    m = re.search(rf"^## {re.escape(name)}\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1).strip() if m else ""


# --- eligibility / cost gate --------------------------------------------------

def route(
    files: dict[str, FileDiff], only: list[str] | None, opt_in: tuple[str, ...] = ()
) -> tuple[dict[str, list[FileDiff]], list[str]]:
    """Pick lanes and their files. Lanes named in `only` bypass the size gate."""
    reviewable = {p: f for p, f in files.items() if not matches(p, SKIP)}
    plan: dict[str, list[FileDiff]] = {}
    notes: list[str] = []
    for lane, spec in LANES.items():
        if only and lane not in only:
            continue
        if spec.get("opt_in") and not (only and lane in only) and lane not in opt_in:
            continue
        picked = [
            f for p, f in reviewable.items()
            if matches(p, spec["globs"]) and not matches(p, spec.get("exclude", []))
        ]
        if not picked:
            continue
        changed = sum(len(f.added) for f in picked)
        if changed < spec["min_lines"] and not only:
            notes.append(f"{lane}: skipped, {changed} changed lines < {spec['min_lines']}")
            continue
        if sum(len(f.text) for f in picked) > MAX_BUNDLE_CHARS:
            notes.append(f"{lane}: skipped, bundle over {MAX_BUNDLE_CHARS} chars; narrow --base")
            continue
        plan[lane] = picked
    return plan, notes


def bundle(lane: str, picked: list[FileDiff], base: str) -> str:
    parts = [
        f"Review lane: {lane}. Diff base: {base} vs working tree.",
        "Changed files (unified diff, new-file line numbers in @@ headers). "
        "You may Read full files for context.",
    ]
    if LANES[lane].get("rules"):
        parts.append("Applicable repo rules:\n" + rules_section(LANES[lane]["rules"]))
    if lane == "upload":
        parts.append("Commit messages in range:\n" + git("log", f"{base}..HEAD", "--format=%B---"))
    if lane == "render":
        parts.append(f"App base URL: {APP_URL}. Routes are defined in {D}/src/app/App.tsx.")
    parts.extend(f.text for f in picked)
    parts.append("Respond with the JSON array only, per your output contract.")
    return "\n\n".join(parts)


# --- lanes --------------------------------------------------------------------

def app_reachable() -> bool:
    try:
        with urllib.request.urlopen(APP_URL, timeout=5) as resp:
            return bool(resp.read(1))
    except urllib.error.HTTPError:
        return True  # any HTTP error page means the server is up
    except OSError:
        return False


def clean_playwright_artifacts(since: float) -> None:
    """Remove screenshots/snapshots the render lane wrote so they don't land in the tree."""
    candidates = [f for d in (Path(".playwright-mcp"), Path("output/playwright")) if d.exists()
                  for f in d.rglob("*")]
    # screenshots saved with a bare filename land in the repo root as untracked files
    candidates += [Path(p) for p in git("ls-files", "--others", "--exclude-standard").splitlines()
                   if Path(p).suffix.lower() in {".png", ".jpg", ".jpeg"}]
    for f in candidates:
        if f.is_file() and f.stat().st_mtime >= since:
            f.unlink()


def run_lane(lane: str, prompt: str) -> tuple[list, float, str | None]:
    proc = subprocess.run(
        [shutil.which("claude") or "claude", "-p", "--agent", f"review-{lane}",
         "--output-format", "json", *LANES[lane].get("extra_args", [])],
        input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900,
        # lanes are full sessions; hooks that shouldn't run inside one check this
        env={**os.environ, "XIPS_REVIEW_LANE": "1"},
    )
    cost, text = 0.0, proc.stdout
    try:
        envelope = json.loads(proc.stdout)
        cost, text = float(envelope.get("total_cost_usd") or 0), envelope["result"]
        return extract_array(text), cost, None
    except Exception as exc:  # noqa: BLE001 - any lane failure is reported, not fatal
        preview = " ".join(str(text).split())[:200]
        return [], cost, f"{lane}: unparseable output ({exc}): {preview!r} {proc.stderr[-200:]}"


def extract_array(text: str) -> list:
    """Parse the lane's JSON array, tolerating prose or a code fence around it."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end < start:
            raise
        return json.loads(text[start : end + 1])


# --- validation, threshold, dedup ----------------------------------------------

def validate(lane: str, raw: list, picked: list[FileDiff]) -> tuple[list[dict], list[str]]:
    by_path = {f.path: f for f in picked}
    kept, dropped = [], []
    if not isinstance(raw, list):
        return [], [f"{lane}: output is not a JSON array"]
    for item in raw:
        why = None
        if isinstance(item, dict) and isinstance(item.get("confidence"), str):
            try:  # models sometimes quote the number
                item["confidence"] = float(item["confidence"])
            except ValueError:
                pass
        if not isinstance(item, dict):
            why = "not an object"
        elif not all(isinstance(item.get(k), str) and item[k] for k in ("file", "claim", "evidence")):
            why = "missing file/claim/evidence"
        elif item.get("severity") not in SEVERITIES:
            why = f"bad severity {item.get('severity')!r}"
        elif not isinstance(item.get("confidence"), (int, float)) or not 0 <= item["confidence"] <= 1:
            why = "confidence not in [0, 1]"
        elif not isinstance(item.get("line"), int):
            why = "line not an integer"
        elif item["file"] not in by_path:
            why = f"{item['file']} not in this lane's diff"
        elif LANES[lane].get("anchor_lines", True) and not any(abs(item["line"] - n) <= LINE_TOLERANCE for n in by_path[item["file"]].added):
            why = f"{item['file']}:{item['line']} is not a changed line"
        if why:
            dropped.append(f"{lane}: {why}")
            continue
        finding = {k: item[k] for k in ("file", "line", "severity", "confidence", "claim", "evidence")}
        finding["lane"] = lane
        finding["id"] = hashlib.sha1(f"{lane}:{item['file']}:{item['line']}:{item['claim']}".encode()).hexdigest()[:8]
        kept.append(finding)
    return kept, dropped


def words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9_]{3,}", text.lower()))


def dedup(findings: list[dict], min_confidence: float) -> tuple[list[dict], int]:
    ranked = sorted(
        (f for f in findings if f["confidence"] >= min_confidence),
        key=lambda f: -f["confidence"],
    )
    below = len(findings) - len(ranked)
    out: list[dict] = []
    for f in ranked:
        twin = next(
            (
                o for o in out
                if o["file"] == f["file"] and abs(o["line"] - f["line"]) <= DEDUP_LINES
                and len(words(o["claim"]) & words(f["claim"])) / max(1, len(words(o["claim"]) | words(f["claim"]))) >= 0.5
            ),
            None,
        )
        if twin:
            twin.setdefault("also_lanes", []).append(f["lane"])
        else:
            out.append(f)
    return out, below


# --- staged submission -----------------------------------------------------------

def runs_dir() -> Path:
    d = Path(git("rev-parse", "--git-common-dir").strip()) / "claude-review"
    d.mkdir(parents=True, exist_ok=True)
    return d


def render(report: dict) -> str:
    lines = [f"# Review {report['head'][:8]} vs {report['base']}  (cost ${report['cost_usd']:.2f})", ""]
    for f in report["findings"]:
        extra = f" (+{', '.join(f['also_lanes'])})" if f.get("also_lanes") else ""
        lines += [
            f"- **[{f['id']}] {f['severity']}** `{f['file']}:{f['line']}` {f['lane']}{extra}, conf {f['confidence']:.2f}",
            f"  {f['claim']}",
            f"  _evidence:_ {f['evidence']}",
        ]
    if not report["findings"]:
        lines.append("No findings above threshold.")
    if report["notes"]:
        lines += ["", "Notes:"] + [f"- {n}" for n in report["notes"]]
    lines += ["", "Label: `python3 .claude/review/review.py label <id> accept|reject [note]`"]
    return "\n".join(lines)


def cmd_run(args: argparse.Namespace) -> int:
    base = args.base or default_base()
    files = parse_diff(git("diff", "-U5", "--no-color", base))
    plan, notes = route(
        files, args.lanes.split(",") if args.lanes else None, ("render",) if args.render else ()
    )
    if "render" in plan and not args.dry_run and not app_reachable():
        del plan["render"]
        notes.append(f"render: skipped, {APP_URL} not reachable; start it with "
                     "`npm run dev --workspace @xips/desktop`")
    if not plan:
        print(f"Nothing eligible to review vs {base}." + ("\n" + "\n".join(notes) if notes else ""))
        return 0
    prompts = {lane: bundle(lane, picked, base) for lane, picked in plan.items()}
    if args.dry_run:
        for lane, picked in plan.items():
            print(f"{lane}: {len(prompts[lane])} chars, files: {', '.join(f.path for f in picked)}")
        print("\n".join(notes))
        return 0
    started = time.time()
    with ThreadPoolExecutor(len(plan)) as pool:
        results = dict(zip(plan, pool.map(lambda lane: run_lane(lane, prompts[lane]), plan)))
    if "render" in plan:
        clean_playwright_artifacts(started)
    findings, cost = [], 0.0
    for lane, (raw, lane_cost, error) in results.items():
        cost += lane_cost
        if error:
            notes.append(error)
            continue
        kept, dropped = validate(lane, raw, plan[lane])
        findings += kept
        notes += dropped
    final, below = dedup(findings, args.min_confidence)
    if below:
        notes.append(f"{below} finding(s) below confidence {args.min_confidence}")
    report = {
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "base": base, "head": git("rev-parse", "HEAD").strip(),
        "lanes": list(plan), "cost_usd": round(cost, 4), "findings": final, "notes": notes,
    }
    out = runs_dir() / f"{report['created'].replace(':', '')}-{report['head'][:8]}.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    (runs_dir() / "latest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(render(report))
    return 0


def cmd_show(_: argparse.Namespace) -> int:
    latest = runs_dir() / "latest.json"
    print(render(json.loads(latest.read_text(encoding="utf-8"))) if latest.exists() else "No review runs yet.")
    return 0


# --- human decision -> eval set --------------------------------------------------

def cmd_label(args: argparse.Namespace) -> int:
    for path in sorted(runs_dir().glob("*.json"), reverse=True):
        report = json.loads(path.read_text(encoding="utf-8"))
        finding = next((f for f in report["findings"] if f["id"] == args.id), None)
        if finding:
            break
    else:
        print(f"No finding with id {args.id}")
        return 1
    record = {
        **{k: finding[k] for k in ("id", "lane", "file", "line", "severity", "confidence", "claim", "evidence")},
        "head": report["head"], "base": report["base"], "outcome": args.outcome,
        "note": " ".join(args.note), "source": "pipeline",
        "labeled": datetime.now(timezone.utc).date().isoformat(),
    }
    EVALS.parent.mkdir(parents=True, exist_ok=True)
    with EVALS.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(record) + "\n")
    print(f"{args.id}: {args.outcome} -> {EVALS}")
    return 0


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--base")
    run.add_argument("--lanes", help=f"comma list from: {', '.join(LANES)}")
    run.add_argument("--min-confidence", type=float, default=0.5)
    run.add_argument("--render", action="store_true", help="add the opt-in Playwright render lane")
    run.add_argument("--dry-run", action="store_true", help="show routing without calling models")
    sub.add_parser("show")
    label = sub.add_parser("label")
    label.add_argument("id")
    label.add_argument("outcome", choices=["accept", "reject"])
    label.add_argument("note", nargs="*")
    args = p.parse_args(argv)
    os.chdir(git("rev-parse", "--show-toplevel").strip())
    return {"run": cmd_run, "show": cmd_show, "label": cmd_label}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

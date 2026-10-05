#!/usr/bin/env python3
"""PreToolUse hook for Bash and PowerShell: enforce repo rules that used to live only as prose.

Reads the hook payload on stdin. Prints a deny or ask decision on stdout when a
rule is hit; otherwise exits silently (no decision). Parse failures fail open.

deny: never right here (bulk git add, committing unverified areas).
ask:  right only when the user asked for it (shipping a release that installed
      apps auto-update to, replacing the updater key) -- the permission prompt
      puts the call in their hands, even when `git push *` is allow-listed.
"""
from __future__ import annotations

import json
import re
import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import gate  # noqa: E402

OPERATORS = {"&&", "||", ";", "|", "&", "|&", ";;", "(", ")"}
WRAPPERS = {"time", "env", "sudo", "nohup", "exec", "command"}
# shell keywords and PowerShell braces that can precede a command in the same segment
KEYWORDS = {"if", "then", "else", "elif", "do", "while", "until", "!", "{", "}"}
# keeps the rest of the `<<EOF | cmd` line (it is still a command); drops the body
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1([^\n]*)\n.*?\n\s*\2\s*(?:\n|$)", re.S)
# PowerShell here-strings (@'...'@ / @"..."@) are commit messages, not commands
HERESTRING = re.compile(r"@(['\"])\r?\n.*?\r?\n\1@", re.S)
GH_RELEASE_WRITES = {"create", "edit", "delete", "delete-asset", "upload"}
# a refspec that pushes or deletes a v* release tag: v1.2.3, refs/tags/v1.2.3, :v1.2.3, +v1.2.3
RELEASE_REFSPEC = re.compile(r"^\+?(?:[^:]*:)?(?:refs/tags/)?v\d")
RELEASE_WHY = (
    "pushes a v* tag, which builds a signed release that installed apps auto-update to. "
    "Only on explicit request."
)


def segments(command: str) -> list[list[str]]:
    """Split a shell command into simple-command token lists, ignoring heredoc bodies."""
    command = HERESTRING.sub("MSG", HEREDOC.sub(r"\3\n", command))
    lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    lexer.commenters = ""
    out: list[list[str]] = [[]]
    for tok in lexer:
        if tok in OPERATORS or tok == "\n":
            out.append([])
        else:
            out[-1].append(tok)
    return [seg for seg in map(strip_prefix, out) if seg]


def strip_prefix(seg: list[str]) -> list[str]:
    i = 0
    while i < len(seg) and (re.match(r"^\w+=", seg[i]) or seg[i] in WRAPPERS | KEYWORDS):
        i += 1
    return seg[i:]


def program(token: str) -> str:
    """`C:\\Program Files\\GitHub CLI\\gh.exe` -> `gh`."""
    name = re.split(r"[\\/]", token)[-1].lower()
    return re.sub(r"\.(exe|cmd|bat)$", "", name)


def git_subcommand(args: list[str]) -> tuple[str | None, list[str]]:
    """(subcommand, its args), skipping git's global options like `-C dir`."""
    i = 0
    while i < len(args):
        if args[i] in ("-C", "-c", "--git-dir", "--work-tree"):
            i += 2
        elif args[i].startswith("-"):
            i += 1
        else:
            return args[i], args[i + 1 :]
    return None, []


def check_segment(seg: list[str]) -> tuple[str, str] | None:
    """(decision, reason) for one simple command, or None."""
    cmd, args = program(seg[0]), seg[1:]

    if cmd == "git":
        sub, rest = git_subcommand(args)
        if sub == "add" and any(a in (".", "-A", "--all", "-u", "--update", ":/") for a in rest):
            return "deny", "Stage specific files with `git add <paths>`, not a bulk add."
        if sub == "push":
            flags = {a.split("=")[0] for a in rest if a.startswith("-")}
            refspecs = [a for a in rest if not a.startswith("-")][1:]  # first is the remote
            if flags & {"--tags", "--follow-tags", "--mirror"} or any(
                RELEASE_REFSPEC.match(r) for r in refspecs
            ):
                return "ask", f"This {RELEASE_WHY}"

    if cmd == "gh" and args[:1] == ["release"] and args[1:2] and args[1] in GH_RELEASE_WRITES:
        return "ask", f"`gh release {args[1]}` changes a published release that installed apps update from."

    if "signer" in args and "generate" in args[args.index("signer") :] and any(
        "tauri" in t for t in seg[: seg.index("signer")]
    ):
        return "ask", (
            "A new updater keypair makes installed apps reject every update signed with it "
            "until a release signed by the old key ships the new public key. Only on explicit request."
        )

    return None


def is_commit(seg: list[str]) -> bool:
    return program(seg[0]) == "git" and git_subcommand(seg[1:])[0] == "commit"


def check_commit(seg: list[str], cwd: str) -> tuple[str, str] | None:
    commit_all = any(a in ("-a", "--all") or re.fullmatch(r"-[a-zA-Z]*a[a-zA-Z]*", a) for a in seg)
    try:
        stale = gate.unverified(cwd, only_staged=not commit_all)
    except Exception:
        return None
    if not stale:
        return None
    return "deny", (
        f"Unverified changes in: {', '.join(stale)}. Run "
        f"`python3 .claude/hooks/gate.py verify {' '.join(stale)}` "
        "from the repo root, then retry."
    )


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        command = payload.get("tool_input", {}).get("command", "")
        segs = segments(command)
    except Exception:
        return
    asked = None
    for seg in segs:
        result = check_segment(seg)
        if not result and is_commit(seg):
            result = check_commit(seg, payload.get("cwd") or ".")
        if result and result[0] == "deny":
            asked = result
            break
        asked = asked or result
    if asked:
        json.dump(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": asked[0],
                    "permissionDecisionReason": asked[1],
                }
            },
            sys.stdout,
        )


if __name__ == "__main__":
    main()

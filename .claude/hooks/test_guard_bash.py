"""Run with: python3 -m unittest discover -s .claude/hooks"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("guard_bash.py")


def decision(command: str) -> tuple[str, str] | None:
    out = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps({"tool_name": "Bash", "tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    if not out:
        return None
    hook = json.loads(out)["hookSpecificOutput"]
    return hook["permissionDecision"], hook["permissionDecisionReason"]


DENIED = [
    "git add -A && git commit -m wip",
    "git add . ",
    "git -C apps/desktop add --all",
    "cd x; git add -u",
    "if ($?) { git add . }",
]
ASKED = [
    "git push origin v0.1.4",
    "git tag v0.1.4 && git push origin v0.1.4",
    "git push --tags",
    "git push --follow-tags origin main",
    "git push origin refs/tags/v0.1.4",
    "git push origin :v0.1.3",
    "git push origin HEAD:refs/tags/v0.1.4",
    "gh release create v0.1.4 --generate-notes",
    "gh release delete v0.1.3 -y",
    "gh release upload v0.1.4 app.msi",
    '& "C:\\Program Files\\GitHub CLI\\gh.exe" release edit v0.1.4 --draft=false',
    "cd apps/desktop && npx tauri signer generate -w ~/.tauri/app.key",
    "cargo tauri signer generate",
]
ALLOWED = [
    "git add .claude/hooks/guard_bash.py apps/desktop/src/app/App.tsx",
    "git commit -m 'docs: never git add -A'",
    "git push",
    "git push origin main",
    "git push -u origin feature/watch-folders",
    "git tag v0.1.4",
    "git tag -l 'v*'",
    "gh release list",
    "gh release view v0.1.3",
    "gh run list --workflow build-desktop.yml",
    "npx tauri signer sign --help",
    "npx tauri build",
    "grep -n 'git push --tags' README.md",
    "echo 'unbalanced",
]


class GuardBashTest(unittest.TestCase):
    def test_denied(self):
        for command in DENIED:
            with self.subTest(command=command):
                self.assertEqual((decision(command) or ("none",))[0], "deny")

    def test_asked(self):
        for command in ASKED:
            with self.subTest(command=command):
                self.assertEqual((decision(command) or ("none",))[0], "ask")

    def test_allowed(self):
        for command in ALLOWED:
            with self.subTest(command=command):
                self.assertIsNone(decision(command))

    def test_deny_wins_over_ask(self):
        self.assertEqual(decision("git push --tags; git add -A")[0], "deny")

    def test_heredoc_body_is_not_parsed_as_commands(self):
        self.assertIsNone(decision("cat <<'EOF' > notes.txt\ngit add -A\ngit push --tags\nEOF"))


if __name__ == "__main__":
    unittest.main()

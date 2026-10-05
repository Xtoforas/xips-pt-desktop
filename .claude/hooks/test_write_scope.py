"""Run with: python3 -m unittest discover -s .claude/hooks"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("write_scope.py")


class WriteScopeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q"], cwd=self.repo, check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def run_hook(self, *args, payload=None):
        return subprocess.run(
            [sys.executable, str(HOOK), *args],
            cwd=self.repo, input=json.dumps(payload) if payload else "",
            capture_output=True, text=True, check=True,
        ).stdout

    def decision(self, file_path, agent_id="a1", tool="Edit"):
        payload = {"cwd": str(self.repo), "tool_name": tool, "tool_input": {"file_path": file_path}}
        if agent_id:
            payload["agent_id"] = agent_id
        out = self.run_hook(payload=payload)
        return json.loads(out)["hookSpecificOutput"]["permissionDecisionReason"] if out else None

    def test_no_scope_allows_everything(self):
        self.assertIsNone(self.decision("apps/desktop/src/main.tsx"))

    def test_main_session_never_restricted(self):
        self.run_hook("set", "apps/desktop/src/app/*")
        self.assertIsNone(self.decision("apps/desktop/src-tauri/src/main.rs", agent_id=None))

    def test_subagent_inside_scope_allowed(self):
        self.run_hook("set", "apps/desktop/src-tauri/src/services/*", "apps/desktop/src/app/queue-model.ts")
        self.assertIsNone(self.decision("apps/desktop/src-tauri/src/services/scanner.rs"))
        self.assertIsNone(self.decision(str(self.repo / "apps/desktop/src/app/queue-model.ts")))

    def test_subagent_outside_scope_denied(self):
        self.run_hook("set", "apps/desktop/src-tauri/src/services/*")
        self.assertIn("outside", self.decision("apps/desktop/src-tauri/src/main.rs"))
        outside = str(Path(self.tmp.name).parent / "elsewhere.txt")
        self.assertIn("outside", self.decision(outside))

    def test_clear_removes_scope(self):
        self.run_hook("set", "apps/desktop/src/app/*")
        self.run_hook("clear")
        self.assertIsNone(self.decision("apps/desktop/src-tauri/src/main.rs"))

    def test_pathless_write_denied_under_scope(self):
        self.run_hook("set", "apps/desktop/src/app/*")
        payload = {"cwd": str(self.repo), "agent_id": "a", "tool_name": "mcp__x__replace_in_files",
                   "tool_input": {"needle": "x"}}
        out = json.loads(self.run_hook(payload=payload))
        self.assertIn("no single target path", out["hookSpecificOutput"]["permissionDecisionReason"])


if __name__ == "__main__":
    unittest.main()

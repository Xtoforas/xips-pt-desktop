"""Run with: python3 -m unittest discover -s .claude/hooks"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import gate  # noqa: E402

GUARD = Path(__file__).with_name("guard_bash.py")
PASS = [sys.executable, "-c", "pass"]
FAIL = [sys.executable, "-c", "raise SystemExit(1)"]
SRC = "apps/desktop/src"


def sh(cwd, *args):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


def commit_decision(cwd, command="git commit -m x"):
    out = subprocess.run(
        [sys.executable, str(GUARD)],
        input=json.dumps({"cwd": str(cwd), "tool_input": {"command": command}}),
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)["hookSpecificOutput"]["permissionDecisionReason"] if out else None


class GateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = Path(self.tmp.name)
        sh(self.repo, "git", "init", "-q")
        sh(self.repo, "git", "config", "user.email", "t@t")
        sh(self.repo, "git", "config", "user.name", "t")
        sh(self.repo, "git", "config", "core.autocrlf", "false")
        (self.repo / SRC).mkdir(parents=True)
        (self.repo / SRC / "a.ts").write_text("x = 1\n")
        (self.repo / "README.md").write_text("hi\n")
        (self.repo / ".gitignore").write_text("*.tsbuildinfo\n")
        sh(self.repo, "git", "add", ".")
        sh(self.repo, "git", "commit", "-qm", "init")
        self.areas = mock.patch.dict(gate.AREAS, {"web": ([SRC], [(".", PASS)])}, clear=True)
        self.areas.start()

    def tearDown(self):
        self.areas.stop()
        self.tmp.cleanup()

    def edit(self, rel=f"{SRC}/a.ts", text="x = 2\n"):
        (self.repo / rel).write_text(text)

    def test_clean_tree_needs_nothing(self):
        self.assertEqual(gate.unverified(self.repo), [])

    def test_docs_only_change_needs_nothing(self):
        self.edit("README.md", "changed\n")
        self.assertEqual(gate.unverified(self.repo), [])

    def test_dirty_area_needs_verify_then_passes(self):
        self.edit()
        self.assertEqual(gate.unverified(self.repo), ["web"])
        self.assertTrue(gate.verify(self.repo, ["web"]))
        self.assertEqual(gate.unverified(self.repo), [])

    def test_edit_after_verify_invalidates(self):
        self.edit()
        gate.verify(self.repo, ["web"])
        self.edit(f"{SRC}/b.ts", "new\n")
        self.assertEqual(gate.unverified(self.repo), ["web"])

    def test_ignored_files_do_not_invalidate(self):
        self.edit()
        gate.verify(self.repo, ["web"])
        self.edit(f"{SRC}/tsconfig.tsbuildinfo", "{}")
        self.assertEqual(gate.unverified(self.repo), [])

    def test_failed_check_leaves_area_unverified(self):
        gate.AREAS["web"] = ([SRC], [(".", FAIL)])
        self.edit()
        self.assertFalse(gate.verify(self.repo, ["web"]))
        self.assertEqual(gate.unverified(self.repo), ["web"])

    def test_missing_tool_fails_instead_of_crashing(self):
        gate.AREAS["web"] = ([SRC], [(".", ["no-such-tool-xyz"])])
        self.edit()
        self.assertFalse(gate.verify(self.repo, ["web"]))

    # The guard runs in a subprocess with the real AREAS; apps/desktop/src is a real web path.
    def test_guard_blocks_commit_with_unverified_web(self):
        self.edit()
        sh(self.repo, "git", "add", f"{SRC}/a.ts")
        self.assertIn("web", commit_decision(self.repo))

    def test_guard_ignores_unstaged_areas_unless_commit_all(self):
        self.edit()
        self.edit("README.md", "changed\n")
        sh(self.repo, "git", "add", "README.md")
        self.assertIsNone(commit_decision(self.repo))
        self.assertIn("web", commit_decision(self.repo, "git commit -am x"))
        self.assertIn("web", commit_decision(self.repo, "git commit --all -m x"))

    def test_guard_blocks_powershell_herestring_commit(self):
        self.edit()
        sh(self.repo, "git", "add", f"{SRC}/a.ts")
        command = "git commit -m @'\nSubject\n\nBody with $dollar and 'quote\n'@"
        self.assertIn("web", commit_decision(self.repo, command))

    def test_guard_allows_commit_of_docs_only(self):
        self.edit("README.md", "changed\n")
        self.assertIsNone(commit_decision(self.repo))


class VersionsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self.tmp.name)
        tauri = self.root / gate.TAURI
        tauri.mkdir(parents=True)
        (self.root / gate.DESKTOP / "package.json").write_text('{"version": "1.2.3"}')
        (tauri / "tauri.conf.json").write_text('{"version": "1.2.3"}')
        (tauri / "Cargo.toml").write_text(
            '[package]\nname = "app"\nauthors = ["x"]\nversion = "1.2.3"\n'
        )
        (tauri / "Cargo.lock").write_text(
            'version = 4\n\n[[package]]\nname = "dep"\nversion = "9.9.9"\n\n'
            '[[package]]\nname = "app"\nversion = "1.2.3"\n'
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_matching_versions_pass(self):
        self.assertEqual(gate.check_versions(self.root), 0)

    def test_one_stale_version_fails(self):
        (self.root / gate.TAURI / "tauri.conf.json").write_text('{"version": "1.2.2"}')
        self.assertEqual(gate.check_versions(self.root), 1)

    def test_lock_without_the_package_fails(self):
        (self.root / gate.TAURI / "Cargo.lock").write_text('version = 4\n')
        self.assertEqual(gate.check_versions(self.root), 1)


if __name__ == "__main__":
    unittest.main()

"""Run with: python3 -m unittest discover -s .claude/hooks"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("guard_write.py")
MIGRATIONS = "apps/desktop/src-tauri/src/db/migrations"


def sh(cwd, *args):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


class GuardWriteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = Path(self.tmp.name)
        sh(self.repo, "git", "init", "-q")
        sh(self.repo, "git", "config", "user.email", "t@t")
        sh(self.repo, "git", "config", "user.name", "t")
        (self.repo / MIGRATIONS).mkdir(parents=True)
        (self.repo / MIGRATIONS / "0001_initial.sql").write_text("CREATE TABLE IF NOT EXISTS a (x);\n")
        sh(self.repo, "git", "add", ".")
        sh(self.repo, "git", "commit", "-qm", "init")

    def tearDown(self):
        self.tmp.cleanup()

    def decision(self, file_path):
        out = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps({"cwd": str(self.repo), "tool_name": "Edit",
                              "tool_input": {"file_path": file_path}}),
            capture_output=True, text=True, check=True,
        ).stdout
        return json.loads(out)["hookSpecificOutput"] if out else None

    def test_committed_migration_asks(self):
        hook = self.decision(f"{MIGRATIONS}/0001_initial.sql")
        self.assertEqual(hook["permissionDecision"], "ask")
        self.assertIn("ensure_table_column", hook["permissionDecisionReason"])

    def test_absolute_path_to_committed_migration_asks(self):
        self.assertIsNotNone(self.decision(str(self.repo / MIGRATIONS / "0001_initial.sql")))

    def test_new_migration_passes(self):
        self.assertIsNone(self.decision(f"{MIGRATIONS}/0002_next.sql"))

    def test_other_files_pass(self):
        self.assertIsNone(self.decision("apps/desktop/src-tauri/src/services/storage.rs"))


if __name__ == "__main__":
    unittest.main()

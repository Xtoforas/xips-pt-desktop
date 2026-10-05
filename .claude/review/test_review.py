"""Run with: python3 -m unittest discover -s .claude/review"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import review  # noqa: E402

CMD = "apps/desktop/src-tauri/src/commands/desktop.rs"
DIFF = f"""\
diff --git a/{CMD} b/{CMD}
--- a/{CMD}
+++ b/{CMD}
@@ -10,3 +10,4 @@ pub fn desktop_get_snapshot() {{
 let a = 1;
-let b = 2;
+let b = 3;
+let c = 4;
 let d = 5;
diff --git a/docs/notes.md b/docs/notes.md
--- a/docs/notes.md
+++ b/docs/notes.md
@@ -1 +1 @@
-x
+y
diff --git a/apps/desktop/src/app/pages/history.tsx b/apps/desktop/src/app/pages/history.tsx
--- a/apps/desktop/src/app/pages/history.tsx
+++ /dev/null
@@ -1 +0,0 @@
-gone
"""

PAGE = "apps/desktop/src/app/pages/queue.tsx"
PAGE_DIFF = f"""\
diff --git a/{PAGE} b/{PAGE}
--- a/{PAGE}
+++ b/{PAGE}
@@ -1,1 +1,2 @@
 a
+b
"""


def finding(**kw):
    base = {"file": CMD, "line": 11, "severity": "high",
            "confidence": 0.9, "claim": "b is wrong", "evidence": "let b = 3"}
    return {**base, **kw}


class ReviewTest(unittest.TestCase):
    def test_parse_diff_tracks_added_new_line_numbers_and_drops_deletions(self):
        files = review.parse_diff(DIFF)
        self.assertEqual(set(files), {CMD, "docs/notes.md"})
        self.assertEqual(files[CMD].added, {11, 12})

    def test_route_skips_docs_and_gates_on_size(self):
        plan, notes = review.route(review.parse_diff(DIFF), None)
        # 2 changed lines: security (min 1) runs; correctness (20) and perf (5) do not
        self.assertEqual(set(plan), {"security"})
        self.assertTrue(any(n.startswith("correctness: skipped") for n in notes))
        self.assertTrue(any(n.startswith("perf: skipped") for n in notes))

    def test_route_explicit_lanes_bypass_size_gate(self):
        plan, _ = review.route(review.parse_diff(DIFF), ["correctness"])
        self.assertEqual(set(plan), {"correctness"})

    def test_route_sends_schema_scanner_and_contract_to_upload_lane(self):
        for path in ("apps/desktop/src-tauri/src/db/migrations/0001_initial.sql",
                     "apps/desktop/src-tauri/src/services/scanner.rs",
                     "packages/api-contract/desktop-contract.openapi.json",
                     "packages/api-contract/src/types.ts"):
            with self.subTest(path=path):
                diff = PAGE_DIFF.replace(PAGE, path)
                self.assertIn("upload", review.route(review.parse_diff(diff), None)[0])

    def test_route_sends_capabilities_and_workflows_to_security_lane(self):
        for path in ("apps/desktop/src-tauri/capabilities/default.json",
                     "apps/desktop/src-tauri/tauri.conf.json",
                     ".github/workflows/build-desktop.yml"):
            with self.subTest(path=path):
                diff = PAGE_DIFF.replace(PAGE, path)
                self.assertEqual(set(review.route(review.parse_diff(diff), None)[0]), {"security"})

    def test_generated_and_lock_files_are_not_routed(self):
        for path in ("apps/desktop/src-tauri/Cargo.lock", "package-lock.json",
                     "apps/desktop/src-tauri/gen/schemas/desktop-schema.json"):
            with self.subTest(path=path):
                diff = PAGE_DIFF.replace(PAGE, path)
                self.assertEqual(review.route(review.parse_diff(diff), None)[0], {})

    def test_tests_are_not_routed(self):
        for path in ("apps/desktop/src/app/queue-model.test.ts",
                     "apps/desktop/src/contract/desktop-contract.contract-test.ts"):
            with self.subTest(path=path):
                diff = PAGE_DIFF.replace(PAGE, path)
                self.assertEqual(review.route(review.parse_diff(diff), None, ("render",))[0], {})

    def test_validate_enforces_schema_and_changed_lines(self):
        picked = [review.parse_diff(DIFF)[CMD]]
        kept, dropped = review.validate("perf", [
            finding(),
            finding(line=40),
            finding(file="apps/desktop/src-tauri/src/main.rs"),
            finding(severity="critical"),
            finding(confidence=3),
            "junk",
        ], picked)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["lane"], "perf")
        self.assertEqual(len(kept[0]["id"]), 8)
        self.assertEqual(len(dropped), 5)

    def test_validate_accepts_quoted_confidence(self):
        picked = [review.parse_diff(DIFF)[CMD]]
        kept, dropped = review.validate("perf", [finding(confidence="0.55"), finding(confidence="high")], picked)
        self.assertEqual([f["confidence"] for f in kept], [0.55])
        self.assertEqual(len(dropped), 1)

    def test_dedup_merges_same_spot_similar_claim_and_applies_threshold(self):
        a = {**finding(claim="command returns full desktop snapshot per call"), "lane": "perf", "id": "a"}
        b = {**finding(line=12, confidence=0.7, claim="full desktop snapshot returned per call by command"),
             "lane": "correctness", "id": "b"}
        c = {**finding(line=12, claim="SQL built with format! from renderer input"), "lane": "security", "id": "c"}
        low = {**finding(confidence=0.2, claim="meh"), "lane": "perf", "id": "d"}
        out, below = review.dedup([a, b, c, low], 0.5)
        self.assertEqual([f["id"] for f in out], ["a", "c"])
        self.assertEqual(out[0]["also_lanes"], ["correctness"])
        self.assertEqual(below, 1)

    def test_extract_array_tolerates_prose_and_fences(self):
        self.assertEqual(review.extract_array("[]"), [])
        self.assertEqual(review.extract_array('Findings:\n```json\n[{"a": 1}]\n```'), [{"a": 1}])

    def test_render_lane_is_opt_in_and_does_not_disable_size_gate(self):
        files = review.parse_diff(PAGE_DIFF)
        self.assertNotIn("render", review.route(files, None)[0])
        plan, notes = review.route(files, None, ("render",))
        self.assertEqual(set(plan), {"render"})
        self.assertTrue(any(n.startswith("correctness: skipped") for n in notes))

    def test_render_findings_need_changed_file_not_changed_line(self):
        picked = [review.parse_diff(PAGE_DIFF)[PAGE]]
        item = finding(file=PAGE, line=300)
        self.assertEqual(len(review.validate("render", [item], picked)[0]), 1)
        self.assertEqual(len(review.validate("correctness", [item], picked)[0]), 0)

    def test_every_lane_has_an_agent(self):
        agents = Path(__file__).resolve().parents[1] / "agents"
        for lane in review.LANES:
            self.assertTrue((agents / f"review-{lane}.md").exists(), lane)

    def test_rules_sections_exist_in_claude_md(self):
        root = Path(__file__).resolve().parents[2]
        text = (root / review.RULES_FILE).read_text(encoding="utf-8")
        for spec in review.LANES.values():
            if spec.get("rules"):
                self.assertIn(f"## {spec['rules']}\n", text)


if __name__ == "__main__":
    unittest.main()

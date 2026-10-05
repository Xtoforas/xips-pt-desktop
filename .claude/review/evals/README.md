# Review eval set

`findings.jsonl`: one review finding per line, with the human decision on it.

This repo is public, and `review.py label` appends to a tracked file. Label a security finding only after its fix is pushed, or the label publishes an open vulnerability.

- `outcome`: `accept` (real, worth fixing), `reject` (wrong or not worth it), `deferred` (real, not acted on yet)
- `source`: `history` rows were mined on 2026-10-04 from fix commits in this repo's git history (`fix_commit`); `pipeline` rows come from `review.py label`
- `found_by` (history rows): `unknown`, because the commits don't record whether a review or a user caught the bug. Each one is a miss that the named lane should catch now
- `history` rows have no `line` and are not diff-anchored. Use them to check lane coverage (does the lane prompt ask for this kind of issue?), not to replay a lane against the original diff

Not included: `8ab343b`, where Tauri's `beforeDevCommand` ran from the wrong directory on Windows. No lane owns build tooling config.

Per-lane precision needs `pipeline` rows, roughly 50 labels before it means anything.

## When to read what

| Path | When to read |
|------|--------------|
| `README.md` | Cutting a release, updater signing, Windows builds |
| `plan.md` | Before starting any implementation task |

## Verification gate

`git commit` is blocked while staged changes touch an area that hasn't passed its check (`-a` counts all tracked changes). Run the check for the named areas, then commit:

```bash
python3 .claude/hooks/gate.py verify [web|native|version ...]   # no args: all dirty areas
```

- `web`: `npm run typecheck`, `npm test`, `npm run build` (renderer, packages, root npm and tsconfig files)
- `native`: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `version`: the app version matches across `apps/desktop/package.json`, `Cargo.toml`, `Cargo.lock`, and `tauri.conf.json`

Pushing a `v*` tag, changing a GitHub release, and `tauri signer generate` always prompt first: each one reaches installed apps through the auto-updater.

The hooks need Python 3.11+; `.claude/hooks/run.sh` uses `python3` or `python`, whichever works, and skips the hooks if neither does. Commands here say `python3`; on Windows, `python` works too.

Hook tests: `python3 -m unittest discover -s .claude/hooks` and `-s .claude/review`.

## Agent tooling

- Before a subagent edits code, declare its scope: `python3 .claude/hooks/write_scope.py set '<glob>' ...`; run `clear` when done. This only covers Edit/Write tools, not Bash writes.
- Pre-push review: `python3 .claude/review/review.py run [--base REF] [--render]`, then `review.py label <id> accept|reject` so the eval set grows. The diff is base vs working tree; keep the base recent or lanes skip on size. `--render` needs `npm run dev --workspace @xips/desktop` running.
- Headless review lanes set `XIPS_REVIEW_LANE=1`; hooks that shouldn't run inside a lane must check it.

## Fat and thin agents

The top-level session is the fat agent when it runs on Opus or Fable. It plans, makes the judgment calls, verifies, and owns git. Thin agents on cheaper models do the execution. Sonnet or Haiku top-level sessions, and subagents of any model, work directly.

- Set the model explicitly on every Agent call; an omitted model inherits the session's. `haiku` for mechanical bulk work (renames, boilerplate, format conversion, log triage). `sonnet` for well-specified implementation with clear acceptance criteria; this is the default and what the `implementer` agent runs on. `opus` for concurrency, subtle algorithms, gnarly debugging, or judge panels. `fable` only after asking the user. When unsure, pick the cheaper tier and escalate if it fails.
- Act directly when the work is reading or answering, a change of roughly 30 lines across 1-2 files, a fix inside a review loop you already hold, a task whose brief would cost more than the change, or any git operation.
- Delegate to `implementer` when implementation spans 3+ files, is mechanical, or splits by file into independent pieces. Prefer one agent with a complete brief over many fragments. Run agents in parallel only when their files don't overlap.
- Thin agents see none of the conversation, so every brief is self-contained: exact paths, the change, acceptance criteria, the gate command (`python3 .claude/hooks/gate.py verify <area>`), and "do not commit; the parent session owns commits". Set the write scope before delegating and clear it afterwards.
- Never accept a thin agent's self-report. Read the diff, run the gate, check the acceptance criteria, then commit.

## Commits

Commit each work item as soon as it is done; this is standing authorization, so don't wait for approval per commit. One work item per commit, staged by path (`git add <paths>`, never `git add .`), with the message `<type>: <what changed>`, where type is `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, or `style`. Split a change that touches several concerns into sequential commits, and give each commit's own content a passing gate before committing it. Never push unless the user asks.

## Frontend Rules

- Every page must stay usable at the minimum window size, 1100x760, as well as the 1440x960 default (`tauri.conf.json`): text fully visible, truncated on purpose, or wrapped cleanly, with no page-level horizontal scroll.
- Keep blockers visible without scrolling, and always distinguish work waiting on the user from work progressing automatically.
- Keep the browser mock client in `desktop-client.ts` in step with the Tauri client so `npm run dev` renders every page.

## Security Rules

- Sign-in stays pairing-code based: the auth window only displays server-rendered pages. Never inject JavaScript into it or read its cookies.
- Keep the CSP in `tauri.conf.json` strict and the capabilities minimal; widen either only for a named feature.
- Every `reqwest` client has a timeout.
- Access tokens and pairing codes never appear in logs, diagnostic events, URLs, or UI error text.
- The updater private key never enters the repo or CI logs. A new `pubkey` must first ship in a release signed by the old key.

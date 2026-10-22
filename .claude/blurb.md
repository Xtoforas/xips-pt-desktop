# /blurb config — xips-pt-desktop

**Product**: XiPS Desktop, the desktop app that uploads OOTP Perfect Team tournament and league stats exports to XiPS. Audience: PT players in Discord.

**Header**: `📊 **XiPS Desktop v<version> — <Month D, YYYY>**`

**Live check**: Users only get what ships in a GitHub release, so end the range at the latest `v*` tag (`git describe --tags --abbrev=0`), not `HEAD`. If commits since the last blurb haven't been tagged yet, ask whether to cut a release first.

**Visibility**: no gated features to account for.

**Sections**: Setup, Uploads, Today & Queue, Automation & Settings, Look & feel.

**Vocabulary**:
- OK: export folder, watched folders, filename rules, formats, tournament ID, league exports, Today, Queue, blocked files.
- Avoid: "watch roots", profiles, snapshots, job states like `needs_format`, contract, renderer, Rust/Tauri, mock client, format IDs.

**Extra rules**:
- Open with one sentence, and tell already-installed users the app offers the update the next time it starts.
- End with `Download: https://github.com/Xtoforas/xips-pt-desktop/releases/tag/<tag>`.
- Also internal: `.claude/` hooks and review lanes, the Windows build-from-source helper, release workflow and signing.
- Once it's posted, offer to set the same bullets as the GitHub release notes (`gh release edit <tag> --notes-file`): `###` headings instead of bold labels, no header or download line, and keep GitHub's **Full Changelog** compare link at the end.

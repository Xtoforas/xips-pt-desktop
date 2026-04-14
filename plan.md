# xips-pt-desktop Redesign Sprint Plan

Previous implementation planning work has been archived to [docs/implementation-plan-archive.md](docs/implementation-plan-archive.md).

## Sprint goal

Refactor the desktop app from a general-purpose admin dashboard into a clearer operator workflow that answers one question quickly on every screen: what needs me right now?

## Sprint outcome

By the end of this sprint, the app should:

- make first-run setup understandable without hiding the rest of the product
- make blocked work immediately visible from the landing page
- make the upload queue default to actionable work when blockers exist
- move queue recovery controls into a persistent, obvious inspection surface
- unify watch-folder and format-assignment setup into a single automation workflow
- reduce navigation weight for support-only surfaces like diagnostics

## Design direction

Use a "control room" interaction model:

- calm, dense, operational UI
- one unmistakable priority lane for blockers
- plain-language status labels that separate waiting for user input from background work
- a stronger visual hierarchy than the current equal-weight card grid

## Sprint scope

### 1. Information architecture and shell

- [ ] Replace `Overview` with a new `Today` page focused on readiness, blockers, active uploads, and recent completions.
- [ ] Update the primary navigation to reflect the new top-level workflow: `Today`, `Queue`, `Automation`, `Settings`, `Diagnostics`.
- [ ] Remove `Formats` as a top-level destination and fold its operational purpose into `Automation`.
- [ ] Demote `Diagnostics` visually so it reads as support tooling rather than a first-line workflow page.

### 2. Onboarding redesign

- [ ] Replace the current hard onboarding gate with a persistent setup checklist that keeps the app shell visible.
- [ ] Present first-run setup as a clear sequence: server, health check, sign-in, watch folder, automation rule.
- [ ] Show setup progress and current state in plain language, not just technical status badges.
- [ ] Keep setup actions accessible from `Today` until the app is operational.
- [ ] Add guidance that explains what becomes available after sign-in and after watch-folder setup.
- [ ] Make incomplete setup states deep-link to the correct destination and action surface.

### 3. Today page redesign

- [ ] Replace the current metric-card-first overview with a prioritized landing page.
- [ ] Add a top readiness strip for server, auth, watch-folder coverage, and automation-rule status.
- [ ] Add a prominent `Needs attention` section with one card per blocked file and direct CTA buttons.
- [ ] Add an `In progress` section for work that is advancing automatically.
- [ ] Add a compact `Recently completed` section instead of another dense queue table.
- [ ] Make every blocker CTA deep-link to the queue in the right filtered and selected state.

### 4. Queue workspace redesign

- [ ] Split the queue into explicit views for `Needs Action`, `Working`, and `Done`.
- [ ] Default to `Needs Action` whenever blocked jobs exist.
- [ ] Replace the below-the-fold detail experience with a sticky side inspector or equivalent always-visible action panel.
- [ ] Make `awaiting_format_assignment` rows open directly into assignment controls without scroll hunting.
- [ ] Make `failed_retryable` rows show the error summary and the retry action in the primary action area.
- [ ] Make `auth_blocked` rows show re-auth guidance and explain that the queue will resume automatically after successful auth.
- [ ] Keep dense operational scanning for advanced users without burying the fix surface.

### 5. Automation workflow redesign

- [ ] Merge `Watch Folders` and `Formats` into a single `Automation` page.
- [ ] Present automation setup as a guided flow: watch folder, rule, format match, validation.
- [ ] Keep direct access to saved watch roots and rules for experienced users.
- [ ] Reuse the existing auto-assignment explanation logic to explain why a file did not match automatically.
- [ ] Make the relationship between a watch folder, a filename rule, and a format visually obvious.

### 6. Settings and diagnostics cleanup

- [ ] Move routine operational controls out of `Settings` when they belong on `Today` or `Automation`.
- [ ] Keep server profile and desktop behavior controls in `Settings`.
- [ ] Simplify `Diagnostics` visually while preserving current troubleshooting depth.
- [ ] Preserve access to diagnostic export and app-data actions.

### 7. Visual system refresh

- [ ] Refresh the shell and page hierarchy to support the redesigned workflow.
- [ ] Introduce a stronger status-color system for healthy, caution, blocked, and background-processing states.
- [ ] Reduce repeated all-caps metadata styling where plain-language labels improve clarity.
- [ ] Use a more distinctive heading treatment while keeping dense technical data readable.
- [ ] Improve spacing, grouping, and contrast so blocker actions stand out immediately.

## Implementation order

1. Rework routes, nav, and shell framing for the new information architecture.
2. Replace the hard onboarding gate with the new persistent setup checklist and readiness model.
3. Build the `Today` page and blocker CTA model.
4. Refactor the queue into action-first workflow states and a persistent inspector.
5. Merge watch-folder and format setup into `Automation`.
6. Simplify `Settings` and reposition `Diagnostics`.
7. Apply final visual-system polish and copy cleanup across the flow.

## Acceptance criteria

- [ ] A user can understand what `Needs action` means within a few seconds of landing in the app.
- [ ] A first-run user can understand the setup sequence without losing visibility into the rest of the product.
- [ ] Incomplete setup states always point to the next required action.
- [ ] A blocked file can be resolved without hunting below the fold for controls.
- [ ] The UI always distinguishes between work waiting on the user and work progressing automatically.
- [ ] Setup and automation configuration read as one coherent workflow rather than separate tools.
- [ ] Support tooling remains available without competing with the main operator flow.

## Validation plan

- [ ] Verify navigation and deep links across all redesigned surfaces.
- [ ] Verify first-run onboarding flow for server setup, health check, sign-in, watch-folder setup, and automation guidance.
- [ ] Verify the blocked-state flows for `awaiting_format_assignment`, `failed_retryable`, and `auth_blocked`.
- [ ] Verify that auth recovery returns blocked jobs to an active queue state.
- [ ] Verify responsive behavior for the redesigned shell on desktop and smaller laptop widths.
- [ ] Run the desktop frontend test/build workflow after implementation changes land.

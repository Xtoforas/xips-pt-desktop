# xips-pt-desktop Redesign Sprint Plan

Previous implementation planning work has been archived to [docs/implementation-plan-archive.md](docs/implementation-plan-archive.md).

Detailed phase plans live in:

- [Phase 1: Information Architecture and Shell](docs/redesign-sprint/phase-1-information-architecture-and-shell.md)
- [Phase 2: Onboarding Redesign](docs/redesign-sprint/phase-2-onboarding-redesign.md)
- [Phase 3: Today Page Redesign](docs/redesign-sprint/phase-3-today-page-redesign.md)
- [Phase 4: Queue Workspace Redesign](docs/redesign-sprint/phase-4-queue-workspace-redesign.md)
- [Phase 5: Automation Workflow Redesign](docs/redesign-sprint/phase-5-automation-workflow-redesign.md)
- [Phase 6: Settings and Diagnostics Cleanup](docs/redesign-sprint/phase-6-settings-and-diagnostics-cleanup.md)
- [Phase 7: Visual System Refresh](docs/redesign-sprint/phase-7-visual-system-refresh.md)

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

### Phase status

- [ ] Phase 1: Information architecture and shell
- [ ] Phase 2: Onboarding redesign
- [ ] Phase 3: Today page redesign
- [ ] Phase 4: Queue workspace redesign
- [ ] Phase 5: Automation workflow redesign
- [ ] Phase 6: Settings and diagnostics cleanup
- [ ] Phase 7: Visual system refresh

Phase details, deliverables, dependencies, and validation notes are tracked in the linked subdocuments above.

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

# Phase 4: Queue Workspace Redesign

## Goal

Make the queue a fast-resolution workspace where the actionable fix surface is always obvious.

## Scope

- [ ] Split the queue into explicit views for `Needs Action`, `Working`, and `Done`.
- [ ] Default to `Needs Action` whenever blocked jobs exist.
- [ ] Replace the below-the-fold detail experience with a sticky side inspector or equivalent always-visible action panel.
- [ ] Make `awaiting_format_assignment` rows open directly into assignment controls without scroll hunting.
- [ ] Make `failed_retryable` rows show the error summary and the retry action in the primary action area.
- [ ] Make `auth_blocked` rows show re-auth guidance and explain that the queue will resume automatically after successful auth.
- [ ] Keep dense operational scanning for advanced users without burying the fix surface.

## Deliverables

- New queue state tabs or segmented views.
- Persistent inspector for selected-row actions and detail.
- Revised queue copy for blocked states and automatic states.
- Clear row highlighting and state treatments for actionable items.

## Dependencies

- Depends on [Phase 1](phase-1-information-architecture-and-shell.md).
- Should integrate with [Phase 3](phase-3-today-page-redesign.md) blocker deep links.

## Validation

- [ ] Verify blocked-state flows for `awaiting_format_assignment`, `failed_retryable`, and `auth_blocked`.
- [ ] Verify a blocked file can be resolved without scrolling to hunt for controls.
- [ ] Verify auth recovery returns blocked jobs to an active queue state.

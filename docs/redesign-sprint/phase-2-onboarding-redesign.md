# Phase 2: Onboarding Redesign

## Goal

Replace the current hard gate with a first-run setup experience that keeps the rest of the product legible while still directing the user to the next required action.

## Scope

- [ ] Replace the current hard onboarding gate with a persistent setup checklist that keeps the app shell visible.
- [ ] Present first-run setup as a clear sequence: server, health check, sign-in, watch folder, automation rule.
- [ ] Show setup progress and current state in plain language, not just technical status badges.
- [ ] Keep setup actions accessible from `Today` until the app is operational.
- [ ] Add guidance that explains what becomes available after sign-in and after watch-folder setup.
- [ ] Make incomplete setup states deep-link to the correct destination and action surface.

## Deliverables

- Persistent readiness checklist or onboarding rail.
- First-run copy for each setup step.
- Deep links from incomplete setup states into the relevant page/action.
- A setup-complete state that gracefully hands off to normal operation.

## Dependencies

- Depends on [Phase 1](phase-1-information-architecture-and-shell.md) for the updated shell and destination model.

## Validation

- [ ] Verify server setup, health check, sign-in, watch-folder setup, and automation guidance flows.
- [ ] Verify a first-run user can see the app structure without losing the next-step prompt.
- [ ] Verify completion of each setup step updates readiness state correctly.

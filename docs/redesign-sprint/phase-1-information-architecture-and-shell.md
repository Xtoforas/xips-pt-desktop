# Phase 1: Information Architecture and Shell

## Goal

Refactor the top-level app structure so the product reads as an operator workflow instead of a generic admin dashboard.

## Scope

- [ ] Replace `Overview` with a new `Today` destination focused on readiness, blockers, active uploads, and recent completions.
- [ ] Update the primary navigation to the new top-level workflow: `Today`, `Queue`, `Automation`, `Settings`, `Diagnostics`.
- [ ] Remove `Formats` as a top-level destination and fold its operational purpose into `Automation`.
- [ ] Demote `Diagnostics` visually so it reads as support tooling rather than a first-line workflow page.

## Deliverables

- Updated route map in the desktop shell.
- Updated primary navigation and selected-state treatment.
- Shell copy that reflects the new workflow language.
- Any required redirects or route aliases from older destinations.

## Dependencies

- None. This phase establishes the structure the rest of the redesign will use.

## Validation

- [ ] Verify route changes and navigation state across every top-level destination.
- [ ] Verify older links or assumptions do not strand the user on removed top-level flows.

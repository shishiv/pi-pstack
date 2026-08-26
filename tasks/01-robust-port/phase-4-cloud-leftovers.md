# Phase 4. Remove control-ui and cloud spawn leftover

Back to [overview](overview.md).

## Goal

Playbooks that survived the denylist still name Cursor cloud and `control-ui`. They name the project `verify-*` skill and Pi `worktree` instead.

## Changes

- `skills/poteto-mode/playbooks/opening-a-pr.md`. Verification examples name the project verify skill, Playwright, or the targeted tests. Drop `control-cli` and `control-ui`. Drop "Cloud-agent PR tools default to draft" unless it is restated as Benny draft-only via `pstack_delivery`.
- `skills/poteto-mode/playbooks/orchestrate.md`. Nested spawn fields match `src/workflows/delegation.ts` (`agent`, `task`, `worktree`). Drop `environment`, "cloud spawns", "cloud work is not dead after a Pi restart", and "the loop skill". Drain uses `subagent_wait` or Pi schedules.

Add `control-ui`, `control-cli`, and `/loop` as already banned. Add `environment` only if it does not false-positive on JSON keys in other files. Prefer banning the exact orchestrate phrases.

## Data structures

No new types. Spawn params stay the `runs.run` field set already emitted by `buildSingleChildWorkflowScript`.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** Resource test. `rg "control-ui|control-cli|cloud spawns" skills/poteto-mode/playbooks` returns no matches.

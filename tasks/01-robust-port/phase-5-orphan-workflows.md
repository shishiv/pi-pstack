# Phase 5. Delete unused workflow modules

Back to [overview](overview.md).

## Goal

`src/workflows` on disk matches the package export. Only `delegation.ts` remains. Session discovery, wake planning, and MCP evidence mapping leave with their tests.

## Changes

- Delete `src/workflows/wake.ts`.
- Delete `src/workflows/evidence.ts`.
- Delete `src/workflows/sessions.ts`.
- `test/workflows/workflows.test.mjs`. Keep tests for `ROLE_TO_AGENT` and the `workflowScript` builders. Drop `discoverSessionFiles`, `planLongRunWake`, and `mapEvidenceSources` cases.

Do not add tools that call those modules. Sticky mode already uses `src/runtime/session.ts`. Benny already hardcodes `polling: "schedule-wake"`. Receipts already use `src/delivery/evidence.ts`.

Four paths change. They are one deletion. No new behavior.

## Data structures

None added. `ROLE_TO_AGENT` stays the table in `delegation.ts`.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** `rg "discoverSessionFiles|planLongRunWake|mapEvidenceSources" src test` returns no matches. `package.json` `exports["./workflows"]` still points at `delegation.ts` and typecheck passes.

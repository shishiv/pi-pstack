# Phase 6. Delete unused delivery barrels

Back to [overview](overview.md).

## Goal

`src/delivery/index.ts` is the only public barrel. Duplicate re-export files go away.

## Changes

- Delete `src/delivery/backend.ts`.
- Delete `src/delivery/gh-stack.ts`.
- Delete `src/delivery/graphite.ts`.

`index.ts` already re-exports `types`, `adapters`, `authorization`, and `evidence`. Callers that imported the deleted paths do not exist. Confirm with grep before delete. Remove dual-name aliases only if they have zero importers (`GhStackAdapter`, `createGhStackBackend`, `canDeliver` can wait unless grep is clean).

## Data structures

None. `GhStackBackend` and `GraphiteBackend` stay in `adapters.ts`.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** `rg "delivery/backend|delivery/gh-stack|delivery/graphite" .` returns no matches outside this plan.

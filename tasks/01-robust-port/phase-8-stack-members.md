# Phase 8. Give StackBackend an ordered member list

Back to [overview](overview.md).

## Goal

Stack membership is a type on `StackBackend`, not a JSON walk in the extension. Graphite auto-merge leaves the adapter. Inspect for Graphite may return an empty member list. That is honest.

## Changes

- `src/delivery/types.ts`. Add ordered stack members. `StackSnapshot` carries that list. `StackOperation` auto-merge keeps a pull request number. Remove Graphite auto-merge from the union if the only remaining auto-merge backend is gh-stack. Prefer a backend-specific operation over an optional no-op.
- `src/delivery/adapters.ts`. `stackFields` fills the member list from `gh stack view --json` using the same single-chain rules the extension uses today. Move that parse next to the adapter. Graphite `argv` drops the `auto-merge` case. Graphite inspect does not pretend `gt log` is JSON.
- `test/delivery/delivery.test.mjs`. Assert gh-stack inspect returns ordered PR and SHA pairs. Assert Graphite inspect does not invent a `headSha` from non-JSON stdout. Assert Graphite auto-merge is not an argv the adapter can emit.

Run `/skill:how` on `src/delivery` first. Run `/skill:interrogate` on the membership type before the PR.

## Data structures

`StackMember` is `{ pullRequest: string, headSha: string, baseSha: string }`. `StackSnapshot.members` is `readonly StackMember[]` in parent-first order. Empty list means inspect could not prove a chain.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** Delivery unit tests with fake `CommandRunner`. No live `gh stack` required in this phase.

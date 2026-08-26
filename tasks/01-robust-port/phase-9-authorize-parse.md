# Phase 9. Put merge policy in authorizeDelivery and parse receipts

Back to [overview](overview.md).

## Goal

`authorizeDelivery` refuses Graphite auto-merge. The extension does not re-parse stack JSON. `loadEvidenceReceipt` returns a validated `EvidenceReceipt` or throws.

## Changes

- `src/delivery/authorization.ts`. Refuse `backend: "graphite"` at level `auto-merge`. Keep Benny origin draft-only. Do not inspect a stack here. Membership stays on the snapshot the caller passes if the signature needs it. Smallest change. Add an optional `members` check only if auto-merge authorization must see the chain. Otherwise the extension still matches receipts to `inspect().members` after `authorizeDelivery` returns allowed.
- `extensions/poteto-mode.ts`. Auto-merge calls `backend.inspect()`, then requires a receipt per member through the target PR. Delete `stackPullRequestsThrough` from the extension if the adapter now owns that parse. Keep live `gh pr view` checks. They are host I/O, not stack topology.
- `src/delivery/evidence.ts`. `loadEvidenceReceipt` runs `validateEvidenceReceipt` after `JSON.parse`. Drop `as EvidenceReceipt`. Reject before callers index `headSha`.

Three files. Runtime tests in `test/runtime/runtime.test.mjs` and `test/delivery/evidence.test.mjs` count as verification, not extra product files.

## Data structures

`EvidenceReceipt` version 2 stays. Parse is `unknown -> EvidenceReceipt`. No dual summary fields are removed in this phase. Collapsing `independentReview` copies onto `reviewEvidence` is out of scope unless it fits in `evidence.ts` without touching authorization tests. Leave the copies if the diff would exceed this phase.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** Fake-gh auto-merge tests still reject missing receipts, forks, and stale heads. A new test loads a JSON object that is not a receipt and expects throw or a typed error. Graphite auto-merge is rejected by `authorizeDelivery` even if a caller skips the extension.

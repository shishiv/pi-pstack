# Robust port. Verification

Back to [overview](overview.md).

## Static, every phase

```bash
npm run verify:deterministic
```

That is format, lint, typecheck, `npm test`, and the package manifest check. It does not install Pi.

## Runtime, matching surface

| Phase | Surface | How to prove it |
| --- | --- | --- |
| 1 to 4 | Skills on disk | `node --test test/resources/resources.test.mjs`. The denylist is the lever. |
| 5 to 6 | TypeScript graph | `npm run typecheck`. Grep must show zero importers of the deleted files. |
| 7 | Feature map | Unit tests in `test/verification/verification.test.mjs`. Then one `pstack_create_verification` call in the fake runtime test. A skill-only `features/` tree must fail `parseFeatureMapMarkdown`. |
| 8 to 9 | Delivery | `node --test test/delivery/*.test.mjs test/runtime/runtime.test.mjs`. Auto-merge uses `inspect()` membership, not a second JSON walk. Graphite auto-merge is rejected by `authorizeDelivery`. `loadEvidenceReceipt` rejects a non-receipt JSON object. |
| 10 | Pi RPC | `node scripts/verify-runtime.mjs` if the machine has Pi. CI runs the same job only when the runner can install `pi`. |

There is no project `verify-*` control skill for the Pi CLI itself. The matching surface is `test/e2e/pi-rpc-e2e.mjs`. Flag that. Do not call a missing `control-cli`.

## Plan completion

```bash
npm run verify
```

Expect sticky `/poteto-mode` on, status, off on a real `pi --mode rpc` session, plus browser artifacts and delivery unit tests. Live model evals stay out. A real Benny Slack provider stays out.

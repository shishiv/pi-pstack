# Phase 10. Name the tools in shipping and prove sticky mode in CI if the runner can

Back to [overview](overview.md).

## Goal

Shipping tells the agent to mint a `VERIFIED` receipt with `pstack_create_receipt` and to mutate stacks only with `pstack_delivery`. CI runs the RPC e2e when the runner can install Pi. If it cannot, README stops implying `npm run verify:deterministic` is the full proof.

## Changes

- `skills/poteto-mode/playbooks/shipping.md`. Independent review writes `VERIFIED` on a line by itself, matching `parseReviewEvidence`. Steps call `pstack_create_receipt` then `pstack_delivery`. Keep `gh stack` as default and Graphite as optional. Do not tell the agent to run `gt submit --merge-when-ready`.
- `skills/poteto-mode/SKILL.md`. Pi runtime contract names the four tools. Delivery mutations go through `pstack_delivery` only.
- `.github/workflows/ci.yml` or `README.md`. Prefer a CI job that runs `scripts/verify-runtime.mjs` after installing Pi the same way `verify-package.mjs` does. If the GitHub runner cannot run `pi`, do not fake it. Change README "Desenvolvimento e prova" so `verify:deterministic` is named the lint suite and `npm run verify` is named the Pi suite.

Experience first. The operator who trusts a green PR should know what that green covers.

## Data structures

None. Tool names are string literals already registered in `extensions/poteto-mode.ts`.

## Verification

**Static.** `npm run verify:deterministic`. Resource test still matches `gh stack` and `Graphite` in shipping.

**Runtime.** `node scripts/verify-runtime.mjs` on a machine with Pi. Sticky on, status, off. If CI gained that job, the next PR to `main` must show the job green on the exact head.

# How to make the Pi port one product

The plan is the deliverable. Do not implement until the operator says go.

## Context

The operator and the next maintainer follow skills. The extension enforces tools, receipts, and `gh stack`. Those two manuals disagree. A generated `features/` map cannot mint a receipt. `authorizeDelivery` is not the merge gate. CI green is lint. The host contract is already Pi-native. Robustness means one map, one stack type, one gate, and a grep that fails on Cursor leftovers.

## Scope

Included:

- One `FeatureMap` on disk, in the tool, and in the skills.
- One ordered stack membership type behind `StackBackend.inspect`.
- `authorizeDelivery` as the complete mutation policy. The extension calls it. Graphite auto-merge leaves the adapter until inspect can return a chain.
- `loadEvidenceReceipt` parses. It does not cast.
- Skills name `pstack_create_verification`, `pstack_create_receipt`, and `pstack_delivery`. Review verdict is `VERIFIED`.
- Delete unused `src/workflows/{sessions,wake,evidence}.ts` and unused delivery barrels.
- Expand `test/resources/resources.test.mjs` so leftovers cannot return.

Excluded:

- pbrain integration. That lives in `tasks/plan.md`.
- Upstream bump to pstack 0.14.3.
- Graphite stack-wide receipts. Drop adapter auto-merge. Do not invent a second parser.
- Changing empty `/poteto-mode` from status to enter-mode.
- Benny `Type.Any()`, ledger TTL, or a real Slack provider.
- Dual parsers for Cursor four-H2 maps.

## Constraints

- Pi `>=0.84.2`. No Cursor compatibility layer (`UPSTREAM.md`).
- Default backend remains `gh stack`. Graphite stays optional inspect, prepare, submit, sync, rebase.
- Skills stay English. Human docs stay Portuguese.
- Each phase is two or three files, plus its test file when the test is the check.
- `npm run verify:deterministic` stays green after every phase. Runtime RPC is the plan-completion check, not a phase-1 requirement.

## Alternatives

1. Edit skills only. Leaves two maps and a split gate. Rejected. The operator still cannot mint a receipt.
2. Accept both map formats at receipt time. Forbidden. That is a compatibility layer.
3. Subtract dead code, encode leftovers in the resource test, then make `FeatureMap` and stack membership the only shapes. Chosen. Deletion first. Types next. Callers migrate in the same wave as the old prose.

## Applicable skills

- `/skill:how` before changing `src/delivery` or `extensions/poteto-mode.ts`.
- `/skill:interrogate` on phases 8 and 9 before those PRs.
- `/skill:unslop` on every skill and playbook diff.
- Host skill-authoring workflow on every `SKILL.md` edit.
- `/skill:typescript-best-practices` on delivery types.
- `/skill:no-comments` before review of TypeScript diffs.

## Phases

1. [Fail the leftover grep, then fix how and no-comments](phase-1-grep-lever.md)
2. [Remove create-skill from automate-me and pstack-reflect](phase-2-create-skill.md)
3. [Fix $PI_SESSION_FILE sentences](phase-3-session-file.md)
4. [Remove control-ui and cloud spawn leftover](phase-4-cloud-leftovers.md)
5. [Delete unused workflow modules](phase-5-orphan-workflows.md)
6. [Delete unused delivery barrels](phase-6-delivery-barrels.md)
7. [Make FeatureMap the only verification map](phase-7-one-feature-map.md)
8. [Give StackBackend an ordered member list](phase-8-stack-members.md)
9. [Put merge policy in authorizeDelivery and parse receipts](phase-9-authorize-parse.md)
10. [Name the tools in shipping and prove sticky mode in CI if the runner can](phase-10-skill-tools-ci.md)

## Verification

Project checks after every phase:

```bash
npm run verify:deterministic
```

Plan completion:

```bash
npm run verify
```

That run includes `scripts/verify-runtime.mjs` (real `pi install` and sticky on, status, off). See [testing.md](testing.md).

## Implementation guidance

- Run `/skill:how` on delivery and the extension before phases 8 and 9.
- Run `/skill:interrogate` on the stack membership type before shipping phase 8.
- Run `/skill:unslop` on every prose diff before commit.
- Keep a local decision trail if the stack spans more than two PRs. Do not commit it unless the operator asks.
- After a PR exists, use the Babysit playbook only if the operator asks to watch it.

Stack PRs bottom-up. Phase 1 is the failing test plus the first two skill fixes so `main` never sits red. Later leftover phases go green against the same denylist.

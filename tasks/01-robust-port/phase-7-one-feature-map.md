# Phase 7. Make FeatureMap the only verification map

Back to [overview](overview.md).

## Goal

An agent that follows `/skill:create-verification-skill` produces the markdown `parseFeatureMapMarkdown` already accepts. `pstack_create_verification` is the writer. `maintain-verification-skill` locates `feature-map.md`, not `features/`.

## Changes

- `skills/create-verification-skill/SKILL.md`. Interview stays. Generate step calls `pstack_create_verification` with a structured `FeatureMap`. Drop Launch, Doctor, Drive as a second on-disk skill format. Drop `features/` and the four H2s. Keep "prove the generated skill once" against the stub plus the map.
- `skills/maintain-verification-skill/SKILL.md`. Edit `.pi/skills/verify-<app>/feature-map.md` and the stub `SKILL.md`. Drop `features/` locators.
- `skills/create-verification-skill/references/feature-map-example/`. Replace the four-H2 example with one structured `feature-map.md` that `parseFeatureMapMarkdown` accepts. Delete per-feature files that no longer match.

Migrate callers and delete the old map in this wave. Do not keep a second parser.

Use the host skill-authoring workflow and unslop on the two `SKILL.md` files.

## Data structures

Existing `FeatureMap` version 1 in `src/verification/feature-map.ts`. Fields stay `id`, `userGoal`, `route`, `pointers`, `accessible`, `expectedState`, `brokenState`, `prerequisites`, `evidence` with `cleanup: true`.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** `parseFeatureMapMarkdown` round-trip on the new example. `test/verification/verification.test.mjs` still passes. A leftover four-H2 fixture, if kept as a negative test, fails parse. Fake runtime `pstack_create_verification` still writes `.pi/skills/verify-<app>/{SKILL.md,feature-map.md}`.

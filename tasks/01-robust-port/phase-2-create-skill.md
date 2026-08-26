# Phase 2. Remove create-skill from automate-me and pstack-reflect

Back to [overview](overview.md).

## Goal

Mode-skill authoring points at the host skill-authoring workflow. Nothing in the package tells an agent to run `create-skill`.

## Changes

- `skills/automate-me/SKILL.md`. Drop `create-skill` from the description and the YAML, unslop, and "when not to use" steps. Point at the same host workflow `playbooks/authoring-a-skill.md` already names.
- `skills/pstack-reflect/SKILL.md`. Replace `new skill via create-skill` and `hand to create-skill` with the authoring playbook.
- `skills/pstack-reflect/references/synthesizer.md`. Same routing table change.

Add `create-skill` to the denylist from phase 1 once these three files are clean.

## Data structures

No new types. Agent-facing route names stay playbook paths.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** `node --test test/resources/resources.test.mjs` with `create-skill` in the denylist. `rg create-skill skills agents automations` returns no matches.

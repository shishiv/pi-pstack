---
name: setup-pstack
description: Configure pstack's semantic roles through Pi and pi-subagents model profiles. Use for /skill:setup-pstack, "configure pstack models", or changing pstack's model choices.
---

# Setup pstack

Use Pi's model registry and pi-subagents profiles. Never copy foreign model slugs, invent a model ID, or replace the user's complete settings file.

## 1. Inspect the live registry

Run `/subagents-models` to inspect the models resolved for `scout`, `researcher`, `worker`, `reviewer`, `oracle`, `poteto-agent`, and `comment-sicko`. Use `ctx.scopedModels` or `ctx.modelRegistry.getAvailable()` when this runs from an extension.

If the provider catalogue is stale, use `/subagents-refresh-provider-models <provider>`. Do not infer entitlement from documentation.

## 2. Map semantic roles

Map pstack work to Pi agents rather than to provider-specific names:

| pstack role | Pi agent |
| --- | --- |
| fast exploration | `scout` |
| external research | `researcher` |
| implementation and precise execution | `worker` |
| independent code review | `reviewer` |
| judgment, synthesis, and cross-judge | `oracle` |
| full pstack style | `poteto-agent` |
| comment-only review | `comment-sicko` |

For a multi-model panel, select available models explicitly on each `runs.all` child. The execution plan may contain provider/model identities. Candidate outputs passed to a blind judge must not.

## 3. Choose and load a Pi profile

Prefer Pi's existing profile flow:

```text
/subagents-generate-profiles <provider>
/subagents-load-profile <provider.profile>
/subagents-check-profile <provider.profile>
```

If the existing profile already gives each role an appropriate model, make no change. If an override is necessary, merge only the named entries under `subagents.agentOverrides` in `~/.pi/agent/settings.json` or project `.pi/settings.json`. Preserve every unrelated setting. Use `model: "inherit"` when the role should follow the parent.

Never add ad hoc profile or pstack-role objects to settings. pi-subagents stores generated profiles under `~/.pi/agent/profiles/pi-subagents/` and owns their format.

## 4. Verify

Run `/subagents-check-profile <profile>` and then start a fresh Pi session. Confirm that:

- `subagent` is available;
- `poteto-agent` and `comment-sicko` appear in agent discovery;
- `comment-sicko` remains read-only;
- every explicit model resolves through the live registry;
- a two-candidate blind eval launches different configured models when the profile provides them.

An unresolved model or missing tool is a failed setup. Report the exact gap and leave the existing configuration unchanged.

## 5. Establish verification

If the project has no `verify-*` skill and feature map, offer `/skill:create-verification-skill`. Model routing does not create trust by itself. The project earns higher autonomy only after its real verification and eval gates pass.

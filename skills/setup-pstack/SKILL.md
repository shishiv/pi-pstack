---
name: setup-pstack
description: Configure which models pstack uses per role. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /skill:setup-pstack, "configure pstack models", or changing pstack's model choices.
---

# Setup pstack

Write Pi's `~/.pi/agent/settings.json` model profiles and per-agent role
overrides. Skills use role names and profiles, never provider-specific model
slugs, so the configuration remains portable across Pi providers.

## Steps

### 1. Detect available models

Enumerate the model profiles and model IDs available to Pi's `subagent` in
this session. If Pi exposes a model API or CLI, prefer it. If no profiles are
configured, use `inherit` and ask only when a real preference is needed.

### 2. Load current state

The default role-to-model mapping is the rule shape shown in step 5 below. If `~/.pi/agent/settings.json` already exists, read it and treat its values as the current choices. Otherwise start from those defaults.

### 3. Map and confirm

Show every role with its current Pi profile. Ask whether to accept or change
specific roles, offering `inherit`, `fast`, `reasoning`, `instruction`, and
`review`. Panel roles are lists; one child runs per entry, so list length sets
fan-out. `swarm workers` is the default worker role unless a race assigns an
explicit profile.

### 4. Validate

Every profile must resolve in Pi's model registry, and `inherit` always passes.
If a profile is unavailable, stop and ask again. A role pointing at an
unavailable model breaks every delegation that reads it.

### 5. Write the rule

Write valid JSON to `~/.pi/agent/settings.json` and overwrite the whole file so
re-runs stay idempotent. Store profiles in `subagents.profiles` and map
semantic roles to Pi agent overrides. Shape:

```
{
  "subagents": {
    "defaultModel": "inherit",
    "profiles": {
      "fast": { "model": "<Pi-registered-fast-model>" },
      "reasoning": { "model": "<Pi-registered-reasoning-model>" },
      "instruction": { "model": "<Pi-registered-instruction-model>" },
      "review": { "model": "<Pi-registered-review-model>" }
    },
    "agentOverrides": {
      "poteto-agent": { "model": "inherit" },
      "comment-sicko": { "acceptanceRole": "read-only" }
    }
  },
  "pstackRoles": {
    "feature": "fast",
    "bug-fix": "instruction",
    "judgment": "reasoning",
    "review": "review",
    "swarm-workers": "fast"
  }
}
```

### 6. Confirm

Tell the user the rule was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /skill:create-verification-skill." On yes, invoke `/skill:create-verification-skill` (resolves wherever pstack is installed — workspace, user, or plugin). On no, move on without pushing.

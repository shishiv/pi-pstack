---
name: setup-pstack
description: Configure pstack delegation against the active Pi host. Use for /skill:setup-pstack, "configure pstack models", or checking delegation readiness.
---

# Setup pstack

Read [`../../docs/delegation.md`](../../docs/delegation.md). Configure against capabilities that the active Pi environment actually exposes. Do not install another agent package, invent a model ID, or replace the user's complete settings file.

## 1. Identify the host

Inspect the host instructions and available tools. Treat `HERDR_ENV` only as a hint. Prefer the host path only when an active agents capability is present or `herdr pane current --current` succeeds and returns a valid current pane; follow its real contract. Otherwise use `pstack_delegate`, including inside Herdr. Do not send a local task to a remote executor merely because another delegation tool is absent.

## 2. Map semantic roles

Map pstack work to roles rather than provider-specific names:

| pstack role | Responsibility |
| --- | --- |
| fast local exploration | exploration |
| external research | research |
| implementation and precise execution | implementation |
| independent code review | review |
| judgment, synthesis, and cross-judge | judgment |
| full pstack style | the `agents/poteto-agent.md` prompt |
| comment-only review | the `agents/comment-sicko.md` prompt |

The active model is the default for every role. For a multi-model panel, select explicit models only from the live Pi model registry. Candidate outputs passed to a blind judge must not contain provider or model identity.

## 3. Verify

Run one harmless read-only delegation and confirm that the selected path:

- launches from the intended working directory;
- returns its result to the parent;
- preserves the read-only tool restriction;
- reports failure without hiding it;
- uses `pstack_delegate` outside Herdr.

When model diversity is configured, run a two-candidate blind check and confirm that both selected models are available. A missing optional model reduces diversity. A missing delegation path is a failed setup.

## 4. Establish verification

If the project has no `verify-*` skill and feature map, offer `/skill:create-verification-skill`. Model routing does not create trust by itself. The project earns higher autonomy only after its real verification and eval gates pass.

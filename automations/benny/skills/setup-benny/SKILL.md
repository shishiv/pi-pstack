---
name: setup-benny
description: Configure Benny and prepare its triage and repro automations. Use when installing Benny or changing its Slack, tracker, repository, routing, control, model, or budget settings.
disable-model-invocation: true
---

# Set up Benny

Benny ships as a dormant automation pack inside pstack. The Pi package manifest exposes only pstack's normal skill root; this file and the two operational files are not slash skills.

The human enters setup by pointing Pi at the pack's `FOR_AGENTS.md`. The bootstrap flow copies the whole pack into the target repository, then reads this file directly at `.pi/pstack/benny/skills/setup-benny/SKILL.md`.

Benny needs external configuration and two runnable operations. Scheduling is optional.

Do not create or update an automation until the user explicitly asks. Never put a secret value in package files, prompts, or committed configuration.

## 1. Copy the pack and enable shared pstack skills

Do this before asking for Benny configuration and before creating scheduler-backed operations.

Ask which repository will run the automations. The source pack is the directory containing `FOR_AGENTS.md`. The destination is `<target-repository>/.pi/pstack/benny/`.

Merge the entire source pack into the destination:

1. Create the destination when it is absent.
2. Copy every source file to the same relative path.
3. Preserve destination-only files. Never delete unrelated files during install or refresh.
4. Keep user-owned configuration, feature maps, and routing maps outside the destination. Never overwrite them.
5. When an existing source-managed file differs, inspect the diff and merge without discarding local edits. If ownership is ambiguous, stop and ask before replacing it.
6. Verify that the destination contains `FOR_AGENTS.md`, this setup file, both operational files, their references, and the templates.

If this file is already being read from the target destination, treat the copy as complete and run the same verification before continuing.

Install pstack for the target repository with `pi install -l <pinned-package-source>`. Use the public HTTPS URL and a pinned tag or commit. Let the Pi CLI own `.pi/settings.json`; do not hand-edit package-manager state.

The Pi CLI writes the project package entry and preserves unrelated settings. Verify that the resulting `packages` entry points at the pinned source selected above.

```json
{
	"packages": ["https://github.com/shishiv/pi-pstack@<pinned-ref>"]
}
```

The Pi CLI writes this package entry and preserves unrelated settings. Verify that it points at the pinned source selected above.

Reload the target project or start a fresh agent rooted there. Verify that these shared pstack skills resolve from project scope:

- `how`
- `why`
- `pstack-tdd`
- `unslop`
- `principle-separate-before-serializing-shared-state`
- `principle-minimize-reader-load`
- `principle-guard-the-context-window`
- `principle-sequence-verifiable-units`
- `principle-fix-root-causes`
- `principle-prove-it-works`

Do not count a skill loaded from the current session or a user-scoped package. The check must show that a fresh agent in the target repository receives pstack through project settings.

If project-scoped package installation is unavailable or any shared dependency does not resolve, stop and explain the failure.

The Benny files are read directly from `.pi/pstack/benny/`. Do not add that directory to the package manifest or expect its `SKILL.md` files to appear in the slash-skill list.

Tell the user that `.pi/settings.json`, `.pi/pstack/benny/`, and any referenced secret-free configuration must be committed before either automation is enabled. Do not commit them unless the user asks.

Once this check passes, live automation prompts may read the committed operational files by their stable repository-relative paths. They must not embed a package cache path or copy the file contents.

## 2. Adapt the configuration

Open these copied examples:

- `../../templates/configuration.example.yaml`
- `../reproduce-and-fix-issues/references/feature-map.example.md`

Create user-owned copies outside `.pi/pstack/benny/`. These are configuration files, not pack files. Example locations:

- Project config, such as `.pi/pstack/benny-config/configuration.yaml`
- Project feature map, such as `.pi/pstack/benny-config/feature-map.md`
- Project routing map, such as `.pi/pstack/benny-config/routing.md`
- User config, such as `~/.config/benny/configuration.yaml`
- User feature map, such as `~/.config/benny/feature-map.md`

Fill one feature-map section for every user-facing feature the automation may reproduce. Keep it at the user point of view. Do not freeze implementation details or current code paths in the map.

Do not edit the copied examples. Pack refreshes may update source-managed files after conflict review, but they must never touch the user-owned copies.

Prefer committed, secret-free files when a fresh scheduled run must read them. Otherwise pass the required values through approved runtime configuration. Reference a repository file only after confirming that it is committed in the repository where the schedule runs.

Use stable repository-relative paths for committed pack and configuration files. Never reference the package source directory or package cache path from a live automation.

## 3. Fill the required choices

Ask for or confirm:

- Source Slack channel ID
- Optional operations or status channel ID
- Repository URL and default branch
- Triage identity or Slack user ID
- Issue tracker type, team, project, labels, and intake status
- Tracker adapter skill or available Pi tool actions
- Optional routing map path
- Required control skill name
- Required user-facing feature-map path
- Status emoji strings
- Pull request URL format
- Polling and effort budgets
- Model slug for triage, repro, code work, and media review

Use only provider-qualified models resolved by the active Pi model profile. Do not guess a model ID or copy a provider-specific default from upstream.

The source channel, triage identity, repository, tracker adapter, control skill, and feature map must be explicit. Fail setup if any required value stays ambiguous.

Use pstack's `unslop` skill on the final automation names, descriptions, and prompt shims before saving them.

## 4. Check integration capabilities

The triage automation needs:

- Read access to the configured source Slack channel and its threads
- Thread-reply access in that channel
- Attachment metadata and file download access when reports include media
- Search, read, create, and update access through the configured issue-tracker adapter

The repro automation needs:

- Read access to the source thread
- Thread-reply access in the source channel
- Optional post and edit access in the configured operations channel
- Repository read and history access
- A pull request action that can open a draft pull request
- The configured control-adapter skill

Prefer configured Pi Slack actions for reads and posts. The optional `BENNY_SLACK_BOT_TOKEN` may fill a narrow gap such as editing one operations status message or downloading an attachment. Store the value in a secret manager or environment, not in YAML.

Do not use undocumented integration endpoints.

## 5. Prepare the routing map

If the user wants reroutes or owner pings:

1. Copy `../triage-issue-reports/references/routing.example.md` outside `.pi/pstack/benny/`.
2. Replace every placeholder with public or organization-local values.
3. Keep owner pings off by default.
4. Allow a ping only for a configured feature owner or a confirmed likely regression author.

If no routing map is configured, triage may classify a report but must not guess a destination or owner.

## 6. Verify the control adapter

Read `../reproduce-and-fix-issues/references/control-adapter.md` and the user's completed feature map.

Confirm that the named skill can:

- Bring up the target app
- Navigate every mapped feature through the real UI
- Exercise mapped states through declared adapter actions
- Inspect state without forcing the result
- Capture screenshots
- Start and stop a recording
- Clean up its processes and temporary data

If any capability is missing, leave the repro automation disabled. It must fail closed rather than claim a reproduction it did not perform.

## 7. Prepare the live operations

Ask whether this is first-time setup or configuration of existing automation.

Read `../../FOR_AGENTS.md` from the copied pack as the primary user-intent source for either path. Use it to understand the two triggers, tools, instructions, outcomes, and shared rules.

### First-time setup

Prepare one operation at a time.

For each automation:

1. Read the matching copied prompt template as secondary internal source material.
2. Turn `FOR_AGENTS.md`, the finished Benny configuration, and the template intent into a complete natural-language request.
3. Tell the live prompt to read and follow its exact committed operational file under `.pi/pstack/benny/`.
4. Use the stable repository-relative path, not a package source or cache path. Do not copy the operational file contents into the live prompt.
5. Validate the matching `*.workflow.json` intent.
6. Resolve Slack, repository, tracker, and control integrations through capability preflight.
7. Confirm that the copied pack and referenced configuration files are committed in the repository where the schedule will run.
8. Show the final invocation and obtain approval.
9. If the host exposes a scheduler, map the invocation to it with `overlap: "skip"` and `catchUp: "latest"`.
10. Verify the saved schedule when one was created. Otherwise run one approved on-demand check before preparing the next operation.

Give the triage invocation this complete intent, filled from configuration:

- Name `benny-triage`.
- Read and follow `.pi/pstack/benny/skills/triage-issue-reports/SKILL.md` for every run.
- Trigger on each new top-level report in the configured source Slack channel.
- Read the triggering thread and reply only inside it.
- Use the configured issue-tracker integration.
- Classify, inspect evidence, trace cause, dedupe, and create only clear new bugs.
- End one thread-only verdict with the configured `[benny:bug]`, `[benny:performance]`, or `[benny:other]` marker and optional tracker URL.
- Never post a source-channel root message.

After the triage invocation is verified, give the reproduce invocation this complete intent:

- Name `benny-reproduce`.
- Read and follow `.pi/pstack/benny/skills/reproduce-and-fix-issues/SKILL.md` for every run.
- Trigger on the same new top-level reports in the configured source Slack channel.
- Use the configured repository and default branch.
- Read the source thread and reply only inside it.
- Include pull request creation and the configured tracker, control-adapter, and feature-map requirements. Paraphrase mapped user paths and states unless setup confirms an eligible committed file in the same repository.
- Wait for a trusted triage marker before acting.
- Reproduce the exact symptom twice through the mapped real UI and capture evidence.
- Verify an existing fix without authoring over it.
- Attempt an optional bounded fix only after confirmed repro, then open a draft pull request when proof and checks pass.
- Never post a source-channel root message.

Do not create a schedule or run an operation until every referenced capability and path passes preflight.

### Existing automations

Use the scheduler actions exposed by the host to inspect or update existing Benny schedules. Do not create duplicates. If no scheduler is available, keep the approved on-demand invocations instead.

Finish configuration, routing, control-adapter, and feature-map validation. Then give the user this concise editor checklist.

For the existing triage automation, update:

- Name and description
- Direct instruction to read `.pi/pstack/benny/skills/triage-issue-reports/SKILL.md`
- New top-level Slack report trigger and source channel
- Slack thread read and reply capabilities
- Issue-tracker integration
- Paraphrased triage instructions, thread-only rule, and Benny verdict markers

For the existing repro automation, update:

- Name and description
- Direct instruction to read `.pi/pstack/benny/skills/reproduce-and-fix-issues/SKILL.md`
- Matching Slack trigger and source channel
- Repository and default branch
- Slack thread read and reply capabilities
- Pull request action
- Tracker, control-adapter, and feature-map requirements
- Paraphrased marker wait, evidence, verification, and bounded-fix instructions

Ask the user to update each existing automation through the configuration surface exposed by its host scheduler. Do not create replacements or duplicates.

### Creation boundary

Create schedules only through a scheduler exposed by the host and after the user approves the final payload. Do not enable either schedule until the thread-safety test passes and the host confirms the saved definition.

## 8. Test thread safety

Use a test channel or a harmless test report.

Before testing, confirm that the target repository's `.pi/settings.json`, `.pi/pstack/benny/`, and every referenced secret-free configuration file are committed on the branch used by the automation checkout. Confirm that both live prompts point at their exact committed operational files. If any check fails, stop. Tell the user that the automation cannot be enabled yet.

Verify:

1. Triage stores the root `thread_ts` and posts exactly one verdict as a reply.
2. The verdict contains one configured marker.
3. Repro accepts the marker only from the configured triage identity.
4. Repro keeps the same immutable source coordinates.
5. No source-channel root message appears.
6. A delegated worker cannot use any Slack write action.
7. Missing coordinates, a deleted parent, or a failed preflight produces no post and no tracker issue.

Enable normal traffic only after all seven checks pass.

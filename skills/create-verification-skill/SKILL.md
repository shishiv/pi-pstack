---
name: create-verification-skill
description: "Generate a project-local verification skill that drives your app the way a user does, in any language, framework, or platform. Use for /skill:create-verification-skill, \"make a control skill for this repo\", or when a project has no scripted way to prove UI, CLI, or service behavior."
disable-model-invocation: true
---

# Create a verification skill

Every serious project needs a scripted way to drive the real app and prove behavior. Launch it, exercise a feature the way a user would, and capture evidence. Call `pstack_create_verification` to write a project-local skill at `.pi/skills/verify-<app>/`. The stub is for the next agent, not for a human. It will be read cold, mid-task, by an agent that has never seen the app.

## 1. Interview the repo, not the user

Answer these from the codebase and only ask the user what you cannot observe:

- **Surface:** what does a user actually touch? A web UI, a CLI/TUI, a desktop app, an API, a mobile app, a library? A repo can have several; pick the primary one and note the rest.
- **Run:** how does the app start locally? Prefer the repo's own documented dev command (package scripts, Makefile, README quickstart). Note ports, env vars, seed data, auth.
- **Drive:** how can an agent interact with it programmatically? Existing harnesses first. Playwright or Cypress specs, expect scripts, PTY helpers, curl-able endpoints, a debug port. Only then pick a generic recipe: browser/CDP for web and Electron, a tmux/PTY session for CLI/TUI, plain HTTP for services.
- **Observe:** what evidence can be captured? Screenshots, terminal transcripts, response bodies, logs, exit codes, DB state.
- **Isolate:** can two instances run side by side (ports, data dirs, profiles)? If not, record that as a prerequisite and refuse to double-drive a shared instance. That beats corrupting the user's session.

If the checkout doesn't build or start as-is, fix that first (or report it precisely) before generating. A skill written against a broken base teaches wrong steps. When an irrelevant missing asset blocks startup (a static dir the API never serves, a sample config), you may create it for the proof run, clearly marked as verification scaffolding, and remove it in cleanup.

## 2. Generate the skill

Call `pstack_create_verification` with a FeatureMap built from the interview. Do not hand-write Launch, Doctor, or Drive as a second on-disk skill format. The tool already writes a stub `SKILL.md` that says to read `feature-map.md`. It writes `.pi/skills/verify-<app>/{SKILL.md,feature-map.md}`.

Pass these parameters.

- `app`: kebab-case product name
- `features`: one object per user-facing feature you can identify. Aim for the top 3-5, from routes, commands, menus, or docs.

Each feature object:

- `id`: kebab-case
- `userGoal`: one line
- `route`: one line
- optional `component`, `source`, `role`, `name`, `selector`, `dataTestId`
- `expectedState` and `brokenState`: one line each, and they must differ
- `prerequisites`: string array
- `evidence`: string-literal array that includes `"cleanup"` plus at least one other artifact from `"screenshot"`, `"accessibility"`, `"domSnapshot"`, `"trace"`, `"video"`

Prefer stable handles. ARIA `role` and `name`, `dataTestId`, and route paths beat coordinates and tab order.

The map is the repo's maintained verification source. Match the shape in [`references/feature-map-example/feature-map.md`](references/feature-map-example/feature-map.md).

## 3. Prove the generated skill before handing it over

Run the stub plus the map end to end once. Launch the app the interview found. Drive ONE mapped feature via Playwright or the repo's harness. Capture evidence. Clean up without deleting proof. After cleanup, confirm the evidence still exists at the named location. A cleanup that eats the proof fails this step. Fix what fails, and run cleanup after every failed iteration too, so broken attempts don't strand processes and ports. A generated skill that was never executed is a draft, not a deliverable. One feature is enough for this step. The map exists so later runs can cover the rest.

## 4. Offer the maintenance loop

Point the user at `/skill:maintain-verification-skill` for keeping the map honest as the app changes. Suggest a cadence only if they ask.

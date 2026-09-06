# Delegation contract

Delegation is a required capability for pstack workflows that call for independent review, isolated context, or parallel work. Skills describe the work and its isolation requirements. They do not depend on one tool schema.

## Select the available path

1. Check `PSTACK_DELEGATION_CHILD` first. If it equals `1`, complete the assigned task directly and do not delegate again.
2. If an active agents capability is present, select the host path and follow that capability's real contract.
3. Without an active agents capability, run the Herdr CLI probe only when `HERDR_ENV=1`. Select the Herdr path only if `herdr pane current --current` succeeds and returns a valid current pane. `HERDR_ENV=1` alone does not select Herdr.
4. Otherwise use `pstack_delegate`, including inside Herdr.

Do not send work to a remote executor merely because another delegation tool is absent. Do not replace required independent review with self-review.

For a host delegator, inspect and follow the tool's real contract. For `pstack_delegate`, pass the required `task` and `role`; add `cwd` or `model` only when the task needs them.

## Dispatch contract

Each delegated task states:

- one stable label in the task;
- the goal, scope, working directory, and expected result;
- whether the task is read-only or may write;
- any required skill or prompt file;
- the evidence and completion condition.

Launch independent tasks together when the selected capability supports parallel work. Give every writer an isolated checkout or output path. Use the host's completion signal and collect every result. Do not poll when the host can notify completion.

Model diversity is optional. Select an explicit model only after the host reports it as available. Keep provider and model identity out of blind candidate output.

If delegation is unavailable, the local Pi subprocess fallback owns execution. If neither path can establish a required isolation or independence guarantee, stop and report that capability as blocked.

### Shipping

**You own what lands. Verify each PR independently, land only the verified run from the root, then keep your hands off the queue.** For "land the stack", "ship it", "enable merge when ready", or the second half of a stack that **Babysit** already drove to green.

This is the half after `playbooks/babysit.md`. Babysit makes a stack mergeable.
Shipping decides what is actually safe to merge and hands a verified receipt to
the selected delivery adapter. `gh stack` is the default backend; Graphite is
an optional named backend. These resources do not implement backend state.
Green is not safe, and the gap between those two words is where this playbook
lives.

1. **Verify every PR independently before arming anything.** One subagent per PR, not batched, each a managed-worktree subagent, each exercising the real surface through the available browser, CLI, desktop, or mobile verification skill against parent versus head. Each returns `PASS`, `PASS+NOTES` or `FAIL` and posts that verdict on its own PR so the record outlives the chat. Safe means a verdict from an agent that did not write the code. CI green is not a verdict, and an approving bot review is not a verdict.
2. **Land only the contiguous verified run rooted at the bottom.** Walk up from the lowest unmerged PR and stop at the first one without a passing verdict, where both `PASS` and `PASS+NOTES` pass. A verified PR sitting above an unverified one is not landable, because merging it would pull the gap in underneath it. Report the ceiling as a PR number and say what breaks the chain.
3. **Re-check that the verdicts still describe the code.** A restack rewrites every SHA above it and silently invalidates every verdict without touching a single check. Compare `git patch-id` at the verdict SHA against the current head before trusting an older verdict, and re-verify anything that actually drifted. Twenty-one verdicts went stale this way in one run with no signal at all.
4. **Hand the receipt to the delivery adapter.** Use the default `gh stack`
   adapter unless the operator explicitly selected the named Graphite adapter.
   Do not invent or mutate stack state in a skill; the later
   `src/delivery` adapter owns submission, merge-when-ready, and exact-head
   checks.
5. **Never enable GitHub auto-merge on a stack directly.** Only the selected
   delivery adapter targets protected trunk and controls sequencing. If a
   previous run armed it outside the adapter, stop and report the drift.
6. **Do not infer delivery state from a PR field.** The adapter's receipt is
   the proof. If it is unavailable, stop rather than re-submitting branches
   that may already be armed.
7. **Once the queue is draining, stop touching the stack.** No speculative
   pushes or second delivery invocation. The adapter owns retargeting and
   sequencing; independent work gets re-parented onto trunk and shipped on
   its own.
8. **Watch the drain, do not drive it.** Arm the watcher as an async subagent over
   the verified run and use `subagent_wait` or a completion subscription, re-armed
   after any verdict you act on, until COMPLETE at the ceiling. Report each
   adapter receipt and the new ceiling. If the queue stalls, diagnose before
   mutating, because a stalled queue and a broken stack look identical from
   the outside.
9. **Stop at the ceiling.** When the verified run is merged, report what landed, what the next unverified PR is, and what verifying it would take. Extending the run is a new pass through step 1, not a judgment call you make at 3am.

**Reply:** the verified run and its ceiling, each PR's verdict and who produced it, what you armed and how you confirmed it, what landed, and what the next gap needs.

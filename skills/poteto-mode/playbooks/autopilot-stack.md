### Autopilot-stack

**You own the stack, never the landing. Build and verify the queue with full
autonomy, then hand the operator one linear reviewed stack.** `gh stack` is
the default named backend; Graphite is optional. For "autopilot-stack", "stack
them, don't ship", "build the stack, I'll land it". The sibling of
**Autopilot-full**. The owner loop and verification gate are the same; only
the terminal differs. Nothing auto-ships from this skill.

1. **Run the owner loop unchanged.** One managed-worktree subagent per PR owns its change end to end: build, `gt` registration of its own PR, self-proof (gates, CI, receipts), skeptical Bugbot triage per `../references/bugbot-triage.md`, a slop-strip (the `deslop` skill from the `installed Pi control skills` plugin (`/skill:unslop`)), `/skill:no-comments` (the **no-comments** skill), and babysit to green per `playbooks/babysit.md`. Owners parallelize when the work is self-contained. Every owner keeps a `decisions.tsv` trail per the **show-me-your-work** skill, never committed, returned in its report.
2. **Audit on the wake chain.** The root runs an audit tick roughly every 30 minutes. A local root arms each tick as a real terminal `async/wait`. The loop uses a monitored-shell 30-minute sleep and emits an output-notification sentinel. A async coordinator uses the existing Pi schedule wake chain instead. Never leave the cadence to memory or lossy completion notifications. At each tick, re-read this playbook from trunk with `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`, then re-read the armed `goal state`. Audit the operation against both. Fix drift during that tick and treat it as urgent. Probe each owner with a generic liveness or status check. Count only side effects as progress: commits, pushes, PR or check deltas, and store reports. Treat a lane that passes its expected runtime without a side effect as stuck. Stand it down and dispatch a replacement at once. Do not wait for a polite return.
3. **Hold the operator gates.** State-then-wait, so a request to state the plan is not a go. On her explicit go, arm a `goal state` with the full program objective. The goal continues across turns until the chain is done. On her stop, every owner takes an immediate zero-writes hold.
4. **Verify at STACK-READY.** The owner reports STACK-READY with the exact head SHA. The root swarm-verifies that SHA, fan-out per the **swarm** skill: parallel independent verifiers re-running the gates at that SHA, a live runtime floor over the load-bearing behavior, and a receipts-and-diff audit that distrusts the PR body. The swarm aggregates to one verdict. Findings go back to the owner, and nothing enters the stack unverified.
5. **Append on a clean verdict, never ship.** No owner merges, arms
   auto-merge, or closes. A clean verdict appends the PR to the one linear
   reviewed stack in verified order or an order the operator specified.
6. **Single writer on topology, parallel writers on builds.** The selected
   delivery adapter owns stack topology. An owner pushes only its own branch
   and reports its tip and intended parent; the root passes that receipt to the
   adapter rather than keeping a second stack state here.
7. **Absorb drift at the root, then re-verify what moved.** A changed base or
   head voids verdicts at old SHAs. Compare exact heads through the adapter and
   send anything that drifted back through step 4 before delivery.
8. **Deliver the chain.** The deliverable is one linear chain of verified PRs,
   reviewable bottom-up through the selected adapter. The operator reviews and
   lands it; this skill never invokes delivery directly.

**Choosing between the autopilots.** Autopilot-full when the PRs are independent and landing authority is granted. Autopilot-stack when the operator wants review before landing, the work is sequenced or coupled, or merge authority is withheld.

**Reply:** links to the stack root and tip, a one-line verdict summary per link, and anything parked or excluded with the reason.

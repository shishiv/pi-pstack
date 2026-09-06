import { createDelegationTask, type DelegationTask } from "../workflows/delegation.js";
import type { BennyConfig } from "./types.js";

export interface BennyScheduleWorkflow {
  readonly name: "benny-triage" | "benny-reproduce";
  readonly every: string;
  readonly task: DelegationTask;
  readonly polling: "schedule-wake";
  readonly overlap: "skip";
  readonly catchUp: "latest";
  readonly tool: "pstack_benny";
  readonly action: "triage" | "reproduce";
  readonly draftOnly: true;
}

const triageTask = createDelegationTask({
  role: "benny",
  task: "Read .pi/pstack/benny/skills/triage-issue-reports/SKILL.md and the approved configuration, then call pstack_benny once with action triage and the configured adapter provider. The provider polls one event; the tool owns the durable ledger and external writes.",
});
const reproduceTask = createDelegationTask({
  role: "benny",
  task: "Read .pi/pstack/benny/skills/reproduce-and-fix-issues/SKILL.md and the approved configuration, then call pstack_benny once with action reproduce, the configured adapter provider, and an explicit featureId. The provider polls one trusted marker; the tool enforces two observations and draft-only delivery.",
});

/** Describe a fresh coordinator task for a host-owned scheduler. */
function scheduleInterval(pollSeconds: number): string {
  if (!Number.isInteger(pollSeconds) || pollSeconds <= 0)
    throw new Error("Benny pollSeconds must be a positive integer");
  return `${Math.ceil(pollSeconds / 60)}m`;
}

function buildWorkflows(pollSeconds: number): readonly BennyScheduleWorkflow[] {
  const every = scheduleInterval(pollSeconds);
  return Object.freeze([
    Object.freeze({
      name: "benny-triage" as const,
      every,
      task: triageTask,
      polling: "schedule-wake" as const,
      overlap: "skip" as const,
      catchUp: "latest" as const,
      tool: "pstack_benny" as const,
      action: "triage" as const,
      draftOnly: true as const,
    }),
    Object.freeze({
      name: "benny-reproduce" as const,
      every,
      task: reproduceTask,
      polling: "schedule-wake" as const,
      overlap: "skip" as const,
      catchUp: "latest" as const,
      tool: "pstack_benny" as const,
      action: "reproduce" as const,
      draftOnly: true as const,
    }),
  ]);
}

export const BENNY_WORKFLOWS = buildWorkflows(45);
export const BENNY_TRIAGE_WORKFLOW = BENNY_WORKFLOWS[0]!;
export const BENNY_REPRODUCE_WORKFLOW = BENNY_WORKFLOWS[1]!;

export const TRIAGE_WORKFLOW = BENNY_TRIAGE_WORKFLOW;
export const REPRODUCE_WORKFLOW = BENNY_REPRODUCE_WORKFLOW;
export function createBennyWorkflows(
  config?: Pick<BennyConfig, "budgets">,
): readonly BennyScheduleWorkflow[] {
  return config ? buildWorkflows(config.budgets.pollSeconds) : BENNY_WORKFLOWS;
}

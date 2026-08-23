import { buildSingleChildWorkflowScript, validateWorkflowScript } from "../workflows/delegation.js";
import type { BennyConfig } from "./types.js";

export interface BennyScheduleWorkflow {
  readonly name: "benny-triage" | "benny-reproduce";
  readonly every: string;
  readonly workflowScript: string;
  readonly polling: "schedule-wake";
}

const triageScript = buildSingleChildWorkflowScript({
  key: "triage-coordinator",
  role: "implement",
  task: "Run the Benny coordinator triage handler. Read .pi/pstack/benny/skills/triage-issue-reports/SKILL.md as a dormant operational resource. Coordinator-only writes; preserve immutable source coordinates.",
});
const reproduceScript = buildSingleChildWorkflowScript({
  key: "reproduce-coordinator",
  role: "implement",
  task: "Run the Benny coordinator reproduce handler. Read .pi/pstack/benny/skills/reproduce-and-fix-issues/SKILL.md as a dormant operational resource. Require two matching UI observations; draft PR only.",
});
validateWorkflowScript(triageScript);
validateWorkflowScript(reproduceScript);

/** Schedules wake a fresh coordinator; no workflow contains a nested polling loop. */
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
      workflowScript: triageScript,
      polling: "schedule-wake" as const,
    }),
    Object.freeze({
      name: "benny-reproduce" as const,
      every,
      workflowScript: reproduceScript,
      polling: "schedule-wake" as const,
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

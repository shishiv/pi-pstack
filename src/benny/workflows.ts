import { buildSingleChildWorkflowScript, validateWorkflowScript } from "../workflows/delegation.js";

export interface BennyScheduleWorkflow {
  readonly name: "benny-triage" | "benny-reproduce";
  readonly schedule: string;
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
export const BENNY_TRIAGE_WORKFLOW: BennyScheduleWorkflow = Object.freeze({
  name: "benny-triage",
  schedule: "every 45s",
  workflowScript: triageScript,
  polling: "schedule-wake",
});
export const BENNY_REPRODUCE_WORKFLOW: BennyScheduleWorkflow = Object.freeze({
  name: "benny-reproduce",
  schedule: "every 45s",
  workflowScript: reproduceScript,
  polling: "schedule-wake",
});
export const BENNY_WORKFLOWS = Object.freeze([BENNY_TRIAGE_WORKFLOW, BENNY_REPRODUCE_WORKFLOW]);

export const TRIAGE_WORKFLOW = BENNY_TRIAGE_WORKFLOW;
export const REPRODUCE_WORKFLOW = BENNY_REPRODUCE_WORKFLOW;
export function createBennyWorkflows(): readonly BennyScheduleWorkflow[] {
  return BENNY_WORKFLOWS;
}

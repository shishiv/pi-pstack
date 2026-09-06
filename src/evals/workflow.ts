import {
  createDelegationTask,
  type DelegationRole,
  type DelegationTask,
} from "../workflows/delegation.js";
import type { EvalCase } from "./schema.js";

export interface LocalEvalModel {
  key: string;
  role?: DelegationRole;
  /** A model reference is retained in the local plan, never sent to the blind judge. */
  model?: string;
}

export interface LocalMultiModelWorkflowOptions {
  evalCase: EvalCase;
  candidates: readonly LocalEvalModel[];
}

export interface LocalMultiModelWorkflowPlan {
  tasks: readonly { key: string; request: DelegationTask }[];
  candidates: readonly LocalEvalModel[];
  executesModels: false;
}

function taskFor(evalCase: EvalCase, candidate: LocalEvalModel): string {
  return [
    `Run eval case ${evalCase.id} for the supplied fixture and input.`,
    "Produce an observation with text, structured, files, actions, and exit fields.",
    "Do not include provider or model identity in the observation.",
    `Fixture: ${JSON.stringify(evalCase.fixture)}`,
    `Input: ${JSON.stringify(evalCase.input)}`,
    `Candidate key: ${candidate.key}`,
  ].join("\n");
}

/** Build an inspectable task list. The caller chooses and owns any parallel execution. */
export function buildLocalMultiModelWorkflowPlan(
  options: LocalMultiModelWorkflowOptions,
): LocalMultiModelWorkflowPlan {
  if (options.candidates.length < 2)
    throw new Error("A local multi-model eval requires at least two candidates.");
  const tasks = options.candidates.map((candidate) => ({
    key: candidate.key,
    request: createDelegationTask({
      role: candidate.role ?? "implement",
      task: taskFor(options.evalCase, candidate),
      model: candidate.model,
    }),
  }));
  return { tasks, candidates: [...options.candidates], executesModels: false };
}

export const buildEvalWorkflowPlan = buildLocalMultiModelWorkflowPlan;

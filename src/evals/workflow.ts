import {
  buildParallelFanoutWorkflowScript,
  validateWorkflowScript,
  type WorkflowRole,
} from "../workflows/delegation.js";
import type { EvalCase } from "./schema.js";

export interface LocalEvalModel {
  key: string;
  role?: WorkflowRole;
  /** A model reference is retained in the local plan, never sent to the blind judge. */
  model?: string;
}

export interface LocalMultiModelWorkflowOptions {
  evalCase: EvalCase;
  candidates: readonly LocalEvalModel[];
}

export interface LocalMultiModelWorkflowPlan {
  script: string;
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

/** Build an inspectable local fanout plan. It intentionally never invokes runs.run itself. */
export function buildLocalMultiModelWorkflowPlan(
  options: LocalMultiModelWorkflowOptions,
): LocalMultiModelWorkflowPlan {
  if (options.candidates.length < 2)
    throw new Error("A local multi-model eval requires at least two candidates.");
  const children = options.candidates.map((candidate) => ({
    key: candidate.key,
    role: candidate.role ?? ("implement" as const),
    task: taskFor(options.evalCase, candidate),
    model: candidate.model,
  }));
  const script = buildParallelFanoutWorkflowScript(children);
  validateWorkflowScript(script);
  return { script, candidates: [...options.candidates], executesModels: false };
}

export const buildEvalWorkflowPlan = buildLocalMultiModelWorkflowPlan;

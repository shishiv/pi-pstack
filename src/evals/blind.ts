import type { EvalCase } from "./schema.js";
import { normalizeCandidate, type CandidateGrade, type CandidateObservation } from "./grader.js";

export type BlindLabel = "Candidate A" | "Candidate B";

export interface BlindCandidate {
  label: BlindLabel;
  observation: CandidateObservation;
}

export interface JudgeDecision {
  winner: BlindLabel | "tie";
  rationale?: string;
}

export interface EvalAggregate {
  accepted: boolean;
  winner: BlindLabel | null;
  grades: Readonly<Record<BlindLabel, CandidateGrade>>;
  judge: JudgeDecision | undefined;
  reason: string;
}

/** Keep only observable candidate output; provider, model, and candidate IDs never cross this boundary. */
export function anonymizeCandidates(candidates: readonly unknown[]): readonly BlindCandidate[] {
  if (candidates.length !== 2)
    throw new Error("A blind comparison requires exactly two candidates.");
  return candidates.map((candidate, index) => ({
    label: index === 0 ? "Candidate A" : "Candidate B",
    observation: normalizeCandidate(candidate),
  }));
}

function promptValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(promptValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, promptValue(item)]),
    );
  }
  return value;
}

function promptJson(value: unknown): string {
  return JSON.stringify(promptValue(value), null, 2);
}

/** Build a provider/model-blind pairwise prompt. It contains labels and evidence only. */
export function buildBlindJudgePrompt(
  evalCase: EvalCase,
  candidates: readonly BlindCandidate[],
): string {
  if (candidates.length !== 2)
    throw new Error("A blind comparison requires exactly two candidates.");
  const required = evalCase.requiredAssertions.map((item) => JSON.stringify(item)).join("\n");
  const prohibited = evalCase.prohibitedBehaviors.map((item) => JSON.stringify(item)).join("\n");
  const rendered = candidates
    .map((candidate) => [`${candidate.label}:`, promptJson(candidate.observation)].join("\n"))
    .join("\n\n");
  return [
    "You are a blind evaluator. Compare the two labeled candidate outputs below.",
    "Do not infer or mention provider, model, vendor, or author identity.",
    "Return JSON with winner (Candidate A, Candidate B, or tie) and a concise rationale.",
    `Eval case: ${evalCase.id}`,
    "Required observable assertions:",
    required || "(none)",
    "Prohibited behaviors:",
    prohibited || "(none)",
    "Candidate outputs:",
    rendered,
  ].join("\n");
}

/** Hard assertions gate acceptance; a judge can choose only among hard-passing candidates. */
export function aggregateGrades(
  grades: Readonly<Record<BlindLabel, CandidateGrade>>,
  judge?: JudgeDecision,
): EvalAggregate {
  const passing = (["Candidate A", "Candidate B"] as const).filter(
    (label) => grades[label]?.hardPassed,
  );
  if (passing.length === 0)
    return {
      accepted: false,
      winner: null,
      grades,
      judge,
      reason: "Both candidates failed hard assertions.",
    };
  let winner: BlindLabel;
  if (judge?.winner && judge.winner !== "tie" && grades[judge.winner]?.hardPassed)
    winner = judge.winner;
  else if (passing.length === 1) winner = passing[0]!;
  else winner = "Candidate A";
  const reason =
    passing.length === 1
      ? `${winner} is the only candidate passing hard assertions.`
      : judge?.winner === "tie" || !judge
        ? "Both candidates pass hard assertions; deterministic tie-break selected Candidate A."
        : `${winner} was selected after hard assertion gating.`;
  return { accepted: true, winner, grades, judge, reason };
}

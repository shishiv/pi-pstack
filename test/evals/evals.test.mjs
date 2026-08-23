import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const evals = await jiti.import("../../src/evals/index.ts");
const caseValue = JSON.parse(await readFile("evals/cases/skill-eval.json", "utf8"));
const dependent = JSON.parse(await readFile("evals/cases/dependent-skill.json", "utf8"));
const good = JSON.parse(await readFile("evals/fixtures/known-good.json", "utf8"));
const broken = JSON.parse(await readFile("evals/fixtures/broken-candidate.json", "utf8"));

test("strictly validates eval schema and rejects unknown fields", () => {
  assert.equal(evals.validateEvalCase(caseValue).valid, true);
  const invalid = { ...caseValue, unexpected: true };
  const result = evals.validateEvalCase(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(";"), /unexpected.*not allowed/);
});

test("deterministic hard assertions accept known-good and reject broken candidate", () => {
  const evalCase = evals.assertValidEvalCase(caseValue) || caseValue;
  const goodGrade = evals.gradeCandidate(evalCase, good);
  const brokenGrade = evals.gradeCandidate(evalCase, broken);
  assert.equal(goodGrade.passed, true);
  assert.equal(brokenGrade.passed, false);
  assert.ok(brokenGrade.assertions.some((item) => !item.passed));
});

test("selection includes dependent cases and transitive dependents", () => {
  const transitive = {
    ...dependent,
    id: "transitive",
    targetSkill: "reflect",
    dependencySkills: ["show-me-your-work"],
  };
  const selected = evals.selectEvalCases(["how"], [caseValue, dependent, transitive]);
  assert.deepEqual(
    selected.map((item) => item.id),
    [caseValue.id, dependent.id, transitive.id],
  );
});

test("candidate anonymization strips identity and judge prompt is blind", () => {
  const candidates = evals.anonymizeCandidates([good, broken]);
  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    ["Candidate A", "Candidate B"],
  );
  const prompt = evals.buildBlindJudgePrompt(caseValue, candidates);
  assert.match(prompt, /Candidate A/);
  assert.match(prompt, /Candidate B/);
  assert.doesNotMatch(prompt, /hidden-provider|hidden-model|broken-provider|broken-model/);
});

test("hard assertion gate cannot be overridden by a judge", () => {
  const grades = {
    "Candidate A": evals.gradeCandidate(caseValue, good),
    "Candidate B": evals.gradeCandidate(caseValue, broken),
  };
  const aggregate = evals.aggregateGrades(grades, {
    winner: "Candidate B",
    rationale: "subjective preference",
  });
  assert.equal(aggregate.accepted, true);
  assert.equal(aggregate.winner, "Candidate A");
});

test("workflow plan uses existing fanout builder and does not execute models", () => {
  const plan = evals.buildLocalMultiModelWorkflowPlan({
    evalCase: caseValue,
    candidates: [
      { key: "candidate-a", model: "provider-a/model-a" },
      { key: "candidate-b", model: "provider-b/model-b" },
    ],
  });
  assert.equal(plan.executesModels, false);
  assert.match(plan.script, /runs\.all/);
  assert.doesNotMatch(plan.script, /provider-a|provider-b/);
});

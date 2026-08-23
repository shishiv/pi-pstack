#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createJiti } from "jiti";

const [casePath, ...candidatePaths] = process.argv.slice(2);
assert.ok(casePath, "usage: grade-live-eval <case.json> <candidate...>");
assert.ok(candidatePaths.length >= 2, "live eval requires at least two candidates");

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { parseEvalCaseJson, gradeCandidate, anonymizeCandidates } =
  await jiti.import("../src/evals/index.ts");
const evalCase = parseEvalCaseJson(await readFile(resolve(casePath), "utf8"));
const observations = await Promise.all(
  candidatePaths.map(async (path) => ({
    text: await readFile(resolve(path), "utf8"),
    structured: {},
    files: {},
    actions: [],
    exit: { outcome: "unknown", code: null },
  })),
);
const blind = anonymizeCandidates(observations.slice(0, 2));
const grades = blind.map((candidate) => ({
  label: candidate.label,
  grade: gradeCandidate(evalCase, candidate.observation),
}));
assert.ok(
  grades.some((entry) => entry.grade.hardPassed),
  "no candidate passed hard assertions",
);
process.stdout.write(`${JSON.stringify({ case: evalCase.id, grades }, null, 2)}\n`);
console.error("live eval verification passed");

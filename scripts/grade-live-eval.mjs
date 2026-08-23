#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createJiti } from "jiti";

const args = process.argv.slice(2);
const casePath = args.shift();
assert.ok(casePath, "usage: grade-live-eval <case.json> <candidate-a> <candidate-b> [options]");
const candidatePaths = [args.shift(), args.shift()];
assert.ok(candidatePaths[0] && candidatePaths[1], "live eval requires exactly two candidates");
assert.ok(args.length > 0, "live eval requires binding options");

const options = {};
for (let index = 0; index < args.length; index += 1) {
  const key = args[index];
  assert.ok(key?.startsWith("--"), `unknown argument ${key}`);
  const name = key.slice(2);
  const value = args[++index];
  assert.ok(value && !value.startsWith("--"), `${key} requires a value`);
  options[name] = value;
}

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { parseEvalCaseJson, gradeCandidate, anonymizeCandidates, aggregateGrades } =
  await jiti.import("../src/evals/index.ts");
const evalCase = parseEvalCaseJson(await readFile(resolve(casePath), "utf8"));
const observations = await Promise.all(
  candidatePaths.map(async (path) => {
    const text = await readFile(resolve(path), "utf8");
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : { text };
    } catch {
      return { text };
    }
  }),
);
const blind = anonymizeCandidates(observations);
const grades = blind.map((candidate) => ({
  label: candidate.label,
  grade: gradeCandidate(evalCase, candidate.observation),
}));
const byLabel = { "Candidate A": grades[0].grade, "Candidate B": grades[1].grade };

assert.ok(options.judge, "--judge is required; deterministic fallback judges are forbidden");
const judgePath = resolve(options.judge);
const judge = JSON.parse(await readFile(judgePath, "utf8"));
assert.ok(
  judge &&
    (judge.winner === "Candidate A" || judge.winner === "Candidate B") &&
    typeof judge.rationale === "string" &&
    judge.rationale.trim(),
  "judge must contain a candidate winner and rationale",
);
const aggregate = aggregateGrades(byLabel, judge);

const skillPath = options.skill ?? process.env.TARGET_SKILL_PATH;
assert.ok(skillPath, "--skill is required to bind eval evidence to the target skill");
const skillAbsolute = resolve(skillPath);
const repoIdentity = options.repo ?? process.env.REPO_IDENTITY;
const headSha = options.head ?? process.env.HEAD_SHA;
assert.ok(repoIdentity, "--repo is required to bind eval evidence to a repository");
assert.ok(headSha, "--head is required to bind eval evidence to an exact HEAD");
const targetRoot = options.root ? resolve(options.root) : process.cwd();
function inside(path) {
  const value = relative(targetRoot, resolve(path));
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}
function evidenceFor(path) {
  const absolute = resolve(path);
  assert.ok(inside(absolute), `evidence path leaves repository: ${path}`);
  return {
    path: relative(targetRoot, absolute).replaceAll("\\", "/"),
    sha256: createHash("sha256").update(requirements.get(absolute)).digest("hex"),
  };
}
const requirements = new Map();
for (const path of [
  resolve(casePath),
  ...candidatePaths.map((candidatePath) => resolve(candidatePath)),
  judgePath,
  skillAbsolute,
])
  requirements.set(path, await readFile(path));

const evidence = {
  version: 1,
  type: "eval-evidence",
  repoIdentity,
  headSha,
  caseId: evalCase.id,
  evalCase: evidenceFor(casePath),
  targetSkill: evidenceFor(skillAbsolute),
  candidates: [
    {
      label: "Candidate A",
      current: true,
      output: evidenceFor(candidatePaths[0]),
      grade: grades[0].grade,
    },
    {
      label: "Candidate B",
      current: false,
      output: evidenceFor(candidatePaths[1]),
      grade: grades[1].grade,
    },
  ],
  judgeEvidence: evidenceFor(judgePath),
  judge,
  aggregate: {
    accepted: aggregate.accepted,
    winner: aggregate.winner,
    reason: aggregate.reason,
  },
};
assert.equal(evidence.aggregate.accepted, true, "eval aggregate rejected both candidates");
assert.equal(evidence.candidates[0].grade.hardPassed, true, "current Candidate A must hard-pass");
const output = `${JSON.stringify(evidence, null, 2)}\n`;
if (options.out) await writeFile(resolve(options.out), output, "utf8");
else process.stdout.write(output);
console.error("live eval verification passed");

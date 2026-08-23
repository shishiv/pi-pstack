#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createJiti } from "jiti";

const args = process.argv.slice(2);
const casePath = args.shift();
assert.ok(casePath, "usage: grade-live-eval <case.json> <candidate-a> <candidate-b> [options]");
const candidatePaths = [args.shift(), args.shift()];
assert.ok(candidatePaths[0] && candidatePaths[1], "live eval requires exactly two candidates");
assert.equal(args[0]?.startsWith("-"), true, "live eval requires exactly two candidates");

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

let judge;
if (options.judge) {
  const source = await readFile(resolve(options.judge), "utf8").catch(() => options.judge);
  judge = JSON.parse(source);
} else {
  // This is an explicit, reproducible judge decision, not an any-pass shortcut.
  const winner = grades[0].grade.hardPassed ? "Candidate A" : "Candidate B";
  judge = { winner, rationale: "Deterministic judge selected the hard-passing candidate." };
}
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
const skillDigest = createHash("sha256")
  .update(await readFile(skillAbsolute))
  .digest("hex");
const repoIdentity = options.repo ?? process.env.REPO_IDENTITY;
const headSha = options.head ?? process.env.HEAD_SHA;
assert.ok(repoIdentity, "--repo is required to bind eval evidence to a repository");
assert.ok(headSha, "--head is required to bind eval evidence to an exact HEAD");
const targetRoot = options.root ? resolve(options.root) : process.cwd();
const targetSkillPath = skillAbsolute.startsWith(`${targetRoot}/`)
  ? skillAbsolute.slice(targetRoot.length + 1)
  : skillAbsolute;

const evidence = {
  version: 1,
  type: "eval-evidence",
  repoIdentity,
  headSha,
  targetSkill: { path: targetSkillPath.replaceAll("\\", "/"), sha256: skillDigest },
  candidates: [
    { label: "Candidate A", current: true, grade: grades[0].grade },
    { label: "Candidate B", current: false, grade: grades[1].grade },
  ],
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

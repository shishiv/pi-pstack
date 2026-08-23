import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function run(script, args) {
  return spawnSync(process.execPath, [join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("live eval script binds exact-head candidate and judge evidence", async () => {
  const directory = await mkdtemp(join(root, ".tmp-live-evidence-"));
  const path = (name) => relative(root, join(directory, name));
  try {
    const good = "increment-count Application status screenshot trace cleanup\n";
    await writeFile(join(directory, "current.md"), good);
    await writeFile(join(directory, "comparison.md"), good);
    await writeFile(
      join(directory, "judge.json"),
      JSON.stringify({ winner: "Candidate A", rationale: "blind output comparison" }),
    );
    const result = run("grade-live-eval.mjs", [
      "evals/cases/create-verification-live.json",
      path("current.md"),
      path("comparison.md"),
      "--judge",
      path("judge.json"),
      "--skill",
      "skills/create-verification-skill/SKILL.md",
      "--repo",
      "acme/demo",
      "--head",
      "abc123",
      "--root",
      root,
      "--out",
      path("eval-evidence.json"),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(await readFile(join(directory, "eval-evidence.json"), "utf8"));
    assert.equal(evidence.headSha, "abc123");
    assert.equal(evidence.candidates[0].current, true);
    assert.equal(evidence.candidates[0].grade.hardPassed, true);
    assert.equal(evidence.judgeEvidence.path, path("judge.json"));

    await writeFile(join(directory, "current.md"), "does not satisfy the case\n");
    const rejected = run("grade-live-eval.mjs", [
      "evals/cases/create-verification-live.json",
      path("current.md"),
      path("comparison.md"),
      "--judge",
      path("judge.json"),
      "--skill",
      "skills/create-verification-skill/SKILL.md",
      "--repo",
      "acme/demo",
      "--head",
      "abc123",
      "--root",
      root,
      "--out",
      path("rejected.json"),
    ]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /current Candidate A must hard-pass/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("review evidence script binds the raw VERIFIED output", async () => {
  const directory = await mkdtemp(join(root, ".tmp-review-evidence-"));
  const raw = join(directory, "review.md");
  const output = join(directory, "review.json");
  try {
    await writeFile(raw, "Independent findings resolved.\nVERIFIED\n");
    const result = run("create-review-evidence.mjs", [
      relative(root, raw),
      "--repo",
      "acme/demo",
      "--head",
      "abc123",
      "--reviewer",
      "reviewer",
      "--run",
      "run-1",
      "--root",
      root,
      "--out",
      relative(root, output),
    ]);
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(await readFile(output, "utf8"));
    assert.equal(evidence.verdict, "VERIFIED");
    assert.equal(evidence.rawReview.path, relative(root, raw));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const delivery = await jiti.import("../../src/delivery/index.ts");
const evals = await jiti.import("../../src/evals/index.ts");

const sha = (text) => createHash("sha256").update(text).digest("hex");
const map = `# Feature map: demo

## feature: save
- user goal: save a document
- route: /editor
- expected state: saved
- broken state: not saved
- prerequisites: none
- evidence: screenshot, trace, cleanup
`;

async function fixture({
  currentPass = true,
  repo = "acme/demo",
  head = "head-1",
  cleanup = "passed",
  bothPass = false,
  judgeWinner,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "pstack-evidence-"));
  const skill = "skill contents\n";
  const raw = "independent review\nVERIFIED\n";
  await writeFile(join(root, "feature-map.md"), map);
  await writeFile(join(root, "SKILL.md"), skill);
  await writeFile(join(root, "raw-review.md"), raw);
  await writeFile(join(root, "screenshot.png"), "png");
  await writeFile(join(root, "trace.zip"), "trace");
  const evalCase = {
    id: "receipt-live",
    targetSkill: "verify-demo",
    fixture: {},
    input: { request: "prove it" },
    requiredAssertions: [{ kind: "required-text", text: "OK" }],
    prohibitedBehaviors: ["FORBIDDEN"],
    dependencySkills: [],
    evidenceExpectations: { required: [] },
  };
  const candidateA = currentPass ? "OK\n" : "not okay\n";
  const candidateB = bothPass || !currentPass ? "OK\n" : "not okay\n";
  const judge = {
    winner: judgeWinner ?? (currentPass ? "Candidate A" : "Candidate B"),
    rationale: "blind comparison",
  };
  await writeFile(join(root, "eval-case.json"), JSON.stringify(evalCase));
  await writeFile(join(root, "candidate-a.txt"), candidateA);
  await writeFile(join(root, "candidate-b.txt"), candidateB);
  await writeFile(join(root, "judge.json"), JSON.stringify(judge));
  await writeFile(
    join(root, "review.json"),
    JSON.stringify({
      version: 1,
      type: "review-evidence",
      repoIdentity: repo,
      headSha: head,
      reviewer: "reviewer-1",
      runId: "run-1",
      verdict: "VERIFIED",
      rawReview: { path: "raw-review.md", sha256: sha(raw) },
    }),
  );
  const skillEvidence = { path: "SKILL.md", sha256: sha(skill) };
  const gradeA = evals.gradeCandidate(evalCase, { text: candidateA });
  const gradeB = evals.gradeCandidate(evalCase, { text: candidateB });
  const aggregate = evals.aggregateGrades({ "Candidate A": gradeA, "Candidate B": gradeB }, judge);
  await writeFile(
    join(root, "eval.json"),
    JSON.stringify({
      version: 1,
      type: "eval-evidence",
      repoIdentity: repo,
      headSha: head,
      caseId: evalCase.id,
      baselineId: "approved-baseline-1",
      evalCase: { path: "eval-case.json", sha256: sha(JSON.stringify(evalCase)) },
      targetSkill: skillEvidence,
      candidates: [
        {
          label: "Candidate A",
          current: true,
          baseline: false,
          output: { path: "candidate-a.txt", sha256: sha(candidateA) },
          grade: gradeA,
        },
        {
          label: "Candidate B",
          current: false,
          baseline: true,
          output: { path: "candidate-b.txt", sha256: sha(candidateB) },
          grade: gradeB,
        },
      ],
      judgeEvidence: { path: "judge.json", sha256: sha(JSON.stringify(judge)) },
      judge,
      aggregate: {
        accepted: aggregate.accepted,
        winner: aggregate.winner,
        reason: aggregate.reason,
      },
    }),
  );
  await writeFile(
    join(root, "artifact-manifest.json"),
    JSON.stringify({
      version: 1,
      screenshot: "screenshot.png",
      trace: "trace.zip",
      cleanupResult: cleanup,
    }),
  );
  return { root, skillEvidence };
}

async function create(root, extra = {}) {
  return delivery.createEvidenceReceiptFromFiles({
    root,
    repoIdentity: "acme/demo",
    headSha: "head-1",
    backend: "gh-stack",
    origin: "human",
    featureMapPath: "feature-map.md",
    skillPath: "SKILL.md",
    artifactManifestPath: "artifact-manifest.json",
    reviewPath: "review.json",
    evalPath: "eval.json",
    cleanWorktreeCheck: { name: "clean-worktree", status: "passed" },
    ...extra,
  });
}

test("receipt binds exact head, structured evidence, manifest artifacts, and digests", async () => {
  const { root } = await fixture();
  try {
    const receipt = await create(root);
    assert.equal(receipt.deterministicChecks.checks[0].name, "clean-worktree");
    assert.deepEqual(
      await delivery.revalidateEvidenceReceipt(receipt, root, {
        repoIdentity: "acme/demo",
        headSha: "head-1",
      }),
      [],
    );
    await writeFile(join(root, "trace.zip"), "tampered");
    assert.match((await delivery.revalidateEvidenceReceipt(receipt, root)).join(";"), /digest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("creation rejects an unverified review, wrong identity, current failure, and failed cleanup", async () => {
  for (const [name, options, pattern] of [
    ["wrong head", { head: "wrong" }, /HEAD/],
    ["wrong repository", { repo: "other/repo" }, /repository/],
    ["failed current", { currentPass: false }, /current Candidate A/],
    ["judge prefers baseline", { bothPass: true, judgeWinner: "Candidate B" }, /regressed/],
    ["failed cleanup", { cleanup: "failed" }, /cleanup/],
  ]) {
    const { root } = await fixture(options);
    try {
      await assert.rejects(create(root), pattern, name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  const { root } = await fixture();
  try {
    await writeFile(
      join(root, "review.json"),
      JSON.stringify({
        version: 1,
        type: "review-evidence",
        repoIdentity: "acme/demo",
        headSha: "head-1",
        reviewer: "r",
        runId: "run",
        verdict: "CHANGES_REQUESTED",
        rawReview: { path: "raw-review.md", sha256: "0".repeat(64) },
      }),
    );
    await assert.rejects(create(root), /structured review/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("creation rejects missing declared artifacts and paths outside root", async () => {
  const { root } = await fixture();
  try {
    await writeFile(
      join(root, "artifact-manifest.json"),
      JSON.stringify({ version: 1, trace: "trace.zip", cleanupResult: "passed" }),
    );
    await assert.rejects(create(root), /screenshot/);
    await assert.rejects(
      create(root, { cleanWorktreeCheck: { name: "clean-worktree", status: "failed" } }),
      /clean worktree/,
    );
    await assert.rejects(
      create(root, { featureMapPath: "../outside-feature-map.md" }),
      /leaves repository/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("evidence paths reject symlinks that resolve outside the repository", async () => {
  const { root } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "pstack-outside-evidence-"));
  const linkedRoot = join(outside, "repo-link");
  try {
    await writeFile(join(outside, "secret.txt"), "outside");
    await symlink(join(outside, "secret.txt"), join(root, "linked.txt"));
    await assert.rejects(delivery.fileEvidence(root, "linked.txt"), /resolves outside repository/);
    await symlink(root, linkedRoot, "dir");
    assert.equal(
      (await delivery.fileEvidence(linkedRoot, "feature-map.md")).path,
      "feature-map.md",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("creation rejects a target skill digest that does not match the receipt skill", async () => {
  const { root } = await fixture();
  try {
    const evalPath = join(root, "eval.json");
    const value = JSON.parse(await readFile(evalPath, "utf8"));
    value.targetSkill.sha256 = "f".repeat(64);
    await writeFile(evalPath, JSON.stringify(value));
    await assert.rejects(create(root), /target skill/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

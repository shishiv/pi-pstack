import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const delivery = await jiti.import("../../src/delivery/index.ts");

const twoPrStack = {
  trunk: "main",
  branches: [
    {
      name: "base-feature",
      head: "111111",
      base: "000000",
      isMerged: false,
      pr: { number: 41, state: "OPEN" },
    },
    {
      name: "feature",
      head: "abc123",
      base: "111111",
      isMerged: false,
      pr: { number: 42, state: "OPEN" },
    },
  ],
};

function runnerForStack(payload, exitCode = 0) {
  const calls = [];
  return {
    calls,
    async run(argv) {
      calls.push([...argv]);
      if (argv[0] === "gh" && argv.includes("view")) {
        return {
          exitCode,
          stdout: typeof payload === "string" ? payload : JSON.stringify(payload),
          stderr: "",
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ pullRequest: "42", headSha: "abc123" }),
        stderr: "",
      };
    },
  };
}

test("gh stack inspect returns proven parent-first members for a two-PR chain", async () => {
  const runner = runnerForStack(twoPrStack);
  const backend = new delivery.GhStackBackend(runner);
  const snapshot = await backend.inspect();
  assert.equal(snapshot.kind, "proven");
  assert.equal(snapshot.backend, "gh-stack");
  assert.deepEqual(
    snapshot.members.map((member) => ({
      pullRequest: member.pullRequest,
      headSha: member.headSha,
      baseSha: member.baseSha,
    })),
    [
      { pullRequest: "41", headSha: "111111", baseSha: "000000" },
      { pullRequest: "42", headSha: "abc123", baseSha: "111111" },
    ],
  );
  const prefix = delivery.membersThrough(snapshot.members, "42");
  assert.deepEqual(prefix, snapshot.members);
});

test("gh stack inspect is unproven for invalid membership topologies", async () => {
  const cases = [
    [
      "fork",
      {
        branches: [
          { head: "aaa", base: "000", pr: { number: 1, state: "OPEN" } },
          { head: "bbb", base: "000", pr: { number: 2, state: "OPEN" } },
        ],
      },
    ],
    [
      "cycle",
      {
        branches: [
          { head: "aaa", base: "bbb", pr: { number: 1, state: "OPEN" } },
          { head: "bbb", base: "aaa", pr: { number: 2, state: "OPEN" } },
        ],
      },
    ],
    [
      "duplicate head",
      {
        branches: [
          { head: "aaa", base: "000", pr: { number: 1, state: "OPEN" } },
          { head: "aaa", base: "111", pr: { number: 2, state: "OPEN" } },
        ],
      },
    ],
    [
      "missing base",
      {
        branches: [{ head: "aaa", pr: { number: 1, state: "OPEN" } }],
      },
    ],
    ["exit code 1 with valid JSON", twoPrStack, 1],
    ["empty stdout", "", 0],
    ["malformed stdout", "not-json", 0],
    [
      "all merged",
      {
        branches: [
          {
            head: "aaa",
            base: "000",
            isMerged: true,
            pr: { number: 1, state: "MERGED" },
          },
        ],
      },
    ],
  ];
  for (const [label, payload, exitCode = 0] of cases) {
    const backend = new delivery.GhStackBackend(runnerForStack(payload, exitCode));
    const snapshot = await backend.inspect();
    assert.equal(snapshot.kind, "unproven", label);
    assert.equal(snapshot.backend, "gh-stack");
  }
});

test("membersThrough returns undefined for missing and malformed targets without throwing", () => {
  const members = [
    { pullRequest: "41", headSha: "111111", baseSha: "000000" },
    { pullRequest: "42", headSha: "abc123", baseSha: "111111" },
  ];
  const proven = delivery.membersThrough(members, "99");
  assert.equal(proven, undefined);
  assert.doesNotThrow(() => delivery.membersThrough(members, "--admin"));
  assert.equal(delivery.membersThrough(members, "--admin"), undefined);
});

test("gh stack adapter emits only documented non-interactive commands", async () => {
  const runner = runnerForStack(twoPrStack);
  const backend = new delivery.GhStackBackend(runner);
  await backend.execute({ kind: "inspect" });
  await backend.execute({ kind: "prepare", branch: "feature" });
  await backend.execute({ kind: "submit", draft: false });
  await backend.execute({ kind: "sync" });
  await backend.execute({ kind: "rebase" });
  await backend.execute({ kind: "auto-merge", pullRequest: "42" });
  assert.deepEqual(runner.calls, [
    ["gh", "stack", "view", "--json"],
    ["gh", "stack", "add", "feature"],
    ["gh", "stack", "submit", "--auto", "--open"],
    ["gh", "stack", "sync"],
    ["gh", "stack", "rebase"],
    ["gh", "stack", "merge", "42", "--yes"],
  ]);
});

test("createDeliveryBackends exposes gh stack only", () => {
  const runner = runnerForStack(twoPrStack);
  const backends = delivery.createDeliveryBackends({ runner, availableCommands: ["gh", "gt"] });
  assert.ok(backends.ghStack);
  assert.equal(backends.graphite, undefined);
});

test("stack adapters reject flag-shaped branch and pull request operands", async () => {
  const backend = new delivery.GhStackBackend(runnerForStack(twoPrStack));
  await assert.rejects(
    backend.execute({ kind: "prepare", branch: "--help" }),
    /unsafe branch operand/,
  );
  await assert.rejects(
    backend.execute({ kind: "prepare", branch: "feature/../main" }),
    /unsafe branch operand/,
  );
  await assert.rejects(
    backend.execute({ kind: "auto-merge", pullRequest: "--admin" }),
    /unsafe pull request operand/,
  );
});

function receipt(overrides = {}) {
  return delivery.createEvidenceReceipt({
    repoIdentity: "acme/demo",
    headSha: "abc123",
    featureMap: { path: "feature-map.md", sha256: "b".repeat(64) },
    skill: { path: "SKILL.md", sha256: "c".repeat(64) },
    deterministicChecks: {
      status: "green",
      checks: [
        { name: "typecheck", status: "passed" },
        { name: "tests", status: "passed" },
      ],
    },
    liveVerificationArtifacts: [
      { kind: "playwright-trace", path: "artifacts/trace.zip", sha256: "a".repeat(64) },
    ],
    independentReview: {
      status: "approved",
      reviewer: "reviewer-1",
      evidence: { path: "review.md", sha256: "d".repeat(64) },
    },
    evalResult: {
      status: "passed",
      evidence: { path: "eval.json", sha256: "e".repeat(64) },
    },
    reviewEvidence: { path: "review-evidence.json", sha256: "f".repeat(64) },
    evalEvidence: { path: "eval-evidence.json", sha256: "1".repeat(64) },
    artifactManifest: { path: "artifact-manifest.json", sha256: "2".repeat(64) },
    backend: "gh-stack",
    projectReadiness: "ready",
    origin: "human",
    ...overrides,
  });
}

test("complete receipt authorizes gh-stack auto-merge", () => {
  const allowed = delivery.authorizeDelivery({
    receipt: receipt(),
    currentHeadSha: "abc123",
    backend: "gh-stack",
    level: "auto-merge",
    projectReadiness: "ready",
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.backend, "gh-stack");
  assert.equal(allowed.draftOnly, false);
});

test("validateEvidenceReceipt rejects non-gh-stack backend values", () => {
  const reasons = delivery.validateEvidenceReceipt(receipt({ backend: "graphite" }));
  assert.match(reasons.join(" "), /backend/i);
});

test("negative controls fail closed for every delivery gate", () => {
  const cases = [
    ["stale head SHA", { currentHeadSha: "different" }, /stale head SHA/],
    ["missing evidence", { receipt: undefined }, /missing evidence receipt/],
    [
      "non-green checks",
      { receipt: receipt({ deterministicChecks: { status: "red", checks: [] } }) },
      /not green/,
    ],
    [
      "unresolved review",
      { receipt: receipt({ independentReview: { status: "unresolved", reviewer: "" } }) },
      /unresolved/,
    ],
    ["not-ready project", { projectReadiness: "not-ready" }, /project readiness/],
    ["Benny merge", { receipt: receipt({ origin: "benny" }), origin: "benny" }, /draft-only/],
    [
      "artifact without digest",
      {
        receipt: receipt({
          liveVerificationArtifacts: [{ kind: "trace", path: "artifacts/trace.zip" }],
        }),
      },
      /artifact digest/,
    ],
  ];
  for (const [, overrides, expected] of cases) {
    const result = delivery.authorizeDelivery({
      receipt: receipt(),
      currentHeadSha: "abc123",
      backend: "gh-stack",
      level: "auto-merge",
      projectReadiness: "ready",
      ...overrides,
    });
    assert.equal(result.allowed, false);
    assert.match(result.reasons.join(" "), expected);
  }
  const bennyDraft = delivery.authorizeDelivery({
    receipt: receipt({ origin: "benny" }),
    currentHeadSha: "abc123",
    backend: "gh-stack",
    level: "pr",
    projectReadiness: "ready",
    origin: "benny",
  });
  assert.equal(bennyDraft.allowed, true);
  assert.equal(bennyDraft.draftOnly, true);
});

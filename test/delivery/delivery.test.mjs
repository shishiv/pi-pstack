import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const delivery = await jiti.import("../../src/delivery/index.ts");

function runnerFor(backend) {
  const calls = [];
  return {
    calls,
    async run(argv) {
      calls.push([...argv]);
      if (argv[0] === "gh" && argv.includes("view")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            trunk: "main",
            currentBranch: "feature",
            branches: [
              {
                name: "feature",
                head: "abc123",
                pr: { number: 42, url: "https://github.com/acme/demo/pull/42" },
              },
            ],
          }),
          stderr: "",
        };
      }
      if (argv.includes("log")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            repoIdentity: "acme/demo",
            headSha: "abc123",
            pullRequest: "42",
          }),
          stderr: "",
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ pullRequest: "42", headSha: "abc123" }),
        stderr: "",
      };
    },
    backend,
  };
}

for (const [label, Backend, expectedCommand] of [
  ["gh stack", delivery.GhStackBackend, "gh"],
  ["Graphite", delivery.GraphiteBackend, "gt"],
]) {
  test(`${label} adapter translates argv and parses fixture output`, async () => {
    const runner = runnerFor(label);
    const backend = new Backend(runner);
    const snapshot = await backend.inspect();
    assert.equal(snapshot.backend, label === "gh stack" ? "gh-stack" : "graphite");
    if (label === "gh stack") {
      assert.equal(snapshot.headSha, "abc123");
      assert.equal(snapshot.pullRequest, "https://github.com/acme/demo/pull/42");
    }
    const result = await backend.execute({ kind: "submit", draft: true });
    assert.equal(result.accepted, true);
    assert.equal(result.pullRequest, "42");
    assert.equal(runner.calls[0][0], expectedCommand);
    assert.ok(runner.calls.every((argv) => Array.isArray(argv)));
  });
}

test("gh stack adapter emits only documented non-interactive commands", async () => {
  const runner = runnerFor("gh stack");
  const backend = new delivery.GhStackBackend(runner);
  await backend.inspect();
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

test("Graphite adapter emits documented non-interactive commands", async () => {
  const runner = runnerFor("Graphite");
  const backend = new delivery.GraphiteBackend(runner);
  await backend.inspect();
  await backend.execute({ kind: "prepare", branch: "feature" });
  await backend.execute({ kind: "submit", draft: true });
  await backend.execute({ kind: "sync" });
  await backend.execute({ kind: "rebase" });
  await backend.execute({ kind: "auto-merge" });
  assert.deepEqual(runner.calls, [
    ["gt", "log", "short", "--stack", "--reverse"],
    ["gt", "create", "feature", "--no-interactive"],
    ["gt", "submit", "--draft", "--no-edit", "--no-interactive"],
    ["gt", "sync", "--no-interactive"],
    ["gt", "restack", "--no-interactive"],
    [
      "gt",
      "submit",
      "--merge-when-ready",
      "--always",
      "--update-only",
      "--no-edit",
      "--no-interactive",
    ],
  ]);
});

test("Graphite is capability-gated while gh stack remains the default", () => {
  const runner = runnerFor("both");
  const withoutGt = delivery.createDeliveryBackends({ runner, availableCommands: ["gh"] });
  assert.ok(withoutGt.ghStack);
  assert.equal(withoutGt.graphite, undefined);
  assert.equal(delivery.isGraphiteAvailable(["gh", { name: "other" }]), false);
  const withGt = delivery.createDeliveryBackends({ runner, availableCommands: ["gh", "gt"] });
  assert.ok(withGt.graphite);
});

test("stack adapters reject flag-shaped branch and pull request operands", async () => {
  const backend = new delivery.GhStackBackend(runnerFor("gh stack"));
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

test("complete receipt authorizes only the selected backend action", () => {
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
  const wrongBackend = delivery.authorizeDelivery({
    receipt: receipt(),
    currentHeadSha: "abc123",
    backend: "graphite",
    level: "auto-merge",
    projectReadiness: "ready",
  });
  assert.equal(wrongBackend.allowed, false);
  assert.match(wrongBackend.reasons.join(" "), /backend/i);
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

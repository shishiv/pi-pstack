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
      if (argv.includes("status") || argv.includes("log")) {
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
    assert.equal(snapshot.headSha, "abc123");
    assert.equal(snapshot.repoIdentity, "acme/demo");
    const result = await backend.execute({ kind: "pr", title: "Ship", body: "Proof", draft: true });
    assert.equal(result.accepted, true);
    assert.equal(result.pullRequest, "42");
    assert.equal(runner.calls[0][0], expectedCommand);
    assert.ok(runner.calls[1].includes("--draft"));
    assert.ok(runner.calls.every((argv) => Array.isArray(argv)));
  });
}

test("Graphite is capability-gated while gh stack remains the default", () => {
  const runner = runnerFor("both");
  const withoutGt = delivery.createDeliveryBackends({ runner, availableCommands: ["gh"] });
  assert.ok(withoutGt.ghStack);
  assert.equal(withoutGt.graphite, undefined);
  assert.equal(delivery.isGraphiteAvailable(["gh", { name: "other" }]), false);
  const withGt = delivery.createDeliveryBackends({ runner, availableCommands: ["gh", "gt"] });
  assert.ok(withGt.graphite);
});

function receipt(overrides = {}) {
  return delivery.createEvidenceReceipt({
    repoIdentity: "acme/demo",
    headSha: "abc123",
    featureMapRevision: "feature-map@1",
    skillRevision: "skill@1",
    deterministicChecks: {
      status: "green",
      checks: [
        { name: "typecheck", status: "passed" },
        { name: "tests", status: "passed" },
      ],
    },
    liveVerificationArtifacts: [{ kind: "playwright-trace", path: "artifacts/trace.zip" }],
    independentReview: { status: "approved", reviewer: "reviewer-1" },
    evalResult: { status: "passed", revision: "eval@1" },
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

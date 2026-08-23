import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { restoreModeState, modeStateEntry } = await jiti.import("../../src/mode/state.ts");
const { preflightCapabilities } = await jiti.import("../../src/capabilities/preflight.ts");
const { resolveModelRoles } = await jiti.import("../../src/models/roles.ts");
const { registerBennyAdapterProvider } = await jiti.import("../../src/benny/index.ts");
const { gradeCandidate } = await jiti.import("../../src/evals/index.ts");
const { default: potetoModeExtension } = await jiti.import("../../extensions/poteto-mode.ts");

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function writeRuntimeEvidence(project, repoIdentity = "acme/demo", headSha = "abc123") {
  const featureMap = `# Feature map: demo

## feature: save
- user goal: save a document
- route: /editor
- expected state: saved
- broken state: not saved
- prerequisites: none
- evidence: screenshot, trace, cleanup
`;
  const skill = "---\nname: verify-demo\ndescription: Verify demo.\n---\n";
  const rawReview = "independent review\nVERIFIED\n";
  const evalCase = {
    id: "receipt-runtime",
    targetSkill: "verify-demo",
    fixture: {},
    input: { request: "prove it" },
    requiredAssertions: [{ kind: "required-text", text: "OK" }],
    prohibitedBehaviors: ["FORBIDDEN"],
    dependencySkills: [],
    evidenceExpectations: { required: [] },
  };
  const evalCaseText = JSON.stringify(evalCase);
  const candidateA = "OK\n";
  const candidateB = "not okay\n";
  const judge = { winner: "Candidate A", rationale: "blind comparison" };
  const judgeText = JSON.stringify(judge);
  const files = [
    ["feature-map.md", featureMap],
    ["SKILL.md", skill],
    ["raw-review.md", rawReview],
    ["eval-case.json", evalCaseText],
    ["candidate-a.txt", candidateA],
    ["candidate-b.txt", candidateB],
    ["judge.json", judgeText],
    ["screenshot.png", "png"],
    ["trace.zip", "trace"],
  ];
  for (const [path, content] of files) await writeFile(join(project, path), content, "utf8");
  await writeFile(
    join(project, "review.json"),
    JSON.stringify({
      version: 1,
      type: "review-evidence",
      repoIdentity,
      headSha,
      reviewer: "reviewer",
      runId: "review-run",
      verdict: "VERIFIED",
      rawReview: { path: "raw-review.md", sha256: digest(rawReview) },
    }),
  );
  const gradeA = gradeCandidate(evalCase, { text: candidateA });
  const gradeB = gradeCandidate(evalCase, { text: candidateB });
  await writeFile(
    join(project, "eval.json"),
    JSON.stringify({
      version: 1,
      type: "eval-evidence",
      repoIdentity,
      headSha,
      caseId: evalCase.id,
      baselineId: "approved-baseline-1",
      evalCase: { path: "eval-case.json", sha256: digest(evalCaseText) },
      targetSkill: { path: "SKILL.md", sha256: digest(skill) },
      candidates: [
        {
          label: "Candidate A",
          current: true,
          baseline: false,
          output: { path: "candidate-a.txt", sha256: digest(candidateA) },
          grade: gradeA,
        },
        {
          label: "Candidate B",
          current: false,
          baseline: true,
          output: { path: "candidate-b.txt", sha256: digest(candidateB) },
          grade: gradeB,
        },
      ],
      judgeEvidence: { path: "judge.json", sha256: digest(judgeText) },
      judge,
      aggregate: {
        accepted: true,
        winner: "Candidate A",
        reason: "Candidate A is the only candidate passing hard assertions.",
      },
    }),
  );
  await writeFile(
    join(project, "artifact-manifest.json"),
    JSON.stringify({
      version: 1,
      screenshot: "screenshot.png",
      trace: "trace.zip",
      cleanupResult: "passed",
    }),
  );
  return {
    backend: "gh-stack",
    featureMapPath: "feature-map.md",
    skillPath: "SKILL.md",
    reviewPath: "review.json",
    evalPath: "eval.json",
    artifactManifestPath: "artifact-manifest.json",
  };
}

function fakeRuntime({
  entries = [],
  tools = ["subagent", "mcp", "ask"],
  commands = ["poteto-mode"],
  models = [],
  exec = async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
} = {}) {
  let currentEntries = entries;
  const handlers = new Map();
  const commandsByName = new Map();
  const toolsByName = new Map();
  const entriesWritten = [];
  const messages = [];
  const notices = [];
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerCommand(name, options) {
      commandsByName.set(name, options.handler);
    },
    registerTool(definition) {
      toolsByName.set(definition.name, definition);
    },
    appendEntry(type, data) {
      entriesWritten.push({ type, data });
    },
    sendUserMessage(message, options) {
      messages.push({ message, options });
    },
    getAllTools() {
      return tools.map((name) => ({ name }));
    },
    getCommands() {
      return commands.map((name) => ({ name, source: "extension", sourceInfo: {} }));
    },
    exec,
    events: {},
    sessionManager: {
      getBranch() {
        return currentEntries;
      },
      getEntries() {
        return currentEntries;
      },
    },
  };
  const ctx = {
    mode: "tui",
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      notify(message, type) {
        notices.push({ message, type });
      },
    },
    sessionManager: pi.sessionManager,
    modelRegistry: {
      getAvailable() {
        return models;
      },
    },
    isIdle() {
      return true;
    },
    isProjectTrusted() {
      return true;
    },
  };
  potetoModeExtension(pi);
  return {
    pi,
    ctx,
    handlers,
    commandsByName,
    toolsByName,
    entriesWritten,
    messages,
    notices,
    setEntries(next) {
      currentEntries = next;
    },
  };
}

test("mode state restores only the latest entry in the active branch", () => {
  assert.deepEqual(
    restoreModeState([
      { type: "custom", customType: "poteto-mode", data: { active: true } },
      { type: "custom", customType: "other", data: {} },
      { type: "custom", customType: "poteto-mode", data: { active: false } },
    ]),
    { active: false },
  );
  assert.deepEqual(modeStateEntry(true), { active: true });
});

test("capability preflight reports missing tools, commands, and roles", () => {
  const result = preflightCapabilities({
    tools: [{ name: "subagent" }],
    commands: [{ name: "other" }],
    availableModels: [],
    requiredCommands: ["poteto-mode"],
    requiredRoles: ["reasoning"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingTools, ["ask"]);
  assert.deepEqual(result.missingCommands, ["poteto-mode"]);
  assert.deepEqual(result.missingRoles, ["reasoning"]);
});

test("model roles resolve from scoped available Pi models and never invent ids", () => {
  const models = [
    { provider: "one", id: "quick", reasoning: false },
    { provider: "two", id: "deep", reasoning: true },
  ];
  const result = resolveModelRoles({
    availableModels: models,
    scopedModels: [{ model: models[1] }],
    roles: ["reasoning"],
  });
  assert.equal(result.resolved.reasoning, models[1]);
  assert.equal(Object.keys(result.resolved).length, 1);
  assert.deepEqual(resolveModelRoles({ availableModels: [], roles: ["fast"] }).missingRoles, [
    "fast",
  ]);
});

test("extension commands persist, restore, isolate, and inject loaded skill content", async () => {
  const first = fakeRuntime();
  await first.handlers.get("session_start")?.({}, first.ctx);
  await first.commandsByName.get("poteto-mode")?.("on", first.ctx);
  assert.deepEqual(first.entriesWritten.at(-1), { type: "poteto-mode", data: { active: true } });
  await first.commandsByName.get("poteto-mode")?.("do the work", first.ctx);
  assert.equal(first.messages[0].message, "do the work");
  const skill = {
    name: "poteto-mode",
    filePath: new URL("../../skills/poteto-mode/SKILL.md", import.meta.url).pathname,
  };
  const injected = await first.handlers.get("before_agent_start")?.(
    { systemPrompt: "base", systemPromptOptions: { skills: [skill] } },
    first.ctx,
  );
  assert.match(injected.systemPrompt, /# Poteto mode/);

  const restored = fakeRuntime({
    entries: [{ type: "custom", customType: "poteto-mode", data: { active: true } }],
  });
  await restored.handlers.get("session_start")?.({}, restored.ctx);
  await restored.commandsByName.get("poteto-mode")?.("status", restored.ctx);
  assert.match(restored.notices.at(-1).message, /active/i);

  const isolated = fakeRuntime();
  await isolated.handlers.get("session_start")?.({}, isolated.ctx);
  await isolated.commandsByName.get("poteto-mode")?.("status", isolated.ctx);
  assert.match(isolated.notices.at(-1).message, /off|inactive/i);
});

test("task fails closed when a required runtime capability is unavailable", async () => {
  const runtime = fakeRuntime({ tools: ["ask", "mcp"] });
  await runtime.handlers.get("session_start")?.({}, runtime.ctx);
  await runtime.commandsByName.get("poteto-mode")?.("task", runtime.ctx);
  assert.equal(runtime.messages.length, 0);
  assert.match(runtime.notices.at(-1).message, /subagent/);
});

test("task remains available when only optional MCP evidence is unavailable", async () => {
  const runtime = fakeRuntime({ tools: ["subagent", "ask"] });
  await runtime.handlers.get("session_start")?.({}, runtime.ctx);
  await runtime.commandsByName.get("poteto-mode")?.("task", runtime.ctx);
  assert.equal(runtime.messages.length, 1);
});

test("one extension instance resets sticky state when Pi switches sessions", async () => {
  const runtime = fakeRuntime({
    entries: [{ type: "custom", customType: "poteto-mode", data: { active: true } }],
  });
  await runtime.handlers.get("session_start")?.({}, runtime.ctx);
  await runtime.commandsByName.get("poteto-mode")?.("status", runtime.ctx);
  assert.match(runtime.notices.at(-1).message, /active/i);
  runtime.setEntries([]);
  await runtime.handlers.get("session_start")?.({ reason: "new" }, runtime.ctx);
  await runtime.commandsByName.get("poteto-mode")?.("status", runtime.ctx);
  assert.match(runtime.notices.at(-1).message, /off/i);
});

test("verification tool generates a registered project-local skill", async () => {
  const project = await mkdtemp(join(tmpdir(), "pstack-tool-project-"));
  try {
    const runtime = fakeRuntime();
    runtime.ctx.cwd = project;
    const tool = runtime.toolsByName.get("pstack_create_verification");
    assert.ok(tool);
    const result = await tool.execute(
      "call-1",
      {
        app: "demo-app",
        features: [
          {
            id: "save",
            userGoal: "Save a document",
            route: "/",
            source: "src/save.ts",
            role: "button",
            name: "Save",
            dataTestId: "save",
            expectedState: "saved",
            brokenState: "error",
            prerequisites: [],
            evidence: ["screenshot", "accessibility", "trace", "cleanup"],
          },
        ],
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.equal(result.details.changed, true);
    assert.match(
      await readFile(join(project, ".pi", "skills", "verify-demo-app", "SKILL.md"), "utf8"),
      /name: verify-demo-app/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("verification tool returns a rejection when feature-map validation throws", async () => {
  const runtime = fakeRuntime();
  const result = await runtime.toolsByName.get("pstack_create_verification").execute(
    "invalid-verification",
    {
      app: "../escape",
      features: [],
    },
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.equal(result.details.rejected, true);
  assert.match(result.content[0].text, /creation rejected/i);
});

test("delivery tool and bash hook reject an unreceipted merge", async () => {
  const calls = [];
  const runtime = fakeRuntime({
    exec: async (command, args) => {
      calls.push([command, ...args]);
      if (command === "git" && args[0] === "status")
        return { code: 0, stdout: "", stderr: "", killed: false };
      if (command === "git") return { code: 0, stdout: "abc123\n", stderr: "", killed: false };
      if (command === "gh" && args[0] === "repo")
        return { code: 0, stdout: "acme/demo\n", stderr: "", killed: false };
      return { code: 0, stdout: "{}", stderr: "", killed: false };
    },
  });
  const deliveryTool = runtime.toolsByName.get("pstack_delivery");
  assert.ok(deliveryTool);
  const rejected = await deliveryTool.execute(
    "call-2",
    { backend: "gh-stack", operation: "auto-merge", pullRequest: "42" },
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.match(rejected.content[0].text, /rejected/i);
  assert.equal(
    calls.some((argv) => argv.includes("merge")),
    false,
  );

  await runtime.commandsByName.get("poteto-mode")?.("on", runtime.ctx);
  const blocked = await runtime.handlers.get("tool_call")?.(
    { toolName: "bash", input: { command: "gh stack merge --yes" } },
    runtime.ctx,
  );
  assert.equal(blocked.block, true);
});

test("delivery tool requires receipts for every mutation and receipts are human-origin", async () => {
  const project = await mkdtemp(join(tmpdir(), "pstack-receipt-tool-"));
  const calls = [];
  const runtime = fakeRuntime({
    exec: async (command, args) => {
      calls.push([command, ...args]);
      if (command === "git" && args[0] === "status")
        return { code: 0, stdout: "", stderr: "", killed: false };
      if (command === "git") return { code: 0, stdout: "abc123\n", stderr: "", killed: false };
      if (command === "gh" && args[0] === "repo")
        return { code: 0, stdout: "acme/demo\n", stderr: "", killed: false };
      return { code: 0, stdout: "{}", stderr: "", killed: false };
    },
  });
  runtime.ctx.cwd = project;
  const tool = runtime.toolsByName.get("pstack_delivery");
  const withoutReceipt = await tool.execute(
    "call-3",
    { backend: "gh-stack", operation: "submit", draft: false },
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.match(withoutReceipt.content[0].text, /rejected/i);
  assert.equal(
    calls.some((argv) => argv.includes("submit")),
    false,
  );
  for (const operation of [
    { operation: "prepare", branch: "feature" },
    { operation: "sync" },
    { operation: "rebase" },
    { operation: "auto-merge", pullRequest: "42" },
  ]) {
    const rejected = await tool.execute(
      `missing-${operation.operation}`,
      { backend: "gh-stack", ...operation },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(rejected.content[0].text, /receipt/i, operation.operation);
  }

  const receiptParams = await writeRuntimeEvidence(project);
  const receiptTool = runtime.toolsByName.get("pstack_create_receipt");
  const created = await receiptTool.execute(
    "call-receipt",
    receiptParams,
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.equal(created.details.receipt.origin, "human");
  assert.equal(
    calls.some((argv) => argv[0] === "node"),
    false,
  );
  const benny = await tool.execute(
    "call-4",
    { backend: "gh-stack", operation: "submit", draft: false, receiptPath: created.details.path },
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.match(benny.content[0].text, /completed/i);
  assert.equal(
    calls.some((argv) => argv.includes("submit")),
    true,
  );
  const draft = await tool.execute(
    "call-5",
    { backend: "gh-stack", operation: "submit", draft: true, receiptPath: created.details.path },
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.match(draft.content[0].text, /completed/i);
  assert.equal(
    calls.some((argv) => argv.includes("submit")),
    true,
  );
  await rm(project, { recursive: true, force: true });
});

test("receipt creation rejects tracked changes before writing evidence", async () => {
  const project = await mkdtemp(join(tmpdir(), "pstack-dirty-receipt-"));
  const runtime = fakeRuntime({
    exec: async (command, args) => {
      if (command === "git" && args[0] === "status")
        return { code: 0, stdout: " M tracked.txt\n", stderr: "", killed: false };
      if (command === "git") return { code: 0, stdout: "abc123\n", stderr: "", killed: false };
      if (command === "gh" && args[0] === "repo")
        return { code: 0, stdout: "acme/demo\n", stderr: "", killed: false };
      return { code: 0, stdout: "{}", stderr: "", killed: false };
    },
  });
  runtime.ctx.cwd = project;
  try {
    const result = await runtime.toolsByName.get("pstack_create_receipt").execute(
      "dirty",
      {
        backend: "gh-stack",
        featureMapPath: "feature-map.md",
        skillPath: "SKILL.md",
        reviewPath: "review.md",
        evalPath: "eval.json",
        artifactManifestPath: "artifact-manifest.json",
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(result.content[0].text, /tracked changes/i);
    await assert.rejects(readFile(join(project, ".pi", "pstack", "receipts")), /ENOENT/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("delivery revalidates receipt semantics before checking file digests", async () => {
  const project = await mkdtemp(join(tmpdir(), "pstack-invalid-receipt-"));
  const runtime = fakeRuntime({
    exec: async (command, args) => {
      if (command === "git") return { code: 0, stdout: "abc123\n", stderr: "", killed: false };
      if (command === "gh" && args[0] === "repo")
        return { code: 0, stdout: "acme/demo\n", stderr: "", killed: false };
      return { code: 0, stdout: "{}", stderr: "", killed: false };
    },
  });
  runtime.ctx.cwd = project;
  try {
    await mkdir(join(project, ".pi", "pstack", "receipts"), { recursive: true });
    const path = join(project, ".pi", "pstack", "receipts", "bad.json");
    await writeFile(path, JSON.stringify({ version: 999, headSha: "abc123" }), "utf8");
    const result = await runtime.toolsByName.get("pstack_delivery").execute(
      "invalid",
      {
        backend: "gh-stack",
        operation: "submit",
        draft: true,
        receiptPath: ".pi/pstack/receipts/bad.json",
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(result.content[0].text, /unsupported evidence receipt version/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("auto-merge binds a verified receipt to the live pull request head and checks", async () => {
  const project = await mkdtemp(join(tmpdir(), "pstack-merge-tool-"));
  let pullRequestHead = "abc123";
  let checkRollup = [{ state: "SUCCESS" }];
  let stackBranches = [
    {
      name: "feature",
      head: "abc123",
      base: "000000",
      isMerged: false,
      pr: { number: 42, state: "OPEN" },
    },
  ];
  const calls = [];
  const runtime = fakeRuntime({
    exec: async (command, args) => {
      calls.push([command, ...args]);
      if (command === "git" && args[0] === "status")
        return { code: 0, stdout: "", stderr: "", killed: false };
      if (command === "git") return { code: 0, stdout: "abc123\n", stderr: "", killed: false };
      if (command === "gh" && args[0] === "repo")
        return { code: 0, stdout: "acme/demo\n", stderr: "", killed: false };
      if (command === "gh" && args[0] === "stack" && args[1] === "view")
        return {
          code: 0,
          stdout: JSON.stringify({ branches: stackBranches }),
          stderr: "",
          killed: false,
        };
      if (command === "gh" && args[0] === "pr")
        return {
          code: 0,
          stdout: JSON.stringify({
            headRefOid: pullRequestHead,
            isDraft: false,
            mergeStateStatus: "CLEAN",
            statusCheckRollup: checkRollup,
          }),
          stderr: "",
          killed: false,
        };
      return { code: 0, stdout: "{}", stderr: "", killed: false };
    },
  });
  runtime.ctx.cwd = project;
  try {
    const receiptParams = await writeRuntimeEvidence(project);
    const receipt = await runtime.toolsByName
      .get("pstack_create_receipt")
      .execute("receipt", receiptParams, undefined, undefined, runtime.ctx);
    const delivered = await runtime.toolsByName.get("pstack_delivery").execute(
      "merge",
      {
        backend: "gh-stack",
        operation: "auto-merge",
        pullRequest: "42",
        receiptPath: receipt.details.path,
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(delivered.content[0].text, /completed/i);
    assert.equal(
      calls.some((argv) => argv.join(" ").includes("stack merge 42 --yes")),
      true,
    );

    checkRollup = [{ status: "IN_PROGRESS", conclusion: "" }];
    const mergesAfterSuccess = calls.filter((argv) => argv.includes("merge")).length;
    const pending = await runtime.toolsByName.get("pstack_delivery").execute(
      "merge-pending",
      {
        backend: "gh-stack",
        operation: "auto-merge",
        pullRequest: "42",
        receiptPath: receipt.details.path,
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(pending.content[0].text, /checks are not green/i);
    assert.equal(calls.filter((argv) => argv.includes("merge")).length, mergesAfterSuccess);
    checkRollup = [{ state: "SUCCESS" }];

    stackBranches = [
      {
        name: "feature",
        head: "abc123",
        base: "def456",
        isMerged: false,
        pr: { number: 42, state: "OPEN" },
      },
      {
        name: "foundation",
        head: "def456",
        base: "000000",
        isMerged: false,
        pr: { number: 41, state: "OPEN" },
      },
    ];
    const incompleteStack = await runtime.toolsByName.get("pstack_delivery").execute(
      "merge-incomplete-stack",
      {
        backend: "gh-stack",
        operation: "auto-merge",
        pullRequest: "42",
        receiptPath: receipt.details.path,
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(incompleteStack.content[0].text, /missing exact-head receipts.*#41/i);

    for (const [name, malformed] of [
      [
        "multiple roots",
        [
          { name: "feature", head: "abc123", base: "000000", pr: { number: 42, state: "OPEN" } },
          { name: "other", head: "def456", base: "111111", pr: { number: 43, state: "OPEN" } },
        ],
      ],
      [
        "fork",
        [
          { name: "root", head: "def456", base: "000000", pr: { number: 41, state: "OPEN" } },
          { name: "feature", head: "abc123", base: "def456", pr: { number: 42, state: "OPEN" } },
          { name: "sibling", head: "aaa111", base: "def456", pr: { number: 43, state: "OPEN" } },
        ],
      ],
      [
        "cycle",
        [
          { name: "feature", head: "abc123", base: "def456", pr: { number: 42, state: "OPEN" } },
          { name: "parent", head: "def456", base: "abc123", pr: { number: 41, state: "OPEN" } },
        ],
      ],
    ]) {
      stackBranches = malformed;
      const topology = await runtime.toolsByName.get("pstack_delivery").execute(
        `merge-${name}`,
        {
          backend: "gh-stack",
          operation: "auto-merge",
          pullRequest: "42",
          receiptPath: receipt.details.path,
        },
        undefined,
        undefined,
        runtime.ctx,
      );
      assert.match(topology.content[0].text, /parentage|fork|cyclic/i, name);
    }

    stackBranches = [
      {
        name: "feature",
        head: "abc123",
        base: "000000",
        isMerged: false,
        pr: { number: 42, state: "OPEN" },
      },
    ];
    pullRequestHead = "different";
    const mergesBefore = calls.filter((argv) => argv.includes("merge")).length;
    const rejected = await runtime.toolsByName.get("pstack_delivery").execute(
      "merge-stale",
      {
        backend: "gh-stack",
        operation: "auto-merge",
        pullRequest: "42",
        receiptPath: receipt.details.path,
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.match(rejected.content[0].text, /does not match/i);
    assert.equal(calls.filter((argv) => argv.includes("merge")).length, mergesBefore);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("active mode blocks direct merge variants and allows ordinary gh reads", async () => {
  const runtime = fakeRuntime();
  await runtime.commandsByName.get("poteto-mode")?.("on", runtime.ctx);
  const commands = [
    "git push origin main",
    "git -C repo push origin HEAD:main",
    "cd repo\ngh pr merge 42 --auto",
    'bash -c "gh stack merge --yes"',
    "$(gh pr merge 42)",
    "gh --repo acme/demo pr merge 42",
    "gh api --method PUT repos/acme/demo/pulls/42/merge",
    "gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:\"x\"}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input:{pullRequestId:\"x\"}) { clientMutationId } }'",
    "gh api --method POST repos/acme/demo/merges",
    "curl -X PUT https://api.github.test/repos/acme/demo/pulls/42/merge",
    "curl -X POST https://api.github.test/repos/acme/demo/merges",
    "gt merge",
    "gt submit --merge-when-ready",
  ];
  for (const command of commands) {
    const result = await runtime.handlers.get("tool_call")?.(
      { toolName: "bash", input: { command } },
      runtime.ctx,
    );
    assert.equal(result?.block, true, command);
  }
  for (const input of [
    { command: "gh", args: ["pr", "merge", "42", "--auto"] },
    { command: ["gh", "pr", "merge", "42"] },
    { payload: JSON.stringify({ command: "gh", argv: ["pr", "merge", "42"] }) },
  ]) {
    const result = await runtime.handlers.get("tool_call")?.(
      { toolName: "bash", input },
      runtime.ctx,
    );
    assert.equal(result?.block, true, JSON.stringify(input));
  }
  const mcpBlocked = await runtime.handlers.get("tool_call")?.(
    { toolName: "mcp", input: { tool: "github_merge_pull_request", args: { number: 42 } } },
    runtime.ctx,
  );
  assert.equal(mcpBlocked.block, true);
  assert.equal(
    await runtime.handlers.get("tool_call")?.(
      { toolName: "bash", input: { command: "gh pr view 42" } },
      runtime.ctx,
    ),
    undefined,
  );
});

test("Benny tool reaches the typed core and persistent ledger through a registered provider", async () => {
  const project = await mkdtemp(join(tmpdir(), "pstack-benny-tool-"));
  const writes = [];
  const dispose = registerBennyAdapterProvider({
    name: "runtime-fixture",
    async load() {
      return {
        slack: {
          async readThread() {
            return {
              channelId: "C1",
              rootTs: "100",
              permalink: "https://slack.test/C1/100",
              messages: [
                {
                  authorId: "reporter",
                  channelId: "C1",
                  ts: "100",
                  text: "Save is broken",
                },
              ],
            };
          },
          async postThreadReply(input) {
            writes.push(["reply", input]);
            return { id: "reply-1" };
          },
        },
        tracker: {
          async search() {
            return [];
          },
          async create() {
            writes.push(["ticket"]);
            return { id: "I1", url: "https://tracker.test/I1" };
          },
          async update() {},
          async compensate() {},
        },
      };
    },
  });
  try {
    const runtime = fakeRuntime();
    runtime.ctx.cwd = project;
    const tool = runtime.toolsByName.get("pstack_benny");
    const config = {
      schemaVersion: 1,
      automations: { triageName: "benny-triage", reproduceName: "benny-reproduce" },
      slack: {
        sourceChannelId: "C1",
        triageIdentityUserId: "U1",
        allowSourceRootPosts: false,
        allowWorkerSlackWrites: false,
      },
      tracker: {
        adapter: "runtime-fixture",
        team: "team",
        project: "project",
        labels: { bug: "bug", performance: "performance", intake: "intake" },
        status: "intake",
        requireCompensationAction: true,
      },
      repository: { url: "https://github.com/acme/demo", defaultBranch: "main", draftOnly: true },
      control: {
        adapter: "runtime-fixture",
        featureMapPath: ".pi/pstack/benny-config/feature-map.md",
        environment: "test",
        artifactDirectory: "artifacts/benny",
      },
      verdictMarkers: {
        bug: "[benny:bug]",
        performance: "[benny:performance]",
        other: "[benny:other]",
      },
      budgets: { pollSeconds: 60, reproMinutes: 60, fixMinutes: 90 },
    };
    const first = await tool.execute(
      "call-benny-1",
      {
        action: "triage",
        provider: "runtime-fixture",
        config,
        trigger: { channelId: "C1", ts: "100" },
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    const duplicate = await tool.execute(
      "call-benny-2",
      {
        action: "triage",
        provider: "runtime-fixture",
        config,
        trigger: { channelId: "C1", ts: "100" },
      },
      undefined,
      undefined,
      runtime.ctx,
    );
    assert.equal(first.details.status, "completed");
    assert.equal(duplicate.details.status, "duplicate");
    assert.deepEqual(
      writes.map(([kind]) => kind),
      ["ticket", "reply"],
    );
  } finally {
    dispose();
    await rm(project, { recursive: true, force: true });
  }
});

test("Benny blocks an unavailable provider without writes", async () => {
  const runtime = fakeRuntime();
  const result = await runtime.toolsByName
    .get("pstack_benny")
    .execute(
      "missing-provider",
      { action: "triage", provider: "not-installed", config: {} },
      undefined,
      undefined,
      runtime.ctx,
    );
  assert.equal(result.details.status, "blocked");
  assert.equal(result.details.writes, 0);
});

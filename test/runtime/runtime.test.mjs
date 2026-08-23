import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { restoreModeState, modeStateEntry } = await jiti.import("../../src/mode/state.ts");
const { preflightCapabilities } = await jiti.import("../../src/capabilities/preflight.ts");
const { resolveModelRoles } = await jiti.import("../../src/models/roles.ts");
const { default: potetoModeExtension } = await jiti.import("../../extensions/poteto-mode.ts");

function fakeRuntime({
  entries = [],
  tools = ["subagent", "mcp", "ask"],
  commands = ["poteto-mode"],
  models = [],
  exec = async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
} = {}) {
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
        return entries;
      },
      getEntries() {
        return entries;
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
  return { pi, ctx, handlers, commandsByName, toolsByName, entriesWritten, messages, notices };
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

test("delivery tool and bash hook reject an unreceipted merge", async () => {
  const calls = [];
  const runtime = fakeRuntime({
    exec: async (command, args) => {
      calls.push([command, ...args]);
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

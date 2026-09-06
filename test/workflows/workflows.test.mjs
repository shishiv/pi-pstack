import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const workflows = await jiti.import("../../src/workflows/delegation.ts");
const sessions = await jiti.import("../../src/workflows/sessions.ts");

test("delegation tasks preserve semantic roles and derive access", () => {
  const inspect = workflows.createDelegationTask({
    role: "review",
    task: "Review the diff",
  });
  const change = workflows.createDelegationTask({
    role: "implement",
    task: "Implement the fix",
    cwd: "/tmp/worktree",
    model: "provider/model",
  });
  assert.deepEqual(inspect, {
    role: "review",
    task: "Review the diff",
  });
  assert.equal(workflows.delegationAccess(inspect.role), "read-only");
  assert.equal(workflows.delegationAccess(change.role), "workspace-write");
  assert.equal(change.cwd, "/tmp/worktree");
  assert.equal(change.model, "provider/model");
  assert.throws(
    () => workflows.createDelegationTask({ role: "explore", task: "  " }),
    /must not be empty/,
  );
});

test("Pi CLI arguments enforce read-only tools without claiming isolation", () => {
  const inspect = workflows.createDelegationTask({
    role: "explore",
    task: "Inspect",
  });
  const args = workflows.buildPiCliArguments(inspect, {
    model: "provider/model",
    thinkingLevel: "high",
  });
  assert.deepEqual(args.slice(0, 4), ["--mode", "json", "-p", "--no-session"]);
  assert.ok(args.includes("read,grep,find,ls"));
  assert.ok(args.includes("provider/model"));
  assert.match(args.at(-1), /Do not edit files or perform external writes/);
  assert.doesNotMatch(args.join(" "), /sandbox|worktree/i);
});

test("Pi CLI execution requires a clean exit and final assistant message", async () => {
  const task = workflows.createDelegationTask({
    role: "review",
    task: "Review",
  });
  const script = [
    'console.log(JSON.stringify({type:"session",id:"child-session"}));',
    'console.log(JSON.stringify({type:"message_end",message:{role:"assistant",content:[{type:"text",text:"reviewed"}],model:"provider/model",stopReason:"stop"}}));',
  ].join("");
  const result = await workflows.runPiDelegation(task, {
    cwd: process.cwd(),
    invocation: { command: process.execPath, prefixArgs: ["-e", script, "--"] },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.output, "reviewed");
  assert.deepEqual(result.evidence, {
    executor: "pi-cli",
    exitCode: 0,
    finalMessage: true,
    outputTruncated: false,
    sessionId: "child-session",
    model: "provider/model",
    stopReason: "stop",
  });
});

test("Pi CLI execution reports failure and cancellation distinctly", async () => {
  const task = workflows.createDelegationTask({ role: "implement", task: "Work" });
  const unfinished = await workflows.runPiDelegation(task, {
    cwd: process.cwd(),
    invocation: {
      command: process.execPath,
      prefixArgs: [
        "-e",
        'console.log(JSON.stringify({type:"message_end",message:{role:"assistant",content:[],stopReason:"toolUse"}}))',
        "--",
      ],
    },
  });
  assert.equal(unfinished.status, "failed");
  assert.match(unfinished.error, /toolUse/);

  const failed = await workflows.runPiDelegation(task, {
    cwd: process.cwd(),
    invocation: {
      command: process.execPath,
      prefixArgs: ["-e", 'process.stderr.write("boom"); process.exit(3)', "--"],
    },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.evidence.exitCode, 3);
  assert.match(failed.error, /boom/);

  const controller = new AbortController();
  const pending = workflows.runPiDelegation(task, {
    cwd: process.cwd(),
    signal: controller.signal,
    invocation: {
      command: process.execPath,
      prefixArgs: ["-e", "setInterval(() => {}, 1000)", "--"],
    },
  });
  setTimeout(() => controller.abort(), 25);
  const cancelled = await pending;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.evidence.finalMessage, false);
});

test("session discovery stays inside the active project and parses only supplied JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-"));
  const projectA = join(root, "project-a");
  const projectB = join(root, "project-b");
  await mkdir(projectA);
  await mkdir(projectB);
  const active = join(projectA, "active.jsonl");
  await writeFile(
    active,
    '{"type":"message","text":"ok"}\nnot-json\n{"type":"message","text":"still"}\n',
  );
  await writeFile(join(projectB, "unrelated.jsonl"), '{"text":"secret"}\n');
  const found = sessions.discoverSessionFiles({
    piSessionFile: active,
    projectDirectory: projectA,
  });
  assert.deepEqual(found, [active]);
  const parsed = sessions.parseSessionJsonl(await sessions.readSessionFile(active));
  assert.deepEqual(parsed.entries, [
    { type: "message", text: "ok" },
    { type: "message", text: "still" },
  ]);
  assert.equal(parsed.invalidLines, 1);
  assert.deepEqual(
    sessions.discoverSessionFiles({ piSessionFile: active, projectDirectory: projectB }),
    [],
  );
});

test("session discovery recognizes Pi's wrapped project directory slug", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-store-"));
  const project = join(root, "workspace", "app");
  const slug = project.replace(/^[/\\]+/, "").replace(/[\\/]/g, "-");
  const projectSessions = join(root, `--${slug}--`);
  await mkdir(project, { recursive: true });
  await mkdir(projectSessions);
  const active = join(projectSessions, "active.jsonl");
  await writeFile(active, '{"type":"session"}\n');

  assert.deepEqual(
    sessions.discoverSessionFiles({ piSessionFile: active, projectDirectory: project }),
    [active],
  );
});

test("session discovery rejects an unrelated path that merely contains the project basename", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-impostor-"));
  const project = join(root, "workspace", "app");
  const impostorDirectory = join(root, "other", "app");
  await mkdir(project, { recursive: true });
  await mkdir(impostorDirectory, { recursive: true });
  const impostor = join(impostorDirectory, "active.jsonl");
  await writeFile(impostor, '{"type":"session"}\n');

  assert.deepEqual(
    sessions.discoverSessionFiles({ piSessionFile: impostor, projectDirectory: project }),
    [],
  );
});

test("session discovery rejects a project-slug JSONL basename outside Pi's session layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-slug-impostor-"));
  const project = join(root, "workspace", "app");
  await mkdir(project, { recursive: true });
  const slug = project.replace(/^[/\\]+/, "").replace(/[\\/]/g, "-");
  const impostor = join(root, `--${slug}--.jsonl`);
  await writeFile(impostor, '{"type":"session"}\n');

  assert.deepEqual(
    sessions.discoverSessionFiles({ piSessionFile: impostor, projectDirectory: project }),
    [],
  );
});

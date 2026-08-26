import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const home = await mkdtemp(join(tmpdir(), "pi-pstack-pbrain-e2e-home-"));
const cwd = join(home, "workspace");
const agentDir = join(home, ".pi", "agent");
await mkdir(cwd, { recursive: true });
await mkdir(agentDir, { recursive: true });
const env = {
  ...process.env,
  HOME: home,
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: "1",
  PI_SKIP_VERSION_CHECK: "1",
  PI_TELEMETRY: "0",
};

try {
  for (const source of [
    join(root, "node_modules", "pi-subagents"),
    root,
    join(root, "fixtures", "pbrain-package"),
  ]) {
    const install = spawnSync("pi", ["install", source], { cwd, encoding: "utf8", env });
    assert.equal(install.status, 0, `pi install failed\n${install.stdout}\n${install.stderr}`);
  }
  const brain = join(cwd, "brain");
  const ownedPath = join(brain, "owned.md");
  await mkdir(brain);
  await writeFile(ownedPath, "provider-owned\n");
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
  const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: settings });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: SessionManager.inMemory(cwd),
  });
  try {
    await session.bindExtensions({ mode: "print" });
    assert.equal(await session._tryExecuteExtensionCommand("/poteto-mode on"), true);
    const first = await session._extensionRunner.emitBeforeAgentStart(
      "fixture",
      undefined,
      session.systemPrompt,
      session._baseSystemPromptOptions,
    );
    const second = await session._extensionRunner.emitBeforeAgentStart(
      "fixture",
      undefined,
      first.systemPrompt,
      session._baseSystemPromptOptions,
    );
    for (const prompt of [first.systemPrompt, second.systemPrompt]) {
      assert.equal((prompt.match(/## Loaded skill:/g) ?? []).length, 1);
      assert.equal((prompt.match(/brainmaxxing:context:start/g) ?? []).length, 1);
      assert.equal((prompt.match(/brainmaxxing:context:end/g) ?? []).length, 1);
    }
    assert.equal(await readFile(ownedPath, "utf8"), "provider-owned\n");
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
  const child = spawn("pi", ["--mode", "rpc"], {
    cwd,
    encoding: "utf8",
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  child.stdin.write(
    `${JSON.stringify({ id: "status", type: "prompt", message: "/fixture-pbrain-status" })}\n`,
  );
  child.stdin.end();
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", resolveExit);
  });
  assert.equal(exitCode, 0, `Pi RPC failed\n${stderr}`);
  const events = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const notices = events
    .filter((event) => event.type === "extension_ui_request" && event.method === "notify")
    .map((event) => event.message);
  assert.ok(notices.includes("fixture pbrain was probed."));
} finally {
  await rm(home, { recursive: true, force: true });
}

console.log("Pi pbrain capability fixture verification passed");

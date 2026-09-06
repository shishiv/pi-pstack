import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const home = await mkdtemp(join(tmpdir(), "pi-pstack-e2e-home-"));
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

function install(source) {
  const result = spawnSync("pi", ["install", source], { cwd, encoding: "utf8", env });
  assert.equal(result.status, 0, `pi install failed\n${result.stdout}\n${result.stderr}`);
}

try {
  install(root);

  const child = spawn("pi", ["--mode", "rpc", "--no-session"], {
    cwd,
    encoding: "utf8",
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  for (const request of [
    { id: "commands", type: "get_commands" },
    { id: "on", type: "prompt", message: "/poteto-mode on" },
    { id: "active", type: "prompt", message: "/poteto-mode status" },
    { id: "off", type: "prompt", message: "/poteto-mode off" },
    { id: "inactive", type: "prompt", message: "/poteto-mode status" },
  ]) {
    child.stdin.write(`${JSON.stringify(request)}\n`);
  }
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
  const commands = events.find(
    (event) => event.type === "response" && event.command === "get_commands",
  )?.data?.commands;
  assert.ok(Array.isArray(commands));
  assert.ok(commands.some((command) => command.name === "poteto-mode"));
  const packageSkills = commands.filter(
    (command) =>
      command.source === "skill" &&
      command.sourceInfo?.baseDir === root &&
      command.name.startsWith("skill:"),
  );
  assert.equal(packageSkills.length, 44);
  assert.ok(
    events.some(
      (event) =>
        event.type === "entry_appended" &&
        event.entry?.customType === "poteto-mode" &&
        event.entry?.data?.active === true,
    ),
  );
  const notices = events
    .filter((event) => event.type === "extension_ui_request" && event.method === "notify")
    .map((event) => event.message);
  assert.ok(notices.includes("poteto mode enabled."));
  assert.ok(notices.includes("poteto mode is active."));
  assert.ok(notices.includes("poteto mode disabled."));
  assert.ok(notices.includes("poteto mode is off."));
} finally {
  await rm(home, { recursive: true, force: true });
}

console.log("Pi RPC integration verification passed");

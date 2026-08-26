import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

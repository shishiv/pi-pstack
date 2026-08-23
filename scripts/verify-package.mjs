#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

assert.equal(manifest.name, "@shishiv/pi-pstack");
assert.equal(manifest.private, true);
assert.equal(manifest.type, "module");
assert.deepEqual(manifest.pi.extensions, ["./extensions"]);
assert.deepEqual(manifest.pi.skills, ["./skills"]);
assert.deepEqual(manifest.pi.subagents.agents, ["./agents"]);

for (const relativePath of ["extensions", "skills", "agents"]) {
  assert.equal((await stat(join(root, relativePath))).isDirectory(), true);
}

if (process.argv.includes("--manifest-only")) {
  console.log("package manifest verification passed");
  process.exit(0);
}

const agentDir = await mkdtemp(join(tmpdir(), "pi-pstack-agent-"));

try {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
  };
  const install = spawnSync("pi", ["install", root], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  assert.equal(install.status, 0, `pi install failed\n${install.stdout}\n${install.stderr}`);

  const list = spawnSync("pi", ["list"], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  assert.equal(list.status, 0, `pi list failed\n${list.stdout}\n${list.stderr}`);
  assert.match(`${list.stdout}\n${list.stderr}`, /pi-pstack/);
} finally {
  await rm(agentDir, { force: true, recursive: true });
}

console.log("package verification passed");

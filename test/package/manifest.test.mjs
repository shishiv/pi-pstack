import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestUrl = new URL("../../package.json", import.meta.url);

test("declares a private Pi package with explicit resource roots", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.name, "@shishiv/pi-pstack");
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.pi, {
    extensions: ["./extensions"],
    skills: ["./skills"],
    subagents: { agents: ["./agents"] },
  });
  assert.deepEqual(manifest["pi-subagents"], { agents: ["./agents"] });
  assert.equal(manifest.exports["./benny"], "./src/benny/index.ts");
});

test("pins the locally proven Pi compatibility floor", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], ">=0.84.2");
  assert.equal(manifest.peerDependencies["pi-subagents"], ">=0.54.0");
  assert.equal(manifest.peerDependencies["pi-mcp-adapter"], ">=2.27.0");
  assert.equal(manifest.peerDependencies["@howaboua/pi-ask"], ">=0.0.5");
  assert.equal(manifest.peerDependencies.typebox, "*");
  assert.equal(manifest.devDependencies.jiti, "2.7.0");
});

test("packed package excludes provider-owned paths and integration fixtures", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.deepEqual(manifest.files, [
    "agents",
    "automations",
    "docs",
    "extensions",
    "scripts",
    "skills",
    "src",
    "LICENSE",
    "README.md",
    "UPSTREAM.md",
  ]);
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  const packed = (Array.isArray(report) ? report[0] : Object.values(report)[0]).files.map(
    ({ path }) => path,
  );
  assert.equal(
    packed.some((path) => /^(?:brain|\.brainmaxxing|fixtures|tasks|test)\//.test(path)),
    false,
  );
});

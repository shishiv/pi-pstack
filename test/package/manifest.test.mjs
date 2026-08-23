import assert from "node:assert/strict";
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
});

test("pins the locally proven Pi compatibility floor", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], ">=0.84.2");
  assert.equal(manifest.peerDependencies["pi-subagents"], ">=0.54.0");
  assert.equal(manifest.peerDependencies["pi-mcp-adapter"], ">=2.27.0");
  assert.equal(manifest.peerDependencies["@howaboua/pi-ask"], ">=0.0.5");
});

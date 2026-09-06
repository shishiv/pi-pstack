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
  });
  assert.equal(manifest["pi-subagents"], undefined);
  assert.equal(manifest.exports["./benny"], "./src/benny/index.ts");
});

test("pins the locally proven Pi compatibility floor", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], ">=0.84.2");
  assert.equal(manifest.peerDependencies.typebox, "*");
  assert.deepEqual(Object.keys(manifest.peerDependencies).toSorted(), [
    "@earendil-works/pi-coding-agent",
    "typebox",
  ]);
  assert.equal(manifest.devDependencies.jiti, "2.7.0");
});

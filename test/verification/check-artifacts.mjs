import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const directory = join(root, "artifacts", "browser-e2e", "latest");
const manifest = JSON.parse(await readFile(join(directory, "artifact-manifest.json"), "utf8"));

assert.equal(manifest.version, 1);
assert.equal(manifest.cleanupResult, "passed");
assert.doesNotMatch(JSON.stringify(manifest), /bearer\s+|password=|token=|api[_-]?key=/i);

for (const name of ["good.png", "broken.png", "accessibility.yaml", "dom.html", "trace.zip"]) {
  assert.ok((await stat(join(directory, name))).size > 0, `${name} must contain evidence`);
}

const accessibility = await readFile(join(directory, "accessibility.yaml"), "utf8");
assert.match(accessibility, /status "Application status": Ready/);
assert.match(accessibility, /button "Increment count"/);

console.log("browser artifact verification passed");

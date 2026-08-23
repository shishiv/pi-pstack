import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const github = await jiti.import("../../skills/poteto-mode/scripts/watch-pr/github.ts");

test("watcher GraphQL pagination uses the real endCursor field", () => {
  assert.match(github.PR_CHECK_ROLLUP_QUERY, /\bendCursor\b/);
  assert.doesNotMatch(github.PR_CHECK_ROLLUP_QUERY, /\bendPi\b/);
});

test("nested toolchain versions are pinned and entrypoints are executable", async () => {
  const manifest = JSON.parse(await readFile("skills/poteto-mode/scripts/package.json", "utf8"));
  assert.equal(manifest.devDependencies["bun-types"], "1.3.14");
  assert.equal(manifest.devDependencies.typescript, "5.9.3");
  for (const path of [
    "skills/poteto-mode/scripts/orch/orch.ts",
    "skills/poteto-mode/scripts/watch-pr/watch-pr",
    "skills/poteto-mode/scripts/worktree-audit.sh",
  ]) {
    assert.ok((await stat(path)).mode & 0o100, `${path} must be executable`);
  }
});

#!/usr/bin/env node

import { run } from "./lib/run.mjs";
import assert from "node:assert/strict";

run(process.execPath, ["--test", "test/delivery/delivery.test.mjs"]);
const view = run("gh", ["stack", "view", "--json"]);
const stack = JSON.parse(view.stdout);
if (stack.trunk !== "main" || !Array.isArray(stack.branches) || stack.branches.length === 0) {
  throw new Error("gh stack did not report the active Pi pstack");
}
const submitHelp = run("gh", ["stack", "submit", "--help"]).stdout;
assert.match(submitHelp, /--auto/);
assert.match(submitHelp, /new PRs are created as drafts unless you pass\s+--open/);
const mergeHelp = run("gh", ["stack", "merge", "--help"]).stdout;
assert.match(mergeHelp, /--yes/);
assert.match(mergeHelp, /atomic stack\s+merge/);
console.log("delivery verification passed");

#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, ["--test", "test/delivery/delivery.test.mjs"]);
const view = run("gh", ["stack", "view", "--json"]);
const stack = JSON.parse(view.stdout);
if (stack.trunk !== "main" || !Array.isArray(stack.branches) || stack.branches.length === 0) {
  throw new Error("gh stack did not report the active Pi pstack");
}
console.log("delivery verification passed");

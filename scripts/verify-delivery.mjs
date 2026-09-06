#!/usr/bin/env node

import { run } from "./lib/run.mjs";
import assert from "node:assert/strict";

const viewHelp = run("gh", ["stack", "view", "--help"]).stdout;
assert.match(viewHelp, /--json/);
const submitHelp = run("gh", ["stack", "submit", "--help"]).stdout;
assert.match(submitHelp, /--auto[\s\S]+auto-generated PR titles/);
assert.match(submitHelp, /new PRs are created as drafts unless you pass\s+--open/);
const addHelp = run("gh", ["stack", "add", "--help"]).stdout;
assert.match(addHelp, /Usage:\s+gh stack add \[branch\]/);
const syncHelp = run("gh", ["stack", "sync", "--help"]).stdout;
assert.match(syncHelp, /Usage:\s+gh stack sync \[flags\]/);
const rebaseHelp = run("gh", ["stack", "rebase", "--help"]).stdout;
assert.match(rebaseHelp, /Usage:\s+gh stack rebase \[branch\] \[flags\]/);
const mergeHelp = run("gh", ["stack", "merge", "--help"]).stdout;
assert.match(mergeHelp, /--yes/);
assert.match(mergeHelp, /atomic stack\s+merge/);
assert.match(mergeHelp, /gh stack merge \[<stack-number> \| <pr-number>\]/);
console.log("delivery verification passed");

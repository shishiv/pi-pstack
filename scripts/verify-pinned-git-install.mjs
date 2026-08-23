#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, ["test/e2e/pinned-git-install-e2e.mjs", ...process.argv.slice(2)]);
console.log("pinned Git install verification passed");

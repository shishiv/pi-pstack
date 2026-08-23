#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, ["--test", "test/evals/evals.test.mjs"]);
console.log("eval sensitivity verification passed");

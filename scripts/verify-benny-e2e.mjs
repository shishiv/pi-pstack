#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, ["--test", "test/benny/benny.test.mjs"]);
console.log("benny e2e verification passed");

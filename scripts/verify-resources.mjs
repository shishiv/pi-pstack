#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, ["--test", "test/resources/resources.test.mjs"]);
console.log("resource verification passed");

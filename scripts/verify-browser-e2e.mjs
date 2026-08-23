#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, ["test/verification/browser-e2e.mjs"]);
run(process.execPath, ["test/verification/check-artifacts.mjs"]);
console.log("browser e2e verification passed");

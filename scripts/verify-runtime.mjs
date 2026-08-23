#!/usr/bin/env node

import { run } from "./lib/run.mjs";

run(process.execPath, [
  "--test",
  "test/runtime/runtime.test.mjs",
  "test/workflows/workflows.test.mjs",
]);
run(process.execPath, ["test/e2e/pi-rpc-e2e.mjs"]);
console.log("runtime verification passed");

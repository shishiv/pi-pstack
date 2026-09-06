#!/usr/bin/env node

import { run } from "./lib/run.mjs";

for (const [command, args] of [
  ["npm", ["run", "format:check"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  [process.execPath, ["scripts/verify-package.mjs"]],
  [process.execPath, ["test/e2e/pi-rpc-e2e.mjs"]],
  [process.execPath, ["scripts/verify-browser-e2e.mjs"]],
  [process.execPath, ["test/e2e/benny-e2e.mjs"]],
]) {
  run(command, args);
}

console.log("complete verification passed");

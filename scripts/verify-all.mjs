#!/usr/bin/env node

import { run } from "./lib/run.mjs";

for (const [command, args] of [
  ["npm", ["run", "format:check"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  [process.execPath, ["scripts/verify-package.mjs"]],
  [process.execPath, ["scripts/verify-runtime.mjs"]],
  [process.execPath, ["scripts/verify-upstream-tools.mjs"]],
  [process.execPath, ["scripts/verify-browser-e2e.mjs"]],
  [process.execPath, ["scripts/verify-evals.mjs"]],
  [process.execPath, ["scripts/verify-delivery.mjs"]],
  [process.execPath, ["scripts/verify-benny-e2e.mjs"]],
]) {
  run(command, args);
}

console.log(
  process.argv.includes("--e2e")
    ? "clean install e2e verification passed"
    : "complete verification passed",
);

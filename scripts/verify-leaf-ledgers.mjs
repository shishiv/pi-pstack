#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./lib/run.mjs";

const root = resolve(import.meta.dirname, "..");
const checker =
  process.env.UNLAZY_GATE_CHECK ??
  join(homedir(), ".pi", "agent", "skills", "unlazy", "scripts", "gate-check.mjs");
const directory = join(root, ".unlazy", "pi-pstack", "gates");
const leaves = readdirSync(directory)
  .filter((name) => /^leaf-.*\.md$/.test(name))
  .sort();

assert.ok(leaves.length > 0, "no leaf ledgers found");
for (const leaf of leaves) {
  const result = run(process.execPath, [checker, "--status", join(directory, leaf)], { cwd: root });
  assert.match(result.stdout, /ALL MET/);
}

console.log("leaf ledger verification passed");

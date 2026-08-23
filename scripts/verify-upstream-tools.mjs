#!/usr/bin/env node

import { join, resolve } from "node:path";
import { run } from "./lib/run.mjs";

const root = resolve(import.meta.dirname, "..");
const tools = join(root, "skills", "poteto-mode", "scripts");
run("bun", ["install", "--frozen-lockfile"], { cwd: tools });
run("bun", ["run", "typecheck"], { cwd: tools });
run(process.execPath, ["--test", "test/resources/upstream-tools.test.mjs"], { cwd: root });
console.log("upstream tool verification passed");

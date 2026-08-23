#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const rawPath = args.shift();
assert.ok(
  rawPath,
  "usage: create-review-evidence <raw-review-output> --repo <id> --head <sha> --reviewer <id> --run <id>",
);
const options = {};
for (let index = 0; index < args.length; index += 1) {
  const key = args[index];
  assert.ok(key?.startsWith("--"), `unknown argument ${key}`);
  const value = args[++index];
  assert.ok(value && !value.startsWith("--"), `${key} requires a value`);
  options[key.slice(2)] = value;
}
const repoIdentity = options.repo ?? process.env.REPO_IDENTITY;
const headSha = options.head ?? process.env.HEAD_SHA;
const reviewer = options.reviewer ?? process.env.REVIEWER_ID;
const runId = options.run ?? process.env.REVIEW_RUN_ID;
const root = options.root ? resolve(options.root) : process.cwd();
for (const [name, value] of Object.entries({
  repo: repoIdentity,
  head: headSha,
  reviewer,
  run: runId,
}))
  assert.ok(value, `--${name} is required`);

const absolute = resolve(rawPath);
const relativePath = relative(root, absolute);
assert.ok(
  relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)),
  "raw review output must be inside the repository",
);
const raw = await readFile(absolute, "utf8");
assert.match(
  raw,
  /(?:^|\n)\s*VERIFIED\s*(?:\n|$)/,
  "raw review output must contain an exact VERIFIED verdict",
);
const evidence = {
  version: 1,
  type: "review-evidence",
  repoIdentity,
  headSha,
  reviewer,
  runId,
  verdict: "VERIFIED",
  rawReview: {
    path: relativePath.replaceAll("\\", "/"),
    sha256: createHash("sha256").update(raw).digest("hex"),
  },
};
const output = `${JSON.stringify(evidence, null, 2)}\n`;
if (options.out) await writeFile(resolve(options.out), output, "utf8");
else process.stdout.write(output);

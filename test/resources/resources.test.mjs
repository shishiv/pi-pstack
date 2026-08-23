import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";

const root = resolve(import.meta.dirname, "../..");
const skillsDir = join(root, "skills");
const agentsDir = join(root, "agents");
const bennyDir = join(root, "automations", "benny");
const expectedSkillNames = [
  "architect",
  "arena",
  "automate-me",
  "blast-radius",
  "bro",
  "create-verification-skill",
  "figure-it-out",
  "how",
  "interrogate",
  "maintain-verification-skill",
  "no-comments",
  "poteto-mode",
  "principle-boundary-discipline",
  "principle-build-the-lever",
  "principle-encode-lessons-in-structure",
  "principle-exhaust-the-design-space",
  "principle-experience-first",
  "principle-fix-root-causes",
  "principle-foundational-thinking",
  "principle-guard-the-context-window",
  "principle-laziness-protocol",
  "principle-make-operations-idempotent",
  "principle-migrate-callers-then-delete-legacy-apis",
  "principle-minimize-reader-load",
  "principle-model-the-domain",
  "principle-never-block-on-the-human",
  "principle-outcome-oriented-execution",
  "principle-prove-it-works",
  "principle-redesign-from-first-principles",
  "principle-separate-before-serializing-shared-state",
  "principle-sequence-verifiable-units",
  "principle-subtract-before-you-add",
  "principle-type-system-discipline",
  "recall",
  "reflect",
  "setup-pstack",
  "show-me-your-work",
  "swarm",
  "tdd",
  "teach",
  "technical-writing",
  "typescript-best-practices",
  "unslop",
  "why",
].toSorted();

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

test("resource inventory is exactly 44 skills, 22 playbooks, 2 agents, and Benny", async () => {
  const skillDirs = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  assert.deepEqual(skillDirs, expectedSkillNames);

  const playbooks = await filesUnder(join(skillsDir, "poteto-mode", "playbooks"));
  assert.equal(
    playbooks.filter((path) => path.endsWith(".md") && !path.endsWith("/opening-a-pr.md")).length,
    22,
  );

  const agents = (await readdir(agentsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .toSorted();
  assert.deepEqual(agents, ["comment-sicko.md", "poteto-agent.md"]);
  const bennySkills = (await filesUnder(join(bennyDir, "skills"))).filter((path) =>
    path.endsWith("SKILL.md"),
  );
  assert.equal(bennySkills.length, 3);
  const workflows = (await readdir(bennyDir)).filter((name) => name.endsWith(".workflow.json"));
  assert.deepEqual(workflows.toSorted(), ["reproduce.workflow.json", "triage.workflow.json"]);
});

test("Pi loads every skill without diagnostics", () => {
  const result = loadSkillsFromDir({ dir: skillsDir, source: "pi-pstack" });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.skills.map((skill) => skill.name).toSorted(), expectedSkillNames);
});

test("active resources use Pi runtime contracts", async () => {
  const paths = [
    ...(await filesUnder(skillsDir)),
    ...(await filesUnder(agentsDir)),
    ...(await filesUnder(bennyDir)),
  ];
  const text = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  const corpus = text.join("\n");
  for (const [token, pattern] of [
    ["AskQuestion", /AskQuestion/],
    ["run_in_background", /run_in_background/],
    ["subagent_type", /subagent_type/],
    ["generalPurpose", /generalPurpose/],
    [".cursor", /\.cursor/],
    ["Cursor runtime", /\bCursor\b/],
    ["/loop", /\/loop\b/],
  ]) {
    assert.doesNotMatch(corpus, pattern, `${token} remains in active resources`);
  }
  assert.match(corpus, /workflowScript/);
  assert.match(corpus, /runs\.all/);
  assert.match(corpus, /ask/);
  assert.match(corpus, /PI_SESSION_FILE/);
  assert.match(corpus, /gh stack/);
  assert.match(corpus, /Graphite/);
});

test("agent frontmatter uses valid Pi roles", async () => {
  const comment = await readFile(join(agentsDir, "comment-sicko.md"), "utf8");
  const poteto = await readFile(join(agentsDir, "poteto-agent.md"), "utf8");
  assert.match(comment, /name: comment-sicko/);
  assert.match(comment, /acceptanceRole: read-only/);
  assert.match(comment, /never edit files/i);
  assert.match(poteto, /async: true/);
  assert.match(poteto, /inheritProjectContext: true/);
  assert.match(poteto, /inheritSkills: true/);
});

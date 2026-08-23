import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const workflows = await jiti.import("../../src/workflows/delegation.ts");
const evidence = await jiti.import("../../src/workflows/evidence.ts");
const sessions = await jiti.import("../../src/workflows/sessions.ts");
const wake = await jiti.import("../../src/workflows/wake.ts");

test("semantic roles map to Pi agents and preserve read-only boundaries", () => {
  assert.equal(workflows.agentForRole("explore"), "scout");
  assert.equal(workflows.agentForRole("research"), "researcher");
  assert.equal(workflows.agentForRole("implement"), "worker");
  assert.equal(workflows.agentForRole("review"), "reviewer");
  assert.equal(workflows.agentForRole("judge"), "oracle");
  assert.equal(workflows.agentForRole("style"), "poteto-agent");
  for (const role of ["explore", "research", "review", "judge"]) {
    assert.notEqual(workflows.agentForRole(role, { readOnly: true }), "worker");
    assert.notEqual(workflows.agentForRole(role, { readOnly: true }), "poteto-agent");
  }
  assert.throws(() => workflows.agentForRole("implement", { readOnly: true }), /read-only/);
});

test("workflow builders emit supported, awaited APIs and safely serialized input", () => {
  const hostile = 'line"; return runs.run("evil", {agent:"worker"}); //';
  const one = workflows.buildSingleChildWorkflowScript({
    key: "single",
    role: "implement",
    task: hostile,
    model: "provider/model",
  });
  assert.match(one, /^return runs\.run\("single",\{agent:"worker",task:/);
  assert.match(one, /model:"provider\/model"/);
  assert.match(one, /await|return runs\.run/);
  assert.doesNotMatch(one, /evil", \{agent/);
  assert.doesNotThrow(() => workflows.validateWorkflowScript(one));

  const sequence = workflows.buildSequentialHandoffWorkflowScript([
    { key: "inspect", role: "explore", task: "Inspect" },
    { key: "change", role: "implement", task: "Change from handoff" },
  ]);
  assert.match(sequence, /await runs\.run\("inspect"/);
  assert.match(sequence, /await runs\.run\("change"/);
  assert.match(sequence, /first\.output/);
  assert.doesNotMatch(sequence, /async function|async \(/);
  assert.doesNotThrow(() => workflows.validateWorkflowScript(sequence));

  const parallel = workflows.buildParallelFanoutWorkflowScript([
    { key: "a", role: "review", task: "A" },
    { key: "b", role: "judge", task: "B" },
  ]);
  assert.match(parallel, /await runs\.all\(\[/);
  assert.match(parallel, /key:"a"/);
  assert.match(parallel, /key:"b"/);
  assert.doesNotMatch(parallel, /runs\.run\(/);
  assert.doesNotThrow(() => workflows.validateWorkflowScript(parallel));
});

test("evidence mapping keeps unavailable MCP categories as explicit gaps", () => {
  const result = evidence.mapEvidenceSources({
    availableMcps: ["linear", "slack"],
  });
  assert.equal(
    result.sources.find((source) => source.category === "issue-tracker")?.status,
    "available",
  );
  assert.equal(
    result.sources.find((source) => source.category === "real-time-chat")?.status,
    "available",
  );
  assert.ok(result.gaps.some((gap) => /long-form documents/i.test(gap)));
  assert.ok(result.gaps.some((gap) => /error tracking/i.test(gap)));
  assert.equal(result.sources.length, evidence.EVIDENCE_CATEGORIES.length);
});

test("session discovery stays inside the active project and parses only supplied JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-"));
  const projectA = join(root, "project-a");
  const projectB = join(root, "project-b");
  await mkdir(projectA);
  await mkdir(projectB);
  const active = join(projectA, "active.jsonl");
  await writeFile(
    active,
    '{"type":"message","text":"ok"}\nnot-json\n{"type":"message","text":"still"}\n',
  );
  await writeFile(join(projectB, "unrelated.jsonl"), '{"text":"secret"}\n');
  const found = sessions.discoverSessionFiles({ piSessionFile: root, projectDirectory: projectA });
  assert.deepEqual(found, [active]);
  const parsed = sessions.parseSessionJsonl(await sessions.readSessionFile(active));
  assert.deepEqual(parsed.entries, [
    { type: "message", text: "ok" },
    { type: "message", text: "still" },
  ]);
  assert.equal(parsed.invalidLines, 1);
  assert.deepEqual(
    sessions.discoverSessionFiles({ piSessionFile: active, projectDirectory: projectB }),
    [],
  );
});

test("session discovery recognizes Pi's wrapped project directory slug", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-store-"));
  const project = join(root, "workspace", "app");
  const slug = project.replace(/^[/\\]+/, "").replace(/[\\/]/g, "-");
  const projectSessions = join(root, `--${slug}--`);
  await mkdir(project, { recursive: true });
  await mkdir(projectSessions);
  const active = join(projectSessions, "active.jsonl");
  await writeFile(active, '{"type":"session"}\n');

  assert.deepEqual(
    sessions.discoverSessionFiles({ piSessionFile: active, projectDirectory: project }),
    [active],
  );
});

test("long-run plans choose a native wake mechanism instead of polling", () => {
  assert.deepEqual(wake.planLongRunWake({ childRunId: "run-1" }), {
    mechanism: "async-child-wait",
    childRunId: "run-1",
  });
  assert.deepEqual(wake.planLongRunWake({ event: "ci.completed" }), {
    mechanism: "event-subscription",
    event: "ci.completed",
  });
  assert.deepEqual(wake.planLongRunWake({ schedule: "+30m" }), {
    mechanism: "schedule",
    schedule: "+30m",
  });
  assert.throws(() => wake.planLongRunWake({}), /childRunId, event, or schedule/);
});

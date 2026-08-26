import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const workflows = await jiti.import("../../src/workflows/delegation.ts");

test("semantic roles map to Pi agents and preserve read-only boundaries", () => {
  assert.equal(workflows.agentForRole("explore"), "scout");
  assert.equal(workflows.agentForRole("research"), "researcher");
  assert.equal(workflows.agentForRole("implement"), "worker");
  assert.equal(workflows.agentForRole("review"), "reviewer");
  assert.equal(workflows.agentForRole("judge"), "oracle");
  assert.equal(workflows.agentForRole("style"), "poteto-agent");
  assert.equal(workflows.agentForRole("benny"), "benny-coordinator");
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
  assert.throws(
    () =>
      workflows.buildSingleChildWorkflowScript({
        key: "unsafe",
        role: "implement",
        task: "work",
        worktree: "false,task:'injected'",
      }),
    /worktree must be boolean/,
  );
});

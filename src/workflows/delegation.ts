/** Pi-native delegation primitives. Scripts are data: callers can inspect them before launch. */

export const ROLE_TO_AGENT = {
  explore: "scout",
  research: "researcher",
  implement: "worker",
  review: "reviewer",
  judge: "oracle",
  style: "poteto-agent",
  benny: "benny-coordinator",
} as const;

export type WorkflowRole = keyof typeof ROLE_TO_AGENT;
export type WorkflowAgent = (typeof ROLE_TO_AGENT)[WorkflowRole];

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface AgentResolutionOptions {
  readOnly?: boolean;
}

/** Resolve only named Pi agents; read-only work cannot silently become a writer. */
export function agentForRole(
  role: WorkflowRole,
  options: AgentResolutionOptions = {},
): WorkflowAgent {
  const agent = ROLE_TO_AGENT[role];
  if (
    options.readOnly &&
    (agent === "worker" || agent === "poteto-agent" || agent === "benny-coordinator")
  ) {
    throw new Error(`Role '${role}' cannot be resolved for a read-only workflow.`);
  }
  return agent;
}

export interface ChildTask {
  key: string;
  task: string;
  role?: WorkflowRole;
  agent?: WorkflowAgent;
  model?: string;
  worktree?: boolean;
  readOnly?: boolean;
}

function quote(value: string): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Workflow task must be a string.");
  // Keep generated JavaScript safe when a task originated in a JSON or HTML context.
  return encoded.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function validateKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(`Invalid workflow key '${key}'. Keys must start with a letter or number.`);
  }
}

function childAgent(child: ChildTask): WorkflowAgent {
  if (child.role) {
    const resolved = agentForRole(child.role, { readOnly: child.readOnly });
    if (child.agent && child.agent !== resolved) {
      throw new Error(`Agent '${child.agent}' does not match role '${child.role}'.`);
    }
    return resolved;
  }
  const agent = child.agent ?? "worker";
  if (
    child.readOnly &&
    (agent === "worker" || agent === "poteto-agent" || agent === "benny-coordinator")
  ) {
    throw new Error("A read-only workflow cannot use worker or poteto-agent.");
  }
  return agent;
}

function runParams(child: ChildTask, taskExpression = quote(child.task)): string {
  validateKey(child.key);
  const agent = childAgent(child);
  const fields = [`agent:${quote(agent)}`, `task:${taskExpression}`];
  if (child.model !== undefined) fields.push(`model:${quote(child.model)}`);
  if (child.worktree !== undefined) {
    if (typeof child.worktree !== "boolean") throw new Error("worktree must be boolean");
    fields.push(`worktree:${child.worktree ? "true" : "false"}`);
  }
  return `{${fields.join(",")}}`;
}

function uniqueKeys(children: readonly ChildTask[]): void {
  const keys = new Set<string>();
  for (const child of children) {
    validateKey(child.key);
    if (!keys.add(child.key)) throw new Error(`Duplicate workflow key '${child.key}'.`);
  }
}

/** Build a supported one-child workflowScript body. */
export function buildSingleChildWorkflowScript(child: ChildTask): string {
  return `return runs.run(${quote(child.key)},${runParams(child)});`;
}

/** Build a sequential handoff where each child receives the prior child's output. */
export function buildSequentialHandoffWorkflowScript(children: readonly ChildTask[]): string {
  if (children.length < 2) throw new Error("Sequential handoff requires at least two children.");
  uniqueKeys(children);
  const lines: string[] = [];
  children.forEach((child, index) => {
    const variable = index === 0 ? "first" : `step${index}`;
    const task =
      index === 0
        ? quote(child.task)
        : `[${quote(child.task)},"\\n\\nHandoff from previous child:\\n",${index === 1 ? "first" : `step${index - 1}`}.output].join("")`;
    lines.push(`const ${variable}=await runs.run(${quote(child.key)},${runParams(child, task)});`);
  });
  lines.push(`return step${children.length - 1};`);
  return lines.join("\n");
}

/** Build an ordinary parallel fanout. Every launch is observed by the awaited runs.all call. */
export function buildParallelFanoutWorkflowScript(children: readonly ChildTask[]): string {
  if (children.length === 0) throw new Error("Parallel fanout requires at least one child.");
  uniqueKeys(children);
  const calls = children.map((child) => `{key:${quote(child.key)},${runParams(child).slice(1)}`);
  return `const results=await runs.all([${calls.join(",")}]);return results;`;
}

/** Syntax and portability checks for generated script bodies (without launching children). */
export function validateWorkflowScript(script: string): void {
  if (!script.trim()) throw new Error("Workflow script must not be empty.");
  if (/async\s+(?:function|\([^)]*\)|[A-Za-z_$][\w$]*\s*=>)/.test(script)) {
    throw new Error("Workflow script must not contain nested async helpers.");
  }
  if (/\b(?:setInterval|setTimeout)\s*\(/.test(script)) {
    throw new Error("Workflow script must not poll or schedule ad hoc timers.");
  }
  try {
    // Wrapping permits top-level await while checking ordinary JavaScript syntax.
    // eslint-disable-next-line no-new-func
    new Function(`return (async()=>{${script}\n})();`);
  } catch (error) {
    throw new Error(
      `Invalid workflowScript: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

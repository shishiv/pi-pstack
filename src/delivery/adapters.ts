import type {
  CommandResult,
  CommandRunner,
  GitSha,
  ProvenMembers,
  PullRequestNumber,
  StackActionResult,
  StackBackend,
  StackBackendName,
  StackMember,
  StackOperation,
  StackSnapshot,
} from "./types.js";

export interface AdapterOptions {
  runner: CommandRunner;
}

const PULL_REQUEST_PATTERN = /^[1-9][0-9]*$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{6,64}$/i;

function gitSha(value: string): GitSha | undefined {
  return GIT_SHA_PATTERN.test(value) ? (value as GitSha) : undefined;
}

function pullRequestNumber(value: string): PullRequestNumber | undefined {
  return PULL_REQUEST_PATTERN.test(value) ? (value as PullRequestNumber) : undefined;
}

function parseOutput(result: CommandResult): unknown {
  const output = result.stdout.trim();
  if (!output) return {};
  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

function field(value: unknown, ...names: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const name of names) {
    const candidate = (value as Record<string, unknown>)[name];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function parseGhStackMembership(raw: unknown): ProvenMembers | undefined {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { branches?: unknown }).branches))
    return undefined;
  const entries = (raw as { branches: unknown[] }).branches.flatMap((branch) => {
    if (!branch || typeof branch !== "object") return [];
    const item = branch as {
      head?: unknown;
      base?: unknown;
      isMerged?: unknown;
      pr?: { number?: unknown; state?: unknown };
    };
    if (item.isMerged === true || item.pr?.state === "MERGED") return [];
    const head = typeof item.head === "string" ? gitSha(item.head) : undefined;
    const base = typeof item.base === "string" ? gitSha(item.base) : undefined;
    const number = item.pr?.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return [];
    const pullRequest = pullRequestNumber(String(number));
    if (!head || !base || !pullRequest) return [];
    return [{ pullRequest, headSha: head, baseSha: base }];
  });
  if (entries.length === 0) return undefined;
  const heads = new Map(entries.map((entry) => [entry.headSha, entry]));
  if (heads.size !== entries.length) return undefined;
  const roots = entries.filter((entry) => !heads.has(entry.baseSha));
  if (roots.length !== 1) return undefined;
  const ordered = [] as StackMember[];
  const visited = new Set<string>();
  let current: StackMember | undefined = roots[0];
  while (current) {
    if (visited.has(current.headSha)) return undefined;
    visited.add(current.headSha);
    ordered.push(current);
    const children = entries.filter((entry) => entry.baseSha === current!.headSha);
    if (children.length > 1) return undefined;
    current = children[0];
  }
  if (ordered.length !== entries.length) return undefined;
  if (ordered.length === 0) return undefined;
  return ordered as unknown as ProvenMembers;
}

export function membersThrough(
  members: ProvenMembers,
  targetPullRequest: string,
): ProvenMembers | undefined {
  if (!PULL_REQUEST_PATTERN.test(targetPullRequest)) return undefined;
  const target = members.findIndex((member) => member.pullRequest === targetPullRequest);
  if (target < 0) return undefined;
  return members.slice(0, target + 1) as unknown as ProvenMembers;
}

function asCommandFailure(error: unknown): CommandResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
  };
}

function branchOperand(value: string): string {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("//") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock")
  ) {
    throw new Error(`unsafe branch operand: ${value}`);
  }
  return value;
}

function pullRequestOperand(value: string): string[] {
  if (!PULL_REQUEST_PATTERN.test(value)) throw new Error(`unsafe pull request operand: ${value}`);
  return [value];
}

async function run(runner: CommandRunner, argv: readonly string[]): Promise<CommandResult> {
  try {
    return await runner.run(argv);
  } catch (error) {
    return asCommandFailure(error);
  }
}

abstract class CliStackBackend implements StackBackend {
  abstract readonly name: StackBackendName;
  protected abstract argv(operation: StackOperation): readonly string[];

  public constructor(protected readonly runner: CommandRunner) {}

  public async inspect(): Promise<StackSnapshot> {
    const result = await run(this.runner, this.argv({ kind: "inspect" }));
    if (result.exitCode !== 0) return { kind: "unproven", backend: this.name };
    const members = parseGhStackMembership(parseOutput(result));
    if (!members) return { kind: "unproven", backend: this.name };
    return { kind: "proven", backend: this.name, members };
  }

  public async execute(operation: StackOperation): Promise<StackActionResult> {
    const argv = this.argv(operation);
    const result = await run(this.runner, argv);
    const raw = parseOutput(result);
    return {
      backend: this.name,
      operation: operation.kind,
      argv,
      accepted: result.exitCode === 0,
      pullRequest: field(raw, "pullRequest", "pull_request", "pr", "url"),
      headSha: field(raw, "headSha", "head_sha", "sha", "oid"),
      raw,
    };
  }

  public run(operation: StackOperation): Promise<StackActionResult> {
    return this.execute(operation);
  }
}

/** Adapter for the official `gh stack` extension. It stores no stack state. */
export class GhStackBackend extends CliStackBackend {
  public readonly name = "gh-stack" as const;

  protected argv(operation: StackOperation): readonly string[] {
    switch (operation.kind) {
      case "inspect":
        return ["gh", "stack", "view", "--json"];
      case "prepare":
        return ["gh", "stack", "add", branchOperand(operation.branch)];
      case "submit":
        return ["gh", "stack", "submit", "--auto", ...(operation.draft ? [] : ["--open"])];
      case "sync":
        return ["gh", "stack", "sync"];
      case "rebase":
        return ["gh", "stack", "rebase"];
      case "auto-merge":
        return ["gh", "stack", "merge", ...pullRequestOperand(operation.pullRequest), "--yes"];
    }
  }
}

export const GhStackAdapter = GhStackBackend;

export interface DeliveryBackends {
  ghStack: GhStackBackend;
}

export function createDeliveryBackends(options: {
  runner: CommandRunner;
  availableCommands?: readonly (string | { name: string })[];
}): DeliveryBackends {
  return { ghStack: new GhStackBackend(options.runner) };
}

export function createGhStackBackend(options: AdapterOptions): GhStackBackend {
  return new GhStackBackend(options.runner);
}

import type {
  CommandResult,
  CommandRunner,
  StackActionResult,
  StackBackend,
  StackBackendName,
  StackOperation,
  StackSnapshot,
} from "./types.js";

export interface AdapterOptions {
  runner: CommandRunner;
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

function pullRequestOperand(value: string | undefined): string[] {
  if (value === undefined) return [];
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`unsafe pull request operand: ${value}`);
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
    const argv = this.argv({ kind: "inspect" });
    const result = await run(this.runner, argv);
    const raw = parseOutput(result);
    return {
      backend: this.name,
      repoIdentity: field(raw, "repoIdentity", "repository", "repo", "name"),
      headSha: field(raw, "headSha", "head_sha", "sha", "oid"),
      pullRequest: field(raw, "pullRequest", "pull_request", "pr", "url"),
      raw,
    };
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

/** Adapter for Graphite's official `gt` CLI. It stores no stack state. */
export class GraphiteBackend extends CliStackBackend {
  public readonly name = "graphite" as const;

  protected argv(operation: StackOperation): readonly string[] {
    switch (operation.kind) {
      case "inspect":
        return ["gt", "log", "short", "--stack", "--reverse"];
      case "prepare":
        return ["gt", "create", branchOperand(operation.branch), "--no-interactive"];
      case "submit":
        return [
          "gt",
          "submit",
          ...(operation.draft ? ["--draft"] : []),
          ...(operation.draft ? [] : ["--publish"]),
          "--no-edit",
          "--no-interactive",
        ];
      case "sync":
        return ["gt", "sync", "--no-interactive"];
      case "rebase":
        return ["gt", "restack", "--no-interactive"];
      case "auto-merge":
        return [
          "gt",
          "submit",
          "--merge-when-ready",
          "--always",
          "--update-only",
          "--no-edit",
          "--no-interactive",
        ];
    }
  }
}

export const GraphiteAdapter = GraphiteBackend;

export function isGraphiteAvailable(
  availableCommands: readonly (string | { name: string })[],
): boolean {
  return availableCommands.some(
    (command) => (typeof command === "string" ? command : command.name) === "gt",
  );
}

export interface DeliveryBackends {
  ghStack: GhStackBackend;
  graphite?: GraphiteBackend;
}

/** gh is the default; Graphite is exposed only after a capability preflight. */
export function createDeliveryBackends(options: {
  runner: CommandRunner;
  availableCommands?: readonly (string | { name: string })[];
}): DeliveryBackends {
  const backends: DeliveryBackends = { ghStack: new GhStackBackend(options.runner) };
  if (options.availableCommands && isGraphiteAvailable(options.availableCommands)) {
    backends.graphite = new GraphiteBackend(options.runner);
  }
  return backends;
}

export function createGhStackBackend(options: AdapterOptions): GhStackBackend {
  return new GhStackBackend(options.runner);
}

/** Returns no adapter when the optional `gt` capability is not present. */
export function createGraphiteBackend(options: {
  runner: CommandRunner;
  availableCommands: readonly (string | { name: string })[];
}): GraphiteBackend | undefined {
  return isGraphiteAvailable(options.availableCommands)
    ? new GraphiteBackend(options.runner)
    : undefined;
}

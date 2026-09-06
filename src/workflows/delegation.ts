import { spawn } from "node:child_process";
import { basename, resolve as resolvePath } from "node:path";

export const DELEGATION_ROLES = [
  "explore",
  "research",
  "implement",
  "review",
  "judge",
  "style",
  "benny",
] as const;

export type DelegationRole = (typeof DELEGATION_ROLES)[number];
export type DelegationAccess = "read-only" | "workspace-write";

const READ_ONLY_ROLES = new Set<DelegationRole>(["explore", "research", "review", "judge"]);
const READ_ONLY_TOOLS = "read,grep,find,ls";
const CHILD_PROCESS_MARKER = "PSTACK_DELEGATION_CHILD";

export interface DelegationTask {
  readonly role: DelegationRole;
  readonly task: string;
  readonly cwd?: string;
  readonly model?: string;
}

export interface DelegationTaskInput {
  role: DelegationRole;
  task: string;
  cwd?: string;
  model?: string;
}

export interface DelegationEvidence {
  readonly executor: "pi-cli";
  readonly exitCode: number | null;
  readonly finalMessage: boolean;
  readonly outputTruncated: boolean;
  readonly sessionId?: string;
  readonly model?: string;
  readonly stopReason?: string;
  readonly stderr?: string;
}

export type DelegationResult =
  | {
      readonly status: "completed";
      readonly output: string;
      readonly evidence: DelegationEvidence;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly error: string;
      readonly output: string;
      readonly evidence: DelegationEvidence;
    };

export interface PiInvocation {
  command: string;
  prefixArgs: readonly string[];
}

export interface RunPiDelegationOptions {
  cwd: string;
  signal?: AbortSignal;
  model?: string;
  thinkingLevel?: string;
  env?: NodeJS.ProcessEnv;
  invocation?: PiInvocation;
}

const MAX_MODEL_OUTPUT = 64 * 1024;
const MAX_STDERR = 16 * 1024;

export function createDelegationTask(input: DelegationTaskInput): DelegationTask {
  const task = input.task.trim();
  if (!task) throw new Error("Delegation task must not be empty.");
  return Object.freeze({
    role: input.role,
    task,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.model ? { model: input.model } : {}),
  });
}

export function delegationAccess(role: DelegationRole): DelegationAccess {
  return READ_ONLY_ROLES.has(role) ? "read-only" : "workspace-write";
}

export function buildPiCliArguments(
  task: DelegationTask,
  options: Pick<RunPiDelegationOptions, "model" | "thinkingLevel"> = {},
): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];
  const model = task.model ?? options.model;
  if (model) args.push("--model", model);
  if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);
  const access = delegationAccess(task.role);
  if (access === "read-only") {
    args.push("--tools", READ_ONLY_TOOLS);
  } else {
    args.push("--exclude-tools", "pstack_delegate");
  }
  const accessInstruction =
    access === "read-only"
      ? "Inspect and report only. Do not edit files or perform external writes."
      : "Work in the supplied directory. No sandbox or isolated worktree is provided.";
  args.push(`Delegated ${task.role} task. ${accessInstruction}\n\n${task.task}`);
  return args;
}

export async function runPiDelegation(
  task: DelegationTask,
  options: RunPiDelegationOptions,
): Promise<DelegationResult> {
  const invocation = options.invocation ?? currentPiInvocation();
  const args = [...invocation.prefixArgs, ...buildPiCliArguments(task, options)];
  const env = {
    ...process.env,
    ...options.env,
    [CHILD_PROCESS_MARKER]: "1",
  };

  return new Promise((resolve) => {
    const child = spawn(invocation.command, args, {
      cwd: resolvePath(options.cwd, task.cwd ?? "."),
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderr = "";
    let output = "";
    let outputTruncated = false;
    let finalMessage = false;
    let sessionId: string | undefined;
    let model: string | undefined;
    let stopReason: string | undefined;
    let cancelled = options.signal?.aborted === true;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const processLine = (line: string): void => {
      if (!line.trim()) return;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      if (!value || typeof value !== "object") return;
      const event = value as Record<string, unknown>;
      if (event.type === "session" && typeof event.id === "string") sessionId = event.id;
      if (event.type !== "message_end" || !event.message || typeof event.message !== "object")
        return;
      const message = event.message as Record<string, unknown>;
      if (message.role !== "assistant") return;
      finalMessage = true;
      if (typeof message.model === "string") model = message.model;
      if (typeof message.stopReason === "string") stopReason = message.stopReason;
      const text = messageText(message.content);
      if (text) output = text;
    };

    const abort = (): void => {
      cancelled = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5_000);
      killTimer.unref();
    };

    const finish = (exitCode: number | null, processError?: Error): void => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", abort);
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      const bounded = boundText(output, MAX_MODEL_OUTPUT);
      output = bounded.text;
      outputTruncated = bounded.truncated;
      const evidence: DelegationEvidence = {
        executor: "pi-cli",
        exitCode,
        finalMessage,
        outputTruncated,
        ...(sessionId ? { sessionId } : {}),
        ...(model ? { model } : {}),
        ...(stopReason ? { stopReason } : {}),
        ...(stderr ? { stderr } : {}),
      };
      if (cancelled) {
        resolve({ status: "cancelled", error: "Pi delegation was cancelled.", output, evidence });
        return;
      }
      if (processError) {
        resolve({ status: "failed", error: processError.message, output, evidence });
        return;
      }
      if (exitCode !== 0) {
        resolve({
          status: "failed",
          error: stderr || `Pi delegation exited with code ${exitCode ?? "unknown"}.`,
          output,
          evidence,
        });
        return;
      }
      if (!finalMessage) {
        resolve({
          status: "failed",
          error: "Pi delegation exited without a final assistant message.",
          output,
          evidence,
        });
        return;
      }
      if (stopReason !== "stop") {
        resolve({
          status: stopReason === "aborted" ? "cancelled" : "failed",
          error: `Pi delegation did not reach a final stop (reason: ${stopReason ?? "missing"}).`,
          output,
          evidence,
        });
        return;
      }
      resolve({ status: "completed", output, evidence });
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
      while (true) {
        const newline = stdoutBuffer.indexOf("\n");
        if (newline < 0) break;
        const line = stdoutBuffer.slice(0, newline).replace(/\r$/, "");
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        processLine(line);
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr = boundText(stderr + chunk.toString(), MAX_STDERR).text;
    });
    child.once("error", (error) => finish(null, error));
    child.once("close", (code) => finish(code));
    if (cancelled) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
  });
}

export function isDelegatedPiChild(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[CHILD_PROCESS_MARKER] === "1";
}

function currentPiInvocation(): PiInvocation {
  const currentScript = process.argv[1];
  if (currentScript && !currentScript.startsWith("/$bunfs/root/")) {
    return { command: process.execPath, prefixArgs: [currentScript] };
  }
  const executable = basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(executable)) {
    return { command: process.execPath, prefixArgs: [] };
  }
  return { command: "pi", prefixArgs: [] };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const block = part as Record<string, unknown>;
      return block.type === "text" && typeof block.text === "string" ? [block.text] : [];
    })
    .join("\n");
}

function boundText(value: string, limit: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= limit) return { text: value, truncated: false };
  let text = value;
  while (text && Buffer.byteLength(text, "utf8") > limit) text = text.slice(0, -1);
  return { text, truncated: true };
}

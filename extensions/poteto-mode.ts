import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { preflightCapabilities } from "../src/capabilities/preflight.js";
import { listBennyAdapterProviders, runBennyRuntime } from "../src/benny/index.js";
import {
  authorizeDelivery,
  createEvidenceReceiptFromFiles,
  createDeliveryBackends,
  loadEvidenceReceipt,
  validateEvidenceReceipt,
  verifyEvidenceReceiptFiles,
  type StackBackendName,
  type StackOperation,
} from "../src/delivery/index.js";
import { POTETO_MODE_ENTRY, modeStateEntry, restoreModeState } from "../src/mode/state.js";
import { generateProjectVerificationSkill } from "../src/verification/index.js";

const COMMAND = "poteto-mode";

interface LoadedSkill {
  name?: string;
  filePath?: string;
  content?: string;
}

function branchState(ctx: ExtensionContext): boolean {
  return restoreModeState(ctx.sessionManager.getBranch()).active;
}

function notify(
  ctx: ExtensionContext,
  message: string,
  type: "info" | "warning" | "error" = "info",
): void {
  ctx.ui.notify(message, type);
}

export default function potetoModeExtension(pi: ExtensionAPI): void {
  let active = false;

  function persist(next: boolean): void {
    active = next;
    pi.appendEntry(POTETO_MODE_ENTRY, modeStateEntry(next));
  }

  function restore(ctx: ExtensionContext): void {
    // This closure is intentionally reset from the active branch on every
    // session lifecycle event. It prevents state leaking across sessions.
    active = branchState(ctx);
  }

  function preflight(ctx: ExtensionContext): string[] {
    const result = preflightCapabilities({
      tools: pi.getAllTools(),
      commands: pi.getCommands(),
      availableModels: ctx.modelRegistry.getAvailable(),
      scopedModels: ctx.scopedModels,
    });
    return result.diagnostics;
  }

  pi.on("session_start", async (_event, ctx) => {
    restore(ctx);
    // Probe all host capability surfaces during startup without changing
    // settings or failing print/JSON sessions. A task invocation fails closed.
    preflight(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restore(ctx);
  });

  pi.registerCommand(COMMAND, {
    description: "Enable, disable, inspect, or run a task in sticky poteto mode",
    handler: async (args, ctx) => {
      const value = args.trim();
      if (value === "" || value === "status") {
        notify(ctx, `poteto mode is ${active ? "active" : "off"}.`);
        return;
      }
      if (value === "on") {
        persist(true);
        notify(ctx, "poteto mode enabled.");
        return;
      }
      if (value === "off") {
        persist(false);
        notify(ctx, "poteto mode disabled.");
        return;
      }

      const diagnostics = preflight(ctx);
      if (diagnostics.length > 0) {
        notify(ctx, `poteto mode task unavailable.\n${diagnostics.join("\n")}`, "error");
        return;
      }
      persist(true);
      const options = ctx.isIdle()
        ? { expandPromptTemplates: true }
        : { deliverAs: "followUp" as const, expandPromptTemplates: true };
      pi.sendUserMessage(value, options);
    },
  });

  pi.registerTool({
    name: "pstack_create_verification",
    label: "Create pstack verification skill",
    description:
      "Create an idempotent project-local verification skill from an explicit feature map.",
    parameters: Type.Object({
      app: Type.String({ minLength: 1 }),
      features: Type.Array(
        Type.Object({
          id: Type.String({ minLength: 1 }),
          userGoal: Type.String({ minLength: 1 }),
          route: Type.String({ minLength: 1 }),
          component: Type.Optional(Type.String()),
          source: Type.Optional(Type.String()),
          role: Type.Optional(Type.String()),
          name: Type.Optional(Type.String()),
          selector: Type.Optional(Type.String()),
          dataTestId: Type.Optional(Type.String()),
          expectedState: Type.String({ minLength: 1 }),
          brokenState: Type.String({ minLength: 1 }),
          prerequisites: Type.Array(Type.String()),
          evidence: Type.Array(
            Type.Union([
              Type.Literal("screenshot"),
              Type.Literal("accessibility"),
              Type.Literal("domSnapshot"),
              Type.Literal("trace"),
              Type.Literal("video"),
              Type.Literal("cleanup"),
            ]),
          ),
        }),
        { minItems: 1 },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.isProjectTrusted()) {
        return {
          content: [
            { type: "text", text: "Verification skill creation rejected: project is not trusted." },
          ],
          details: { changed: false, rejected: true },
        };
      }
      try {
        const result = await generateProjectVerificationSkill({
          projectRoot: ctx.cwd,
          appName: params.app,
          featureMap: {
            version: 1,
            app: params.app,
            features: params.features.map((feature) => ({
              id: feature.id,
              userGoal: feature.userGoal,
              route: feature.route,
              pointers: { component: feature.component, source: feature.source },
              accessible: {
                role: feature.role,
                name: feature.name,
                selector: feature.selector,
                dataTestId: feature.dataTestId,
              },
              expectedState: feature.expectedState,
              brokenState: feature.brokenState,
              prerequisites: feature.prerequisites,
              evidence: Object.fromEntries(feature.evidence.map((name) => [name, true])),
            })),
          },
        });
        return {
          content: [
            {
              type: "text",
              text: result.changed
                ? `Created verification skill at ${result.destination}.`
                : `Verification skill at ${result.destination} is already current.`,
            },
          ],
          details: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Verification skill creation rejected: ${error instanceof Error ? error.message : String(error)}.`,
            },
          ],
          details: { changed: false, rejected: true },
        };
      }
    },
  });

  pi.registerTool({
    name: "pstack_benny",
    label: "Run a guarded Benny workflow",
    description:
      "Run Benny triage or reproduce through a registered adapter provider and durable project ledger.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("triage"), Type.Literal("reproduce")]),
      provider: Type.String({ minLength: 1 }),
      config: Type.Any(),
      trigger: Type.Optional(Type.Any()),
      featureId: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.isProjectTrusted()) {
        return bennyResult({ status: "blocked", reason: "project is not trusted", writes: 0 });
      }
      if (!listBennyAdapterProviders().includes(params.provider)) {
        return bennyResult({
          status: "blocked",
          reason: `Benny adapter provider is unavailable: ${params.provider}`,
          writes: 0,
        });
      }
      return bennyResult(
        await runBennyRuntime({
          action: params.action,
          provider: params.provider,
          config: params.config,
          trigger: params.trigger,
          featureId: params.featureId,
          cwd: ctx.cwd,
        }),
      );
    },
  });

  pi.registerTool({
    name: "pstack_create_receipt",
    label: "Create a verified pstack delivery receipt",
    description:
      "Hash local verification, review, and eval artifacts into a receipt for the current repository HEAD.",
    parameters: Type.Object({
      backend: Type.Union([Type.Literal("gh-stack"), Type.Literal("graphite")]),
      featureMapPath: Type.String({ minLength: 1 }),
      skillPath: Type.String({ minLength: 1 }),
      reviewPath: Type.String({ minLength: 1 }),
      reviewer: Type.String({ minLength: 1 }),
      evalPath: Type.String({ minLength: 1 }),
      artifactPaths: Type.Array(
        Type.Object({ kind: Type.String({ minLength: 1 }), path: Type.String({ minLength: 1 }) }),
        { minItems: 1 },
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!ctx.isProjectTrusted()) return deliveryRejected("project is not trusted");
      try {
        const currentHead = await pi.exec("git", ["rev-parse", "HEAD"], { cwd: ctx.cwd, signal });
        const repository = await pi.exec(
          "gh",
          ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
          { cwd: ctx.cwd, signal },
        );
        if (currentHead.code !== 0 || repository.code !== 0)
          return deliveryRejected("repository identity or HEAD could not be resolved");
        const cleanliness = await pi.exec(
          "git",
          ["status", "--porcelain", "--untracked-files=no"],
          { cwd: ctx.cwd, signal },
        );
        if (cleanliness.code !== 0)
          return deliveryRejected("repository cleanliness could not be verified");
        if (cleanliness.stdout.trim() !== "")
          return deliveryRejected("repository has tracked changes");
        const receipt = await createEvidenceReceiptFromFiles({
          root: ctx.cwd,
          repoIdentity: repository.stdout.trim(),
          headSha: currentHead.stdout.trim(),
          backend: params.backend,
          origin: "human",
          featureMapPath: params.featureMapPath,
          skillPath: params.skillPath,
          artifactPaths: params.artifactPaths,
          reviewPath: params.reviewPath,
          reviewer: params.reviewer,
          evalPath: params.evalPath,
          deterministicChecks: {
            status: "green",
            checks: [{ name: "git tracked tree is clean", status: "passed" }],
          },
        });
        const directory = join(ctx.cwd, ".pi", "pstack", "receipts");
        const path = join(directory, `${receipt.headSha}.json`);
        await mkdir(directory, { recursive: true });
        await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        return {
          content: [{ type: "text", text: `Created verified receipt for ${receipt.headSha}.` }],
          details: { path, receipt },
        };
      } catch (error) {
        return deliveryRejected(error instanceof Error ? error.message : String(error));
      }
    },
  });

  pi.registerTool({
    name: "pstack_delivery",
    label: "Run gated pstack delivery",
    description:
      "Inspect a stack or run a receipt-gated gh-stack or Graphite mutation. Auto-merge also verifies the live PR head and checks.",
    parameters: Type.Object({
      backend: Type.Union([Type.Literal("gh-stack"), Type.Literal("graphite")]),
      operation: Type.Union([
        Type.Literal("inspect"),
        Type.Literal("prepare"),
        Type.Literal("submit"),
        Type.Literal("sync"),
        Type.Literal("rebase"),
        Type.Literal("auto-merge"),
      ]),
      branch: Type.Optional(Type.String()),
      pullRequest: Type.Optional(Type.String()),
      draft: Type.Optional(Type.Boolean()),
      receiptPath: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!ctx.isProjectTrusted()) {
        return deliveryRejected("project is not trusted");
      }
      const currentHead = await pi.exec("git", ["rev-parse", "HEAD"], { cwd: ctx.cwd, signal });
      const repository = await pi.exec(
        "gh",
        ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
        { cwd: ctx.cwd, signal },
      );
      if (currentHead.code !== 0 || repository.code !== 0) {
        return deliveryRejected("repository identity or HEAD could not be resolved");
      }
      try {
        if (params.operation !== "inspect") {
          if (!params.receiptPath) return deliveryRejected("a verified receipt path is required");
          const receipt = await loadEvidenceReceipt(params.receiptPath, ctx.cwd);
          const semanticReasons = validateEvidenceReceipt(receipt);
          if (semanticReasons.length > 0) return deliveryRejected(semanticReasons.join("; "));
          const fileReasons = await verifyEvidenceReceiptFiles(receipt, ctx.cwd);
          if (fileReasons.length > 0) return deliveryRejected(fileReasons.join("; "));
          if (params.operation === "auto-merge") {
            if (!params.pullRequest)
              return deliveryRejected("auto-merge requires a pull request number");
            const pullRequest = await pi.exec(
              "gh",
              [
                "pr",
                "view",
                params.pullRequest,
                "--json",
                "headRefOid,isDraft,statusCheckRollup,mergeStateStatus",
              ],
              { cwd: ctx.cwd, signal },
            );
            if (pullRequest.code !== 0)
              return deliveryRejected("pull request state could not be verified");
            const state = JSON.parse(pullRequest.stdout) as {
              headRefOid?: string;
              isDraft?: boolean;
              mergeStateStatus?: string;
              statusCheckRollup?: { conclusion?: string; status?: string }[];
            };
            if (state.headRefOid !== receipt.headSha)
              return deliveryRejected("receipt does not match the pull request head");
            if (state.isDraft) return deliveryRejected("pull request is still a draft");
            if (!pullRequestChecksPass(state.statusCheckRollup ?? []))
              return deliveryRejected("pull request checks are not green");
            if (!new Set(["CLEAN", "HAS_HOOKS"]).has(state.mergeStateStatus ?? ""))
              return deliveryRejected("pull request is not mergeable");
          }
          const level = deliveryLevel(params.operation);
          const authorization = authorizeDelivery({
            receipt,
            repoIdentity: repository.stdout.trim(),
            currentHeadSha: currentHead.stdout.trim(),
            backend: params.backend as StackBackendName,
            level,
          });
          if (!authorization.allowed) return deliveryRejected(authorization.reasons.join("; "));
          if (authorization.draftOnly && params.operation === "submit" && params.draft === false)
            return deliveryRejected("Benny delivery is draft-only");
        }
        const runner = {
          async run(argv: readonly string[]) {
            const [command, ...args] = argv;
            if (!command) return { exitCode: 1, stdout: "", stderr: "empty command" };
            const result = await pi.exec(command, args, { cwd: ctx.cwd, signal });
            return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
          },
        };
        const availableCommands = ["gh"];
        if (params.backend === "graphite") {
          const gt = await pi.exec("gt", ["--version"], { cwd: ctx.cwd, signal });
          if (gt.code === 0) availableCommands.push("gt");
        }
        const backends = createDeliveryBackends({
          runner,
          availableCommands,
        });
        const backend = params.backend === "graphite" ? backends.graphite : backends.ghStack;
        if (!backend)
          return deliveryRejected("Graphite is unavailable; install and authenticate gt first");
        const operation = deliveryOperation(params);
        const result = await backend.execute(operation);
        return {
          content: [
            {
              type: "text",
              text: result.accepted
                ? `${result.backend} ${result.operation} completed.`
                : `${result.backend} ${result.operation} failed.`,
            },
          ],
          details: result,
        };
      } catch (error) {
        return deliveryRejected(error instanceof Error ? error.message : String(error));
      }
    },
  });

  pi.on("tool_call", async (event) => {
    if (!active || event.toolName === "pstack_delivery") return;
    const payload = `${event.toolName}\n${normalizeToolCallInput(event.input)}`;
    if (containsDirectMerge(payload)) {
      return {
        block: true,
        reason: "Use pstack_delivery so exact-head evidence and autonomy gates are enforced.",
      };
    }
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent) => {
    if (!active) return;
    const skill = event.systemPromptOptions.skills?.find(
      (candidate) => candidate.name === "poteto-mode",
    ) as LoadedSkill | undefined;
    if (!skill) return;
    const content =
      skill.content ??
      (skill.filePath ? await readFile(skill.filePath, "utf8").catch(() => undefined) : undefined);
    if (!content) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Loaded skill: ${skill.filePath ?? "poteto-mode"}\n\n${content}`,
    };
  });
}

function deliveryLevel(operation: string): "prepare" | "pr" | "merge-ready" | "auto-merge" {
  if (operation === "prepare") return "prepare";
  if (operation === "submit") return "pr";
  if (operation === "sync" || operation === "rebase") return "merge-ready";
  if (operation === "auto-merge") return "auto-merge";
  throw new Error(`unsupported mutating delivery operation: ${operation}`);
}

/** Flatten shell-like and structured tool payloads before applying merge gates. */
function normalizeToolCallInput(input: unknown): string {
  const values: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
        try {
          visit(JSON.parse(trimmed));
          return;
        } catch {
          // Preserve command strings that happen to contain malformed JSON.
        }
      }
      values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["command", "argv", "args"]) {
        if (key in record) visit(record[key]);
      }
      for (const [key, child] of Object.entries(record)) {
        if (key !== "command" && key !== "argv" && key !== "args") visit(child);
      }
    }
  };
  visit(input);
  return values.join(" ");
}

function containsDirectMerge(command: string): boolean {
  const value = command.replace(/\\\r?\n/g, " ").toLowerCase();
  return (
    /\bgh\b[\s\S]{0,160}\bstack\s+merge\b/.test(value) ||
    /\bgh\b[\s\S]{0,160}\bpr\s+merge\b/.test(value) ||
    /\bgh\s+api\b[\s\S]{0,240}\/pulls\/[1-9][0-9]*\/merge\b/.test(value) ||
    /\bgh\s+api\b[\s\S]{0,240}\b(?:mergepullrequest|enablepullrequestautomerge)\b/.test(value) ||
    /\bgh\s+api\b[\s\S]{0,240}\brepos\/[^\s]+\/merges\b/.test(value) ||
    /\/repos\/[^/\s]+\/[^/\s]+\/pulls\/[1-9][0-9]*\/merge\b/.test(value) ||
    /\/repos\/[^/\s]+\/[^/\s]+\/merges\b/.test(value) ||
    /(?:merge[_-]?pull[_-]?request|enable[_-]?pull[_-]?request[_-]?auto[_-]?merge)/.test(value) ||
    /\bgt\s+merge\b/.test(value) ||
    /\bgt\s+submit\b[^\n]*--merge-when-ready\b/.test(value)
  );
}

function pullRequestChecksPass(
  checks: readonly { conclusion?: string; state?: string; status?: string }[],
): boolean {
  if (checks.length === 0) return false;
  return checks.every((check) => {
    const result = check.conclusion ?? check.state;
    return new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]).has(result ?? "");
  });
}

function deliveryRejected(reason: string) {
  return {
    content: [{ type: "text" as const, text: `Delivery rejected: ${reason}.` }],
    details: { accepted: false, reason },
  };
}

function bennyResult(result: { status: string; reason?: string; writes: number }) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Benny ${result.status}: ${result.reason ?? `${result.writes} external write(s)`}.`,
      },
    ],
    details: result,
  };
}

function deliveryOperation(params: {
  operation: string;
  branch?: string;
  pullRequest?: string;
  draft?: boolean;
}): StackOperation {
  switch (params.operation) {
    case "inspect":
      return { kind: "inspect" };
    case "prepare":
      if (!params.branch) throw new Error("prepare requires branch");
      return { kind: "prepare", branch: params.branch };
    case "submit":
      return { kind: "submit", draft: params.draft ?? true };
    case "sync":
      return { kind: "sync" };
    case "rebase":
      return { kind: "rebase" };
    case "auto-merge":
      return { kind: "auto-merge", pullRequest: params.pullRequest };
    default:
      throw new Error(`unsupported delivery operation: ${params.operation}`);
  }
}

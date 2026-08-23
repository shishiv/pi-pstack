import { readFile } from "node:fs/promises";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { preflightCapabilities } from "../src/capabilities/preflight.js";
import {
  authorizeDelivery,
  createDeliveryBackends,
  type EvidenceReceipt,
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
    },
  });

  pi.registerTool({
    name: "pstack_delivery",
    label: "Run gated pstack delivery",
    description:
      "Run a gh-stack or Graphite operation. Auto-merge requires an exact-head evidence receipt.",
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
      receipt: Type.Optional(Type.Any()),
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
      if (params.operation === "auto-merge") {
        const authorization = authorizeDelivery({
          receipt: params.receipt as EvidenceReceipt | undefined,
          repoIdentity: repository.stdout.trim(),
          currentHeadSha: currentHead.stdout.trim(),
          backend: params.backend as StackBackendName,
          level: "auto-merge",
        });
        if (!authorization.allowed) return deliveryRejected(authorization.reasons.join("; "));
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
    },
  });

  pi.on("tool_call", async (event) => {
    if (!active || event.toolName !== "bash") return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string") return;
    if (
      /(?:^|[;&|]\s*)(?:gh\s+(?:stack\s+merge|pr\s+merge)|gt\s+(?:merge|submit\b[^\n]*--merge-when-ready))\b/.test(
        command,
      )
    ) {
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

function deliveryRejected(reason: string) {
  return {
    content: [{ type: "text" as const, text: `Delivery rejected: ${reason}.` }],
    details: { accepted: false, reason },
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

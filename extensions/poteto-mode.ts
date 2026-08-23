import { readFile } from "node:fs/promises";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { preflightCapabilities } from "../src/capabilities/preflight.js";
import { POTETO_MODE_ENTRY, modeStateEntry, restoreModeState } from "../src/mode/state.js";

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

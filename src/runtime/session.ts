import { readFile } from "node:fs/promises";
import {
  preflightCapabilities,
  type CapabilityPreflightOptions,
} from "../capabilities/preflight.js";
import { POTETO_MODE_ENTRY, modeStateEntry, restoreModeState } from "../mode/state.js";

interface LoadedSkill {
  name?: string;
  filePath?: string;
  content?: string;
}

export interface OptionalCapabilityStatus {
  name: string;
  status: "absent" | "available" | "unavailable" | "incompatible";
  providerVersion?: string;
  diagnostic: string;
}

export interface RuntimeMetric {
  hook: "session_start" | "session_tree" | "before_agent_start";
  durationMs: number;
  promptBytesBefore?: number;
  promptBytesAfter?: number;
  addedBytes?: number;
  estimatedAddedTokens?: number;
  contextWindowTokens?: number;
  contextUsageTokens?: number | null;
}

export interface PotetoSessionOptions {
  appendEntry(type: string, data: unknown): void;
  recordMetric?(metric: RuntimeMetric): void;
  now?(): number;
  resolveCapability?(): unknown;
}

type SessionPreflightOptions = CapabilityPreflightOptions & { cwd: string; trusted: boolean };

type PromptContextUsage = { contextWindow: number; tokens: number | null };

export function createPotetoSession(options: PotetoSessionOptions) {
  const now = options.now ?? performance.now.bind(performance);
  const resolveCapability =
    options.resolveCapability ?? (() => Reflect.get(globalThis, Symbol.for("pbrain/v1")));
  let active = false;

  return {
    get active() {
      return active;
    },
    restore(entries: readonly unknown[]) {
      active = restoreModeState(entries).active;
    },
    async lifecycle<T>(
      hook: "session_start" | "session_tree",
      entries: readonly unknown[],
      task?: () => Promise<T>,
    ) {
      const started = now();
      active = restoreModeState(entries).active;
      const result = await task?.();
      options.recordMetric?.({ hook, durationMs: now() - started });
      return result;
    },
    setActive(next: boolean) {
      active = next;
      options.appendEntry(POTETO_MODE_ENTRY, modeStateEntry(next));
    },
    async preflight(input: SessionPreflightOptions) {
      const required = preflightCapabilities(input);
      const optional = await inspectPbrainCapability(resolveCapability(), input);
      return { required, optional };
    },
    async composePrompt(input: {
      systemPrompt: string;
      skills?: readonly LoadedSkill[];
      contextUsage?: PromptContextUsage;
    }) {
      const started = now();
      const skill = input.skills?.find((candidate) => candidate.name === "poteto-mode");
      const content =
        skill?.content ??
        (skill?.filePath
          ? await readFile(skill.filePath, "utf8").catch(() => undefined)
          : undefined);
      const heading = skill ? `## Loaded skill: ${skill.filePath ?? "poteto-mode"}` : undefined;
      const systemPrompt =
        content && heading && !input.systemPrompt.includes(heading)
          ? `${input.systemPrompt}\n\n${heading}\n\n${content}`
          : undefined;
      const before = Buffer.byteLength(input.systemPrompt);
      const after = Buffer.byteLength(systemPrompt ?? input.systemPrompt);
      options.recordMetric?.({
        hook: "before_agent_start",
        durationMs: now() - started,
        promptBytesBefore: before,
        promptBytesAfter: after,
        addedBytes: after - before,
        estimatedAddedTokens: Math.ceil((after - before) / 4),
        ...(input.contextUsage
          ? {
              contextWindowTokens: input.contextUsage.contextWindow,
              contextUsageTokens: input.contextUsage.tokens,
            }
          : {}),
      });
      return systemPrompt;
    },
  };
}

async function inspectPbrainCapability(
  value: unknown,
  input: Pick<SessionPreflightOptions, "cwd" | "trusted">,
): Promise<OptionalCapabilityStatus> {
  if (value === undefined) {
    return {
      name: "pbrain/v1",
      status: "absent",
      diagnostic: "pbrain/v1 is not registered.",
    };
  }
  if (!value || typeof value !== "object") return incompatibleCapability();
  const provider = value as Record<string, unknown>;
  if (
    provider.protocol !== "pbrain/v1" ||
    provider.protocolVersion !== 1 ||
    typeof provider.status !== "function"
  ) {
    return incompatibleCapability();
  }
  try {
    const response: unknown = await provider.status({
      schemaVersion: 1,
      cwd: input.cwd,
      trusted: input.trusted,
    });
    if (!isStatusResponse(response)) {
      return {
        name: "pbrain/v1",
        status: "incompatible",
        diagnostic: "Invalid pbrain/v1 status response.",
      };
    }
    return {
      name: "pbrain/v1",
      status: response.state,
      providerVersion: response.providerVersion,
      diagnostic: response.diagnostic,
    };
  } catch (error) {
    return {
      name: "pbrain/v1",
      status: "unavailable",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

function incompatibleCapability(): OptionalCapabilityStatus {
  return {
    name: "pbrain/v1",
    status: "incompatible",
    diagnostic: "Expected pbrain/v1 protocol version 1.",
  };
}

function isStatusResponse(value: unknown): value is {
  schemaVersion: 1;
  protocol: "pbrain/v1";
  providerVersion: string;
  state: "available" | "unavailable" | "incompatible";
  diagnostic: string;
} {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (
    response.schemaVersion === 1 &&
    response.protocol === "pbrain/v1" &&
    typeof response.providerVersion === "string" &&
    ["available", "unavailable", "incompatible"].includes(String(response.state)) &&
    typeof response.diagnostic === "string"
  );
}

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

export interface OptionalCapability {
  name: string;
  probe(): Promise<{ status: string }>;
}

export interface OptionalCapabilityStatus {
  name: string;
  status: string;
  diagnostic?: string;
}

export interface RuntimeMetric {
  hook: "session_start" | "session_tree" | "before_agent_start";
  durationMs: number;
  promptBytesBefore?: number;
  promptBytesAfter?: number;
  addedBytes?: number;
  estimatedAddedTokens?: number;
}

export interface PotetoSessionOptions {
  appendEntry(type: string, data: unknown): void;
  recordMetric?(metric: RuntimeMetric): void;
  now?(): number;
}

export function createPotetoSession(options: PotetoSessionOptions) {
  const now = options.now ?? performance.now.bind(performance);
  const optionalCapabilities = new Map<string, OptionalCapability>();
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
    registerCapability(capability: unknown) {
      if (!isOptionalCapability(capability)) return false;
      optionalCapabilities.set(capability.name, capability);
      return true;
    },
    async preflight(input: CapabilityPreflightOptions) {
      const required = preflightCapabilities(input);
      const optional = await Promise.all(
        [...optionalCapabilities.values()].map(
          async ({ name, probe }): Promise<OptionalCapabilityStatus> => {
            try {
              const result = await probe();
              if (!result || typeof result.status !== "string") {
                throw new Error("invalid capability response");
              }
              return { name, status: result.status };
            } catch (error) {
              return {
                name,
                status: "unavailable",
                diagnostic: error instanceof Error ? error.message : String(error),
              };
            }
          },
        ),
      );
      return { required, optional };
    },
    async composePrompt(input: { systemPrompt: string; skills?: readonly LoadedSkill[] }) {
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
      });
      return systemPrompt;
    },
  };
}

function isOptionalCapability(value: unknown): value is OptionalCapability {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && typeof candidate.probe === "function";
}

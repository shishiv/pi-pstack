import { join } from "node:path";
import { FileBennyLedger } from "./ledger.js";
import { runReproduce, runTriage } from "./core.js";
import type { BennyAdapters, BennyResult, Trigger } from "./types.js";

export interface BennyAdapterProvider {
  name: string;
  load(options: { config: unknown; cwd: string }): Promise<Partial<BennyAdapters>>;
  nextTrigger?(options: {
    action: "triage" | "reproduce";
    config: unknown;
    cwd: string;
  }): Promise<Trigger | null>;
}

const REGISTRY = Symbol.for("pi-pstack.benny-adapter-providers.v1");

function providers(): Map<string, BennyAdapterProvider> {
  const shared = globalThis as typeof globalThis & {
    [REGISTRY]?: Map<string, BennyAdapterProvider>;
  };
  return (shared[REGISTRY] ??= new Map());
}

export function registerBennyAdapterProvider(provider: BennyAdapterProvider): () => void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(provider.name))
    throw new Error("Benny adapter provider names must be kebab-case");
  const registry = providers();
  if (registry.has(provider.name))
    throw new Error(`Benny adapter provider already exists: ${provider.name}`);
  registry.set(provider.name, provider);
  return () => {
    if (registry.get(provider.name) === provider) registry.delete(provider.name);
  };
}

export function listBennyAdapterProviders(): string[] {
  return [...providers().keys()].sort();
}

export async function runBennyRuntime(input: {
  action: "triage" | "reproduce";
  provider: string;
  config: unknown;
  trigger?: Trigger;
  featureId?: string;
  cwd: string;
}): Promise<BennyResult> {
  const provider = providers().get(input.provider);
  if (!provider)
    return {
      status: "blocked",
      reason: `Benny adapter provider is unavailable: ${input.provider}`,
      writes: 0,
    };
  const trigger =
    input.trigger ??
    (await provider.nextTrigger?.({ action: input.action, config: input.config, cwd: input.cwd }));
  if (!trigger) return { status: "completed", reason: "no pending source event", writes: 0 };
  const adapters = await provider.load({ config: input.config, cwd: input.cwd });
  const ledger = new FileBennyLedger(join(input.cwd, ".pi", "pstack", "benny-state"));
  if (input.action === "triage") {
    return runTriage({ config: input.config, trigger, adapters, ledger });
  }
  if (!input.featureId)
    return { status: "blocked", reason: "reproduce requires featureId", writes: 0 };
  return runReproduce({
    config: input.config,
    trigger,
    featureId: input.featureId,
    adapters,
    ledger,
  });
}

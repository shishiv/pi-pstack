import { resolveModelRoles, type ModelRole, type PiModel } from "../models/roles.js";

export const EXPECTED_TOOLS = ["subagent", "ask"] as const;

export interface NamedCapability {
  name: string;
}

export interface CapabilityPreflightOptions {
  tools: readonly (NamedCapability | string)[];
  commands: readonly (NamedCapability | string)[];
  availableModels: readonly PiModel[];
  scopedModels?: readonly (PiModel | { model: PiModel })[];
  requiredTools?: readonly string[];
  requiredCommands?: readonly string[];
  requiredRoles?: readonly ModelRole[];
  roleSelectors?: Partial<Record<ModelRole, string | readonly string[]>>;
}

export interface CapabilityPreflightResult {
  ok: boolean;
  missingTools: string[];
  missingCommands: string[];
  missingRoles: ModelRole[];
  diagnostics: string[];
}

function names(values: readonly (NamedCapability | string)[]): Set<string> {
  return new Set(values.map((value) => (typeof value === "string" ? value : value.name)));
}

/** A side-effect-free gate used before any delegated task is launched. */
export function preflightCapabilities(
  options: CapabilityPreflightOptions,
): CapabilityPreflightResult {
  const availableTools = names(options.tools);
  const availableCommands = names(options.commands);
  const missingTools = [...(options.requiredTools ?? EXPECTED_TOOLS)].filter(
    (name) => !availableTools.has(name),
  );
  const missingCommands = [...(options.requiredCommands ?? [])].filter(
    (name) => !availableCommands.has(name),
  );
  const roleResult = resolveModelRoles({
    availableModels: options.availableModels,
    scopedModels: options.scopedModels,
    roles: options.requiredRoles ?? [],
    roleSelectors: options.roleSelectors,
  });
  const missingRoles = roleResult.missingRoles;
  const diagnostics = [
    ...missingTools.map((name) => `Missing expected tool: ${name}`),
    ...missingCommands.map((name) => `Missing expected command: ${name}`),
    ...roleResult.diagnostics,
  ];
  return { ok: diagnostics.length === 0, missingTools, missingCommands, missingRoles, diagnostics };
}

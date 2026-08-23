/** Semantic roles deliberately contain no provider-specific model IDs. */
export const MODEL_ROLES = ["fast", "standard", "reasoning", "instruction"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

/** The structural subset shared by Pi's Model objects and test doubles. */
export interface PiModel {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  role?: string | string[];
  roles?: string[];
  semanticRole?: string;
}

export interface ResolveModelRolesOptions {
  availableModels: readonly PiModel[];
  scopedModels?: readonly (PiModel | { model: PiModel })[];
  roles?: readonly ModelRole[];
  roleSelectors?: Partial<Record<ModelRole, string | readonly string[]>>;
}

export interface ResolveModelRolesResult {
  resolved: Partial<Record<ModelRole, PiModel>>;
  missingRoles: ModelRole[];
  diagnostics: string[];
}

function poolFor(options: ResolveModelRolesOptions): PiModel[] {
  const available = options.availableModels;
  if (!options.scopedModels || options.scopedModels.length === 0) return [...available];
  const scoped: PiModel[] = options.scopedModels.map((entry) =>
    "model" in entry ? entry.model : entry,
  );
  return available.filter((candidate) => scoped.some((model) => sameModel(candidate, model)));
}

function sameModel(a: PiModel, b: PiModel): boolean {
  return a.provider === b.provider && a.id === b.id;
}

function findSelector(selector: string, models: readonly PiModel[]): PiModel | undefined {
  const normalized = selector.trim().toLowerCase();
  if (!normalized || normalized.startsWith("cursor/") || normalized.includes("cursor-"))
    return undefined;
  const qualified = normalized.includes("/") ? normalized.split("/") : undefined;
  const matches = models.filter((model) => {
    const id = model.id.toLowerCase();
    const provider = model.provider.toLowerCase();
    if (qualified) return qualified[0] === provider && qualified.slice(1).join("/") === id;
    return id === normalized;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function roleMatches(role: ModelRole, model: PiModel): boolean {
  const declared = model.role ?? model.roles ?? model.semanticRole;
  if (Array.isArray(declared) && declared.includes(role)) return true;
  if (typeof declared === "string" && declared === role) return true;
  if (role === "reasoning" || role === "instruction") return model.reasoning === true;
  return true;
}

function score(role: ModelRole, model: PiModel): number {
  const reasoning = model.reasoning === true ? 1 : 0;
  const context = model.contextWindow ?? 0;
  const output = model.maxTokens ?? 0;
  if (role === "fast") return (reasoning ? 0 : 10_000_000) - context;
  if (role === "reasoning") return reasoning * 10_000_000 + context;
  if (role === "instruction") return reasoning * 10_000_000 + output;
  return 10_000_000 - (reasoning ? 1 : 0);
}

function choose(role: ModelRole, models: readonly PiModel[]): PiModel | undefined {
  return [...models]
    .filter((model) => roleMatches(role, model))
    .sort((a, b) => score(role, b) - score(role, a))[0];
}

/** Resolve role references against Pi's available/scoped catalogue only. */
export function resolveModelRoles(options: ResolveModelRolesOptions): ResolveModelRolesResult {
  const models = poolFor(options);
  const roles = options.roles ?? MODEL_ROLES;
  const resolved: Partial<Record<ModelRole, PiModel>> = {};
  const missingRoles: ModelRole[] = [];
  const diagnostics: string[] = [];
  for (const role of roles) {
    const selectors = options.roleSelectors?.[role];
    const candidates =
      selectors === undefined ? [] : typeof selectors === "string" ? [selectors] : [...selectors];
    const model =
      candidates.length > 0
        ? candidates
            .map((candidate) => findSelector(candidate, models))
            .find((candidate) => candidate !== undefined)
        : choose(role, models);
    if (model) {
      resolved[role] = model;
    } else {
      missingRoles.push(role);
      const reason =
        candidates.length > 0
          ? `selectors ${candidates.join(", ")} are not registered`
          : "no matching available/scoped Pi model";
      diagnostics.push(`Missing model role '${role}': ${reason}`);
    }
  }
  return { resolved, missingRoles, diagnostics };
}

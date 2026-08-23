/** A small, dependency-free contract for browser-verifiable product features. */
export interface FeaturePointers {
  component?: string;
  source?: string;
}

export interface AccessibleSelectors {
  role?: string;
  name?: string;
  selector?: string;
  dataTestId?: string;
}

export interface EvidenceRequirements {
  screenshot?: boolean;
  accessibility?: boolean;
  domSnapshot?: boolean;
  trace?: boolean;
  video?: boolean;
  cleanup?: boolean;
}

export interface FeatureEntry {
  id: string;
  /** The user goal is deliberately retained verbatim rather than inferred. */
  userGoal: string;
  route: string;
  pointers: FeaturePointers;
  accessible: AccessibleSelectors;
  expectedState: string;
  brokenState: string;
  prerequisites: string[];
  evidence: EvidenceRequirements;
}

export interface FeatureMap {
  version: 1;
  app: string;
  features: FeatureEntry[];
}

export interface FeatureMapValidation {
  valid: boolean;
  errors: string[];
}

const FIELD_NAMES = new Set([
  "user goal",
  "goal",
  "route",
  "component",
  "source",
  "role",
  "name",
  "selector",
  "data-testid",
  "data test id",
  "expected state",
  "broken state",
  "prerequisites",
  "evidence",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireSingleLine(value: unknown, path: string, errors: string[]): void {
  const normalized = text(value);
  if (!normalized) errors.push(`${path} is required`);
  else if (/[\r\n]/.test(value as string)) errors.push(`${path} must be one line`);
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function evidence(value: string): EvidenceRequirements {
  const result: EvidenceRequirements = {};
  for (const item of list(value.toLowerCase())) {
    if (item === "screenshot") result.screenshot = true;
    else if (item === "accessibility" || item === "a11y") result.accessibility = true;
    else if (item === "dom" || item === "dom snapshot" || item === "accessibility/dom snapshot") {
      result.domSnapshot = true;
    } else if (item === "trace") result.trace = true;
    else if (item === "video") result.video = true;
    else if (item === "cleanup") result.cleanup = true;
  }
  return result;
}

function canonicalEvidence(value: EvidenceRequirements): string {
  return [
    ["screenshot", value.screenshot],
    ["accessibility", value.accessibility],
    ["dom snapshot", value.domSnapshot],
    ["trace", value.trace],
    ["video", value.video],
    ["cleanup", value.cleanup],
  ]
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");
}

/** Parse the intentionally boring Markdown feature-map format. */
export function parseFeatureMapMarkdown(markdown: string): FeatureMap {
  if (typeof markdown !== "string") throw new Error("feature map must be Markdown text");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const appMatch = lines.find((line) => /^#\s+Feature map\s*:/i.test(line));
  const app = appMatch ? text(appMatch.replace(/^#\s+Feature map\s*:/i, "")) : "";
  const features: FeatureEntry[] = [];
  let current: (Partial<FeatureEntry> & { id?: string }) | undefined;
  let currentEvidence = "";

  const finish = () => {
    if (!current) return;
    const pointers: FeaturePointers = {};
    if (text(current.pointers?.component)) pointers.component = text(current.pointers?.component);
    if (text(current.pointers?.source)) pointers.source = text(current.pointers?.source);
    const accessible: AccessibleSelectors = {};
    if (text(current.accessible?.role)) accessible.role = text(current.accessible?.role);
    if (text(current.accessible?.name)) accessible.name = text(current.accessible?.name);
    if (text(current.accessible?.selector))
      accessible.selector = text(current.accessible?.selector);
    if (text(current.accessible?.dataTestId))
      accessible.dataTestId = text(current.accessible?.dataTestId);
    features.push({
      id: text(current.id),
      userGoal: text(current.userGoal),
      route: text(current.route),
      pointers,
      accessible,
      expectedState: text(current.expectedState),
      brokenState: text(current.brokenState),
      prerequisites: current.prerequisites ?? [],
      evidence: evidence(currentEvidence),
    });
    current = undefined;
    currentEvidence = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^##\s+(?:feature\s*:\s*)?([^#].*?)\s*$/i);
    if (heading) {
      finish();
      current = { id: text(heading[1]), pointers: {}, accessible: {}, prerequisites: [] };
      continue;
    }
    if (!current) continue;
    const match = line.match(/^[-*]\s+([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = text(match[1]).toLowerCase();
    const value = text(match[2]);
    if (!FIELD_NAMES.has(key)) continue;
    switch (key) {
      case "user goal":
      case "goal":
        current.userGoal = value;
        break;
      case "route":
        current.route = value;
        break;
      case "component":
        current.pointers!.component = value;
        break;
      case "source":
        current.pointers!.source = value;
        break;
      case "role":
        current.accessible!.role = value;
        break;
      case "name":
        current.accessible!.name = value;
        break;
      case "selector":
        current.accessible!.selector = value;
        break;
      case "data-testid":
      case "data test id":
        current.accessible!.dataTestId = value;
        break;
      case "expected state":
        current.expectedState = value;
        break;
      case "broken state":
        current.brokenState = value;
        break;
      case "prerequisites":
        current.prerequisites = list(value);
        break;
      case "evidence":
        currentEvidence = value;
        break;
    }
  }
  finish();
  return { version: 1, app, features };
}

/** Render a canonical representation so maps are stable in source control. */
export function renderFeatureMapMarkdown(map: FeatureMap): string {
  const result = [
    `# Feature map: ${map.app}`,
    "",
    "<!-- Generated from the verification feature contract. -->",
    "",
  ];
  for (const feature of map.features) {
    result.push(
      `## feature: ${feature.id}`,
      `- user goal: ${feature.userGoal}`,
      `- route: ${feature.route}`,
    );
    if (feature.pointers.component) result.push(`- component: ${feature.pointers.component}`);
    if (feature.pointers.source) result.push(`- source: ${feature.pointers.source}`);
    if (feature.accessible.role) result.push(`- role: ${feature.accessible.role}`);
    if (feature.accessible.name) result.push(`- name: ${feature.accessible.name}`);
    if (feature.accessible.selector) result.push(`- selector: ${feature.accessible.selector}`);
    if (feature.accessible.dataTestId)
      result.push(`- data-testid: ${feature.accessible.dataTestId}`);
    result.push(
      `- expected state: ${feature.expectedState}`,
      `- broken state: ${feature.brokenState}`,
      `- prerequisites: ${feature.prerequisites.join(", ")}`,
      `- evidence: ${canonicalEvidence(feature.evidence)}`,
      "",
    );
  }
  return `${result.join("\n").trimEnd()}\n`;
}

export function validateFeatureMap(map: unknown): FeatureMapValidation {
  const errors: string[] = [];
  if (!map || typeof map !== "object")
    return { valid: false, errors: ["feature map must be an object"] };
  const candidate = map as Partial<FeatureMap>;
  if (candidate.version !== 1) errors.push("version must be 1");
  if (!text(candidate.app) || !/^[a-z0-9][a-z0-9-]*$/.test(candidate.app!))
    errors.push("app must be a kebab-case name");
  if (!Array.isArray(candidate.features) || candidate.features.length === 0)
    errors.push("features must be a non-empty array");
  const ids = new Set<string>();
  for (const [index, feature] of (candidate.features ?? []).entries()) {
    const prefix = `features[${index}]`;
    if (!feature || typeof feature !== "object") {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    const item = feature as Partial<FeatureEntry>;
    if (!text(item.id) || !/^[a-z0-9][a-z0-9-]*$/.test(item.id!))
      errors.push(`${prefix}.id must be kebab-case`);
    if (ids.has(item.id!)) errors.push(`${prefix}.id duplicates ${item.id}`);
    ids.add(item.id!);
    for (const field of ["userGoal", "route", "expectedState", "brokenState"] as const)
      requireSingleLine(item[field], `${prefix}.${field}`, errors);
    if (!item.pointers || typeof item.pointers !== "object")
      errors.push(`${prefix}.pointers is required`);
    if (!item.accessible || typeof item.accessible !== "object")
      errors.push(`${prefix}.accessible is required`);
    if (!Array.isArray(item.prerequisites)) errors.push(`${prefix}.prerequisites must be an array`);
    else
      item.prerequisites.forEach((value, prerequisiteIndex) =>
        requireSingleLine(value, `${prefix}.prerequisites[${prerequisiteIndex}]`, errors),
      );
    for (const [name, value] of Object.entries(item.pointers ?? {}))
      if (value !== undefined) requireSingleLine(value, `${prefix}.pointers.${name}`, errors);
    for (const [name, value] of Object.entries(item.accessible ?? {}))
      if (value !== undefined) requireSingleLine(value, `${prefix}.accessible.${name}`, errors);
    if (!item.evidence || typeof item.evidence !== "object")
      errors.push(`${prefix}.evidence is required`);
    else {
      const enabled = Object.values(item.evidence).filter((value) => value === true).length;
      if (enabled === 0) errors.push(`${prefix}.evidence must require at least one artifact`);
      if (item.evidence.cleanup !== true) errors.push(`${prefix}.evidence.cleanup must be true`);
    }
    if (item.expectedState === item.brokenState && text(item.expectedState))
      errors.push(`${prefix} expectedState and brokenState must differ`);
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidFeatureMap(map: unknown): asserts map is FeatureMap {
  const result = validateFeatureMap(map);
  if (!result.valid) throw new Error(`invalid feature map: ${result.errors.join("; ")}`);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export interface FeatureMapDrift {
  drifted: boolean;
  changes: string[];
}

/** Compare contracts while ignoring object key ordering, but not feature ordering. */
export function featureMapDrift(expected: FeatureMap, actual: FeatureMap): FeatureMapDrift {
  const changes: string[] = [];
  if (expected.app !== actual.app)
    changes.push(`app changed from ${expected.app} to ${actual.app}`);
  const expectedById = new Map(expected.features.map((feature) => [feature.id, feature]));
  const actualById = new Map(actual.features.map((feature) => [feature.id, feature]));
  for (const feature of expected.features) {
    if (!actualById.has(feature.id)) changes.push(`feature removed: ${feature.id}`);
    else if (stable(feature) !== stable(actualById.get(feature.id)))
      changes.push(`feature changed: ${feature.id}`);
  }
  for (const feature of actual.features)
    if (!expectedById.has(feature.id)) changes.push(`feature added: ${feature.id}`);
  return { drifted: changes.length > 0, changes };
}

export const detectFeatureMapDrift = featureMapDrift;

/** Short aliases used by callers that do not need to distinguish the format. */
export const parseFeatureMap = parseFeatureMapMarkdown;
export const renderFeatureMap = renderFeatureMapMarkdown;

export function validateFeatureMapMarkdown(markdown: string): FeatureMapValidation {
  try {
    return validateFeatureMap(parseFeatureMapMarkdown(markdown));
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function assertNoFeatureMapDrift(expected: FeatureMap, actual: FeatureMap): void {
  const result = featureMapDrift(expected, actual);
  if (result.drifted) throw new Error(`feature map drift: ${result.changes.join("; ")}`);
}

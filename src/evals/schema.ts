/** JSON-compatible contract for a deterministic skill evaluation. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type RequiredAssertion =
  | { kind: "required-text"; text: string }
  | { kind: "structured-field"; path: string; equals: JsonValue }
  | { kind: "file"; path: string; exists?: boolean; contains?: string }
  | { kind: "action"; action: string; minCount?: number }
  | { kind: "exit-outcome"; outcome: "success" | "failure"; code?: number | null };

export type ProhibitedBehavior =
  | string
  | { kind: "forbidden-text"; text: string }
  | { kind: "forbidden-action"; action: string };

export interface EvidenceExpectations {
  /** Human-readable evidence that a candidate is expected to produce. */
  required: readonly string[];
}

export interface EvalCase {
  id: string;
  targetSkill: string;
  fixture: JsonValue;
  input: JsonValue;
  requiredAssertions: readonly RequiredAssertion[];
  prohibitedBehaviors: readonly ProhibitedBehavior[];
  dependencySkills: readonly string[];
  evidenceExpectations: EvidenceExpectations;
}

export interface EvalCaseValidation {
  valid: boolean;
  errors: string[];
}

const CASE_KEYS = new Set([
  "id",
  "targetSkill",
  "fixture",
  "input",
  "requiredAssertions",
  "prohibitedBehaviors",
  "dependencySkills",
  "evidenceExpectations",
]);
const ASSERTION_KEYS = new Map<string, readonly string[]>([
  ["required-text", ["kind", "text"]],
  ["structured-field", ["kind", "path", "equals"]],
  ["file", ["kind", "path", "exists", "contains"]],
  ["action", ["kind", "action", "minCount"]],
  ["exit-outcome", ["kind", "outcome", "code"]],
]);
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return object(value) && Object.values(value).every(jsonValue);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function nonEmptyString(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function skill(value: unknown, path: string, errors: string[]): value is string {
  if (!nonEmptyString(value, path, errors) || !SKILL_NAME.test(value)) {
    if (typeof value === "string" && value.trim() !== "" && !SKILL_NAME.test(value))
      errors.push(`${path} must be a kebab-case skill name`);
    return false;
  }
  return true;
}

function stringList(
  value: unknown,
  path: string,
  errors: string[],
  allowEmpty = true,
): value is string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return false;
  }
  if (!allowEmpty && value.length === 0) errors.push(`${path} must not be empty`);
  value.forEach((item, index) => nonEmptyString(item, `${path}[${index}]`, errors));
  return true;
}

function assertion(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const kind = value.kind;
  if (typeof kind !== "string" || !ASSERTION_KEYS.has(kind)) {
    errors.push(`${path}.kind is unsupported`);
    return;
  }
  exactKeys(value, ASSERTION_KEYS.get(kind)!, path, errors);
  if (kind === "required-text") nonEmptyString(value.text, `${path}.text`, errors);
  if (kind === "structured-field") {
    nonEmptyString(value.path, `${path}.path`, errors);
    if (!jsonValue(value.equals)) errors.push(`${path}.equals must be JSON-compatible`);
  }
  if (kind === "file") {
    nonEmptyString(value.path, `${path}.path`, errors);
    if (value.exists !== undefined && typeof value.exists !== "boolean")
      errors.push(`${path}.exists must be boolean`);
    if (value.contains !== undefined) nonEmptyString(value.contains, `${path}.contains`, errors);
  }
  if (kind === "action") {
    nonEmptyString(value.action, `${path}.action`, errors);
    if (
      value.minCount !== undefined &&
      (typeof value.minCount !== "number" ||
        !Number.isInteger(value.minCount) ||
        value.minCount < 1)
    )
      errors.push(`${path}.minCount must be a positive integer`);
  }
  if (kind === "exit-outcome") {
    if (value.outcome !== "success" && value.outcome !== "failure")
      errors.push(`${path}.outcome must be success or failure`);
    if (
      value.code !== undefined &&
      value.code !== null &&
      (typeof value.code !== "number" || !Number.isInteger(value.code) || value.code < 0)
    )
      errors.push(`${path}.code must be a non-negative integer or null`);
  }
}

function prohibited(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "string") {
    nonEmptyString(value, path, errors);
    return;
  }
  if (!object(value) || (value.kind !== "forbidden-text" && value.kind !== "forbidden-action")) {
    errors.push(`${path} must be text or a forbidden-text/forbidden-action object`);
    return;
  }
  const keys = value.kind === "forbidden-text" ? ["kind", "text"] : ["kind", "action"];
  exactKeys(value, keys, path, errors);
  nonEmptyString(
    value[value.kind === "forbidden-text" ? "text" : "action"],
    `${path}.${value.kind === "forbidden-text" ? "text" : "action"}`,
    errors,
  );
}

/** Return every schema error; unknown fields are rejected rather than ignored. */
export function validateEvalCase(value: unknown): EvalCaseValidation {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ["eval case must be an object"] };
  exactKeys(value, [...CASE_KEYS], "case", errors);
  nonEmptyString(value.id, "id", errors);
  if (typeof value.id === "string" && !/^[a-z0-9][a-z0-9-]*$/.test(value.id))
    errors.push("id must be kebab-case");
  skill(value.targetSkill, "targetSkill", errors);
  if (!jsonValue(value.fixture)) errors.push("fixture must be JSON-compatible");
  if (!jsonValue(value.input)) errors.push("input must be JSON-compatible");
  if (!Array.isArray(value.requiredAssertions) || value.requiredAssertions.length === 0)
    errors.push("requiredAssertions must be a non-empty array");
  else
    value.requiredAssertions.forEach((item, index) =>
      assertion(item, `requiredAssertions[${index}]`, errors),
    );
  if (!Array.isArray(value.prohibitedBehaviors))
    errors.push("prohibitedBehaviors must be an array");
  else
    value.prohibitedBehaviors.forEach((item, index) =>
      prohibited(item, `prohibitedBehaviors[${index}]`, errors),
    );
  if (Array.isArray(value.dependencySkills))
    value.dependencySkills.forEach((item, index) =>
      skill(item, `dependencySkills[${index}]`, errors),
    );
  else errors.push("dependencySkills must be an array");
  if (!object(value.evidenceExpectations)) errors.push("evidenceExpectations must be an object");
  else {
    exactKeys(value.evidenceExpectations, ["required"], "evidenceExpectations", errors);
    stringList(value.evidenceExpectations.required, "evidenceExpectations.required", errors);
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidEvalCase(value: unknown): asserts value is EvalCase {
  const result = validateEvalCase(value);
  if (!result.valid) throw new Error(`Invalid eval case: ${result.errors.join("; ")}`);
}

export const validateCase = validateEvalCase;
export const assertValidCase = assertValidEvalCase;

export function parseEvalCaseJson(json: string): EvalCase {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid eval case JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertValidEvalCase(value);
  return value;
}

export const parseCase = parseEvalCaseJson;

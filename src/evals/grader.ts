import type { EvalCase, JsonValue, ProhibitedBehavior, RequiredAssertion } from "./schema.js";

export interface CandidateExit {
  outcome: "success" | "failure" | "unknown";
  code: number | null;
}

export interface CandidateObservation {
  text: string;
  structured: JsonValue | undefined;
  files: Readonly<Record<string, string>>;
  actions: readonly string[];
  exit: CandidateExit;
}

export interface AssertionResult {
  kind: string;
  passed: boolean;
  hard: true;
  message: string;
}

export interface CandidateGrade {
  passed: boolean;
  hardPassed: boolean;
  assertions: readonly AssertionResult[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(json);
  return object(value) && Object.values(value).every(json);
}

function pathParts(path: string): string[] {
  return path
    .replace(/\[([0-9]+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}

function atPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of pathParts(path)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (object(current)) current = current[part];
    else return undefined;
  }
  return current;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalize a model result while discarding unobservable provider metadata. */
export function normalizeCandidate(value: unknown): CandidateObservation {
  const candidate = object(value) ? value : {};
  const text = textOf(candidate.text ?? candidate.output ?? candidate.stdout);
  const rawStructured = candidate.structured ?? candidate.structuredFields ?? candidate.fields;
  const structured = json(rawStructured) ? rawStructured : undefined;
  const files: Record<string, string> = {};
  if (object(candidate.files)) {
    for (const [path, content] of Object.entries(candidate.files)) {
      if (typeof content === "string") files[path] = content;
      else if (object(content) && typeof content.content === "string")
        files[path] = content.content;
    }
  }
  const rawActions = Array.isArray(candidate.actions) ? candidate.actions : [];
  const actions = rawActions.flatMap((action) => {
    if (typeof action === "string") return [action];
    if (object(action) && typeof action.action === "string") return [action.action];
    if (object(action) && typeof action.type === "string") return [action.type];
    return [];
  });
  const rawExit = object(candidate.exit) ? candidate.exit : candidate;
  const candidateCode = rawExit.code ?? candidate.exitCode;
  const code =
    typeof candidateCode === "number" && Number.isInteger(candidateCode) ? candidateCode : null;
  const explicit = rawExit.outcome ?? candidate.exitOutcome;
  const outcome: CandidateExit["outcome"] =
    explicit === "success" || explicit === "failure"
      ? explicit
      : code === null
        ? "unknown"
        : code === 0
          ? "success"
          : "failure";
  return { text, structured, files, actions, exit: { outcome, code } };
}

function result(kind: string, passed: boolean, message: string): AssertionResult {
  return { kind, passed, hard: true, message };
}

function required(
  assertion: RequiredAssertion,
  observation: CandidateObservation,
): AssertionResult {
  switch (assertion.kind) {
    case "required-text":
      return result(
        assertion.kind,
        observation.text.includes(assertion.text),
        `required text ${JSON.stringify(assertion.text)} ${observation.text.includes(assertion.text) ? "present" : "missing"}`,
      );
    case "structured-field": {
      const actual = atPath(observation.structured, assertion.path);
      const passed = stable(actual) === stable(assertion.equals);
      return result(
        assertion.kind,
        passed,
        `structured field ${assertion.path} ${passed ? "matches" : `was ${stable(actual)}`}`,
      );
    }
    case "file": {
      const content = observation.files[assertion.path];
      const exists = content !== undefined;
      const expectedExists = assertion.exists ?? true;
      const passed =
        exists === expectedExists &&
        (!exists || assertion.contains === undefined || content.includes(assertion.contains));
      return result(
        assertion.kind,
        passed,
        `file ${assertion.path} ${passed ? "matches" : "does not match"}`,
      );
    }
    case "action": {
      const count = observation.actions.filter((action) => action === assertion.action).length;
      const passed = count >= (assertion.minCount ?? 1);
      return result(assertion.kind, passed, `action ${assertion.action} observed ${count} time(s)`);
    }
    case "exit-outcome": {
      const passed =
        observation.exit.outcome === assertion.outcome &&
        (assertion.code === undefined || observation.exit.code === assertion.code);
      return result(
        assertion.kind,
        passed,
        `exit outcome was ${observation.exit.outcome}${observation.exit.code === null ? "" : ` (${observation.exit.code})`}`,
      );
    }
  }
}

function prohibited(
  behavior: ProhibitedBehavior,
  observation: CandidateObservation,
): AssertionResult {
  if (typeof behavior === "string" || behavior.kind === "forbidden-text") {
    const text = typeof behavior === "string" ? behavior : behavior.text;
    const passed = !observation.text.includes(text);
    return result(
      "forbidden-text",
      passed,
      `forbidden text ${JSON.stringify(text)} ${passed ? "absent" : "present"}`,
    );
  }
  const passed = !observation.actions.includes(behavior.action);
  return result(
    "forbidden-action",
    passed,
    `forbidden action ${behavior.action} ${passed ? "absent" : "present"}`,
  );
}

/** Grade only observable facts. Every assertion is hard and cannot be softened by a judge. */
export function gradeCandidate(evalCase: EvalCase, candidate: unknown): CandidateGrade {
  const observation = normalizeCandidate(candidate);
  const assertions = [
    ...evalCase.requiredAssertions.map((item) => required(item, observation)),
    ...evalCase.prohibitedBehaviors.map((item) => prohibited(item, observation)),
  ];
  const hardPassed = assertions.every((item) => item.passed);
  return { passed: hardPassed, hardPassed, assertions };
}

export const gradeEvalCandidate = gradeCandidate;
export const gradeAssertions = gradeCandidate;

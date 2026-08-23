import type { BennyConfig } from "./types.js";

const required = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "string" || !value.trim()) errors.push(`${path} is required`);
};
const object = (
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    errors.push(`${path} must be an object`);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
};

export function validateBennyConfig(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = object(value, "config", errors);
  if (!root) return { valid: false, errors };
  if (root.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const automations = object(root.automations, "automations", errors);
  if (automations) {
    required(automations.triageName, "automations.triageName", errors);
    required(automations.reproduceName, "automations.reproduceName", errors);
  }
  const slack = object(root.slack, "slack", errors);
  if (slack) {
    required(slack.sourceChannelId, "slack.sourceChannelId", errors);
    required(slack.triageIdentityUserId, "slack.triageIdentityUserId", errors);
    if (slack.allowSourceRootPosts !== false)
      errors.push("slack.allowSourceRootPosts must be false");
    if (slack.allowWorkerSlackWrites !== false)
      errors.push("slack.allowWorkerSlackWrites must be false");
  }
  const tracker = object(root.tracker, "tracker", errors);
  if (tracker) {
    required(tracker.adapter, "tracker.adapter", errors);
    required(tracker.team, "tracker.team", errors);
    required(tracker.project, "tracker.project", errors);
    required(tracker.status, "tracker.status", errors);
    const labels = object(tracker.labels, "tracker.labels", errors);
    if (labels) {
      required(labels.bug, "tracker.labels.bug", errors);
      required(labels.performance, "tracker.labels.performance", errors);
      required(labels.intake, "tracker.labels.intake", errors);
    }
    if (tracker.requireCompensationAction !== true)
      errors.push("tracker.requireCompensationAction must be true");
  }
  const repository = object(root.repository, "repository", errors);
  if (repository) {
    required(repository.url, "repository.url", errors);
    required(repository.defaultBranch, "repository.defaultBranch", errors);
    if (repository.draftOnly !== true) errors.push("repository.draftOnly must be true");
  }
  const control = object(root.control, "control", errors);
  if (control) {
    required(control.adapter, "control.adapter", errors);
    required(control.featureMapPath, "control.featureMapPath", errors);
    required(control.environment, "control.environment", errors);
    required(control.artifactDirectory, "control.artifactDirectory", errors);
  }
  const markers = object(root.verdictMarkers, "verdictMarkers", errors);
  if (markers) {
    required(markers.bug, "verdictMarkers.bug", errors);
    required(markers.performance, "verdictMarkers.performance", errors);
    required(markers.other, "verdictMarkers.other", errors);
    if (
      markers.bug === markers.performance ||
      markers.bug === markers.other ||
      markers.performance === markers.other
    )
      errors.push("verdictMarkers must be distinct");
  }
  const budgets = object(root.budgets, "budgets", errors);
  if (budgets)
    for (const key of ["pollSeconds", "reproMinutes", "fixMinutes"])
      if (typeof budgets[key] !== "number" || !Number.isInteger(budgets[key]) || budgets[key] <= 0)
        errors.push(`budgets.${key} must be a positive integer`);
  return { valid: errors.length === 0, errors };
}

export function assertValidBennyConfig(value: unknown): asserts value is BennyConfig {
  const result = validateBennyConfig(value);
  if (!result.valid) throw new Error(`invalid Benny config: ${result.errors.join("; ")}`);
}
export const validateConfig = validateBennyConfig;

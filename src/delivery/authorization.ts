import {
  AUTONOMY_LEVELS,
  type DeliveryAuthorization,
  type DeliveryAuthorizationRequest,
  type EvidenceReceipt,
  type ProjectReadiness,
} from "./types.js";

const IDENTITY_FIELDS = ["repoIdentity", "headSha"] as const;

export interface EvidenceReceiptInput extends Omit<EvidenceReceipt, "version"> {
  version?: 1;
}

/** Construct a receipt with an explicit schema version; no evidence is inferred. */
export function createEvidenceReceipt(input: EvidenceReceiptInput): EvidenceReceipt {
  return { ...input, version: 1 };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validFileEvidence(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const evidence = value as { path?: unknown; sha256?: unknown };
  return nonEmpty(evidence.path) && /^[a-f0-9]{64}$/i.test(String(evidence.sha256 ?? ""));
}

/** Return every missing or unsafe part, rather than stopping at the first one. */
export function validateEvidenceReceipt(receipt: unknown): string[] {
  const reasons: string[] = [];
  if (!receipt || typeof receipt !== "object") return ["missing evidence receipt"];
  const value = receipt as Partial<EvidenceReceipt>;
  if (value.version !== 1) reasons.push("unsupported evidence receipt version");
  for (const field of IDENTITY_FIELDS) {
    if (!nonEmpty(value[field])) reasons.push(`missing evidence: ${field}`);
  }
  if (!validFileEvidence(value.featureMap)) reasons.push("invalid feature map evidence");
  if (!validFileEvidence(value.skill)) reasons.push("invalid skill evidence");
  if (value.backend !== "gh-stack" && value.backend !== "graphite")
    reasons.push("missing evidence: backend");

  const checks = value.deterministicChecks;
  if (
    !checks ||
    checks.status !== "green" ||
    !Array.isArray(checks.checks) ||
    checks.checks.length === 0
  ) {
    reasons.push("deterministic checks are not green");
  } else if (checks.checks.some((check) => !check || check.status !== "passed")) {
    reasons.push("deterministic checks are not green");
  }

  const artifacts = value.liveVerificationArtifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    reasons.push("missing evidence: live verification artifacts");
  } else if (
    artifacts.some(
      (artifact) =>
        !artifact ||
        !nonEmpty(artifact.kind) ||
        !nonEmpty(artifact.path) ||
        !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? ""),
    )
  ) {
    reasons.push("invalid live verification artifact digest");
  }

  const review = value.independentReview;
  if (
    !review ||
    review.status !== "approved" ||
    !nonEmpty(review.reviewer) ||
    !validFileEvidence(review.evidence)
  )
    reasons.push("independent review is unresolved");
  const evaluation = value.evalResult;
  if (!evaluation || evaluation.status !== "passed" || !validFileEvidence(evaluation.evidence))
    reasons.push("eval result is not passed");
  if (
    value.projectReadiness !== undefined &&
    value.projectReadiness !== "ready" &&
    value.projectReadiness !== "not-ready"
  )
    reasons.push("invalid project readiness");
  if (value.origin !== undefined && value.origin !== "human" && value.origin !== "benny")
    reasons.push("invalid evidence: origin");
  return reasons;
}

function requiresProjectReadiness(level: DeliveryAuthorizationRequest["level"]): boolean {
  return level === "pr" || level === "merge-ready" || level === "auto-merge";
}

/**
 * Fail-closed authorization. This function has no backend side effects and does
 * not inspect or mutate a stack; callers execute an operation only when allowed.
 */
export function authorizeDelivery(request: DeliveryAuthorizationRequest): DeliveryAuthorization {
  const reasons: string[] = [];
  const level = request.level;
  if (!AUTONOMY_LEVELS.includes(level)) reasons.push("unknown autonomy level");

  const receipt = request.receipt;
  reasons.push(...validateEvidenceReceipt(receipt));
  if (receipt) {
    if (receipt.headSha !== request.currentHeadSha) reasons.push("stale head SHA");
    if (receipt.backend !== request.backend)
      reasons.push("receipt backend does not match selected backend");
    if (request.repoIdentity !== undefined && receipt.repoIdentity !== request.repoIdentity)
      reasons.push("receipt repository identity does not match repository");
    if (
      request.projectReadiness !== undefined &&
      receipt.projectReadiness !== request.projectReadiness
    )
      reasons.push("receipt project readiness does not match current project");
    if (request.origin !== undefined && receipt.origin !== request.origin)
      reasons.push("receipt origin does not match request");
  }

  const readiness: ProjectReadiness | undefined =
    request.projectReadiness ?? receipt?.projectReadiness;
  if (requiresProjectReadiness(level) && readiness !== "ready")
    reasons.push("insufficient project readiness");

  const origin = request.origin ?? receipt?.origin;
  const draftOnly = origin === "benny";
  if (origin === "benny" && (level === "merge-ready" || level === "auto-merge"))
    reasons.push("Benny origin is draft-only");

  return {
    allowed: reasons.length === 0,
    backend: request.backend,
    level,
    draftOnly,
    reasons: [...new Set(reasons)],
  };
}

export function assertDeliveryAuthorized(
  request: DeliveryAuthorizationRequest,
): DeliveryAuthorization {
  const authorization = authorizeDelivery(request);
  if (!authorization.allowed)
    throw new Error(`delivery authorization rejected: ${authorization.reasons.join("; ")}`);
  return authorization;
}

export const authorize = authorizeDelivery;
export const canDeliver = authorizeDelivery;

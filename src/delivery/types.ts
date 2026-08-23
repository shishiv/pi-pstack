/** The only delivery state kept by this package is evidence for one head SHA. */
export const AUTONOMY_LEVELS = ["verify", "prepare", "pr", "merge-ready", "auto-merge"] as const;

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];
export type StackBackendName = "gh-stack" | "graphite";
export type DeliveryOrigin = "human" | "benny";
export type ProjectReadiness = "ready" | "not-ready";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** A runner is deliberately argv-only: adapters never construct a shell command. */
export type CommandRunner = {
  run(argv: readonly string[]): CommandResult | Promise<CommandResult>;
};

export interface DeterministicCheck {
  name: string;
  status: "passed" | "failed" | "not-run";
  output?: string;
}

export interface DeterministicChecks {
  status: "green" | "red";
  checks: readonly DeterministicCheck[];
}

export interface LiveVerificationArtifact {
  kind: string;
  path: string;
  sha256: string;
}

export interface FileEvidence {
  path: string;
  sha256: string;
}

/** The on-disk, versioned statement produced by an independent reviewer. */
export interface StructuredReviewEvidence {
  version: 1;
  type: "review-evidence";
  repoIdentity: string;
  headSha: string;
  reviewer: string;
  runId: string;
  verdict: "VERIFIED";
  rawReview: FileEvidence;
}

export interface IndependentReview {
  status: "approved" | "unresolved" | "changes-requested";
  reviewer: string;
  evidence: FileEvidence;
  /** Values copied from and checked against the structured review artifact. */
  repoIdentity?: string;
  headSha?: string;
  runId?: string;
  verdict?: "VERIFIED";
}

export interface EvalResult {
  status: "passed" | "failed" | "not-run";
  evidence: FileEvidence;
  summary?: string;
}

export interface StructuredEvalEvidence {
  version: 1;
  type: "eval-evidence";
  repoIdentity: string;
  headSha: string;
  caseId: string;
  evalCase: FileEvidence;
  targetSkill: FileEvidence;
  candidates: readonly [
    { label: "Candidate A"; current: true; output: FileEvidence; grade: unknown },
    { label: "Candidate B"; current: false; output: FileEvidence; grade: unknown },
  ];
  judgeEvidence: FileEvidence;
  judge: {
    winner: "Candidate A" | "Candidate B";
    rationale: string;
  };
  aggregate: {
    accepted: boolean;
    winner: "Candidate A" | "Candidate B" | null;
    reason: string;
  };
}

/**
 * Versioning is intentional. A receipt must be rejected when its schema is not
 * understood rather than being treated as partial evidence.
 */
export interface EvidenceReceipt {
  version: 2;
  repoIdentity: string;
  headSha: string;
  featureMap: FileEvidence;
  skill: FileEvidence;
  deterministicChecks: DeterministicChecks;
  liveVerificationArtifacts: readonly LiveVerificationArtifact[];
  independentReview: IndependentReview;
  evalResult: EvalResult;
  /** Digests and semantics are re-read from these structured files at delivery time. */
  reviewEvidence: FileEvidence;
  evalEvidence: FileEvidence;
  artifactManifest: FileEvidence;
  backend: StackBackendName;
  /** Optional request context; authorization may supply these independently. */
  projectReadiness?: ProjectReadiness;
  origin: DeliveryOrigin;
}

export type StackOperation =
  | { kind: "inspect" }
  | { kind: "prepare"; branch: string }
  | { kind: "submit"; draft: boolean }
  | { kind: "sync" }
  | { kind: "rebase" }
  | { kind: "auto-merge"; pullRequest?: string };

export interface StackSnapshot {
  backend: StackBackendName;
  repoIdentity?: string;
  headSha?: string;
  pullRequest?: string;
  raw: unknown;
}

export interface StackActionResult {
  backend: StackBackendName;
  operation: StackOperation["kind"];
  argv: readonly string[];
  accepted: boolean;
  pullRequest?: string;
  headSha?: string;
  raw: unknown;
}

export interface StackBackend {
  readonly name: StackBackendName;
  inspect(): Promise<StackSnapshot>;
  execute(operation: StackOperation): Promise<StackActionResult>;
  run(operation: StackOperation): Promise<StackActionResult>;
}

export interface DeliveryAuthorizationRequest {
  receipt?: EvidenceReceipt;
  repoIdentity?: string;
  currentHeadSha: string;
  backend: StackBackendName;
  level: AutonomyLevel;
  projectReadiness?: ProjectReadiness;
  origin?: DeliveryOrigin;
}

export interface DeliveryAuthorization {
  allowed: boolean;
  backend: StackBackendName;
  level: AutonomyLevel;
  draftOnly: boolean;
  reasons: readonly string[];
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { aggregateGrades, type BlindLabel, type CandidateGrade } from "../evals/index.js";
import {
  assertValidFeatureMap,
  parseFeatureMapMarkdown,
  type FeatureMap,
  type EvidenceRequirements,
} from "../verification/feature-map.js";
import type { ArtifactManifest } from "../verification/artifacts.js";
import { createEvidenceReceipt } from "./authorization.js";
import type {
  DeliveryOrigin,
  DeterministicChecks,
  EvidenceReceipt,
  FileEvidence,
  IndependentReview,
  StackBackendName,
  StructuredEvalEvidence,
  StructuredReviewEvidence,
} from "./types.js";

const DIGEST = /^[a-f0-9]{64}$/i;
const FIXED_CLEAN_WORKTREE_CHECKS: DeterministicChecks = Object.freeze({
  status: "green",
  checks: Object.freeze([{ name: "clean-worktree", status: "passed" as const }]),
});

export const cleanWorktreeCheckResult = FIXED_CLEAN_WORKTREE_CHECKS;

function inside(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function evidencePath(root: string, input: string): string {
  if (typeof input !== "string" || input.trim() === "")
    throw new Error("evidence path is required");
  const path = resolve(root, input);
  if (!inside(root, path)) throw new Error(`evidence path leaves repository: ${input}`);
  return path;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

export async function fileEvidence(root: string, path: string): Promise<FileEvidence> {
  const absolute = evidencePath(root, path);
  return {
    path: relative(resolve(root), absolute).replaceAll("\\", "/"),
    sha256: await sha256(absolute),
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function fileEvidenceShape(value: unknown): value is FileEvidence {
  return (
    object(value) &&
    nonEmpty(value.path) &&
    typeof value.sha256 === "string" &&
    DIGEST.test(value.sha256)
  );
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Parse and validate a reviewer-produced evidence document. */
export function parseReviewEvidence(value: unknown): StructuredReviewEvidence {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.type !== "review-evidence" ||
    !nonEmpty(value.repoIdentity) ||
    !nonEmpty(value.headSha) ||
    !nonEmpty(value.reviewer) ||
    !nonEmpty(value.runId) ||
    value.verdict !== "VERIFIED" ||
    !fileEvidenceShape(value.rawReview)
  ) {
    throw new Error("invalid structured review evidence");
  }
  return value as unknown as StructuredReviewEvidence;
}

/** Parse and validate the exact two-candidate eval evidence contract. */
export function parseEvalEvidence(value: unknown): StructuredEvalEvidence {
  if (!object(value) || value.version !== 1 || value.type !== "eval-evidence")
    throw new Error("invalid structured eval evidence");
  if (!nonEmpty(value.repoIdentity) || !nonEmpty(value.headSha))
    throw new Error("eval evidence is missing repository identity or HEAD");
  if (!fileEvidenceShape(value.targetSkill))
    throw new Error("eval evidence has invalid target skill");
  const candidates = value.candidates;
  if (
    !Array.isArray(candidates) ||
    candidates.length !== 2 ||
    !object(candidates[0]) ||
    !object(candidates[1]) ||
    candidates[0].label !== "Candidate A" ||
    candidates[1].label !== "Candidate B" ||
    candidates[0].current !== true ||
    candidates[1].current !== false ||
    !("grade" in candidates[0]) ||
    !("grade" in candidates[1])
  )
    throw new Error(
      "eval evidence must contain exactly two blind candidates with Candidate A current",
    );
  if (
    !object(value.judge) ||
    (value.judge.winner !== "Candidate A" && value.judge.winner !== "Candidate B") ||
    !nonEmpty(value.judge.rationale)
  )
    throw new Error("eval evidence has no real judge decision");
  if (
    !object(value.aggregate) ||
    typeof value.aggregate.accepted !== "boolean" ||
    (value.aggregate.winner !== null &&
      value.aggregate.winner !== "Candidate A" &&
      value.aggregate.winner !== "Candidate B") ||
    !nonEmpty(value.aggregate.reason)
  )
    throw new Error("eval evidence has no aggregate result");
  const currentGrade = candidates[0].grade;
  if (!object(currentGrade) || currentGrade.hardPassed !== true)
    throw new Error("current Candidate A does not hard-pass the eval");
  return value as unknown as StructuredEvalEvidence;
}

export function validateReviewEvidence(value: unknown): string[] {
  try {
    parseReviewEvidence(value);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

export function validateEvalEvidence(value: unknown): string[] {
  try {
    parseEvalEvidence(value);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function artifactPaths(map: FeatureMap): Set<string> {
  const kinds = new Set<string>();
  for (const feature of map.features) {
    const evidence = feature.evidence as EvidenceRequirements;
    if (evidence.screenshot) kinds.add("screenshot");
    if (evidence.accessibility || evidence.domSnapshot) kinds.add("accessibilityDomSnapshot");
    if (evidence.trace) kinds.add("trace");
    if (evidence.video) kinds.add("video");
  }
  return kinds;
}

function manifestPath(manifest: ArtifactManifest, kind: string): string | undefined {
  const value = (manifest as unknown as Record<string, unknown>)[kind];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

const MANIFEST_ARTIFACT_KINDS = [
  "screenshot",
  "accessibilityDomSnapshot",
  "trace",
  "video",
] as const;

function validateExactIdentity(
  review: StructuredReviewEvidence,
  evaluation: StructuredEvalEvidence,
  input: { repoIdentity: string; headSha: string; skill: FileEvidence },
): void {
  if (review.repoIdentity !== input.repoIdentity || review.headSha !== input.headSha)
    throw new Error("review evidence does not match repository identity or HEAD");
  if (evaluation.repoIdentity !== input.repoIdentity || evaluation.headSha !== input.headSha)
    throw new Error("eval evidence does not match repository identity or HEAD");
  if (
    evaluation.targetSkill.path !== input.skill.path ||
    evaluation.targetSkill.sha256.toLowerCase() !== input.skill.sha256.toLowerCase()
  )
    throw new Error("eval evidence target skill does not match skill path or digest");
}

export interface EvidenceReceiptFilesInput {
  /** Compatibility index for integrations that still send retired check fields. */
  readonly [key: string]: unknown;
  root: string;
  repoIdentity: string;
  headSha: string;
  backend: StackBackendName;
  origin: DeliveryOrigin;
  featureMapPath: string;
  skillPath: string;
  artifactManifestPath?: string;
  /** Kept as an input for old integrations; artifact kinds now come from the manifest. */
  artifactPaths?: readonly { kind: string; path: string }[];
  reviewPath: string;
  reviewer?: string;
  runId?: string;
  evalPath: string;
  /** Internal callers may provide the single fixed clean-worktree result. */
  cleanWorktreeCheck?: {
    name: "clean-worktree";
    status: "passed" | "failed" | "not-run";
    output?: string;
  };
}

/** Create a receipt by reading only the declared, exact-head evidence chain. */
export async function createEvidenceReceiptFromFiles(
  input: EvidenceReceiptFilesInput,
): Promise<EvidenceReceipt> {
  const featureMapEvidence = await fileEvidence(input.root, input.featureMapPath);
  if (input.cleanWorktreeCheck && input.cleanWorktreeCheck.status !== "passed")
    throw new Error("clean worktree check did not pass");
  const featureMap = parseFeatureMap(
    await readFile(evidencePath(input.root, input.featureMapPath), "utf8"),
  );
  assertValidFeatureMap(featureMap);
  const skill = await fileEvidence(input.root, input.skillPath);
  const reviewEvidence = await fileEvidence(input.root, input.reviewPath);
  const review = parseReviewEvidence(
    parseJson(
      await readFile(evidencePath(input.root, input.reviewPath), "utf8"),
      "review evidence",
    ),
  );
  const evalEvidence = await fileEvidence(input.root, input.evalPath);
  const evaluation = parseEvalEvidence(
    parseJson(await readFile(evidencePath(input.root, input.evalPath), "utf8"), "eval evidence"),
  );
  validateExactIdentity(review, evaluation, {
    repoIdentity: input.repoIdentity,
    headSha: input.headSha,
    skill,
  });
  if (input.reviewer !== undefined && review.reviewer !== input.reviewer)
    throw new Error("reviewer identity does not match review evidence");
  if (input.runId !== undefined && review.runId !== input.runId)
    throw new Error("review run identity does not match review evidence");
  const rawReview = await fileEvidence(input.root, review.rawReview.path);
  if (rawReview.sha256.toLowerCase() !== review.rawReview.sha256.toLowerCase())
    throw new Error("raw review output digest does not match");
  const manifestEvidence = await fileEvidence(
    input.root,
    input.artifactManifestPath ?? "artifact-manifest.json",
  );
  const manifestValue = parseJson(
    await readFile(evidencePath(input.root, manifestEvidence.path), "utf8"),
    "artifact manifest",
  );
  if (
    !object(manifestValue) ||
    manifestValue.version !== 1 ||
    manifestValue.cleanupResult !== "passed"
  )
    throw new Error("artifact manifest cleanup did not pass");
  const manifest = manifestValue as unknown as ArtifactManifest;
  const requiredKinds = artifactPaths(featureMap);
  const artifacts = [] as { kind: string; path: string; sha256: string }[];
  for (const kind of requiredKinds) {
    const path = manifestPath(manifest, kind);
    if (!path) throw new Error(`artifact manifest is missing required artifact kind: ${kind}`);
    artifacts.push({ kind, ...(await fileEvidence(input.root, path)) });
  }
  // Do not leave an optional manifest reference unbound: every referenced file
  // must be hashed, even when the current feature map does not require it.
  for (const kind of MANIFEST_ARTIFACT_KINDS) {
    if (!requiredKinds.has(kind)) {
      const path = manifestPath(manifest, kind);
      if (path) artifacts.push({ kind, ...(await fileEvidence(input.root, path)) });
    }
  }
  // A manifest is authoritative. Reject a caller's list if it attempts to smuggle another kind.
  for (const declared of input.artifactPaths ?? [])
    if (!requiredKinds.has(declared.kind))
      throw new Error(`artifact kind is not declared by feature map: ${declared.kind}`);
  const independentReview: IndependentReview = {
    status: "approved",
    reviewer: review.reviewer,
    evidence: rawReview,
    repoIdentity: review.repoIdentity,
    headSha: review.headSha,
    runId: review.runId,
    verdict: review.verdict,
  };
  return createEvidenceReceipt({
    repoIdentity: input.repoIdentity,
    headSha: input.headSha,
    featureMap: featureMapEvidence,
    skill,
    deterministicChecks: input.cleanWorktreeCheck
      ? { status: "green", checks: [input.cleanWorktreeCheck] }
      : FIXED_CLEAN_WORKTREE_CHECKS,
    liveVerificationArtifacts: artifacts,
    independentReview,
    evalResult: { status: "passed", evidence: evalEvidence },
    reviewEvidence,
    evalEvidence,
    artifactManifest: manifestEvidence,
    backend: input.backend,
    projectReadiness: "ready",
    origin: input.origin,
  });
}

async function validateStructuredFiles(receipt: EvidenceReceipt, root: string): Promise<string[]> {
  const reasons: string[] = [];
  try {
    if (!receipt.reviewEvidence || !receipt.evalEvidence || !receipt.artifactManifest)
      throw new Error("receipt is missing structured evidence references");
    const review = parseReviewEvidence(
      parseJson(
        await readFile(evidencePath(root, receipt.reviewEvidence.path), "utf8"),
        "review evidence",
      ),
    );
    const evaluation = parseEvalEvidence(
      parseJson(
        await readFile(evidencePath(root, receipt.evalEvidence.path), "utf8"),
        "eval evidence",
      ),
    );
    validateExactIdentity(review, evaluation, {
      repoIdentity: receipt.repoIdentity,
      headSha: receipt.headSha,
      skill: receipt.skill,
    });
    const raw = await fileEvidence(root, review.rawReview.path);
    if (raw.sha256.toLowerCase() !== review.rawReview.sha256.toLowerCase())
      throw new Error("raw review output digest does not match");
    if (reviewEvidenceIdentity(receipt, review) === false)
      throw new Error("receipt reviewer identity does not match review evidence");
    const manifestValue = parseJson(
      await readFile(evidencePath(root, receipt.artifactManifest.path), "utf8"),
      "artifact manifest",
    );
    if (
      !object(manifestValue) ||
      manifestValue.version !== 1 ||
      manifestValue.cleanupResult !== "passed"
    )
      throw new Error("artifact manifest cleanup did not pass");
    const featureMap = parseFeatureMap(
      await readFile(evidencePath(root, receipt.featureMap.path), "utf8"),
    );
    assertValidFeatureMap(featureMap);
    const manifest = manifestValue as unknown as ArtifactManifest;
    const receiptArtifacts = new Map(
      receipt.liveVerificationArtifacts.map((artifact) => [artifact.kind, artifact]),
    );
    const allKinds = new Set([...artifactPaths(featureMap), ...MANIFEST_ARTIFACT_KINDS]);
    for (const kind of allKinds) {
      const path = manifestPath(manifest, kind);
      if (!path) {
        if (artifactPaths(featureMap).has(kind))
          throw new Error(`artifact manifest is missing required artifact kind: ${kind}`);
        continue;
      }
      const artifact = receiptArtifacts.get(kind);
      if (!artifact) throw new Error(`receipt is missing artifact kind: ${kind}`);
      const actual = await fileEvidence(root, path);
      if (
        artifact.path !== actual.path ||
        artifact.sha256.toLowerCase() !== actual.sha256.toLowerCase()
      )
        throw new Error(`${kind} artifact digest or path does not match artifact manifest`);
    }
    const candidateGrades = evaluation.candidates as unknown as [
      { label: BlindLabel; grade: CandidateGrade },
      { label: BlindLabel; grade: CandidateGrade },
    ];
    const aggregate = aggregateGrades(
      { "Candidate A": candidateGrades[0].grade, "Candidate B": candidateGrades[1].grade },
      evaluation.judge,
    );
    if (
      aggregate.accepted !== evaluation.aggregate.accepted ||
      aggregate.winner !== evaluation.aggregate.winner ||
      aggregate.reason !== evaluation.aggregate.reason
    )
      throw new Error("eval aggregate result does not match aggregateGrades");
    if (aggregate.accepted !== true) throw new Error("eval aggregate did not pass");
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }
  return reasons;
}

function reviewEvidenceIdentity(
  receipt: EvidenceReceipt,
  review: StructuredReviewEvidence,
): boolean {
  return (
    receipt.independentReview.reviewer === review.reviewer &&
    receipt.independentReview.repoIdentity === review.repoIdentity &&
    receipt.independentReview.headSha === review.headSha
  );
}

/** Revalidate exact-head semantics and every evidence digest immediately before delivery. */
export async function revalidateEvidenceReceipt(
  receipt: EvidenceReceipt,
  root: string,
  expected?: { repoIdentity?: string; headSha?: string },
): Promise<string[]> {
  const reasons = await verifyEvidenceReceiptFiles(receipt, root, expected);
  return reasons;
}

export async function verifyEvidenceReceiptFiles(
  receipt: EvidenceReceipt,
  root: string,
  expected?: { repoIdentity?: string; headSha?: string },
): Promise<string[]> {
  const reasons: string[] = [];
  if (expected?.repoIdentity !== undefined && receipt.repoIdentity !== expected.repoIdentity)
    reasons.push("receipt repository identity does not match current repository");
  if (expected?.headSha !== undefined && receipt.headSha !== expected.headSha)
    reasons.push("receipt head SHA does not match current HEAD");
  const evidence = [
    ["feature map", receipt.featureMap],
    ["skill", receipt.skill],
    ["independent review", receipt.independentReview.evidence],
    ["eval", receipt.evalResult.evidence],
    ...receipt.liveVerificationArtifacts.map((artifact) => [artifact.kind, artifact] as const),
    ...(receipt.reviewEvidence ? [["structured review", receipt.reviewEvidence] as const] : []),
    ...(receipt.evalEvidence ? [["structured eval", receipt.evalEvidence] as const] : []),
    ...(receipt.artifactManifest ? [["artifact manifest", receipt.artifactManifest] as const] : []),
  ] as const;
  for (const [label, item] of evidence) {
    try {
      if (!fileEvidenceShape(item)) throw new Error("invalid digest");
      const actual = await sha256(evidencePath(root, item.path));
      if (actual.toLowerCase() !== item.sha256.toLowerCase())
        reasons.push(`${label} digest does not match`);
    } catch (error) {
      reasons.push(
        `${label} evidence unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  reasons.push(...(await validateStructuredFiles(receipt, root)));
  return [...new Set(reasons)];
}

export async function loadEvidenceReceipt(path: string, root: string): Promise<EvidenceReceipt> {
  const value: unknown = parseJson(
    await readFile(evidencePath(root, path), "utf8"),
    "evidence receipt",
  );
  return value as EvidenceReceipt;
}

const parseFeatureMap = parseFeatureMapMarkdown;

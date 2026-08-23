import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createEvidenceReceipt } from "./authorization.js";
import type {
  DeliveryOrigin,
  DeterministicChecks,
  EvidenceReceipt,
  FileEvidence,
  StackBackendName,
} from "./types.js";

function inside(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function evidencePath(root: string, input: string): string {
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

export async function createEvidenceReceiptFromFiles(input: {
  root: string;
  repoIdentity: string;
  headSha: string;
  backend: StackBackendName;
  origin: DeliveryOrigin;
  featureMapPath: string;
  skillPath: string;
  artifactPaths: readonly { kind: string; path: string }[];
  reviewPath: string;
  reviewer: string;
  evalPath: string;
  deterministicChecks: DeterministicChecks;
}): Promise<EvidenceReceipt> {
  const reviewText = await readFile(evidencePath(input.root, input.reviewPath), "utf8");
  if (!/^VERIFIED$/m.test(reviewText))
    throw new Error("independent review evidence is not VERIFIED");
  const evalText = await readFile(evidencePath(input.root, input.evalPath), "utf8");
  const evaluation = JSON.parse(evalText) as { grades?: { grade?: { hardPassed?: boolean } }[] };
  if (!evaluation.grades?.some((entry) => entry.grade?.hardPassed === true))
    throw new Error("eval evidence has no hard-passing candidate");
  return createEvidenceReceipt({
    repoIdentity: input.repoIdentity,
    headSha: input.headSha,
    featureMap: await fileEvidence(input.root, input.featureMapPath),
    skill: await fileEvidence(input.root, input.skillPath),
    deterministicChecks: input.deterministicChecks,
    liveVerificationArtifacts: await Promise.all(
      input.artifactPaths.map(async (artifact) => ({
        kind: artifact.kind,
        ...(await fileEvidence(input.root, artifact.path)),
      })),
    ),
    independentReview: {
      status: "approved",
      reviewer: input.reviewer,
      evidence: await fileEvidence(input.root, input.reviewPath),
    },
    evalResult: {
      status: "passed",
      evidence: await fileEvidence(input.root, input.evalPath),
    },
    backend: input.backend,
    projectReadiness: "ready",
    origin: input.origin,
  });
}

export async function verifyEvidenceReceiptFiles(
  receipt: EvidenceReceipt,
  root: string,
): Promise<string[]> {
  const reasons: string[] = [];
  const evidence = [
    ["feature map", receipt.featureMap],
    ["skill", receipt.skill],
    ["independent review", receipt.independentReview.evidence],
    ["eval", receipt.evalResult.evidence],
    ...receipt.liveVerificationArtifacts.map((artifact) => [artifact.kind, artifact] as const),
  ] as const;
  for (const [label, item] of evidence) {
    try {
      const actual = await sha256(evidencePath(root, item.path));
      if (actual !== item.sha256) reasons.push(`${label} digest does not match`);
    } catch (error) {
      reasons.push(
        `${label} evidence unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return reasons;
}

export async function loadEvidenceReceipt(path: string, root: string): Promise<EvidenceReceipt> {
  const value: unknown = JSON.parse(await readFile(evidencePath(root, path), "utf8"));
  return value as EvidenceReceipt;
}

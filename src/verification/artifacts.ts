import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ArtifactManifest {
  version: 1;
  screenshot: string;
  accessibilityDomSnapshot: string;
  trace: string;
  video?: string;
  cleanupResult: "passed" | "failed" | "not-run";
}

export interface ArtifactManifestInput {
  screenshot: string;
  accessibilityDomSnapshot?: string;
  accessibilitySnapshot?: string;
  domSnapshot?: string;
  trace: string;
  video?: string;
  cleanupResult: ArtifactManifest["cleanupResult"];
}

const SECRET_KEY = /(secret|token|password|passwd|cookie|authorization|api[-_]?key|credential)/i;
const SECRET_VALUE =
  /(bearer\s+[^\s]+|basic\s+[^\s]+|(?:token|password|passwd|secret|api[-_]?key)=([^&\s]+))/gi;

export function sanitizeArtifactText(value: string): string {
  SECRET_VALUE.lastIndex = 0;
  return value.replace(SECRET_VALUE, (match) => {
    const scheme = match.match(/^(bearer|basic)\s/i)?.[1];
    if (scheme) return `${scheme} [REDACTED]`;
    return `${match.split(/[=:]/, 1)[0]}=[REDACTED]`;
  });
}

export function sanitizeArtifactPath(path: string): string {
  // Manifest paths are metadata, not content. Strip query strings and credentials from URLs.
  const withoutQuery = path.replace(/[?#].*$/, "");
  try {
    const url = new URL(withoutQuery);
    if (url.username || url.password) return `${url.protocol}//[REDACTED]${url.pathname}`;
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return sanitizeArtifactText(withoutQuery).replaceAll("\\", "/");
  }
}

export function createArtifactManifest(input: ArtifactManifestInput): ArtifactManifest {
  const manifest: ArtifactManifest = {
    version: 1,
    screenshot: sanitizeArtifactPath(input.screenshot),
    accessibilityDomSnapshot: sanitizeArtifactPath(
      input.accessibilityDomSnapshot ?? input.accessibilitySnapshot ?? input.domSnapshot ?? "",
    ),
    trace: sanitizeArtifactPath(input.trace),
    cleanupResult: input.cleanupResult,
  };
  if (input.video !== undefined) manifest.video = sanitizeArtifactPath(input.video);
  return manifest;
}

export function artifactManifestContainsSecrets(manifest: unknown): boolean {
  const inspect = (value: unknown, key = ""): boolean => {
    if (SECRET_KEY.test(key)) return true;
    if (typeof value === "string") {
      SECRET_VALUE.lastIndex = 0;
      return SECRET_VALUE.test(value);
    }
    if (Array.isArray(value)) return value.some((item) => inspect(item));
    if (value && typeof value === "object")
      return Object.entries(value).some(([name, item]) => inspect(item, name));
    return false;
  };
  SECRET_VALUE.lastIndex = 0;
  return inspect(manifest);
}

export async function writeArtifactManifest(
  destination: string,
  input: ArtifactManifestInput | ArtifactManifest,
): Promise<{ path: string; manifest: ArtifactManifest }> {
  if (!destination || typeof destination !== "string")
    throw new Error("an explicit artifact destination is required");
  const root = resolve(destination);
  const path = resolve(root, "artifact-manifest.json");
  const manifest = createArtifactManifest(input as ArtifactManifestInput);
  if (artifactManifestContainsSecrets(manifest))
    throw new Error("refusing to write secrets to artifact manifest");
  await mkdir(root, { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { path, manifest };
}

/** Recursively sanitize metadata supplied by integrations before persistence. */
export function sanitizeArtifactManifest(manifest: ArtifactManifest): ArtifactManifest {
  return createArtifactManifest(manifest);
}

export const artifactManifestHasSecrets = artifactManifestContainsSecrets;

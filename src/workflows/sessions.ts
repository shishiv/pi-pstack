import { readFile } from "node:fs/promises";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

export interface SessionDiscoveryOptions {
  /** PI_SESSION_FILE may be one active JSONL file or a project-scoped directory. */
  piSessionFile?: string;
  env?: Readonly<Record<string, string | undefined>>;
  projectDirectory: string;
  sessionId?: string;
}

function projectNames(projectDirectory: string): Set<string> {
  const absolute = resolve(projectDirectory);
  const slug = absolute.replace(/^[/\\]+/, "").replace(/[\\/]/g, "-");
  return new Set([`--${slug}--`]);
}

function within(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate));
  return (
    child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !child.startsWith("/"))
  );
}

function belongsToProject(candidate: string, projectDirectory: string): boolean {
  if (within(projectDirectory, candidate)) return true;
  const names = projectNames(projectDirectory);
  // A session file can itself be named like Pi's wrapped project slug, but
  // that is not evidence that its arbitrary parent directory is this project.
  // Real Pi layouts put the slug in a directory above the JSONL file.
  return resolve(dirname(candidate))
    .split(/[\\/]/)
    .some((part) => names.has(part));
}

function sessionIdMatches(candidate: string, sessionId: string | undefined): boolean {
  return sessionId === undefined || basename(candidate).replace(/\.jsonl$/i, "") === sessionId;
}

function walkJsonl(
  directory: string,
  projectDirectory: string,
  sessionId?: string,
  scoped = false,
): string[] {
  if (!scoped && !belongsToProject(directory, projectDirectory)) {
    // A shared transcript root is allowed, but only project-named descendants are traversed.
    const descendants = readdirSync(directory, { withFileTypes: true });
    return descendants
      .filter((entry) => entry.isDirectory() && projectNames(projectDirectory).has(entry.name))
      .flatMap((entry) =>
        walkJsonl(resolve(directory, entry.name), projectDirectory, sessionId, true),
      );
  }
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walkJsonl(path, projectDirectory, sessionId, scoped);
      if (entry.isFile() && /\.jsonl$/i.test(entry.name) && sessionIdMatches(path, sessionId))
        return [path];
      return [];
    });
}

/** Discover only the explicitly configured active project's JSONL files. */
export function discoverSessionFiles(options: SessionDiscoveryOptions): string[] {
  const configured = options.piSessionFile ?? options.env?.PI_SESSION_FILE;
  if (!configured) return [];
  const configuredPath = resolve(configured);
  if (!existsSync(configuredPath)) return [];
  const metadata = lstatSync(configuredPath);
  if (metadata.isFile()) {
    return /\.jsonl$/i.test(configuredPath) &&
      belongsToProject(configuredPath, options.projectDirectory) &&
      sessionIdMatches(configuredPath, options.sessionId)
      ? [configuredPath]
      : [];
  }
  if (!metadata.isDirectory()) return [];
  return walkJsonl(configuredPath, options.projectDirectory, options.sessionId);
}

export interface ParsedSession {
  entries: Record<string, unknown>[];
  invalidLines: number;
}

/** Parse JSONL defensively; malformed or non-object lines are reported, never executed. */
export function parseSessionJsonl(contents: string): ParsedSession {
  const entries: Record<string, unknown>[] = [];
  let invalidLines = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        invalidLines++;
      } else {
        entries.push(parsed as Record<string, unknown>);
      }
    } catch {
      invalidLines++;
    }
  }
  return { entries, invalidLines };
}

export async function readSessionFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function parseActiveSession(
  filePath: string,
  projectDirectory: string,
): Promise<ParsedSession> {
  if (
    !discoverSessionFiles({ piSessionFile: filePath, projectDirectory }).includes(resolve(filePath))
  ) {
    throw new Error("Active session is outside the provided project/session boundary.");
  }
  return parseSessionJsonl(await readSessionFile(filePath));
}

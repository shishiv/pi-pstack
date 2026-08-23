import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { assertValidFeatureMap, renderFeatureMapMarkdown, type FeatureMap } from "./feature-map.js";

export interface GenerateVerificationSkillOptions {
  /** Exact output directory. No file is ever written outside this directory. */
  destination: string;
  appName?: string;
  featureMap: FeatureMap;
}

export interface GeneratedVerificationSkill {
  destination: string;
  files: string[];
  changed: boolean;
}

function safeLeaf(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || name.includes(".."))
    throw new Error("app name must be a safe kebab-case path segment");
  return name;
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep));
}

async function same(path: string, content: string): Promise<boolean> {
  try {
    return (await readFile(path, "utf8")) === content;
  } catch {
    return false;
  }
}

/** Generate only SKILL.md and feature-map.md below an explicitly supplied directory. */
export async function generateVerificationSkill(
  options: GenerateVerificationSkillOptions,
): Promise<GeneratedVerificationSkill> {
  if (!options || typeof options.destination !== "string" || options.destination.trim() === "")
    throw new Error("an explicit destination is required");
  assertValidFeatureMap(options.featureMap);
  const appName = safeLeaf(options.appName ?? options.featureMap.app);
  const destination = resolve(options.destination);
  const skillName = `verify-${appName}`;
  if (!inside(destination, resolve(destination, skillName)))
    throw new Error("unsafe skill destination");
  await mkdir(destination, { recursive: true });
  const files = new Map<string, string>([
    ["feature-map.md", renderFeatureMapMarkdown(options.featureMap)],
    [
      "SKILL.md",
      `---\nname: ${skillName}\ndescription: Verify ${appName} through its project feature map and Playwright harness. Use after changing user-facing behavior or reproducing a reported defect.\n---\n\n# Verify ${appName}\n\nUse the feature map below to verify the application with Playwright. Preserve the user's goal, collect every required artifact, and distinguish the expected state from the broken-state discriminator.\n\nRead \`feature-map.md\` before acting.\n`,
    ],
  ]);
  let changed = false;
  for (const [name, content] of files) {
    const path = resolve(destination, name);
    if (!inside(destination, path)) throw new Error("refusing to write outside destination");
    if (!(await same(path, content))) {
      await writeFile(path, content, "utf8");
      changed = true;
    }
  }
  return { destination, files: [...files.keys()], changed };
}

/** Convenience form for a project root; its explicit output is `.pi/skills/verify-<app>`. */
export async function generateProjectVerificationSkill(options: {
  projectRoot: string;
  appName?: string;
  featureMap: FeatureMap;
}): Promise<GeneratedVerificationSkill> {
  if (!options?.projectRoot) throw new Error("an explicit project root is required");
  const appName = safeLeaf(options.appName ?? options.featureMap.app);
  const root = resolve(options.projectRoot);
  return generateVerificationSkill({
    ...options,
    appName,
    destination: resolve(root, ".pi", "skills", `verify-${appName}`),
  });
}

export const generateProjectLocalVerificationSkill = generateProjectVerificationSkill;

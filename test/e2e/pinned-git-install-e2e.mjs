import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageName = "@shishiv/pi-pstack";
const sha = runGit(["rev-parse", "HEAD"], "read the current HEAD").trim();
const origin = runGit(["remote", "get-url", "origin"], "read the Git origin").trim();

assert.match(sha, /^[0-9a-f]{40}$/, `current HEAD is not an exact commit SHA: ${sha}`);
assert.ok(origin, "Git origin is empty; this check requires the private Git origin");

// Fetch from a separate empty repository so a local object cannot make an unpushed SHA look
// reachable. This gives a useful error before npm creates the temporary project.
const remoteProbe = await mkdtemp(join(tmpdir(), "pi-pstack-pinned-git-remote-"));
try {
  const init = spawnSync("git", ["init", "--quiet", remoteProbe], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  assert.equal(
    init.status,
    0,
    `could not initialize the remote reachability probe\n${init.stderr}`,
  );
  const reachable = spawnSync(
    "git",
    ["-C", remoteProbe, "fetch", "--depth=1", "--no-tags", origin, sha],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    },
  );
  assert.equal(
    reachable.status,
    0,
    [
      `HEAD ${sha} is not reachable from the configured Git origin.`,
      "Push this exact commit before running the credentialed pinned-install check.",
      "Git authentication uses the existing credential helper; no credentials are supplied by this test.",
      reachable.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
} finally {
  await rm(remoteProbe, { recursive: true, force: true });
}

const project = await mkdtemp(join(tmpdir(), "pi-pstack-pinned-git-install-"));
const piHome = join(project, "pi-home");
const source = `${origin}#${sha}`;
const projectEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  npm_config_allow_scripts: undefined,
  // Keep HOME inherited so npm's Git subprocess can use the existing credential helper.
  PI_CODING_AGENT_DIR: join(piHome, ".pi", "agent"),
  PI_OFFLINE: "1",
  PI_SKIP_VERSION_CHECK: "1",
  PI_TELEMETRY: "0",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? project,
    encoding: "utf8",
    env: options.env ?? projectEnv,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

try {
  await writeFile(
    join(project, "package.json"),
    `${JSON.stringify(
      { name: "pinned-git-install-probe", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    )}\n`,
    "utf8",
  );

  run("npm", [
    "install",
    "--allow-git=all",
    "--legacy-peer-deps",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--no-progress",
    source,
  ]);

  const installedPath = join(project, "node_modules", "@shishiv", "pi-pstack");
  const installedManifest = JSON.parse(await readFile(join(installedPath, "package.json"), "utf8"));
  assert.equal(installedManifest.name, packageName, "the installed package name must be pi-pstack");
  assert.equal(
    installedManifest.version,
    manifest.version,
    "the installed package version must match the current package manifest",
  );

  const lock = JSON.parse(await readFile(join(project, "package-lock.json"), "utf8"));
  const lockEntry = lock.packages?.[`node_modules/${packageName}`];
  assert.ok(lockEntry, `package-lock.json has no entry for ${packageName}`);
  assert.equal(lockEntry?.version, manifest.version);
  assert.match(
    lockEntry?.resolved ?? "",
    new RegExp(sha),
    "npm must record the exact Git commit in package-lock.json",
  );

  // Resolve through the installed package's public export map, not through its source path.
  const jiti = createJiti(pathToFileURL(join(project, "importer.mjs")).href, {
    interopDefault: true,
  });
  const benny = await jiti.import(`${packageName}/benny`);
  assert.equal(typeof benny.runBennyRuntime, "function");
  assert.equal(typeof benny.registerBennyAdapterProvider, "function");

  // Pi's package manager must discover the package after npm has installed it.
  run("pi", ["install", installedPath]);
  const list = run("pi", ["list"]).stdout;
  assert.match(list, /pi-pstack/);
  assert.match(list, new RegExp(installedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  console.log(
    `pinned Git install passed: ${installedManifest.name}@${installedManifest.version} (${sha}); ` +
      "public /benny export imported with jiti; Pi package discoverable",
  );
} finally {
  await rm(project, { recursive: true, force: true });
}

function runGit(args, action) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  assert.equal(
    result.status,
    0,
    `could not ${action}; configure origin and existing Git credentials\n${result.stderr}`,
  );
  return result.stdout;
}

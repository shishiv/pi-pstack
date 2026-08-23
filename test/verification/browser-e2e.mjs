import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { get } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const artifacts = join(root, "artifacts", "browser-e2e", "latest");
const stateDirectory = await mkdtemp(join(tmpdir(), "pi-pstack-portless-"));
const proxyPort = 32_000 + (process.pid % 10_000);
const portlessEnv = {
  ...process.env,
  PORTLESS_HTTPS: "0",
  PORTLESS_PORT: String(proxyPort),
  PORTLESS_STATE_DIR: stateDirectory,
};
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { writeArtifactManifest, artifactManifestContainsSecrets } = await jiti.import(
  "../../src/verification/artifacts.ts",
);

function runPortless(args) {
  const result = spawnSync("portless", args, { cwd: root, encoding: "utf8", env: portlessEnv });
  assert.equal(result.status, 0, `portless ${args.join(" ")} failed\n${result.stderr}`);
}

function startFixture(mode) {
  const name = `pi-pstack-e2e-${mode}-${process.pid}`;
  const child = spawn("portless", [name, "node", "fixtures/web-app/server.mjs"], {
    cwd: root,
    env: { ...portlessEnv, FIXTURE_MODE: mode },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (error += chunk.toString()));
  const ready = new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(
      () => rejectReady(new Error(`fixture did not start\n${output}\n${error}`)),
      15_000,
    );
    const inspect = () => {
      const url = output.match(/http:\/\/[a-z0-9.-]+\.localhost:[0-9]+/i)?.[0];
      if (!url || !output.includes("fixture web app listening")) return;
      clearTimeout(timeout);
      resolveReady(url);
    };
    child.stdout.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      rejectReady(new Error(`fixture exited before ready with ${code}\n${output}\n${error}`));
    });
  });
  return { child, ready };
}

async function waitForHealth(url, mode) {
  const deadline = Date.now() + 5_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const body = await new Promise((resolveHealth, rejectHealth) => {
        get(`${url}/health`, (response) => {
          let payload = "";
          response.on("data", (chunk) => (payload += chunk.toString()));
          response.on("end", () => {
            try {
              resolveHealth(JSON.parse(payload));
            } catch (error) {
              rejectHealth(error);
            }
          });
        }).on("error", rejectHealth);
      });
      if (body.ok === true && body.mode === mode) return;
      lastError = new Error(`unexpected health response: ${JSON.stringify(body)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`fixture health check failed: ${String(lastError)}`);
}

async function stopFixture(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolveStopped) => {
    child.once("exit", resolveStopped);
    child.kill("SIGTERM");
  });
}

async function assertNonEmpty(path) {
  assert.ok((await stat(path)).size > 0, `${path} must not be empty`);
}

await rm(artifacts, { force: true, recursive: true });
await mkdir(artifacts, { recursive: true });
runPortless([
  "proxy",
  "start",
  "--port",
  String(proxyPort),
  "--no-tls",
  "--state-dir",
  stateDirectory,
]);

const browser = await chromium.launch({ headless: true });
const processes = [];
let cleanupPassed = false;

try {
  const good = startFixture("good");
  processes.push(good.child);
  const goodUrl = await good.ready;
  await waitForHealth(goodUrl, "good");
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.goto(goodUrl, { waitUntil: "domcontentloaded" });
  const status = page.getByRole("status", { name: "Application status" });
  assert.equal(await status.textContent(), "Ready");
  await page.getByRole("button", { name: "Increment count" }).click();
  assert.equal(await page.getByTestId("count").textContent(), "1");

  const screenshot = join(artifacts, "good.png");
  const accessibility = join(artifacts, "accessibility.yaml");
  const dom = join(artifacts, "dom.html");
  const trace = join(artifacts, "trace.zip");
  await page.screenshot({ path: screenshot, fullPage: true });
  await writeFile(accessibility, `${await page.ariaSnapshot()}\n`, "utf8");
  await writeFile(dom, await page.content(), "utf8");
  await context.tracing.stop({ path: trace });
  await context.close();
  await stopFixture(good.child);

  const broken = startFixture("broken");
  processes.push(broken.child);
  const brokenUrl = await broken.ready;
  await waitForHealth(brokenUrl, "broken");
  const brokenPage = await browser.newPage();
  await brokenPage.goto(brokenUrl, { waitUntil: "domcontentloaded" });
  const brokenStatus = brokenPage.getByRole("status", { name: "Application status" });
  assert.equal(await brokenStatus.textContent(), "Broken");
  const brokenScreenshot = join(artifacts, "broken.png");
  await brokenPage.screenshot({ path: brokenScreenshot, fullPage: true });
  await brokenPage.close();
  await stopFixture(broken.child);

  cleanupPassed = processes.every((process) => process.exitCode !== null);
  const result = await writeArtifactManifest(artifacts, {
    screenshot: "good.png",
    accessibilityDomSnapshot: "accessibility.yaml",
    trace: "trace.zip",
    cleanupResult: cleanupPassed ? "passed" : "failed",
  });
  assert.equal(artifactManifestContainsSecrets(result.manifest), false);
  for (const path of [screenshot, brokenScreenshot, accessibility, dom, trace, result.path]) {
    await assertNonEmpty(path);
  }
  assert.match(await readFile(accessibility, "utf8"), /Increment count/);
} finally {
  await Promise.all(processes.map(stopFixture));
  await browser.close();
  runPortless(["proxy", "stop", "--port", String(proxyPort), "--state-dir", stateDirectory]);
  await rm(stateDirectory, { recursive: true, force: true });
}

assert.equal(cleanupPassed, true);
console.log("browser e2e verification passed");

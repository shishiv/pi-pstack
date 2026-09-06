import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";
import { chromium } from "playwright";
import { startFixtureServer } from "../../fixtures/web-app/server.mjs";

const root = resolve(import.meta.dirname, "../..");
const artifacts = join(root, "artifacts", "browser-e2e", "latest");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { writeArtifactManifest, artifactManifestContainsSecrets } = await jiti.import(
  "../../src/verification/artifacts.ts",
);

async function assertNonEmpty(path) {
  assert.ok((await stat(path)).size > 0, `${path} must not be empty`);
}

await rm(artifacts, { force: true, recursive: true });
await mkdir(artifacts, { recursive: true });

const browser = await chromium.launch({ headless: true });
const fixtures = [];
const screenshot = join(artifacts, "good.png");
const accessibility = join(artifacts, "accessibility.yaml");
const dom = join(artifacts, "dom.html");
const trace = join(artifacts, "trace.zip");
const brokenScreenshot = join(artifacts, "broken.png");

try {
  const good = await startFixtureServer({ mode: "good" });
  fixtures.push(good);
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.goto(good.url, { waitUntil: "domcontentloaded" });
  const status = page.getByRole("status", { name: "Application status" });
  assert.equal(await status.textContent(), "Ready");
  await page.getByRole("button", { name: "Increment count" }).click();
  assert.equal(await page.getByTestId("count").textContent(), "1");

  await page.screenshot({ path: screenshot, fullPage: true });
  await writeFile(accessibility, `${await page.ariaSnapshot()}\n`, "utf8");
  await writeFile(dom, await page.content(), "utf8");
  await context.tracing.stop({ path: trace });
  await context.close();
  await good.close();

  const broken = await startFixtureServer({ mode: "broken" });
  fixtures.push(broken);
  const brokenPage = await browser.newPage();
  await brokenPage.goto(broken.url, { waitUntil: "domcontentloaded" });
  const brokenStatus = brokenPage.getByRole("status", { name: "Application status" });
  assert.equal(await brokenStatus.textContent(), "Broken");
  await brokenPage.screenshot({ path: brokenScreenshot, fullPage: true });
  await brokenPage.close();
  await broken.close();
} finally {
  await Promise.all(fixtures.map((fixture) => fixture.close()));
  await browser.close();
}

const cleanupPassed = fixtures.every((fixture) => !fixture.server.listening);
assert.equal(cleanupPassed, true);
const result = await writeArtifactManifest(artifacts, {
  screenshot: "good.png",
  accessibilityDomSnapshot: "accessibility.yaml",
  trace: "trace.zip",
  cleanupResult: "passed",
});
assert.equal(artifactManifestContainsSecrets(result.manifest), false);
for (const path of [screenshot, brokenScreenshot, accessibility, dom, trace, result.path]) {
  await assertNonEmpty(path);
}
assert.match(await readFile(accessibility, "utf8"), /Increment count/);
console.log("browser e2e verification passed");

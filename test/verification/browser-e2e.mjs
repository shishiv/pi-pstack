import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";
import { chromium } from "playwright";
import { renderPage } from "../../fixtures/web-app/page.mjs";

const root = resolve(import.meta.dirname, "../..");
const artifacts = join(root, "artifacts", "browser-e2e", "latest");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { writeArtifactManifest, artifactManifestContainsSecrets } = await jiti.import(
  "../../src/verification/artifacts.ts",
);

async function assertNonEmpty(path) {
  assert.ok((await stat(path)).size > 0, `${path} must not be empty`);
}

async function pageFor(browser, mode) {
  const context = await browser.newContext();
  await context.route("https://pi-pstack-fixture.localhost/**", (route) =>
    route.fulfill({ body: renderPage(mode), contentType: "text/html" }),
  );
  const page = await context.newPage();
  await page.goto("https://pi-pstack-fixture.localhost/");
  return { context, page };
}

await rm(artifacts, { force: true, recursive: true });
await mkdir(artifacts, { recursive: true });

const browser = await chromium.launch({ headless: true });
let cleanupPassed = false;

try {
  const good = await pageFor(browser, "good");
  await good.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const status = good.page.getByRole("status", { name: "Application status" });
  await assert.doesNotReject(status.waitFor());
  assert.equal(await status.textContent(), "Ready");
  await good.page.getByRole("button", { name: "Increment count" }).click();
  assert.equal(await good.page.getByTestId("count").textContent(), "1");

  const screenshot = join(artifacts, "good.png");
  const accessibility = join(artifacts, "accessibility.yaml");
  const dom = join(artifacts, "dom.html");
  const trace = join(artifacts, "trace.zip");
  await good.page.screenshot({ path: screenshot, fullPage: true });
  await writeFile(accessibility, `${await good.page.ariaSnapshot()}\n`, "utf8");
  await writeFile(dom, await good.page.content(), "utf8");
  await good.context.tracing.stop({ path: trace });
  await good.context.close();

  const broken = await pageFor(browser, "broken");
  const brokenStatus = broken.page.getByRole("status", { name: "Application status" });
  assert.equal(await brokenStatus.textContent(), "Broken");
  assert.notEqual(await brokenStatus.textContent(), "Ready");
  const brokenScreenshot = join(artifacts, "broken.png");
  await broken.page.screenshot({ path: brokenScreenshot, fullPage: true });
  await broken.context.close();

  cleanupPassed = true;
  const result = await writeArtifactManifest(artifacts, {
    screenshot,
    accessibilityDomSnapshot: accessibility,
    trace,
    cleanupResult: "passed",
  });
  assert.equal(artifactManifestContainsSecrets(result.manifest), false);
  for (const path of [screenshot, brokenScreenshot, accessibility, dom, trace, result.path]) {
    await assertNonEmpty(path);
  }
  assert.match(await readFile(accessibility, "utf8"), /Increment count/);
} finally {
  await browser.close();
}

assert.equal(cleanupPassed, true);
console.log("browser e2e verification passed");

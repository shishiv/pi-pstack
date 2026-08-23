import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const verification = await jiti.import("../../src/verification/index.ts");
const fixture = {
  version: 1,
  app: "web-app",
  features: [
    {
      id: "increment-count",
      userGoal: "As a user, increment the count and see the deterministic result.",
      route: "/",
      pointers: { component: "main counter controls", source: "fixtures/web-app/server.mjs" },
      accessible: { role: "button", name: "Increment count", dataTestId: "increment" },
      expectedState: "status is Ready and count increases after activation",
      brokenState: "status is Broken",
      prerequisites: ["fixture server is running"],
      evidence: {
        screenshot: true,
        accessibility: true,
        domSnapshot: true,
        trace: true,
        cleanup: true,
      },
    },
  ],
};

test("feature map Markdown round-trips without losing user intent or selectors", () => {
  const markdown = verification.renderFeatureMapMarkdown(fixture);
  const parsed = verification.parseFeatureMapMarkdown(markdown);
  assert.deepEqual(parsed, fixture);
  assert.equal(verification.validateFeatureMap(parsed).valid, true);
});

test("validation reports missing required fields and duplicate IDs", () => {
  const result = verification.validateFeatureMap({
    version: 1,
    app: "bad app",
    features: [
      { ...fixture.features[0], id: "same", expectedState: "x", brokenState: "x" },
      { ...fixture.features[0], id: "same", userGoal: "" },
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /kebab-case|duplicates|userGoal|must differ/);
});

test("project skill generation is idempotent and rejects path traversal", async () => {
  const root = await mkdtemp(`${tmpdir()}/verification-`);
  try {
    const first = await verification.generateProjectVerificationSkill({
      projectRoot: root,
      featureMap: fixture,
    });
    const before = await readFile(`${first.destination}/SKILL.md`, "utf8");
    const second = await verification.generateProjectVerificationSkill({
      projectRoot: root,
      featureMap: fixture,
    });
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(await readFile(`${second.destination}/SKILL.md`, "utf8"), before);
    await assert.rejects(
      () =>
        verification.generateVerificationSkill({
          destination: root,
          appName: "../escape",
          featureMap: fixture,
        }),
      /safe|path/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("feature map drift identifies changed, removed, and added entries", () => {
  const changed = structuredClone(fixture);
  changed.features[0].expectedState = "different";
  const result = verification.featureMapDrift(fixture, changed);
  assert.equal(result.drifted, true);
  assert.deepEqual(result.changes, ["feature changed: increment-count"]);
});

test("artifact manifest records required proof, optional video, cleanup, and no secrets", async () => {
  const manifest = verification.createArtifactManifest({
    screenshot: "proof.png?token=secret",
    accessibilityDomSnapshot: "a11y.json",
    trace: "trace.zip",
    video: "video.webm",
    cleanupResult: "passed",
  });
  assert.deepEqual(manifest, {
    version: 1,
    screenshot: "proof.png",
    accessibilityDomSnapshot: "a11y.json",
    trace: "trace.zip",
    video: "video.webm",
    cleanupResult: "passed",
  });
  assert.equal(verification.artifactManifestContainsSecrets(manifest), false);
  assert.equal(
    verification.sanitizeArtifactText("Authorization: Bearer top-secret"),
    "Authorization: Bearer [REDACTED]",
  );
  const root = await mkdtemp(`${tmpdir()}/artifacts-`);
  try {
    const output = await verification.writeArtifactManifest(root, manifest);
    assert.match(await readFile(output.path, "utf8"), /cleanupResult/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture endpoints expose stable controls and a distinct broken mode", async () => {
  const port = 46000 + Math.floor(Math.random() * 500);
  const start = (fixtureMode) =>
    spawn(process.execPath, ["fixtures/web-app/server.mjs"], {
      env: { ...process.env, PORT: String(port), FIXTURE_MODE: fixtureMode },
      stdio: ["ignore", "pipe", "inherit"],
    });
  const server = start("good");
  try {
    await once(server.stdout, "data");
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) =>
      response.json(),
    );
    const html = await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text());
    assert.deepEqual(health, { ok: true, mode: "good" });
    assert.match(html, /data-testid="increment"/);
    assert.match(html, /aria-label="Reset count"/);
  } finally {
    server.kill();
    await once(server, "exit").catch(() => undefined);
  }
  const broken = start("broken");
  try {
    await once(broken.stdout, "data");
    const state = await fetch(`http://127.0.0.1:${port}/api/state`).then((response) =>
      response.json(),
    );
    assert.deepEqual(state, { mode: "broken", count: 0, ready: false });
  } finally {
    broken.kill();
    await once(broken, "exit").catch(() => undefined);
  }
});

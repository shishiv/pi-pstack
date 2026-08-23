import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";
import { chromium } from "playwright";
import { renderPage } from "../../fixtures/web-app/page.mjs";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const benny = await jiti.import("../../src/benny/index.ts");
const project = await mkdtemp(join(tmpdir(), "pi-pstack-benny-e2e-"));
const evidenceDirectory = join(project, "artifacts", "benny");
await mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

const messages = [
  {
    authorId: "reporter",
    text: "The save button is broken",
    channelId: "C1",
    ts: "100",
  },
];
const writes = [];
const config = {
  schemaVersion: 1,
  automations: { triageName: "benny-triage", reproduceName: "benny-reproduce" },
  slack: {
    sourceChannelId: "C1",
    triageIdentityUserId: "U1",
    allowSourceRootPosts: false,
    allowWorkerSlackWrites: false,
  },
  tracker: {
    adapter: "fixture",
    team: "team",
    project: "project",
    labels: { bug: "bug", performance: "performance", intake: "intake" },
    status: "intake",
    requireCompensationAction: true,
  },
  repository: { url: "https://github.com/acme/app", defaultBranch: "main", draftOnly: true },
  control: {
    adapter: "fixture",
    featureMapPath: ".pi/pstack/benny-config/feature-map.md",
    environment: "test",
    artifactDirectory: evidenceDirectory,
  },
  verdictMarkers: {
    bug: "[benny:bug]",
    performance: "[benny:performance]",
    other: "[benny:other]",
  },
  budgets: { pollSeconds: 60, reproMinutes: 60, fixMinutes: 90 },
};
const featureMap = {
  version: 1,
  app: "demo-app",
  features: [
    {
      id: "save",
      userGoal: "Save a document",
      route: "/",
      pointers: { source: "fixtures/web-app/page.mjs" },
      accessible: { role: "status", name: "Application status" },
      expectedState: "Ready",
      brokenState: "Broken",
      prerequisites: [],
      evidence: { screenshot: true, accessibility: true, cleanup: true },
    },
  ],
};

const dispose = benny.registerBennyAdapterProvider({
  name: "fixture",
  async load() {
    return {
      slack: {
        async readThread() {
          return {
            channelId: "C1",
            rootTs: "100",
            permalink: "https://slack.test/C1/100",
            messages: structuredClone(messages),
          };
        },
        async postThreadReply({ coordinates, text }) {
          assert.deepEqual(coordinates, { channelId: "C1", threadTs: "100" });
          messages.push({ authorId: "U1", text, channelId: "C1", ts: "101", threadTs: "100" });
          writes.push("thread-reply");
          return { id: "reply-1" };
        },
      },
      tracker: {
        async search() {
          return [];
        },
        async create(input) {
          writes.push("tracker-create");
          await writeFile(join(project, "tracker.json"), `${JSON.stringify(input)}\n`, "utf8");
          return { id: "I1", url: "https://tracker.test/I1" };
        },
        async update() {
          writes.push("tracker-update");
        },
        async compensate() {
          writes.push("tracker-compensate");
        },
      },
      featureMap,
      control: {
        actions: ["bringUp", "driveUI", "inspectState", "screenshot", "recording", "cleanup"],
        async observe({ revision, attempt }) {
          const page = await browser.newPage();
          await page.setContent(renderPage(revision ? "good" : "broken"));
          const status = await page
            .getByRole("status", { name: "Application status" })
            .textContent();
          const path = join(evidenceDirectory, `${revision ?? "before"}-${attempt}.png`);
          await page.screenshot({ path });
          await page.close();
          return {
            matched: status === "Broken",
            symptom: "save error",
            expected: "Ready",
            evidence: [path],
          };
        },
        async fix() {
          return { revision: "fixed" };
        },
        async cleanup() {},
      },
      repository: {
        async createDraftPullRequest(input) {
          assert.equal(input.draft, true);
          writes.push("draft-pr");
          await writeFile(join(project, "draft-pr.json"), `${JSON.stringify(input)}\n`, "utf8");
          return { url: "https://github.com/acme/app/pull/1" };
        },
      },
    };
  },
});

try {
  const trigger = { channelId: "C1", ts: "100" };
  const triage = await benny.runBennyRuntime({
    action: "triage",
    provider: "fixture",
    config,
    trigger,
    cwd: project,
  });
  assert.equal(triage.status, "completed");
  const reproduce = await benny.runBennyRuntime({
    action: "reproduce",
    provider: "fixture",
    config,
    trigger,
    featureId: "save",
    cwd: project,
  });
  assert.equal(reproduce.status, "completed");
  assert.equal(reproduce.reproductions, 2);
  assert.equal(reproduce.draftPullRequest, "https://github.com/acme/app/pull/1");
  assert.deepEqual(writes, ["tracker-create", "thread-reply", "draft-pr"]);
  const draft = JSON.parse(await readFile(join(project, "draft-pr.json"), "utf8"));
  assert.equal(draft.draft, true);
  assert.equal(
    (
      await benny.runBennyRuntime({
        action: "triage",
        provider: "fixture",
        config,
        trigger,
        cwd: project,
      })
    ).status,
    "duplicate",
  );
} finally {
  dispose();
  await browser.close();
  await rm(project, { recursive: true, force: true });
}

console.log("benny adapter e2e verification passed");

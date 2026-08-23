import type { FeatureMap } from "../verification/feature-map.js";

export type BennyWorkflowKind = "triage" | "reproduce";
export type TriageClassification = "bug" | "performance" | "feature" | "question" | "reroute";
export type VerdictKind = TriageClassification;

export interface BennyConfig {
  schemaVersion: 1;
  automations: { triageName: string; reproduceName: string };
  slack: {
    sourceChannelId: string;
    operationsChannelId?: string;
    triageIdentityUserId: string;
    allowSourceRootPosts: false;
    allowWorkerSlackWrites: false;
  };
  tracker: {
    adapter: string;
    team: string;
    project: string;
    labels: Record<string, string>;
    status: string;
    requireCompensationAction: true;
  };
  repository: { url: string; defaultBranch: string; draftOnly: true };
  control: {
    adapter: string;
    featureMapPath: string;
    environment: string;
    artifactDirectory: string;
  };
  verdictMarkers: { bug: string; performance: string; other: string };
  budgets: { pollSeconds: number; reproMinutes: number; fixMinutes: number };
}

export interface Trigger {
  sourceChannelId?: string;
  source_channel_id?: string;
  channelId?: string;
  channel_id?: string;
  ts?: string;
  messageTs?: string;
  message_ts?: string;
  threadTs?: string;
  thread_ts?: string;
}

export interface SourceCoordinates {
  readonly channelId: string;
  readonly threadTs: string;
}

export interface SourceMessage {
  authorId: string;
  text: string;
  channelId: string;
  ts: string;
  threadTs?: string;
}

export interface SourceThread {
  channelId: string;
  rootTs: string;
  messages: readonly SourceMessage[];
  permalink?: string;
}

export interface TrackerIssue {
  id: string;
  url: string;
  title?: string;
  status?: string;
  labels?: readonly string[];
}

export interface TrackerMatch extends TrackerIssue {
  confidence: "confident" | "possible" | "weak";
}

export interface SlackAdapter {
  readThread(coordinates: SourceCoordinates): Promise<SourceThread | null>;
  postThreadReply(input: {
    coordinates: SourceCoordinates;
    text: string;
  }): Promise<{ id?: string }>;
}

export interface TrackerAdapter {
  search(input: { text: string; sourcePermalink?: string }): Promise<readonly TrackerMatch[]>;
  update(input: { issue: TrackerIssue; sourcePermalink?: string; note: string }): Promise<void>;
  create(input: {
    title: string;
    body: string;
    labels: readonly string[];
    sourcePermalink: string;
  }): Promise<TrackerIssue>;
  compensate(input: { issue: TrackerIssue }): Promise<void>;
}

export interface UIObservation {
  matched: boolean;
  symptom: string;
  expected: string;
  evidence?: readonly string[];
  state?: string;
}

export interface ControlAdapter {
  readonly actions: readonly string[];
  observe(input: {
    revision?: string;
    attempt: number;
    report: string;
    featureMap: FeatureMap;
    artifactDirectory: string;
  }): Promise<UIObservation>;
  cleanup?(): Promise<void>;
  fix?(input: {
    report: string;
    featureMap: FeatureMap;
    artifactDirectory: string;
  }): Promise<{ revision: string }>;
  verifyExistingFix?(input: {
    revision: string;
    report: string;
    featureMap: FeatureMap;
    attempt: number;
    artifactDirectory: string;
  }): Promise<UIObservation>;
}

export interface RepositoryAdapter {
  findExistingFix?(input: {
    report: string;
    source: SourceThread;
  }): Promise<{ revision: string; url: string } | null>;
  createDraftPullRequest?(input: {
    revision: string;
    title: string;
    body: string;
    base: string;
    draft: true;
  }): Promise<{ url: string }>;
}

export interface BennyAdapters {
  slack: SlackAdapter;
  tracker: TrackerAdapter;
  control?: ControlAdapter;
  featureMap?: FeatureMap;
  repository?: RepositoryAdapter;
}

export interface Ledger {
  claim(key: string): boolean;
  complete?(key: string): void;
  release?(key: string): void;
  has?(key: string): boolean;
}

export interface BennyResult {
  status: "completed" | "duplicate" | "blocked" | "failed";
  reason?: string;
  classification?: TriageClassification;
  marker?: string;
  trackerIssue?: TrackerIssue;
  mode?: "reproduce" | "verify-existing-fix";
  reproductions?: number;
  draftPullRequest?: string;
  writes: number;
}

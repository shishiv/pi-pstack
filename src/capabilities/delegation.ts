import { isDelegatedPiChild } from "../workflows/delegation.js";

export const HOST_DELEGATION_TOOL = "agents";
export const PI_DELEGATION_TOOL = "pstack_delegate";

const PARENT_DELEGATION_REQUIREMENT =
  "When a user explicitly requests independent review, independent analyses, isolated context, or parallel work, delegation is required. " +
  "The parent agent must dispatch every requested workstream and collect every result. " +
  "The parent agent must not perform any of those workstreams itself. " +
  "When the host promises automatic completion, do not sleep or repeatedly wait or read for status. " +
  "Continue other work and consume the completion notification.";

export type DelegationEnvironment =
  | { readonly kind: "host-agents"; readonly tool: "agents"; readonly herdr: boolean }
  | { readonly kind: "herdr-cli"; readonly command: "herdr"; readonly herdr: true }
  | { readonly kind: "pi-cli"; readonly tool: "pstack_delegate"; readonly herdr: boolean }
  | { readonly kind: "delegated-pi-child"; readonly herdr: boolean };

export interface DetectDelegationEnvironmentOptions {
  tools: readonly (string | { name: string })[];
  env?: Readonly<Record<string, string | undefined>>;
  herdrCliAvailable?: boolean;
}

export function detectDelegationEnvironment(
  options: DetectDelegationEnvironmentOptions,
): DelegationEnvironment {
  const env = options.env ?? process.env;
  const herdr = options.herdrCliAvailable === true;
  if (isDelegatedPiChild(env)) return { kind: "delegated-pi-child", herdr };
  const tools = new Set(options.tools.map((tool) => (typeof tool === "string" ? tool : tool.name)));
  if (tools.has(HOST_DELEGATION_TOOL)) {
    return { kind: "host-agents", tool: HOST_DELEGATION_TOOL, herdr };
  }
  if (herdr) return { kind: "herdr-cli", command: "herdr", herdr: true };
  return { kind: "pi-cli", tool: PI_DELEGATION_TOOL, herdr };
}

export function isHerdrCliProbeSuccessful(
  env: Readonly<Record<string, string | undefined>>,
  result: { code: number; stdout: string; stderr: string },
): boolean {
  if (env.HERDR_ENV !== "1" || result.code !== 0) return false;
  try {
    const value: unknown = JSON.parse(result.stdout);
    if (!value || typeof value !== "object") return false;
    const pane = (value as { result?: { pane?: unknown } }).result?.pane;
    if (!pane || typeof pane !== "object") return false;
    const identity = pane as { pane_id?: unknown; workspace_id?: unknown };
    return typeof identity.pane_id === "string" && typeof identity.workspace_id === "string";
  } catch {
    return false;
  }
}

export function delegationGuidance(environment: DelegationEnvironment): string {
  if (environment.kind === "delegated-pi-child") {
    return "This process is an isolated delegated Pi child. Complete the assigned task directly and do not delegate again.";
  }
  if (environment.kind === "host-agents") {
    const host = environment.herdr ? "Herdr" : "The current host";
    return `${PARENT_DELEGATION_REQUIREMENT} ${host} provides the agents tool. Use agents for delegation. Map explore and research to explorer, review and judge to reviewer, and implement, style, and benny to general. The host owns agent lifecycle and terminal layout; do not invoke the Herdr CLI from pi-pstack.`;
  }
  if (environment.kind === "herdr-cli") {
    return `${PARENT_DELEGATION_REQUIREMENT} Herdr CLI is verified in this managed pane. Prefer the host agents capability exposed through exec as tools.agents. When tools.agents is available through exec, launch independent tasks together with Promise.all, leave blocking at its default true, and use the returned responses. Do not use blocking:false, watch, read, wait, or sleep to collect completion. If that capability is absent, use documented herdr agent commands. Map explore and research to explorer, review and judge to reviewer, and implement, style, and benny to general. Pi-pstack does not own pane or terminal layout.`;
  }
  return `${PARENT_DELEGATION_REQUIREMENT} No host agents tool is available. Use pstack_delegate for one isolated Pi child. It provides no scheduler, sandbox, or isolated worktree.`;
}

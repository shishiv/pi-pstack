import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function pbrainFixture(pi: ExtensionAPI): void {
  let probed = false;
  const start = "<!-- brainmaxxing:context:start -->";
  const end = "<!-- brainmaxxing:context:end -->";
  const capability = {
    protocol: "pbrain/v1",
    protocolVersion: 1,
    async status() {
      probed = true;
      return {
        schemaVersion: 1,
        protocol: "pbrain/v1",
        providerVersion: "fixture",
        state: "available",
        diagnostic: "fixture",
      };
    },
  };
  Object.defineProperty(globalThis, Symbol.for("pbrain/v1"), {
    configurable: true,
    value: capability,
  });
  pi.on("before_agent_start", async (event) => {
    const base = event.systemPrompt.replace(new RegExp(`${start}[\\s\\S]*?${end}`, "g"), "");
    return { systemPrompt: `${base.trimEnd()}\n\n${start}\nfixture brain context\n${end}` };
  });
  pi.registerCommand("fixture-pbrain-status", {
    description: "Report whether the fixture capability was probed",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`fixture pbrain was ${probed ? "probed" : "not probed"}.`, "info");
    },
  });
}

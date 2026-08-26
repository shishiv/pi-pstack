import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function pbrainFixture(pi: ExtensionAPI): void {
  let probed = false;
  const capability = {
    name: "pbrain/v1",
    async probe() {
      probed = true;
      return { status: "available" };
    },
  };
  const publish = () => pi.events.emit("pstack:capability", capability);
  pi.events.on("pstack:capability-discover", publish);
  publish();
  pi.registerCommand("fixture-pbrain-status", {
    description: "Report whether the fixture capability was probed",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`fixture pbrain was ${probed ? "probed" : "not probed"}.`, "info");
    },
  });
}

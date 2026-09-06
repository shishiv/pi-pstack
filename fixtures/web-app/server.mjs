#!/usr/bin/env node
/** Dependency-free browser fixture. `FIXTURE_MODE=broken` is the negative control. */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { renderPage } from "./page.mjs";

function send(response, status, body, type = "text/html; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

export async function startFixtureServer({ mode: requestedMode = "good", port = 0 } = {}) {
  const mode = requestedMode === "broken" ? "broken" : "good";
  const state = { mode, count: 0, ready: mode === "good" };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/health")
      return send(response, 200, JSON.stringify({ ok: true, mode }), "application/json");
    if (url.pathname === "/api/state" || url.pathname === "/state")
      return send(response, 200, JSON.stringify({ ...state }), "application/json");
    if (url.pathname === "/") return send(response, 200, renderPage(mode));
    return send(response, 404, "not found", "text/plain; charset=utf-8");
  });

  await new Promise((resolveListening, rejectListening) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListening(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListening();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });

  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("fixture server did not bind a TCP port");

  return {
    mode,
    server,
    url: `http://127.0.0.1:${address.port}`,
    close() {
      if (!server.listening) return Promise.resolve();
      return new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configuredMode = process.env.FIXTURE_MODE ?? process.env.APP_MODE ?? process.env.MODE;
  const fixture = await startFixtureServer({
    mode: configuredMode,
    port: Number.parseInt(process.env.PORT ?? "4173", 10),
  });
  process.stdout.write(
    `fixture web app listening on ${new URL(fixture.url).port} (${fixture.mode})\n`,
  );
  const shutdown = () => {
    fixture.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

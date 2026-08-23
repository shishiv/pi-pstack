#!/usr/bin/env node
/** Dependency-free browser fixture. `FIXTURE_MODE=broken` is the negative control. */
import { createServer } from "node:http";
import { renderPage } from "./page.mjs";

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const configuredMode = process.env.FIXTURE_MODE ?? process.env.APP_MODE ?? process.env.MODE;
const mode = configuredMode === "broken" ? "broken" : "good";
const state = { mode, count: 0, ready: mode === "good" };

function send(response, status, body, type = "text/html; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/health")
    return send(response, 200, JSON.stringify({ ok: true, mode }), "application/json");
  if (url.pathname === "/api/state" || url.pathname === "/state")
    return send(response, 200, JSON.stringify({ ...state }), "application/json");
  if (url.pathname === "/") return send(response, 200, renderPage(mode));
  return send(response, 404, "not found", "text/plain; charset=utf-8");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`fixture web app listening on ${port} (${mode})\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

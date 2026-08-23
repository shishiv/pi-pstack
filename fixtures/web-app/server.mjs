#!/usr/bin/env node
/** Dependency-free browser fixture. `FIXTURE_MODE=broken` is the negative control. */
import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const configuredMode = process.env.FIXTURE_MODE ?? process.env.APP_MODE ?? process.env.MODE;
const mode = configuredMode === "broken" ? "broken" : "good";
const state = { mode, count: 0, ready: mode === "good" };

function send(response, status, body, type = "text/html; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

function page() {
  const label = state.ready ? "Ready" : "Broken";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Verification fixture</title></head>
<body><main>
<h1>Verification fixture</h1>
<p id="status" data-testid="status" role="status" aria-label="Application status">${label}</p>
<p>Count: <output id="count" data-testid="count">${state.count}</output></p>
<button type="button" data-testid="increment" aria-label="Increment count">Increment</button>
<button type="button" data-testid="reset" aria-label="Reset count">Reset</button>
</main><script>
const status = document.querySelector('[data-testid="status"]');
const count = document.querySelector('[data-testid="count"]');
document.querySelector('[data-testid="increment"]').addEventListener('click', () => {
  count.textContent = String(Number(count.textContent) + 1);
});
document.querySelector('[data-testid="reset"]').addEventListener('click', () => { count.textContent = '0'; });
</script></body></html>`;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/health")
    return send(response, 200, JSON.stringify({ ok: true, mode }), "application/json");
  if (url.pathname === "/api/state" || url.pathname === "/state")
    return send(response, 200, JSON.stringify({ ...state }), "application/json");
  if (url.pathname === "/") return send(response, 200, page());
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

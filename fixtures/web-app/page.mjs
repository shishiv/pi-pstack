export function renderPage(mode = "good") {
  const label = mode === "broken" ? "Broken" : "Ready";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Verification fixture</title></head>
<body><main>
<h1>Verification fixture</h1>
<p id="status" data-testid="status" role="status" aria-label="Application status">${label}</p>
<p>Count: <output id="count" data-testid="count">0</output></p>
<button type="button" data-testid="increment" aria-label="Increment count">Increment</button>
<button type="button" data-testid="reset" aria-label="Reset count">Reset</button>
</main><script>
const count = document.querySelector('[data-testid="count"]');
document.querySelector('[data-testid="increment"]').addEventListener('click', () => {
  count.textContent = String(Number(count.textContent) + 1);
});
document.querySelector('[data-testid="reset"]').addEventListener('click', () => { count.textContent = '0'; });
</script></body></html>`;
}

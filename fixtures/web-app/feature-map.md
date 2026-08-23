# Feature map: web-app

## feature: increment-count

- user goal: As a user, increment the count and see the deterministic result.
- route: /
- component: main counter controls
- source: fixtures/web-app/server.mjs
- role: button
- name: Increment count
- data-testid: increment
- expected state: status is Ready and count increases after activation
- broken state: status is Broken
- prerequisites: fixture server is running
- evidence: screenshot, accessibility, dom snapshot, trace, cleanup

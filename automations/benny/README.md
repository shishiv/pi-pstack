# Benny for Pi

Benny is a dormant Pi automation pack for thread-bound issue triage and reproduce/fix verification. Operational `SKILL.md` files are resources read by the coordinator; they are not registered slash skills.

Install this pack at `.pi/pstack/benny/` and keep configuration, routing, and feature maps outside the pack. The two workflow files describe invocation and concurrency intent. They can be mapped to an available scheduler or run on demand. Benny preserves immutable source channel/root-thread coordinates, uses an idempotency ledger, and permits draft pull requests only. It never merges or deploys.

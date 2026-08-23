# Benny for Pi

Benny is a dormant Pi automation pack for thread-bound issue triage and reproduce/fix verification. Operational `SKILL.md` files are resources read by the coordinator; they are not registered slash skills.

Install this pack at `.pi/pstack/benny/`, keep configuration, routing, and feature maps outside the pack, and enable only the two Pi schedule/workflow definitions. Benny preserves immutable source channel/root-thread coordinates, uses an idempotency ledger, and permits draft pull requests only. It never merges or deploys.

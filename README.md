# pi-pstack

`pi-pstack` is a private Pi-native port of Lauren Tan's pstack. It keeps the verification-first engineering method while replacing Cursor runtime contracts with Pi skills, extensions, subagents, sessions, and package conventions.

The package is under active construction. Its default delivery backend is the official `github/gh-stack` extension. Graphite support is optional. Autonomous merge remains disabled until project readiness and exact-head verification gates pass.

## Development

```bash
npm install
npm run verify
```

Operational completion is tracked by the local Unlazy ledger in `GATES.md`. The ledger and its evidence are intentionally ignored by Git.

## Upstream

See [`UPSTREAM.md`](./UPSTREAM.md) for source provenance and the manual synchronization contract.

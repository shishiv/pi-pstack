# Phase 3. Fix $PI_SESSION_FILE sentences

Back to [overview](overview.md).

## Goal

Transcript skills describe a file named by `$PI_SESSION_FILE`. They no longer claim that reading that path crosses workspace boundaries. That warning belonged to globbing Cursor's `agent-transcripts` directory.

## Changes

- `skills/recall/SKILL.md`. Describe `$PI_SESSION_FILE` as the active session file. Drop Cursor slugification (`Users-you-proj`) unless Pi still uses that layout. Check `src/workflows/sessions.ts` only as a reference. Do not wire that module. This phase is prose.
- `skills/poteto-mode/playbooks/eval.md`. Step 6 reads the path named by `$PI_SESSION_FILE`. Delete the leftover "that crosses workspace boundaries" clause.
- `skills/poteto-mode/playbooks/session-pickup.md`. Same sentence repair. Do not glob. Read the named file.

If `pstack-reflect/SKILL.md` still has the broken sentence after phase 2, fix it here instead of reopening phase 2.

Add the forbidden leftover sentence to the denylist once these files are clean.

## Data structures

No new types. The env var stays a file path string.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** Resource test. `rg "crosses workspace boundaries" skills` returns no matches.

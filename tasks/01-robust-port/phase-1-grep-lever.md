# Phase 1. Fail the leftover grep, then fix how and no-comments

Back to [overview](overview.md).

## Goal

The resource test becomes the leftover detector. `how` and `no-comments` go green against it. Later phases keep that test red until they land.

## Changes

- `test/resources/resources.test.mjs`. Add denylist entries for `create-skill`, `control-ui`, `control-cli`, `control-notes`, `agent: "Comment Sicko"`, `subagent subagent`, and the sentence that says reading `$PI_SESSION_FILE` crosses workspace boundaries. Keep the existing Cursor-token bans.
- `skills/how/SKILL.md`. Replace doubled `subagent subagent` with one `subagent`.
- `skills/no-comments/SKILL.md`. Spawn `agent: "comment-sicko"`. Match `agents/comment-sicko.md` `name`.

Add only the tokens this phase can make green (`subagent subagent`, `Comment Sicko` as a spawn name). Append `create-skill`, `control-ui`, and the `$PI_SESSION_FILE` leftover sentence in phases 2 to 4 in the same test function. One list, grown per PR. `main` stays green.

## Data structures

No new types. The denylist stays an array of `[token, RegExp]` pairs in the existing test.

## Verification

**Static.** `npm run verify:deterministic`.

**Runtime.** `node --test test/resources/resources.test.mjs`. Assert `how` no longer matches `subagent subagent`. Assert `no-comments` matches `comment-sicko` and does not match `Comment Sicko` as a spawn name. Spawn is not executed. The check is the on-disk agent id.

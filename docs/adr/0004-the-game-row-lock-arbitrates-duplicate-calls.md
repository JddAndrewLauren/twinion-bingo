# 0004 — The game-row lock arbitrates duplicate calls, not a unique index

**Status:** accepted, 2026-07-29 · **Issues:** #45, #8, #9 · **Supersedes nothing** · **Revisit when:** a second code path needs to append a `CALL`

## Context

`room_events_call_unique` is `UNIQUE(game_id, square_id) WHERE kind = 'CALL'`. It was drawn for
#8's race: two phones spotting the same event in the same tick both insert, the loser takes a 23505,
and `readCall` hands them the winning row so nothing went wrong from the player's side.

The index cannot see retractions. Liveness is a property of a *second* row — the `RETRACT` naming a
call by `target_seq` — and a partial unique index can only see the row it is indexing. So once a call
is retracted the CALL row stays (deleting it would break `Last-Event-ID` replay), and every later
attempt to call that square hits the index, falls into `readCall`, and is handed back the dead row
with `appended: false` and a 200. The derivation correctly excludes it, so nothing marks. The square
is uncallable for the rest of the game and the API reports success (#45).

Three fixes were compared: drop the index and arbitrate in the transaction; add a `superseded_by`
column and index on `WHERE kind='CALL' AND superseded_by IS NULL`; or add a `call_epoch` to the
uniqueness key. Two findings decided it.

**The client does not reduce the log.** An SSE frame is a trigger, not data: the callback bumps
`reload` and the screen re-fetches `GET /rooms/:code/game`, taking the server's `marks` wholesale
(`room-screen.tsx`, `card-grid.tsx`). Only `kind === 'CALL'` is ever inspected, and only to phrase a
toast. So "a replaying client lands where a live one is" is a property of the `liveCalls` query
alone, and all three options satisfy it identically. It is not a differentiator.

**The lock is already load-bearing.** `callSquare` opens its transaction with `assertLive`, which is
`SELECT state FROM games WHERE id = ? FOR UPDATE`, and the insert happens inside it. `callSquare` is
the only path that appends a `CALL`. The codebase already depends on that lock for prize uniqueness
— it is what lets the ladder read "has this rung been won yet" and act on the answer (ADR-0003).

## Decision

Drop `room_events_call_unique`. Inside `callSquare`'s existing transaction, after the `FOR UPDATE`
lock, query for a *live* CALL for that square — one no `RETRACT` supersedes, the same condition
`liveCalls` uses. If one exists, return it with `appended: false`. If none does, insert.

This preserves #8's guarantee by the lock rather than by the constraint, and makes a retracted square
callable again as an ordinary consequence: the retracted row is not live, so it does not block.

The log stays append-only. No row is deleted or updated, no column is added, and the `RETRACT` row
remains the single source of truth for liveness.

### Why not the alternatives

`superseded_by` keeps the database as the arbiter, and the usual objection to it is weaker than it
looks — the stated reason for append-only is that *deleting* breaks replay, the SSE payload is a
fixed column projection that would never carry the column, and no ADR ratifies append-only. It was
rejected for **drift**: `liveCalls` would decide liveness by joining `RETRACT` rows while the index
decided it by the column. A future correction path that appends a `RETRACT` without setting the
column reintroduces exactly this bug, silently.

`call_epoch` keeps both append-only and database enforcement, but still needs the same live-call read
to tell an idempotent re-tap from a genuine re-call — so it buys a column and a wider index on top of
a read it does not avoid.

## Consequences

Uniqueness moves from a database invariant to an application one. Any future code path that appends a
`CALL` **must** take the game-row lock first. This is not a new discipline — the same path already
has to take it for `settleWinLadder` to be correct — but it is now unenforced by the schema, and a
path that forgets it produces duplicate live calls rather than a constraint violation.

Because that is now possible rather than impossible, the two readers that resolve a square to a single
call agree on the tie-break instead of leaving it to chance: `callsBySquare` and `liveCallFor` both
take the **earliest** live call, which is who D1 credits. They previously disagreed — one kept the
newest by Map overwrite, the other read the oldest — so a duplicate would have had the client's undo
name a row the card was not rendering.

**The index was replacing more than a constraint.** Dropping it left nothing indexing
`(game_id, square_id) WHERE kind = 'CALL'`, and the live-call read runs on *every* call now rather
than only on a lost race — while holding the game row's lock. Measured on a 250k-row log, the query
went from 0.079 ms to 12.7 ms (10 shared buffers to 6828) with the index absent, and that cost is
lock hold time on a log that is never pruned. Migration 0002 therefore drops the unique index and
creates two **non-unique** ones in its place: `room_events_call_idx` on the same columns and
predicate, and `room_events_target_seq_idx` for the `RETRACT` anti-join. Same columns, none of the
enforcement — uniqueness stays in the lock, and `schema.db.test.ts` asserts these are not unique so
that #45's dead end cannot be reintroduced by tightening an index that looks redundant.

The migration drops an index, which `migration-safety.test.ts` forbade outright
(`expect(sql).not.toMatch(/\bDROP\b/i)`). That gate exists because this database is shared with the
twinion project (ADR-0001) and drizzle-kit must never be trusted to drop what it cannot see. It had
to be narrowed rather than removed — every one of the three candidate fixes needed a `DROP`, since
changing a unique index's predicate or columns is a drop-and-recreate, so this cost was unavoidable
whichever way the decision went. It now permits exactly one shape, a named index inside `bingo`, with
a case asserting what that pattern still refuses.

Two guarantees needed tests that did not exist before, because the original race test proved the race
only while the index was there to enforce it. Both are now covered, in `games.db.test.ts`'s
"re-calling a square that was taken back":

- "turns two simultaneous re-calls into one new row, with neither caller erroring" — two phones
  re-spotting a retracted square, statuses sorting to `[200, 201]`, one new row, and both callers
  handed the same `seq`.
- "marks the square again, on a new row, for everyone holding it" — retract-then-recall marking for
  the re-caller and for a player who never touched the square.

Both fail if the live-call read is moved above `assertLive`, checked by making that edit — and so does
the original #8 race test, so the guarantee the index used to hold is now genuinely held by the lock
rather than by nothing at all. `schema.db.test.ts` asserts the index is gone and that the log itself
accepts a duplicate CALL, so the cost stated above is stated in a test and not only here.

Moving that read from `tx` to `db` turned out *not* to break the tests: it is still issued after the
lock, and READ COMMITTED hands it the committed row. The ordering is what is load-bearing. Keeping it
on `tx` is the lesser matter of one call's reads and its write being one transaction.

One thing this deliberately does **not** change: `retractCall` still answers a retraction of an
already-retracted call with `200 appended: false`, and that reply is about the call at that `seq`, not
about the square — which since #45 can be marked again by a newer `CALL`. A device holding a stale
undo is therefore told `appended: false` for a square that is marked. Marks come from the derivation
on the next read rather than from inferring them off that reply, so the behaviour is pinned by a test
instead of changed; refusing a stale target would be a new rule, not a correction.

Validated before accepting: five concurrent-pair runs against the dev database, with the real index
still in place as a tripwire. In every run the second writer's live-call query saw the first writer's
committed row and returned `appended: false` with the same `seq`, without ever reaching the insert.
Had READ COMMITTED not given it a fresh post-lock snapshot, it would have inserted and died on 23505.
